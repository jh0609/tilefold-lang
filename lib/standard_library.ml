module CG = Core_graph

type function_id =
  | Add
  | Multiply
  | Double
  | Square

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
let nat = Core_type.Nat
let nat_to_nat = Core_type.Arrow (nat, nat)

let stable_id = function
  | Add -> "tilefold.std.nat.add"
  | Multiply -> "tilefold.std.nat.multiply"
  | Double -> "tilefold.std.nat.double"
  | Square -> "tilefold.std.nat.square"

let display_name = function
  | Add -> "add"
  | Multiply -> "multiply"
  | Double -> "double"
  | Square -> "square"

let function_template_id id =
  match CG.Function_template_id.of_string (stable_id id) with
  | Ok value -> value
  | Error message -> invalid_arg message

let info id =
  let parameter_type, result_type =
    match id with
    | Add | Multiply -> (nat, nat_to_nat)
    | Double | Square -> (nat, nat)
  in
  { id; stable_id = stable_id id; display_name = display_name id; version; parameter_type; result_type }

let functions = List.map info [ Add; Multiply; Double; Square ]
let find_function stable_id = List.find_opt (fun item -> String.equal item.stable_id stable_id) functions

let id_of_template_id template_id =
  List.find_map
    (fun item ->
      if String.equal item.stable_id (CG.Function_template_id.to_string template_id)
      then Some item.id
      else None)
    functions

let arity = function Add | Multiply -> 2 | Double | Square -> 1

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
  | _ -> Error "Standard Library evaluator received the wrong arity"

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
