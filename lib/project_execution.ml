module P = Project_document
module CG = Core_graph

let strings values = `List (List.map (fun value -> `String value) values)

let error stage messages =
  `Assoc
    [
      ("status", `String "error");
      ("stage", `String stage);
      ("messages", strings messages);
    ]

let result_value value =
  match Runtime_value.payload value with
  | Unit -> "Unit"
  | Nat nat -> "Nat(" ^ Nat.to_string nat ^ ")"
  | Closure closure ->
      "Closure("
      ^ Core_graph.Function_template_id.to_string closure.template_id
      ^ ")"

let trace_event (event : Rewrite_event.t) =
  `Assoc
    [
      ("index", `Int event.index);
      ("rule", `String (Rewrite_event.rule_to_string event.rule));
      ("subject", `String (Core_graph.Node_id.to_string event.subject));
    ]

let fast_trace_event index rule subject =
  `Assoc
    [
      ("index", `Int index);
      ("rule", `String rule);
      ("subject", `String subject);
    ]

module Fast = struct
  type value =
    | Unit
    | Nat of Nat.t
    | Std_closure of {
        function_id : Standard_library.function_id;
        subject : string;
        args : Nat.t list;
      }

  type state = { mutable trace : Yojson.Safe.t list }

  let fail message = Error message

  let element_by_id document id =
    List.find_opt (fun (element : P.element) -> String.equal element.id id) document.P.elements

  let container_by_id document id =
    List.find_opt (fun (container : P.container) -> String.equal container.id id) document.P.containers

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

  let rec eval_source state document = function
    | P.Element_port { element_id; port } -> eval_element_port state document element_id port
    | P.Boundary_port { container_id; boundary_id } -> (
        match container_by_id document container_id with
        | Some container -> (
            match List.find_opt (fun (boundary : P.boundary_port) -> String.equal boundary.id boundary_id) container.boundary_ports with
            | Some { role = P.Parameter; typ = Core_type.Unit; _ } -> Ok Unit
            | Some { role = P.Capture _; _ } ->
                fail "Fast execution does not support Project capture boundaries yet."
            | Some { role = P.Result; _ } ->
                fail "Result boundary cannot be used as a fast source."
            | _ -> fail ("Unknown boundary source " ^ boundary_id))
        | None -> fail ("Unknown boundary container " ^ container_id))
    | P.Junction _ | P.Junction_outlet _ ->
        fail "Fast execution does not support junctions yet."

  and eval_input state document element_id port =
    match source_for_input document (`Element (element_id, port)) with
    | None -> fail ("Missing input " ^ element_id ^ "." ^ port)
    | Some source -> eval_source state document source

  and eval_element_port state document element_id port =
    match element_by_id document element_id with
    | None -> fail ("Unknown element " ^ element_id)
    | Some element -> (
        match (element.kind, port) with
        | P.Unit_literal, "value" -> Ok Unit
        | P.Nat_literal value, "value" -> (
            match Nat.of_string value with
            | Ok nat -> Ok (Nat nat)
            | Error _ -> fail ("Invalid Nat literal " ^ value))
        | P.Succ, "result" -> (
            match eval_input state document element_id "input" with
            | Ok (Nat value) -> Ok (Nat (Nat.succ value))
            | Ok _ -> fail "Succ input must be Nat"
            | Error _ as error -> error)
        | P.Copy _, ("left" | "right") -> eval_input state document element_id "input"
        | P.Function { template_id; captures; _ }, "value" -> (
            if captures <> [] then
              fail "Fast execution supports only capture-free Standard Library calls."
            else
              match CG.Function_template_id.of_string template_id with
              | Error message -> fail message
              | Ok template_id -> (
                  match Standard_library.id_of_template_id template_id with
                  | None ->
                      fail
                        ("Fast execution cannot evaluate Project function "
                       ^ CG.Function_template_id.to_string template_id)
                  | Some function_id ->
                      Ok (Std_closure { function_id; subject = element_id; args = [] })))
        | P.Apply _, "result" -> (
            match
              ( eval_input state document element_id "function",
                eval_input state document element_id "argument" )
            with
            | Ok (Std_closure closure), Ok (Nat argument) ->
                let args = closure.args @ [ argument ] in
                if List.length args = Standard_library.arity closure.function_id
                then
                  match Standard_library.evaluate_nat closure.function_id args with
                  | Ok result ->
                      let rule =
                        "FastCallCompleted("
                        ^ (Standard_library.functions
                          |> List.find
                               (fun info -> info.Standard_library.id = closure.function_id)
                          |> fun info -> info.stable_id ^ "@" ^ info.version)
                        ^ ")"
                      in
                      state.trace <-
                        state.trace
                        @ [ fast_trace_event (List.length state.trace) rule closure.subject ];
                      Ok (Nat result)
                  | Error message -> fail message
                else Ok (Std_closure { closure with args })
            | Ok _, Ok _ -> fail "Fast Apply requires a Standard Library function and Nat argument."
            | Error message, _ | _, Error message -> fail message)
        | P.Library_call { template_id; _ }, "result" -> (
            match CG.Function_template_id.of_string template_id with
            | Error message -> fail message
            | Ok template_id -> (
                match Standard_library.id_of_template_id template_id with
                | None -> fail ("Unknown Standard Library function " ^ CG.Function_template_id.to_string template_id)
                | Some function_id ->
                    let arity = Standard_library.arity function_id in
                    let rec collect index acc =
                      if index = arity then Ok (List.rev acc)
                      else
                        match eval_input state document element_id ("arg_" ^ string_of_int index) with
                        | Ok (Nat value) -> collect (index + 1) (value :: acc)
                        | Ok _ -> fail "Standard Library call inputs must be Nat"
                        | Error _ as error -> error
                    in
                    (match collect 0 [] with
                    | Error _ as error -> error
                    | Ok args -> (
                        match Standard_library.evaluate_nat function_id args with
                        | Error message -> fail message
                        | Ok result ->
                            let rule =
                              "FastCallCompleted("
                              ^ (Standard_library.functions
                                |> List.find
                                     (fun info -> info.Standard_library.id = function_id)
                                |> fun info -> info.stable_id ^ "@" ^ info.version)
                              ^ ")"
                            in
                            state.trace <-
                              state.trace
                              @ [ fast_trace_event (List.length state.trace) rule element_id ];
                            Ok (Nat result)))))
        | P.Drop _, _ -> fail "Drop has no output"
        | P.NatRec _, _ -> fail "Fast execution does not support NatRec nodes directly."
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
            let state = { trace = [] } in
            match source_for_input document (`Boundary (entry.id, boundary.id)) with
            | None -> fail "Entry result is not connected."
            | Some source -> (
                match eval_source state document source with
                | Ok (Nat value) ->
                    Ok
                      (`Assoc
                         [
                           ("status", `String "completed");
                           ("result", `String ("Nat(" ^ Nat.to_string value ^ ")"));
                           ("rewriteCount", `Int (List.length state.trace));
                           ("trace", `List state.trace);
                         ])
                | Ok Unit -> Ok (`Assoc [ ("status", `String "completed"); ("result", `String "Unit"); ("rewriteCount", `Int (List.length state.trace)); ("trace", `List state.trace) ])
                | Ok (Std_closure _) -> fail "Fast execution produced a function value."
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
          match Fast.execute document with
          | Ok response -> response
          | Error message -> error "fast-execution" [ message ]
        else execute document
  in
  Yojson.Safe.to_string response

let run_json project_json = run_json_with_mode project_json ~mode:"transparent"
