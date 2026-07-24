open Tilefold
module L = Linear_v0

let nat value =
  match Nat.of_string value with
  | Ok nat -> nat
  | Error _ -> assert false

let expect_ok = function
  | Ok value -> value
  | Error errors ->
      failwith
        (String.concat "; " (List.map L.Diagnostic.to_string errors))

let expect_static_error pred program =
  match L.check_program program with
  | Ok () -> assert false
  | Error errors -> assert (List.exists pred errors)

let expect_run_completed program =
  match L.Runtime.run program ~entry:"main" with
  | L.Runtime.Completed { value; trace } -> (value, trace)
  | L.Runtime.Static_error errors ->
      failwith
        (String.concat "; " (List.map L.Diagnostic.to_string errors))
  | L.Runtime.Runtime_error message -> failwith message

let unit_fn name return_type body =
  {
    L.fn_name = name;
    type_params = [];
    capability_bounds = [];
    params = [];
    return_type;
    body;
  }

let program ?(structs = []) ?(variants = []) functions =
  { L.structs; variants; functions }

let assert_has_event pred trace = assert (List.exists pred trace)

let result_variant =
  {
    L.variant_name = "ResultNatUnit";
    cases =
      [
        { case_name = "Ok"; payload = Some L.Type.Nat };
        { case_name = "Err"; payload = Some L.Type.Unit };
      ];
  }

let point_struct =
  {
    L.struct_name = "Point";
    fields = [ ("x", L.Type.Nat); ("y", L.Type.Nat) ];
  }

let test_move_and_return () =
  let main =
    unit_fn "main" L.Type.Nat
      [
        Let (P_var "x", Literal (Nat (nat "3")));
        Let (P_var "y", Var "x");
        Return (Var "y");
      ]
  in
  expect_ok (L.check_program (program [ main ]));
  let value, trace = expect_run_completed (program [ main ]) in
  assert (L.Type.equal (L.Runtime.typ value) L.Type.Nat);
  assert_has_event
    (function
      | L.Runtime.Move _ -> true
      | _ -> false)
    trace

let test_duplicate_and_discard () =
  let main =
    unit_fn "main" L.Type.Nat
      [
        Let (P_var "x", Literal (Nat (nat "4")));
        Let (P_tuple [ P_var "a"; P_var "b" ], Duplicate (Var "x"));
        Expr (Discard (Var "a"));
        Return (Var "b");
      ]
  in
  expect_ok (L.check_program (program [ main ]));
  let _value, trace = expect_run_completed (program [ main ]) in
  let duplicate =
    List.find
      (function
        | L.Runtime.Duplicate _ -> true
        | _ -> false)
      trace
  in
  match duplicate with
  | L.Runtime.Duplicate { source; left; right; _ } ->
      assert (source <> left);
      assert (source <> right);
      assert (left <> right)
  | _ -> assert false

let test_if_join () =
  let block expr = { L.stmts = []; yield = expr } in
  let main =
    unit_fn "main" L.Type.Nat
      [
        Let (P_var "cond", Literal (Bool true));
        Let
          ( P_var "result",
            If
              ( Var "cond",
                block (Literal (Nat (nat "1"))),
                block (Literal (Nat (nat "2"))) ) );
        Return (Var "result");
      ]
  in
  expect_ok (L.check_program (program [ main ]));
  let value, trace = expect_run_completed (program [ main ]) in
  assert (L.Type.equal (L.Runtime.typ value) L.Type.Nat);
  assert_has_event
    (function
      | L.Runtime.Branch { kind = "If"; selected = "Then" } -> true
      | _ -> false)
    trace

