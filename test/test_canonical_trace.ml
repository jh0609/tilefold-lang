open Tilefold
open Core_graph

module P = Program_package

let node_id value =
  match Node_id.of_string value with
  | Ok id -> id
  | Error message -> failwith message

let edge_id value =
  match Edge_id.of_string value with
  | Ok id -> id
  | Error message -> failwith message

let port_key value =
  match Port_key.of_string value with
  | Ok key -> key
  | Error message -> failwith message

let template_id value =
  match Function_template_id.of_string value with
  | Ok id -> id
  | Error message -> failwith message

let literal_id value =
  match P.Literal_id.of_string value with
  | Ok id -> id
  | Error message -> failwith message

let nat value =
  match Nat.of_string value with
  | Ok nat -> nat
  | Error _ -> assert false

let node id kind = { id = node_id id; kind }
let pref node port = { node_id = node_id node; port_key = port_key port }
let edge id source target = { id = edge_id id; source; target }

let validate_graph raw =
  match validate raw with
  | Ok graph -> graph
  | Error errors ->
      failwith
        ("graph validation failed: "
        ^ String.concat "; " (List.map validation_error_to_string errors))

let validate_graph_with_templates templates raw =
  match validate_with_templates templates raw with
  | Ok graph -> graph
  | Error errors ->
      failwith
        ("graph validation failed: "
        ^ String.concat "; " (List.map validation_error_to_string errors))

let package_of_entry ?(templates = []) entry result_type =
  P.Raw.create ~templates:(entry :: templates)
    ~entry_template_id:(Function_template.id entry) ~result_type ()
  |> fun raw ->
  match P.validate raw with
  | Ok package -> package
  | Error errors ->
      failwith
        ("package validation failed: "
        ^ String.concat "; " (List.map P.validation_error_to_string errors))

let function_signature template captures =
  {
    template_id = Function_template.id template;
    parameter_type = Function_template.parameter_type template;
    result_type = Function_template.result_type template;
    captures;
  }

let unit_entry () =
  let nodes =
    [ node "param" (Parameter Core_type.Unit); node "result" (Result Core_type.Unit) ]
  in
  let edges = [ edge "e-param-result" (pref "param" "value") (pref "result" "value") ] in
  let body = Raw_graph.of_lists ~nodes ~edges ~default_node_order:[] |> validate_graph in
  Function_template.create ~id:(template_id "canonical-unit-entry")
    ~parameter_type:Core_type.Unit ~result_type:Core_type.Unit ~captures:[]
    ~body ()

let succ_entry () =
  let nodes =
    [
      node "param" (Parameter Core_type.Unit);
      node "drop-param" (Drop Core_type.Unit);
      node "lit" (Nat_literal (nat "4"));
      node "succ" Succ;
      node "result" (Result Core_type.Nat);
    ]
  in
  let edges =
    [
      edge "e-param-drop" (pref "param" "value") (pref "drop-param" "input");
      edge "e-lit-succ" (pref "lit" "value") (pref "succ" "input");
      edge "e-succ-result" (pref "succ" "result") (pref "result" "value");
    ]
  in
  let body =
    Raw_graph.of_lists ~nodes ~edges
      ~default_node_order:[ node_id "succ"; node_id "drop-param" ]
    |> validate_graph
  in
  Function_template.create ~id:(template_id "canonical-succ-entry")
    ~parameter_type:Core_type.Unit ~result_type:Core_type.Nat ~captures:[]
    ~body ()

let copy_entry () =
  let nodes =
    [
      node "param" (Parameter Core_type.Unit);
      node "drop-param" (Drop Core_type.Unit);
      node "lit" (Nat_literal (nat "2"));
      node "copy" (Copy Core_type.Nat);
      node "succ" Succ;
      node "drop-copy" (Drop Core_type.Nat);
      node "result" (Result Core_type.Nat);
    ]
  in
  let edges =
    [
      edge "e-param-drop" (pref "param" "value") (pref "drop-param" "input");
      edge "e-lit-copy" (pref "lit" "value") (pref "copy" "input");
      edge "e-copy-left-succ" (pref "copy" "left") (pref "succ" "input");
      edge "e-copy-right-drop" (pref "copy" "right") (pref "drop-copy" "input");
      edge "e-succ-result" (pref "succ" "result") (pref "result" "value");
    ]
  in
  let body =
    Raw_graph.of_lists ~nodes ~edges
      ~default_node_order:[ node_id "copy"; node_id "succ"; node_id "drop-copy"; node_id "drop-param" ]
    |> validate_graph
  in
  Function_template.create ~id:(template_id "canonical-copy-entry")
    ~parameter_type:Core_type.Unit ~result_type:Core_type.Nat ~captures:[]
    ~body ()

