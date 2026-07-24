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
  let left = "left"
  let right = "right"
  let capture name = "capture:" ^ name
  let equal = String.equal
  let compare = String.compare
  let to_string value = value
end

module Function_template_id = struct
  type t = string

  let of_string value =
    if value = "" then Error "function template ID must not be empty" else Ok value

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
  | Copy of Core_type.t
  | Function of function_signature

and capture = {
  key : Port_key.t;
  typ : Core_type.t;
}

and function_signature = {
  template_id : Function_template_id.t;
  parameter_type : Core_type.t;
  result_type : Core_type.t;
  captures : capture list;
}

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
        port Port_key.input Input Core_type.Nat;
        port Port_key.result Output Core_type.Nat;
      ]
  | Drop typ -> [ port Port_key.input Input typ ]
  | Copy typ ->
      [
        port Port_key.input Input typ;
        port Port_key.left Output typ;
        port Port_key.right Output typ;
      ]
  | Function signature ->
      List.map
        (fun (capture : capture) -> port capture.key Input capture.typ)
        signature.captures
      @ [
          port Port_key.value Output
            (Core_type.Arrow (signature.parameter_type, signature.result_type));
        ]

let is_executable_node_kind = function
  | Succ | Drop _ | Copy _ | Function _ -> true
  | Unit_literal | Nat_literal _ | Parameter _ | Result _ -> false

module Raw_graph = struct
  type t = {
    nodes : node list;
    edges : edge list;
    default_node_order : Node_id.t list;
    priority_spine : Node_id.t list option;
  }

  let of_lists ~nodes ~edges ~default_node_order =
    { nodes; edges; default_node_order; priority_spine = None }

  let of_lists_with_priority_spine ~nodes ~edges ~default_node_order
      ~priority_spine =
    { nodes; edges; default_node_order; priority_spine }

  let nodes graph = graph.nodes
  let edges graph = graph.edges
  let default_node_order graph = graph.default_node_order
  let priority_spine graph = graph.priority_spine
end

