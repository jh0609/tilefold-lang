module SS = Surface_symbolic
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

module Wire_id = Make_id ()
module Junction_id = Make_id ()
module Boundary_id = Make_id ()

type coord = int

type point = {
  x : coord;
  y : coord;
}

type bounds = {
  left : coord;
  top : coord;
  right : coord;
  bottom : coord;
}

type element = {
  id : SS.Element_id.t;
  kind : CG.node_kind;
  bounds : bounds;
  ports : (CG.Port_key.t * point) list;
}

type container = {
  id : SS.Container_id.t;
  kind : SS.container_kind;
  bounds : bounds;
}

type boundary_role =
  | Boundary_parameter
  | Boundary_result
  | Boundary_capture of CG.Port_key.t

type boundary_port = {
  id : Boundary_id.t;
  container_id : SS.Container_id.t;
  role : boundary_role;
  typ : Core_type.t;
  position : point;
}

type wire = {
  id : Wire_id.t;
  points : point list;
}

type branch_outlet = {
  order : int;
  position : point;
}

type branch_junction = {
  id : Junction_id.t;
  position : point;
  outlets : branch_outlet list;
}

module Raw_scene = struct
  type t = {
    tolerance : coord;
    containers : container list;
    elements : element list;
    boundary_ports : boundary_port list;
    wires : wire list;
    junctions : branch_junction list;
    literals : P.literal list;
    entry_captures : P.entry_capture list;
  }

  let create ~tolerance ~containers ~elements ~boundary_ports ~wires ~junctions
      ?(literals = []) ?(entry_captures = []) () =
    {
      tolerance;
      containers;
      elements;
      boundary_ports;
      wires;
      junctions;
      literals;
      entry_captures;
    }
end

type validation_error =
  | Empty_scene
  | Duplicate_element_id of SS.Element_id.t
  | Duplicate_container_id of SS.Container_id.t
  | Duplicate_boundary_id of Boundary_id.t
  | Duplicate_wire_id of Wire_id.t
  | Duplicate_junction_id of Junction_id.t
  | Invalid_bounds of bounds
  | Invalid_tolerance of coord
  | Coordinate_out_of_range of point
  | Port_outside_element of {
      element_id : SS.Element_id.t;
      port_key : CG.Port_key.t;
      position : point;
    }
  | Boundary_port_not_on_container_boundary of Boundary_id.t
  | Invalid_polyline of Wire_id.t
  | Zero_length_wire of Wire_id.t
  | Dangling_container_reference of SS.Container_id.t
  | Duplicate_branch_outlet_order of {
      junction_id : Junction_id.t;
      order : int;
    }
  | Invalid_branch_outlet_count of {
      junction_id : Junction_id.t;
      actual : int;
    }
  | Container_without_owner of SS.Container_id.t
  | Container_partially_outside_parent of {
      container_id : SS.Container_id.t;
      parent_id : SS.Container_id.t;
    }
  | Overlapping_sibling_containers of {
      left : SS.Container_id.t;
      right : SS.Container_id.t;
    }
  | Element_without_owner of SS.Element_id.t
  | Element_partially_outside_owner of {
      element_id : SS.Element_id.t;
      container_id : SS.Container_id.t;
    }
  | Ambiguous_element_owner of {
      element_id : SS.Element_id.t;
      candidates : SS.Container_id.t list;
    }

type validated_scene = {
  raw : Raw_scene.t;
  containers : SS.container list;
  contains : SS.contain list;
  owner_of_element : (SS.Element_id.t * SS.Container_id.t) list;
  canonical : string;
}

type endpoint_candidate =
  | Element_port of {
      element_id : SS.Element_id.t;
      port_key : CG.Port_key.t;
      direction : CG.Direction.t;
      typ : Core_type.t;
      owner : SS.Container_id.t;
    }
  | Boundary of {
      boundary_id : Boundary_id.t;
      container_id : SS.Container_id.t;
      role : boundary_role;
      typ : Core_type.t;
    }
  | Junction_center of Junction_id.t
  | Junction_outlet of {
      junction_id : Junction_id.t;
      order : int;
    }

type snapped = {
  candidate : endpoint_candidate;
}

type inference_error =
  | Geometry_validation_failed of validation_error list
  | Endpoint_has_no_candidate of {
      wire_id : Wire_id.t;
      side : string;
      point : point;
    }
  | Endpoint_has_ambiguous_candidates of {
      wire_id : Wire_id.t;
      side : string;
      point : point;
      candidates : string list;
    }
  | Invalid_wire_direction of Wire_id.t
  | Input_used_as_source of Wire_id.t
  | Output_used_as_target of Wire_id.t
  | Type_mismatch of {
      wire_id : Wire_id.t;
      expected : Core_type.t;
      actual : Core_type.t;
    }
  | Multiple_sources_for_input of string
  | Implicit_fanout_without_junction of string
  | Junction_without_incoming_wire of Junction_id.t
  | Junction_with_multiple_incoming_wires of Junction_id.t
  | Junction_with_too_few_outgoing_wires of {
      junction_id : Junction_id.t;
      actual : int;
    }
  | Duplicate_branch_target of {
      junction_id : Junction_id.t;
      target : string;
    }
  | Unsupported_junction_chain of Junction_id.t
  | Cross_container_wire_without_bind of {
      wire_id : Wire_id.t;
      source_container : SS.Container_id.t;
      target_container : SS.Container_id.t;
    }
  | Invalid_bind_direction of {
      wire_id : Wire_id.t;
      role : boundary_role;
    }
  | Generated_relation_id_collision of SS.Relation_id.t
  | Symbolic_validation_failed of SS.error list

