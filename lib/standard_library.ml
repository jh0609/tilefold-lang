module CG = Core_graph

let ( let* ) result f = match result with Ok value -> f value | Error _ as error -> error

type function_id =
  | Add
  | Multiply
  | Double
  | Square
  | Pred
  | Subtract
  | IsZero
  | Not
  | And
  | Or
  | Equal
  | LessThan
  | LessOrEqual
  | Min
  | Max

type function_info = {
  id : function_id;
  stable_id : string;
  display_name : string;
  version : string;
  parameter_type : Core_type.t;
  result_type : Core_type.t;
}

let namespace = "tilefold.std"
let version = "v1"
let bool = Core_type.Bool
let nat = Core_type.Nat
let nat_to_nat = Core_type.Arrow (nat, nat)
let nat_to_bool = Core_type.Arrow (nat, bool)
let bool_to_bool = Core_type.Arrow (bool, bool)

let stable_id = function
  | Add -> "tilefold.std.nat.add"
  | Multiply -> "tilefold.std.nat.multiply"
  | Double -> "tilefold.std.nat.double"
  | Square -> "tilefold.std.nat.square"
  | Pred -> "tilefold.std.nat.pred"
  | Subtract -> "tilefold.std.nat.subtract"
  | IsZero -> "tilefold.std.nat.isZero"
  | Not -> "tilefold.std.bool.not"
  | And -> "tilefold.std.bool.and"
  | Or -> "tilefold.std.bool.or"
  | Equal -> "tilefold.std.nat.equal"
  | LessThan -> "tilefold.std.nat.lessThan"
  | LessOrEqual -> "tilefold.std.nat.lessOrEqual"
  | Min -> "tilefold.std.nat.min"
  | Max -> "tilefold.std.nat.max"

let display_name = function
  | Add -> "add"
  | Multiply -> "multiply"
  | Double -> "double"
  | Square -> "square"
  | Pred -> "pred"
  | Subtract -> "subtract"
  | IsZero -> "isZero"
  | Not -> "not"
  | And -> "and"
  | Or -> "or"
  | Equal -> "equal"
  | LessThan -> "lessThan"
  | LessOrEqual -> "lessOrEqual"
  | Min -> "min"
  | Max -> "max"

let function_template_id id =
  match CG.Function_template_id.of_string (stable_id id) with
  | Ok value -> value
  | Error message -> invalid_arg message

let info id =
  let parameter_type, result_type =
    match id with
    | Add | Multiply -> (nat, nat_to_nat)
    | Double | Square -> (nat, nat)
    | Pred -> (nat, nat)
    | Subtract -> (nat, nat_to_nat)
    | IsZero -> (nat, bool)
    | Not -> (bool, bool)
    | And | Or -> (bool, bool_to_bool)
    | Equal | LessThan | LessOrEqual -> (nat, nat_to_bool)
    | Min | Max -> (nat, nat_to_nat)
  in
  { id; stable_id = stable_id id; display_name = display_name id; version; parameter_type; result_type }

let functions =
  List.map info
    [
      Add;
      Multiply;
      Double;
      Square;
      Pred;
      Subtract;
      IsZero;
      Not;
      And;
      Or;
      Equal;
      LessThan;
      LessOrEqual;
      Min;
      Max;
    ]
let find_function stable_id = List.find_opt (fun item -> String.equal item.stable_id stable_id) functions

let id_of_template_id template_id =
  List.find_map
    (fun item ->
      if String.equal item.stable_id (CG.Function_template_id.to_string template_id)
      then Some item.id
      else None)
    functions

let arity = function
  | Add | Multiply | Subtract | And | Or | Equal | LessThan | LessOrEqual | Min | Max -> 2
  | Double | Square | Pred | IsZero | Not -> 1

let add_nat left right =
  Nat.to_z left |> Z.add (Nat.to_z right) |> Nat.of_z

let multiply_nat left right =
  Nat.to_z left |> Z.mul (Nat.to_z right) |> Nat.of_z

let nat_result = function
  | Ok value -> Ok value
  | Error Nat.Negative -> Error "Standard Library evaluator produced a negative Nat"
  | Error Nat.Invalid_format -> Error "Standard Library evaluator produced an invalid Nat"
  | Error Nat.Non_canonical_format ->
      Error "Standard Library evaluator produced a non-canonical Nat"

let evaluate_nat id args =
  match (id, args) with
  | Add, [ left; right ] -> nat_result (add_nat left right)
  | Multiply, [ left; right ] -> nat_result (multiply_nat left right)
  | Double, [ value ] -> nat_result (add_nat value value)
  | Square, [ value ] -> nat_result (multiply_nat value value)
  | Pred, [ value ] ->
      if Nat.equal value Nat.zero then Ok Nat.zero
      else nat_result (Nat.to_z value |> Z.pred |> Nat.of_z)
  | Subtract, [ left; right ] ->
      let result = Z.sub (Nat.to_z left) (Nat.to_z right) in
      if Z.sign result <= 0 then Ok Nat.zero else nat_result (Nat.of_z result)
  | Min, [ left; right ] ->
      if Z.leq (Nat.to_z left) (Nat.to_z right) then Ok left else Ok right
  | Max, [ left; right ] ->
      if Z.leq (Nat.to_z left) (Nat.to_z right) then Ok right else Ok left
  | _ -> Error "Standard Library evaluator received the wrong arity"

let expect_nat = function
  | Runtime_value.Nat value -> Ok value
  | _ -> Error "Standard Library evaluator expected Nat input"

let expect_bool = function
  | Runtime_value.Bool value -> Ok value
  | _ -> Error "Standard Library evaluator expected Bool input"

let collect_inputs expect args =
  List.fold_right
    (fun payload acc ->
      let* values = acc in
      let* value = expect payload in
      Ok (value :: values))
    args (Ok [])

