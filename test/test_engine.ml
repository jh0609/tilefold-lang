open Tilefold
open Core_graph

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

let nat value =
  match Nat.of_string value with
  | Ok nat -> nat
  | Error _ -> assert false

let node id kind = { id = node_id id; kind }
let pref node port = { node_id = node_id node; port_key = port_key port }
let edge id source target = { id = edge_id id; source; target }

let validate_ok raw =
  match validate raw with
  | Ok graph -> graph
  | Error errors ->
      failwith
        ("validation failed: "
        ^ String.concat "; " (List.map validation_error_to_string errors))

let init_ok graph input =
  match Engine.initialize graph ~input with
  | Ok machine -> machine
  | Error error -> failwith (Engine.initialization_error_to_string error)

let run_completed machine =
  match Engine.run machine with
  | Engine.Run_completed { value; trace } -> (value, trace)
  | Engine.Run_stuck _ -> assert false
  | Engine.Run_error _ -> assert false

let payload_nat_string value =
  match Runtime_value.payload value with
  | Runtime_value.Nat nat -> Nat.to_string nat
  | Runtime_value.Unit | Runtime_value.Closure _ -> assert false

let entry_unit_to_nat ?(order = [ "succ"; "drop" ]) ?(literal = "3") () =
  let nodes =
    [
      node "param" (Parameter Core_type.Unit);
      node "drop" (Drop Core_type.Unit);
      node "lit" (Nat_literal (nat literal));
      node "succ" Succ;
      node "result" (Result Core_type.Nat);
    ]
  in
  let edges =
    [
      edge "e-param-drop" (pref "param" "value") (pref "drop" "input");
      edge "e-lit-succ" (pref "lit" "value") (pref "succ" "input");
      edge "e-succ-result" (pref "succ" "result") (pref "result" "value");
    ]
  in
  Raw_graph.of_lists ~nodes ~edges
    ~default_node_order:(List.map node_id order)
  |> validate_ok

let direct_unit_to_unit () =
  let nodes =
    [
      node "param" (Parameter Core_type.Unit);
      node "result" (Result Core_type.Unit);
    ]
  in
  let edges = [ edge "e-param-result" (pref "param" "value") (pref "result" "value") ] in
  Raw_graph.of_lists ~nodes ~edges ~default_node_order:[] |> validate_ok

let direct_nat_to_nat () =
  let nodes =
    [
      node "param" (Parameter Core_type.Nat);
      node "result" (Result Core_type.Nat);
    ]
  in
  let edges = [ edge "e-param-result" (pref "param" "value") (pref "result" "value") ] in
  Raw_graph.of_lists ~nodes ~edges ~default_node_order:[] |> validate_ok

let arrow_input_graph () =
  let typ = Core_type.Arrow (Core_type.Unit, Core_type.Nat) in
  let nodes = [ node "param" (Parameter typ); node "result" (Result typ) ] in
  let edges = [ edge "e-param-result" (pref "param" "value") (pref "result" "value") ] in
  Raw_graph.of_lists ~nodes ~edges ~default_node_order:[] |> validate_ok

let result_before_cleanup () =
  let nodes =
    [
      node "param" (Parameter Core_type.Unit);
      node "lit" Unit_literal;
      node "drop" (Drop Core_type.Unit);
      node "result" (Result Core_type.Unit);
    ]
  in
  let edges =
    [
      edge "e-param-result" (pref "param" "value") (pref "result" "value");
      edge "e-lit-drop" (pref "lit" "value") (pref "drop" "input");
    ]
  in
  Raw_graph.of_lists ~nodes ~edges ~default_node_order:[ node_id "drop" ]
  |> validate_ok

let stuck_cycle () =
  let nodes =
    [
      node "param" (Parameter Core_type.Unit);
      node "succ" Succ;
      node "result" (Result Core_type.Unit);
    ]
  in
  let edges =
    [
      edge "e-param-result" (pref "param" "value") (pref "result" "value");
      edge "e-succ-cycle" (pref "succ" "result") (pref "succ" "input");
    ]
  in
  Raw_graph.of_lists ~nodes ~edges ~default_node_order:[ node_id "succ" ]
  |> validate_ok

let copy_nat_graph ?(order = [ "copy"; "succ"; "drop" ]) ?priority_spine
    ?(edges =
      [
        edge "e-param-copy" (pref "param" "value") (pref "copy" "input");
        edge "e-copy-left-succ" (pref "copy" "left") (pref "succ" "input");
        edge "e-succ-result" (pref "succ" "result") (pref "result" "value");
        edge "e-copy-right-drop" (pref "copy" "right") (pref "drop" "input");
      ])
    ?(param_type = Core_type.Nat) ?(result_type = Core_type.Nat) () =
  let nodes =
    [
      node "param" (Parameter param_type);
      node "copy" (Copy param_type);
      node "succ" Succ;
      node "drop" (Drop param_type);
      node "result" (Result result_type);
    ]
  in
  Raw_graph.of_lists_with_priority_spine ~nodes ~edges
    ~default_node_order:(List.map node_id order)
    ~priority_spine:(Option.map (List.map node_id) priority_spine)
  |> validate_ok

