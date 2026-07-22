module Node_id = struct
  type t = string

  let of_string value =
    if value = "" then Error "node ID must not be empty" else Ok value

  let equal = String.equal
  let compare = String.compare
  let to_string value = value
end

module Edge_id = struct
  type t = string

  let of_string value =
    if value = "" then Error "edge ID must not be empty" else Ok value

  let equal = String.equal
  let compare = String.compare
  let to_string value = value
end

module Port_key = struct
  type t = string

  let of_string value =
    if value = "" then Error "port key must not be empty" else Ok value

  let value = "value"
  let input = "input"
  let result = "result"
  let equal = String.equal
  let compare = String.compare
  let to_string value = value
end

module Direction = struct
  type t =
    | Input
    | Output

  let equal left right =
    match (left, right) with
    | Input, Input | Output, Output -> true
    | _ -> false

  let to_string = function
    | Input -> "input"
    | Output -> "output"
end

type node_kind =
  | Unit_literal
  | Nat_literal of Nat.t
  | Parameter of Core_type.t
  | Result of Core_type.t
  | Succ
  | Drop of Core_type.t

type node = {
  id : Node_id.t;
  kind : node_kind;
}

type port = {
  key : Port_key.t;
  direction : Direction.t;
  typ : Core_type.t;
}

type port_ref = {
  node_id : Node_id.t;
  port_key : Port_key.t;
}

type edge = {
  id : Edge_id.t;
  source : port_ref;
  target : port_ref;
}

let port key direction typ = { key; direction; typ }

let ports_of_node_kind = function
  | Unit_literal -> [ port Port_key.value Output Core_type.Unit ]
  | Nat_literal _ -> [ port Port_key.value Output Core_type.Nat ]
  | Parameter typ -> [ port Port_key.value Output typ ]
  | Result typ -> [ port Port_key.value Input typ ]
  | Succ ->
      [
        port Port_key.input Input Nat;
        port Port_key.result Output Nat;
      ]
  | Drop typ -> [ port Port_key.input Input typ ]

module Raw_graph = struct
  type t = {
    nodes : node list;
    edges : edge list;
  }

  let of_lists ~nodes ~edges = { nodes; edges }
  let nodes graph = graph.nodes
  let edges graph = graph.edges
end

module Validated_graph = struct
  type t = {
    nodes : node list;
    edges : edge list;
    parameter_node : node;
    result_node : node;
    parameter_type : Core_type.t;
    result_type : Core_type.t;
  }

  let nodes graph = graph.nodes
  let edges graph = graph.edges
  let parameter_node graph = graph.parameter_node
  let result_node graph = graph.result_node
  let parameter_type graph = graph.parameter_type
  let result_type graph = graph.result_type
  let template_type graph = Core_type.Arrow (graph.parameter_type, graph.result_type)

  let port_schema (graph : t) node_id =
    graph.nodes
    |> List.find_opt (fun (node : node) -> Node_id.equal node.id node_id)
    |> Option.map (fun node -> ports_of_node_kind node.kind)

  let create ~nodes ~edges ~parameter_node ~result_node ~parameter_type ~result_type =
    { nodes; edges; parameter_node; result_node; parameter_type; result_type }
end

type validation_error =
  | Duplicate_node_id of Node_id.t
  | Duplicate_edge_id of Edge_id.t
  | Missing_parameter_boundary
  | Multiple_parameter_boundaries of Node_id.t list
  | Missing_result_boundary
  | Multiple_result_boundaries of Node_id.t list
  | Source_node_missing of { edge_id : Edge_id.t; node_id : Node_id.t }
  | Target_node_missing of { edge_id : Edge_id.t; node_id : Node_id.t }
  | Source_port_missing of { edge_id : Edge_id.t; port_ref : port_ref }
  | Target_port_missing of { edge_id : Edge_id.t; port_ref : port_ref }
  | Source_port_not_output of {
      edge_id : Edge_id.t;
      port_ref : port_ref;
      actual : Direction.t;
    }
  | Target_port_not_input of {
      edge_id : Edge_id.t;
      port_ref : port_ref;
      actual : Direction.t;
    }
  | Type_mismatch of {
      edge_id : Edge_id.t;
      source_type : Core_type.t;
      target_type : Core_type.t;
    }
  | Input_port_connection_count of {
      node_id : Node_id.t;
      port_key : Port_key.t;
      expected : int;
      actual : int;
    }
  | Output_port_connection_count of {
      node_id : Node_id.t;
      port_key : Port_key.t;
      expected : int;
      actual : int;
    }