let max_abs_coord = 1_000_000_000

let point_compare left right =
  match Int.compare left.x right.x with 0 -> Int.compare left.y right.y | value -> value

let point_to_string point = string_of_int point.x ^ "," ^ string_of_int point.y

let bounds_to_string bounds =
  String.concat ","
    [
      string_of_int bounds.left;
      string_of_int bounds.top;
      string_of_int bounds.right;
      string_of_int bounds.bottom;
    ]

let role_to_string = function
  | Boundary_parameter -> "parameter"
  | Boundary_result -> "result"
  | Boundary_capture key -> "capture:" ^ CG.Port_key.to_string key

let component value = string_of_int (String.length value) ^ ":" ^ value

let relation_id prefix components =
  let text = "__geo_rel_" ^ prefix ^ "_"
    ^ String.concat "|" (List.map component components)
  in
  match SS.Relation_id.of_string text with Ok id -> id | Error message -> failwith message

let endpoint_of element_id port_key = { SS.element_id; port_key }

let find_duplicate compare values =
  let rec loop = function
    | left :: (right :: _ as rest) ->
        if compare left right = 0 then Some left else loop rest
    | [] | [ _ ] -> None
  in
  loop (List.sort compare values)

let coordinate_valid point =
  point.x >= -max_abs_coord && point.x <= max_abs_coord
  && point.y >= -max_abs_coord && point.y <= max_abs_coord

let bounds_valid bounds =
  bounds.left < bounds.right && bounds.top < bounds.bottom
  && coordinate_valid { x = bounds.left; y = bounds.top }
  && coordinate_valid { x = bounds.right; y = bounds.bottom }

let point_in_bounds point bounds =
  point.x >= bounds.left && point.x <= bounds.right && point.y >= bounds.top
  && point.y <= bounds.bottom

let bounds_inside inner outer =
  inner.left >= outer.left && inner.top >= outer.top && inner.right <= outer.right
  && inner.bottom <= outer.bottom

let strict_bounds_overlap left right =
  left.left < right.right && right.left < left.right && left.top < right.bottom
  && right.top < left.bottom

let area bounds =
  Int64.mul
    (Int64.of_int (bounds.right - bounds.left))
    (Int64.of_int (bounds.bottom - bounds.top))

let boundary_point_on_bounds point bounds =
  point_in_bounds point bounds
  && (point.x = bounds.left || point.x = bounds.right || point.y = bounds.top
     || point.y = bounds.bottom)

let port_schema kind port_key =
  CG.ports_of_node_kind kind
  |> List.find_opt (fun port -> CG.Port_key.equal port.CG.key port_key)

let duplicate_errors raw =
  let one compare make values =
    match find_duplicate compare values with Some value -> [ make value ] | None -> []
  in
  one SS.Element_id.compare
    (fun id -> Duplicate_element_id id)
    (List.map (fun (element : element) -> element.id) raw.Raw_scene.elements)
  @ one SS.Container_id.compare
      (fun id -> Duplicate_container_id id)
      (List.map (fun (container : container) -> container.id) raw.containers)
  @ one Boundary_id.compare
      (fun id -> Duplicate_boundary_id id)
      (List.map (fun (boundary : boundary_port) -> boundary.id) raw.boundary_ports)
  @ one Wire_id.compare
      (fun id -> Duplicate_wire_id id)
      (List.map (fun (wire : wire) -> wire.id) raw.wires)
  @ one Junction_id.compare
      (fun id -> Duplicate_junction_id id)
      (List.map (fun (junction : branch_junction) -> junction.id) raw.junctions)

let container_lookup raw id =
  List.find_opt
    (fun (container : container) -> SS.Container_id.equal container.id id)
    raw.Raw_scene.containers

let element_lookup raw id =
  List.find_opt
    (fun (element : element) -> SS.Element_id.equal element.id id)
    raw.Raw_scene.elements

let sorted_containers raw =
  raw.Raw_scene.containers
  |> List.sort (fun (left : container) (right : container) ->
         SS.Container_id.compare left.id right.id)

let sorted_elements raw =
  raw.Raw_scene.elements
  |> List.sort (fun (left : element) (right : element) ->
         SS.Element_id.compare left.id right.id)