let priority_epoch_overtake_graph () =
  let nodes =
    [
      node "param" (Parameter Core_type.Unit);
      node "ordinary" (Drop Core_type.Unit);
      node "lit" (Nat_literal (nat "3"));
      node "copy" (Copy Core_type.Nat);
      node "preferred" Succ;
      node "cleanup" (Drop Core_type.Nat);
      node "result" (Result Core_type.Nat);
    ]
  in
  let edges =
    [
      edge "e-param-ordinary" (pref "param" "value") (pref "ordinary" "input");
      edge "e-lit-copy" (pref "lit" "value") (pref "copy" "input");
      edge "e-copy-left-preferred" (pref "copy" "left") (pref "preferred" "input");
      edge "e-preferred-result" (pref "preferred" "result") (pref "result" "value");
      edge "e-copy-right-cleanup" (pref "copy" "right") (pref "cleanup" "input");
    ]
  in
  Raw_graph.of_lists_with_priority_spine ~nodes ~edges
    ~default_node_order:
      [ node_id "copy"; node_id "ordinary"; node_id "preferred"; node_id "cleanup" ]
    ~priority_spine:(Some [ node_id "preferred" ])
  |> validate_ok

let multi_same_epoch_graph ?(priority_spine = [ "preferred-a"; "preferred-b" ])
    () =
  let nodes =
    [
      node "param" (Parameter Core_type.Unit);
      node "ordinary-a" (Drop Core_type.Unit);
      node "lit-ordinary-b" (Nat_literal (nat "10"));
      node "ordinary-b" (Drop Core_type.Nat);
      node "lit-preferred-a" (Nat_literal (nat "3"));
      node "preferred-a" Succ;
      node "lit-preferred-b" (Nat_literal (nat "4"));
      node "preferred-b" Succ;
      node "post-drop" (Drop Core_type.Nat);
      node "result" (Result Core_type.Nat);
    ]
  in
  let edges =
    [
      edge "e-param-ordinary-a" (pref "param" "value") (pref "ordinary-a" "input");
      edge "e-lit-ordinary-b" (pref "lit-ordinary-b" "value") (pref "ordinary-b" "input");
      edge "e-lit-preferred-a" (pref "lit-preferred-a" "value") (pref "preferred-a" "input");
      edge "e-preferred-a-result" (pref "preferred-a" "result") (pref "result" "value");
      edge "e-lit-preferred-b" (pref "lit-preferred-b" "value") (pref "preferred-b" "input");
      edge "e-preferred-b-post-drop" (pref "preferred-b" "result") (pref "post-drop" "input");
    ]
  in
  Raw_graph.of_lists_with_priority_spine ~nodes ~edges
    ~default_node_order:
      [
        node_id "ordinary-b";
        node_id "preferred-b";
        node_id "ordinary-a";
        node_id "preferred-a";
        node_id "post-drop";
      ]
    ~priority_spine:(Some (List.map node_id priority_spine))
  |> validate_ok

let copy_unit_graph () =
  let nodes =
    [
      node "param" (Parameter Core_type.Unit);
      node "copy" (Copy Core_type.Unit);
      node "drop" (Drop Core_type.Unit);
      node "result" (Result Core_type.Unit);
    ]
  in
  let edges =
    [
      edge "e-param-copy" (pref "param" "value") (pref "copy" "input");
      edge "e-copy-left-drop" (pref "copy" "left") (pref "drop" "input");
      edge "e-copy-right-result" (pref "copy" "right") (pref "result" "value");
    ]
  in
  Raw_graph.of_lists ~nodes ~edges
    ~default_node_order:[ node_id "copy"; node_id "drop" ]
  |> validate_ok

let copy_arrow_graph () =
  let arrow = Core_type.Arrow (Core_type.Unit, Core_type.Nat) in
  let nodes =
    [
      node "param" (Parameter arrow);
      node "copy" (Copy arrow);
      node "drop" (Drop arrow);
      node "result" (Result arrow);
    ]
  in
  let edges =
    [
      edge "e-param-copy" (pref "param" "value") (pref "copy" "input");
      edge "e-copy-left-drop" (pref "copy" "left") (pref "drop" "input");
      edge "e-copy-right-result" (pref "copy" "right") (pref "result" "value");
    ]
  in
  Raw_graph.of_lists ~nodes ~edges
    ~default_node_order:[ node_id "copy"; node_id "drop" ]
  |> validate_ok

let template_id value =
  match Function_template_id.of_string value with
  | Ok id -> id
  | Error message -> failwith message

let capture name typ = { key = Port_key.capture name; typ }

let validate_with_templates_ok templates raw =
  match validate_with_templates templates raw with
  | Ok graph -> graph
  | Error errors ->
      failwith
        ("validation failed: "
        ^ String.concat "; " (List.map validation_error_to_string errors))

let init_with_templates_ok templates graph input =
  match Engine.initialize_with_templates templates graph ~input with
  | Ok machine -> machine
  | Error error -> failwith (Engine.initialization_error_to_string error)

let function_template ?(id = "f") ?(captures = []) () =
  let nodes =
    [
      node "body-param" (Parameter Core_type.Unit);
      node "body-drop" (Drop Core_type.Unit);
      node "body-lit" (Nat_literal (nat "7"));
      node "body-result" (Result Core_type.Nat);
    ]
  in
  let edges =
    [
      edge "body-e-param-drop" (pref "body-param" "value") (pref "body-drop" "input");
      edge "body-e-lit-result" (pref "body-lit" "value") (pref "body-result" "value");
    ]
  in
  let body =
    Raw_graph.of_lists ~nodes ~edges ~default_node_order:[ node_id "body-drop" ]
    |> validate_ok
  in
  Function_template.create ~id:(template_id id) ~parameter_type:Core_type.Unit
    ~result_type:Core_type.Nat ~captures ~body ()