let evaluate id args =
  match id with
  | Add | Multiply | Double | Square | Pred | Subtract | Min | Max -> (
      match collect_inputs expect_nat args with
      | Error _ as error -> error
      | Ok nat_args -> Result.map (fun value -> Runtime_value.Nat value) (evaluate_nat id nat_args))
  | IsZero -> (
      match args with
      | [ value ] ->
          let* value = expect_nat value in
          Ok (Runtime_value.Bool (Nat.equal value Nat.zero))
      | _ -> Error "Standard Library evaluator received the wrong arity")
  | Not -> (
      match args with
      | [ value ] ->
          let* value = expect_bool value in
          Ok (Runtime_value.Bool (not value))
      | _ -> Error "Standard Library evaluator received the wrong arity")
  | And -> (
      match args with
      | [ left; right ] ->
          let* left = expect_bool left in
          let* right = expect_bool right in
          Ok (Runtime_value.Bool (left && right))
      | _ -> Error "Standard Library evaluator received the wrong arity")
  | Or -> (
      match args with
      | [ left; right ] ->
          let* left = expect_bool left in
          let* right = expect_bool right in
          Ok (Runtime_value.Bool (left || right))
      | _ -> Error "Standard Library evaluator received the wrong arity")
  | Equal -> (
      match args with
      | [ left; right ] ->
          let* left = expect_nat left in
          let* right = expect_nat right in
          Ok (Runtime_value.Bool (Nat.equal left right))
      | _ -> Error "Standard Library evaluator received the wrong arity")
  | LessOrEqual -> (
      match args with
      | [ left; right ] ->
          let* left = expect_nat left in
          let* right = expect_nat right in
          Ok (Runtime_value.Bool (Z.leq (Nat.to_z left) (Nat.to_z right)))
      | _ -> Error "Standard Library evaluator received the wrong arity")
  | LessThan -> (
      match args with
      | [ left; right ] ->
          let* left = expect_nat left in
          let* right = expect_nat right in
          Ok (Runtime_value.Bool (Z.lt (Nat.to_z left) (Nat.to_z right)))
      | _ -> Error "Standard Library evaluator received the wrong arity")

let node_id value =
  match CG.Node_id.of_string value with Ok id -> id | Error message -> invalid_arg message

let edge_id value =
  match CG.Edge_id.of_string value with Ok id -> id | Error message -> invalid_arg message

let port_key value =
  match CG.Port_key.of_string value with Ok key -> key | Error message -> invalid_arg message

let nat_literal value =
  match Nat.of_string value with
  | Ok nat -> nat
  | Error _ -> invalid_arg ("invalid Nat literal: " ^ value)

let node id kind = { CG.id = node_id id; kind }
let pref node port = { CG.node_id = node_id node; port_key = port_key port }
let edge id source target = { CG.id = edge_id id; source; target }

let function_signature template captures =
  {
    CG.template_id = CG.Function_template.id template;
    parameter_type = CG.Function_template.parameter_type template;
    result_type = CG.Function_template.result_type template;
    captures;
  }

let validate_graph_or_fail graph =
  match CG.validate graph with
  | Ok graph -> graph
  | Error errors ->
      invalid_arg
        ("standard library graph validation failed: "
        ^ String.concat "; " (List.map CG.validation_error_to_string errors))

let validate_graph_with_templates_or_fail templates graph =
  match CG.validate_with_templates templates graph with
  | Ok graph -> graph
  | Error errors ->
      invalid_arg
        ("standard library graph validation failed: "
        ^ String.concat "; " (List.map CG.validation_error_to_string errors))

let unit_drop_edges parameter_node drop_node =
  [ edge ("e-" ^ parameter_node ^ "-drop") (pref parameter_node "value") (pref drop_node "input") ]

let bool_literal value = CG.Bool_literal value

let template_id value =
  match CG.Function_template_id.of_string value with Ok id -> id | Error message -> invalid_arg message

let internal_id value = template_id ("tilefold.std.internal." ^ value)

let succ_inner_template () =
  let nodes =
    [
      node "value" (CG.Parameter nat);
      node "succ" CG.Succ;
      node "result" (CG.Result nat);
    ]
  in
  let edges =
    [
      edge "e-value-succ" (pref "value" "value") (pref "succ" "input");
      edge "e-succ-result" (pref "succ" "result") (pref "result" "value");
    ]
  in
  let body = CG.Raw_graph.of_lists ~nodes ~edges ~default_node_order:[ node_id "succ" ] |> validate_graph_or_fail in
  CG.Function_template.create ~id:(internal_id "succ-step-inner") ~parameter_type:nat ~result_type:nat ~captures:[] ~body ()

let succ_outer_template inner =
  let inner_arrow = nat_to_nat in
  let nodes =
    [
      node "index" (CG.Parameter nat);
      node "drop-index" (CG.Drop nat);
      node "inner-function" (CG.Function (function_signature inner []));
      node "result" (CG.Result inner_arrow);
    ]
  in
  let edges =
    unit_drop_edges "index" "drop-index"
    @ [ edge "e-inner-result" (pref "inner-function" "value") (pref "result" "value") ]
  in
  let body =
    CG.Raw_graph.of_lists ~nodes ~edges
      ~default_node_order:[ node_id "inner-function"; node_id "drop-index" ]
    |> validate_graph_with_templates_or_fail [ inner ]
  in
  CG.Function_template.create ~dependencies:[ CG.Function_template.id inner ]
    ~id:(internal_id "succ-step") ~parameter_type:nat ~result_type:inner_arrow
    ~captures:[] ~body ()

let add_inner_template succ_step =
  let left_capture = { CG.key = port_key "left"; typ = nat } in
  let nodes =
    [
      node "right" (CG.Parameter nat);
      node "left" (CG.Capture left_capture);
      node "step-function" (CG.Function (function_signature succ_step []));
      node "natrec" (CG.NatRec nat);
      node "result" (CG.Result nat);
    ]
  in
  let edges =
    [
      edge "e-left-base" (pref "left" "value") { CG.node_id = node_id "natrec"; port_key = CG.Port_key.base };
      edge "e-step-natrec" (pref "step-function" "value") { CG.node_id = node_id "natrec"; port_key = CG.Port_key.step };
      edge "e-right-count" (pref "right" "value") { CG.node_id = node_id "natrec"; port_key = CG.Port_key.count };
      edge "e-natrec-result" { CG.node_id = node_id "natrec"; port_key = CG.Port_key.result } (pref "result" "value");
    ]
  in
  let body =
    CG.Raw_graph.of_lists ~nodes ~edges
      ~default_node_order:[ node_id "step-function"; node_id "natrec" ]
    |> validate_graph_with_templates_or_fail [ succ_step ]
  in
  CG.Function_template.create ~dependencies:[ CG.Function_template.id succ_step ]
    ~id:(internal_id "add-inner") ~parameter_type:nat ~result_type:nat
    ~captures:[ left_capture ] ~body ()

