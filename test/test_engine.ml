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
  | Runtime_value.Unit -> assert false

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

let copy_nat_graph ?(order = [ "copy"; "succ"; "drop" ])
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
  Raw_graph.of_lists ~nodes ~edges
    ~default_node_order:(List.map node_id order)
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
        | Runtime_value.Nat _ -> "Nat")
      copy_event.Rewrite_event.created
    = [ "Unit"; "Unit" ])

let () =
  (match Engine.initialize (copy_arrow_graph ()) ~input:Runtime_value.Unit with
  | Error (Engine.Unsupported_runtime_input_type (Core_type.Arrow (Core_type.Unit, Core_type.Nat))) ->
      ()
  | _ -> assert false);
  assert (
    Engine.runtime_error_to_string
      (Engine.Unsupported_copy_payload_type
         {
           node_id = node_id "copy";
           typ = Core_type.Arrow (Core_type.Unit, Core_type.Nat);
         })
    = "unsupported Copy payload type at copy: Unit -> Nat")

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