let function_signature template captures =
  {
    template_id = Function_template.id template;
    parameter_type = Function_template.parameter_type template;
    result_type = Function_template.result_type template;
    captures;
  }

let function_no_capture_graph ?(function_id = "function") ?(result_arrow = true)
    ?(order = [ function_id; "drop" ]) () =
  let template = function_template () in
  let arrow = Core_type.Arrow (Core_type.Unit, Core_type.Nat) in
  let nodes =
    [
      node "param" (Parameter Core_type.Unit);
      node "drop" (Drop Core_type.Unit);
      node function_id (Function (function_signature template []));
      node "result" (Result (if result_arrow then arrow else Core_type.Unit));
    ]
  in
  let edges =
    [
      edge "e-param-drop" (pref "param" "value") (pref "drop" "input");
      edge "e-function-result" (pref function_id "value") (pref "result" "value");
    ]
  in
  ( template,
    Raw_graph.of_lists ~nodes ~edges ~default_node_order:(List.map node_id order)
    |> validate_with_templates_ok [ template ] )

let function_capture_graph ?(reversed_edges = false) () =
  let captures = [ capture "n" Core_type.Nat ] in
  let template = function_template ~captures () in
  let arrow = Core_type.Arrow (Core_type.Unit, Core_type.Nat) in
  let nodes =
    [
      node "param" (Parameter Core_type.Unit);
      node "drop" (Drop Core_type.Unit);
      node "capture-lit" (Nat_literal (nat "5"));
      node "function" (Function (function_signature template captures));
      node "result" (Result arrow);
    ]
  in
  let edges =
    [
      edge "e-param-drop" (pref "param" "value") (pref "drop" "input");
      edge "e-capture" (pref "capture-lit" "value")
        { node_id = node_id "function"; port_key = Port_key.capture "n" };
      edge "e-function-result" (pref "function" "value") (pref "result" "value");
    ]
  in
  let edges = if reversed_edges then List.rev edges else edges in
  ( template,
    Raw_graph.of_lists ~nodes ~edges
      ~default_node_order:[ node_id "function"; node_id "drop" ]
    |> validate_with_templates_ok [ template ] )

let delayed_capture_graph () =
  let captures = [ capture "n" Core_type.Nat ] in
  let template = function_template ~captures () in
  let arrow = Core_type.Arrow (Core_type.Unit, Core_type.Nat) in
  let nodes =
    [
      node "param" (Parameter Core_type.Unit);
      node "drop-unit" (Drop Core_type.Unit);
      node "lit" (Nat_literal (nat "5"));
      node "copy" (Copy Core_type.Nat);
      node "drop-nat" (Drop Core_type.Nat);
      node "function" (Function (function_signature template captures));
      node "result" (Result arrow);
    ]
  in
  let edges =
    [
      edge "e-param-drop" (pref "param" "value") (pref "drop-unit" "input");
      edge "e-lit-copy" (pref "lit" "value") (pref "copy" "input");
      edge "e-copy-left-function" (pref "copy" "left")
        { node_id = node_id "function"; port_key = Port_key.capture "n" };
      edge "e-copy-right-drop" (pref "copy" "right") (pref "drop-nat" "input");
      edge "e-function-result" (pref "function" "value") (pref "result" "value");
    ]
  in
  ( template,
    Raw_graph.of_lists ~nodes ~edges
      ~default_node_order:
        [ node_id "copy"; node_id "function"; node_id "drop-unit"; node_id "drop-nat" ]
    |> validate_with_templates_ok [ template ] )

let closure_copy_drop_graph ?(copy_order = [ "function"; "copy"; "drop-left"; "drop-right"; "drop-unit" ])
    () =
  let template = function_template () in
  let arrow = Core_type.Arrow (Core_type.Unit, Core_type.Nat) in
  let nodes =
    [
      node "param" (Parameter Core_type.Unit);
      node "drop-unit" (Drop Core_type.Unit);
      node "unit-result" Unit_literal;
      node "function" (Function (function_signature template []));
      node "copy" (Copy arrow);
      node "drop-left" (Drop arrow);
      node "drop-right" (Drop arrow);
      node "result" (Result Core_type.Unit);
    ]
  in
  let edges =
    [
      edge "e-param-drop" (pref "param" "value") (pref "drop-unit" "input");
      edge "e-unit-result" (pref "unit-result" "value") (pref "result" "value");
      edge "e-function-copy" (pref "function" "value") (pref "copy" "input");
      edge "e-copy-left-drop" (pref "copy" "left") (pref "drop-left" "input");
      edge "e-copy-right-drop" (pref "copy" "right") (pref "drop-right" "input");
    ]
  in
  ( template,
    Raw_graph.of_lists ~nodes ~edges
      ~default_node_order:(List.map node_id copy_order)
    |> validate_with_templates_ok [ template ] )