let geometry_errors raw =
  let errors =
    if raw.Raw_scene.containers = [] then [ Empty_scene ] else []
  in
  let errors =
    if raw.tolerance < 0 then Invalid_tolerance raw.tolerance :: errors else errors
  in
  let errors =
    raw.containers
    |> List.fold_left
         (fun errors container ->
           if bounds_valid container.bounds then errors
           else Invalid_bounds container.bounds :: errors)
         errors
  in
  let errors =
    raw.elements
    |> List.fold_left
         (fun errors (element : element) ->
           let errors =
             if bounds_valid element.bounds then errors
             else Invalid_bounds element.bounds :: errors
           in
           element.ports
           |> List.fold_left
                (fun errors (port_key, position) ->
                  let errors =
                    if coordinate_valid position then errors
                    else Coordinate_out_of_range position :: errors
                  in
                  if
                    point_in_bounds position element.bounds
                    && Option.is_some (port_schema element.kind port_key)
                  then errors
                  else
                    Port_outside_element { element_id = element.id; port_key; position }
                    :: errors)
                errors)
         errors
  in
  let errors =
    raw.boundary_ports
    |> List.fold_left
         (fun errors (boundary : boundary_port) ->
           match container_lookup raw boundary.container_id with
           | None -> Dangling_container_reference boundary.container_id :: errors
           | Some container ->
               if boundary_point_on_bounds boundary.position container.bounds then errors
               else Boundary_port_not_on_container_boundary boundary.id :: errors)
         errors
  in
  let errors =
    raw.wires
    |> List.fold_left
         (fun errors (wire : wire) ->
           let errors =
             if List.length wire.points < 2 then Invalid_polyline wire.id :: errors else errors
           in
           let errors =
             wire.points
             |> List.fold_left
                  (fun errors point ->
                    if coordinate_valid point then errors
                    else Coordinate_out_of_range point :: errors)
                  errors
           in
           match wire.points with
           | first :: rest
             when List.for_all (fun point -> point_compare first point = 0) rest ->
               Zero_length_wire wire.id :: errors
           | _ -> errors)
         errors
  in
  raw.junctions
  |> List.fold_left
       (fun errors (junction : branch_junction) ->
         let errors =
           if List.length junction.outlets < 2 then
             Invalid_branch_outlet_count
               { junction_id = junction.id; actual = List.length junction.outlets }
             :: errors
           else errors
         in
         let errors =
           match find_duplicate Int.compare (List.map (fun outlet -> outlet.order) junction.outlets) with
           | Some order -> Duplicate_branch_outlet_order { junction_id = junction.id; order } :: errors
           | None -> errors
         in
         let errors =
           if coordinate_valid junction.position then errors
           else Coordinate_out_of_range junction.position :: errors
         in
         junction.outlets
         |> List.fold_left
              (fun errors (outlet : branch_outlet) ->
                if coordinate_valid outlet.position then errors
                else Coordinate_out_of_range outlet.position :: errors)
              errors)
       errors

let owner_for_bounds raw bounds =
  let candidates =
    raw.Raw_scene.containers
    |> List.filter (fun container -> bounds_inside bounds container.bounds)
    |> List.sort (fun left right ->
           match Int64.compare (area left.bounds) (area right.bounds) with
           | 0 -> SS.Container_id.compare left.id right.id
           | value -> value)
  in
  match candidates with
  | [] -> Error []
  | first :: rest ->
      let same_area =
        rest |> List.filter (fun container -> Int64.equal (area container.bounds) (area first.bounds))
      in
      if same_area = [] then Ok first.id
      else Error (first.id :: List.map (fun (container : container) -> container.id) same_area)

let containment_errors_and_relations raw =
  let element_results =
    sorted_elements raw
    |> List.map (fun (element : element) ->
           match owner_for_bounds raw element.bounds with
           | Ok owner ->
               ( [],
                 Some
                   {
                     SS.relation_id =
                       relation_id "contain"
                         [
                           SS.Container_id.to_string owner;
                           SS.Element_id.to_string element.id;
                         ];
                     element_id = element.id;
                     container_id = owner;
                   },
                 Some (element.id, owner) )
           | Error [] -> ([ Element_without_owner element.id ], None, None)
           | Error candidates ->
               ( [ Ambiguous_element_owner { element_id = element.id; candidates } ],
                 None,
                 None ))
  in
  let element_errors, contains, owners =
    List.fold_left
      (fun (errors, contains, owners) (next_errors, contain, owner) ->
        ( next_errors @ errors,
          (match contain with Some value -> value :: contains | None -> contains),
          (match owner with Some value -> value :: owners | None -> owners) ))
      ([], [], []) element_results
  in
  let container_parent (container : container) =
    let candidates =
      raw.Raw_scene.containers
      |> List.filter (fun (candidate : container) ->
             not (SS.Container_id.equal candidate.id container.id)
             && bounds_inside container.bounds candidate.bounds)
      |> List.sort (fun (left : container) (right : container) ->
             match Int64.compare (area left.bounds) (area right.bounds) with
             | 0 -> SS.Container_id.compare left.id right.id
             | value -> value)
    in
    match candidates with [] -> None | parent :: _ -> Some parent.id
  in
  let parent_pairs =
    sorted_containers raw
    |> List.map (fun (container : container) -> (container.id, container_parent container))
  in
  let container_errors =
    sorted_containers raw
    |> List.fold_left
         (fun errors (container : container) ->
           let parent = container_parent container in
           let errors =
             match parent with
             | None -> errors
             | Some parent_id -> (
                 match container_lookup raw parent_id with
                 | Some parent when bounds_inside container.bounds parent.bounds -> errors
                 | _ ->
                     Container_partially_outside_parent
                       { container_id = container.id; parent_id }
                     :: errors)
           in
           let siblings =
             raw.containers
             |> List.filter (fun (other : container) ->
                    not (SS.Container_id.equal other.id container.id)
                    && Option.equal SS.Container_id.equal (container_parent other) parent
                    && SS.Container_id.compare container.id other.id < 0)
           in
           siblings
           |> List.fold_left
                (fun errors other ->
                  if strict_bounds_overlap container.bounds other.bounds then
                    Overlapping_sibling_containers { left = container.id; right = other.id }
                    :: errors
                  else errors)
                errors)
         []
  in
  (element_errors @ container_errors, List.rev contains, List.rev owners, parent_pairs)