let add_template inner =
  let left_capture = { CG.key = port_key "left"; typ = nat } in
  let nodes =
    [
      node "left" (CG.Parameter nat);
      node "inner-function" (CG.Function (function_signature inner [ left_capture ]));
      node "result" (CG.Result nat_to_nat);
    ]
  in
  let edges =
    [
      edge "e-left-capture" (pref "left" "value") { CG.node_id = node_id "inner-function"; port_key = left_capture.key };
      edge "e-inner-result" (pref "inner-function" "value") (pref "result" "value");
    ]
  in
  let body =
    CG.Raw_graph.of_lists ~nodes ~edges ~default_node_order:[ node_id "inner-function" ]
    |> validate_graph_with_templates_or_fail [ inner ]
  in
  CG.Function_template.create ~dependencies:[ CG.Function_template.id inner ]
    ~id:(function_template_id Add) ~parameter_type:nat ~result_type:nat_to_nat
    ~captures:[] ~body ()

let multiply_step_inner_template add =
  let factor_capture = { CG.key = port_key "factor"; typ = nat } in
  let nodes =
    [
      node "previous" (CG.Parameter nat);
      node "factor" (CG.Capture factor_capture);
      node "add-function" (CG.Function (function_signature add []));
      node "apply-factor" (CG.Apply { apply_parameter_type = nat; apply_result_type = nat_to_nat });
      node "apply-previous" (CG.Apply { apply_parameter_type = nat; apply_result_type = nat });
      node "result" (CG.Result nat);
    ]
  in
  let edges =
    [
      edge "e-add-apply-factor" (pref "add-function" "value") { CG.node_id = node_id "apply-factor"; port_key = CG.Port_key.function_input };
      edge "e-factor-apply" (pref "factor" "value") { CG.node_id = node_id "apply-factor"; port_key = CG.Port_key.argument };
      edge "e-partial-apply" { CG.node_id = node_id "apply-factor"; port_key = CG.Port_key.result } { CG.node_id = node_id "apply-previous"; port_key = CG.Port_key.function_input };
      edge "e-previous-apply" (pref "previous" "value") { CG.node_id = node_id "apply-previous"; port_key = CG.Port_key.argument };
      edge "e-apply-result" { CG.node_id = node_id "apply-previous"; port_key = CG.Port_key.result } (pref "result" "value");
    ]
  in
  let body =
    CG.Raw_graph.of_lists ~nodes ~edges
      ~default_node_order:[ node_id "add-function"; node_id "apply-factor"; node_id "apply-previous" ]
    |> validate_graph_with_templates_or_fail [ add ]
  in
  CG.Function_template.create ~dependencies:[ CG.Function_template.id add ]
    ~id:(internal_id "multiply-step-inner") ~parameter_type:nat
    ~result_type:nat ~captures:[ factor_capture ] ~body ()

let multiply_step_outer_template inner =
  let factor_capture = { CG.key = port_key "factor"; typ = nat } in
  let nodes =
    [
      node "index" (CG.Parameter nat);
      node "drop-index" (CG.Drop nat);
      node "inner-function" (CG.Function (function_signature inner [ factor_capture ]));
      node "factor" (CG.Capture factor_capture);
      node "result" (CG.Result nat_to_nat);
    ]
  in
  let edges =
    unit_drop_edges "index" "drop-index"
    @ [
        edge "e-factor-inner" (pref "factor" "value") { CG.node_id = node_id "inner-function"; port_key = factor_capture.key };
        edge "e-inner-result" (pref "inner-function" "value") (pref "result" "value");
      ]
  in
  let body =
    CG.Raw_graph.of_lists ~nodes ~edges
      ~default_node_order:[ node_id "inner-function"; node_id "drop-index" ]
    |> validate_graph_with_templates_or_fail [ inner ]
  in
  CG.Function_template.create ~dependencies:[ CG.Function_template.id inner ]
    ~id:(internal_id "multiply-step") ~parameter_type:nat ~result_type:nat_to_nat
    ~captures:[ factor_capture ] ~body ()

let multiply_inner_template step =
  let factor_capture = { CG.key = port_key "factor"; typ = nat } in
  let nodes =
    [
      node "count" (CG.Parameter nat);
      node "factor" (CG.Capture factor_capture);
      node "zero" (CG.Nat_literal (nat_literal "0"));
      node "step-function" (CG.Function (function_signature step [ factor_capture ]));
      node "natrec" (CG.NatRec nat);
      node "result" (CG.Result nat);
    ]
  in
  let edges =
    [
      edge "e-zero-base" (pref "zero" "value") { CG.node_id = node_id "natrec"; port_key = CG.Port_key.base };
      edge "e-factor-step" (pref "factor" "value") { CG.node_id = node_id "step-function"; port_key = factor_capture.key };
      edge "e-step-natrec" (pref "step-function" "value") { CG.node_id = node_id "natrec"; port_key = CG.Port_key.step };
      edge "e-count-natrec" (pref "count" "value") { CG.node_id = node_id "natrec"; port_key = CG.Port_key.count };
      edge "e-natrec-result" { CG.node_id = node_id "natrec"; port_key = CG.Port_key.result } (pref "result" "value");
    ]
  in
  let body =
    CG.Raw_graph.of_lists ~nodes ~edges
      ~default_node_order:[ node_id "step-function"; node_id "natrec" ]
    |> validate_graph_with_templates_or_fail [ step ]
  in
  CG.Function_template.create ~dependencies:[ CG.Function_template.id step ]
    ~id:(internal_id "multiply-inner") ~parameter_type:nat ~result_type:nat
    ~captures:[ factor_capture ] ~body ()

let multiply_template inner =
  let factor_capture = { CG.key = port_key "factor"; typ = nat } in
  let nodes =
    [
      node "factor" (CG.Parameter nat);
      node "inner-function" (CG.Function (function_signature inner [ factor_capture ]));
      node "result" (CG.Result nat_to_nat);
    ]
  in
  let edges =
    [
      edge "e-factor-capture" (pref "factor" "value") { CG.node_id = node_id "inner-function"; port_key = factor_capture.key };
      edge "e-inner-result" (pref "inner-function" "value") (pref "result" "value");
    ]
  in
  let body =
    CG.Raw_graph.of_lists ~nodes ~edges ~default_node_order:[ node_id "inner-function" ]
    |> validate_graph_with_templates_or_fail [ inner ]
  in
  CG.Function_template.create ~dependencies:[ CG.Function_template.id inner ]
    ~id:(function_template_id Multiply) ~parameter_type:nat ~result_type:nat_to_nat
    ~captures:[] ~body ()