let closure_drop_graph () =
  let template = function_template () in
  let arrow = Core_type.Arrow (Core_type.Unit, Core_type.Nat) in
  let nodes =
    [
      node "param" (Parameter Core_type.Unit);
      node "drop-unit" (Drop Core_type.Unit);
      node "unit-result" Unit_literal;
      node "function" (Function (function_signature template []));
      node "drop-closure" (Drop arrow);
      node "result" (Result Core_type.Unit);
    ]
  in
  let edges =
    [
      edge "e-param-drop" (pref "param" "value") (pref "drop-unit" "input");
      edge "e-unit-result" (pref "unit-result" "value") (pref "result" "value");
      edge "e-function-drop" (pref "function" "value") (pref "drop-closure" "input");
    ]
  in
  ( template,
    Raw_graph.of_lists ~nodes ~edges
      ~default_node_order:[ node_id "function"; node_id "drop-closure"; node_id "drop-unit" ]
    |> validate_with_templates_ok [ template ] )

let stuck_copy_self_cycle () =
  let nodes =
    [
      node "param" (Parameter Core_type.Unit);
      node "drop-unit" (Drop Core_type.Unit);
      node "copy" (Copy Core_type.Nat);
      node "result" (Result Core_type.Nat);
    ]
  in
  let edges =
    [
      edge "e-param-drop" (pref "param" "value") (pref "drop-unit" "input");
      edge "e-copy-left-cycle" (pref "copy" "left") (pref "copy" "input");
      edge "e-copy-right-result" (pref "copy" "right") (pref "result" "value");
    ]
  in
  Raw_graph.of_lists ~nodes ~edges
    ~default_node_order:[ node_id "copy"; node_id "drop-unit" ]
  |> validate_ok

let assert_rules expected trace =
  assert (List.map (fun event -> Rewrite_event.rule_to_string event.Rewrite_event.rule) trace = expected)

let assert_subjects expected trace =
  assert (
    List.map (fun event -> Node_id.to_string event.Rewrite_event.subject) trace
    = expected)

let assert_indexes expected trace =
  assert (List.map (fun event -> event.Rewrite_event.index) trace = expected)

let assert_epochs expected trace =
  assert (List.map (fun event -> event.Rewrite_event.ready_epoch) trace = expected)

let rec step_trace machine =
  match Engine.step machine with
  | Engine.Completed _ -> []
  | Engine.Stuck _ | Engine.Runtime_error _ -> assert false
  | Engine.Rewritten { machine; event } -> event :: step_trace machine

let () =
  let graph = entry_unit_to_nat () in
  let machine = init_ok graph Runtime_value.Unit in
  assert (
    List.map (fun c -> Node_id.to_string c.Engine.node_id) (Engine.Machine.ready_candidates machine)
    = [ "succ"; "drop" ]);
  let initial_values = Engine.Machine.values machine in
  assert (
    List.exists
      (fun value -> Runtime_value.origin value = Runtime_value.Execution_input)
      initial_values);
  assert (
    List.exists
      (fun value ->
        Runtime_value.origin value = Runtime_value.Program_literal (node_id "lit"))
      initial_values);
  let value, trace = run_completed machine in
  assert (payload_nat_string value = "4");
  assert_rules [ "Succ"; "Drop" ] trace;
  assert_subjects [ "succ"; "drop" ] trace;
  assert_indexes [ 0; 1 ] trace;
  assert_epochs [ 0; 0 ] trace;
  assert (List.length trace = 2);
  let first = List.hd trace in
  assert (
    List.map Runtime_value.Value_id.to_string first.Rewrite_event.consumed
    = [ "literal:lit" ]);
  assert (List.length first.Rewrite_event.created = 1);
  assert (
    Runtime_value.origin (List.hd first.Rewrite_event.created)
    = Runtime_value.Rewrite_output
        { event_index = 0; node_id = node_id "succ"; port_key = Port_key.result })

let () =
  let graph = entry_unit_to_nat ~order:[ "drop"; "succ" ] () in
  let value, trace = run_completed (init_ok graph Runtime_value.Unit) in
  assert (payload_nat_string value = "4");
  assert_rules [ "Drop"; "Succ" ] trace;
  assert_subjects [ "drop"; "succ" ] trace

let () =
  let graph = entry_unit_to_nat () in
  let machine0 = init_ok graph Runtime_value.Unit in
  match Engine.step machine0 with
  | Engine.Rewritten { machine = machine1; event = event0 } -> (
      assert (Rewrite_event.rule_to_string event0.Rewrite_event.rule = "Succ");
      assert (Engine.Machine.trace_events machine0 = []);
      assert (List.length (Engine.Machine.ready_candidates machine0) = 2);
      match Engine.step machine1 with
      | Engine.Rewritten { machine = machine2; event = event1 } -> (
          assert (Rewrite_event.rule_to_string event1.Rewrite_event.rule = "Drop");
          match Engine.step machine2 with
          | Engine.Completed value -> assert (payload_nat_string value = "4")
          | _ -> assert false)
      | _ -> assert false)
  | _ -> assert false

let () =
  let machine = init_ok (direct_unit_to_unit ()) Runtime_value.Unit in
  assert (Engine.Machine.trace_events machine = []);
  match Engine.step machine with
  | Engine.Completed value -> assert (Runtime_value.payload value = Runtime_value.Unit)
  | _ -> assert false

let () =
  let machine = init_ok (result_before_cleanup ()) Runtime_value.Unit in
  assert (Option.is_some (Engine.Machine.result_value machine));
  match Engine.step machine with
  | Engine.Rewritten { machine; event } -> (
      assert (Rewrite_event.rule_to_string event.Rewrite_event.rule = "Drop");
      match Engine.step machine with
      | Engine.Completed value -> assert (Runtime_value.payload value = Runtime_value.Unit)
      | _ -> assert false)
  | _ -> assert false

