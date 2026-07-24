module Loc = struct
  type t = { file : string option; line : int; column : int }

  let none = { file = None; line = 0; column = 0 }
end

module Ident = struct
  type t = string

  let of_string value =
    if value = "" then Error "identifier must not be empty" else Ok value

  let to_string value = value
end

module Type = struct
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

  let rec equal left right =
    match (left, right) with
    | Unit, Unit | Bool, Bool | Nat, Nat | World, World -> true
    | Tuple left, Tuple right ->
        List.length left = List.length right && List.for_all2 equal left right
    | Result (left_ok, left_err), Result (right_ok, right_err) ->
        equal left_ok right_ok && equal left_err right_err
    | Struct left, Struct right | Variant left, Variant right -> left = right
    | Function (left_args, left_ret), Function (right_args, right_ret) ->
        List.length left_args = List.length right_args
        && List.for_all2 equal left_args right_args
        && equal left_ret right_ret
    | ( Closure { arg = left_arg; ret = left_ret; captures = left_captures },
        Closure { arg = right_arg; ret = right_ret; captures = right_captures } )
      ->
        equal left_arg right_arg && equal left_ret right_ret
        && List.length left_captures = List.length right_captures
        && List.for_all2 equal left_captures right_captures
    | Resource left, Resource right ->
        left.name = right.name && left.state = right.state
    | _ -> false

  let rec to_string = function
    | Unit -> "Unit"
    | Bool -> "Bool"
    | Nat -> "Nat"
    | World -> "World"
    | Tuple types ->
        "(" ^ String.concat ", " (List.map to_string types) ^ ")"
    | Result (ok, err) ->
        "Result<" ^ to_string ok ^ ", " ^ to_string err ^ ">"
    | Struct name -> name
    | Variant name -> name
    | Function (args, ret) ->
        "fn(" ^ String.concat ", " (List.map to_string args) ^ ") -> "
        ^ to_string ret
    | Closure { arg; ret; captures } ->
        "Closure<" ^ to_string arg ^ ", " ^ to_string ret ^ "; captures=["
        ^ String.concat ", " (List.map to_string captures)
        ^ "]>"
    | Resource { name; state } -> name ^ "<" ^ state ^ ">"
end

module Capability = struct
  type t = Duplicable | Discardable | Comparable | Orderable

  let equal left right = left = right

  let to_string = function
    | Duplicable -> "Duplicable"
    | Discardable -> "Discardable"
    | Comparable -> "Comparable"
    | Orderable -> "Orderable"
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
  structs : struct_def list;
  variants : variant_def list;
  functions : function_decl list;
}

module Diagnostic = struct
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

  let to_string = function
    | Duplicate_definition name -> "duplicate definition: " ^ name
    | Unknown_variable name -> "unknown variable: " ^ name
    | Use_after_move name -> "use after move: " ^ name
    | Type_mismatch { expected; actual } ->
        "type mismatch: expected " ^ Type.to_string expected ^ ", got "
        ^ Type.to_string actual
    | Unknown_function name -> "unknown function: " ^ name
    | Arity_mismatch { name; expected; actual } ->
        "arity mismatch for " ^ name ^ ": expected " ^ string_of_int expected
        ^ ", got " ^ string_of_int actual
    | Unknown_struct name -> "unknown struct: " ^ name
    | Unknown_field { struct_name; field } ->
        "unknown field " ^ struct_name ^ "." ^ field
    | Missing_field { struct_name; field } ->
        "missing field " ^ struct_name ^ "." ^ field
    | Extra_field { struct_name; field } -> "extra field " ^ struct_name ^ "." ^ field
    | Partial_struct_pattern name -> "partial struct pattern: " ^ name
    | Unknown_variant name -> "unknown variant: " ^ name
    | Unknown_variant_case { variant_name; case_name } ->
        "unknown variant case " ^ variant_name ^ "::" ^ case_name
    | Non_exhaustive_match missing ->
        "non-exhaustive match; missing " ^ String.concat ", " missing
    | Capability_required { typ; capability } ->
        "capability " ^ Capability.to_string capability ^ " required for "
        ^ Type.to_string typ
    | Function_or_closure_comparable typ ->
        "function or closure is not comparable: " ^ Type.to_string typ
    | World_cannot_be_duplicated -> "World cannot be duplicated"
    | World_cannot_be_discarded -> "World cannot be discarded"
    | Unresolved_value name -> "unresolved value: " ^ name
    | Branch_state_mismatch name -> "branch state mismatch: " ^ name
    | Return_required name -> "function must return: " ^ name
    | Invalid_pattern message -> "invalid pattern: " ^ message
    | Unsupported message -> "unsupported: " ^ message
    | Loop_control_outside_loop keyword ->
        keyword ^ " used outside Loop"
    | Loop_control_type_mismatch { expected; actual } ->
        "loop control type mismatch: expected " ^ Type.to_string expected
        ^ ", got " ^ Type.to_string actual
    | Capture_after_move name -> "capture after move: " ^ name
    | Uncaptured_variable name -> "uncaptured variable: " ^ name
end

module String_map = Map.Make (String)
module String_set = Set.Make (String)

type binding_state = Available | Moved | Consumed

let binding_state_is_resolved = function
  | Available -> false
  | Moved | Consumed -> true

type binding = { typ : Type.t; state : binding_state }
type env = binding String_map.t

type context = {
  structs : struct_def String_map.t;
  variants : variant_def String_map.t;
  functions : function_decl String_map.t;
}

let literal_type = function
  | Unit -> Type.Unit
  | Bool _ -> Type.Bool
  | Nat _ -> Type.Nat

let add_error errors error = error :: errors

let bind_name (env : env) name typ =
  String_map.add name { typ; state = Available } env

let set_state (env : env) name state =
  match String_map.find_opt name env with
  | None -> env
  | Some binding -> String_map.add name { binding with state } env

let field_names fields = List.map fst fields

let sorted_strings values = List.sort String.compare values

let find_duplicate names =
  let rec loop seen = function
    | [] -> None
    | name :: rest ->
        if String_set.mem name seen then Some name
        else loop (String_set.add name seen) rest
  in
  loop String_set.empty names