let canonical_of_scene raw (contains : SS.contain list) parent_pairs =
  let parent_for id =
    match
      parent_pairs
      |> List.find_opt (fun (candidate, _) -> SS.Container_id.equal candidate id)
    with
    | None -> None
    | Some (_, parent) -> parent
  in
  let containers =
    sorted_containers raw
    |> List.map (fun (container : container) ->
           let parent =
             parent_for container.id
             |> Option.map SS.Container_id.to_string
             |> Option.value ~default:"-"
           in
           "container(" ^ SS.Container_id.to_string container.id ^ "," ^ parent ^ ","
           ^ bounds_to_string container.bounds ^ ")")
  in
  let elements =
    sorted_elements raw
    |> List.map (fun (element : element) ->
           "element(" ^ SS.Element_id.to_string element.id ^ ","
           ^ bounds_to_string element.bounds ^ ")")
  in
  let contains =
    contains
    |> List.sort (fun (left : SS.contain) (right : SS.contain) ->
           SS.Relation_id.compare left.SS.relation_id right.SS.relation_id)
    |> List.map (fun (contain : SS.contain) ->
           "contain(" ^ SS.Relation_id.to_string contain.SS.relation_id ^ ")")
  in
  String.concat "\n" (containers @ elements @ contains)

let validate raw =
  let duplicate_errors = duplicate_errors raw in
  let geometry_errors = geometry_errors raw in
  let containment_errors, contains, owners, parent_pairs =
    containment_errors_and_relations raw
  in
  let errors =
    duplicate_errors @ geometry_errors @ containment_errors |> List.sort compare
  in
  if errors <> [] then Error errors
  else
    let containers =
      sorted_containers raw
      |> List.map (fun (container : container) ->
             let parent =
               match
                 parent_pairs
                 |> List.find_opt (fun (id, _) -> SS.Container_id.equal id container.id)
               with
               | None -> None
               | Some (_, parent) -> parent
             in
             { SS.id = container.id; parent; kind = container.kind })
    in
    Ok
      {
        raw;
        containers;
        contains;
        owner_of_element = owners;
        canonical = canonical_of_scene raw contains parent_pairs;
      }

let canonical_view scene = scene.canonical

let endpoint_candidate_to_string = function
  | Element_port { element_id; port_key; _ } ->
      "element:" ^ SS.Element_id.to_string element_id ^ "."
      ^ CG.Port_key.to_string port_key
  | Boundary { boundary_id; _ } -> "boundary:" ^ Boundary_id.to_string boundary_id
  | Junction_center id -> "junction:" ^ Junction_id.to_string id ^ ":center"
  | Junction_outlet { junction_id; order } ->
      "junction:" ^ Junction_id.to_string junction_id ^ ":outlet:" ^ string_of_int order

let candidate_position raw = function
  | Element_port { element_id; port_key; _ } ->
      (match element_lookup raw element_id with
      | None -> None
      | Some element ->
          element.ports
          |> List.find_opt (fun (key, _) -> CG.Port_key.equal key port_key)
          |> Option.map snd)
  | Boundary { boundary_id; _ } ->
      raw.Raw_scene.boundary_ports
      |> List.find_opt (fun (boundary : boundary_port) ->
             Boundary_id.equal boundary.id boundary_id)
      |> Option.map (fun (boundary : boundary_port) -> boundary.position)
  | Junction_center id ->
      raw.junctions
      |> List.find_opt (fun (junction : branch_junction) ->
             Junction_id.equal junction.id id)
      |> Option.map (fun (junction : branch_junction) -> junction.position)
  | Junction_outlet { junction_id; order } ->
      (match
         raw.junctions
         |> List.find_opt (fun (junction : branch_junction) ->
                Junction_id.equal junction.id junction_id)
       with
      | None -> None
      | Some junction ->
          junction.outlets
          |> List.find_opt (fun (outlet : branch_outlet) -> outlet.order = order)
          |> Option.map (fun (outlet : branch_outlet) -> outlet.position))