let () =
  match Engine.initialize (direct_unit_to_unit ()) ~input:(Runtime_value.Nat (nat "0")) with
  | Error (Engine.Input_type_mismatch { expected = Core_type.Unit; actual = Core_type.Nat }) ->
      ()
  | _ -> assert false

let () =
  let machine = init_ok (direct_nat_to_nat ()) (Runtime_value.Nat (nat "5")) in
  match Engine.step machine with
  | Engine.Completed value -> assert (payload_nat_string value = "5")
  | _ -> assert false

let () =
  match Engine.initialize (arrow_input_graph ()) ~input:Runtime_value.Unit with
  | Error (Engine.Unsupported_runtime_input_type (Core_type.Arrow (Core_type.Unit, Core_type.Nat))) ->
      ()
  | _ -> assert false

let () =
  let machine = init_ok (stuck_cycle ()) Runtime_value.Unit in
  (match Engine.step machine with
  | Engine.Stuck reason ->
      assert (List.map Node_id.to_string reason.Engine.unexecuted_nodes = [ "succ" ]);
      assert (reason.Engine.result_missing = false)
  | _ -> assert false);
  match Engine.run machine with
  | Engine.Run_stuck { reason; trace } ->
      assert (trace = []);
      assert (List.map Node_id.to_string reason.Engine.unexecuted_nodes = [ "succ" ])
  | _ -> assert false

let () =
  let graph = entry_unit_to_nat () in
  let value_a, trace_a = run_completed (init_ok graph Runtime_value.Unit) in
  let value_b, trace_b = run_completed (init_ok graph Runtime_value.Unit) in
  assert (Runtime_value.equal value_a value_b);
  assert (
    List.map Rewrite_event.to_string trace_a
    = List.map Rewrite_event.to_string trace_b)

let () =
  let max_int_nat = string_of_int max_int in
  let graph = entry_unit_to_nat ~literal:max_int_nat () in
  let value, _trace = run_completed (init_ok graph Runtime_value.Unit) in
  assert (payload_nat_string value = Z.to_string (Z.succ (Z.of_string max_int_nat)))

let () =
  let machine = init_ok (copy_nat_graph ()) (Runtime_value.Nat (nat "3")) in
  match Engine.step machine with
  | Engine.Rewritten { machine; event } ->
      assert (Rewrite_event.rule_to_string event.Rewrite_event.rule = "Copy");
      assert (event.Rewrite_event.ready_epoch = 0);
      assert (
        List.map Runtime_value.Value_id.to_string event.Rewrite_event.consumed
        = [ "input" ]);
      assert (List.length event.Rewrite_event.created = 2);
      let left = List.nth event.Rewrite_event.created 0 in
      let right = List.nth event.Rewrite_event.created 1 in
      assert (Runtime_value.payload_equal (Runtime_value.payload left) (Runtime_value.Nat (nat "3")));
      assert (Runtime_value.payload_equal (Runtime_value.payload right) (Runtime_value.Nat (nat "3")));
      assert (not (Runtime_value.Value_id.equal (Runtime_value.id left) (Runtime_value.id right)));
      assert (not (Runtime_value.Value_id.equal (Runtime_value.id left) Runtime_value.execution_input_id));
      assert (not (Runtime_value.Value_id.equal (Runtime_value.id right) Runtime_value.execution_input_id));
      assert (
        Runtime_value.origin left
        = Runtime_value.Rewrite_output
            { event_index = 0; node_id = node_id "copy"; port_key = Port_key.left });
      assert (
        Runtime_value.origin right
        = Runtime_value.Rewrite_output
            { event_index = 0; node_id = node_id "copy"; port_key = Port_key.right });
      assert (
        List.map
          (fun candidate ->
            (Node_id.to_string candidate.Engine.node_id, candidate.Engine.ready_epoch))
          (Engine.Machine.ready_candidates machine)
        = [ ("succ", 1); ("drop", 1) ])
  | _ -> assert false

let () =
  let value, trace = run_completed (init_ok (copy_nat_graph ()) (Runtime_value.Nat (nat "3"))) in
  assert (payload_nat_string value = "4");
  assert_rules [ "Copy"; "Succ"; "Drop" ] trace;
  assert_subjects [ "copy"; "succ"; "drop" ] trace;
  assert_indexes [ 0; 1; 2 ] trace;
  assert_epochs [ 0; 1; 1 ] trace

let () =
  let value, trace =
    run_completed
      (init_ok (copy_nat_graph ~order:[ "copy"; "drop"; "succ" ] ())
         (Runtime_value.Nat (nat "3")))
  in
  assert (payload_nat_string value = "4");
  assert_rules [ "Copy"; "Drop"; "Succ" ] trace;
  assert_epochs [ 0; 1; 1 ] trace

let () =
  let value, trace = run_completed (init_ok (copy_unit_graph ()) Runtime_value.Unit) in
  assert (Runtime_value.payload value = Runtime_value.Unit);
  assert_rules [ "Copy"; "Drop" ] trace;
  let copy_event = List.hd trace in
  assert (List.length copy_event.Rewrite_event.created = 2);
  assert (
    List.map
      (fun value ->
        match Runtime_value.payload value with
        | Runtime_value.Unit -> "Unit"
        | Runtime_value.Nat _ -> "Nat"
        | Runtime_value.Closure _ -> "Closure")
      copy_event.Rewrite_event.created
    = [ "Unit"; "Unit" ])

