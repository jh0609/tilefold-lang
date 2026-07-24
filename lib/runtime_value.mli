module Value_id : sig
  type t

  val equal : t -> t -> bool
  val compare : t -> t -> int
  val to_string : t -> string
end

type t

type captured_value = {
  capture_key : Core_graph.Port_key.t;
  value : t;
}

type closure = {
  template_id : Core_graph.Function_template_id.t;
  parameter_type : Core_type.t;
  result_type : Core_type.t;
  captures : captured_value list;
}

type payload =
  | Unit
  | Nat of Nat.t
  | Closure of closure

type origin =
  | Execution_input
  | Program_literal of Core_graph.Node_id.t
  | Instance_literal of {
      instance_id : string;
      node_id : Core_graph.Node_id.t;
    }
  | Rewrite_output of {
      event_index : int;
      node_id : Core_graph.Node_id.t;
      port_key : Core_graph.Port_key.t;
    }
  | Scoped_rewrite_output of {
      event_index : int;
      instance_id : string;
      node_id : Core_graph.Node_id.t;
      port_key : Core_graph.Port_key.t;
    }

val create : id:Value_id.t -> payload:payload -> origin:origin -> t
val execution_input_id : Value_id.t
val program_literal_id : Core_graph.Node_id.t -> Value_id.t
val instance_literal_id : string -> Core_graph.Node_id.t -> Value_id.t
val rewrite_output_id : int -> Core_graph.Node_id.t -> Core_graph.Port_key.t -> Value_id.t
val scoped_rewrite_output_id :
  int -> string -> Core_graph.Node_id.t -> Core_graph.Port_key.t -> Value_id.t
val id : t -> Value_id.t
val payload : t -> payload
val origin : t -> origin
val payload_type : payload -> Core_type.t
val typ : t -> Core_type.t
val payload_equal : payload -> payload -> bool
val closure_equal : closure -> closure -> bool
val equal : t -> t -> bool
val to_string : t -> string
val origin_to_string : origin -> string
