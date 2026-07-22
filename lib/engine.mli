type initialization_error =
  | Input_type_mismatch of {
      expected : Core_type.t;
      actual : Core_type.t;
    }
  | Unsupported_runtime_input_type of Core_type.t
  | Initial_delivery_invariant_violation of string

type ready_candidate = {
  node_id : Core_graph.Node_id.t;
  ready_epoch : int;
  default_order_rank : int;
}

type stuck_reason = {
  unexecuted_nodes : Core_graph.Node_id.t list;
  result_missing : bool;
}

module Machine : sig
  type t

  val ready_candidates : t -> ready_candidate list
  val result_value : t -> Runtime_value.t option
  val trace_events : t -> Rewrite_event.t list
  val values : t -> Runtime_value.t list
  val is_completed : t -> bool
end

type step_result =
  | Rewritten of {
      machine : Machine.t;
      event : Rewrite_event.t;
    }
  | Completed of Runtime_value.t
  | Stuck of stuck_reason

type run_result =
  | Run_completed of {
      value : Runtime_value.t;
      trace : Rewrite_event.t list;
    }
  | Run_stuck of {
      reason : stuck_reason;
      trace : Rewrite_event.t list;
    }

val initialize :
  Core_graph.Validated_graph.t ->
  input:Runtime_value.payload ->
  (Machine.t, initialization_error) result

val step : Machine.t -> step_result
val run : Machine.t -> run_result
val initialization_error_to_string : initialization_error -> string