let unary_call_template id target =
  (match id with Double | Square -> () | _ -> invalid_arg "unary stdlib target");
  let nodes =
    [
      node "value" (CG.Parameter nat);
      node "copy" (CG.Copy nat);
      node "function" (CG.Function (function_signature target []));
      node "apply-left" (CG.Apply { apply_parameter_type = nat; apply_result_type = nat_to_nat });
      node "apply-right" (CG.Apply { apply_parameter_type = nat; apply_result_type = nat });
      node "result" (CG.Result nat);
    ]
  in
  let edges =
    [
      edge "e-value-copy" (pref "value" "value") (pref "copy" "input");
      edge "e-function-apply-left" (pref "function" "value") { CG.node_id = node_id "apply-left"; port_key = CG.Port_key.function_input };
      edge "e-copy-left-apply" (pref "copy" "left") { CG.node_id = node_id "apply-left"; port_key = CG.Port_key.argument };
      edge "e-apply-left-right" { CG.node_id = node_id "apply-left"; port_key = CG.Port_key.result } { CG.node_id = node_id "apply-right"; port_key = CG.Port_key.function_input };
      edge "e-copy-right-apply" (pref "copy" "right") { CG.node_id = node_id "apply-right"; port_key = CG.Port_key.argument };
      edge "e-apply-result" { CG.node_id = node_id "apply-right"; port_key = CG.Port_key.result } (pref "result" "value");
    ]
  in
  let body =
    CG.Raw_graph.of_lists ~nodes ~edges
      ~default_node_order:[ node_id "copy"; node_id "function"; node_id "apply-left"; node_id "apply-right" ]
    |> validate_graph_with_templates_or_fail [ target ]
  in
  CG.Function_template.create ~dependencies:[ CG.Function_template.id target ]
    ~id:(function_template_id id) ~parameter_type:nat ~result_type:nat
    ~captures:[] ~body ()

let unary_std_call prefix target argument_source argument_type result_type =
  let function_node_id = prefix ^ "-function" in
  let apply_node_id = prefix ^ "-apply" in
  let nodes =
    [
      node function_node_id (CG.Function (function_signature target []));
      node apply_node_id (CG.Apply { apply_parameter_type = argument_type; apply_result_type = result_type });
    ]
  in
  let result_source = { CG.node_id = node_id apply_node_id; port_key = CG.Port_key.result } in
  let edges =
    [
      edge ("e-" ^ prefix ^ "-function")
        (pref function_node_id "value")
        { CG.node_id = node_id apply_node_id; port_key = CG.Port_key.function_input };
      edge ("e-" ^ prefix ^ "-argument") argument_source
        { CG.node_id = node_id apply_node_id; port_key = CG.Port_key.argument };
    ]
  in
  (nodes, edges, result_source)

let binary_std_call prefix target left_source right_source argument_type mid_type result_type =
  let function_node_id = prefix ^ "-function" in
  let apply_left_id = prefix ^ "-apply-left" in
  let apply_right_id = prefix ^ "-apply-right" in
  let nodes =
    [
      node function_node_id (CG.Function (function_signature target []));
      node apply_left_id
        (CG.Apply { apply_parameter_type = argument_type; apply_result_type = mid_type });
      node apply_right_id
        (CG.Apply { apply_parameter_type = argument_type; apply_result_type = result_type });
    ]
  in
  let left_result = { CG.node_id = node_id apply_left_id; port_key = CG.Port_key.result } in
  let final_result = { CG.node_id = node_id apply_right_id; port_key = CG.Port_key.result } in
  let edges =
    [
      edge ("e-" ^ prefix ^ "-function")
        (pref function_node_id "value")
        { CG.node_id = node_id apply_left_id; port_key = CG.Port_key.function_input };
      edge ("e-" ^ prefix ^ "-left") left_source
        { CG.node_id = node_id apply_left_id; port_key = CG.Port_key.argument };
      edge ("e-" ^ prefix ^ "-left-result") left_result
        { CG.node_id = node_id apply_right_id; port_key = CG.Port_key.function_input };
      edge ("e-" ^ prefix ^ "-right") right_source
        { CG.node_id = node_id apply_right_id; port_key = CG.Port_key.argument };
    ]
  in
  (nodes, edges, final_result)

let pred_step_inner_template () =
  let predecessor = { CG.key = port_key "predecessor"; typ = nat } in
  let nodes =
    [
      node "previous" (CG.Parameter nat);
      node "drop-previous" (CG.Drop nat);
      node "predecessor" (CG.Capture predecessor);
      node "result" (CG.Result nat);
    ]
  in
  let edges =
    unit_drop_edges "previous" "drop-previous"
    @ [ edge "e-predecessor-result" (pref "predecessor" "value") (pref "result" "value") ]
  in
  let body =
    CG.Raw_graph.of_lists ~nodes ~edges ~default_node_order:[ node_id "drop-previous" ]
    |> validate_graph_or_fail
  in
  CG.Function_template.create ~id:(internal_id "pred-step-inner")
    ~parameter_type:nat ~result_type:nat ~captures:[ predecessor ] ~body ()

let pred_step_outer_template inner =
  let predecessor = { CG.key = port_key "predecessor"; typ = nat } in
  let nodes =
    [
      node "predecessor" (CG.Parameter nat);
      node "inner-function" (CG.Function (function_signature inner [ predecessor ]));
      node "result" (CG.Result nat_to_nat);
    ]
  in
  let edges =
    [
      edge "e-predecessor-capture" (pref "predecessor" "value") { CG.node_id = node_id "inner-function"; port_key = predecessor.key };
      edge "e-inner-result" (pref "inner-function" "value") (pref "result" "value");
    ]
  in
  let body =
    CG.Raw_graph.of_lists ~nodes ~edges ~default_node_order:[ node_id "inner-function" ]
    |> validate_graph_with_templates_or_fail [ inner ]
  in
  CG.Function_template.create ~dependencies:[ CG.Function_template.id inner ]
    ~id:(internal_id "pred-step") ~parameter_type:nat ~result_type:nat_to_nat
    ~captures:[] ~body ()