let test_result_match () =
  let arm case var yield =
    {
      L.pattern =
        P_variant ("ResultNatUnit", case, Some (P_var var));
      body = { stmts = []; yield };
    }
  in
  let main =
    unit_fn "main" L.Type.Nat
      [
        Let
          ( P_var "parsed",
            Variant ("ResultNatUnit", "Ok", Some (Literal (Nat (nat "7")))) );
        Let
          ( P_var "value",
            Match
              ( Var "parsed",
                [
                  arm "Ok" "n" (Var "n");
                  arm "Err" "e"
                    (Tuple
                       [
                         Discard (Var "e");
                         Literal (Nat (nat "0"));
                       ]);
                ] ) );
        Return (Var "value");
      ]
  in
  expect_static_error
    (function
      | L.Diagnostic.Type_mismatch _ -> true
      | _ -> false)
    (program ~variants:[ result_variant ] [ main ]);
  let main_fixed =
    unit_fn "main" L.Type.Nat
      [
        Let
          ( P_var "parsed",
            Variant ("ResultNatUnit", "Ok", Some (Literal (Nat (nat "7")))) );
        Let
          ( P_var "value",
            Match
              ( Var "parsed",
                [
                  arm "Ok" "n" (Var "n");
                  {
                    pattern =
                      P_variant ("ResultNatUnit", "Err", Some (P_var "e"));
                    body =
                      {
                        stmts = [ Expr (Discard (Var "e")) ];
                        yield = Literal (Nat (nat "0"));
                      };
                  };
                ] ) );
        Return (Var "value");
      ]
  in
  expect_ok (L.check_program (program ~variants:[ result_variant ] [ main_fixed ]));
  let _value, trace = expect_run_completed (program ~variants:[ result_variant ] [ main_fixed ]) in
  assert_has_event
    (function
      | L.Runtime.Branch { kind = "Match ResultNatUnit"; selected = "Ok" } -> true
      | _ -> false)
    trace

let test_struct_full_destructure () =
  let main =
    unit_fn "main" L.Type.Nat
      [
        Let
          ( P_var "point",
            Struct
              ( "Point",
                [
                  ("x", Literal (Nat (nat "1")));
                  ("y", Literal (Nat (nat "2")));
                ] ) );
        Let (P_struct ("Point", [ ("x", P_var "x"); ("y", P_var "y") ]), Var "point");
        Expr (Discard (Var "y"));
        Return (Var "x");
      ]
  in
  expect_ok (L.check_program (program ~structs:[ point_struct ] [ main ]));
  ignore (expect_run_completed (program ~structs:[ point_struct ] [ main ]))

let test_argument_order () =
  let make name n =
    unit_fn name L.Type.Nat [ Return (Literal (Nat (nat n))) ]
  in
  let pair =
    {
      L.fn_name = "pair";
      type_params = [];
      capability_bounds = [];
      params = [ ("left", L.Type.Nat); ("right", L.Type.Nat) ];
      return_type = L.Type.Nat;
      body = [ Expr (Discard (Var "right")); Return (Var "left") ];
    }
  in
  let main =
    unit_fn "main" L.Type.Nat [ Return (Call ("pair", [ Call ("make_left", []); Call ("make_right", []) ])) ]
  in
  let _value, trace =
    expect_run_completed (program [ make "make_left" "1"; make "make_right" "2"; pair; main ])
  in
  let names =
    List.filter_map
      (function
        | L.Runtime.FunctionEnter { name } -> Some name
        | _ -> None)
      trace
  in
  assert (names = [ "main"; "make_left"; "make_right"; "pair" ])

