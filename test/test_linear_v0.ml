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
  | L.Runtime.Step_limit_exceeded _ -> failwith "unexpected step limit"
  | L.Runtime.Static_error errors ->
      failwith
        (String.concat "; " (List.map L.Diagnostic.to_string errors))
  | L.Runtime.Runtime_error message -> failwith message

let expect_step_limit ?(limit = 0) program =
  match L.Runtime.run ~step_limit:limit program ~entry:"main" with
  | L.Runtime.Step_limit_exceeded report -> report
  | L.Runtime.Completed _ -> assert false
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

let counter_variant =
  {
    L.variant_name = "Counter";
    cases =
      [
        { case_name = "Two"; payload = None };
        { case_name = "One"; payload = None };
        { case_name = "Done"; payload = Some L.Type.Nat };
      ];
  }

let test_loop_continue_break () =
  let state_type = L.Type.Variant "Counter" in
  let arm case payload body =
    { L.pattern = P_variant ("Counter", case, payload); body }
  in
  let main =
    unit_fn "main" L.Type.Nat
      [
        Let
          ( P_var "result",
            Loop
              ( Variant ("Counter", "Two", None),
                "state",
                {
                  stmts = [];
                  yield =
                    Match
                      ( Var "state",
                        [
                          arm "Two" None
                            {
                              stmts = [];
                              yield = Continue (Variant ("Counter", "One", None));
                            };
                          arm "One" None
                            {
                              stmts = [];
                              yield =
                                Continue
                                  (Variant
                                     ( "Counter",
                                       "Done",
                                       Some (Literal (Nat (nat "9"))) ));
                            };
                          arm "Done" (Some (P_var "n"))
                            { stmts = []; yield = Break (Var "n") };
                        ] );
                } ) );
        Return (Var "result");
      ]
  in
  ignore state_type;
  expect_ok (L.check_program (program ~variants:[ counter_variant ] [ main ]));
  let value, trace = expect_run_completed (program ~variants:[ counter_variant ] [ main ]) in
  assert (L.Type.equal (L.Runtime.typ value) L.Type.Nat);
  assert_has_event
    (function
      | L.Runtime.LoopContinue _ -> true
      | _ -> false)
    trace;
  assert_has_event
    (function
      | L.Runtime.LoopBreak _ -> true
      | _ -> false)
    trace

let test_loop_rejections () =
  let bad_continue =
    unit_fn "main" L.Type.Nat
      [
        Let
          ( P_var "result",
            Loop
              ( Literal (Nat (nat "0")),
                "state",
                { stmts = []; yield = Continue (Literal Unit) } ) );
        Return (Var "result");
      ]
  in
  expect_static_error
    (function
      | L.Diagnostic.Loop_control_type_mismatch _ -> true
      | _ -> false)
    (program [ bad_continue ]);
  let bad_break_types =
    unit_fn "main" L.Type.Nat
      [
        Let (P_var "cond", Literal (Bool true));
        Let
          ( P_var "result",
            Loop
              ( Literal Unit,
                "state",
                {
                  stmts = [];
                  yield =
                    If
                      ( Var "cond",
                        { stmts = []; yield = Break (Literal (Nat (nat "1"))) },
                        { stmts = []; yield = Break (Literal Unit) } );
                } ) );
        Return (Var "result");
      ]
  in
  expect_static_error
    (function
      | L.Diagnostic.Loop_control_type_mismatch _ -> true
      | _ -> false)
    (program [ bad_break_types ]);
  let unresolved_before_continue =
    unit_fn "main" L.Type.Nat
      [
        Let
          ( P_var "result",
            Loop
              ( Literal Unit,
                "state",
                {
                  stmts = [ Let (P_var "tmp", Literal (Nat (nat "1"))) ];
                  yield = Continue (Var "state");
                } ) );
        Return (Var "result");
      ]
  in
  expect_static_error
    (function
      | L.Diagnostic.Unresolved_value "tmp" -> true
      | _ -> false)
    (program [ unresolved_before_continue ]);
  let implicit_break =
    unit_fn "main" L.Type.Nat
      [
        Let
          ( P_var "result",
            Loop
              ( Literal Unit,
                "state",
                { stmts = [ Expr (Discard (Var "state")) ]; yield = Literal (Nat (nat "1")) } ) );
        Return (Var "result");
      ]
  in
  expect_static_error
    (function
      | L.Diagnostic.Loop_control_outside_loop _ -> true
      | _ -> false)
    (program [ implicit_break ])