let pred_template step =
  let nodes =
    [
      node "value" (CG.Parameter nat);
      node "zero" (CG.Nat_literal (nat_literal "0"));
      node "step-function" (CG.Function (function_signature step []));
      node "natrec" (CG.NatRec nat);
      node "result" (CG.Result nat);
    ]
  in
  let edges =
    [
      edge "e-zero-base" (pref "zero" "value") { CG.node_id = node_id "natrec"; port_key = CG.Port_key.base };
      edge "e-step-natrec" (pref "step-function" "value") { CG.node_id = node_id "natrec"; port_key = CG.Port_key.step };
      edge "e-value-count" (pref "value" "value") { CG.node_id = node_id "natrec"; port_key = CG.Port_key.count };
      edge "e-natrec-result" { CG.node_id = node_id "natrec"; port_key = CG.Port_key.result } (pref "result" "value");
    ]
  in
  let body =
    CG.Raw_graph.of_lists ~nodes ~edges
      ~default_node_order:[ node_id "step-function"; node_id "natrec" ]
    |> validate_graph_with_templates_or_fail [ step ]
  in
  CG.Function_template.create ~dependencies:[ CG.Function_template.id step ]
    ~id:(function_template_id Pred) ~parameter_type:nat ~result_type:nat
    ~captures:[] ~body ()

let subtract_step_inner_template pred =
  let nodes =
    [
      node "previous" (CG.Parameter nat);
      node "pred-function" (CG.Function (function_signature pred []));
      node "apply-pred" (CG.Apply { apply_parameter_type = nat; apply_result_type = nat });
      node "result" (CG.Result nat);
    ]
  in
  let edges =
    [
      edge "e-pred-apply" (pref "pred-function" "value") { CG.node_id = node_id "apply-pred"; port_key = CG.Port_key.function_input };
      edge "e-previous-apply" (pref "previous" "value") { CG.node_id = node_id "apply-pred"; port_key = CG.Port_key.argument };
      edge "e-apply-result" { CG.node_id = node_id "apply-pred"; port_key = CG.Port_key.result } (pref "result" "value");
    ]
  in
  let body =
    CG.Raw_graph.of_lists ~nodes ~edges
      ~default_node_order:[ node_id "pred-function"; node_id "apply-pred" ]
    |> validate_graph_with_templates_or_fail [ pred ]
  in
  CG.Function_template.create ~dependencies:[ CG.Function_template.id pred ]
    ~id:(internal_id "subtract-step-inner") ~parameter_type:nat
    ~result_type:nat ~captures:[] ~body ()

let subtract_step_outer_template inner =
  let nodes =
    [
      node "index" (CG.Parameter nat);
      node "drop-index" (CG.Drop nat);
      node "inner-function" (CG.Function (function_signature inner []));
      node "result" (CG.Result nat_to_nat);
    ]
  in
  let edges =
    unit_drop_edges "index" "drop-index"
    @ [ edge "e-inner-result" (pref "inner-function" "value") (pref "result" "value") ]
  in
  let body =
    CG.Raw_graph.of_lists ~nodes ~edges
      ~default_node_order:[ node_id "inner-function"; node_id "drop-index" ]
    |> validate_graph_with_templates_or_fail [ inner ]
  in
  CG.Function_template.create ~dependencies:[ CG.Function_template.id inner ]
    ~id:(internal_id "subtract-step") ~parameter_type:nat
    ~result_type:nat_to_nat ~captures:[] ~body ()

let subtract_inner_template step =
  let minuend = { CG.key = port_key "minuend"; typ = nat } in
  let nodes =
    [
      node "subtrahend" (CG.Parameter nat);
      node "minuend" (CG.Capture minuend);
      node "step-function" (CG.Function (function_signature step []));
      node "natrec" (CG.NatRec nat);
      node "result" (CG.Result nat);
    ]
  in
  let edges =
    [
      edge "e-minuend-base" (pref "minuend" "value") { CG.node_id = node_id "natrec"; port_key = CG.Port_key.base };
      edge "e-step-natrec" (pref "step-function" "value") { CG.node_id = node_id "natrec"; port_key = CG.Port_key.step };
      edge "e-count-natrec" (pref "subtrahend" "value") { CG.node_id = node_id "natrec"; port_key = CG.Port_key.count };
      edge "e-natrec-result" { CG.node_id = node_id "natrec"; port_key = CG.Port_key.result } (pref "result" "value");
    ]
  in
  let body =
    CG.Raw_graph.of_lists ~nodes ~edges
      ~default_node_order:[ node_id "step-function"; node_id "natrec" ]
    |> validate_graph_with_templates_or_fail [ step ]
  in
  CG.Function_template.create ~dependencies:[ CG.Function_template.id step ]
    ~id:(internal_id "subtract-inner") ~parameter_type:nat ~result_type:nat
    ~captures:[ minuend ] ~body ()

let subtract_template inner =
  let minuend = { CG.key = port_key "minuend"; typ = nat } in
  let nodes =
    [
      node "minuend" (CG.Parameter nat);
      node "inner-function" (CG.Function (function_signature inner [ minuend ]));
      node "result" (CG.Result nat_to_nat);
    ]
  in
  let edges =
    [
      edge "e-minuend-capture" (pref "minuend" "value") { CG.node_id = node_id "inner-function"; port_key = minuend.key };
      edge "e-inner-result" (pref "inner-function" "value") (pref "result" "value");
    ]
  in
  let body =
    CG.Raw_graph.of_lists ~nodes ~edges ~default_node_order:[ node_id "inner-function" ]
    |> validate_graph_with_templates_or_fail [ inner ]
  in
  CG.Function_template.create ~dependencies:[ CG.Function_template.id inner ]
    ~id:(function_template_id Subtract) ~parameter_type:nat
    ~result_type:nat_to_nat ~captures:[] ~body ()

let iszero_step_inner_template () =
  let nodes =
    [
      node "previous" (CG.Parameter bool);
      node "drop-previous" (CG.Drop bool);
      node "false" (bool_literal false);
      node "result" (CG.Result bool);
    ]
  in
  let edges =
    unit_drop_edges "previous" "drop-previous"
    @ [ edge "e-false-result" (pref "false" "value") (pref "result" "value") ]
  in
  let body =
    CG.Raw_graph.of_lists ~nodes ~edges ~default_node_order:[ node_id "drop-previous" ]
    |> validate_graph_or_fail
  in
  CG.Function_template.create ~id:(internal_id "iszero-step-inner")
    ~parameter_type:bool ~result_type:bool ~captures:[] ~body ()