let unit_to_nat_template () =
  let nodes =
    [
      node "param" (Parameter Core_type.Unit);
      node "drop-param" (Drop Core_type.Unit);
      node "lit" (Nat_literal (nat "6"));
      node "result" (Result Core_type.Nat);
    ]
  in
  let edges =
    [
      edge "e-param-drop" (pref "param" "value") (pref "drop-param" "input");
      edge "e-lit-result" (pref "lit" "value") (pref "result" "value");
    ]
  in
  let body =
    Raw_graph.of_lists ~nodes ~edges ~default_node_order:[ node_id "drop-param" ]
    |> validate_graph
  in
  Function_template.create ~id:(template_id "canonical-unit-to-nat")
    ~parameter_type:Core_type.Unit ~result_type:Core_type.Nat ~captures:[]
    ~body ()

let arrow_entry target =
  let arrow = Core_type.Arrow (Core_type.Unit, Core_type.Nat) in
  let nodes =
    [
      node "param" (Parameter Core_type.Unit);
      node "drop-param" (Drop Core_type.Unit);
      node "function" (Function (function_signature target []));
      node "result" (Result arrow);
    ]
  in
  let edges =
    [
      edge "e-param-drop" (pref "param" "value") (pref "drop-param" "input");
      edge "e-function-result" (pref "function" "value") (pref "result" "value");
    ]
  in
  let body =
    Raw_graph.of_lists ~nodes ~edges
      ~default_node_order:[ node_id "function"; node_id "drop-param" ]
    |> validate_graph_with_templates [ target ]
  in
  Function_template.create ~dependencies:[ Function_template.id target ]
    ~id:(template_id "canonical-arrow-entry") ~parameter_type:Core_type.Unit
    ~result_type:arrow ~captures:[] ~body ()

let apply_entry target =
  let nodes =
    [
      node "param" (Parameter Core_type.Unit);
      node "drop-param" (Drop Core_type.Unit);
      node "function" (Function (function_signature target []));
      node "argument" Unit_literal;
      node "apply" (Apply { apply_parameter_type = Core_type.Unit; apply_result_type = Core_type.Nat });
      node "result" (Result Core_type.Nat);
    ]
  in
  let edges =
    [
      edge "e-param-drop" (pref "param" "value") (pref "drop-param" "input");
      edge "e-function-apply" (pref "function" "value")
        { node_id = node_id "apply"; port_key = Port_key.function_input };
      edge "e-argument-apply" (pref "argument" "value")
        { node_id = node_id "apply"; port_key = Port_key.argument };
      edge "e-apply-result" { node_id = node_id "apply"; port_key = Port_key.result }
        (pref "result" "value");
    ]
  in
  let body =
    Raw_graph.of_lists ~nodes ~edges
      ~default_node_order:[ node_id "function"; node_id "apply"; node_id "drop-param" ]
    |> validate_graph_with_templates [ target ]
  in
  Function_template.create ~dependencies:[ Function_template.id target ]
    ~id:(template_id "canonical-apply-entry") ~parameter_type:Core_type.Unit
    ~result_type:Core_type.Nat ~captures:[] ~body ()

let run_completed package =
  match P.run_completed package with
  | Ok completed -> completed
  | Error _ -> assert false

let payload_string value =
  match Runtime_value.payload value with
  | Unit -> "Unit"
  | Nat nat -> "Nat(" ^ Nat.to_string nat ^ ")"
  | Closure closure ->
      "Closure(" ^ Function_template_id.to_string closure.template_id ^ ")"

let rules trace = List.map (fun event -> Rewrite_event.rule_to_string event.Rewrite_event.rule) trace

let assert_indexes name trace =
  trace
  |> List.iteri (fun index event ->
         if event.Rewrite_event.index <> index then
           failwith
             (name ^ ": event index mismatch at position " ^ string_of_int index
            ^ ", actual " ^ string_of_int event.Rewrite_event.index))

let assert_canonical_fixture name package expected_type expected_payload
    expected_rules =
  let first = run_completed package in
  let second = run_completed package in
  assert (Core_type.to_string (Runtime_value.typ first.value) = expected_type);
  assert (payload_string first.value = expected_payload);
  if rules first.trace <> expected_rules then
    failwith
      (name ^ ": rule sequence mismatch, actual "
      ^ String.concat "," (rules first.trace));
  assert_indexes name first.trace;
  assert (
    Canonical_trace.render_completed first.machine first.value
    = Canonical_trace.render_completed second.machine second.value);
  let canonical = Canonical_trace.render_completed first.machine first.value in
  assert (String.contains canonical '\n');
  assert (String.starts_with ~prefix:"semantics_profile: transparent-v0" canonical);
  assert (String.contains canonical 'p');
  ignore name

