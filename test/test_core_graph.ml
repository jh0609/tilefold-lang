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

let pref node port = { node_id = node_id node; port_key = port_key port }
let edge id source target = { id = edge_id id; source; target }

let node id kind = { id = node_id id; kind }

let valid_nodes () =
  [
    node "param" (Parameter Core_type.Unit);
    node "drop" (Drop Core_type.Unit);
    node "lit" (Nat_literal (nat "3"));
    node "succ" Succ;
    node "result" (Result Core_type.Nat);
  ]

let valid_edges () =
  [
    edge "e-param-drop" (pref "param" "value") (pref "drop" "input");
    edge "e-lit-succ" (pref "lit" "value") (pref "succ" "input");
    edge "e-succ-result" (pref "succ" "result") (pref "result" "value");
  ]

let valid_default_node_order () = [ node_id "succ"; node_id "drop" ]

let raw ?(nodes = valid_nodes ()) ?(edges = valid_edges ())
    ?(default_node_order = valid_default_node_order ()) () =
  Raw_graph.of_lists ~nodes ~edges ~default_node_order

let raw_with_priority_spine ?(nodes = valid_nodes ()) ?(edges = valid_edges ())
    ?(default_node_order = valid_default_node_order ()) priority_spine =
  Raw_graph.of_lists_with_priority_spine ~nodes ~edges ~default_node_order
    ~priority_spine:(Some priority_spine)

let validate_errors graph =
  match validate graph with
  | Ok _ -> assert false
  | Error errors -> errors

let has_error predicate errors = assert (List.exists predicate errors)

let () =
  assert (Node_id.of_string "" = Error "node ID must not be empty");
  assert (Edge_id.of_string "" = Error "edge ID must not be empty");
  assert (Port_key.of_string "" = Error "port key must not be empty");
  assert (Core_type.equal Core_type.Unit Core_type.Unit);
  assert (not (Core_type.equal Core_type.Unit Core_type.Nat));
  assert (Core_type.to_string Core_type.Unit = "Unit");
  assert (Core_type.to_string Core_type.Nat = "Nat");
  assert (
    Core_type.to_string
      (Core_type.Arrow
         (Core_type.Arrow (Core_type.Unit, Core_type.Nat), Core_type.Nat))
    = "(Unit -> Nat) -> Nat")

let () =
  match validate (raw ()) with
  | Error errors ->
      failwith
        ("expected valid graph, got: "
        ^ String.concat "; " (List.map validation_error_to_string errors))
  | Ok graph ->
      assert (Core_type.equal (Validated_graph.parameter_type graph) Core_type.Unit);
      assert (Core_type.equal (Validated_graph.result_type graph) Core_type.Nat);
      assert (
        Core_type.equal (Validated_graph.template_type graph)
          (Core_type.Arrow (Core_type.Unit, Core_type.Nat)));
      assert (List.length (Validated_graph.nodes graph) = 5);
      assert (List.length (Validated_graph.edges graph) = 3);
      assert (
        List.map Node_id.to_string (Validated_graph.default_node_order graph)
        = [ "succ"; "drop" ]);
      assert (Validated_graph.priority_spine graph = None);
      assert (
        match Validated_graph.port_schema graph (node_id "succ") with
        | Some ports -> List.length ports = 2
        | None -> false)

let () =
  match
    validate (raw ~default_node_order:[ node_id "drop"; node_id "succ" ] ())
  with
  | Error errors ->
      failwith
        ("expected reordered graph to validate, got: "
        ^ String.concat "; " (List.map validation_error_to_string errors))
  | Ok graph ->
      assert (
        List.map Node_id.to_string (Validated_graph.default_node_order graph)
        = [ "drop"; "succ" ])

let () =
  let errors =
    validate_errors
      (raw
         ~nodes:(node "param" (Parameter Core_type.Unit) :: valid_nodes ())
         ())
  in
  has_error
    (function Duplicate_node_id id -> Node_id.to_string id = "param" | _ -> false)
    errors

let () =
  let duplicate = edge "e-lit-succ" (pref "param" "value") (pref "drop" "input") in
  let errors = validate_errors (raw ~edges:(duplicate :: valid_edges ()) ()) in
  has_error
    (function Duplicate_edge_id id -> Edge_id.to_string id = "e-lit-succ" | _ -> false)
    errors