let build_context (program : program) =
  let errors = ref [] in
  let add_unique kind name value map =
    if String_map.mem name map then (
      errors := Diagnostic.Duplicate_definition (kind ^ " " ^ name) :: !errors;
      map)
    else String_map.add name value map
  in
  let structs =
    List.fold_left
      (fun map def -> add_unique "struct" def.struct_name def map)
      String_map.empty program.structs
  in
  let variants =
    List.fold_left
      (fun map def -> add_unique "variant" def.variant_name def map)
      String_map.empty program.variants
  in
  let functions =
    List.fold_left
      (fun map def -> add_unique "function" def.fn_name def map)
      String_map.empty program.functions
  in
  ({ structs; variants; functions }, List.rev !errors)

let rec has_capability ctx typ capability =
  match (typ, capability) with
  | Type.World, Capability.Duplicable -> false
  | Type.World, Capability.Discardable -> false
  | Type.Function _, Capability.Comparable
  | Type.Closure _, Capability.Comparable
  | Type.Function _, Capability.Orderable
  | Type.Closure _, Capability.Orderable ->
      false
  | Type.Unit, _ | Type.Bool, _ | Type.Nat, _ -> true
  | Type.Tuple types, _ -> List.for_all (fun typ -> has_capability ctx typ capability) types
  | Type.Result (ok, err), _ ->
      has_capability ctx ok capability && has_capability ctx err capability
  | Type.Struct name, _ -> (
      match String_map.find_opt name ctx.structs with
      | None -> false
      | Some def ->
          List.for_all
            (fun (_, typ) -> has_capability ctx typ capability)
            def.fields)
  | Type.Variant name, _ -> (
      match String_map.find_opt name ctx.variants with
      | None -> false
      | Some def ->
          List.for_all
            (fun case ->
              match case.payload with
              | None -> true
              | Some typ -> has_capability ctx typ capability)
            def.cases)
  | Type.Resource _, _ -> false
  | Type.World, _ -> false
  | Type.Function _, (Capability.Duplicable | Capability.Discardable) -> true
  | Type.Closure { captures; _ }, (Capability.Duplicable | Capability.Discardable) ->
      List.for_all (fun typ -> has_capability ctx typ capability) captures

let require_type expected actual errors =
  if Type.equal expected actual then errors
  else add_error errors (Diagnostic.Type_mismatch { expected; actual })

let require_capability ctx typ capability errors =
  match (typ, capability) with
  | Type.World, Capability.Duplicable ->
      add_error errors Diagnostic.World_cannot_be_duplicated
  | Type.World, Capability.Discardable ->
      add_error errors Diagnostic.World_cannot_be_discarded
  | (Type.Function _ | Type.Closure _), (Capability.Comparable | Capability.Orderable) ->
      add_error errors (Diagnostic.Function_or_closure_comparable typ)
  | _ ->
      if has_capability ctx typ capability then errors
      else add_error errors (Diagnostic.Capability_required { typ; capability })

let rec bind_pattern ctx env pattern typ errors =
  match pattern with
  | P_ignore -> (env, errors)
  | P_var name -> (bind_name env name typ, errors)
  | P_tuple patterns -> (
      match typ with
      | Type.Tuple types when List.length patterns = List.length types ->
          List.fold_left2
            (fun (env, errors) pattern typ -> bind_pattern ctx env pattern typ errors)
            (env, errors) patterns types
      | _ ->
          ( env,
            add_error errors
              (Diagnostic.Type_mismatch
                 { expected = Type.Tuple []; actual = typ }) ))
  | P_struct (name, field_patterns) -> (
      match (typ, String_map.find_opt name ctx.structs) with
      | Type.Struct actual, Some def when actual = name ->
          let expected = sorted_strings (field_names def.fields) in
          let actual_fields = sorted_strings (field_names field_patterns) in
          let errors =
            if expected = actual_fields then errors
            else add_error errors (Diagnostic.Partial_struct_pattern name)
          in
          List.fold_left
            (fun (env, errors) (field, pattern) ->
              match List.assoc_opt field def.fields with
              | None ->
                  ( env,
                    add_error errors (Diagnostic.Unknown_field { struct_name = name; field }) )
              | Some typ -> bind_pattern ctx env pattern typ errors)
            (env, errors) field_patterns
      | _ -> (env, add_error errors (Diagnostic.Type_mismatch { expected = Type.Struct name; actual = typ })))
  | P_variant (variant_name, case_name, payload_pattern) -> (
      match (typ, String_map.find_opt variant_name ctx.variants) with
      | Type.Variant actual, Some def when actual = variant_name -> (
          match
            List.find_opt (fun case -> case.case_name = case_name) def.cases
          with
          | None ->
              ( env,
                add_error errors
                  (Diagnostic.Unknown_variant_case { variant_name; case_name }) )
          | Some { payload = None; _ } -> (
              match payload_pattern with
              | None -> (env, errors)
              | Some _ ->
                  (env, add_error errors (Diagnostic.Invalid_pattern "case has no payload")))
          | Some { payload = Some payload_type; _ } -> (
              match payload_pattern with
              | None ->
                  (env, add_error errors (Diagnostic.Invalid_pattern "payload pattern required"))
              | Some pattern -> bind_pattern ctx env pattern payload_type errors))
      | _ ->
          ( env,
            add_error errors
              (Diagnostic.Type_mismatch { expected = Type.Variant variant_name; actual = typ }) ))

let check_var env name errors =
  match String_map.find_opt name env with
  | None -> (Type.Unit, env, add_error errors (Diagnostic.Unknown_variable name))
  | Some { typ; state = Available } -> (typ, set_state env name Moved, errors)
  | Some { typ; state = Moved | Consumed } ->
      (typ, env, add_error errors (Diagnostic.Use_after_move name))

let unresolved_env env =
  String_map.fold
    (fun name binding acc ->
      if binding_state_is_resolved binding.state then acc else name :: acc)
    env []
  |> List.rev

let add_unresolved_errors env errors =
  List.fold_left
    (fun errors name -> add_error errors (Diagnostic.Unresolved_value name))
    errors (unresolved_env env)

