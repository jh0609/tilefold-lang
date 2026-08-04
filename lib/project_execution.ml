module P = Project_document
module CG = Core_graph

let ( let* ) result f = match result with Ok value -> f value | Error _ as error -> error

let strings values = `List (List.map (fun value -> `String value) values)

let error stage messages =
  `Assoc
    [
      ("status", `String "error");
      ("stage", `String stage);
      ("messages", strings messages);
    ]

let rec result_payload_to_string = function
  | Runtime_value.Unit -> "Unit"
  | Runtime_value.Bool bool -> if bool then "Bool(True)" else "Bool(False)"
  | Runtime_value.Nat nat -> "Nat(" ^ Nat.to_string nat ^ ")"
  | Runtime_value.Product (left, right) ->
      "Product(" ^ result_payload_to_string left ^ ", "
      ^ result_payload_to_string right ^ ")"
  | Runtime_value.Left (payload, _) -> "Left(" ^ result_payload_to_string payload ^ ")"
  | Runtime_value.Right (_, payload) -> "Right(" ^ result_payload_to_string payload ^ ")"
  | Runtime_value.List (_item_type, items) ->
      "List[" ^ String.concat ", " (List.map result_payload_to_string items) ^ "]"
  | Runtime_value.Closure closure ->
      "Closure("
      ^ Core_graph.Function_template_id.to_string closure.template_id
      ^ ")"

let result_value value = result_payload_to_string (Runtime_value.payload value)

let trace_event (event : Rewrite_event.t) =
  `Assoc
    [
      ("index", `Int event.index);
      ("rule", `String (Rewrite_event.rule_to_string event.rule));
      ("subject", `String (Core_graph.Node_id.to_string event.subject));
    ]

module Fast = struct
  type value =
    | Unit
    | Bool of bool
    | Nat of Nat.t
    | Product of value * value
    | Left of value * Core_type.t
    | Right of Core_type.t * value
    | List of Core_type.t * value list
    | Project_closure of {
        template_id : string;
        args : value list;
        captures : (string * value) list;
      }
    | Std_closure of {
        function_id : Standard_library.function_id;
        subject : string;
        args : Runtime_value.payload list;
      }

  type state = { mutable operation_count : int }

  let fail message = Error message

  let element_by_id document id =
    List.find_opt (fun (element : P.element) -> String.equal element.id id) document.P.elements

  let container_by_id document id =
    List.find_opt (fun (container : P.container) -> String.equal container.id id) document.P.containers

  let surface_function_by_template_id document template_id =
    List.find_opt
      (fun (function_info : P.surface_function) ->
        String.equal function_info.template_id template_id)
      document.P.surface_functions

  let boundary_by_role role container =
    List.find_opt
      (fun (boundary : P.boundary_port) -> boundary.role = role)
      container.P.boundary_ports

  let endpoint_equal hint kind id port =
    match (hint, kind) with
    | Some (P.Element_port { element_id; port = actual }), `Element ->
        String.equal element_id id && String.equal actual port
    | Some (P.Boundary_port { container_id; boundary_id }), `Boundary ->
        String.equal container_id id && String.equal boundary_id port
    | _ -> false

  let source_for_input document target_hint =
    document.P.wires
    |> List.find_opt (fun (wire : P.wire) ->
           match target_hint with
           | `Element (element_id, port) ->
               endpoint_equal wire.target_hint `Element element_id port
           | `Boundary (container_id, boundary_id) ->
               endpoint_equal wire.target_hint `Boundary container_id boundary_id)
    |> fun wire -> Option.bind wire (fun (wire : P.wire) -> wire.source_hint)

  let rec runtime_payload = function
    | Unit -> Ok Runtime_value.Unit
    | Bool value -> Ok (Runtime_value.Bool value)
    | Nat value -> Ok (Runtime_value.Nat value)
    | Product (left, right) ->
        let* left = runtime_payload left in
        let* right = runtime_payload right in
        Ok (Runtime_value.Product (left, right))
    | Left (payload, right_type) ->
        let* payload = runtime_payload payload in
        Ok (Runtime_value.Left (payload, right_type))
    | Right (left_type, payload) ->
        let* payload = runtime_payload payload in
        Ok (Runtime_value.Right (left_type, payload))
    | List (item_type, items) ->
        let rec loop acc = function
          | [] -> Ok (Runtime_value.List (item_type, List.rev acc))
          | item :: rest ->
              let* item = runtime_payload item in
              loop (item :: acc) rest
        in
        loop [] items
    | Project_closure _ ->
        fail "Fast execution cannot pass a partially-applied Project function as a Standard Library argument yet."
    | Std_closure _ -> fail "Fast execution cannot pass a partially-applied function as a Standard Library argument yet."

  let rec value_of_payload = function
    | Runtime_value.Unit -> Ok Unit
    | Runtime_value.Bool value -> Ok (Bool value)
    | Runtime_value.Nat value -> Ok (Nat value)
    | Runtime_value.Product (left, right) ->
        let* left = value_of_payload left in
        let* right = value_of_payload right in
        Ok (Product (left, right))
    | Runtime_value.Left (payload, right_type) ->
        let* payload = value_of_payload payload in
        Ok (Left (payload, right_type))
    | Runtime_value.Right (left_type, payload) ->
        let* payload = value_of_payload payload in
        Ok (Right (left_type, payload))
    | Runtime_value.List (item_type, items) ->
        let rec loop acc = function
          | [] -> Ok (List (item_type, List.rev acc))
          | item :: rest ->
              let* item = value_of_payload item in
              loop (item :: acc) rest
        in
        loop [] items
    | Runtime_value.Closure _ -> fail "Fast Standard Library evaluator produced a function value."

  let rec function_argument_types typ acc =
    match typ with
    | Core_type.Arrow (parameter_type, result_type) ->
        function_argument_types result_type (parameter_type :: acc)
    | result_type -> (List.rev acc, result_type)

  let standard_library_types function_id =
    let info =
      Standard_library.functions
      |> List.find (fun info -> info.Standard_library.id = function_id)
    in
    function_argument_types (Core_type.Arrow (info.parameter_type, info.result_type)) []

  let rec type_matches typ value =
    match (typ, value) with
    | Core_type.Unit, Unit -> true
    | Core_type.Bool, Bool _ -> true
    | Core_type.Nat, Nat _ -> true
    | Core_type.Product (left_type, right_type), Product (left, right) ->
        type_matches left_type left && type_matches right_type right
    | Core_type.Sum (left_type, right_type), Left (payload, payload_right_type) ->
        type_matches left_type payload && Core_type.equal right_type payload_right_type
    | Core_type.Sum (left_type, right_type), Right (payload_left_type, payload) ->
        Core_type.equal left_type payload_left_type && type_matches right_type payload
    | Core_type.List item_type, List (actual_item_type, items) ->
        Core_type.equal item_type actual_item_type
        && List.for_all (type_matches item_type) items
    | Core_type.Arrow _, Std_closure _ | Core_type.Arrow _, Project_closure _ -> true
    | _ -> false

  let rec value_to_string = function
    | Unit -> "Unit"
    | Bool value -> if value then "Bool(True)" else "Bool(False)"
    | Nat value -> "Nat(" ^ Nat.to_string value ^ ")"
    | Product (left, right) ->
        "Product(" ^ value_to_string left ^ ", " ^ value_to_string right ^ ")"
    | Left (payload, _) -> "Left(" ^ value_to_string payload ^ ")"
    | Right (_, payload) -> "Right(" ^ value_to_string payload ^ ")"
    | List (_item_type, items) ->
        "List[" ^ String.concat ", " (List.map value_to_string items) ^ "]"
    | Project_closure { template_id; _ } -> "Closure(" ^ template_id ^ ")"
    | Std_closure { function_id; _ } ->
        let info =
          Standard_library.functions
          |> List.find (fun info -> info.Standard_library.id = function_id)
        in
        "Closure(" ^ info.stable_id ^ ")"

  let completed_call state subject function_id args =
    match Standard_library.evaluate function_id args with
    | Error message -> fail message
    | Ok payload ->
        let* value = value_of_payload payload in
        let (_ : string) = subject in
        state.operation_count <- state.operation_count + 1;
        Ok value

  let rec eval_source state document env = function
    | P.Element_port { element_id; port } -> eval_element_port state document env element_id port
    | P.Boundary_port { container_id; boundary_id } -> (
        match List.assoc_opt (container_id, boundary_id) env with
        | Some value -> Ok value
        | None -> (
        match container_by_id document container_id with
        | Some container -> (
            match List.find_opt (fun (boundary : P.boundary_port) -> String.equal boundary.id boundary_id) container.boundary_ports with
            | Some { role = P.Parameter; typ = Core_type.Unit; _ } -> Ok Unit
            | Some { role = P.Parameter; _ } ->
                fail ("Missing fast parameter binding " ^ container_id ^ "." ^ boundary_id)
            | Some { role = P.Capture _; _ } ->
                fail ("Missing fast capture binding " ^ container_id ^ "." ^ boundary_id)
            | Some { role = P.Result; _ } ->
                fail "Result boundary cannot be used as a fast source."
            | _ -> fail ("Unknown boundary source " ^ boundary_id))
        | None -> fail ("Unknown boundary container " ^ container_id)))
    | P.Junction _ | P.Junction_outlet _ ->
        fail "Fast execution does not support junctions yet."

  and eval_input state document env element_id port =
    match source_for_input document (`Element (element_id, port)) with
    | None -> fail ("Missing input " ^ element_id ^ "." ^ port)
    | Some source -> eval_source state document env source

  and eval_boundary_result state document env container =
    match boundary_by_role P.Result container with
    | None -> fail ("Fast execution requires a result boundary in " ^ container.id)
    | Some boundary -> (
        match source_for_input document (`Boundary (container.id, boundary.id)) with
        | None -> fail ("Result boundary is not connected in " ^ container.id)
        | Some source -> eval_source state document env source)

  and eval_project_function state document function_info ~captures args =
    if List.length args <> List.length function_info.P.parameters then
      fail
        ("Fast Project function " ^ function_info.name ^ " received the wrong arity")
    else
      match container_by_id document function_info.body_container_id with
      | None ->
          fail
            ("Fast Project function body is missing: "
            ^ function_info.body_container_id)
      | Some container ->
          let parameter_boundaries =
            container.P.boundary_ports
            |> List.filter (fun (boundary : P.boundary_port) ->
                   match boundary.role with P.Parameter -> true | _ -> false)
            |> List.sort (fun (left : P.boundary_port) right ->
                   match Int.compare left.anchor.y right.anchor.y with
                   | 0 -> String.compare left.id right.id
                   | order -> order)
          in
          if List.length parameter_boundaries <> List.length function_info.parameters
          then
            fail
              ("Fast Project function "
              ^ function_info.name
              ^ " parameter boundary count does not match its signature")
          else
          let capture_boundaries =
            container.P.boundary_ports
            |> List.filter_map (fun (boundary : P.boundary_port) ->
                   match boundary.role with
                   | P.Capture key -> Some (key, boundary)
                   | _ -> None)
            |> List.sort (fun (left_key, (left : P.boundary_port)) (right_key, right) ->
                   match String.compare left_key right_key with
                   | 0 -> String.compare left.id right.id
                   | order -> order)
          in
          let sorted_captures =
            captures
            |> List.sort (fun (left_key, _) (right_key, _) ->
                   String.compare left_key right_key)
          in
          let capture_keys =
            List.map fst capture_boundaries
          in
          let actual_capture_keys =
            List.map fst sorted_captures
          in
          if capture_keys <> actual_capture_keys then
            fail
              ("Fast Project function "
              ^ function_info.name
              ^ " capture bindings do not match its signature")
          else
            let parameter_env =
              List.map2
                (fun (boundary : P.boundary_port) value ->
                  ((function_info.body_container_id, boundary.id), value))
                parameter_boundaries args
            in
            let capture_env =
              List.map2
                (fun (_key, (boundary : P.boundary_port)) (_key, value) ->
                  ((function_info.body_container_id, boundary.id), value))
                capture_boundaries sorted_captures
            in
            eval_boundary_result state document (parameter_env @ capture_env) container

  and apply_project_function_with_captures state document ~template_id ~captures ~args argument =
    match surface_function_by_template_id document template_id with
    | None -> fail ("Fast execution cannot evaluate Project function " ^ template_id)
    | Some function_info -> (
        let index = List.length args in
        match List.nth_opt function_info.P.parameters index with
        | None -> fail "Fast Apply received too many Project arguments."
        | Some parameter ->
            if not (type_matches parameter.typ argument) then
              fail "Fast Apply argument type does not match the Project function signature."
            else
              let args = args @ [ argument ] in
              if List.length args = List.length function_info.parameters then
                eval_project_function state document function_info ~captures args
              else Ok (Project_closure { template_id; args; captures }))

  and eval_natrec state document env element_id =
    match
      ( eval_input state document env element_id "base",
        eval_input state document env element_id "step",
        eval_input state document env element_id "count" )
    with
    | Ok base, Ok step, Ok (Nat count) ->
        let rec loop index previous =
          if Nat.compare index count >= 0 then Ok previous
          else
            let index_value = Nat index in
            match step with
            | Project_closure { template_id; args; captures } -> (
                match
                  apply_project_function_with_captures state document ~template_id
                    ~captures ~args index_value
                with
                | Ok (Project_closure partial) -> (
                    match
                      apply_project_function_with_captures state document
                        ~template_id:partial.template_id ~captures:partial.captures
                        ~args:partial.args previous
                    with
                    | Ok next -> loop (Nat.succ index) next
                    | Error _ as error -> error)
                | Ok _ -> fail "NatRec step function did not return a function."
                | Error _ as error -> error)
            | Std_closure { function_id; subject; args } -> (
                match runtime_payload index_value with
                | Error _ as error -> error
                | Ok index_payload ->
                    (match
                       apply_standard_closure state ~function_id ~subject
                         ~args:(args @ [ index_payload ]) previous
                     with
                    | Ok next -> loop (Nat.succ index) next
                    | Error _ as error -> error))
            | _ -> fail "NatRec step input must be a function."
        in
        loop Nat.zero base
    | Ok _, Ok _, Ok _ -> fail "NatRec count must be Nat."
    | Error message, _, _ | _, Error message, _ | _, _, Error message -> fail message

  and apply_standard_closure state ~function_id ~subject ~args argument =
    let expected_args, _ = standard_library_types function_id in
    let index = List.length args in
    match List.nth_opt expected_args index with
    | None -> fail "Fast Apply received too many arguments."
    | Some expected_type ->
        if not (type_matches expected_type argument) then
          fail "Fast Apply argument type does not match the Standard Library signature."
        else
          let* payload = runtime_payload argument in
          let args = args @ [ payload ] in
          if List.length args = Standard_library.arity function_id
          then completed_call state subject function_id args
          else Ok (Std_closure { function_id; subject; args })

  and apply_function_value state document function_value argument =
    match function_value with
    | Std_closure { function_id; subject; args } ->
        apply_standard_closure state ~function_id ~subject ~args argument
    | Project_closure { template_id; args; captures } ->
        apply_project_function_with_captures state document ~template_id ~captures ~args argument
    | _ -> fail "Case branch input must be a function."

  and eval_element_port state document env element_id port =
    match element_by_id document element_id with
    | None -> fail ("Unknown element " ^ element_id)
    | Some element -> (
        match (element.kind, port) with
        | P.Unit_literal, "value" -> Ok Unit
        | P.Bool_literal value, "value" -> Ok (Bool value)
        | P.Nat_literal value, "value" -> (
            match Nat.of_string value with
            | Ok nat -> Ok (Nat nat)
            | Error _ -> fail ("Invalid Nat literal " ^ value))
        | P.Succ, "result" -> (
            match eval_input state document env element_id "input" with
            | Ok (Nat value) -> Ok (Nat (Nat.succ value))
            | Ok _ -> fail "Succ input must be Nat"
            | Error _ as error -> error)
        | P.Pair _, "value" -> (
            match
              ( eval_input state document env element_id "left",
                eval_input state document env element_id "right" )
            with
            | Ok left, Ok right -> Ok (Product (left, right))
            | Error message, _ | _, Error message -> fail message)
        | P.Left { right_type; _ }, "value" -> (
            match eval_input state document env element_id "input" with
            | Ok payload -> Ok (Left (payload, right_type))
            | Error _ as error -> error)
        | P.Right { left_type; _ }, "value" -> (
            match eval_input state document env element_id "input" with
            | Ok payload -> Ok (Right (left_type, payload))
            | Error _ as error -> error)
        | P.Case _, "result" -> (
            match
              ( eval_input state document env element_id "scrutinee",
                eval_input state document env element_id "onLeft",
                eval_input state document env element_id "onRight" )
            with
            | Ok (Left (payload, _)), Ok on_left, Ok _on_right ->
                apply_function_value state document on_left payload
            | Ok (Right (_, payload)), Ok _on_left, Ok on_right ->
                apply_function_value state document on_right payload
            | Ok _, Ok _, Ok _ -> fail "Case scrutinee must be Sum"
            | Error message, _, _ | _, Error message, _ | _, _, Error message ->
                fail message)
        | P.Nil item_type, "value" -> Ok (List (item_type, []))
        | P.Cons item_type, "value" -> (
            match
              ( eval_input state document env element_id "head",
                eval_input state document env element_id "tail" )
            with
            | Ok head, Ok (List (tail_item_type, tail_items))
              when type_matches item_type head && Core_type.equal item_type tail_item_type ->
                Ok (List (item_type, head :: tail_items))
            | Ok _, Ok _ -> fail "Cons inputs must match its List item type."
            | Error message, _ | _, Error message -> fail message)
        | P.ListRec { item_type; result_type }, "result" -> (
            match
              ( eval_input state document env element_id "list",
                eval_input state document env element_id "base",
                eval_input state document env element_id "step" )
            with
            | Ok (List (actual_item_type, items)), Ok base, Ok step
              when Core_type.equal item_type actual_item_type
                   && type_matches result_type base ->
                let rec tails = function
                  | [] -> []
                  | _head :: tail -> tail :: tails tail
                in
                let tail_values = tails items in
                let frames =
                  List.combine items tail_values |> List.rev
                in
                let rec loop accumulator = function
                  | [] -> Ok accumulator
                  | (head, tail) :: rest ->
                      let argument =
                        Product
                          (head, Product (List (item_type, tail), accumulator))
                      in
                      (match apply_function_value state document step argument with
                      | Ok next when type_matches result_type next ->
                          loop next rest
                      | Ok _ -> fail "ListRec step result type mismatch."
                      | Error _ as error -> error)
                in
                loop base frames
            | Ok _, Ok _, Ok _ -> fail "ListRec inputs do not match its declared types."
            | Error message, _, _ | _, Error message, _ | _, _, Error message ->
                fail message)
        | P.ListBuilder { item_type; item_ids }, "result" ->
            let rec collect acc = function
              | [] -> Ok (List (item_type, List.rev acc))
              | item_id :: rest -> (
                  match eval_input state document env element_id item_id with
                  | Ok value when type_matches item_type value ->
                      collect (value :: acc) rest
                  | Ok _ -> fail "List Builder item input does not match its item type."
                  | Error _ as error -> error)
            in
            collect [] item_ids
        | P.Unpair _, "left" -> (
            match eval_input state document env element_id "value" with
            | Ok (Product (left, _right)) -> Ok left
            | Ok _ -> fail "Unpair input must be Product"
            | Error _ as error -> error)
        | P.Unpair _, "right" -> (
            match eval_input state document env element_id "value" with
            | Ok (Product (_left, right)) -> Ok right
            | Ok _ -> fail "Unpair input must be Product"
            | Error _ as error -> error)
        | P.Copy _, ("left" | "right") -> eval_input state document env element_id "input"
        | P.Function { template_id; captures; _ }, "value" -> (
            let rec collect_captures acc = function
              | [] -> Ok (List.rev acc)
              | (key, typ) :: rest -> (
                  match eval_input state document env element_id key with
                  | Ok value when type_matches typ value ->
                      collect_captures ((key, value) :: acc) rest
                  | Ok _ ->
                      fail
                        ("Fast Function capture " ^ template_id ^ "." ^ key
                       ^ " type does not match its signature.")
                  | Error _ as error -> error)
            in
            match collect_captures [] captures with
            | Error _ as error -> error
            | Ok captured_values -> (
              match CG.Function_template_id.of_string template_id with
              | Error message -> fail message
              | Ok template_id -> (
                  match Standard_library.id_of_template_id template_id with
                  | None -> (
                      let template_id = CG.Function_template_id.to_string template_id in
                      match surface_function_by_template_id document template_id with
                      | Some _ ->
                          Ok
                            (Project_closure
                               { template_id; args = []; captures = captured_values })
                      | None ->
                          fail
                            ("Fast execution cannot evaluate Project function "
                           ^ template_id))
                  | Some function_id ->
                      if captured_values <> [] then
                        fail
                          "Fast execution cannot bind captures on Standard Library Function references."
                      else
                        Ok (Std_closure { function_id; subject = element_id; args = [] }))))
        | P.Apply _, "result" -> (
            match
              ( eval_input state document env element_id "function",
                eval_input state document env element_id "argument" )
            with
            | Ok (Std_closure { function_id; subject; args }), Ok argument -> (
                apply_standard_closure state ~function_id ~subject ~args argument)
            | Ok (Project_closure { template_id; args; captures }), Ok argument ->
                apply_project_function_with_captures state document ~template_id ~captures ~args argument
            | Ok _, Ok _ -> fail "Fast Apply requires a Standard Library function."
            | Error message, _ | _, Error message -> fail message)
        | P.Library_call { template_id; _ }, "result" -> (
            match CG.Function_template_id.of_string template_id with
            | Error message -> fail message
            | Ok template_id -> (
                match Standard_library.id_of_template_id template_id with
                | None -> fail ("Unknown Standard Library function " ^ CG.Function_template_id.to_string template_id)
                | Some function_id ->
                    let arity = Standard_library.arity function_id in
                    let expected_args, _ = standard_library_types function_id in
                    let rec collect index acc =
                      if index = arity then Ok (List.rev acc)
                      else
                        match eval_input state document env element_id ("arg_" ^ string_of_int index) with
                        | Ok value -> (
                            match List.nth_opt expected_args index with
                            | None -> fail "Standard Library call received too many inputs"
                            | Some expected_type ->
                                if not (type_matches expected_type value) then
                                  fail "Standard Library call input type does not match its signature"
                                else
                                  let* payload = runtime_payload value in
                                  collect (index + 1) (payload :: acc))
                        | Error _ as error -> error
                    in
                    (match collect 0 [] with
                    | Error _ as error -> error
                    | Ok args -> completed_call state element_id function_id args)))
        | P.Project_call { template_id }, "result" -> (
            match surface_function_by_template_id document template_id with
            | None -> fail ("Unknown Project function " ^ template_id)
            | Some function_info ->
                let rec collect index acc = function
                  | [] -> Ok (List.rev acc)
                  | (parameter : P.surface_parameter) :: rest -> (
                      match eval_input state document env element_id ("arg_" ^ string_of_int index) with
                      | Ok value ->
                          if type_matches parameter.typ value then
                            collect (index + 1) (value :: acc) rest
                          else
                            fail
                              "Project call input type does not match its signature"
                      | Error _ as error -> error)
                in
                (match collect 0 [] function_info.parameters with
                | Ok args -> eval_project_function state document function_info ~captures:[] args
                | Error _ as error -> error))
        | P.BoolRec _, "result" -> (
            match
              ( eval_input state document env element_id "condition",
                eval_input state document env element_id "false_case",
                eval_input state document env element_id "true_case" )
            with
            | Ok (Bool condition), Ok false_case, Ok true_case ->
                if condition then Ok true_case else Ok false_case
            | Ok _, Ok _, Ok _ -> fail "BoolRec condition must be Bool."
            | Error message, _, _ | _, Error message, _ | _, _, Error message ->
                fail message)
        | P.Drop _, _ -> fail "Drop has no output"
        | P.NatRec _, "result" -> eval_natrec state document env element_id
        | _ -> fail ("Port " ^ element_id ^ "." ^ port ^ " is not a supported fast output"))

  let execute document =
    match
      List.find_opt
        (fun (container : P.container) ->
          match container.kind with P.Entry _ -> true | P.Template _ -> false)
        document.P.containers
    with
    | None -> fail "Fast execution requires one entry container."
    | Some entry -> (
        let result_boundary =
          List.find_opt
            (fun (boundary : P.boundary_port) -> match boundary.role with P.Result -> true | _ -> false)
            entry.boundary_ports
        in
        match result_boundary with
        | None -> fail "Fast execution requires an entry result boundary."
        | Some boundary -> (
            let state = { operation_count = 0 } in
            match source_for_input document (`Boundary (entry.id, boundary.id)) with
            | None -> fail "Entry result is not connected."
            | Some source -> (
                match eval_source state document [] source with
                | Ok value ->
                    Ok
                      (`Assoc
                         [
                           ("status", `String "completed");
                           ("mode", `String "fast");
                           ("result", `String (value_to_string value));
                           ("rewriteCount", `Int state.operation_count);
                           ( "summary",
                             `String
                               "Fast Run completed without materializing Core rewrite events." );
                         ])
                | Error _ as error -> error)))
