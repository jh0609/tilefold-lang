(** Typed, name-bearing Surface functions.

    This module is an authoring model above Tilefold Core. It deliberately does
    not change Project JSON v1 or Core execution semantics. Only validated
    programs can be serialized canonically or passed to later lowering stages. *)

module Function_id : sig
  type t

  val of_string : string -> (t, string) result
  val compare : t -> t -> int
  val equal : t -> t -> bool
  val to_string : t -> string
end

module Name : sig
  type t

  val of_string : string -> (t, string) result
  val compare : t -> t -> int
  val equal : t -> t -> bool
  val to_string : t -> string
end

type parameter = {
  name : Name.t;
  typ : Core_type.t;
}

type result = {
  name : Name.t;
  typ : Core_type.t;
}

type expression =
  | Parameter of Name.t
  | Unit_literal
  | Nat_literal of Nat.t
  | Call of call

and call = {
  function_id : Function_id.t;
  arguments : argument list;
}

and argument = {
  parameter : Name.t;
  value : expression;
}

type function_decl = {
  id : Function_id.t;
  parameters : parameter list;
  result : result;
  body : expression;
}

module Raw : sig
  type t

  val create : functions:function_decl list -> t
end

type validation_error =
  | Duplicate_function_id of Function_id.t
  | Duplicate_parameter_name of {
      function_id : Function_id.t;
      name : Name.t;
    }
  | Unknown_parameter_reference of {
      function_id : Function_id.t;
      name : Name.t;
    }
  | Unknown_call_target of {
      function_id : Function_id.t;
      target : Function_id.t;
    }
  | Duplicate_call_argument of {
      function_id : Function_id.t;
      target : Function_id.t;
      parameter : Name.t;
    }
  | Missing_call_argument of {
      function_id : Function_id.t;
      target : Function_id.t;
      parameter : Name.t;
    }
  | Unexpected_call_argument of {
      function_id : Function_id.t;
      target : Function_id.t;
      parameter : Name.t;
    }
  | Call_argument_type_mismatch of {
      function_id : Function_id.t;
      target : Function_id.t;
      parameter : Name.t;
      expected : Core_type.t;
      actual : Core_type.t;
    }
  | Result_type_mismatch of {
      function_id : Function_id.t;
      expected : Core_type.t;
      actual : Core_type.t;
    }
  | Function_call_cycle of Function_id.t list

type t

val validate : Raw.t -> (t, validation_error list) result
val functions : t -> function_decl list
val canonical_serialization : t -> string
val render_validation_error : validation_error -> string

type lowering_error =
  | Entry_function_not_found of Function_id.t
  | Entry_function_requires_no_parameters of {
      function_id : Function_id.t;
      actual : int;
    }
  | Generated_template_id_collision of {
      function_id : Function_id.t;
      generated_id : Core_graph.Function_template_id.t;
    }
  | Unsupported_value_type of {
      function_id : Function_id.t;
      binding : Name.t;
      typ : Core_type.t;
    }
  | Core_graph_validation_errors of {
      function_id : Function_id.t;
      errors : Core_graph.validation_error list;
    }
  | Program_package_validation_errors of Program_package.validation_error list
  | Lowering_invariant_violation of string

val lower_to_program_package :
  entry_function_id:Function_id.t ->
  t ->
  (Program_package.t, lowering_error list) result

val render_lowering_error : lowering_error -> string
