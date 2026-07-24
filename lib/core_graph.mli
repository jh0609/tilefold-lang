module Node_id : sig
  type t

  val of_string : string -> (t, string) result
  val equal : t -> t -> bool
  val compare : t -> t -> int
  val to_string : t -> string
end

module Edge_id : sig
  type t

  val of_string : string -> (t, string) result
  val equal : t -> t -> bool
  val compare : t -> t -> int
  val to_string : t -> string
end

module Port_key : sig
  type t

  val of_string : string -> (t, string) result
  val value : t
  val input : t
  val result : t
  val left : t
  val right : t
  val capture : string -> t
  val equal : t -> t -> bool
  val compare : t -> t -> int
  val to_string : t -> string
end

module Function_template_id : sig
  type t

  val of_string : string -> (t, string) result
  val equal : t -> t -> bool
  val compare : t -> t -> int
  val to_string : t -> string
end

module Direction : sig
  type t =
    | Input
    | Output

  val equal : t -> t -> bool
  val to_string : t -> string
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

val ports_of_node_kind : node_kind -> port list
val is_executable_node_kind : node_kind -> bool

module Raw_graph : sig
  type t

  val of_lists :
    nodes:node list -> edges:edge list -> default_node_order:Node_id.t list -> t

  val of_lists_with_priority_spine :
    nodes:node list ->
    edges:edge list ->
    default_node_order:Node_id.t list ->
    priority_spine:Node_id.t list option ->
    t

  val nodes : t -> node list
  val edges : t -> edge list
  val default_node_order : t -> Node_id.t list
  val priority_spine : t -> Node_id.t list option
end

module Validated_graph : sig
  type t

  val nodes : t -> node list
  val edges : t -> edge list
  val parameter_node : t -> node
  val result_node : t -> node
  val parameter_type : t -> Core_type.t
  val result_type : t -> Core_type.t
  val template_type : t -> Core_type.t
  val port_schema : t -> Node_id.t -> port list option
  val default_node_order : t -> Node_id.t list
  val priority_spine : t -> Node_id.t list option
end

module Function_template : sig
  type t

  val create :
    ?dependencies:Function_template_id.t list ->
    id:Function_template_id.t ->
    parameter_type:Core_type.t ->
    result_type:Core_type.t ->
    captures:capture list ->
    body:Validated_graph.t ->
    unit ->
    t

  val id : t -> Function_template_id.t
  val parameter_type : t -> Core_type.t
  val result_type : t -> Core_type.t
  val captures : t -> capture list
  val body : t -> Validated_graph.t
  val dependencies : t -> Function_template_id.t list
  val signature_type : t -> Core_type.t
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

val validate : Raw_graph.t -> (Validated_graph.t, validation_error list) result

val validate_with_templates :
  Function_template.t list ->
  Raw_graph.t ->
  (Validated_graph.t, validation_error list) result

val validation_error_to_string : validation_error -> string