let () =
  (match Engine.initialize (copy_arrow_graph ()) ~input:Runtime_value.Unit with
  | Error (Engine.Unsupported_runtime_input_type (Core_type.Arrow (Core_type.Unit, Core_type.Nat))) ->
      ()
  | _ -> assert false);
  assert (true)

let () =
  let reversed_edges =
    [
      edge "e-copy-right-drop" (pref "copy" "right") (pref "drop" "input");
      edge "e-succ-result" (pref "succ" "result") (pref "result" "value");
      edge "e-copy-left-succ" (pref "copy" "left") (pref "succ" "input");
      edge "e-param-copy" (pref "param" "value") (pref "copy" "input");
    ]
  in
  let value, trace =
    run_completed
      (init_ok (copy_nat_graph ~edges:reversed_edges ()) (Runtime_value.Nat (nat "3")))
  in
  assert (payload_nat_string value = "4");
  let copy_event = List.hd trace in
  assert (
    List.map
      (fun value ->
        match Runtime_value.origin value with
        | Runtime_value.Rewrite_output { port_key; _ } -> Port_key.to_string port_key
        | _ -> assert false)
      copy_event.Rewrite_event.created
    = [ "left"; "right" ])

let () =
  let graph = copy_nat_graph () in
  let value_a, trace_a = run_completed (init_ok graph (Runtime_value.Nat (nat "3"))) in
  let value_b, trace_b = run_completed (init_ok graph (Runtime_value.Nat (nat "3"))) in
  assert (Runtime_value.equal value_a value_b);
  assert (List.map Rewrite_event.to_string trace_a = List.map Rewrite_event.to_string trace_b);
  assert (
    List.map
      (fun event ->
        List.map Runtime_value.to_string event.Rewrite_event.created)
      trace_a
    =
    List.map
      (fun event ->
        List.map Runtime_value.to_string event.Rewrite_event.created)
      trace_b)

let () =
  let max_int_nat = string_of_int max_int in
  let value, trace =
    run_completed
      (init_ok (copy_nat_graph ()) (Runtime_value.Nat (nat max_int_nat)))
  in
  assert (payload_nat_string value = Z.to_string (Z.succ (Z.of_string max_int_nat)));
  let copy_event = List.hd trace in
  assert (
    List.for_all
      (fun value -> Runtime_value.payload_equal (Runtime_value.payload value) (Runtime_value.Nat (nat max_int_nat)))
      copy_event.Rewrite_event.created)

let () =
  let machine = init_ok (stuck_copy_self_cycle ()) Runtime_value.Unit in
  match Engine.run machine with
  | Engine.Run_stuck { reason; trace } ->
      assert_rules [ "Drop" ] trace;
      assert (List.map Node_id.to_string reason.Engine.unexecuted_nodes = [ "copy" ]);
      assert (reason.Engine.result_missing = true)
  | _ -> assert false

let () =
  let value, trace =
    run_completed
      (init_ok
         (copy_nat_graph ~order:[ "copy"; "drop"; "succ" ]
            ~priority_spine:[ "succ" ] ())
         (Runtime_value.Nat (nat "3")))
  in
  assert (payload_nat_string value = "4");
  assert_rules [ "Copy"; "Succ"; "Drop" ] trace;
  assert_subjects [ "copy"; "succ"; "drop" ] trace;
  assert_epochs [ 0; 1; 1 ] trace;
  let copy_event = List.hd trace in
  assert (
    List.map
      (fun value ->
        match Runtime_value.origin value with
        | Runtime_value.Rewrite_output { port_key; _ } -> Port_key.to_string port_key
        | _ -> assert false)
      copy_event.Rewrite_event.created
    = [ "left"; "right" ])

let () =
  let value, trace =
    run_completed
      (init_ok (copy_nat_graph ~order:[ "copy"; "drop"; "succ" ] ())
         (Runtime_value.Nat (nat "3")))
  in
  assert (payload_nat_string value = "4");
  assert_rules [ "Copy"; "Drop"; "Succ" ] trace;
  assert_epochs [ 0; 1; 1 ] trace

let () =
  let value, trace =
    run_completed
      (init_ok
         (copy_nat_graph ~order:[ "copy"; "drop"; "succ" ] ~priority_spine:[] ())
         (Runtime_value.Nat (nat "3")))
  in
  assert (payload_nat_string value = "4");
  assert_rules [ "Copy"; "Drop"; "Succ" ] trace

let () =
  let value, trace =
    run_completed (init_ok (priority_epoch_overtake_graph ()) Runtime_value.Unit)
  in
  assert (payload_nat_string value = "4");
  assert_rules [ "Copy"; "Drop"; "Succ"; "Drop" ] trace;
  assert_subjects [ "copy"; "ordinary"; "preferred"; "cleanup" ] trace;
  assert_epochs [ 0; 0; 1; 1 ] trace

let () =
  let value, trace =
    run_completed (init_ok (multi_same_epoch_graph ()) Runtime_value.Unit)
  in
  assert (payload_nat_string value = "4");
  assert_subjects
    [ "preferred-a"; "preferred-b"; "ordinary-b"; "ordinary-a"; "post-drop" ]
    trace;
  assert_rules [ "Succ"; "Succ"; "Drop"; "Drop"; "Drop" ] trace;
  assert_epochs [ 0; 0; 0; 0; 2 ] trace

