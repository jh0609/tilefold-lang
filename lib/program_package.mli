module Literal_id : sig
  type t

  val of_string : string -> (t, string) result
  val equal : t -> t -> bool
  val compare : t -> t -> int
  val to_string : t -> string
end

type literal = {
  id : Literal_id.t;
  payload : Runtime_value.payload;
}

type entry_capture = {
  capture_key : Core_graph.Port_key.t;
  literal_id : Literal_id.t;
}

module Raw : sig
  type t

  val create :
    templates:Core_graph.Function_template.t list ->
    entry_template_id:Core_graph.Function_template_id.t ->
    result_type:Core_type.t ->
    ?literals:literal list ->
    ?entry_captures:entry_capture list ->
    unit ->
    t

  val templates : t -> Core_graph.Function_template.t list
  val entry_template_id : t -> Core_graph.Function_template_id.t
  val result_type : t -> Core_type.t
  val literals : t -> literal list
  val entry_captures : t -> entry_capture list
end

type validation_error =
  | Core_validation_errors of Core_graph.validation_error list
  | Entry_template_missing of Core_graph.Function_template_id.t
  | Entry_parameter_not_unit of {
      template_id : Core_graph.Function_template_id.t;
      actual : Core_type.t;
    }
  | Entry_result_type_mismatch of {
      template_id : Core_graph.Function_template_id.t;
      expected : Core_type.t;
      actual : Core_type.t;
    }
  | Duplicate_program_literal_id of Literal_id.t
  | Duplicate_entry_capture of Core_graph.Port_key.t
  | Missing_entry_capture of Core_graph.Port_key.t
  | Unexpected_entry_capture of Core_graph.Port_key.t
  | Entry_capture_literal_missing of {
      capture_key : Core_graph.Port_key.t;
      literal_id : Literal_id.t;
    }
  | Program_literal_type_mismatch of {
      literal_id : Literal_id.t;
      expected : Core_type.t;
      actual : Core_type.t;
    }
  | Unsupported_program_literal_payload of {
      literal_id : Literal_id.t;
      typ : Core_type.t;
    }

type t

val validate : Raw.t -> (t, validation_error list) result
val templates : t -> Core_graph.Function_template.t list
val entry_template : t -> Core_graph.Function_template.t
val result_type : t -> Core_type.t
val launcher_graph : t -> Core_graph.Validated_graph.t

type execution_error =
  | Initialization_error of Engine.initialization_error
  | Runtime_error of Engine.runtime_error
  | Result_requested_before_completion
  | Completed_result_type_mismatch of {
      expected : Core_type.t;
      actual : Core_type.t;
    }

type run_result =
  | Completed of {
      value : Runtime_value.t;
      trace : Rewrite_event.t list;
    }
  | Stuck of {
      reason : Engine.stuck_reason;
      trace : Rewrite_event.t list;
    }
  | Run_error of {
      error : execution_error;
      trace : Rewrite_event.t list;
    }
  | Step_limit_exceeded of {
      limit : Nat.t;
      executed_steps : Nat.t;
      trace : Rewrite_event.t list;
    }

type completed_execution = {
  value : Runtime_value.t;
  machine : Engine.Machine.t;
  trace : Rewrite_event.t list;
}

val initialize : t -> (Engine.Machine.t, execution_error) result
val step : Engine.Machine.t -> Engine.step_result
val run : ?step_limit:Nat.t -> t -> run_result
val run_completed : ?step_limit:Nat.t -> t -> (completed_execution, run_result) result
val result_value : t -> Engine.Machine.t -> (Runtime_value.t, execution_error) result
val validation_error_to_string : validation_error -> string
val execution_error_to_string : execution_error -> string

module Examples : sig
  val add : unit -> t
  val multiply : unit -> t
  val higher_order_function : ?count:string -> unit -> t
  val higher_order_apply : ?count:string -> ?input:string -> unit -> t
end