let find_duplicates items compare =
  let sorted = List.sort compare items in
  let rec loop duplicates = function
    | first :: second :: rest when compare first second = 0 ->
        let rec skip_same = function
          | next :: tail when compare first next = 0 -> skip_same tail
          | remaining -> remaining
        in
        loop (first :: duplicates) (skip_same rest)
    | _ :: rest -> loop duplicates rest
    | [] -> List.rev duplicates
  in
  loop [] sorted

let find_node (nodes : node list) node_id =
  List.find_opt (fun (node : node) -> Node_id.equal node.id node_id) nodes

let find_port ports key =
  List.find_opt (fun port -> Port_key.equal port.key key) ports

let parameter_nodes (nodes : node list) =
  List.filter
    (function { kind = Parameter _; _ } -> true | _ -> false)
    nodes

let result_nodes (nodes : node list) =
  List.filter (function { kind = Result _; _ } -> true | _ -> false) nodes

let boundary_errors nodes =
  let parameters = parameter_nodes nodes in
  let results = result_nodes nodes in
  let parameter_errors =
    match parameters with
    | [] -> [ Missing_parameter_boundary ]
    | [ _ ] -> []
    | many ->
        [
          Multiple_parameter_boundaries
            (List.map (fun (node : node) -> node.id) many);
        ]
  in
  let result_errors =
    match results with
    | [] -> [ Missing_result_boundary ]
    | [ _ ] -> []
    | many ->
        [ Multiple_result_boundaries (List.map (fun (node : node) -> node.id) many) ]
  in
  parameter_errors @ result_errors

let duplicate_errors nodes edges =
  let duplicate_node_errors =
    find_duplicates
      (List.map (fun (node : node) -> node.id) nodes)
      (fun left right -> Node_id.compare left right)
    |> List.map (fun id -> Duplicate_node_id id)
  in
  let duplicate_edge_errors =
    find_duplicates
      (List.map (fun (edge : edge) -> edge.id) edges)
      (fun left right -> Edge_id.compare left right)
    |> List.map (fun id -> Duplicate_edge_id id)
  in
  duplicate_node_errors @ duplicate_edge_errors

let reference_errors nodes edge =
  let source_node = find_node nodes edge.source.node_id in
  let target_node = find_node nodes edge.target.node_id in
  let source_node_errors =
    match source_node with
    | Some _ -> []
    | None ->
        [ Source_node_missing { edge_id = edge.id; node_id = edge.source.node_id } ]
  in
  let target_node_errors =
    match target_node with
    | Some _ -> []
    | None ->
        [ Target_node_missing { edge_id = edge.id; node_id = edge.target.node_id } ]
  in
  let source_port =
    match source_node with
    | None -> None
    | Some node -> find_port (ports_of_node_kind node.kind) edge.source.port_key
  in
  let target_port =
    match target_node with
    | None -> None
    | Some node -> find_port (ports_of_node_kind node.kind) edge.target.port_key
  in
  let source_port_errors =
    match (source_node, source_port) with
    | Some _, None ->
        [ Source_port_missing { edge_id = edge.id; port_ref = edge.source } ]
    | _ -> []
  in
  let target_port_errors =
    match (target_node, target_port) with
    | Some _, None ->
        [ Target_port_missing { edge_id = edge.id; port_ref = edge.target } ]
    | _ -> []
  in
  let direction_errors =
    let source_errors =
      match source_port with
      | Some port when not (Direction.equal port.direction Output) ->
          [
            Source_port_not_output
              { edge_id = edge.id; port_ref = edge.source; actual = port.direction };
          ]
      | _ -> []
    in
    let target_errors =
      match target_port with
      | Some port when not (Direction.equal port.direction Input) ->
          [
            Target_port_not_input
              { edge_id = edge.id; port_ref = edge.target; actual = port.direction };
          ]
      | _ -> []
    in
    source_errors @ target_errors
  in
  let type_errors =
    match (source_port, target_port) with
    | Some source, Some target
      when Direction.equal source.direction Output
           && Direction.equal target.direction Input
           && not (Core_type.equal source.typ target.typ) ->
        [
          Type_mismatch
            { edge_id = edge.id; source_type = source.typ; target_type = target.typ };
        ]
    | _ -> []
  in
  source_node_errors @ target_node_errors @ source_port_errors @ target_port_errors
  @ direction_errors @ type_errors

let outgoing_count edges node_id port_key =
  List.fold_left
    (fun count edge ->
      if
        Node_id.equal edge.source.node_id node_id
        && Port_key.equal edge.source.port_key port_key
      then count + 1
      else count)
    0 edges

