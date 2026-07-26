open Tilefold

module S = Tilefold_surface.Surface_program

let function_id value =
  match S.Function_id.of_string value with
  | Ok id -> id
  | Error message -> failwith message

let name value =
  match S.Name.of_string value with
  | Ok name -> name
  | Error message -> failwith message

let nat_parameter value : S.parameter =
  { name = name value; typ = Core_type.Nat }

let nat_result value : S.result =
  { name = name value; typ = Core_type.Nat }

let argument parameter value : S.argument =
  { parameter = name parameter; value }

let call target arguments =
  S.Call { function_id = function_id target; arguments }

let first_function : S.function_decl =
  {
    id = function_id "first";
    parameters = [ nat_parameter "left"; nat_parameter "right" ];
    result = nat_result "selected";
    body = S.Parameter (name "left");
  }

let entry_function arguments : S.function_decl =
  {
    id = function_id "entry";
    parameters = [];
    result = nat_result "answer";
    body = call "first" arguments;
  }

let validate functions =
  S.Raw.create ~functions |> S.validate

let has_error predicate = function
  | Ok _ -> false
  | Error errors -> List.exists predicate errors

let test_names_must_not_be_empty () =
  assert (Result.is_error (S.Function_id.of_string ""));
  assert (Result.is_error (S.Name.of_string ""))

let test_valid_named_multi_argument_call () =
  match
    validate
      [
        entry_function
          [
            argument "right" (S.Nat_literal Nat.one);
            argument "left" (S.Nat_literal Nat.zero);
          ];
        first_function;
      ]
  with
  | Ok program ->
      assert (List.length (S.functions program) = 2)
  | Error errors ->
      failwith
        (String.concat "\n" (List.map S.render_validation_error errors))

let test_canonical_serialization_ignores_declaration_and_argument_order () =
  let left =
    validate
      [
        first_function;
        entry_function
          [
            argument "right" (S.Nat_literal Nat.one);
            argument "left" (S.Nat_literal Nat.zero);
          ];
      ]
  in
  let right =
    validate
      [
        entry_function
          [
            argument "left" (S.Nat_literal Nat.zero);
            argument "right" (S.Nat_literal Nat.one);
          ];
        first_function;
      ]
  in
  match (left, right) with
  | Ok left, Ok right ->
      assert (
        String.equal
          (S.canonical_serialization left)
          (S.canonical_serialization right));
      assert (
        String.equal
          (S.canonical_serialization left)
          "(\"tilefold-surface-program-v0\" (\"functions\" (\"function\" \"entry\" (\"parameters\") (\"result\" \"answer\" (\"Nat\")) (\"body\" (\"call\" \"first\" (\"arguments\" (\"argument\" \"left\" (\"nat\" \"0\")) (\"argument\" \"right\" (\"nat\" \"1\")))))) (\"function\" \"first\" (\"parameters\" (\"parameter\" \"left\" (\"Nat\")) (\"parameter\" \"right\" (\"Nat\"))) (\"result\" \"selected\" (\"Nat\")) (\"body\" (\"parameter-ref\" \"left\"))))))\n")
  | Error errors, _ | _, Error errors ->
      failwith
        (String.concat "\n" (List.map S.render_validation_error errors))

let test_duplicate_function_and_parameter_names () =
  let duplicate_parameter : S.function_decl =
    {
      first_function with
      parameters = [ nat_parameter "left"; nat_parameter "left" ];
    }
  in
  let result = validate [ duplicate_parameter; duplicate_parameter ] in
  assert (
    has_error
      (function S.Duplicate_function_id _ -> true | _ -> false)
      result);
  assert (
    has_error
      (function S.Duplicate_parameter_name _ -> true | _ -> false)
      result)

let test_parameter_and_result_type_errors () =
  let unknown_parameter : S.function_decl =
    {
      id = function_id "unknown-parameter";
      parameters = [];
      result = nat_result "answer";
      body = S.Parameter (name "missing");
    }
  in
  let wrong_result : S.function_decl =
    {
      id = function_id "wrong-result";
      parameters = [];
      result = nat_result "answer";
      body = S.Unit_literal;
    }
  in
  let result = validate [ unknown_parameter; wrong_result ] in
  assert (
    has_error
      (function S.Unknown_parameter_reference _ -> true | _ -> false)
      result);
  assert (
    has_error
      (function S.Result_type_mismatch _ -> true | _ -> false)
      result)

let test_call_argument_validation () =
  let result =
    validate
      [
        first_function;
        entry_function
          [
            argument "left" S.Unit_literal;
            argument "left" (S.Nat_literal Nat.zero);
            argument "extra" (S.Nat_literal Nat.one);
          ];
      ]
  in
  assert (
    has_error
      (function S.Duplicate_call_argument _ -> true | _ -> false)
      result);
  assert (
    has_error
      (function S.Missing_call_argument _ -> true | _ -> false)
      result);
  assert (
    has_error
      (function S.Unexpected_call_argument _ -> true | _ -> false)
      result);
  assert (
    has_error
      (function S.Call_argument_type_mismatch _ -> true | _ -> false)
      result)

let test_unknown_call_target () =
  let caller : S.function_decl =
    {
      id = function_id "caller";
      parameters = [];
      result = nat_result "answer";
      body = call "missing" [];
    }
  in
  assert (
    has_error
      (function S.Unknown_call_target _ -> true | _ -> false)
      (validate [ caller ]))

let test_call_cycle_is_rejected () =
  let function_a : S.function_decl =
    {
      id = function_id "a";
      parameters = [];
      result = nat_result "answer";
      body = call "b" [];
    }
  in
  let function_b : S.function_decl =
    {
      id = function_id "b";
      parameters = [];
      result = nat_result "answer";
      body = call "a" [];
    }
  in
  assert (
    has_error
      (function
        | S.Function_call_cycle ids ->
            List.map S.Function_id.to_string ids = [ "a"; "b"; "a" ]
        | _ -> false)
      (validate [ function_b; function_a ]))

let () =
  test_names_must_not_be_empty ();
  test_valid_named_multi_argument_call ();
  test_canonical_serialization_ignores_declaration_and_argument_order ();
  test_duplicate_function_and_parameter_names ();
  test_parameter_and_result_type_errors ();
  test_call_argument_validation ();
  test_unknown_call_target ();
  test_call_cycle_is_rejected ();
  print_endline "surface program tests passed"