let () =
  let nodes =
    List.filter
      (function { kind = Parameter _; _ } -> false | _ -> true)
      (valid_nodes ())
  in
  let errors = validate_errors (raw ~nodes ()) in
  has_error (function Missing_parameter_boundary -> true | _ -> false) errors

let () =
  let errors =
    validate_errors
      (raw
         ~nodes:(node "param-2" (Parameter Core_type.Unit) :: valid_nodes ())
         ())
  in
  has_error (function Multiple_parameter_boundaries _ -> true | _ -> false) errors

let () =
  let nodes =
    List.filter (function { kind = Result _; _ } -> false | _ -> true) (valid_nodes ())
  in
  let errors = validate_errors (raw ~nodes ()) in
  has_error (function Missing_result_boundary -> true | _ -> false) errors

let () =
  let errors =
    validate_errors
      (raw ~nodes:(node "result-2" (Result Core_type.Nat) :: valid_nodes ()) ())
  in
  has_error (function Multiple_result_boundaries _ -> true | _ -> false) errors

let () =
  let bad =
    edge "e-missing-node" (pref "missing" "value") (pref "succ" "input")
  in
  let errors = validate_errors (raw ~edges:(bad :: valid_edges ()) ()) in
  has_error (function Source_node_missing _ -> true | _ -> false) errors

let () =
  let bad =
    edge "e-missing-port" (pref "lit" "missing") (pref "succ" "input")
  in
  let errors = validate_errors (raw ~edges:(bad :: valid_edges ()) ()) in
  has_error (function Source_port_missing _ -> true | _ -> false) errors

let () =
  let bad =
    edge "e-source-input" (pref "succ" "input") (pref "result" "value")
  in
  let errors = validate_errors (raw ~edges:(bad :: valid_edges ()) ()) in
  has_error (function Source_port_not_output _ -> true | _ -> false) errors

let () =
  let bad =
    edge "e-target-output" (pref "lit" "value") (pref "succ" "result")
  in
  let errors = validate_errors (raw ~edges:(bad :: valid_edges ()) ()) in
  has_error (function Target_port_not_input _ -> true | _ -> false) errors

let () =
  let errors =
    validate_errors
      (raw
         ~edges:
           [
             edge "e-param-drop" (pref "param" "value") (pref "drop" "input");
             edge "e-unit-succ" (pref "param" "value") (pref "succ" "input");
             edge "e-succ-result" (pref "succ" "result") (pref "result" "value");
           ]
         ())
  in
  has_error
    (function
      | Type_mismatch { source_type = Core_type.Unit; target_type = Core_type.Nat; _ }
        ->
          true
      | _ -> false)
    errors

let () =
  let errors =
    validate_errors
      (raw
         ~edges:
           (edge "e-fanout" (pref "succ" "result") (pref "drop" "input")
           :: valid_edges ())
         ())
  in
  has_error
    (function
      | Output_port_connection_count { node_id; port_key; actual = 2; _ } ->
          Node_id.to_string node_id = "succ"
          && Port_key.to_string port_key = "result"
      | _ -> false)
    errors

let () =
  let errors =
    validate_errors
      (raw
         ~edges:
           (edge "e-dup-input" (pref "param" "value") (pref "succ" "input")
           :: valid_edges ())
         ())
  in
  has_error
    (function
      | Input_port_connection_count { node_id; port_key; actual = 2; _ } ->
          Node_id.to_string node_id = "succ" && Port_key.to_string port_key = "input"
      | _ -> false)
    errors

let () =
  let edges =
    List.filter
      (fun edge -> Edge_id.to_string edge.id <> "e-lit-succ")
      (valid_edges ())
  in
  let errors = validate_errors (raw ~edges ()) in
  has_error
    (function
      | Output_port_connection_count { node_id; port_key; actual = 0; _ } ->
          Node_id.to_string node_id = "lit" && Port_key.to_string port_key = "value"
      | _ -> false)
    errors

let () =
  let edges =
    List.filter
      (fun edge -> Edge_id.to_string edge.id <> "e-succ-result")
      (valid_edges ())
  in
  let errors = validate_errors (raw ~edges ()) in
  has_error
    (function
      | Input_port_connection_count { node_id; port_key; actual = 0; _ } ->
          Node_id.to_string node_id = "result"
          && Port_key.to_string port_key = "value"
      | _ -> false)
    errors