let distance2 left right =
  let dx = Int64.of_int (left.x - right.x) in
  let dy = Int64.of_int (left.y - right.y) in
  Int64.add (Int64.mul dx dx) (Int64.mul dy dy)

let candidates scene =
  let element_candidates =
    scene.raw.elements
    |> List.map (fun (element : element) ->
           let owner =
             scene.owner_of_element
             |> List.find (fun (id, _) -> SS.Element_id.equal id element.id)
             |> snd
           in
           element.ports
           |> List.filter_map (fun (port_key, _) ->
                  port_schema element.kind port_key
                  |> Option.map (fun port ->
                         Element_port
                           {
                             element_id = element.id;
                             port_key;
                             direction = port.CG.direction;
                             typ = port.typ;
                             owner;
                           })))
    |> List.concat
  in
  let boundary_candidates =
    scene.raw.boundary_ports
    |> List.map (fun (boundary : boundary_port) ->
           Boundary
             {
               boundary_id = boundary.id;
               container_id = boundary.container_id;
               role = boundary.role;
               typ = boundary.typ;
             })
  in
  let junction_candidates =
    scene.raw.junctions
    |> List.map (fun junction ->
           Junction_center junction.id
           :: (junction.outlets
              |> List.map (fun outlet ->
                     Junction_outlet { junction_id = junction.id; order = outlet.order })))
    |> List.concat
  in
  element_candidates @ boundary_candidates @ junction_candidates

let snap scene wire_id side point =
  let tolerance2 =
    let tolerance = Int64.of_int scene.raw.tolerance in
    Int64.mul tolerance tolerance
  in
  let in_range =
    candidates scene
    |> List.filter_map (fun candidate ->
           match candidate_position scene.raw candidate with
           | None -> None
           | Some candidate_point ->
               let distance = distance2 point candidate_point in
               if Int64.compare distance tolerance2 <= 0 then Some (candidate, distance)
               else None)
  in
  match in_range with
  | [] -> Error (Endpoint_has_no_candidate { wire_id; side; point })
  | _ ->
      let minimum =
        in_range |> List.map snd |> List.sort Int64.compare |> List.hd
      in
      let nearest =
        in_range
        |> List.filter (fun (_, distance) -> Int64.equal distance minimum)
        |> List.map fst
        |> List.sort (fun left right ->
               String.compare (endpoint_candidate_to_string left)
                 (endpoint_candidate_to_string right))
      in
      (match nearest with
      | [ candidate ] -> Ok { candidate }
      | candidates ->
          Error
            (Endpoint_has_ambiguous_candidates
               {
                 wire_id;
                 side;
                 point;
                 candidates = List.map endpoint_candidate_to_string candidates;
               }))

type snapped_wire = {
  wire : wire;
  source : snapped;
  target : snapped;
}

let snap_wires scene =
  scene.raw.wires
  |> List.fold_left
       (fun acc wire ->
         match acc with
         | Error _ as error -> error
         | Ok wires -> (
             match (wire.points, List.rev wire.points) with
             | source_point :: _, target_point :: _ -> (
                 match
                   ( snap scene wire.id "source" source_point,
                     snap scene wire.id "target" target_point )
                 with
                 | Ok source, Ok target ->
                     Ok ({ wire; source; target } :: wires)
                 | Error error, _ | _, Error error -> Error [ error ])
             | _ -> Error [ Endpoint_has_no_candidate { wire_id = wire.id; side = "source"; point = { x = 0; y = 0 } } ]))
       (Ok [])
  |> Result.map List.rev

let symbolic_endpoint = function
  | Element_port { element_id; port_key; _ } -> Some (endpoint_of element_id port_key)
  | _ -> None

let symbolic_endpoint_to_string (endpoint : SS.endpoint) =
  SS.Element_id.to_string endpoint.element_id ^ "."
  ^ CG.Port_key.to_string endpoint.port_key

let element_owner scene element_id =
  scene.owner_of_element
  |> List.find_opt (fun (id, _) -> SS.Element_id.equal id element_id)
  |> Option.map snd

let candidate_type = function
  | Element_port { typ; _ } | Boundary { typ; _ } -> Some typ
  | Junction_center _ | Junction_outlet _ -> None

let candidate_direction = function
  | Element_port { direction; _ } -> Some direction
  | Boundary { role = Boundary_result; _ } -> Some CG.Direction.Input
  | Boundary { role = Boundary_parameter | Boundary_capture _; _ } -> Some CG.Direction.Output
  | Junction_center _ | Junction_outlet _ -> None

let validate_type wire_id source target errors =
  match (candidate_type source, candidate_type target) with
  | Some expected, Some actual when not (Core_type.equal expected actual) ->
      Type_mismatch { wire_id; expected; actual } :: errors
  | _ -> errors

