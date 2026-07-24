module CG = Core_graph
module P = Program_package

module Make_id () = struct
  type t = string

  let of_string value =
    if String.equal value "" then Error "identifier must not be empty"
    else Ok value

  let compare = String.compare
  let equal = String.equal
  let to_string value = value
end

module Element_id = Make_id ()
module Relation_id = Make_id ()
module Container_id = Make_id ()

type endpoint = {
  element_id : Element_id.t;
  port_key : CG.Port_key.t;
}

type container_kind =
  | Entry of {
      template_id : CG.Function_template_id.t;
      result_type : Core_type.t;
      captures : CG.capture list;
      dependencies : CG.Function_template_id.t list;
    }
  | Template of {
      template_id : CG.Function_template_id.t;
      parameter_type : Core_type.t;
      result_type : Core_type.t;
      captures : CG.capture list;
      dependencies : CG.Function_template_id.t list;
    }

type container = {
  id : Container_id.t;
  parent : Container_id.t option;
  kind : container_kind;
}

type element = {
  id : Element_id.t;
  kind : CG.node_kind;
}

type contain = {
  relation_id : Relation_id.t;
  element_id : Element_id.t;
  container_id : Container_id.t;
}

type bind_kind =
  | Bind_parameter of endpoint
  | Bind_result of endpoint
  | Bind_capture of {
      capture_key : CG.Port_key.t;
      target : endpoint;
    }

type bind = {
  relation_id : Relation_id.t;
  container_id : Container_id.t;
  kind : bind_kind;
}

type connect = {
  relation_id : Relation_id.t;
  source : endpoint;
  target : endpoint;
}

type branch = {
  relation_id : Relation_id.t;
  source : endpoint;
  targets : endpoint list;
}

module Raw = struct
  type t = {
    containers : container list;
    elements : element list;
    contains : contain list;
    binds : bind list;
    connects : connect list;
    branches : branch list;
    literals : P.literal list;
    entry_captures : P.entry_capture list;
  }

  let create ~containers ~elements ~contains ~binds ~connects ~branches
      ?(literals = []) ?(entry_captures = []) () =
    { containers; elements; contains; binds; connects; branches; literals; entry_captures }
end

type error =
  | Duplicate_element_id of Element_id.t
  | Duplicate_relation_id of Relation_id.t
  | Duplicate_container_id of Container_id.t
  | Dangling_element of Element_id.t
  | Dangling_container of Container_id.t
  | Dangling_endpoint of endpoint
  | Endpoint_direction_mismatch of {
      endpoint : endpoint;
      expected : CG.Direction.t;
      actual : CG.Direction.t;
    }
  | Endpoint_type_mismatch of {
      relation_id : Relation_id.t;
      expected : Core_type.t;
      actual : Core_type.t;
    }
  | Multiple_input_sources of endpoint
  | Implicit_fanout of endpoint
  | Invalid_branch_target_count of {
      relation_id : Relation_id.t;
      actual : int;
    }
  | Duplicate_branch_target of {
      relation_id : Relation_id.t;
      target : endpoint;
    }
  | Containment_cycle of Container_id.t list
  | Missing_owner of Element_id.t
  | Multiple_owners of Element_id.t
  | Cross_container_connection of {
      relation_id : Relation_id.t;
      source_container : Container_id.t;
      target_container : Container_id.t;
    }
  | Missing_parameter_bind of Container_id.t
  | Duplicate_parameter_bind of Container_id.t
  | Missing_result_bind of Container_id.t
  | Duplicate_result_bind of Container_id.t
  | Missing_capture_bind of {
      container_id : Container_id.t;
      capture_key : CG.Port_key.t;
    }
  | Duplicate_capture_bind of {
      container_id : Container_id.t;
      capture_key : CG.Port_key.t;
    }
  | Unexpected_capture_bind of {
      container_id : Container_id.t;
      capture_key : CG.Port_key.t;
    }
  | Generated_id_collision of CG.Node_id.t
  | Missing_entry_container
  | Multiple_entry_containers of Container_id.t list
  | Core_validation_errors of CG.validation_error list
  | Program_package_validation_errors of P.validation_error list