module Validated_graph = struct
  type t = {
    nodes : node list;
    edges : edge list;
    default_node_order : Node_id.t list;
    priority_spine : Node_id.t list option;
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

  let default_node_order graph = graph.default_node_order
  let priority_spine graph = graph.priority_spine

  let create ~nodes ~edges ~default_node_order ~priority_spine ~parameter_node
      ~result_node ~parameter_type ~result_type =
    {
      nodes;
      edges;
      default_node_order;
      priority_spine;
      parameter_node;
      result_node;
      parameter_type;
      result_type;
    }
end

module Function_template = struct
  type t = {
    id : Function_template_id.t;
    parameter_type : Core_type.t;
    result_type : Core_type.t;
    captures : capture list;
    body : Validated_graph.t;
    dependencies : Function_template_id.t list;
  }

  let create ?(dependencies = []) ~id ~parameter_type ~result_type ~captures ~body
      () =
    { id; parameter_type; result_type; captures; body; dependencies }

  let id template = template.id
  let parameter_type template = template.parameter_type
  let result_type template = template.result_type
  let captures template = template.captures
  let body template = template.body
  let dependencies template = template.dependencies

  let signature_type template =
    Core_type.Arrow (template.parameter_type, template.result_type)
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
  | Duplicate_default_order_member of Node_id.t
  | Default_order_node_missing of Node_id.t
  | Default_order_member_not_executable of Node_id.t
  | Executable_node_missing_from_default_order of Node_id.t
  | Duplicate_priority_spine_member of Node_id.t
  | Priority_spine_node_missing of Node_id.t
  | Priority_spine_member_not_executable of {
      node_id : Node_id.t;
      kind : node_kind;
    }
  | Duplicate_function_template_id of Function_template_id.t
  | Missing_function_template of {
      node_id : Node_id.t;
      template_id : Function_template_id.t;
    }
  | Function_signature_mismatch of {
      node_id : Node_id.t;
      template_id : Function_template_id.t;
      expected : Core_type.t;
      actual : Core_type.t;
    }
  | Duplicate_capture_key of {
      owner : string;
      capture_key : Port_key.t;
    }
  | Missing_capture of {
      node_id : Node_id.t;
      capture_key : Port_key.t;
    }
  | Unexpected_capture of {
      node_id : Node_id.t;
      capture_key : Port_key.t;
    }
  | Function_capture_order_mismatch of {
      node_id : Node_id.t;
      expected : Port_key.t list;
      actual : Port_key.t list;
    }
  | Function_capture_type_mismatch of {
      node_id : Node_id.t;
      capture_key : Port_key.t;
      expected : Core_type.t;
      actual : Core_type.t;
    }
  | Function_template_body_signature_mismatch of {
      template_id : Function_template_id.t;
      expected : Core_type.t;
      actual : Core_type.t;
    }
  | Function_template_cycle of Function_template_id.t list

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

let default_order_errors (nodes : node list) default_node_order =
  let duplicate_errors =
    find_duplicates default_node_order (fun left right -> Node_id.compare left right)
    |> List.map (fun node_id -> Duplicate_default_order_member node_id)
  in
  let member_errors =
    default_node_order
    |> List.concat_map (fun node_id ->
           match find_node nodes node_id with
           | None -> [ Default_order_node_missing node_id ]
           | Some node ->
               if is_executable_node_kind node.kind then []
               else [ Default_order_member_not_executable node_id ])
  in
  let executable_nodes =
    List.filter (fun (node : node) -> is_executable_node_kind node.kind) nodes
  in
  let missing_errors =
    executable_nodes
    |> List.filter (fun (node : node) ->
           not (List.exists (fun member -> Node_id.equal node.id member) default_node_order))
    |> List.map (fun (node : node) -> Executable_node_missing_from_default_order node.id)
  in
  duplicate_errors @ member_errors @ missing_errors

let priority_spine_errors (nodes : node list) = function
  | None -> []
  | Some priority_spine ->
      let duplicate_errors =
        find_duplicates priority_spine (fun left right -> Node_id.compare left right)
        |> List.map (fun node_id -> Duplicate_priority_spine_member node_id)
      in
      let member_errors =
        priority_spine
        |> List.concat_map (fun node_id ->
               match find_node nodes node_id with
               | None -> [ Priority_spine_node_missing node_id ]
               | Some node ->
                   if is_executable_node_kind node.kind then []
                   else
                     [
                       Priority_spine_member_not_executable
                         { node_id; kind = node.kind };
                     ])
      in
      duplicate_errors @ member_errors

let capture_keys (captures : capture list) =
  List.map (fun (capture : capture) -> capture.key) captures

let duplicate_capture_errors owner (captures : capture list) =
  find_duplicates (capture_keys captures) (fun left right -> Port_key.compare left right)
  |> List.map (fun capture_key -> Duplicate_capture_key { owner; capture_key })

let function_template_lookup templates template_id =
  List.find_opt
    (fun template -> Function_template_id.equal (Function_template.id template) template_id)
    templates

let body_function_dependencies template =
  Function_template.body template |> Validated_graph.nodes
  |> List.filter_map (function
       | { kind = Function signature; _ } -> Some signature.template_id
       | _ -> None)

let template_dependency_ids template =
  Function_template.dependencies template @ body_function_dependencies template

let template_cycle_errors templates =
  let sorted_templates =
    List.sort
      (fun left right ->
        Function_template_id.compare (Function_template.id left)
          (Function_template.id right))
      templates
  in
  let rec visit visiting visited template =
    let id = Function_template.id template in
    if List.exists (Function_template_id.equal id) visiting then
      (visited, [ Function_template_cycle (List.rev (id :: visiting)) ])
    else if List.exists (Function_template_id.equal id) visited then (visited, [])
    else
      let dependencies =
        template_dependency_ids template
        |> List.filter_map (function_template_lookup templates)
        |> List.sort (fun left right ->
               Function_template_id.compare (Function_template.id left)
                 (Function_template.id right))
      in
      let visited, errors =
        List.fold_left
          (fun (visited, errors) dependency ->
            let visited, dependency_errors =
              visit (id :: visiting) visited dependency
            in
            (visited, errors @ dependency_errors))
          (visited, []) dependencies
      in
      (id :: visited, errors)
  in
  let _, errors =
    List.fold_left
      (fun (visited, errors) template ->
        let visited, template_errors = visit [] visited template in
        (visited, errors @ template_errors))
      ([], []) sorted_templates
  in
  errors

let template_registry_errors templates =
  let duplicate_template_errors =
    find_duplicates
      (List.map Function_template.id templates)
      (fun left right -> Function_template_id.compare left right)
    |> List.map (fun id -> Duplicate_function_template_id id)
  in
  let capture_errors =
    templates
    |> List.concat_map (fun template ->
           duplicate_capture_errors
             ("template:" ^ Function_template_id.to_string (Function_template.id template))
             (Function_template.captures template))
  in
  let signature_errors =
    templates
    |> List.filter_map (fun template ->
           let expected = Function_template.signature_type template in
           let actual =
             Function_template.body template |> Validated_graph.template_type
           in
           if Core_type.equal expected actual then None
           else
             Some
               (Function_template_body_signature_mismatch
                  { template_id = Function_template.id template; expected; actual }))
  in
  duplicate_template_errors @ capture_errors @ signature_errors
  @ template_cycle_errors templates

let function_node_errors templates nodes =
  nodes
  |> List.concat_map (function
       | { id = node_id; kind = Function signature } -> (
           let duplicate_errors =
             duplicate_capture_errors
               ("function:" ^ Node_id.to_string node_id)
               signature.captures
           in
           match function_template_lookup templates signature.template_id with
           | None ->
               duplicate_errors
               @ [
                   Missing_function_template
                     { node_id; template_id = signature.template_id };
                 ]
           | Some template ->
               let expected_type = Function_template.signature_type template in
               let actual_type =
                 Core_type.Arrow (signature.parameter_type, signature.result_type)
               in
               let signature_errors =
                 if Core_type.equal expected_type actual_type then []
                 else
                   [
                     Function_signature_mismatch
                       {
                         node_id;
                         template_id = signature.template_id;
                         expected = expected_type;
                         actual = actual_type;
                       };
                   ]
               in
               let expected_captures = Function_template.captures template in
               let actual_captures = signature.captures in
               let expected_keys = capture_keys expected_captures in
               let actual_keys = capture_keys actual_captures in
               let missing_errors =
                 expected_keys
                 |> List.filter (fun expected ->
                        not
                          (List.exists
                             (fun actual -> Port_key.equal expected actual)
                             actual_keys))
                 |> List.map (fun capture_key ->
                        Missing_capture { node_id; capture_key })
               in
               let unexpected_errors =
                 actual_keys
                 |> List.filter (fun actual ->
                        not
                          (List.exists
                             (fun expected -> Port_key.equal expected actual)
                             expected_keys))
                 |> List.map (fun capture_key ->
                        Unexpected_capture { node_id; capture_key })
               in
               let order_errors =
                 if
                   List.length missing_errors = 0
                   && List.length unexpected_errors = 0
                   && List.length duplicate_errors = 0
                   && List.length expected_keys = List.length actual_keys
                   && not
                        (List.for_all2 Port_key.equal expected_keys actual_keys)
                 then
                   [
                     Function_capture_order_mismatch
                       { node_id; expected = expected_keys; actual = actual_keys };
                   ]
                 else []
               in
               let type_errors =
                 expected_captures
                 |> List.filter_map (fun (expected : capture) ->
                        match
                          List.find_opt
                            (fun (actual : capture) ->
                              Port_key.equal expected.key actual.key)
                            actual_captures
                        with
                        | None -> None
                        | Some actual ->
                            if Core_type.equal expected.typ actual.typ then None
                            else
                              Some
                                (Function_capture_type_mismatch
                                   {
                                     node_id;
                                     capture_key = expected.key;
                                     expected = expected.typ;
                                     actual = actual.typ;
                                   }))
               in
               duplicate_errors @ signature_errors @ missing_errors
               @ unexpected_errors @ order_errors @ type_errors)
       | _ -> [])

let validate_with_templates templates raw_graph =
  let nodes = Raw_graph.nodes raw_graph in
  let edges = Raw_graph.edges raw_graph in
  let default_node_order = Raw_graph.default_node_order raw_graph in
  let priority_spine = Raw_graph.priority_spine raw_graph in
  let errors =
    template_registry_errors templates
    @ duplicate_errors nodes edges @ boundary_errors nodes
    @ List.concat_map (reference_errors nodes) edges
    @ connectivity_errors nodes edges
    @ default_order_errors nodes default_node_order
    @ priority_spine_errors nodes priority_spine
    @ function_node_errors templates nodes
  in
  match errors with
  | _ :: _ -> Error errors
  | [] -> (
      match (parameter_nodes nodes, result_nodes nodes) with
      | ( [ ({ kind = Parameter parameter_type; _ } as parameter_node) ],
          [ ({ kind = Result result_type; _ } as result_node) ] ) ->
          Ok
            (Validated_graph.create ~nodes ~edges ~default_node_order ~priority_spine
               ~parameter_node ~result_node ~parameter_type ~result_type)
      | _ -> assert false)

let validate raw_graph = validate_with_templates [] raw_graph

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
  | Duplicate_default_order_member node_id ->
      "duplicate default order member: " ^ Node_id.to_string node_id
  | Default_order_node_missing node_id ->
      "default order node missing: " ^ Node_id.to_string node_id
  | Default_order_member_not_executable node_id ->
      "default order member is not executable: " ^ Node_id.to_string node_id
  | Executable_node_missing_from_default_order node_id ->
      "executable node missing from default order: " ^ Node_id.to_string node_id
  | Duplicate_priority_spine_member node_id ->
      "duplicate PrioritySpine member: " ^ Node_id.to_string node_id
  | Priority_spine_node_missing node_id ->
      "PrioritySpine node missing: " ^ Node_id.to_string node_id
  | Priority_spine_member_not_executable { node_id; kind = _ } ->
      "PrioritySpine member is not executable: " ^ Node_id.to_string node_id
  | Duplicate_function_template_id id ->
      "duplicate function template ID: " ^ Function_template_id.to_string id
  | Missing_function_template { node_id; template_id } ->
      "missing function template for " ^ Node_id.to_string node_id ^ ": "
      ^ Function_template_id.to_string template_id
  | Function_signature_mismatch { node_id; template_id; expected; actual } ->
      "function signature mismatch for " ^ Node_id.to_string node_id ^ " -> "
      ^ Function_template_id.to_string template_id ^ ": expected "
      ^ Core_type.to_string expected ^ ", actual " ^ Core_type.to_string actual
  | Duplicate_capture_key { owner; capture_key } ->
      "duplicate capture key for " ^ owner ^ ": " ^ Port_key.to_string capture_key
  | Missing_capture { node_id; capture_key } ->
      "missing capture for " ^ Node_id.to_string node_id ^ ": "
      ^ Port_key.to_string capture_key
  | Unexpected_capture { node_id; capture_key } ->
      "unexpected capture for " ^ Node_id.to_string node_id ^ ": "
      ^ Port_key.to_string capture_key
  | Function_capture_order_mismatch { node_id; expected; actual } ->
      "function capture order mismatch for " ^ Node_id.to_string node_id
      ^ ": expected "
      ^ String.concat ", " (List.map Port_key.to_string expected)
      ^ ", actual "
      ^ String.concat ", " (List.map Port_key.to_string actual)
  | Function_capture_type_mismatch { node_id; capture_key; expected; actual } ->
      "function capture type mismatch for " ^ Node_id.to_string node_id ^ "."
      ^ Port_key.to_string capture_key ^ ": expected "
      ^ Core_type.to_string expected ^ ", actual " ^ Core_type.to_string actual
  | Function_template_body_signature_mismatch { template_id; expected; actual }
    ->
      "function template body signature mismatch for "
      ^ Function_template_id.to_string template_id ^ ": expected "
      ^ Core_type.to_string expected ^ ", actual " ^ Core_type.to_string actual
  | Function_template_cycle ids ->
      "function template dependency cycle: "
      ^ String.concat " -> " (List.map Function_template_id.to_string ids)