end

let execute document =
  match P.infer_symbolic document with
  | Error (`Validation errors) ->
      error "validation" (List.map P.Validation_error.to_string errors)
  | Error (`Conversion errors) ->
      error "conversion" (List.map P.Conversion_error.to_string errors)
  | Error (`Geometry errors) ->
      error "geometry" (List.map Surface_geometry.render_validation_error errors)
  | Error (`Inference errors) ->
      error "inference" (List.map Surface_geometry.render_inference_error errors)
  | Ok symbolic ->
      let package = Surface_symbolic.lower_to_program_package symbolic in
      (match Program_package.run_completed package with
      | Ok { value; trace; _ } ->
          `Assoc
            [
              ("status", `String "completed");
              ("result", `String (result_value value));
              ("rewriteCount", `Int (List.length trace));
              ("trace", `List (List.map trace_event trace));
            ]
      | Error (Stuck { reason; _ }) ->
          error "execution"
            [
              "Execution stuck in "
              ^ Runtime_value.Instance_id.to_string reason.instance_id;
            ]
      | Error (Run_error { error = execution_error; _ }) ->
          error "execution"
            [ Program_package.execution_error_to_string execution_error ]
      | Error (Step_limit_exceeded { executed_steps; limit; _ }) ->
          error "execution"
            [
              Printf.sprintf "Step limit exceeded: executed=%s limit=%s"
                (Nat.to_string executed_steps) (Nat.to_string limit);
            ]
      | Error (Completed _) ->
          error "execution" [ "Unexpected completed execution result" ])

let run_json_with_mode project_json ~mode =
  let response =
    match P.decode_json project_json with
    | Error decode_error ->
        error "decode" [ P.Decode_error.to_string decode_error ]
    | Ok document ->
        if String.equal mode "fast" then
          match P.infer_symbolic document with
          | Error (`Validation errors) ->
              error "validation" (List.map P.Validation_error.to_string errors)
          | Error (`Conversion errors) ->
              error "conversion" (List.map P.Conversion_error.to_string errors)
          | Error (`Geometry errors) ->
              error "geometry" (List.map Surface_geometry.render_validation_error errors)
          | Error (`Inference errors) ->
              error "inference" (List.map Surface_geometry.render_inference_error errors)
          | Ok symbolic ->
              let (_ : Program_package.t) =
                Surface_symbolic.lower_to_program_package symbolic
              in
              (match Fast.execute document with
              | Ok response -> response
              | Error message -> error "fast-execution" [ message ])
        else execute document
  in
  Yojson.Safe.to_string response

let run_json project_json = run_json_with_mode project_json ~mode:"transparent"

type trace_session = {
  package : Program_package.t;
  mutable machine : Engine.Machine.t;
  mutable executed_steps : Nat.t;
  mutable event_count : int;
}

let next_trace_session_id = ref 1
let trace_sessions : (int, trace_session) Hashtbl.t = Hashtbl.create 4

let trace_batch events =
  `List (List.map trace_event events)

let start_trace_session_json project_json =
  let response =
    match P.decode_json project_json with
    | Error decode_error ->
        error "decode" [ P.Decode_error.to_string decode_error ]
    | Ok document -> (
        match P.infer_symbolic document with
        | Error (`Validation errors) ->
            error "validation" (List.map P.Validation_error.to_string errors)
        | Error (`Conversion errors) ->
            error "conversion" (List.map P.Conversion_error.to_string errors)
        | Error (`Geometry errors) ->
            error "geometry" (List.map Surface_geometry.render_validation_error errors)
        | Error (`Inference errors) ->
            error "inference" (List.map Surface_geometry.render_inference_error errors)
        | Ok symbolic -> (
            let package = Surface_symbolic.lower_to_program_package symbolic in
            match Program_package.initialize package with
            | Error error_value ->
                error "execution"
                  [ Program_package.execution_error_to_string error_value ]
            | Ok machine ->
                let session_id = !next_trace_session_id in
                incr next_trace_session_id;
                Hashtbl.replace trace_sessions session_id
                  { package; machine; executed_steps = Nat.zero; event_count = 0 };
                `Assoc
                  [
                    ("status", `String "started");
                    ("sessionId", `Int session_id);
                  ]))
  in
  Yojson.Safe.to_string response

let dispose_trace_session ~session_id =
  Hashtbl.remove trace_sessions session_id

let trace_session_next_json ~session_id ~batch_size =
  let safe_batch_size = if batch_size <= 0 then 1 else batch_size in
  let response =
    match Hashtbl.find_opt trace_sessions session_id with
    | None -> error "execution" [ "Unknown trace session." ]
    | Some session ->
        let rec loop remaining acc =
          if remaining <= 0 then
            `Assoc
              [
                ("status", `String "trace_batch");
                ("trace", trace_batch (List.rev acc));
                ("rewriteCount", `Int session.event_count);
              ]
          else
            match Program_package.step session.machine with
            | Engine.Rewritten { machine; event } ->
                session.machine <- machine;
                session.executed_steps <- Nat.succ session.executed_steps;
                session.event_count <- session.event_count + 1;
                loop (remaining - 1) (event :: acc)
            | Engine.Completed value ->
                Hashtbl.remove trace_sessions session_id;
                if
                  Core_type.equal (Runtime_value.typ value)
                    (Program_package.result_type session.package)
                then
                  `Assoc
                    [
                      ("status", `String "completed");
                      ("mode", `String "transparent");
                      ("result", `String (result_value value));
                      ("rewriteCount", `Int session.event_count);
                      ("trace", trace_batch (List.rev acc));
                    ]
                else
                  error "execution"
                    [
                      Program_package.execution_error_to_string
                        (Completed_result_type_mismatch
                           {
                             expected = Program_package.result_type session.package;
                             actual = Runtime_value.typ value;
                           });
                    ]
            | Engine.Stuck reason ->
                Hashtbl.remove trace_sessions session_id;
                error "execution"
                  [
                    "Execution stuck in "
                    ^ Runtime_value.Instance_id.to_string reason.instance_id;
                  ]
            | Engine.Runtime_error execution_error ->
                Hashtbl.remove trace_sessions session_id;
                error "execution"
                  [
                    Program_package.execution_error_to_string
                      (Runtime_error execution_error);
                  ]
        in
        loop safe_batch_size []
  in
  Yojson.Safe.to_string response