type t = {
  canonical : string;
  package : P.t;
}

let lower_to_program_package t = t.package
let canonical_view t = t.canonical

let endpoint_compare (left : endpoint) (right : endpoint) =
  match Element_id.compare left.element_id right.element_id with
  | 0 -> CG.Port_key.compare left.port_key right.port_key
  | value -> value

let endpoint_equal (left : endpoint) (right : endpoint) = endpoint_compare left right = 0

let endpoint_to_string (endpoint : endpoint) =
  Element_id.to_string endpoint.element_id ^ "."
  ^ CG.Port_key.to_string endpoint.port_key

let node_id value =
  match CG.Node_id.of_string value with Ok id -> id | Error message -> failwith message

let edge_id value =
  match CG.Edge_id.of_string value with Ok id -> id | Error message -> failwith message

let generated_node_id value = node_id ("__sym_" ^ value)
let generated_edge_id value = edge_id ("__sym_" ^ value)
let element_node_id id = node_id (Element_id.to_string id)

let relation_suffix id = Relation_id.to_string id
let container_suffix id = Container_id.to_string id

let parameter_node_id container_id =
  generated_node_id (container_suffix container_id ^ "_parameter")

let result_node_id container_id =
  generated_node_id (container_suffix container_id ^ "_result")

let capture_node_id container_id capture_key =
  generated_node_id
    (container_suffix container_id ^ "_capture_" ^ CG.Port_key.to_string capture_key)

let branch_copy_node_id relation_id index =
  generated_node_id
    ("branch_" ^ relation_suffix relation_id ^ "_copy_" ^ string_of_int index)

let find_duplicate compare values =
  let sorted = List.sort compare values in
  let rec loop = function
    | left :: (right :: _ as rest) ->
        if compare left right = 0 then Some left else loop rest
    | [] | [ _ ] -> None
  in
  loop sorted

let sorted_containers raw =
  List.sort
    (fun (left : container) (right : container) ->
      Container_id.compare left.id right.id)
    raw.Raw.containers

let sorted_elements raw =
  List.sort
    (fun (left : element) (right : element) -> Element_id.compare left.id right.id)
    raw.Raw.elements

let element_lookup raw id =
  List.find_opt
    (fun (element : element) -> Element_id.equal element.id id)
    raw.Raw.elements

let container_lookup raw id =
  List.find_opt
    (fun (container : container) -> Container_id.equal container.id id)
    raw.Raw.containers

let element_owner raw element_id =
  raw.Raw.contains
  |> List.filter (fun (contain : contain) ->
         Element_id.equal contain.element_id element_id)
  |> List.map (fun (contain : contain) -> contain.container_id)

let port_of_endpoint raw (endpoint : endpoint) =
  match element_lookup raw endpoint.element_id with
  | None -> None
  | Some element ->
      CG.ports_of_node_kind element.kind
      |> List.find_opt (fun port -> CG.Port_key.equal port.CG.key endpoint.port_key)

let endpoint_type raw (endpoint : endpoint) =
  Option.map (fun (port : CG.port) -> port.typ) (port_of_endpoint raw endpoint)

let endpoint_direction raw (endpoint : endpoint) =
  Option.map (fun (port : CG.port) -> port.direction) (port_of_endpoint raw endpoint)

let duplicate_errors (raw : Raw.t) =
  let relation_ids =
    List.map (fun (contain : contain) -> contain.relation_id) raw.Raw.contains
    @ List.map (fun (bind : bind) -> bind.relation_id) raw.binds
    @ List.map (fun (connect : connect) -> connect.relation_id) raw.connects
    @ List.map (fun (branch : branch) -> branch.relation_id) raw.branches
  in
  let element_errors =
    match
      find_duplicate Element_id.compare
        (List.map (fun (element : element) -> element.id) raw.elements)
    with
    | Some id -> [ Duplicate_element_id id ]
    | None -> []
  in
  let container_errors =
    match
      find_duplicate Container_id.compare
        (List.map (fun (container : container) -> container.id) raw.containers)
    with
    | Some id -> [ Duplicate_container_id id ]
    | None -> []
  in
  let relation_errors =
    match find_duplicate Relation_id.compare relation_ids with
    | Some id -> [ Duplicate_relation_id id ]
    | None -> []
  in
  element_errors @ container_errors @ relation_errors

