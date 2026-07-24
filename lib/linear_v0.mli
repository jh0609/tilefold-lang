module Loc : sig
  type t = { file : string option; line : int; column : int }

  val none : t
end

module Ident : sig
  type t = string

  val of_string : string -> (t, string) result
  val to_string : t -> string
end

module Type : sig
  type t =
    | Unit
    | Bool
    | Nat
    | World
    | Tuple of t list
    | Result of t * t
    | Struct of string
    | Variant of string
    | Function of t list * t
    | Closure of { arg : t; ret : t; captures : t list }
    | Resource of { name : string; state : string }

  val equal : t -> t -> bool
  val to_string : t -> string
end

module Capability : sig
  type t = Duplicable | Discardable | Comparable | Orderable

  val equal : t -> t -> bool
  val to_string : t -> string
end

type literal = Unit | Bool of bool | Nat of Nat.t

type pattern =
  | P_var of string
  | P_ignore
  | P_tuple of pattern list
  | P_struct of string * (string * pattern) list
  | P_variant of string * string * pattern option

type expr =
  | Literal of literal
  | Var of string
  | Tuple of expr list
  | Struct of string * (string * expr) list
  | Variant of string * string * expr option
  | Duplicate of expr
  | Discard of expr
  | Equal of expr * expr
  | Call of string * expr list
  | If of expr * yield_block * yield_block
  | Match of expr * match_arm list
  | Loop of expr * string * yield_block
  | Continue of expr
  | Break of expr
  | Capture of string list * string * Type.t * Type.t * stmt list
  | Call_closure of expr * expr
  | Effect_call of string * expr list

and stmt = Let of pattern * expr | Expr of expr | Return of expr

and yield_block = { stmts : stmt list; yield : expr }

and match_arm = { pattern : pattern; body : yield_block }

type struct_def = { struct_name : string; fields : (string * Type.t) list }
type variant_case = { case_name : string; payload : Type.t option }
type variant_def = { variant_name : string; cases : variant_case list }

type capability_bound = { type_var : string; capabilities : Capability.t list }

type function_decl = {
  fn_name : string;
  type_params : string list;
  capability_bounds : capability_bound list;
  params : (string * Type.t) list;
  return_type : Type.t;
  body : stmt list;
}

type program = {
  resources : resource_def list;
  structs : struct_def list;
  variants : variant_def list;
  functions : function_decl list;
}

and resource_state_policy = {
  state_name : string;
  terminal : bool;
  duplicable : bool;
  discardable : bool;
  comparable : bool;
}

and resource_def = {
  resource_name : string;
  states : resource_state_policy list;
}

type canonical_value =
  | C_unit
  | C_nat of string
  | C_bool of bool
  | C_text of string
  | C_bytes of string
  | C_pair of canonical_value * canonical_value
  | C_variant of string * canonical_value option
  | C_resource of { alias : string; kind : string; state : string }

type effect_domain_outcome =
  | Effect_ok of canonical_value
  | Effect_error of { tag : string; payload : canonical_value option }

type effect_resource_transition = {
  alias : string;
  kind : string;
  from_state : string option;
  to_state : string;
  acquire : bool;
}

type effect_descriptor = {
  effect_name : string;
  effect_args : Type.t list;
  effect_result : Type.t;
  effect_error_variant : string;
  effect_resource_transitions : effect_resource_transition list;
  effect_errors : string list;
}

type effect_script_entry = {
  expect_operation : string;
  expect_arguments : canonical_value list;
  response : effect_domain_outcome;
  resource_transitions : effect_resource_transition list;
  replay_observation : canonical_value option;
}

type effect_script = effect_script_entry list

module Diagnostic : sig
  type t =
    | Duplicate_definition of string
    | Unknown_variable of string
    | Use_after_move of string
    | Type_mismatch of { expected : Type.t; actual : Type.t }
    | Unknown_function of string
    | Arity_mismatch of { name : string; expected : int; actual : int }
    | Unknown_struct of string
    | Unknown_field of { struct_name : string; field : string }
    | Missing_field of { struct_name : string; field : string }
    | Extra_field of { struct_name : string; field : string }
    | Partial_struct_pattern of string
    | Unknown_variant of string
    | Unknown_variant_case of { variant_name : string; case_name : string }
    | Non_exhaustive_match of string list
    | Capability_required of { typ : Type.t; capability : Capability.t }
    | Function_or_closure_comparable of Type.t
    | World_cannot_be_duplicated
    | World_cannot_be_discarded
    | Unresolved_value of string
    | Branch_state_mismatch of string
    | Return_required of string
    | Invalid_pattern of string
    | Unsupported of string
    | Loop_control_outside_loop of string
    | Loop_control_type_mismatch of { expected : Type.t; actual : Type.t }
    | Capture_after_move of string
    | Uncaptured_variable of string
    | Invalid_entrypoint of string
    | Unknown_effect of string
    | Invalid_effect_descriptor of string

  val to_string : t -> string
