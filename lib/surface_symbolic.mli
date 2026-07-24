module Element_id : sig
  type t

  val of_string : string -> (t, string) result
  val compare : t -> t -> int
  val equal : t -> t -> bool
  val to_string : t -> string
end

module Relation_id : sig
  type t

  val of_string : string -> (t, string) result
  val compare : t -> t -> int
  val equal : t -> t -> bool
  val to_string : t -> string
end

module Container_id : sig
  type t

  val of_string : string -> (t, string) result
  val compare : t -> t -> int
  val equal : t -> t -> bool
  val to_string : t -> string
end

type endpoint = {
  element_id : Element_id.t;
  port_key : Core_graph.Port_key.t;
}

type container_kind =
  | Entry of {
      template_id : Core_graph.Function_template_id.t;
      result_type : Core_type.t;
      captures : Core_graph.capture list;
      dependencies : Core_graph.Function_template_id.t list;
    }
  | Template of {
      template_id : Core_graph.Function_template_id.t;
      parameter_type : Core_type.t;
      result_type : Core_type.t;
      captures : Core_graph.capture list;
      dependencies : Core_graph.Function_template_id.t list;
    }

type container = {
  id : Container_id.t;
  parent : Container_id.t option;
  kind : container_kind;
}

type element = {
  id : Element_id.t;
  kind : Core_graph.node_kind;
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
      capture_key : Core_graph.Port_key.t;
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

module Raw : sig
  type t

  val create :
    containers:container list ->
    elements:element list ->
    contains:contain list ->
    binds:bind list ->
    connects:connect list ->
    branches:branch list ->
    ?literals:Program_package.literal list ->
    ?entry_captures:Program_package.entry_capture list ->
    unit ->
    t
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
      expected : Core_graph.Direction.t;
      actual : Core_graph.Direction.t;
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
      capture_key : Core_graph.Port_key.t;
    }
  | Duplicate_capture_bind of {
      container_id : Container_id.t;
      capture_key : Core_graph.Port_key.t;
    }
  | Unexpected_capture_bind of {
      container_id : Container_id.t;
      capture_key : Core_graph.Port_key.t;
    }
  | Generated_id_collision of Core_graph.Node_id.t
  | Missing_entry_container
  | Multiple_entry_containers of Container_id.t list
  | Core_validation_errors of Core_graph.validation_error list
  | Program_package_validation_errors of Program_package.validation_error list

type t

val validate : Raw.t -> (t, error list) result
val lower_to_program_package : t -> Program_package.t
val canonical_view : t -> string
val render_error : error -> string