let test_closure_capture_call () =
  let main =
    unit_fn "main" L.Type.Nat
      [
        Let (P_var "captured", Literal (Nat (nat "5")));
        Let
          ( P_var "closure",
            Capture
              ( [ "captured" ],
                "input",
                L.Type.Unit,
                L.Type.Nat,
                [ Expr (Discard (Var "input")); Return (Var "captured") ] ) );
        Return (Call_closure (Var "closure", Literal Unit));
      ]
  in
  expect_ok (L.check_program (program [ main ]));
  let value, trace = expect_run_completed (program [ main ]) in
  assert (L.Type.equal (L.Runtime.typ value) L.Type.Nat);
  assert_has_event
    (function
      | L.Runtime.ClosureCreate _ -> true
      | _ -> false)
    trace;
  assert_has_event
    (function
      | L.Runtime.ClosureReturn _ -> true
      | _ -> false)
    trace

let test_closure_duplicate () =
  let main =
    unit_fn "main" L.Type.Nat
      [
        Let (P_var "captured", Literal (Nat (nat "5")));
        Let
          ( P_var "closure",
            Capture
              ( [ "captured" ],
                "input",
                L.Type.Unit,
                L.Type.Nat,
                [ Expr (Discard (Var "input")); Return (Var "captured") ] ) );
        Let (P_tuple [ P_var "left"; P_var "right" ], Duplicate (Var "closure"));
        Let (P_var "a", Call_closure (Var "left", Literal Unit));
        Let (P_var "b", Call_closure (Var "right", Literal Unit));
        Expr (Discard (Var "a"));
        Return (Var "b");
      ]
  in
  expect_ok (L.check_program (program [ main ]));
  ignore (expect_run_completed (program [ main ]))

let test_closure_rejections () =
  let after_capture =
    unit_fn "main" L.Type.Unit
      [
        Let (P_var "captured", Literal (Nat (nat "5")));
        Let
          ( P_var "closure",
            Capture
              ( [ "captured" ],
                "input",
                L.Type.Unit,
                L.Type.Nat,
                [ Expr (Discard (Var "input")); Return (Var "captured") ] ) );
        Expr (Discard (Var "captured"));
        Expr (Discard (Var "closure"));
        Return (Literal Unit);
      ]
  in
  expect_static_error
    (function
      | L.Diagnostic.Use_after_move "captured" -> true
      | _ -> false)
    (program [ after_capture ]);
  let uncaptured =
    unit_fn "main" L.Type.Unit
      [
        Let (P_var "outer", Literal (Nat (nat "5")));
        Let
          ( P_var "closure",
            Capture
              ( [],
                "input",
                L.Type.Unit,
                L.Type.Nat,
                [ Expr (Discard (Var "input")); Return (Var "outer") ] ) );
        Expr (Discard (Var "outer"));
        Expr (Discard (Var "closure"));
        Return (Literal Unit);
      ]
  in
  expect_static_error
    (function
      | L.Diagnostic.Unknown_variable "outer" -> true
      | _ -> false)
    (program [ uncaptured ]);
  let linear_capture_dup =
    {
      L.fn_name = "main";
      type_params = [];
      capability_bounds = [];
      params = [ ("file", L.Type.Resource { name = "File"; state = "Open" }) ];
      return_type = L.Type.Unit;
      body =
        [
          Let
            ( P_var "closure",
              Capture
                ( [ "file" ],
                  "input",
                  L.Type.Unit,
                  L.Type.Unit,
                  [ Expr (Discard (Var "input")); Return (Literal Unit) ] ) );
          Let (P_var "copies", Duplicate (Var "closure"));
          Return (Literal Unit);
        ];
    }
  in
  expect_static_error
    (function
      | L.Diagnostic.Capability_required
          { capability = L.Capability.Duplicable; _ } ->
          true
      | _ -> false)
    (program [ linear_capture_dup ]);
  let compare_closure =
    unit_fn "main" L.Type.Unit
      [
        Let
          ( P_var "closure",
            Capture
              ( [],
                "input",
                L.Type.Unit,
                L.Type.Unit,
                [ Expr (Discard (Var "input")); Return (Literal Unit) ] ) );
        Let (P_var "eq", Equal (Var "closure", Var "closure"));
        Return (Literal Unit);
      ]
  in
  expect_static_error
    (function
      | L.Diagnostic.Use_after_move "closure"
      | L.Diagnostic.Function_or_closure_comparable _ ->
          true
      | _ -> false)
    (program [ compare_closure ])