let () =
  let edges =
    List.filter
      (fun edge -> Edge_id.to_string edge.id <> "e-param-drop")
      (valid_edges ())
  in
  let errors = validate_errors (raw ~edges ()) in
  has_error
    (function
      | Input_port_connection_count { node_id; port_key; actual = 0; _ } ->
          Node_id.to_string node_id = "drop" && Port_key.to_string port_key = "input"
      | _ -> false)
    errors

let () =
  let nodes =
    List.map
      (fun (candidate : node) ->
        if Node_id.to_string candidate.id = "result" then
          { candidate with kind = Result Core_type.Unit }
        else candidate)
      (valid_nodes ())
  in
  let errors = validate_errors (raw ~nodes ()) in
  has_error
    (function
      | Type_mismatch { source_type = Core_type.Nat; target_type = Core_type.Unit; _ }
        ->
          true
      | _ -> false)
    errors

let () =
  let nodes = [ node "lit" (Nat_literal (nat "3")) ] in
  let edges =
    [
      edge "e-missing-target" (pref "lit" "missing") (pref "ghost" "value");
      edge "e-missing-target" (pref "ghost" "value") (pref "lit" "value");
    ]
  in
  let errors = validate_errors (raw ~nodes ~edges ()) in
  has_error (function Missing_parameter_boundary -> true | _ -> false) errors;
  has_error (function Missing_result_boundary -> true | _ -> false) errors;
  has_error
    (function Duplicate_edge_id id -> Edge_id.to_string id = "e-missing-target" | _ -> false)
    errors;
  has_error (function Source_port_missing _ -> true | _ -> false) errors;
  has_error (function Source_node_missing _ -> true | _ -> false) errors;
  has_error (function Target_node_missing _ -> true | _ -> false) errors

let () =
  let errors =
    validate_errors
      (raw ~default_node_order:[ node_id "succ"; node_id "succ"; node_id "drop" ] ())
  in
  has_error
    (function
      | Duplicate_default_order_member id -> Node_id.to_string id = "succ"
      | _ -> false)
    errors

let () =
  let errors =
    validate_errors
      (raw ~default_node_order:[ node_id "succ"; node_id "missing"; node_id "drop" ] ())
  in
  has_error
    (function
      | Default_order_node_missing id -> Node_id.to_string id = "missing"
      | _ -> false)
    errors

let () =
  let errors =
    validate_errors
      (raw ~default_node_order:[ node_id "succ"; node_id "lit"; node_id "drop" ] ())
  in
  has_error
    (function
      | Default_order_member_not_executable id -> Node_id.to_string id = "lit"
      | _ -> false)
    errors

let () =
  let errors =
    validate_errors
      (raw ~default_node_order:[ node_id "succ"; node_id "param"; node_id "drop" ] ())
  in
  has_error
    (function
      | Default_order_member_not_executable id -> Node_id.to_string id = "param"
      | _ -> false)
    errors

let () =
  let errors =
    validate_errors
      (raw ~default_node_order:[ node_id "succ"; node_id "result"; node_id "drop" ] ())
  in
  has_error
    (function
      | Default_order_member_not_executable id -> Node_id.to_string id = "result"
      | _ -> false)
    errors

let () =
  let errors = validate_errors (raw ~default_node_order:[ node_id "drop" ] ()) in
  has_error
    (function
      | Executable_node_missing_from_default_order id -> Node_id.to_string id = "succ"
      | _ -> false)
    errors

let () =
  let errors = validate_errors (raw ~default_node_order:[ node_id "succ" ] ()) in
  has_error
    (function
      | Executable_node_missing_from_default_order id -> Node_id.to_string id = "drop"
      | _ -> false)
    errors

let () =
  let errors =
    validate_errors
      (raw
         ~default_node_order:
           [ node_id "succ"; node_id "succ"; node_id "missing"; node_id "lit" ]
         ())
  in
  has_error (function Duplicate_default_order_member _ -> true | _ -> false) errors;
  has_error (function Default_order_node_missing _ -> true | _ -> false) errors;
  has_error
    (function Default_order_member_not_executable _ -> true | _ -> false)
    errors;
  has_error
    (function Executable_node_missing_from_default_order _ -> true | _ -> false)
    errors