let dangling_errors (raw : Raw.t) =
  let contain_errors =
    raw.Raw.contains
    |> List.fold_left
         (fun errors contain ->
           let errors =
             if Option.is_none (element_lookup raw contain.element_id) then
               Dangling_element contain.element_id :: errors
             else errors
           in
           if Option.is_none (container_lookup raw contain.container_id) then
             Dangling_container contain.container_id :: errors
           else errors)
         []
  in
  let endpoint_errors endpoints =
    endpoints
    |> List.filter (fun endpoint -> Option.is_none (port_of_endpoint raw endpoint))
    |> List.sort_uniq endpoint_compare
    |> List.map (fun endpoint -> Dangling_endpoint endpoint)
  in
  let bind_container_errors =
    raw.binds
    |> List.filter_map (fun bind ->
           if Option.is_none (container_lookup raw bind.container_id) then
             Some (Dangling_container bind.container_id)
           else None)
  in
  let bind_endpoints =
    raw.binds
    |> List.map (fun bind ->
           match bind.kind with
           | Bind_parameter endpoint | Bind_result endpoint -> [ endpoint ]
           | Bind_capture { target; _ } -> [ target ])
    |> List.concat
  in
  let connect_endpoints =
    raw.connects
    |> List.map (fun (connect : connect) -> [ connect.source; connect.target ])
    |> List.concat
  in
  let branch_endpoints =
    raw.branches
    |> List.map (fun (branch : branch) -> branch.source :: branch.targets)
    |> List.concat
  in
  List.rev contain_errors @ bind_container_errors
  @ endpoint_errors (bind_endpoints @ connect_endpoints @ branch_endpoints)

let ownership_errors (raw : Raw.t) =
  sorted_elements raw
  |> List.fold_left
       (fun errors element ->
         match element_owner raw element.id with
         | [] -> Missing_owner element.id :: errors
         | [ _ ] -> errors
         | _ :: _ :: _ -> Multiple_owners element.id :: errors)
       []
  |> List.rev

let containment_cycle_errors (raw : Raw.t) =
  let rec visit path (container : container) =
    if List.exists (Container_id.equal container.id) path then
      Some (List.rev (container.id :: path))
    else
      match container.parent with
      | None -> None
      | Some parent_id -> (
          match container_lookup raw parent_id with
          | None -> None
          | Some parent -> visit (container.id :: path) parent)
  in
  sorted_containers raw
  |> List.filter_map (fun (container : container) ->
         match visit [] container with
         | Some cycle -> Some (Containment_cycle cycle)
         | None -> None)

let direction_errors (raw : Raw.t) =
  let check _relation_id endpoint expected errors =
    match endpoint_direction raw endpoint with
    | None -> errors
    | Some actual ->
        if CG.Direction.equal actual expected then errors
        else Endpoint_direction_mismatch { endpoint; expected; actual } :: errors
  in
  let errors =
    raw.connects
    |> List.fold_left
         (fun errors (connect : connect) ->
           errors
           |> check connect.relation_id connect.source CG.Direction.Output
           |> check connect.relation_id connect.target CG.Direction.Input)
         []
  in
  let errors =
    raw.branches
    |> List.fold_left
         (fun errors (branch : branch) ->
           let errors = check branch.relation_id branch.source CG.Direction.Output errors in
           List.fold_left
             (fun errors target -> check branch.relation_id target CG.Direction.Input errors)
             errors branch.targets)
         errors
  in
  let errors =
    raw.binds
    |> List.fold_left
         (fun errors (bind : bind) ->
           match bind.kind with
           | Bind_parameter target | Bind_capture { target; _ } ->
               check bind.relation_id target CG.Direction.Input errors
           | Bind_result source -> check bind.relation_id source CG.Direction.Output errors)
         errors
  in
  List.rev errors