let env_names env =
  String_map.fold (fun name _ names -> String_set.add name names) env String_set.empty

let add_unresolved_errors_except env ignored errors =
  let unresolved =
    List.filter
      (fun name -> not (String_set.mem name ignored))
      (unresolved_env env)
  in
  List.fold_left
    (fun errors name -> add_error errors (Diagnostic.Unresolved_value name))
    errors unresolved

let rec infer_expr ctx env expr errors =
  match expr with
  | Literal literal -> (literal_type literal, env, errors)
  | Var name -> check_var env name errors
  | Tuple exprs ->
      let types, env, errors =
        List.fold_left
          (fun (types, env, errors) expr ->
            let typ, env, errors = infer_expr ctx env expr errors in
            (typ :: types, env, errors))
          ([], env, errors) exprs
      in
      (Type.Tuple (List.rev types), env, errors)
  | Struct (name, fields) -> (
      match String_map.find_opt name ctx.structs with
      | None -> (Type.Struct name, env, add_error errors (Diagnostic.Unknown_struct name))
      | Some def ->
          let errors =
            match find_duplicate (field_names fields) with
            | None -> errors
            | Some field ->
                add_error errors (Diagnostic.Duplicate_definition (name ^ "." ^ field))
          in
          let expected = field_names def.fields in
          let actual = field_names fields in
          let errors =
            List.fold_left
              (fun errors field ->
                if List.mem field actual then errors
                else add_error errors (Diagnostic.Missing_field { struct_name = name; field }))
              errors expected
          in
          let errors =
            List.fold_left
              (fun errors field ->
                if List.mem field expected then errors
                else add_error errors (Diagnostic.Extra_field { struct_name = name; field }))
              errors actual
          in
          let env, errors =
            List.fold_left
              (fun (env, errors) (field, expr) ->
                let actual_type, env, errors = infer_expr ctx env expr errors in
                let errors =
                  match List.assoc_opt field def.fields with
                  | None -> errors
                  | Some expected_type -> require_type expected_type actual_type errors
                in
                (env, errors))
              (env, errors) fields
          in
          (Type.Struct name, env, errors))
  | Variant (variant_name, case_name, payload) -> (
      match String_map.find_opt variant_name ctx.variants with
      | None -> (Type.Variant variant_name, env, add_error errors (Diagnostic.Unknown_variant variant_name))
      | Some def -> (
          match List.find_opt (fun case -> case.case_name = case_name) def.cases with
          | None ->
              ( Type.Variant variant_name,
                env,
                add_error errors
                  (Diagnostic.Unknown_variant_case { variant_name; case_name }) )
          | Some case -> (
              match (case.payload, payload) with
              | None, None -> (Type.Variant variant_name, env, errors)
              | Some expected, Some expr ->
                  let actual, env, errors = infer_expr ctx env expr errors in
                  (Type.Variant variant_name, env, require_type expected actual errors)
              | None, Some _ ->
                  let _, env, errors = infer_expr ctx env (Option.get payload) errors in
                  (Type.Variant variant_name, env, add_error errors (Diagnostic.Invalid_pattern "case has no payload"))
              | Some _, None ->
                  (Type.Variant variant_name, env, add_error errors (Diagnostic.Invalid_pattern "case payload required")))))
  | Duplicate expr ->
      let typ, env, errors = infer_expr ctx env expr errors in
      let errors = require_capability ctx typ Capability.Duplicable errors in
      (Type.Tuple [ typ; typ ], env, errors)
  | Discard expr ->
      let typ, env, errors = infer_expr ctx env expr errors in
      let errors = require_capability ctx typ Capability.Discardable errors in
      (Type.Unit, env, errors)
  | Equal (left, right) ->
      let left_type, env, errors = infer_expr ctx env left errors in
      let right_type, env, errors = infer_expr ctx env right errors in
      let errors = require_type left_type right_type errors in
      let errors = require_capability ctx left_type Capability.Comparable errors in
      (Type.Bool, env, errors)
  | Call (name, args) -> (
      match String_map.find_opt name ctx.functions with
      | None ->
          let _, env, errors =
            List.fold_left
              (fun (types, env, errors) expr ->
                let typ, env, errors = infer_expr ctx env expr errors in
                (typ :: types, env, errors))
              ([], env, errors) args
          in
          (Type.Unit, env, add_error errors (Diagnostic.Unknown_function name))
      | Some fn ->
          let errors =
            if List.length args = List.length fn.params then errors
            else
              add_error errors
                (Diagnostic.Arity_mismatch
                   {
                     name;
                     expected = List.length fn.params;
                     actual = List.length args;
                   })
          in
          let env, errors =
            List.fold_left2
              (fun (env, errors) arg (_, expected_type) ->
                let actual_type, env, errors = infer_expr ctx env arg errors in
                (env, require_type expected_type actual_type errors))
              (env, errors) args
              (if List.length args = List.length fn.params then fn.params
               else List.map (fun _ -> ("_", Type.Unit)) args)
          in
          (fn.return_type, env, errors))
  | If (condition, then_block, else_block) ->
      let cond_type, env, errors = infer_expr ctx env condition errors in
      let errors = require_type Type.Bool cond_type errors in
      let then_type, then_env, errors = check_yield_block ctx env then_block errors in
      let else_type, else_env, errors = check_yield_block ctx env else_block errors in
      let errors = require_type then_type else_type errors in
      let joined_env, errors = join_branch_envs then_env else_env errors in
      (then_type, joined_env, errors)
  | Match (scrutinee, arms) ->
      let scrutinee_type, env, errors = infer_expr ctx env scrutinee errors in
      check_match ctx env scrutinee_type arms errors
  | Continue expr ->
      let _typ, env, errors = infer_expr ctx env expr errors in
      (Type.Unit, env, add_error errors (Diagnostic.Loop_control_outside_loop "Continue"))
  | Break expr ->
      let _typ, env, errors = infer_expr ctx env expr errors in
      (Type.Unit, env, add_error errors (Diagnostic.Loop_control_outside_loop "Break"))
  | Loop (initial, state_name, body) ->
      let state_type, env, errors = infer_expr ctx env initial errors in
      let outer_names = env_names env in
      let loop_env = bind_name env state_name state_type in
      let control, _body_env, errors =
        check_loop_yield_block ctx loop_env ~state_type ~outer_names body errors
      in
      let result_type =
        match control with
        | `Break typ -> typ
        | `Mixed (_, break_type) -> break_type
        | `Continue_only -> Type.Unit
      in
      (result_type, env, errors)
  | Capture (captures, param, param_type, return_type, body) ->
      let capture_types, env, errors =
        List.fold_left
          (fun (types, env, errors) name ->
            match String_map.find_opt name env with
            | None ->
                (types, env, add_error errors (Diagnostic.Unknown_variable name))
            | Some { typ; state = Available } ->
                (typ :: types, set_state env name Moved, errors)
            | Some { typ; state = Moved | Consumed } ->
                (typ :: types, env, add_error errors (Diagnostic.Capture_after_move name)))
          ([], env, errors) captures
      in
      let closure_env =
        List.fold_left2
          (fun closure_env name typ -> bind_name closure_env name typ)
          String_map.empty captures (List.rev capture_types)
        |> fun closure_env -> bind_name closure_env param param_type
      in
      let body_env, body_errors, returned =
        check_statements ctx closure_env body []
      in
      let errors = body_errors @ errors in
      let errors =
        match returned with
        | None -> add_error errors (Diagnostic.Return_required "<closure>")
        | Some actual -> require_type return_type actual errors
      in
      let errors =
        List.fold_left
          (fun errors name -> add_error errors (Diagnostic.Unresolved_value name))
          errors (unresolved_env body_env)
      in
      (Type.Closure { arg = param_type; ret = return_type; captures = List.rev capture_types }, env, errors)
  | Call_closure (closure_expr, arg_expr) ->
      let closure_type, env, errors = infer_expr ctx env closure_expr errors in
      let arg_type, env, errors = infer_expr ctx env arg_expr errors in
      (match closure_type with
      | Type.Closure { arg; ret; _ } ->
          let errors = require_type arg arg_type errors in
          (ret, env, errors)
      | actual ->
          ( Type.Unit,
            env,
            add_error errors
              (Diagnostic.Type_mismatch
                 {
                   expected = Type.Closure { arg = arg_type; ret = Type.Unit; captures = [] };
                   actual;
                 }) ))

and check_stmt ctx env stmt errors =
  match stmt with
  | Let (pattern, expr) ->
      let typ, env, errors = infer_expr ctx env expr errors in
      let env, errors = bind_pattern ctx env pattern typ errors in
      (env, errors, None)
  | Expr (Discard (Var name)) -> (
      match String_map.find_opt name env with
      | None ->
          ( env,
            add_error errors (Diagnostic.Unknown_variable name),
            None )
      | Some { typ; state = Available } ->
          let errors = require_capability ctx typ Capability.Discardable errors in
          (set_state env name Consumed, errors, None)
      | Some { state = Moved | Consumed; _ } ->
          ( env,
            add_error errors (Diagnostic.Use_after_move name),
            None ))
  | Expr expr ->
      let typ, env, errors = infer_expr ctx env expr errors in
      let errors = require_type Type.Unit typ errors in
      (env, errors, None)
  | Return expr ->
      let typ, env, errors = infer_expr ctx env expr errors in
      (env, errors, Some typ)

and check_yield_block ctx env block errors =
  let env, errors, returned =
    check_statements ctx env block.stmts errors
  in
  match returned with
  | Some typ -> (typ, env, errors)
  | None -> infer_expr ctx env block.yield errors

and check_loop_yield_block ctx env ~state_type ~outer_names block errors =
  let env, errors, returned = check_statements ctx env block.stmts errors in
  match returned with
  | Some typ -> (`Break typ, env, errors)
  | None -> check_loop_control_expr ctx env ~state_type ~outer_names block.yield errors