let () =
  let nodes =
    [
      node "param" (Parameter Core_type.Unit);
      node "result" (Result Core_type.Unit);
    ]
  in
  let edges = [ edge "e-param-result" (pref "param" "value") (pref "result" "value") ] in
  match validate (raw ~nodes ~edges ~default_node_order:[] ()) with
  | Error errors ->
      failwith
        ("expected empty executable graph to validate, got: "
        ^ String.concat "; " (List.map validation_error_to_string errors))
  | Ok graph -> assert (Validated_graph.default_node_order graph = [])

let () =
  let graph =
    raw
      ~edges:
        [
          edge "e-target-output" (pref "lit" "value") (pref "succ" "result");
          edge "e-source-input" (pref "succ" "input") (pref "result" "value");
        ]
      ()
  in
  let first =
    validate_errors graph |> List.map validation_error_to_string
  in
  let second =
    validate_errors graph |> List.map validation_error_to_string
  in
  assert (first = second)

let () =
  let graph =
    raw
      ~default_node_order:
        [ node_id "succ"; node_id "succ"; node_id "missing"; node_id "lit" ]
      ()
  in
  let first = validate_errors graph |> List.map validation_error_to_string in
  let second = validate_errors graph |> List.map validation_error_to_string in
  assert (first = second)

let () =
  match validate (raw_with_priority_spine []) with
  | Ok graph -> assert (Validated_graph.priority_spine graph = Some [])
  | Error errors ->
      failwith
        ("expected empty PrioritySpine to validate, got: "
        ^ String.concat "; " (List.map validation_error_to_string errors))

let () =
  match validate (raw_with_priority_spine [ node_id "succ" ]) with
  | Ok graph ->
      assert (
        Option.map (List.map Node_id.to_string) (Validated_graph.priority_spine graph)
        = Some [ "succ" ])
  | Error errors ->
      failwith
        ("expected partial PrioritySpine to validate, got: "
        ^ String.concat "; " (List.map validation_error_to_string errors))

let () =
  match validate (raw_with_priority_spine [ node_id "drop"; node_id "succ" ]) with
  | Ok graph ->
      assert (
        Option.map (List.map Node_id.to_string) (Validated_graph.priority_spine graph)
        = Some [ "drop"; "succ" ])
  | Error errors ->
      failwith
        ("expected full reordered PrioritySpine to validate, got: "
        ^ String.concat "; " (List.map validation_error_to_string errors))

let () =
  let errors =
    validate_errors (raw_with_priority_spine [ node_id "succ"; node_id "succ" ])
  in
  has_error
    (function
      | Duplicate_priority_spine_member id -> Node_id.to_string id = "succ"
      | _ -> false)
    errors

let () =
  let errors =
    validate_errors (raw_with_priority_spine [ node_id "succ"; node_id "missing" ])
  in
  has_error
    (function
      | Priority_spine_node_missing id -> Node_id.to_string id = "missing"
      | _ -> false)
    errors

let () =
  let errors =
    validate_errors (raw_with_priority_spine [ node_id "succ"; node_id "param" ])
  in
  has_error
    (function
      | Priority_spine_member_not_executable { node_id; kind = Parameter _ } ->
          Node_id.to_string node_id = "param"
      | _ -> false)
    errors

let () =
  let errors =
    validate_errors (raw_with_priority_spine [ node_id "succ"; node_id "result" ])
  in
  has_error
    (function
      | Priority_spine_member_not_executable { node_id; kind = Result _ } ->
          Node_id.to_string node_id = "result"
      | _ -> false)
    errors

let () =
  let errors =
    validate_errors (raw_with_priority_spine [ node_id "succ"; node_id "lit" ])
  in
  has_error
    (function
      | Priority_spine_member_not_executable { node_id; kind = Nat_literal _ } ->
          Node_id.to_string node_id = "lit"
      | _ -> false)
    errors

let copy_unit_graph ?(default_node_order = [ node_id "copy"; node_id "drop" ])
    ?(nodes =
      [
        node "param" (Parameter Core_type.Unit);
        node "copy" (Copy Core_type.Unit);
        node "drop" (Drop Core_type.Unit);
        node "result" (Result Core_type.Unit);
      ])
    ?(edges =
      [
        edge "e-param-copy" (pref "param" "value") (pref "copy" "input");
        edge "e-copy-left-drop" (pref "copy" "left") (pref "drop" "input");
        edge "e-copy-right-result" (pref "copy" "right") (pref "result" "value");
      ])
    () =
  Raw_graph.of_lists ~nodes ~edges ~default_node_order