let type_mismatch_errors (raw : Raw.t) =
  let compare relation_id source target errors =
    match (endpoint_type raw source, endpoint_type raw target) with
    | Some expected, Some actual when not (Core_type.equal expected actual) ->
        Endpoint_type_mismatch { relation_id; expected; actual } :: errors
    | _ -> errors
  in
  let errors =
    raw.connects
    |> List.fold_left
         (fun errors (connect : connect) ->
           compare connect.relation_id connect.source connect.target errors)
         []
  in
  let errors =
    raw.branches
    |> List.fold_left
         (fun errors (branch : branch) ->
           List.fold_left
             (fun errors target -> compare branch.relation_id branch.source target errors)
             errors branch.targets)
         errors
  in
  List.rev errors

let branch_errors (raw : Raw.t) =
  raw.branches
  |> List.fold_left
       (fun errors (branch : branch) ->
         let errors =
           if List.length branch.targets < 2 then
             Invalid_branch_target_count
               { relation_id = branch.relation_id; actual = List.length branch.targets }
             :: errors
           else errors
         in
         match find_duplicate endpoint_compare branch.targets with
         | Some target -> Duplicate_branch_target { relation_id = branch.relation_id; target } :: errors
         | None -> errors)
       []
  |> List.rev

let connection_policy_errors (raw : Raw.t) =
  let target_sources =
    (raw.connects
    |> List.map (fun (connect : connect) -> (connect.target, connect.source)))
    @ (raw.branches
      |> List.map (fun (branch : branch) ->
             List.map (fun target -> (target, branch.source)) branch.targets)
      |> List.concat)
  in
  let input_errors =
    target_sources |> List.map fst
    |> List.sort endpoint_compare
    |> fun targets ->
    let rec loop errors = function
      | left :: (right :: _ as rest) ->
          if endpoint_equal left right then loop (Multiple_input_sources left :: errors) rest
          else loop errors rest
      | [] | [ _ ] -> errors
    in
    loop [] targets
  in
  let connect_sources =
    raw.connects
    |> List.map (fun (connect : connect) -> connect.source)
    |> List.sort endpoint_compare
  in
  let rec fanout errors = function
    | left :: (right :: _ as rest) ->
        if endpoint_equal left right then fanout (Implicit_fanout left :: errors) rest
        else fanout errors rest
    | [] | [ _ ] -> errors
  in
  List.rev (input_errors @ fanout [] connect_sources)

let cross_container_errors (raw : Raw.t) =
  let owner (endpoint : endpoint) =
    match element_owner raw endpoint.element_id with [ id ] -> Some id | _ -> None
  in
  let check (relation_id : Relation_id.t) (source : endpoint) (target : endpoint) errors =
    match (owner source, owner target) with
    | Some source_container, Some target_container
      when not (Container_id.equal source_container target_container) ->
        Cross_container_connection { relation_id; source_container; target_container } :: errors
    | _ -> errors
  in
  let errors =
    raw.connects
    |> List.fold_left
         (fun errors (connect : connect) ->
           check connect.relation_id connect.source connect.target errors)
         []
  in
  raw.branches
  |> List.fold_left
       (fun errors (branch : branch) ->
         List.fold_left
           (fun errors target -> check branch.relation_id branch.source target errors)
           errors branch.targets)
       errors
  |> List.rev

let container_captures = function
  | Entry { captures; _ } -> captures
  | Template { captures; _ } -> captures