let () =
  assert_canonical_fixture "program-unit" (package_of_entry (unit_entry ()) Core_type.Unit)
    "Unit" "Unit" [ "Function"; "ApplyEnter"; "ApplyReturn" ]

let () =
  assert_canonical_fixture "succ"
    (package_of_entry (succ_entry ()) Core_type.Nat)
    "Nat" "Nat(5)"
    [ "Function"; "ApplyEnter"; "Succ"; "Drop"; "ApplyReturn" ]

let () =
  assert_canonical_fixture "copy-drop"
    (package_of_entry (copy_entry ()) Core_type.Nat)
    "Nat" "Nat(3)"
    [ "Function"; "ApplyEnter"; "Copy"; "Drop"; "Succ"; "Drop"; "ApplyReturn" ]

let () =
  let target = unit_to_nat_template () in
  assert_canonical_fixture "function-closure"
    (package_of_entry ~templates:[ target ] (arrow_entry target)
       (Core_type.Arrow (Core_type.Unit, Core_type.Nat)))
    "Unit -> Nat" "Closure(canonical-unit-to-nat)"
    [ "Function"; "ApplyEnter"; "Function"; "Drop"; "ApplyReturn" ]

let () =
  let target = unit_to_nat_template () in
  assert_canonical_fixture "ordinary-apply"
    (package_of_entry ~templates:[ target ] (apply_entry target) Core_type.Nat)
    "Nat" "Nat(6)"
    [
      "Function";
      "ApplyEnter";
      "Function";
      "Drop";
      "ApplyEnter";
      "Drop";
      "ApplyReturn";
      "ApplyReturn";
    ]

let () =
  assert_canonical_fixture "add" (P.Examples.add ()) "Nat" "Nat(5)"
    (rules (run_completed (P.Examples.add ())).trace)

let () =
  assert_canonical_fixture "multiply" (P.Examples.multiply ()) "Nat" "Nat(6)"
    (rules (run_completed (P.Examples.multiply ())).trace)

let () =
  assert_canonical_fixture "higher-order-function"
    (P.Examples.higher_order_function ()) "Nat -> Nat"
    "Closure(example-higher-wrapper)"
    (rules (run_completed (P.Examples.higher_order_function ())).trace)

let () =
  assert_canonical_fixture "higher-order-apply"
    (P.Examples.higher_order_apply ()) "Nat" "Nat(5)"
    (rules (run_completed (P.Examples.higher_order_apply ())).trace)

let () =
  assert_canonical_fixture "natrec-count-0"
    (P.Examples.higher_order_apply ~count:"0" ()) "Nat" "Nat(2)"
    (rules (run_completed (P.Examples.higher_order_apply ~count:"0" ())).trace)

let () =
  assert_canonical_fixture "natrec-count-1"
    (P.Examples.higher_order_apply ~count:"1" ()) "Nat" "Nat(3)"
    (rules (run_completed (P.Examples.higher_order_apply ~count:"1" ())).trace)

let () =
  assert_canonical_fixture "natrec-count-3"
    (P.Examples.higher_order_apply ~count:"3" ()) "Nat" "Nat(5)"
    (rules (run_completed (P.Examples.higher_order_apply ~count:"3" ())).trace)

let () =
  let cycle_raw =
    let nodes =
      [
        node "param" (Parameter Core_type.Unit);
        node "drop" (Drop Core_type.Unit);
        node "cycle" Succ;
        node "result" (Result Core_type.Unit);
      ]
    in
    let edges =
      [
        edge "e-param-drop" (pref "param" "value") (pref "drop" "input");
        edge "e-param-result" (pref "param" "value") (pref "result" "value");
        edge "e-cycle" (pref "cycle" "result") (pref "cycle" "input");
      ]
    in
    Raw_graph.of_lists ~nodes ~edges ~default_node_order:[ node_id "cycle"; node_id "drop" ]
  in
  match validate cycle_raw with
  | Ok _ -> assert false
  | Error errors ->
      let rendered_a = Canonical_trace.render_core_validation_errors errors in
      let rendered_b = Canonical_trace.render_core_validation_errors errors in
      assert (rendered_a = rendered_b);
      assert (String.contains rendered_a 'c')