let () =
  let value, trace =
    run_completed
      (init_ok
         (multi_same_epoch_graph ~priority_spine:[ "preferred-b"; "preferred-a" ] ())
         Runtime_value.Unit)
  in
  assert (payload_nat_string value = "4");
  assert_subjects
    [ "preferred-b"; "preferred-a"; "ordinary-b"; "ordinary-a"; "post-drop" ]
    trace

let () =
  let graph =
    copy_nat_graph ~order:[ "copy"; "drop"; "succ" ] ~priority_spine:[ "succ" ]
      ()
  in
  let run_value, run_trace =
    run_completed (init_ok graph (Runtime_value.Nat (nat "3")))
  in
  let stepped_trace = step_trace (init_ok graph (Runtime_value.Nat (nat "3"))) in
  assert (payload_nat_string run_value = "4");
  assert (
    List.map Rewrite_event.to_string stepped_trace
    = List.map Rewrite_event.to_string run_trace)

let () =
  let graph =
    copy_nat_graph ~order:[ "copy"; "drop"; "succ" ] ~priority_spine:[ "succ" ]
      ()
  in
  let value_a, trace_a = run_completed (init_ok graph (Runtime_value.Nat (nat "3"))) in
  let value_b, trace_b = run_completed (init_ok graph (Runtime_value.Nat (nat "3"))) in
  assert (Runtime_value.equal value_a value_b);
  assert (List.map Rewrite_event.to_string trace_a = List.map Rewrite_event.to_string trace_b)

let () =
  let reversed_edges =
    [
      edge "e-copy-right-drop" (pref "copy" "right") (pref "drop" "input");
      edge "e-succ-result" (pref "succ" "result") (pref "result" "value");
      edge "e-copy-left-succ" (pref "copy" "left") (pref "succ" "input");
      edge "e-param-copy" (pref "param" "value") (pref "copy" "input");
    ]
  in
  let value, trace =
    run_completed
      (init_ok
         (copy_nat_graph ~order:[ "copy"; "drop"; "succ" ]
            ~priority_spine:[ "succ" ] ~edges:reversed_edges ())
         (Runtime_value.Nat (nat "3")))
  in
  assert (payload_nat_string value = "4");
  assert_subjects [ "copy"; "succ"; "drop" ] trace

let () =
  let machine =
    init_ok
      (copy_nat_graph ~order:[ "copy"; "drop"; "succ" ]
         ~priority_spine:[ "succ" ] ())
      (Runtime_value.Nat (nat "3"))
  in
  match Engine.step machine with
  | Engine.Rewritten { machine; event } -> (
      assert (Rewrite_event.rule_to_string event.Rewrite_event.rule = "Copy");
      assert (List.length event.Rewrite_event.consumed = 1);
      assert (List.length event.Rewrite_event.created = 2);
      assert (
        List.map
          (fun value ->
            match Runtime_value.origin value with
            | Runtime_value.Rewrite_output { port_key; _ } ->
                Port_key.to_string port_key
            | _ -> assert false)
          event.Rewrite_event.created
        = [ "left"; "right" ]);
      match Engine.step machine with
      | Engine.Rewritten { event = event1; _ } ->
          assert (Node_id.to_string event1.Rewrite_event.subject = "succ")
      | _ -> assert false)
  | _ -> assert false

let closure_of_value value =
  match Runtime_value.payload value with
  | Runtime_value.Closure closure -> closure
  | Runtime_value.Unit | Runtime_value.Nat _ -> assert false

let () =
  let template, graph = function_no_capture_graph () in
  let machine = init_with_templates_ok [ template ] graph Runtime_value.Unit in
  assert (
    List.map (fun c -> Node_id.to_string c.Engine.node_id)
      (Engine.Machine.ready_candidates machine)
    = [ "function"; "drop" ]);
  match Engine.step machine with
  | Engine.Rewritten { event; _ } ->
      assert (Rewrite_event.rule_to_string event.Rewrite_event.rule = "Function");
      assert (Node_id.to_string event.Rewrite_event.subject = "function");
      assert (event.Rewrite_event.ready_epoch = 0);
      assert (event.Rewrite_event.consumed = []);
      assert (List.length event.Rewrite_event.created = 1);
      let closure_value = List.hd event.Rewrite_event.created in
      let closure = closure_of_value closure_value in
      assert (
        Function_template_id.equal closure.Runtime_value.template_id
          (Function_template.id template));
      assert (
        Core_type.equal (Runtime_value.typ closure_value)
          (Core_type.Arrow (Core_type.Unit, Core_type.Nat)));
      assert (closure.captures = [])
  | _ -> assert false

let () =
  let template, graph = function_capture_graph () in
  let value, trace =
    run_completed (init_with_templates_ok [ template ] graph Runtime_value.Unit)
  in
  let closure = closure_of_value value in
  assert (List.length closure.Runtime_value.captures = 1);
  let function_event = List.hd trace in
  assert (Rewrite_event.rule_to_string function_event.Rewrite_event.rule = "Function");
  assert (
    List.map Runtime_value.Value_id.to_string function_event.Rewrite_event.consumed
    = [ "literal:capture-lit" ]);
  let captured = List.hd closure.Runtime_value.captures in
  assert (Port_key.to_string captured.capture_key = "capture:n");
  assert (
    Runtime_value.Value_id.to_string (Runtime_value.id captured.value)
    = "literal:capture-lit");
  assert (
    Runtime_value.origin captured.value
    = Runtime_value.Program_literal (node_id "capture-lit"));
  assert (
    not
      (Runtime_value.Value_id.equal (Runtime_value.id value)
         (Runtime_value.id captured.value)))