let binding_errors (raw : Raw.t) =
  sorted_containers raw
  |> List.fold_left
       (fun errors (container : container) ->
         let binds =
           raw.binds
           |> List.filter (fun bind -> Container_id.equal bind.container_id container.id)
         in
         let parameter_count =
           List.filter
             (function { kind = Bind_parameter _; _ } -> true | _ -> false)
             binds
           |> List.length
         in
         let result_count =
           List.filter
             (function { kind = Bind_result _; _ } -> true | _ -> false)
             binds
           |> List.length
         in
         let errors =
           (if parameter_count = 0 then Missing_parameter_bind container.id :: errors
            else if parameter_count > 1 then Duplicate_parameter_bind container.id :: errors
            else errors)
         in
         let errors =
           if result_count = 0 then Missing_result_bind container.id :: errors
           else if result_count > 1 then Duplicate_result_bind container.id :: errors
           else errors
         in
         let expected_captures = container_captures container.kind in
         let actual_capture_binds =
           binds
           |> List.filter_map (function
                | { kind = Bind_capture { capture_key; _ }; _ } -> Some capture_key
                | _ -> None)
         in
         let errors =
           expected_captures
           |> List.fold_left
                (fun errors (capture : CG.capture) ->
                  let count =
                    actual_capture_binds
                    |> List.filter (CG.Port_key.equal capture.key)
                    |> List.length
                  in
                  if count = 0 then
                    Missing_capture_bind { container_id = container.id; capture_key = capture.key }
                    :: errors
                  else if count > 1 then
                    Duplicate_capture_bind { container_id = container.id; capture_key = capture.key }
                    :: errors
                  else errors)
                errors
         in
         let errors =
           actual_capture_binds
           |> List.fold_left
                (fun errors capture_key ->
                  if
                    List.exists
                      (fun (capture : CG.capture) -> CG.Port_key.equal capture.key capture_key)
                      expected_captures
                  then errors
                  else Unexpected_capture_bind { container_id = container.id; capture_key } :: errors)
                errors
         in
         errors)
       []
  |> List.rev

let generated_ids (raw : Raw.t) =
  let boundary_ids =
    raw.Raw.containers
    |> List.map (fun (container : container) ->
           let capture_ids =
             container_captures container.kind
             |> List.map (fun (capture : CG.capture) ->
                    capture_node_id container.id capture.key)
           in
           parameter_node_id container.id :: result_node_id container.id :: capture_ids)
    |> List.concat
  in
  let branch_ids =
    raw.branches
    |> List.map (fun branch ->
           branch.targets
           |> List.mapi (fun index _ -> if index = 0 then None else Some (branch_copy_node_id branch.relation_id (index - 1)))
           |> List.filter_map Fun.id)
    |> List.concat
  in
  boundary_ids @ branch_ids

let generated_collision_errors (raw : Raw.t) =
  let user_ids = raw.Raw.elements |> List.map (fun element -> element_node_id element.id) in
  generated_ids raw
  |> List.filter (fun id -> List.exists (CG.Node_id.equal id) user_ids)
  |> List.sort_uniq CG.Node_id.compare
  |> List.map (fun id -> Generated_id_collision id)

let pre_validation_errors (raw : Raw.t) =
  duplicate_errors raw @ dangling_errors raw @ ownership_errors raw
  @ containment_cycle_errors raw @ direction_errors raw @ type_mismatch_errors raw
  @ branch_errors raw @ connection_policy_errors raw @ cross_container_errors raw
  @ binding_errors raw @ generated_collision_errors raw

let endpoint_port_ref (endpoint : endpoint) =
  { CG.node_id = element_node_id endpoint.element_id; port_key = endpoint.port_key }

let edge id source target = { CG.id = id; source; target }

let bind_for_container (raw : Raw.t) (container : container) =
  raw.Raw.binds
  |> List.filter (fun bind -> Container_id.equal bind.container_id container.id)

let container_elements (raw : Raw.t) container_id =
  raw.Raw.contains
  |> List.filter (fun (contain : contain) ->
         Container_id.equal contain.container_id container_id)
  |> List.filter_map (fun (contain : contain) -> element_lookup raw contain.element_id)
  |> List.sort (fun left right -> Element_id.compare left.id right.id)

let container_connects (raw : Raw.t) container_id =
  raw.Raw.connects
  |> List.filter (fun (connect : connect) ->
         match element_owner raw connect.source.element_id with
         | [ owner ] -> Container_id.equal owner container_id
         | _ -> false)
  |> List.sort (fun (left : connect) (right : connect) ->
         Relation_id.compare left.relation_id right.relation_id)