let () =
  let target = unit_to_nat_template () in
  let bad_signature =
    {
      template_id = Function_template.id target;
      parameter_type = Core_type.Nat;
      result_type = Core_type.Nat;
      captures = [];
    }
  in
  let nodes =
    [
      node "param" (Parameter Core_type.Unit);
      node "drop" (Drop Core_type.Unit);
      node "function" (Function bad_signature);
      node "result" (Result (Core_type.Arrow (Core_type.Nat, Core_type.Nat)));
    ]
  in
  let edges =
    [
      edge "e-param-drop" (pref "param" "value") (pref "drop" "input");
      edge "e-function-result" (pref "function" "value") (pref "result" "value");
    ]
  in
  let raw =
    Raw_graph.of_lists ~nodes ~edges
      ~default_node_order:[ node_id "function"; node_id "drop" ]
  in
  match validate_with_templates [ target ] raw with
  | Ok _ -> assert false
  | Error errors ->
      assert (
        Canonical_trace.render_core_validation_errors errors
        = Canonical_trace.render_core_validation_errors errors)

let () =
  let capture = { key = Port_key.capture "n"; typ = Core_type.Nat } in
  let nodes =
    [
      node "param" (Parameter Core_type.Unit);
      node "drop-param" (Drop Core_type.Unit);
      node "capture" (Capture capture);
      node "result" (Result Core_type.Nat);
    ]
  in
  let edges =
    [
      edge "e-param-drop" (pref "param" "value") (pref "drop-param" "input");
      edge "e-capture-result" (pref "capture" "value") (pref "result" "value");
    ]
  in
  let body =
    Raw_graph.of_lists ~nodes ~edges ~default_node_order:[ node_id "drop-param" ]
    |> validate_graph
  in
  let target =
    Function_template.create ~id:(template_id "canonical-captured-template")
      ~parameter_type:Core_type.Unit ~result_type:Core_type.Nat
      ~captures:[ capture ] ~body ()
  in
  let wrong_capture = { key = capture.key; typ = Core_type.Unit } in
  let signature = function_signature target [ wrong_capture ] in
  let nodes =
    [
      node "param" (Parameter Core_type.Unit);
      node "drop" (Drop Core_type.Unit);
      node "unit-capture" Unit_literal;
      node "function" (Function signature);
      node "result" (Result (Core_type.Arrow (Core_type.Unit, Core_type.Nat)));
    ]
  in
  let edges =
    [
      edge "e-param-drop" (pref "param" "value") (pref "drop" "input");
      edge "e-unit-function" (pref "unit-capture" "value")
        { node_id = node_id "function"; port_key = capture.key };
      edge "e-function-result" (pref "function" "value") (pref "result" "value");
    ]
  in
  let raw =
    Raw_graph.of_lists ~nodes ~edges
      ~default_node_order:[ node_id "function"; node_id "drop" ]
  in
  match validate_with_templates [ target ] raw with
  | Ok _ -> assert false
  | Error errors ->
      assert (
        Canonical_trace.render_core_validation_errors errors
        = Canonical_trace.render_core_validation_errors errors)

let () =
  let target = unit_to_nat_template () in
  let template_a =
    Function_template.create ~dependencies:[ template_id "canonical-cycle-b" ]
      ~id:(template_id "canonical-cycle-a") ~parameter_type:Core_type.Unit
      ~result_type:Core_type.Nat ~captures:[] ~body:(Function_template.body target) ()
  in
  let template_b =
    Function_template.create ~dependencies:[ Function_template.id template_a ]
      ~id:(template_id "canonical-cycle-b") ~parameter_type:Core_type.Unit
      ~result_type:Core_type.Nat ~captures:[] ~body:(Function_template.body target) ()
  in
  let raw = Raw_graph.of_lists ~nodes:[] ~edges:[] ~default_node_order:[] in
  match validate_with_templates [ template_a; template_b ] raw with
  | Ok _ -> assert false
  | Error errors ->
      assert (
        Canonical_trace.render_core_validation_errors errors
        = Canonical_trace.render_core_validation_errors errors)

let () =
  let entry = unit_entry () in
  let closure_literal =
    Runtime_value.Closure
      {
        template_id = template_id "literal-closure";
        parameter_type = Core_type.Unit;
        result_type = Core_type.Unit;
        captures = [];
      }
  in
  let raw =
    P.Raw.create ~templates:[ entry ] ~entry_template_id:(Function_template.id entry)
      ~result_type:Core_type.Unit
      ~literals:[ { id = literal_id "closure"; payload = closure_literal } ]
      ()
  in
  match P.validate raw with
  | Ok _ -> assert false
  | Error errors ->
      assert (
        Canonical_trace.render_package_validation_errors errors
        = Canonical_trace.render_package_validation_errors errors)