let iszero_step_outer_template inner =
  let nodes =
    [
      node "index" (CG.Parameter nat);
      node "drop-index" (CG.Drop nat);
      node "inner-function" (CG.Function (function_signature inner []));
      node "result" (CG.Result bool_to_bool);
    ]
  in
  let edges =
    unit_drop_edges "index" "drop-index"
    @ [ edge "e-inner-result" (pref "inner-function" "value") (pref "result" "value") ]
  in
  let body =
    CG.Raw_graph.of_lists ~nodes ~edges
      ~default_node_order:[ node_id "inner-function"; node_id "drop-index" ]
    |> validate_graph_with_templates_or_fail [ inner ]
  in
  CG.Function_template.create ~dependencies:[ CG.Function_template.id inner ]
    ~id:(internal_id "iszero-step") ~parameter_type:nat
    ~result_type:bool_to_bool ~captures:[] ~body ()

let iszero_template step =
  let nodes =
    [
      node "value" (CG.Parameter nat);
      node "true" (bool_literal true);
      node "step-function" (CG.Function (function_signature step []));
      node "natrec" (CG.NatRec bool);
      node "result" (CG.Result bool);
    ]
  in
  let edges =
    [
      edge "e-true-base" (pref "true" "value") { CG.node_id = node_id "natrec"; port_key = CG.Port_key.base };
      edge "e-step-natrec" (pref "step-function" "value") { CG.node_id = node_id "natrec"; port_key = CG.Port_key.step };
      edge "e-value-count" (pref "value" "value") { CG.node_id = node_id "natrec"; port_key = CG.Port_key.count };
      edge "e-natrec-result" { CG.node_id = node_id "natrec"; port_key = CG.Port_key.result } (pref "result" "value");
    ]
  in
  let body =
    CG.Raw_graph.of_lists ~nodes ~edges
      ~default_node_order:[ node_id "step-function"; node_id "natrec" ]
    |> validate_graph_with_templates_or_fail [ step ]
  in
  CG.Function_template.create ~dependencies:[ CG.Function_template.id step ]
    ~id:(function_template_id IsZero) ~parameter_type:nat ~result_type:bool
    ~captures:[] ~body ()

let not_template () =
  let nodes =
    [
      node "condition" (CG.Parameter bool);
      node "false" (bool_literal false);
      node "true" (bool_literal true);
      node "boolrec" (CG.BoolRec bool);
      node "result" (CG.Result bool);
    ]
  in
  let edges =
    [
      edge "e-condition" (pref "condition" "value") { CG.node_id = node_id "boolrec"; port_key = CG.Port_key.condition };
      edge "e-false-case" (pref "true" "value") { CG.node_id = node_id "boolrec"; port_key = CG.Port_key.false_case };
      edge "e-true-case" (pref "false" "value") { CG.node_id = node_id "boolrec"; port_key = CG.Port_key.true_case };
      edge "e-result" { CG.node_id = node_id "boolrec"; port_key = CG.Port_key.result } (pref "result" "value");
    ]
  in
  let body =
    CG.Raw_graph.of_lists ~nodes ~edges ~default_node_order:[ node_id "boolrec" ]
    |> validate_graph_or_fail
  in
  CG.Function_template.create ~id:(function_template_id Not)
    ~parameter_type:bool ~result_type:bool ~captures:[] ~body ()

let binary_bool_template id =
  let capture = { CG.key = port_key "left"; typ = bool } in
  let false_case_source, true_case_source =
    match id with
    | And -> ("false", "right")
    | Or -> ("right", "true")
    | _ -> invalid_arg "binary bool stdlib target"
  in
  let inner_id = match id with And -> "and-inner" | Or -> "or-inner" | _ -> assert false in
  let outer_template_id = function_template_id id in
  let inner_nodes =
    [
      node "right" (CG.Parameter bool);
      node "left" (CG.Capture capture);
      (match id with
      | And -> node "false" (bool_literal false)
      | Or -> node "true" (bool_literal true)
      | _ -> invalid_arg "binary bool stdlib target");
      node "boolrec" (CG.BoolRec bool);
      node "result" (CG.Result bool);
    ]
  in
  let inner_edges =
    [
      edge "e-left-condition" (pref "left" "value") { CG.node_id = node_id "boolrec"; port_key = CG.Port_key.condition };
      edge "e-false-case" (pref false_case_source "value") { CG.node_id = node_id "boolrec"; port_key = CG.Port_key.false_case };
      edge "e-true-case" (pref true_case_source "value") { CG.node_id = node_id "boolrec"; port_key = CG.Port_key.true_case };
      edge "e-result" { CG.node_id = node_id "boolrec"; port_key = CG.Port_key.result } (pref "result" "value");
    ]
  in
  let inner_body =
    CG.Raw_graph.of_lists ~nodes:inner_nodes ~edges:inner_edges
      ~default_node_order:[ node_id "boolrec" ]
    |> validate_graph_or_fail
  in
  let inner =
    CG.Function_template.create ~id:(internal_id inner_id)
      ~parameter_type:bool ~result_type:bool ~captures:[ capture ] ~body:inner_body ()
  in
  let outer_nodes =
    [
      node "left" (CG.Parameter bool);
      node "inner-function" (CG.Function (function_signature inner [ capture ]));
      node "result" (CG.Result bool_to_bool);
    ]
  in
  let outer_edges =
    [
      edge "e-left-capture" (pref "left" "value") { CG.node_id = node_id "inner-function"; port_key = capture.key };
      edge "e-inner-result" (pref "inner-function" "value") (pref "result" "value");
    ]
  in
  let outer_body =
    CG.Raw_graph.of_lists ~nodes:outer_nodes ~edges:outer_edges
      ~default_node_order:[ node_id "inner-function" ]
    |> validate_graph_with_templates_or_fail [ inner ]
  in
  let outer =
    CG.Function_template.create ~dependencies:[ CG.Function_template.id inner ]
      ~id:outer_template_id ~parameter_type:bool ~result_type:bool_to_bool
      ~captures:[] ~body:outer_body ()
  in
  (inner, outer)