let container_branches (raw : Raw.t) container_id =
  raw.Raw.branches
  |> List.filter (fun (branch : branch) ->
         match element_owner raw branch.source.element_id with
         | [ owner ] -> Container_id.equal owner container_id
         | _ -> false)
  |> List.sort (fun (left : branch) (right : branch) ->
         Relation_id.compare left.relation_id right.relation_id)

let node id kind = { CG.id; kind }

let boundary_nodes (container : container) =
  let parameter_type, result_type, captures =
    match container.kind with
    | Entry { result_type; captures; _ } -> (Core_type.Unit, result_type, captures)
    | Template { parameter_type; result_type; captures; _ } ->
        (parameter_type, result_type, captures)
  in
  node (parameter_node_id container.id) (CG.Parameter parameter_type)
  :: node (result_node_id container.id) (CG.Result result_type)
  :: List.map
       (fun (capture : CG.capture) ->
         node (capture_node_id container.id capture.key) (CG.Capture capture))
       captures

let branch_copy_nodes raw container_id =
  container_branches raw container_id
  |> List.map (fun branch ->
         match endpoint_type raw branch.source with
         | None -> []
         | Some typ ->
             branch.targets
             |> List.mapi (fun index _ ->
                    if index = 0 then None
                    else Some (node (branch_copy_node_id branch.relation_id (index - 1)) (CG.Copy typ)))
             |> List.filter_map Fun.id)
  |> List.concat

let binding_edges (raw : Raw.t) (container : container) =
  bind_for_container raw container
  |> List.map (fun bind ->
         match bind.kind with
         | Bind_parameter target ->
             edge
               (generated_edge_id
                  ("bind_" ^ relation_suffix bind.relation_id ^ "_parameter"))
               { CG.node_id = parameter_node_id container.id; port_key = CG.Port_key.value }
               (endpoint_port_ref target)
         | Bind_result source ->
             edge
               (generated_edge_id
                  ("bind_" ^ relation_suffix bind.relation_id ^ "_result"))
               (endpoint_port_ref source)
               { CG.node_id = result_node_id container.id; port_key = CG.Port_key.value }
         | Bind_capture { capture_key; target } ->
             edge
               (generated_edge_id
                  ("bind_" ^ relation_suffix bind.relation_id ^ "_capture"))
               { CG.node_id = capture_node_id container.id capture_key; port_key = CG.Port_key.value }
               (endpoint_port_ref target))

let connect_edges raw container_id =
  container_connects raw container_id
  |> List.map (fun (connect : connect) ->
         edge
           (generated_edge_id ("connect_" ^ relation_suffix connect.relation_id))
           (endpoint_port_ref connect.source) (endpoint_port_ref connect.target))

let branch_edges raw container_id =
  container_branches raw container_id
  |> List.map (fun (branch : branch) ->
         let rec edges_for index source_ref targets =
           match targets with
           | [] -> []
           | [ target ] ->
               [
                 edge
                   (generated_edge_id
                      ("branch_" ^ relation_suffix branch.relation_id ^ "_target_"
                     ^ string_of_int index))
                   source_ref (endpoint_port_ref target);
               ]
           | target :: rest ->
               let copy_id = branch_copy_node_id branch.relation_id index in
               edge
                 (generated_edge_id
                    ("branch_" ^ relation_suffix branch.relation_id ^ "_copy_in_"
                   ^ string_of_int index))
                 source_ref { CG.node_id = copy_id; port_key = CG.Port_key.input }
               :: edge
                    (generated_edge_id
                       ("branch_" ^ relation_suffix branch.relation_id ^ "_target_"
                      ^ string_of_int index))
                    { CG.node_id = copy_id; port_key = CG.Port_key.left }
                    (endpoint_port_ref target)
               :: edges_for (index + 1)
                    { CG.node_id = copy_id; port_key = CG.Port_key.right }
                    rest
         in
         edges_for 0 (endpoint_port_ref branch.source) branch.targets)
  |> List.concat