let copy_nat_graph ?(default_node_order = [ node_id "copy"; node_id "drop" ])
    ?priority_spine
    ?(nodes =
      [
        node "param" (Parameter Core_type.Nat);
        node "copy" (Copy Core_type.Nat);
        node "drop" (Drop Core_type.Nat);
        node "result" (Result Core_type.Nat);
      ])
    ?(edges =
      [
        edge "e-param-copy" (pref "param" "value") (pref "copy" "input");
        edge "e-copy-left-result" (pref "copy" "left") (pref "result" "value");
        edge "e-copy-right-drop" (pref "copy" "right") (pref "drop" "input");
      ])
    () =
  Raw_graph.of_lists_with_priority_spine ~nodes ~edges ~default_node_order
    ~priority_spine

let () =
  match validate (copy_unit_graph ()) with
  | Ok graph ->
      assert (
        List.map Node_id.to_string (Validated_graph.default_node_order graph)
        = [ "copy"; "drop" ]);
      assert (
        match Validated_graph.port_schema graph (node_id "copy") with
        | Some ports ->
            List.map (fun port -> Port_key.to_string port.key) ports
            = [ "input"; "left"; "right" ]
        | None -> false)
  | Error _ -> assert false

let () =
  match validate (copy_nat_graph ()) with
  | Ok _ -> ()
  | Error _ -> assert false

let () =
  match validate (copy_nat_graph ~priority_spine:[ node_id "copy"; node_id "drop" ] ()) with
  | Ok graph ->
      assert (
        Option.map (List.map Node_id.to_string) (Validated_graph.priority_spine graph)
        = Some [ "copy"; "drop" ])
  | Error _ -> assert false

let () =
  let errors =
    validate_errors (copy_nat_graph ~default_node_order:[ node_id "drop" ] ())
  in
  has_error
    (function
      | Executable_node_missing_from_default_order id -> Node_id.to_string id = "copy"
      | _ -> false)
    errors

let () =
  let nodes =
    [
      node "param" (Parameter Core_type.Unit);
      node "copy" (Copy Core_type.Nat);
      node "drop" (Drop Core_type.Nat);
      node "result" (Result Core_type.Nat);
    ]
  in
  let errors = validate_errors (copy_nat_graph ~nodes ()) in
  has_error
    (function
      | Type_mismatch { source_type = Core_type.Unit; target_type = Core_type.Nat; _ }
        ->
          true
      | _ -> false)
    errors

let () =
  let nodes =
    [
      node "param" (Parameter Core_type.Nat);
      node "copy" (Copy Core_type.Nat);
      node "drop" (Drop Core_type.Nat);
      node "result" (Result Core_type.Unit);
    ]
  in
  let errors = validate_errors (copy_nat_graph ~nodes ()) in
  has_error
    (function
      | Type_mismatch { source_type = Core_type.Nat; target_type = Core_type.Unit; _ }
        ->
          true
      | _ -> false)
    errors

let () =
  let nodes =
    [
      node "param" (Parameter Core_type.Nat);
      node "copy" (Copy Core_type.Nat);
      node "drop" (Drop Core_type.Unit);
      node "result" (Result Core_type.Nat);
    ]
  in
  let errors = validate_errors (copy_nat_graph ~nodes ()) in
  has_error
    (function
      | Type_mismatch { source_type = Core_type.Nat; target_type = Core_type.Unit; _ }
        ->
          true
      | _ -> false)
    errors

let () =
  let edges =
    [
      edge "e-param-copy" (pref "param" "value") (pref "copy" "input");
      edge "e-copy-right-drop" (pref "copy" "right") (pref "drop" "input");
    ]
  in
  let errors = validate_errors (copy_nat_graph ~edges ()) in
  has_error
    (function
      | Output_port_connection_count { node_id; port_key; actual = 0; _ } ->
          Node_id.to_string node_id = "copy" && Port_key.to_string port_key = "left"
      | _ -> false)
    errors
