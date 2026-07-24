module Value_id : sig
  type t

  val equal : t -> t -> bool
  val compare : t -> t -> int
  val to_string : t -> string
end

module Instance_id : sig
  type t =
    | Root
    | Call of {
        parent : t;
        apply_node : Core_graph.Node_id.t;
        call_index : int;
      }

  val root : t
  val call : parent:t -> apply_node:Core_graph.Node_id.t -> call_index:int -> t
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
  | Literal of {
      instance_id : Instance_id.t;
      node_id : Core_graph.Node_id.t;
    }
  | Rewrite_output of {
      instance_id : Instance_id.t;
      event_index : int;
      node_id : Core_graph.Node_id.t;
      port_key : Core_graph.Port_key.t;
    }

val create : id:Value_id.t -> payload:payload -> origin:origin -> t
val execution_input_id : Value_id.t
val literal_id : Instance_id.t -> Core_graph.Node_id.t -> Value_id.t
val rewrite_output_id :
  Instance_id.t -> int -> Core_graph.Node_id.t -> Core_graph.Port_key.t -> Value_id.t
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