let incoming_count edges node_id port_key =
  List.fold_left
    (fun count edge ->
      if
        Node_id.equal edge.target.node_id node_id
        && Port_key.equal edge.target.port_key port_key
      then count + 1
      else count)
    0 edges

let connectivity_errors (nodes : node list) edges =
  nodes
  |> List.concat_map (fun (node : node) ->
         ports_of_node_kind node.kind
         |> List.filter_map (fun port ->
                match port.direction with
                | Input ->
                    let actual = incoming_count edges node.id port.key in
                    if actual = 1 then None
                    else
                      Some
                        (Input_port_connection_count
                           { node_id = node.id; port_key = port.key; expected = 1; actual })
                | Output ->
                    let actual = outgoing_count edges node.id port.key in
                    if actual = 1 then None
                    else
                      Some
                        (Output_port_connection_count
                           { node_id = node.id; port_key = port.key; expected = 1; actual })))

let validate raw_graph =
  let nodes = Raw_graph.nodes raw_graph in
  let edges = Raw_graph.edges raw_graph in
  let errors =
    duplicate_errors nodes edges @ boundary_errors nodes
    @ List.concat_map (reference_errors nodes) edges
    @ connectivity_errors nodes edges
  in
  match errors with
  | _ :: _ -> Error errors
  | [] -> (
      match (parameter_nodes nodes, result_nodes nodes) with
      | ( [ ({ kind = Parameter parameter_type; _ } as parameter_node) ],
          [ ({ kind = Result result_type; _ } as result_node) ] ) ->
          Ok
            (Validated_graph.create ~nodes ~edges ~parameter_node ~result_node
               ~parameter_type ~result_type)
      | _ -> assert false)

let port_ref_to_string port_ref =
  Node_id.to_string port_ref.node_id ^ "." ^ Port_key.to_string port_ref.port_key

let validation_error_to_string = function
  | Duplicate_node_id id -> "duplicate node ID: " ^ Node_id.to_string id
  | Duplicate_edge_id id -> "duplicate edge ID: " ^ Edge_id.to_string id
  | Missing_parameter_boundary -> "missing Parameter boundary"
  | Multiple_parameter_boundaries ids ->
      "multiple Parameter boundaries: "
      ^ String.concat ", " (List.map Node_id.to_string ids)
  | Missing_result_boundary -> "missing Result boundary"
  | Multiple_result_boundaries ids ->
      "multiple Result boundaries: " ^ String.concat ", " (List.map Node_id.to_string ids)
  | Source_node_missing { edge_id; node_id } ->
      "source node missing on edge " ^ Edge_id.to_string edge_id ^ ": "
      ^ Node_id.to_string node_id
  | Target_node_missing { edge_id; node_id } ->
      "target node missing on edge " ^ Edge_id.to_string edge_id ^ ": "
      ^ Node_id.to_string node_id
  | Source_port_missing { edge_id; port_ref } ->
      "source port missing on edge " ^ Edge_id.to_string edge_id ^ ": "
      ^ port_ref_to_string port_ref
  | Target_port_missing { edge_id; port_ref } ->
      "target port missing on edge " ^ Edge_id.to_string edge_id ^ ": "
      ^ port_ref_to_string port_ref
  | Source_port_not_output { edge_id; port_ref; actual } ->
      "source port is not output on edge " ^ Edge_id.to_string edge_id ^ ": "
      ^ port_ref_to_string port_ref ^ " is " ^ Direction.to_string actual
  | Target_port_not_input { edge_id; port_ref; actual } ->
      "target port is not input on edge " ^ Edge_id.to_string edge_id ^ ": "
      ^ port_ref_to_string port_ref ^ " is " ^ Direction.to_string actual
  | Type_mismatch { edge_id; source_type; target_type } ->
      "type mismatch on edge " ^ Edge_id.to_string edge_id ^ ": "
      ^ Core_type.to_string source_type ^ " -> " ^ Core_type.to_string target_type
  | Input_port_connection_count { node_id; port_key; expected; actual } ->
      "input port connection count for " ^ Node_id.to_string node_id ^ "."
      ^ Port_key.to_string port_key ^ ": expected " ^ string_of_int expected
      ^ ", actual " ^ string_of_int actual
  | Output_port_connection_count { node_id; port_key; expected; actual } ->
      "output port connection count for " ^ Node_id.to_string node_id ^ "."
      ^ Port_key.to_string port_key ^ ": expected " ^ string_of_int expected
      ^ ", actual " ^ string_of_int actual