let executable_node_ids nodes =
  nodes
  |> List.filter (fun (node : CG.node) -> CG.is_executable_node_kind node.CG.kind)
  |> List.map (fun (node : CG.node) -> node.CG.id)
  |> List.sort CG.Node_id.compare

let raw_graph_for_container (raw : Raw.t) (container : container) =
  let user_nodes =
    container_elements raw container.id
    |> List.map (fun element -> node (element_node_id element.id) element.kind)
  in
  let generated_nodes = boundary_nodes container @ branch_copy_nodes raw container.id in
  let nodes = user_nodes @ generated_nodes in
  let edges =
    binding_edges raw container @ connect_edges raw container.id
    @ branch_edges raw container.id
  in
  let default_node_order = executable_node_ids nodes in
  CG.Raw_graph.of_lists ~nodes ~edges ~default_node_order

let container_dependencies = function
  | Entry { dependencies; _ } | Template { dependencies; _ } -> dependencies

let lower raw =
  let containers = sorted_containers raw in
  let template_containers =
    containers
    |> List.filter (fun (container : container) ->
           match container.kind with Template _ -> true | Entry _ -> false)
  in
  let entry_containers =
    containers
    |> List.filter (fun (container : container) ->
           match container.kind with Entry _ -> true | Template _ -> false)
  in
  let rec build built remaining =
    match remaining with
    | [] -> Ok built
    | _ ->
        let ready, blocked =
          remaining
          |> List.partition (fun (container : container) ->
                 container_dependencies container.kind
                 |> List.for_all (fun dependency ->
                        List.exists
                          (fun template ->
                            CG.Function_template_id.equal (CG.Function_template.id template) dependency)
                          built))
        in
        if ready = [] then
          Error [ Core_validation_errors [ CG.Function_template_cycle [] ] ]
        else
          let result =
            ready
            |> List.fold_left
                 (fun acc container ->
                   match acc with
                   | Error _ as error -> error
                   | Ok built -> (
                       let raw_graph = raw_graph_for_container raw container in
                       match CG.validate_with_templates built raw_graph with
                       | Error errors -> Error [ Core_validation_errors errors ]
                       | Ok body -> (
                           match container.kind with
                           | Entry _ -> Ok built
                           | Template
                               {
                                 template_id;
                                 parameter_type;
                                 result_type;
                                 captures;
                                 dependencies;
                               } ->
                               Ok
                                 (CG.Function_template.create ~dependencies
                                    ~id:template_id ~parameter_type ~result_type
                                    ~captures ~body ()
                                 :: built))))
                 (Ok built)
          in
          (match result with Error _ as error -> error | Ok built -> build built blocked)
  in
  match entry_containers with
  | [ entry_container ] -> (
      match build [] template_containers with
      | Error errors -> Error errors
      | Ok templates -> (
          let raw_graph = raw_graph_for_container raw entry_container in
          match CG.validate_with_templates templates raw_graph with
          | Error errors -> Error [ Core_validation_errors errors ]
          | Ok body -> (
              match entry_container.kind with
              | Template _ -> assert false
              | Entry { template_id; result_type; captures; dependencies } ->
                  let entry_template =
                    CG.Function_template.create ~dependencies ~id:template_id
                      ~parameter_type:Core_type.Unit ~result_type ~captures ~body ()
                  in
                  let templates =
                    entry_template :: templates
                    |> List.sort (fun left right ->
                           CG.Function_template_id.compare
                             (CG.Function_template.id left)
                             (CG.Function_template.id right))
                  in
                  let raw_package =
                    P.Raw.create ~templates ~entry_template_id:template_id
                      ~result_type ~literals:raw.literals
                      ~entry_captures:raw.entry_captures ()
                  in
                  match P.validate raw_package with
                  | Ok package -> Ok package
                  | Error errors -> Error [ Program_package_validation_errors errors ])))
  | [] -> Error [ Missing_entry_container ]
  | entries ->
      Error
        [
          Multiple_entry_containers
            (entries
            |> List.map (fun (container : container) -> container.id)
            |> List.sort Container_id.compare);
        ]