let validate_direction wire_id source target errors =
  let errors =
    match candidate_direction source with
    | Some direction when CG.Direction.equal direction CG.Direction.Input ->
        Input_used_as_source wire_id :: errors
    | _ -> errors
  in
  match candidate_direction target with
  | Some direction when CG.Direction.equal direction CG.Direction.Output ->
      Output_used_as_target wire_id :: errors
  | _ -> errors

let relation_id_collision_errors ids =
  let rec loop errors = function
    | left :: (right :: _ as rest) ->
        if SS.Relation_id.equal left right then
          loop (Generated_relation_id_collision left :: errors) rest
        else loop errors rest
    | [] | [ _ ] -> errors
  in
  loop [] (List.sort SS.Relation_id.compare ids)

let infer_relations scene snapped_wires =
  let relation_ids = ref [] in
  let make_id prefix components =
    let id = relation_id prefix components in
    relation_ids := id :: !relation_ids;
    id
  in
  let incoming_to_junction, outgoing_from_junction, ordinary_wires =
    snapped_wires
    |> List.fold_left
         (fun (incoming, outgoing, ordinary) snapped ->
           match (snapped.source.candidate, snapped.target.candidate) with
           | _, Junction_center id -> ((id, snapped) :: incoming, outgoing, ordinary)
           | Junction_outlet { junction_id; order }, _ ->
               (incoming, (junction_id, order, snapped) :: outgoing, ordinary)
           | Junction_center id, _ -> ((id, snapped) :: incoming, outgoing, ordinary)
           | _, _ -> (incoming, outgoing, snapped :: ordinary))
         ([], [], [])
  in
  let errors =
    snapped_wires
    |> List.fold_left
         (fun errors snapped ->
           errors
           |> validate_direction snapped.wire.id snapped.source.candidate snapped.target.candidate
           |> validate_type snapped.wire.id snapped.source.candidate snapped.target.candidate)
         []
  in
  let bind_or_connect snapped (connects, binds, errors) =
    match (snapped.source.candidate, snapped.target.candidate) with
    | Boundary { container_id; role = Boundary_parameter; _ }, Element_port { element_id; port_key; _ } ->
        let relation_id =
          make_id "bind"
            [
              SS.Container_id.to_string container_id;
              role_to_string Boundary_parameter;
              Wire_id.to_string snapped.wire.id;
            ]
        in
        ( connects,
          { SS.relation_id; container_id; kind = SS.Bind_parameter (endpoint_of element_id port_key) }
          :: binds,
          errors )
    | Boundary { container_id; role = Boundary_capture capture_key; _ }, Element_port { element_id; port_key; _ } ->
        let relation_id =
          make_id "bind"
            [
              SS.Container_id.to_string container_id;
              role_to_string (Boundary_capture capture_key);
              Wire_id.to_string snapped.wire.id;
            ]
        in
        ( connects,
          {
            SS.relation_id;
            container_id;
            kind =
              SS.Bind_capture
                { capture_key; target = endpoint_of element_id port_key };
          }
          :: binds,
          errors )
    | Element_port { element_id; port_key; _ }, Boundary { container_id; role = Boundary_result; _ } ->
        let relation_id =
          make_id "bind"
            [
              SS.Container_id.to_string container_id;
              role_to_string Boundary_result;
              Wire_id.to_string snapped.wire.id;
            ]
        in
        ( connects,
          { SS.relation_id; container_id; kind = SS.Bind_result (endpoint_of element_id port_key) }
          :: binds,
          errors )
    | Boundary { role; _ }, _ | _, Boundary { role; _ } ->
        (connects, binds, Invalid_bind_direction { wire_id = snapped.wire.id; role } :: errors)
    | Element_port { element_id = source_element; port_key = source_port; _ },
      Element_port { element_id = target_element; port_key = target_port; _ } -> (
        match (element_owner scene source_element, element_owner scene target_element) with
        | Some source_container, Some target_container
          when not (SS.Container_id.equal source_container target_container) ->
            ( connects,
              binds,
              Cross_container_wire_without_bind
                { wire_id = snapped.wire.id; source_container; target_container }
              :: errors )
        | _ ->
            let relation_id =
              make_id "connect"
                [
                  Wire_id.to_string snapped.wire.id;
                  SS.Element_id.to_string source_element;
                  CG.Port_key.to_string source_port;
                  SS.Element_id.to_string target_element;
                  CG.Port_key.to_string target_port;
                ]
            in
            ( {
                SS.relation_id;
                source = endpoint_of source_element source_port;
                target = endpoint_of target_element target_port;
              }
              :: connects,
              binds,
              errors ))
    | Junction_center id, _ | Junction_outlet { junction_id = id; _ }, _
    | _, Junction_center id | _, Junction_outlet { junction_id = id; _ } ->
        (connects, binds, Unsupported_junction_chain id :: errors)
  in
  let connects, binds, errors =
    ordinary_wires
    |> List.fold_left
         (fun acc snapped -> bind_or_connect snapped acc)
         ([], [], errors)
  in
  let branch_results =
    scene.raw.junctions
    |> List.map (fun junction ->
           let incoming =
             incoming_to_junction
             |> List.filter (fun (id, _) -> Junction_id.equal id junction.id)
             |> List.map snd
           in
           let outgoing =
             outgoing_from_junction
             |> List.filter (fun (id, _, _) -> Junction_id.equal id junction.id)
             |> List.sort (fun (_, left_order, _) (_, right_order, _) ->
                    Int.compare left_order right_order)
           in
           (junction, incoming, outgoing))
  in
  let branches, errors =
    branch_results
    |> List.fold_left
         (fun (branches, errors) (junction, incoming, outgoing) ->
           let errors =
             match incoming with
             | [] -> Junction_without_incoming_wire junction.id :: errors
             | [ _ ] -> errors
             | _ -> Junction_with_multiple_incoming_wires junction.id :: errors
           in
           let errors =
             if List.length outgoing < 2 then
               Junction_with_too_few_outgoing_wires
                 { junction_id = junction.id; actual = List.length outgoing }
               :: errors
             else errors
           in
           match incoming with
           | [ incoming_wire ] when List.length outgoing >= 2 -> (
               match symbolic_endpoint incoming_wire.source.candidate with
               | None -> (branches, Unsupported_junction_chain junction.id :: errors)
               | Some source ->
                   let targets =
                     outgoing
                     |> List.filter_map (fun (_, _, snapped) ->
                            symbolic_endpoint snapped.target.candidate)
                   in
                   let errors =
                     if List.length targets <> List.length outgoing then
                       Unsupported_junction_chain junction.id :: errors
                     else errors
                   in
                   let duplicate = targets |> List.map symbolic_endpoint_to_string in
                   let errors =
                     match find_duplicate String.compare duplicate with
                     | Some target -> Duplicate_branch_target { junction_id = junction.id; target } :: errors
                     | None -> errors
                   in
                   let relation_id =
                     make_id "branch" [ Junction_id.to_string junction.id ]
                   in
                   ( { SS.relation_id; source; targets } :: branches,
                     errors ))
           | _ -> (branches, errors))
         ([], errors)
  in
  let all_relation_ids =
    (connects |> List.map (fun (value : SS.connect) -> value.SS.relation_id))
    @ (binds |> List.map (fun (value : SS.bind) -> value.SS.relation_id))
    @ (branches |> List.map (fun (value : SS.branch) -> value.SS.relation_id))
    @ (scene.contains |> List.map (fun (value : SS.contain) -> value.SS.relation_id))
  in
  let errors =
    relation_id_collision_errors all_relation_ids @ errors
  in
  if errors <> [] then Error (List.sort compare errors)
  else
    Ok
      ( List.sort
          (fun (left : SS.connect) (right : SS.connect) ->
            SS.Relation_id.compare left.SS.relation_id right.SS.relation_id)
          connects,
        List.sort
          (fun (left : SS.bind) (right : SS.bind) ->
            SS.Relation_id.compare left.SS.relation_id right.SS.relation_id)
          binds,
        List.sort
          (fun (left : SS.branch) (right : SS.branch) ->
            SS.Relation_id.compare left.SS.relation_id right.SS.relation_id)
          branches )