let () =
  let template, graph_a = function_capture_graph () in
  let _, graph_b = function_capture_graph ~reversed_edges:true () in
  let value_a, trace_a =
    run_completed (init_with_templates_ok [ template ] graph_a Runtime_value.Unit)
  in
  let value_b, trace_b =
    run_completed (init_with_templates_ok [ template ] graph_b Runtime_value.Unit)
  in
  assert (Runtime_value.equal value_a value_b);
  assert (
    List.map
      (fun event -> List.map Runtime_value.Value_id.to_string event.Rewrite_event.consumed)
      trace_a
    =
    List.map
      (fun event -> List.map Runtime_value.Value_id.to_string event.Rewrite_event.consumed)
      trace_b)

let () =
  let template, graph = delayed_capture_graph () in
  let machine = init_with_templates_ok [ template ] graph Runtime_value.Unit in
  assert (
    List.map (fun c -> Node_id.to_string c.Engine.node_id)
      (Engine.Machine.ready_candidates machine)
    = [ "copy"; "drop-unit" ]);
  match Engine.step machine with
  | Engine.Rewritten { machine; event } ->
      assert (Rewrite_event.rule_to_string event.Rewrite_event.rule = "Copy");
      assert (
        List.exists
          (fun c ->
            Node_id.to_string c.Engine.node_id = "function"
            && c.Engine.ready_epoch = 1)
          (Engine.Machine.ready_candidates machine))
  | _ -> assert false

let () =
  let template, graph = closure_drop_graph () in
  let value, trace =
    run_completed (init_with_templates_ok [ template ] graph Runtime_value.Unit)
  in
  assert (Runtime_value.payload value = Runtime_value.Unit);
  assert_rules [ "Function"; "Drop"; "Drop" ] trace;
  let drop_event = List.nth trace 1 in
  assert (Rewrite_event.rule_to_string drop_event.Rewrite_event.rule = "Drop");
  assert (drop_event.Rewrite_event.created = [])

let () =
  let template, graph = closure_copy_drop_graph () in
  let value, trace =
    run_completed (init_with_templates_ok [ template ] graph Runtime_value.Unit)
  in
  assert (Runtime_value.payload value = Runtime_value.Unit);
  assert_rules [ "Function"; "Drop"; "Copy"; "Drop"; "Drop" ] trace;
  let function_event = List.nth trace 0 in
  let copy_event = List.nth trace 2 in
  assert (List.length function_event.Rewrite_event.created = 1);
  assert (List.length copy_event.Rewrite_event.consumed = 1);
  assert (List.length copy_event.Rewrite_event.created = 2);
  let input_id = List.hd copy_event.Rewrite_event.consumed in
  let left = List.nth copy_event.Rewrite_event.created 0 in
  let right = List.nth copy_event.Rewrite_event.created 1 in
  assert (
    not
      (Runtime_value.Value_id.equal (Runtime_value.id left)
         (Runtime_value.id right)));
  assert (not (Runtime_value.Value_id.equal (Runtime_value.id left) input_id));
  assert (not (Runtime_value.Value_id.equal (Runtime_value.id right) input_id));
  let left_closure = closure_of_value left in
  let right_closure = closure_of_value right in
  assert (Runtime_value.closure_equal left_closure right_closure);
  assert (
    Function_template_id.equal left_closure.template_id right_closure.template_id);
  assert (
    List.map
      (fun value ->
        match Runtime_value.origin value with
        | Runtime_value.Rewrite_output { port_key; _ } -> Port_key.to_string port_key
        | _ -> assert false)
      copy_event.Rewrite_event.created
    = [ "left"; "right" ])

let () =
  let template, graph = closure_copy_drop_graph () in
  let _, trace_a =
    run_completed (init_with_templates_ok [ template ] graph Runtime_value.Unit)
  in
  let _, trace_b =
    run_completed (init_with_templates_ok [ template ] graph Runtime_value.Unit)
  in
  assert (List.map Rewrite_event.to_string trace_a = List.map Rewrite_event.to_string trace_b);
  assert (
    List.map
      (fun event -> List.map Runtime_value.to_string event.Rewrite_event.created)
      trace_a
    =
    List.map
      (fun event -> List.map Runtime_value.to_string event.Rewrite_event.created)
      trace_b)

let () =
  let template, graph_a = function_no_capture_graph ~function_id:"function-a" () in
  let _, graph_b = function_no_capture_graph ~function_id:"function-b" () in
  let value_a, _ =
    run_completed (init_with_templates_ok [ template ] graph_a Runtime_value.Unit)
  in
  let value_b, _ =
    run_completed (init_with_templates_ok [ template ] graph_b Runtime_value.Unit)
  in
  assert (
    not
      (Runtime_value.Value_id.equal (Runtime_value.id value_a)
         (Runtime_value.id value_b)));
  assert (
    Runtime_value.payload_equal (Runtime_value.payload value_a)
      (Runtime_value.payload value_b))