let test_rejections () =
  let rejection body pred =
    expect_static_error pred (program [ unit_fn "main" L.Type.Unit body ])
  in
  rejection
    [
      Let (P_var "x", Literal (Nat (nat "1")));
      Let (P_var "y", Var "x");
      Expr (Discard (Var "x"));
      Return (Literal Unit);
    ]
    (function
      | L.Diagnostic.Use_after_move "x" -> true
      | _ -> false);
  rejection
    [
      Let (P_var "w", Literal Unit);
      Expr (Discard (Var "w"));
      Expr (Discard (Var "w"));
      Return (Literal Unit);
    ]
    (function
      | L.Diagnostic.Use_after_move "w" -> true
      | _ -> false);
  rejection
    [
      Let (P_var "w", Literal Unit);
      Let (P_var "world", Var "w");
      Let (P_var "copy", Duplicate (Var "world"));
      Return (Literal Unit);
    ]
    (function
      | L.Diagnostic.Unresolved_value _ -> true
      | _ -> false);
  let world_bad =
    unit_fn "main" L.Type.Unit
      [
        Let (P_var "world", Literal Unit);
        Return (Literal Unit);
      ]
  in
  ignore world_bad;
  let main_world_dup =
    {
      L.fn_name = "main";
      type_params = [];
      capability_bounds = [];
      params = [ ("world", L.Type.World) ];
      return_type = L.Type.Unit;
      body = [ Let (P_var "pair", Duplicate (Var "world")); Return (Literal Unit) ];
    }
  in
  expect_static_error
    (function
      | L.Diagnostic.World_cannot_be_duplicated -> true
      | _ -> false)
    (program [ main_world_dup ]);
  let partial_struct =
    unit_fn "main" L.Type.Nat
      [
        Let
          ( P_var "point",
            Struct
              ( "Point",
                [
                  ("x", Literal (Nat (nat "1")));
                  ("y", Literal (Nat (nat "2")));
                ] ) );
        Let (P_struct ("Point", [ ("x", P_var "x") ]), Var "point");
        Return (Var "x");
      ]
  in
  expect_static_error
    (function
      | L.Diagnostic.Partial_struct_pattern "Point" -> true
      | _ -> false)
    (program ~structs:[ point_struct ] [ partial_struct ]);
  let resource_discard =
    {
      L.fn_name = "main";
      type_params = [];
      capability_bounds = [];
      params = [ ("file", L.Type.Resource { name = "File"; state = "Open" }) ];
      return_type = L.Type.Unit;
      body = [ Expr (Discard (Var "file")); Return (Literal Unit) ];
    }
  in
  expect_static_error
    (function
      | L.Diagnostic.Capability_required
          { capability = L.Capability.Discardable; _ } ->
          true
      | _ -> false)
    (program [ resource_discard ]);
  let compare_reuse =
    unit_fn "main" L.Type.Unit
      [
        Let (P_var "a", Literal (Nat (nat "1")));
        Let (P_var "b", Literal (Nat (nat "1")));
        Let (P_var "same", Equal (Var "a", Var "b"));
        Expr (Discard (Var "same"));
        Expr (Discard (Var "a"));
        Return (Literal Unit);
      ]
  in
  expect_static_error
    (function
      | L.Diagnostic.Use_after_move "a" -> true
      | _ -> false)
    (program [ compare_reuse ]);
  let branch_mismatch =
    unit_fn "main" L.Type.Unit
      [
        Let (P_var "x", Literal (Nat (nat "1")));
        Let (P_var "cond", Literal (Bool true));
        Let
          ( P_var "u",
            If
              ( Var "cond",
                { stmts = [ Expr (Discard (Var "x")) ]; yield = Literal Unit },
                { stmts = []; yield = Literal Unit } ) );
        Return (Var "u");
      ]
  in
  expect_static_error
    (function
      | L.Diagnostic.Branch_state_mismatch "x" -> true
      | _ -> false)
    (program [ branch_mismatch ]);
  let reused_arg =
    {
      L.fn_name = "take";
      type_params = [];
      capability_bounds = [];
      params = [ ("a", L.Type.Nat); ("b", L.Type.Nat) ];
      return_type = L.Type.Unit;
      body = [ Expr (Discard (Var "a")); Expr (Discard (Var "b")); Return (Literal Unit) ];
    }
  in
  let bad_call =
    unit_fn "main" L.Type.Unit
      [
        Let (P_var "x", Literal (Nat (nat "1")));
        Return (Call ("take", [ Var "x"; Var "x" ]));
      ]
  in
  expect_static_error
    (function
      | L.Diagnostic.Use_after_move "x" -> true
      | _ -> false)
    (program [ reused_arg; bad_call ])

let () =
  test_move_and_return ();
  test_duplicate_and_discard ();
  test_if_join ();
  test_result_match ();
  test_struct_full_destructure ();
  test_argument_order ();
  test_rejections ()