let test_recursion_and_step_limit () =
  let recur =
    {
      L.fn_name = "recur";
      type_params = [];
      capability_bounds = [];
      params = [ ("again", L.Type.Bool) ];
      return_type = L.Type.Unit;
      body =
        [
          Return
            (If
               ( Var "again",
                 { stmts = []; yield = Call ("recur", [ Literal (Bool false) ]) },
                 { stmts = []; yield = Literal Unit } ));
        ];
    }
  in
  let main =
    unit_fn "main" L.Type.Unit [ Return (Call ("recur", [ Literal (Bool true) ])) ]
  in
  expect_ok (L.check_program (program [ recur; main ]));
  let _value, trace = expect_run_completed (program [ recur; main ]) in
  let recur_enters =
    List.filter
      (function
        | L.Runtime.FunctionEnter { name = "recur" } -> true
        | _ -> false)
      trace
  in
  assert (List.length recur_enters = 2);
  let infinite =
    {
      L.fn_name = "main";
      type_params = [];
      capability_bounds = [];
      params = [];
      return_type = L.Type.Unit;
      body = [ Return (Call ("main", [])) ];
    }
  in
  let report = expect_step_limit ~limit:5 (program [ infinite ]) in
  assert (report.L.Runtime.executed_steps = 5);
  assert (report.step_limit = 5);
  assert (
    not
      (List.exists
         (function
           | L.Runtime.NormalResult _ -> true
           | _ -> false)
         report.trace));
  let zero = expect_step_limit ~limit:0 (program [ unit_fn "main" L.Type.Unit [ Return (Literal Unit) ] ]) in
  assert (zero.executed_steps = 0);
  let infinite_loop =
    unit_fn "main" L.Type.Unit
      [
        Return
          (Loop
             ( Literal Unit,
               "state",
               { stmts = []; yield = Continue (Var "state") } ));
      ]
  in
  let loop_report = expect_step_limit ~limit:8 (program [ infinite_loop ]) in
  assert (loop_report.executed_steps = 8);
  assert (
    not
      (List.exists
         (function
           | L.Runtime.NormalResult _ -> true
           | L.Runtime.Discard _ -> true
           | _ -> false)
         loop_report.trace))

let () =
  test_move_and_return ();
  test_duplicate_and_discard ();
  test_if_join ();
  test_result_match ();
  test_struct_full_destructure ();
  test_argument_order ();
  test_rejections ();
  test_loop_continue_break ();
  test_loop_rejections ();
  test_closure_capture_call ();
  test_closure_duplicate ();
  test_closure_rejections ();
  test_recursion_and_step_limit ()