let infer scene =
  match snap_wires scene with
  | Error errors -> Error (List.sort compare errors)
  | Ok snapped_wires -> (
      match infer_relations scene snapped_wires with
      | Error errors -> Error errors
      | Ok (connects, binds, branches) ->
          let raw =
            SS.Raw.create ~containers:scene.containers
              ~elements:
                (scene.raw.elements
                |> List.sort (fun (left : element) (right : element) ->
                       SS.Element_id.compare left.id right.id)
                |> List.map (fun (element : element) ->
                       { SS.id = element.id; kind = element.kind }))
              ~contains:scene.contains ~binds ~connects ~branches
              ~literals:scene.raw.literals ~entry_captures:scene.raw.entry_captures
              ()
          in
          Ok raw)

let infer_and_validate_symbolic scene =
  match infer scene with
  | Error errors -> Error errors
  | Ok raw -> (
      match SS.validate raw with
      | Ok value -> Ok value
      | Error errors -> Error [ Symbolic_validation_failed errors ])

let render_validation_error = function
  | Empty_scene -> "empty scene"
  | Duplicate_element_id id -> "duplicate element: " ^ SS.Element_id.to_string id
  | Duplicate_container_id id -> "duplicate container: " ^ SS.Container_id.to_string id
  | Duplicate_boundary_id id -> "duplicate boundary: " ^ Boundary_id.to_string id
  | Duplicate_wire_id id -> "duplicate wire: " ^ Wire_id.to_string id
  | Duplicate_junction_id id -> "duplicate junction: " ^ Junction_id.to_string id
  | Invalid_bounds bounds -> "invalid bounds: " ^ bounds_to_string bounds
  | Invalid_tolerance tolerance -> "invalid tolerance: " ^ string_of_int tolerance
  | Coordinate_out_of_range point -> "coordinate out of range: " ^ point_to_string point
  | Port_outside_element { element_id; port_key; position } ->
      "port outside element: " ^ SS.Element_id.to_string element_id ^ "."
      ^ CG.Port_key.to_string port_key ^ " at " ^ point_to_string position
  | Boundary_port_not_on_container_boundary id ->
      "boundary port not on container boundary: " ^ Boundary_id.to_string id
  | Invalid_polyline id -> "invalid polyline: " ^ Wire_id.to_string id
  | Zero_length_wire id -> "zero-length wire: " ^ Wire_id.to_string id
  | Dangling_container_reference id ->
      "dangling container reference: " ^ SS.Container_id.to_string id
  | Duplicate_branch_outlet_order { junction_id; order } ->
      "duplicate branch outlet order: " ^ Junction_id.to_string junction_id ^ "."
      ^ string_of_int order
  | Invalid_branch_outlet_count { junction_id; actual } ->
      "invalid branch outlet count: " ^ Junction_id.to_string junction_id ^ "."
      ^ string_of_int actual
  | Container_without_owner id -> "container without owner: " ^ SS.Container_id.to_string id
  | Container_partially_outside_parent { container_id; parent_id } ->
      "container partially outside parent: " ^ SS.Container_id.to_string container_id
      ^ " in " ^ SS.Container_id.to_string parent_id
  | Overlapping_sibling_containers { left; right } ->
      "overlapping sibling containers: " ^ SS.Container_id.to_string left ^ ", "
      ^ SS.Container_id.to_string right
  | Element_without_owner id -> "element without owner: " ^ SS.Element_id.to_string id
  | Element_partially_outside_owner { element_id; container_id } ->
      "element partially outside owner: " ^ SS.Element_id.to_string element_id ^ " in "
      ^ SS.Container_id.to_string container_id
  | Ambiguous_element_owner { element_id; candidates } ->
      "ambiguous element owner: " ^ SS.Element_id.to_string element_id ^ " candidates="
      ^ String.concat "," (List.map SS.Container_id.to_string candidates)