and check_loop_control_expr ctx env ~state_type ~outer_names expr errors =
  match expr with
  | Continue expr ->
      let actual, env, errors = infer_expr ctx env expr errors in
      let errors =
        if Type.equal state_type actual then errors
        else
          add_error errors
            (Diagnostic.Loop_control_type_mismatch
               { expected = state_type; actual })
      in
      let errors = add_unresolved_errors_except env outer_names errors in
      (`Continue_only, env, errors)
  | Break expr ->
      let typ, env, errors = infer_expr ctx env expr errors in
      let errors = add_unresolved_errors_except env outer_names errors in
      (`Break typ, env, errors)
  | If (condition, then_block, else_block) ->
      let cond_type, env, errors = infer_expr ctx env condition errors in
      let errors = require_type Type.Bool cond_type errors in
      let then_control, then_env, errors =
        check_loop_yield_block ctx env ~state_type ~outer_names then_block errors
      in
      let else_control, else_env, errors =
        check_loop_yield_block ctx env ~state_type ~outer_names else_block errors
      in
      let errors = loop_control_join_errors then_control else_control errors in
      let joined_env, errors = join_branch_envs then_env else_env errors in
      (loop_control_join then_control else_control, joined_env, errors)
  | Match (scrutinee, arms) -> (
      let scrutinee_type, env, errors = infer_expr ctx env scrutinee errors in
      match scrutinee_type with
      | Type.Variant variant_name -> (
          match String_map.find_opt variant_name ctx.variants with
          | None ->
              ( `Break Type.Unit,
                env,
                add_error errors (Diagnostic.Unknown_variant variant_name) )
          | Some def ->
              let case_names = List.map (fun case -> case.case_name) def.cases in
              let seen_cases =
                List.filter_map
                  (fun arm ->
                    match arm.pattern with
                    | P_variant (name, case, _) when name = variant_name -> Some case
                    | _ -> None)
                  arms
              in
              let missing =
                List.filter (fun case -> not (List.mem case seen_cases)) case_names
              in
              let errors =
                if missing = [] then errors
                else add_error errors (Diagnostic.Non_exhaustive_match missing)
              in
              let results =
                List.map
                  (fun arm ->
                    let arm_env, errors =
                      bind_pattern ctx env arm.pattern scrutinee_type errors
                    in
                    check_loop_yield_block ctx arm_env ~state_type ~outer_names arm.body errors)
                  arms
              in
              let control =
                match results with
                | [] -> `Break Type.Unit
                | (control, _, _) :: rest ->
                    List.fold_left
                      (fun control (next, _, _) -> loop_control_join control next)
                      control rest
              in
              let errors =
                match results with
                | [] -> errors
                | (first_control, _, _) :: rest ->
                    List.fold_left
                      (fun errors (control, _, _) ->
                        loop_control_join_errors first_control control errors)
                      errors rest
              in
              let errors =
                List.fold_left
                  (fun errors (_, _, arm_errors) -> arm_errors @ errors)
                  errors results
              in
              let joined_env, errors =
                match results with
                | [] -> (env, errors)
                | (_, first_env, _) :: rest ->
                    List.fold_left
                      (fun (joined, errors) (_, env, _) -> join_branch_envs joined env errors)
                      (first_env, errors) rest
              in
              (control, joined_env, errors))
      | actual ->
          ( `Break Type.Unit,
            env,
            add_error errors
              (Diagnostic.Type_mismatch
                 { expected = Type.Variant "<variant>"; actual }) ))
  | _ ->
      let typ, env, errors = infer_expr ctx env expr errors in
      ( `Break typ,
        env,
        add_error errors
          (Diagnostic.Loop_control_outside_loop "Loop body must yield Continue or Break")
      )

and loop_control_join left right =
  match (left, right) with
  | `Continue_only, `Continue_only -> `Continue_only
  | `Break typ, `Continue_only | `Continue_only, `Break typ -> `Mixed (typ, typ)
  | `Break left, `Break right when Type.equal left right -> `Break left
  | `Mixed (_, break_type), `Continue_only
  | `Continue_only, `Mixed (_, break_type) ->
      `Mixed (break_type, break_type)
  | `Mixed (_, left), `Break right | `Break left, `Mixed (_, right)
    when Type.equal left right ->
      `Mixed (left, right)
  | `Mixed (_, left), `Mixed (_, right) when Type.equal left right ->
      `Mixed (left, right)
  | _ -> `Break Type.Unit

and loop_control_join_errors left right errors =
  let break_type = function
    | `Break typ -> Some typ
    | `Mixed (_, typ) -> Some typ
    | `Continue_only -> None
  in
  match (break_type left, break_type right) with
  | Some left, Some right when not (Type.equal left right) ->
      add_error errors
        (Diagnostic.Loop_control_type_mismatch { expected = left; actual = right })
  | _ -> errors

and check_statements ctx env stmts errors =
  match stmts with
  | [] -> (env, errors, None)
  | stmt :: rest -> (
      let env, errors, returned = check_stmt ctx env stmt errors in
      match returned with
      | Some typ -> (env, errors, Some typ)
      | None -> check_statements ctx env rest errors)

and join_branch_envs left right errors =
  let errors =
    String_map.fold
      (fun name left_binding errors ->
        match String_map.find_opt name right with
        | None -> errors
        | Some right_binding ->
            if left_binding.state = right_binding.state then errors
            else add_error errors (Diagnostic.Branch_state_mismatch name))
      left errors
  in
  (left, errors)

and check_match ctx env scrutinee_type arms errors =
  match scrutinee_type with
  | Type.Variant variant_name -> (
      match String_map.find_opt variant_name ctx.variants with
      | None ->
          (Type.Unit, env, add_error errors (Diagnostic.Unknown_variant variant_name))
      | Some def ->
          let case_names = List.map (fun case -> case.case_name) def.cases in
          let seen_cases =
            List.filter_map
              (fun arm ->
                match arm.pattern with
                | P_variant (name, case, _) when name = variant_name -> Some case
                | _ -> None)
              arms
          in
          let missing =
            List.filter (fun case -> not (List.mem case seen_cases)) case_names
          in
          let errors =
            if missing = [] then errors
            else add_error errors (Diagnostic.Non_exhaustive_match missing)
          in
          let arm_results =
            List.map
              (fun arm ->
                let arm_env, errors =
                  bind_pattern ctx env arm.pattern scrutinee_type errors
                in
                check_yield_block ctx arm_env arm.body errors)
              arms
          in
          let result_type =
            match arm_results with
            | [] -> Type.Unit
            | (typ, _, _) :: _ -> typ
          in
          let errors =
            List.fold_left
              (fun errors (typ, _, _) -> require_type result_type typ errors)
              errors arm_results
          in
          let errors =
            List.fold_left (fun errors (_, _, arm_errors) -> arm_errors @ errors) errors arm_results
          in
          let joined_env, errors =
            match arm_results with
            | [] -> (env, errors)
            | (_, first_env, _) :: rest ->
                List.fold_left
                  (fun (joined, errors) (_, env, _) -> join_branch_envs joined env errors)
                  (first_env, errors) rest
          in
          (result_type, joined_env, errors))
  | actual ->
      (Type.Unit, env, add_error errors (Diagnostic.Type_mismatch { expected = Type.Variant "<variant>"; actual }))

let check_function ctx fn =
  let env =
    List.fold_left
      (fun env (name, typ) -> bind_name env name typ)
      String_map.empty fn.params
  in
  let env, errors, returned = check_statements ctx env fn.body [] in
  let errors =
    match returned with
    | None -> add_error errors (Diagnostic.Return_required fn.fn_name)
    | Some actual -> require_type fn.return_type actual errors
  in
  let errors = add_unresolved_errors env errors in
  List.rev errors

let check_program (program : program) =
  let ctx, errors = build_context program in
  let errors =
    List.fold_left
      (fun errors fn -> check_function ctx fn @ errors)
      errors program.functions
  in
  match List.rev errors with [] -> Ok () | errors -> Error errors

module Runtime = struct
  type value_id = int

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

  and value = { id : value_id; typ : Type.t; payload : payload }

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

  type run_result =
    | Completed of { value : value; trace : trace_event list }
    | Step_limit_exceeded of step_limit_report
    | Static_error of Diagnostic.t list
    | Runtime_error of string

  let value_id_to_int id = id
  let value_id (value : value) = value.id
  let payload (value : value) = value.payload
  let typ (value : value) = value.typ

  type state = {
    ctx : context;
    next_id : int;
    trace : trace_event list;
    step_limit : int option;
    executed_steps : int;
    last_location : string option;
  }

  exception Runtime_failure of string
  exception Returned of value * state
  exception Continued of value * state
  exception Broken of value * state
  exception Step_limit of state

  let emit state event = { state with trace = event :: state.trace }

  let tick state location =
    match state.step_limit with
    | Some limit when state.executed_steps >= limit ->
        raise (Step_limit { state with last_location = Some location })
    | _ ->
        {
          state with
          executed_steps = state.executed_steps + 1;
          last_location = Some location;
        }

  let fresh state typ payload detail =
    let value = { id = state.next_id; typ; payload } in
    let state =
      {
        state with
        next_id = state.next_id + 1;
        trace =
          Create { value_id = value.id; typ; detail } :: state.trace;
      }
    in
    (value, state)

  let consume state value owner reason =
    emit state (Consume { value_id = value.id; owner; reason })

  let rec clone_payload state payload =
    match payload with
    | Unit -> (Unit, state)
    | Bool value -> (Bool value, state)
    | Nat value -> (Nat value, state)
    | Tuple values ->
        let values, state =
          List.fold_left
            (fun (values, state) value ->
              let cloned, state = duplicate_value state value in
              (cloned :: values, state))
            ([], state) values
        in
        (Tuple (List.rev values), state)
    | Struct (name, fields) ->
        let fields, state =
          List.fold_left
            (fun (fields, state) (field, value) ->
              let cloned, state = duplicate_value state value in
              ((field, cloned) :: fields, state))
            ([], state) fields
        in
        (Struct (name, List.rev fields), state)
    | Variant (name, case, payload) -> (
        match payload with
        | None -> (Variant (name, case, None), state)
        | Some value ->
            let cloned, state = duplicate_value state value in
            (Variant (name, case, Some cloned), state))
    | Closure { captures; param; param_type; return_type; body } ->
        let captures, state =
          List.fold_left
            (fun (captures, state) (name, value) ->
              let cloned, state = duplicate_value state value in
              ((name, cloned) :: captures, state))
            ([], state) captures
        in
        (Closure { captures = List.rev captures; param; param_type; return_type; body }, state)

  and duplicate_value state value =
    let payload, state = clone_payload state value.payload in
    fresh state value.typ payload "duplicate descendant"

  let literal_payload (literal : literal) =
    match literal with
    | Unit -> (Type.Unit, Unit, "()")
    | Bool value -> (Type.Bool, Bool value, string_of_bool value)
    | Nat nat -> (Type.Nat, Nat nat, Nat.to_string nat)

  let move_from_env env name =
    match String_map.find_opt name env with
    | None -> raise (Runtime_failure ("unknown runtime variable: " ^ name))
    | Some value -> (value, String_map.remove name env)

  let bind env name value = String_map.add name value env

  let rec bind_pattern env pattern value =
    match pattern with
    | P_ignore -> env
    | P_var name -> bind env name value
    | P_tuple patterns -> (
        match value.payload with
        | Tuple values when List.length patterns = List.length values ->
            List.fold_left2 bind_pattern env patterns values
        | _ -> raise (Runtime_failure "tuple pattern mismatch"))
    | P_struct (name, field_patterns) -> (
        match value.payload with
        | Struct (actual, fields) when actual = name ->
            List.fold_left
              (fun env (field, pattern) ->
                match List.assoc_opt field fields with
                | None -> raise (Runtime_failure ("missing runtime field: " ^ field))
                | Some value -> bind_pattern env pattern value)
              env field_patterns
        | _ -> raise (Runtime_failure "struct pattern mismatch"))
    | P_variant (variant_name, case_name, payload_pattern) -> (
        match value.payload with
        | Variant (actual_variant, actual_case, payload)
          when actual_variant = variant_name && actual_case = case_name -> (
            match (payload_pattern, payload) with
            | None, None -> env
            | Some pattern, Some value -> bind_pattern env pattern value
            | _ -> raise (Runtime_failure "variant payload pattern mismatch"))
        | _ -> raise (Runtime_failure "variant pattern mismatch"))

  let rec eval_expr state env expr =
    let state = tick state "expr" in
    match expr with
    | Literal literal ->
        let typ, payload, detail = literal_payload literal in
        let value, state = fresh state typ payload detail in
        (value, state, env)
    | Var name ->
        let value, env = move_from_env env name in
        let state =
          emit state (Move { value_id = value.id; from_owner = name; to_owner = "<expr>" })
        in
        (value, state, env)
    | Tuple exprs ->
        let values, state, env =
          List.fold_left
            (fun (values, state, env) expr ->
              let value, state, env = eval_expr state env expr in
              (value :: values, state, env))
            ([], state, env) exprs
        in
        let values = List.rev values in
        let typ = Type.Tuple (List.map (fun (value : value) -> value.typ) values) in
        let state =
          List.fold_left
            (fun state value -> consume state value "<tuple>" "tuple construction")
            state values
        in
        let value, state = fresh state typ (Tuple values) "tuple" in
        let state =
          emit state
            (Transform
               {
                 inputs = List.map (fun value -> value.id) values;
                 outputs = [ value.id ];
                 operation = "Tuple";
               })
        in
        (value, state, env)
    | Struct (name, fields) ->
        let values, state, env =
          List.fold_left
            (fun (values, state, env) (field, expr) ->
              let value, state, env = eval_expr state env expr in
              ((field, value) :: values, state, env))
            ([], state, env) fields
        in
        let values = List.rev values in
        let state =
          List.fold_left
            (fun state (_, value) -> consume state value ("<struct:" ^ name ^ ">") "struct construction")
            state values
        in
        let value, state =
          fresh state (Type.Struct name) (Struct (name, values)) ("struct " ^ name)
        in
        let state =
          emit state
            (Transform
               {
                 inputs = List.map (fun (_, value) -> value.id) values;
                 outputs = [ value.id ];
                 operation = "Struct " ^ name;
               })
        in
        (value, state, env)
    | Variant (variant_name, case_name, payload_expr) -> (
        match payload_expr with
        | None ->
            let value, state =
              fresh state (Type.Variant variant_name)
                (Variant (variant_name, case_name, None))
                (variant_name ^ "::" ^ case_name)
            in
            (value, state, env)
        | Some expr ->
            let payload, state, env = eval_expr state env expr in
            let state =
              consume state payload ("<variant:" ^ variant_name ^ ">")
                "variant construction"
            in
            let value, state =
              fresh state (Type.Variant variant_name)
                (Variant (variant_name, case_name, Some payload))
                (variant_name ^ "::" ^ case_name)
            in
            let state =
              emit state
                (Transform
                   {
                     inputs = [ payload.id ];
                     outputs = [ value.id ];
                     operation = "Variant " ^ variant_name ^ "::" ^ case_name;
                   })
            in
            (value, state, env))
    | Duplicate expr ->
        let source, state, env = eval_expr state env expr in
        let state = consume state source "<duplicate>" "Duplicate" in
        let left, state = duplicate_value state source in
        let right, state = duplicate_value state source in
        let state =
          emit state
            (Duplicate
               { source = source.id; left = left.id; right = right.id; typ = source.typ })
        in
        let tuple, state =
          fresh state (Type.Tuple [ source.typ; source.typ ]) (Tuple [ left; right ])
            "Duplicate result"
        in
        (tuple, state, env)
    | Discard expr ->
        let value, state, env = eval_expr state env expr in
        let state = consume state value "<discard>" "Discard" in
        let state = emit state (Discard { value_id = value.id; typ = value.typ }) in
        let unit, state = fresh state Type.Unit Unit "Discard result" in
        (unit, state, env)
    | Equal (left, right) ->
        let left, state, env = eval_expr state env left in
        let right, state, env = eval_expr state env right in
        let state = consume state left "<equal>" "Equal left" in
        let state = consume state right "<equal>" "Equal right" in
        let result =
          match (left.payload, right.payload) with
          | Unit, Unit -> true
          | Bool left, Bool right -> left = right
          | Nat left, Nat right -> Nat.equal left right
          | _ -> false
        in
        let value, state = fresh state Type.Bool (Bool result) "Equal result" in
        let state =
          emit state
            (Transform
               {
                 inputs = [ left.id; right.id ];
                 outputs = [ value.id ];
                 operation = "Equal";
               })
        in
        (value, state, env)
    | Call (name, args) ->
        let args, state, env =
          List.fold_left
            (fun (values, state, env) expr ->
              let value, state, env = eval_expr state env expr in
              (value :: values, state, env))
            ([], state, env) args
        in
        let args = List.rev args in
        let value, state = call_function state name args in
        (value, state, env)
    | If (condition, then_block, else_block) -> (
        let condition, state, env = eval_expr state env condition in
        let state = consume state condition "<if>" "If condition" in
        match condition.payload with
        | Bool true ->
            let state = emit state (Branch { kind = "If"; selected = "Then" }) in
            eval_yield_block state env then_block
        | Bool false ->
            let state = emit state (Branch { kind = "If"; selected = "Else" }) in
            eval_yield_block state env else_block
        | _ -> raise (Runtime_failure "if condition was not Bool"))
    | Match (scrutinee, arms) -> (
        let scrutinee, state, env = eval_expr state env scrutinee in
        let state = consume state scrutinee "<match>" "Match scrutinee" in
        match scrutinee.payload with
        | Variant (variant_name, case_name, payload) ->
            let arm =
              List.find_opt
                (fun arm ->
                  match arm.pattern with
                  | P_variant (name, case, _) -> name = variant_name && case = case_name
                  | _ -> false)
                arms
            in
            let arm =
              match arm with
              | Some arm -> arm
              | None -> raise (Runtime_failure "no matching match arm")
            in
            let state =
              emit state
                (Branch
                   { kind = "Match " ^ variant_name; selected = case_name })
            in
            let env =
              match (arm.pattern, payload) with
              | P_variant (_, _, None), None -> env
              | P_variant (_, _, Some pattern), Some value -> bind_pattern env pattern value
              | _ -> raise (Runtime_failure "match payload mismatch")
            in
            eval_yield_block state env arm.body
        | _ -> raise (Runtime_failure "match scrutinee was not Variant"))
    | Continue expr ->
        let value, state, _env = eval_expr state env expr in
        let state = emit state (LoopContinue { value_id = value.id }) in
        raise (Continued (value, state))
    | Break expr ->
        let value, state, _env = eval_expr state env expr in
        let state = emit state (LoopBreak { value_id = value.id }) in
        raise (Broken (value, state))
    | Loop (initial, state_name, body) ->
        let initial, state, env = eval_expr state env initial in
        let rec run_iteration state current =
          let state = tick state "loop iteration" in
          let state = emit state LoopEnter in
          let loop_env = bind env state_name current in
          try
            let value, state, _env = eval_yield_block state loop_env body in
            let state = emit state (LoopBreak { value_id = value.id }) in
            let state = emit state (LoopExit { value_id = value.id }) in
            (value, state, env)
          with
          | Continued (next_state, state) -> run_iteration state next_state
          | Broken (result, state) ->
              let state = emit state (LoopExit { value_id = result.id }) in
              (result, state, env)
        in
        run_iteration state initial
    | Capture (captures, param, param_type, return_type, body) ->
        let captured, state, env =
          List.fold_left
            (fun (captured, state, env) name ->
              let value, env = move_from_env env name in
              let state =
                emit state
                  (Move
                     {
                       value_id = value.id;
                       from_owner = name;
                       to_owner = "<closure>";
                     })
              in
              ((name, value) :: captured, state, env))
            ([], state, env) captures
        in
        let captured = List.rev captured in
        let typ =
          Type.Closure
            {
              arg = param_type;
              ret = return_type;
              captures = List.map (fun (_, (value : value)) -> value.typ) captured;
            }
        in
        let value, state =
          fresh state typ
            (Closure { captures = captured; param; param_type; return_type; body })
            "closure"
        in
        let state =
          emit state
            (ClosureCreate
               {
                 value_id = value.id;
                 captures = List.map (fun (_, value) -> value.id) captured;
               })
        in
        (value, state, env)
    | Call_closure (closure_expr, arg_expr) -> (
        let closure_value, state, env = eval_expr state env closure_expr in
        let arg_value, state, env = eval_expr state env arg_expr in
        let state = consume state closure_value "<closure-call>" "Call closure" in
        let state = consume state arg_value "<closure-call>" "Closure argument" in
        match closure_value.payload with
        | Closure { captures; param; body; _ } ->
            let state = emit state (ClosureEnter { value_id = closure_value.id }) in
            let closure_env =
              List.fold_left
                (fun env (name, value) -> bind env name value)
                String_map.empty captures
              |> fun env -> bind env param arg_value
            in
            let value, state =
              try
                let _state, _env = eval_statements state closure_env body in
                raise (Runtime_failure "closure did not return")
              with Returned (value, state) -> (value, state)
            in
            let state = emit state (ClosureReturn { value_id = value.id }) in
            (value, state, env)
        | _ -> raise (Runtime_failure "Call_closure target was not a closure"))

  and eval_stmt state env stmt =
    match stmt with
    | Let (pattern, expr) ->
        let value, state, env = eval_expr state env expr in
        let env = bind_pattern env pattern value in
        (state, env)
    | Expr expr ->
        let _, state, env = eval_expr state env expr in
        (state, env)
    | Return expr ->
        let value, state, _env = eval_expr state env expr in
        raise (Returned (value, state))

  and eval_statements state env stmts =
    List.fold_left
      (fun (state, env) stmt -> eval_stmt state env stmt)
      (state, env) stmts

  and eval_yield_block state env block =
    let state, env = eval_statements state env block.stmts in
    eval_expr state env block.yield

  and call_function state name args =
    match String_map.find_opt name state.ctx.functions with
    | None -> raise (Runtime_failure ("unknown function: " ^ name))
    | Some fn ->
        let state = tick state ("function " ^ name) in
        let state = emit state (FunctionEnter { name }) in
        let env =
          List.fold_left2
            (fun env (param, _) value -> bind env param value)
            String_map.empty fn.params args
        in
        let state =
          List.fold_left2
            (fun state (param, _) value ->
              emit state
                (Move
                   {
                     value_id = value.id;
                     from_owner = "<argument>";
                     to_owner = name ^ "." ^ param;
                   }))
            state fn.params args
        in
        try
          let _state, _env = eval_statements state env fn.body in
          raise (Runtime_failure ("function did not return: " ^ name))
        with
        | Returned (value, state) ->
            let state =
              emit state (FunctionReturn { name; value_id = value.id })
            in
            (value, state)

  let trace_event_to_string = function
    | Create { value_id; typ; detail } ->
        "Create #" ^ string_of_int value_id ^ " : " ^ Type.to_string typ
        ^ " (" ^ detail ^ ")"
    | Move { value_id; from_owner; to_owner } ->
        "Move #" ^ string_of_int value_id ^ " " ^ from_owner ^ " -> "
        ^ to_owner
    | Consume { value_id; owner; reason } ->
        "Consume #" ^ string_of_int value_id ^ " at " ^ owner ^ " (" ^ reason ^ ")"
    | Duplicate { source; left; right; typ } ->
        "Duplicate #" ^ string_of_int source ^ " -> #" ^ string_of_int left
        ^ ", #" ^ string_of_int right ^ " : " ^ Type.to_string typ
    | Transform { inputs; outputs; operation } ->
        "Transform " ^ operation ^ " inputs=["
        ^ String.concat "," (List.map string_of_int inputs)
        ^ "] outputs=["
        ^ String.concat "," (List.map string_of_int outputs)
        ^ "]"
    | Discard { value_id; typ } ->
        "Discard #" ^ string_of_int value_id ^ " : " ^ Type.to_string typ
    | FunctionEnter { name } -> "FunctionEnter " ^ name
    | FunctionReturn { name; value_id } ->
        "FunctionReturn " ^ name ^ " #" ^ string_of_int value_id
    | Branch { kind; selected } -> "Branch " ^ kind ^ " -> " ^ selected
    | LoopEnter -> "LoopEnter"
    | LoopContinue { value_id } -> "LoopContinue #" ^ string_of_int value_id
    | LoopBreak { value_id } -> "LoopBreak #" ^ string_of_int value_id
    | LoopExit { value_id } -> "LoopExit #" ^ string_of_int value_id
    | ClosureCreate { value_id; captures } ->
        "ClosureCreate #" ^ string_of_int value_id ^ " captures=["
        ^ String.concat "," (List.map string_of_int captures)
        ^ "]"
    | ClosureEnter { value_id } -> "ClosureEnter #" ^ string_of_int value_id
    | ClosureReturn { value_id } -> "ClosureReturn #" ^ string_of_int value_id
    | NormalResult { value_id; typ } ->
        "NormalResult #" ^ string_of_int value_id ^ " : " ^ Type.to_string typ

  let step_limit_report state limit =
    {
      executed_steps = state.executed_steps;
      step_limit = limit;
      last_location = state.last_location;
      live_values = [];
      unresolved_resources = [];
      last_world = None;
      trace = List.rev state.trace;
    }

  let run ?step_limit program ~entry =
    match step_limit with
    | Some limit when limit < 0 -> Runtime_error "step_limit must be nonnegative"
    | _ -> (
    match check_program program with
    | Error errors -> Static_error errors
    | Ok () -> (
        let ctx, _ = build_context program in
        let state =
          {
            ctx;
            next_id = 0;
            trace = [];
            step_limit;
            executed_steps = 0;
            last_location = None;
          }
        in
        try
          let value, state = call_function state entry [] in
          let state =
            emit state (NormalResult { value_id = value.id; typ = value.typ })
          in
          Completed { value; trace = List.rev state.trace }
        with
        | Runtime_failure message -> Runtime_error message
        | Step_limit state -> (
            match step_limit with
            | None -> Runtime_error "internal step limit without configured limit"
            | Some limit -> Step_limit_exceeded (step_limit_report state limit))))
end
