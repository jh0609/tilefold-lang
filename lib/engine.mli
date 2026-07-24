type initialization_error =
  | Input_type_mismatch of {
      expected : Core_type.t;
      actual : Core_type.t;
    }
  | Unsupported_runtime_input_type of Core_type.t
  | Initial_delivery_invariant_violation of string

type ready_candidate = {
  instance_id : Runtime_value.Instance_id.t;
  node_id : Core_graph.Node_id.t;
  ready_epoch : int;
  priority_spine_rank : int option;
  default_order_rank : int;
}

type stuck_reason = {
  instance_id : Runtime_value.Instance_id.t;
  unexecuted_nodes : Core_graph.Node_id.t list;
  result_missing : bool;
}

type natrec_phase =
  | Need_unfold
  | Predecessor_ready
  | Waiting_for_step_function of Runtime_value.Instance_id.t
  | Partial_ready
  | Waiting_for_step_accumulator of Runtime_value.Instance_id.t
  | Ready_to_complete

type natrec_state = {
  result_type : Core_type.t;
  count : Runtime_value.t;
  total_count : Nat.t;
  step : Runtime_value.t;
  next_predecessor : Nat.t;
  accumulator : Runtime_value.t;
  predecessor : Runtime_value.t option;
  partial : Runtime_value.t option;
  phase : natrec_phase;
}

type node_state =
  | Pending
  | Waiting_for_return of Runtime_value.Instance_id.t
  | NatRec_active of natrec_state
  | Completed

type runtime_error =
  | Unsupported_copy_payload_type of {
      node_id : Core_graph.Node_id.t;
      typ : Core_type.t;
    }
  | Function_template_not_found of {
      node_id : Core_graph.Node_id.t;
      template_id : Core_graph.Function_template_id.t;
    }
  | Function_capture_delivery_invariant_violation of {
      node_id : Core_graph.Node_id.t;
      message : string;
    }
  | Invalid_arrow_runtime_payload of {
      node_id : Core_graph.Node_id.t;
      expected : Core_type.t;
      actual : Core_type.t;
    }
  | Invalid_apply_runtime_payload of {
      node_id : Core_graph.Node_id.t;
      expected : Core_type.t;
      actual : Core_type.t;
    }
  | Apply_template_not_found of {
      node_id : Core_graph.Node_id.t;
      template_id : Core_graph.Function_template_id.t;
    }
  | Apply_result_type_mismatch of {
      node_id : Core_graph.Node_id.t;
      expected : Core_type.t;
      actual : Core_type.t;
    }
  | Invalid_natrec_runtime_payload of {
      node_id : Core_graph.Node_id.t;
      expected : Core_type.t;
      actual : Core_type.t;
    }
  | NatRec_lifecycle_error of {
      node_id : Core_graph.Node_id.t;
      message : string;
    }
  | Runtime_invariant_violation of string

module Machine : sig
  type t

  val active_instance_id : t -> Runtime_value.Instance_id.t
  val call_depth : t -> int
  val ready_candidates : t -> ready_candidate list
  val result_value : t -> Runtime_value.t option
  val trace_events : t -> Rewrite_event.t list
  val values : t -> Runtime_value.t list
  val node_state :
    t -> instance_id:Runtime_value.Instance_id.t -> Core_graph.Node_id.t -> node_state option
  val is_completed : t -> bool
end

type step_result =
  | Rewritten of {
      machine : Machine.t;
      event : Rewrite_event.t;
    }
  | Completed of Runtime_value.t
  | Stuck of stuck_reason
  | Runtime_error of runtime_error

type run_result =
  | Run_completed of {
      value : Runtime_value.t;
      trace : Rewrite_event.t list;
    }
  | Run_stuck of {
      reason : stuck_reason;
      trace : Rewrite_event.t list;
    }
  | Run_error of {
      error : runtime_error;
      trace : Rewrite_event.t list;
    }

val initialize :
  Core_graph.Validated_graph.t ->
  input:Runtime_value.payload ->
  (Machine.t, initialization_error) result

val initialize_with_templates :
  Core_graph.Function_template.t list ->
  Core_graph.Validated_graph.t ->
  input:Runtime_value.payload ->
  (Machine.t, initialization_error) result

val step : Machine.t -> step_result
val run : Machine.t -> run_result
val initialization_error_to_string : initialization_error -> string
val runtime_error_to_string : runtime_error -> string