let binary_nat_outer_template id inner result_type =
  let left_capture = { CG.key = port_key "a"; typ = nat } in
  let nodes =
    [
      node "a" (CG.Parameter nat);
      node "inner-function" (CG.Function (function_signature inner [ left_capture ]));
      node "result" (CG.Result (Core_type.Arrow (nat, result_type)));
    ]
  in
  let edges =
    [
      edge "e-a-capture" (pref "a" "value") { CG.node_id = node_id "inner-function"; port_key = left_capture.key };
      edge "e-inner-result" (pref "inner-function" "value") (pref "result" "value");
    ]
  in
  let body =
    CG.Raw_graph.of_lists ~nodes ~edges ~default_node_order:[ node_id "inner-function" ]
    |> validate_graph_with_templates_or_fail [ inner ]
  in
  CG.Function_template.create ~dependencies:[ CG.Function_template.id inner ]
    ~id:(function_template_id id) ~parameter_type:nat
    ~result_type:(Core_type.Arrow (nat, result_type))
    ~captures:[] ~body ()

let less_or_equal_inner_template subtract iszero =
  let left_capture = { CG.key = port_key "a"; typ = nat } in
  let subtract_nodes, subtract_edges, subtract_result =
    binary_std_call "subtract" subtract (pref "a" "value") (pref "b" "value") nat nat_to_nat nat
  in
  let iszero_nodes, iszero_edges, iszero_result =
    unary_std_call "iszero" iszero subtract_result nat bool
  in
  let nodes =
    [ node "b" (CG.Parameter nat); node "a" (CG.Capture left_capture); node "result" (CG.Result bool) ]
    @ subtract_nodes @ iszero_nodes
  in
  let edges =
    subtract_edges @ iszero_edges
    @ [ edge "e-iszero-result" iszero_result (pref "result" "value") ]
  in
  let body =
    CG.Raw_graph.of_lists ~nodes ~edges
      ~default_node_order:
        [
          node_id "subtract-function";
          node_id "subtract-apply-left";
          node_id "subtract-apply-right";
          node_id "iszero-function";
          node_id "iszero-apply";
        ]
    |> validate_graph_with_templates_or_fail [ subtract; iszero ]
  in
  CG.Function_template.create ~dependencies:[ CG.Function_template.id subtract; CG.Function_template.id iszero ]
    ~id:(internal_id "less-or-equal-inner") ~parameter_type:nat ~result_type:bool
    ~captures:[ left_capture ] ~body ()

let equal_inner_template subtract iszero and_ =
  let left_capture = { CG.key = port_key "a"; typ = nat } in
  let nodes_prefix =
    [
      node "b" (CG.Parameter nat);
      node "a" (CG.Capture left_capture);
      node "copy-a" (CG.Copy nat);
      node "copy-b" (CG.Copy nat);
      node "result" (CG.Result bool);
    ]
  in
  let edges_prefix =
    [
      edge "e-a-copy" (pref "a" "value") (pref "copy-a" "input");
      edge "e-b-copy" (pref "b" "value") (pref "copy-b" "input");
    ]
  in
  let sub_ab_nodes, sub_ab_edges, sub_ab_result =
    binary_std_call "subtract-ab" subtract (pref "copy-a" "left") (pref "copy-b" "left") nat nat_to_nat nat
  in
  let sub_ba_nodes, sub_ba_edges, sub_ba_result =
    binary_std_call "subtract-ba" subtract (pref "copy-b" "right") (pref "copy-a" "right") nat nat_to_nat nat
  in
  let zero_ab_nodes, zero_ab_edges, zero_ab_result =
    unary_std_call "iszero-ab" iszero sub_ab_result nat bool
  in
  let zero_ba_nodes, zero_ba_edges, zero_ba_result =
    unary_std_call "iszero-ba" iszero sub_ba_result nat bool
  in
  let and_nodes, and_edges, and_result =
    binary_std_call "and" and_ zero_ab_result zero_ba_result bool bool_to_bool bool
  in
  let nodes =
    nodes_prefix @ sub_ab_nodes @ sub_ba_nodes @ zero_ab_nodes @ zero_ba_nodes @ and_nodes
  in
  let edges =
    edges_prefix @ sub_ab_edges @ sub_ba_edges @ zero_ab_edges @ zero_ba_edges @ and_edges
    @ [ edge "e-and-result" and_result (pref "result" "value") ]
  in
  let body =
    CG.Raw_graph.of_lists ~nodes ~edges
      ~default_node_order:
        [
          node_id "copy-a";
          node_id "copy-b";
          node_id "subtract-ab-function";
          node_id "subtract-ab-apply-left";
          node_id "subtract-ab-apply-right";
          node_id "subtract-ba-function";
          node_id "subtract-ba-apply-left";
          node_id "subtract-ba-apply-right";
          node_id "iszero-ab-function";
          node_id "iszero-ab-apply";
          node_id "iszero-ba-function";
          node_id "iszero-ba-apply";
          node_id "and-function";
          node_id "and-apply-left";
          node_id "and-apply-right";
        ]
    |> validate_graph_with_templates_or_fail [ subtract; iszero; and_ ]
  in
  CG.Function_template.create
    ~dependencies:[ CG.Function_template.id subtract; CG.Function_template.id iszero; CG.Function_template.id and_ ]
    ~id:(internal_id "equal-inner") ~parameter_type:nat ~result_type:bool
    ~captures:[ left_capture ] ~body ()

let less_than_inner_template less_or_equal equal not_ and_ =
  let left_capture = { CG.key = port_key "a"; typ = nat } in
  let nodes_prefix =
    [
      node "b" (CG.Parameter nat);
      node "a" (CG.Capture left_capture);
      node "copy-a" (CG.Copy nat);
      node "copy-b" (CG.Copy nat);
      node "result" (CG.Result bool);
    ]
  in
  let edges_prefix =
    [
      edge "e-a-copy" (pref "a" "value") (pref "copy-a" "input");
      edge "e-b-copy" (pref "b" "value") (pref "copy-b" "input");
    ]
  in
  let le_nodes, le_edges, le_result =
    binary_std_call "less-or-equal" less_or_equal (pref "copy-a" "left") (pref "copy-b" "left") nat nat_to_bool bool
  in
  let equal_nodes, equal_edges, equal_result =
    binary_std_call "equal" equal (pref "copy-a" "right") (pref "copy-b" "right") nat nat_to_bool bool
  in
  let not_nodes, not_edges, not_result =
    unary_std_call "not" not_ equal_result bool bool
  in
  let and_nodes, and_edges, and_result =
    binary_std_call "and" and_ le_result not_result bool bool_to_bool bool
  in
  let nodes = nodes_prefix @ le_nodes @ equal_nodes @ not_nodes @ and_nodes in
  let edges =
    edges_prefix @ le_edges @ equal_edges @ not_edges @ and_edges
    @ [ edge "e-and-result" and_result (pref "result" "value") ]
  in
  let body =
    CG.Raw_graph.of_lists ~nodes ~edges
      ~default_node_order:
        [
          node_id "copy-a";
          node_id "copy-b";
          node_id "less-or-equal-function";
          node_id "less-or-equal-apply-left";
          node_id "less-or-equal-apply-right";
          node_id "equal-function";
          node_id "equal-apply-left";
          node_id "equal-apply-right";
          node_id "not-function";
          node_id "not-apply";
          node_id "and-function";
          node_id "and-apply-left";
          node_id "and-apply-right";
        ]
    |> validate_graph_with_templates_or_fail [ less_or_equal; equal; not_; and_ ]
  in
  CG.Function_template.create
    ~dependencies:
      [
        CG.Function_template.id less_or_equal;
        CG.Function_template.id equal;
        CG.Function_template.id not_;
        CG.Function_template.id and_;
      ]
    ~id:(internal_id "less-than-inner") ~parameter_type:nat ~result_type:bool
    ~captures:[ left_capture ] ~body ()

