module Value_id : sig
  type t

  val equal : t -> t -> bool
  val compare : t -> t -> int
  val to_string : t -> string
end

type payload =
  | Unit
  | Nat of Nat.t

type origin =
  | Execution_input
  | Program_literal of Core_graph.Node_id.t
  | Rewrite_output of {
      event_index : int;
      node_id : Core_graph.Node_id.t;
      port_key : Core_graph.Port_key.t;
    }

type t

val create : id:Value_id.t -> payload:payload -> origin:origin -> t
val execution_input_id : Value_id.t
val program_literal_id : Core_graph.Node_id.t -> Value_id.t
val rewrite_output_id : int -> Core_graph.Node_id.t -> Core_graph.Port_key.t -> Value_id.t
val id : t -> Value_id.t
val payload : t -> payload
val origin : t -> origin
val payload_type : payload -> Core_type.t
val typ : t -> Core_type.t
val payload_equal : payload -> payload -> bool
val equal : t -> t -> bool
val to_string : t -> string
val origin_to_string : origin -> string
