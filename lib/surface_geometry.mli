module Wire_id : sig
  type t

  val of_string : string -> (t, string) result
  val compare : t -> t -> int
  val equal : t -> t -> bool
  val to_string : t -> string
end

module Junction_id : sig
  type t

  val of_string : string -> (t, string) result
  val compare : t -> t -> int
  val equal : t -> t -> bool
  val to_string : t -> string
end

module Boundary_id : sig
  type t

  val of_string : string -> (t, string) result
  val compare : t -> t -> int
  val equal : t -> t -> bool
  val to_string : t -> string
end

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
  id : Surface_symbolic.Element_id.t;
  kind : Core_graph.node_kind;
  bounds : bounds;
  ports : (Core_graph.Port_key.t * point) list;
}

type container = {
  id : Surface_symbolic.Container_id.t;
  kind : Surface_symbolic.container_kind;
  bounds : bounds;
}

type boundary_role =
  | Boundary_parameter
  | Boundary_result
  | Boundary_capture of Core_graph.Port_key.t

type boundary_port = {
  id : Boundary_id.t;
  container_id : Surface_symbolic.Container_id.t;
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

module Raw_scene : sig
  type t

  val create :
    tolerance:coord ->
    containers:container list ->
    elements:element list ->
    boundary_ports:boundary_port list ->
    wires:wire list ->
    junctions:branch_junction list ->
    ?literals:Program_package.literal list ->
    ?entry_captures:Program_package.entry_capture list ->
    unit ->
    t
end

type validation_error =
  | Empty_scene
  | Duplicate_element_id of Surface_symbolic.Element_id.t
  | Duplicate_container_id of Surface_symbolic.Container_id.t
  | Duplicate_boundary_id of Boundary_id.t
  | Duplicate_wire_id of Wire_id.t
  | Duplicate_junction_id of Junction_id.t
  | Invalid_bounds of bounds
  | Invalid_tolerance of coord
  | Coordinate_out_of_range of point
  | Port_outside_element of {
      element_id : Surface_symbolic.Element_id.t;
      port_key : Core_graph.Port_key.t;
      position : point;
    }
  | Boundary_port_not_on_container_boundary of Boundary_id.t
  | Invalid_polyline of Wire_id.t
  | Zero_length_wire of Wire_id.t
  | Dangling_container_reference of Surface_symbolic.Container_id.t
  | Duplicate_branch_outlet_order of {
      junction_id : Junction_id.t;
      order : int;
    }
  | Invalid_branch_outlet_count of {
      junction_id : Junction_id.t;
      actual : int;
    }
  | Container_without_owner of Surface_symbolic.Container_id.t
  | Container_partially_outside_parent of {
      container_id : Surface_symbolic.Container_id.t;
      parent_id : Surface_symbolic.Container_id.t;
    }
  | Overlapping_sibling_containers of {
      left : Surface_symbolic.Container_id.t;
      right : Surface_symbolic.Container_id.t;
    }
  | Element_without_owner of Surface_symbolic.Element_id.t
  | Element_partially_outside_owner of {
      element_id : Surface_symbolic.Element_id.t;
      container_id : Surface_symbolic.Container_id.t;
    }
  | Ambiguous_element_owner of {
      element_id : Surface_symbolic.Element_id.t;
      candidates : Surface_symbolic.Container_id.t list;
    }

type validated_scene

val validate : Raw_scene.t -> (validated_scene, validation_error list) result
val canonical_view : validated_scene -> string
val render_validation_error : validation_error -> string

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
      source_container : Surface_symbolic.Container_id.t;
      target_container : Surface_symbolic.Container_id.t;
    }
  | Invalid_bind_direction of {
      wire_id : Wire_id.t;
      role : boundary_role;
    }
  | Generated_relation_id_collision of Surface_symbolic.Relation_id.t
  | Symbolic_validation_failed of Surface_symbolic.error list

val infer : validated_scene -> (Surface_symbolic.Raw.t, inference_error list) result

val infer_and_validate_symbolic :
  validated_scene -> (Surface_symbolic.t, inference_error list) result

val render_inference_error : inference_error -> string
