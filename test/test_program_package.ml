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

let unit_entry_template ?(id = "unit-entry") () =
  let nodes =
    [
      node "param" (Parameter Core_type.Unit);
      node "result" (Result Core_type.Unit);
    ]
  in
  let edges = [ edge "e-param-result" (pref "param" "value") (pref "result" "value") ] in
  let body = Raw_graph.of_lists ~nodes ~edges ~default_node_order:[] |> validate_graph in
  Function_template.create ~id:(template_id id) ~parameter_type:Core_type.Unit
    ~result_type:Core_type.Unit ~captures:[] ~body ()

let nat_entry_template ?(id = "nat-entry") ?(value = "4") () =
  let nodes =
    [
      node "param" (Parameter Core_type.Unit);
      node "drop-param" (Drop Core_type.Unit);
      node "lit" (Nat_literal (nat value));
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
  Function_template.create ~id:(template_id id) ~parameter_type:Core_type.Unit
    ~result_type:Core_type.Nat ~captures:[] ~body ()

let arrow_entry_template ?(id = "arrow-entry") result_template =
  let arrow = Core_type.Arrow (Core_type.Unit, Core_type.Nat) in
  let signature =
    {
      template_id = Function_template.id result_template;
      parameter_type = Function_template.parameter_type result_template;
      result_type = Function_template.result_type result_template;
      captures = [];
    }
  in
  let nodes =
    [
      node "param" (Parameter Core_type.Unit);
      node "drop-param" (Drop Core_type.Unit);
      node "function" (Function signature);
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
    |> validate_graph_with_templates [ result_template ]
  in
  Function_template.create ~dependencies:[ Function_template.id result_template ]
    ~id:(template_id id) ~parameter_type:Core_type.Unit ~result_type:arrow
    ~captures:[] ~body ()

let captured_nat_entry_template ?(id = "captured-nat-entry") () =
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
  Function_template.create ~id:(template_id id) ~parameter_type:Core_type.Unit
    ~result_type:Core_type.Nat ~captures:[ capture ] ~body ()

let validate_package raw =
  match P.validate raw with
  | Ok package -> package
  | Error errors ->
      failwith
        ("package validation failed: "
        ^ String.concat "; " (List.map P.validation_error_to_string errors))

let expect_validation_error predicate raw =
  match P.validate raw with
  | Ok _ -> assert false
  | Error errors -> assert (List.exists predicate errors)

let run_completed package =
  match P.run package with
  | P.Completed { value; trace } -> (value, trace)
  | P.Stuck _ | P.Run_error _ | P.Step_limit_exceeded _ -> assert false

let payload_nat_string value =
  match Runtime_value.payload value with
  | Runtime_value.Nat nat -> Nat.to_string nat
  | Runtime_value.Unit | Runtime_value.Closure _ -> assert false

let package_of_entry entry result_type =
  P.Raw.create ~templates:[ entry ] ~entry_template_id:(Function_template.id entry)
    ~result_type ()
  |> validate_package

let () =
  let entry = nat_entry_template () in
  let package = package_of_entry entry Core_type.Nat in
  assert (Function_template_id.equal (Function_template.id entry) (Function_template.id (P.entry_template package)));
  assert (Core_type.equal (P.result_type package) Core_type.Nat)

let () =
  let entry = unit_entry_template () in
  let package = package_of_entry entry Core_type.Unit in
  let value, trace = run_completed package in
  assert (Runtime_value.payload value = Runtime_value.Unit);
  assert (
    List.map (fun event -> Rewrite_event.rule_to_string event.Rewrite_event.rule) trace
    = [ "Function"; "ApplyEnter"; "ApplyReturn" ])

let () =
  let returned_template = nat_entry_template ~id:"returned-arrow-target" () in
  let entry = arrow_entry_template returned_template in
  let package =
    P.Raw.create ~templates:[ entry; returned_template ]
      ~entry_template_id:(Function_template.id entry)
      ~result_type:(Core_type.Arrow (Core_type.Unit, Core_type.Nat)) ()
    |> validate_package
  in
  let value, trace = run_completed package in
  assert (Core_type.equal (Runtime_value.typ value) (Core_type.Arrow (Core_type.Unit, Core_type.Nat)));
  assert (List.exists (fun event -> event.Rewrite_event.rule = Rewrite_event.Function) trace)

let () =
  let entry = nat_entry_template () in
  expect_validation_error
    (function P.Entry_template_missing _ -> true | _ -> false)
    (P.Raw.create ~templates:[ entry ] ~entry_template_id:(template_id "missing")
       ~result_type:Core_type.Nat ())

let () =
  let entry = nat_entry_template () in
  expect_validation_error
    (function P.Core_validation_errors errors ->
      List.exists
        (function Duplicate_function_template_id _ -> true | _ -> false)
        errors
    | _ -> false)
    (P.Raw.create ~templates:[ entry; entry ]
       ~entry_template_id:(Function_template.id entry) ~result_type:Core_type.Nat ())

let () =
  let entry = nat_entry_template () in
  expect_validation_error
    (function P.Entry_result_type_mismatch _ -> true | _ -> false)
    (P.Raw.create ~templates:[ entry ] ~entry_template_id:(Function_template.id entry)
       ~result_type:Core_type.Unit ())

let () =
  let entry = nat_entry_template () in
  expect_validation_error
    (function P.Duplicate_program_literal_id id ->
      P.Literal_id.equal id (literal_id "dup")
    | _ -> false)
    (P.Raw.create ~templates:[ entry ] ~entry_template_id:(Function_template.id entry)
       ~result_type:Core_type.Nat
       ~literals:
         [
           { id = literal_id "dup"; payload = Runtime_value.Unit };
           { id = literal_id "dup"; payload = Runtime_value.Nat (nat "1") };
         ]
       ())

let () =
  let entry = nat_entry_template () in
  let bad_entry =
    Function_template.create ~id:(template_id "bad-entry")
      ~parameter_type:Core_type.Nat ~result_type:Core_type.Nat ~captures:[]
      ~body:(Function_template.body entry) ()
  in
  expect_validation_error
    (function P.Entry_parameter_not_unit _ -> true | _ -> false)
    (P.Raw.create ~templates:[ bad_entry ]
       ~entry_template_id:(Function_template.id bad_entry) ~result_type:Core_type.Nat ())

let () =
  let valid_body = Function_template.body (unit_entry_template ()) in
  let invalid_template =
    Function_template.create ~id:(template_id "invalid-body")
      ~parameter_type:Core_type.Unit ~result_type:Core_type.Nat ~captures:[]
      ~body:valid_body ()
  in
  expect_validation_error
    (function P.Core_validation_errors errors ->
      List.exists
        (function Function_template_body_signature_mismatch _ -> true | _ -> false)
        errors
    | _ -> false)
    (P.Raw.create ~templates:[ invalid_template ]
       ~entry_template_id:(Function_template.id invalid_template)
       ~result_type:Core_type.Nat ())

let () =
  let entry = captured_nat_entry_template () in
  expect_validation_error
    (function P.Missing_entry_capture key ->
      Port_key.equal key (Port_key.capture "n")
    | _ -> false)
    (P.Raw.create ~templates:[ entry ] ~entry_template_id:(Function_template.id entry)
       ~result_type:Core_type.Nat ())

let () =
  let entry = captured_nat_entry_template () in
  expect_validation_error
    (function P.Program_literal_type_mismatch { literal_id = actual_literal_id; expected; actual } ->
      P.Literal_id.equal actual_literal_id (literal_id "n")
      && Core_type.equal expected Core_type.Nat
      && Core_type.equal actual Core_type.Unit
    | _ -> false)
    (P.Raw.create ~templates:[ entry ] ~entry_template_id:(Function_template.id entry)
       ~result_type:Core_type.Nat
       ~literals:[ { id = literal_id "n"; payload = Runtime_value.Unit } ]
       ~entry_captures:[ { capture_key = Port_key.capture "n"; literal_id = literal_id "n" } ]
       ())

let () =
  let entry = captured_nat_entry_template () in
  let package =
    P.Raw.create ~templates:[ entry ] ~entry_template_id:(Function_template.id entry)
      ~result_type:Core_type.Nat
      ~literals:[ { id = literal_id "n"; payload = Runtime_value.Nat (nat "7") } ]
      ~entry_captures:[ { capture_key = Port_key.capture "n"; literal_id = literal_id "n" } ]
      ()
    |> validate_package
  in
  let value, trace = run_completed package in
  assert (payload_nat_string value = "7");
  let function_event = List.hd trace in
  match function_event.Rewrite_event.created with
  | [ closure_value ] -> (
      match Runtime_value.payload closure_value with
      | Runtime_value.Closure closure -> (
          match closure.captures with
          | [ captured ] ->
              assert (
                Runtime_value.origin captured.Runtime_value.value
                = Runtime_value.Program_literal "n")
          | _ -> assert false)
      | _ -> assert false)
  | _ -> assert false

let () =
  let entry = nat_entry_template () in
  let package = package_of_entry entry Core_type.Nat in
  let machine =
    match P.initialize package with
    | Ok machine -> machine
    | Error _ -> assert false
  in
  assert (Runtime_value.Instance_id.equal (Engine.Machine.active_instance_id machine) Runtime_value.Instance_id.root);
  assert (
    Engine.Machine.values machine
    |> List.exists (fun value ->
           Runtime_value.origin value = Runtime_value.Execution_input
           && Runtime_value.payload value = Runtime_value.Unit));
  assert (P.result_value package machine = Error P.Result_requested_before_completion)

let () =
  let package = P.Examples.add () in
  let value, trace = run_completed package in
  assert (payload_nat_string value = "5");
  assert (List.exists (fun event -> event.Rewrite_event.rule = Rewrite_event.ApplyEnter) trace);
  assert (List.exists (fun event -> event.Rewrite_event.rule = Rewrite_event.NatRecStart) trace);
  let predecessors =
    trace
    |> List.filter (fun event -> event.Rewrite_event.rule = Rewrite_event.NatRecUnfold)
    |> List.map (fun event ->
           match event.Rewrite_event.created with
           | [ value ] -> payload_nat_string value
           | _ -> assert false)
  in
  assert (predecessors = [ "0"; "1"; "2" ]);
  let _, trace_again = run_completed package in
  assert (List.map Rewrite_event.to_string trace = List.map Rewrite_event.to_string trace_again)

let () =
  let package = P.Examples.multiply () in
  let value, trace = run_completed package in
  assert (payload_nat_string value = "6");
  let natrec_starts =
    trace
    |> List.filter (fun event -> event.Rewrite_event.rule = Rewrite_event.NatRecStart)
  in
  assert (List.length natrec_starts > 1);
  let _, trace_again = run_completed package in
  assert (List.map Rewrite_event.to_string trace = List.map Rewrite_event.to_string trace_again)

let () =
  let package = P.Examples.add () in
  let limit = nat "0" in
  match P.run ~step_limit:limit package with
  | P.Step_limit_exceeded { limit = actual_limit; executed_steps; trace } ->
      assert (Nat.equal actual_limit limit);
      assert (Nat.equal executed_steps Nat.zero);
      assert (trace = [])
  | _ -> assert false