let minmax_inner_template id less_or_equal =
  let left_capture = { CG.key = port_key "a"; typ = nat } in
  let le_nodes, le_edges, le_result =
    binary_std_call "less-or-equal" less_or_equal (pref "copy-a" "left") (pref "copy-b" "left") nat nat_to_bool bool
  in
  let false_source, true_source =
    match id with
    | Min -> (pref "copy-b" "right", pref "copy-a" "right")
    | Max -> (pref "copy-a" "right", pref "copy-b" "right")
    | _ -> invalid_arg "minmax stdlib target"
  in
  let inner_id = match id with Min -> "min-inner" | Max -> "max-inner" | _ -> assert false in
  let nodes =
    [
      node "b" (CG.Parameter nat);
      node "a" (CG.Capture left_capture);
      node "copy-a" (CG.Copy nat);
      node "copy-b" (CG.Copy nat);
      node "boolrec" (CG.BoolRec nat);
      node "result" (CG.Result nat);
    ]
    @ le_nodes
  in
  let edges =
    [
      edge "e-a-copy" (pref "a" "value") (pref "copy-a" "input");
      edge "e-b-copy" (pref "b" "value") (pref "copy-b" "input");
    ]
    @ le_edges
    @ [
        edge "e-condition" le_result { CG.node_id = node_id "boolrec"; port_key = CG.Port_key.condition };
        edge "e-false-case" false_source { CG.node_id = node_id "boolrec"; port_key = CG.Port_key.false_case };
        edge "e-true-case" true_source { CG.node_id = node_id "boolrec"; port_key = CG.Port_key.true_case };
        edge "e-result" { CG.node_id = node_id "boolrec"; port_key = CG.Port_key.result } (pref "result" "value");
      ]
  in
  let body =
    CG.Raw_graph.of_lists ~nodes ~edges
      ~default_node_order:
        [
          node_id "copy-a";
          node_id "copy-b";
          node_id "less-or-equal-function";
          node_id "less-or-equal-apply-left";
          node_id "less-or-equal-apply-right";
          node_id "boolrec";
        ]
    |> validate_graph_with_templates_or_fail [ less_or_equal ]
  in
  CG.Function_template.create ~dependencies:[ CG.Function_template.id less_or_equal ]
    ~id:(internal_id inner_id) ~parameter_type:nat ~result_type:nat
    ~captures:[ left_capture ] ~body ()

let all_templates =
  let succ_inner = succ_inner_template () in
  let succ_outer = succ_outer_template succ_inner in
  let add_inner = add_inner_template succ_outer in
  let add = add_template add_inner in
  let multiply_step_inner = multiply_step_inner_template add in
  let multiply_step = multiply_step_outer_template multiply_step_inner in
  let multiply_inner = multiply_inner_template multiply_step in
  let multiply = multiply_template multiply_inner in
  let double = unary_call_template Double add in
  let square = unary_call_template Square multiply in
  let pred_step_inner = pred_step_inner_template () in
  let pred_step = pred_step_outer_template pred_step_inner in
  let pred = pred_template pred_step in
  let subtract_step_inner = subtract_step_inner_template pred in
  let subtract_step = subtract_step_outer_template subtract_step_inner in
  let subtract_inner = subtract_inner_template subtract_step in
  let subtract = subtract_template subtract_inner in
  let iszero_step_inner = iszero_step_inner_template () in
  let iszero_step = iszero_step_outer_template iszero_step_inner in
  let iszero = iszero_template iszero_step in
  let not_ = not_template () in
  let and_inner, and_ = binary_bool_template And in
  let or_inner, or_ = binary_bool_template Or in
  let less_or_equal_inner = less_or_equal_inner_template subtract iszero in
  let less_or_equal = binary_nat_outer_template LessOrEqual less_or_equal_inner bool in
  let equal_inner = equal_inner_template subtract iszero and_ in
  let equal = binary_nat_outer_template Equal equal_inner bool in
  let less_than_inner = less_than_inner_template less_or_equal equal not_ and_ in
  let less_than = binary_nat_outer_template LessThan less_than_inner bool in
  let min_inner = minmax_inner_template Min less_or_equal in
  let min = binary_nat_outer_template Min min_inner nat in
  let max_inner = minmax_inner_template Max less_or_equal in
  let max = binary_nat_outer_template Max max_inner nat in
  [
    succ_inner;
    succ_outer;
    add_inner;
    add;
    multiply_step_inner;
    multiply_step;
    multiply_inner;
    multiply;
    double;
    square;
    pred_step_inner;
    pred_step;
    pred;
    subtract_step_inner;
    subtract_step;
    subtract_inner;
    subtract;
    iszero_step_inner;
    iszero_step;
    iszero;
    not_;
    and_inner;
    and_;
    or_inner;
    or_;
    less_or_equal_inner;
    less_or_equal;
    equal_inner;
    equal;
    less_than_inner;
    less_than;
    min_inner;
    min;
    max_inner;
    max;
  ]

let exposed_templates =
  all_templates
  |> List.filter (fun template ->
         List.exists
           (fun item ->
             CG.Function_template_id.equal (CG.Function_template.id template)
               (function_template_id item.id))
           functions)

let is_standard_template_id id =
  List.exists
    (fun template -> CG.Function_template_id.equal (CG.Function_template.id template) id)
    all_templates