let render_inference_error = function
  | Geometry_validation_failed errors ->
      "geometry validation failed: "
      ^ String.concat "; " (List.map render_validation_error errors)
  | Endpoint_has_no_candidate { wire_id; side; point } ->
      "endpoint has no candidate: " ^ Wire_id.to_string wire_id ^ "." ^ side
      ^ " at " ^ point_to_string point
  | Endpoint_has_ambiguous_candidates { wire_id; side; point; candidates } ->
      "ambiguous endpoint: " ^ Wire_id.to_string wire_id ^ "." ^ side ^ " at "
      ^ point_to_string point ^ " candidates=" ^ String.concat "," candidates
  | Invalid_wire_direction id -> "invalid wire direction: " ^ Wire_id.to_string id
  | Input_used_as_source id -> "input used as source: " ^ Wire_id.to_string id
  | Output_used_as_target id -> "output used as target: " ^ Wire_id.to_string id
  | Type_mismatch { wire_id; expected; actual } ->
      "type mismatch: " ^ Wire_id.to_string wire_id ^ " expected "
      ^ Core_type.to_string expected ^ " actual " ^ Core_type.to_string actual
  | Multiple_sources_for_input input -> "multiple sources for input: " ^ input
  | Implicit_fanout_without_junction source ->
      "implicit fanout without junction: " ^ source
  | Junction_without_incoming_wire id ->
      "junction without incoming wire: " ^ Junction_id.to_string id
  | Junction_with_multiple_incoming_wires id ->
      "junction with multiple incoming wires: " ^ Junction_id.to_string id
  | Junction_with_too_few_outgoing_wires { junction_id; actual } ->
      "junction with too few outgoing wires: " ^ Junction_id.to_string junction_id
      ^ "." ^ string_of_int actual
  | Duplicate_branch_target { junction_id; target } ->
      "duplicate branch target: " ^ Junction_id.to_string junction_id ^ "." ^ target
  | Unsupported_junction_chain id ->
      "unsupported junction chain: " ^ Junction_id.to_string id
  | Cross_container_wire_without_bind { wire_id; source_container; target_container } ->
      "cross-container wire without bind: " ^ Wire_id.to_string wire_id ^ " "
      ^ SS.Container_id.to_string source_container ^ " -> "
      ^ SS.Container_id.to_string target_container
  | Invalid_bind_direction { wire_id; role } ->
      "invalid bind direction: " ^ Wire_id.to_string wire_id ^ "."
      ^ role_to_string role
  | Generated_relation_id_collision id ->
      "generated relation ID collision: " ^ SS.Relation_id.to_string id
  | Symbolic_validation_failed errors ->
      "symbolic validation failed: "
      ^ String.concat "; " (List.map SS.render_error errors)