let canonical_of_package package =
  Program_package_serialization.encode package

let validate raw =
  let errors = pre_validation_errors raw in
  if errors <> [] then Error (List.sort compare errors)
  else
    match lower raw with
    | Error errors -> Error (List.sort compare errors)
    | Ok package ->
        Ok { package; canonical = canonical_of_package package }

let render_error = function
  | Duplicate_element_id id -> "duplicate element: " ^ Element_id.to_string id
  | Duplicate_relation_id id -> "duplicate relation: " ^ Relation_id.to_string id
  | Duplicate_container_id id -> "duplicate container: " ^ Container_id.to_string id
  | Dangling_element id -> "dangling element: " ^ Element_id.to_string id
  | Dangling_container id -> "dangling container: " ^ Container_id.to_string id
  | Dangling_endpoint endpoint -> "dangling endpoint: " ^ endpoint_to_string endpoint
  | Endpoint_direction_mismatch { endpoint; expected; actual } ->
      "endpoint direction mismatch at " ^ endpoint_to_string endpoint ^ ": expected "
      ^ CG.Direction.to_string expected ^ ", actual " ^ CG.Direction.to_string actual
  | Endpoint_type_mismatch { relation_id; expected; actual } ->
      "endpoint type mismatch in " ^ Relation_id.to_string relation_id ^ ": expected "
      ^ Core_type.to_string expected ^ ", actual " ^ Core_type.to_string actual
  | Multiple_input_sources endpoint ->
      "multiple input sources: " ^ endpoint_to_string endpoint
  | Implicit_fanout endpoint -> "implicit fanout: " ^ endpoint_to_string endpoint
  | Invalid_branch_target_count { relation_id; actual } ->
      "invalid branch target count in " ^ Relation_id.to_string relation_id ^ ": "
      ^ string_of_int actual
  | Duplicate_branch_target { relation_id; target } ->
      "duplicate branch target in " ^ Relation_id.to_string relation_id ^ ": "
      ^ endpoint_to_string target
  | Containment_cycle ids ->
      "containment cycle: " ^ String.concat " -> " (List.map Container_id.to_string ids)
  | Missing_owner id -> "missing owner: " ^ Element_id.to_string id
  | Multiple_owners id -> "multiple owners: " ^ Element_id.to_string id
  | Cross_container_connection { relation_id; source_container; target_container } ->
      "cross-container connection " ^ Relation_id.to_string relation_id ^ ": "
      ^ Container_id.to_string source_container ^ " -> "
      ^ Container_id.to_string target_container
  | Missing_parameter_bind id -> "missing parameter bind: " ^ Container_id.to_string id
  | Duplicate_parameter_bind id -> "duplicate parameter bind: " ^ Container_id.to_string id
  | Missing_result_bind id -> "missing result bind: " ^ Container_id.to_string id
  | Duplicate_result_bind id -> "duplicate result bind: " ^ Container_id.to_string id
  | Missing_capture_bind { container_id; capture_key } ->
      "missing capture bind: " ^ Container_id.to_string container_id ^ "."
      ^ CG.Port_key.to_string capture_key
  | Duplicate_capture_bind { container_id; capture_key } ->
      "duplicate capture bind: " ^ Container_id.to_string container_id ^ "."
      ^ CG.Port_key.to_string capture_key
  | Unexpected_capture_bind { container_id; capture_key } ->
      "unexpected capture bind: " ^ Container_id.to_string container_id ^ "."
      ^ CG.Port_key.to_string capture_key
  | Generated_id_collision id -> "generated ID collision: " ^ CG.Node_id.to_string id
  | Missing_entry_container -> "missing entry container"
  | Multiple_entry_containers ids ->
      "multiple entry containers: "
      ^ String.concat ", " (List.map Container_id.to_string ids)
  | Core_validation_errors errors ->
      "core validation: "
      ^ String.concat "; " (List.map CG.validation_error_to_string errors)
  | Program_package_validation_errors errors ->
      "program package validation: "
      ^ String.concat "; " (List.map P.validation_error_to_string errors)