end

val check_program :
  ?effects:effect_descriptor list -> program -> (unit, Diagnostic.t list) result

module Runtime : sig
  type value_id

  type payload =
    | Unit
    | Bool of bool
    | Nat of Nat.t
    | Tuple of value list
    | Struct of string * (string * value) list
    | Variant of string * string * value option
    | Closure of {
        captures : (string * value) list;
        param : string;
        param_type : Type.t;
        return_type : Type.t;
        body : stmt list;
      }
    | World of int
    | Resource of { alias : string option; kind : string; state : string }

  and value

  type trace_event =
    | Create of { value_id : value_id; typ : Type.t; detail : string }
    | Move of { value_id : value_id; from_owner : string; to_owner : string }
    | Consume of { value_id : value_id; owner : string; reason : string }
    | Duplicate of {
        source : value_id;
        left : value_id;
        right : value_id;
        typ : Type.t;
      }
    | Transform of {
        inputs : value_id list;
        outputs : value_id list;
        operation : string;
      }
    | Discard of { value_id : value_id; typ : Type.t }
    | FunctionEnter of { name : string }
    | FunctionReturn of { name : string; value_id : value_id }
    | Branch of { kind : string; selected : string }
    | LoopEnter
    | LoopContinue of { value_id : value_id }
    | LoopBreak of { value_id : value_id }
    | LoopExit of { value_id : value_id }
    | ClosureCreate of { value_id : value_id; captures : value_id list }
    | ClosureEnter of { value_id : value_id }
    | ClosureReturn of { value_id : value_id }
    | EffectAttempt of {
        effect_call_id : int;
        operation : string;
        arguments : canonical_value list;
      }
    | WorldTransition of {
        effect_call_id : int;
        input_world_id : value_id;
        output_world_id : value_id;
        operation : string;
        resource_ids : value_id list;
        outcome : string;
        global_order : int;
        replay_observation : canonical_value option;
      }
    | ResourceAcquire of {
        effect_call_id : int;
        value_id : value_id;
        alias : string;
        kind : string;
        state : string;
      }
    | ResourceTransition of {
        effect_call_id : int;
        value_id : value_id;
        alias : string option;
        kind : string;
        from_state : string;
        to_state : string;
      }
    | NormalResult of { value_id : value_id; typ : Type.t }

  type live_value = { value_id : value_id; typ : Type.t; owner : string }

  type step_limit_report = {
    executed_steps : int;
    step_limit : int;
    last_location : string option;
    live_values : live_value list;
    unresolved_resources : live_value list;
    last_world : value_id option;
    trace : trace_event list;
  }

  type effect_abort_cause =
    | Effect_mismatch of {
        operation : string;
        argument_index : int option;
        expected : canonical_value option;
        actual : canonical_value option;
      }
    | Effect_script_exhausted of string
    | Unused_effect_script of int
    | Resource_alias_consumed of string
    | Provider_contract_violation of string
    | Invalid_resource_state of string
    | Invalid_normal_termination of string

  type effect_abort_report = {
    primary_cause : effect_abort_cause;
    executed_steps : int;
    trace : trace_event list;
    current_world : value_id option;
    live_resources : live_value list;
    consumed_script_entries : int;
    remaining_script_entries : int;
    diagnostics : string list;
  }

  type run_result =
    | Completed of { value : value; trace : trace_event list }
    | Step_limit_exceeded of step_limit_report
    | Effect_aborted of effect_abort_report
    | Static_error of Diagnostic.t list
    | Runtime_error of string

  val value_id_to_int : value_id -> int
  val value_id : value -> value_id
  val payload : value -> payload
  val typ : value -> Type.t
  val trace_event_to_string : trace_event -> string
  val run :
    ?step_limit:int ->
    ?effects:effect_descriptor list ->
    ?script:effect_script ->
    program ->
    entry:string ->
    run_result
end
