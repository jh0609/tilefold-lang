open Tilefold
open Core_graph

module S = Surface_symbolic
module P = Program_package

let eid value =
  match S.Element_id.of_string value with Ok id -> id | Error message -> failwith message

let rid value =
  match S.Relation_id.of_string value with Ok id -> id | Error message -> failwith message

let cid value =
  match S.Container_id.of_string value with Ok id -> id | Error message -> failwith message

let tid value =
  match Function_template_id.of_string value with Ok id -> id | Error message -> failwith message

let litid value =
  match P.Literal_id.of_string value with Ok id -> id | Error message -> failwith message

let nat value = match Nat.of_string value with Ok nat -> nat | Error _ -> failwith value

let endpoint element port = { S.element_id = eid element; port_key = port }
let ep element port = endpoint element (Port_key.of_string port |> Result.get_ok)

let entry ?(dependencies = []) ?(captures = []) ?parent id result_type =
  {
    S.id = cid id;
    parent;
    kind = Entry { template_id = tid (id ^ "-template"); result_type; captures; dependencies };
  }

let template ?parent id parameter_type result_type captures dependencies =
  {
    S.id = cid id;
    parent;
    kind =
      Template
        {
          template_id = tid (id ^ "-template");
          parameter_type;
          result_type;
          captures;
          dependencies;
        };
  }

let element id kind = { S.id = eid id; kind }

let contain relation element container =
  { S.relation_id = rid relation; element_id = eid element; container_id = cid container }

let bind_parameter relation container target =
  { S.relation_id = rid relation; container_id = cid container; kind = Bind_parameter target }

let bind_result relation container source =
  { S.relation_id = rid relation; container_id = cid container; kind = Bind_result source }

let bind_capture relation container capture_key target =
  {
    S.relation_id = rid relation;
    container_id = cid container;
    kind = Bind_capture { capture_key; target };
  }

let connect relation source target =
  { S.relation_id = rid relation; source; target }

let branch relation source targets = { S.relation_id = rid relation; source; targets }

let raw ?(literals = []) ?(entry_captures = []) containers elements contains binds
    connects branches =
  S.Raw.create ~containers ~elements ~contains ~binds ~connects ~branches
    ~literals ~entry_captures ()

let validate raw =
  match S.validate raw with
  | Ok value -> value
  | Error errors ->
      failwith
        ("symbolic validation failed: "
        ^ String.concat "; " (List.map S.render_error errors))

let run package =
  match P.run_completed package with Ok completed -> completed | Error _ -> assert false

let payload_string value =
  match Runtime_value.payload value with
  | Unit -> "Unit"
  | Nat nat -> "Nat(" ^ Nat.to_string nat ^ ")"
  | Closure closure -> "Closure(" ^ Function_template_id.to_string closure.template_id ^ ")"

let assert_symbolic_fixture name raw expected_type expected_payload =
  let first = validate raw in
  let second = validate raw in
  assert (String.equal (S.canonical_view first) (S.canonical_view second));
  let first_package = S.lower_to_program_package first in
  let second_package = S.lower_to_program_package second in
  assert (
    String.equal
      (Program_package_serialization.encode first_package)
      (Program_package_serialization.encode second_package));
  let first_run = run first_package in
  let second_run = run second_package in
  assert (Core_type.to_string (Runtime_value.typ first_run.value) = expected_type);
  assert (String.equal (payload_string first_run.value) expected_payload);
  let first_trace = Canonical_trace.render_completed first_run.machine first_run.value in
  let second_trace = Canonical_trace.render_completed second_run.machine second_run.value in
  if not (String.equal first_trace second_trace) then
    failwith (name ^ ": canonical traces differ");
  ignore name

let simple_succ_raw () =
  raw
    [ entry "entry" Core_type.Nat ]
    [
      element "drop-unit" (Drop Core_type.Unit);
      element "zero" (Nat_literal Nat.zero);
      element "succ" Succ;
    ]
    [
      contain "c-drop" "drop-unit" "entry";
      contain "c-zero" "zero" "entry";
      contain "c-succ" "succ" "entry";
    ]
    [
      bind_parameter "b-param" "entry" (ep "drop-unit" "input");
      bind_result "b-result" "entry" (ep "succ" "result");
    ]
    [ connect "connect-zero-succ" (ep "zero" "value") (ep "succ" "input") ]
    []

let () = assert_symbolic_fixture "connect" (simple_succ_raw ()) "Nat" "Nat(1)"

let function_template_raw () =
  let target_id = tid "unit-to-nat-template" in
  raw
    [
      entry ~dependencies:[ target_id ] "entry" Core_type.Nat;
      template "unit-to-nat" Core_type.Unit Core_type.Nat [] [];
    ]
    [
      element "entry-drop" (Drop Core_type.Unit);
      element "make-function"
        (Function
           {
             template_id = target_id;
             parameter_type = Core_type.Unit;
             result_type = Core_type.Nat;
             captures = [];
           });
      element "argument" Unit_literal;
      element "apply"
        (Apply { apply_parameter_type = Core_type.Unit; apply_result_type = Core_type.Nat });
      element "body-drop" (Drop Core_type.Unit);
      element "body-six" (Nat_literal (nat "6"));
    ]
    [
      contain "c-entry-drop" "entry-drop" "entry";
      contain "c-make" "make-function" "entry";
      contain "c-arg" "argument" "entry";
      contain "c-apply" "apply" "entry";
      contain "c-body-drop" "body-drop" "unit-to-nat";
      contain "c-body-six" "body-six" "unit-to-nat";
    ]
    [
      bind_parameter "b-entry-param" "entry" (ep "entry-drop" "input");
      bind_result "b-entry-result" "entry" (ep "apply" "result");
      bind_parameter "b-body-param" "unit-to-nat" (ep "body-drop" "input");
      bind_result "b-body-result" "unit-to-nat" (ep "body-six" "value");
    ]
    [
      connect "connect-function" (ep "make-function" "value")
        { S.element_id = eid "apply"; port_key = Port_key.function_input };
      connect "connect-arg" (ep "argument" "value")
        { S.element_id = eid "apply"; port_key = Port_key.argument };
    ]
    []

let () =
  assert_symbolic_fixture "contain-bind-apply" (function_template_raw ()) "Nat"
    "Nat(6)"

let arrow_result_raw () =
  let target_id = tid "arrow-target-template" in
  raw
    [
      entry ~dependencies:[ target_id ] "entry" (Core_type.Arrow (Core_type.Unit, Core_type.Nat));
      template "arrow-target" Core_type.Unit Core_type.Nat [] [];
    ]
    [
      element "entry-drop" (Drop Core_type.Unit);
      element "make-function"
        (Function
           {
             template_id = target_id;
             parameter_type = Core_type.Unit;
             result_type = Core_type.Nat;
             captures = [];
           });
      element "body-drop" (Drop Core_type.Unit);
      element "body-six" (Nat_literal (nat "6"));
    ]
    [
      contain "c-entry-drop" "entry-drop" "entry";
      contain "c-make" "make-function" "entry";
      contain "c-body-drop" "body-drop" "arrow-target";
      contain "c-body-six" "body-six" "arrow-target";
    ]
    [
      bind_parameter "b-entry-param" "entry" (ep "entry-drop" "input");
      bind_result "b-entry-result" "entry" (ep "make-function" "value");
      bind_parameter "b-body-param" "arrow-target" (ep "body-drop" "input");
      bind_result "b-body-result" "arrow-target" (ep "body-six" "value");
    ]
    [] []

let () =
  assert_symbolic_fixture "higher-order-function" (arrow_result_raw ())
    "Unit -> Nat" "Closure(arrow-target-template)"

let symbolic_add_raw () =
  let inner_id = tid "add-step-inner-template" in
  let step_id = tid "add-step-template" in
  let nat_to_nat = Core_type.Arrow (Core_type.Nat, Core_type.Nat) in
  raw
    [
      entry ~dependencies:[ step_id ] "entry" Core_type.Nat;
      template ~parent:(cid "entry") "add-step" Core_type.Nat nat_to_nat []
        [ inner_id ];
      template ~parent:(cid "add-step") "add-step-inner" Core_type.Nat
        Core_type.Nat [] [];
    ]
    [
      element "entry-drop" (Drop Core_type.Unit);
      element "base" (Nat_literal (nat "2"));
      element "count" (Nat_literal (nat "3"));
      element "step-function"
        (Function
           {
             template_id = step_id;
             parameter_type = Core_type.Nat;
             result_type = nat_to_nat;
             captures = [];
           });
      element "natrec" (NatRec Core_type.Nat);
      element "drop-pred" (Drop Core_type.Nat);
      element "inner-function"
        (Function
           {
             template_id = inner_id;
             parameter_type = Core_type.Nat;
             result_type = Core_type.Nat;
             captures = [];
           });
      element "succ" Succ;
    ]
    [
      contain "c-entry-drop" "entry-drop" "entry";
      contain "c-base" "base" "entry";
      contain "c-count" "count" "entry";
      contain "c-step" "step-function" "entry";
      contain "c-natrec" "natrec" "entry";
      contain "c-drop-pred" "drop-pred" "add-step";
      contain "c-inner-function" "inner-function" "add-step";
      contain "c-succ" "succ" "add-step-inner";
    ]
    [
      bind_parameter "b-entry-param" "entry" (ep "entry-drop" "input");
      bind_result "b-entry-result" "entry" (ep "natrec" "result");
      bind_parameter "b-step-param" "add-step" (ep "drop-pred" "input");
      bind_result "b-step-result" "add-step" (ep "inner-function" "value");
      bind_parameter "b-inner-param" "add-step-inner" (ep "succ" "input");
      bind_result "b-inner-result" "add-step-inner" (ep "succ" "result");
    ]
    [
      connect "connect-base" (ep "base" "value")
        { S.element_id = eid "natrec"; port_key = Port_key.base };
      connect "connect-step" (ep "step-function" "value")
        { S.element_id = eid "natrec"; port_key = Port_key.step };
      connect "connect-count" (ep "count" "value")
        { S.element_id = eid "natrec"; port_key = Port_key.count };
    ]
    []

let () = assert_symbolic_fixture "natrec-add" (symbolic_add_raw ()) "Nat" "Nat(5)"

let capture_raw () =
  let capture = { key = Port_key.capture "n"; typ = Core_type.Nat } in
  let target_id = tid "capture-function-template" in
  let literal = { P.id = litid "n"; payload = Runtime_value.Nat (nat "2") } in
  let entry_capture = { P.capture_key = capture.key; literal_id = literal.id } in
  raw ~literals:[ literal ] ~entry_captures:[ entry_capture ]
    [
      entry ~captures:[ capture ] "entry" Core_type.Nat;
      template ~parent:(cid "entry") "capture-function" Core_type.Unit Core_type.Nat
        [ capture ] [];
    ]
    [
      element "entry-drop" (Drop Core_type.Unit);
      element "make-function"
        (Function
           {
             template_id = target_id;
             parameter_type = Core_type.Unit;
             result_type = Core_type.Nat;
             captures = [ capture ];
           });
      element "argument" Unit_literal;
      element "apply"
        (Apply { apply_parameter_type = Core_type.Unit; apply_result_type = Core_type.Nat });
      element "body-drop" (Drop Core_type.Unit);
      element "body-succ" Succ;
    ]
    [
      contain "c-entry-drop" "entry-drop" "entry";
      contain "c-entry-fn" "make-function" "entry";
      contain "c-entry-arg" "argument" "entry";
      contain "c-entry-apply" "apply" "entry";
      contain "c-body-drop" "body-drop" "capture-function";
      contain "c-body-succ" "body-succ" "capture-function";
    ]
    [
      bind_parameter "b-entry-param" "entry" (ep "entry-drop" "input");
      bind_capture "b-entry-cap" "entry" capture.key
        { S.element_id = eid "make-function"; port_key = capture.key };
      bind_result "b-entry-result" "entry" (ep "apply" "result");
      bind_parameter "b-body-param" "capture-function" (ep "body-drop" "input");
      bind_capture "b-body-cap" "capture-function" capture.key (ep "body-succ" "input");
      bind_result "b-body-result" "capture-function" (ep "body-succ" "result");
    ]
    [
      connect "connect-fn" (ep "make-function" "value")
        { S.element_id = eid "apply"; port_key = Port_key.function_input };
      connect "connect-arg" (ep "argument" "value")
        { S.element_id = eid "apply"; port_key = Port_key.argument };
    ]
    []

let () = assert_symbolic_fixture "bind-capture" (capture_raw ()) "Nat" "Nat(3)"

let branch_raw target_count =
  let targets =
    match target_count with
    | 2 -> [ ep "succ" "input"; ep "drop-a" "input" ]
    | 3 -> [ ep "succ" "input"; ep "drop-a" "input"; ep "drop-b" "input" ]
    | _ -> []
  in
  let elements =
    [
      element "drop-unit" (Drop Core_type.Unit);
      element "lit" (Nat_literal (nat "4"));
      element "succ" Succ;
      element "drop-a" (Drop Core_type.Nat);
    ]
    @ if target_count = 3 then [ element "drop-b" (Drop Core_type.Nat) ] else []
  in
  let contains =
    [
      contain "c-drop-unit" "drop-unit" "entry";
      contain "c-lit" "lit" "entry";
      contain "c-succ" "succ" "entry";
      contain "c-drop-a" "drop-a" "entry";
    ]
    @ if target_count = 3 then [ contain "c-drop-b" "drop-b" "entry" ] else []
  in
  raw
    [ entry "entry" Core_type.Nat ]
    elements contains
    [
      bind_parameter "b-param" "entry" (ep "drop-unit" "input");
      bind_result "b-result" "entry" (ep "succ" "result");
    ]
    []
    [ branch "branch-lit" (ep "lit" "value") targets ]

let () = assert_symbolic_fixture "branch" (branch_raw 2) "Nat" "Nat(5)"
let () = assert_symbolic_fixture "branch-three" (branch_raw 3) "Nat" "Nat(5)"

let () =
  let raw_a = branch_raw 3 in
  let raw_b =
    raw
      [ entry "entry" Core_type.Nat ]
      (List.rev
         [
           element "drop-unit" (Drop Core_type.Unit);
           element "lit" (Nat_literal (nat "4"));
           element "succ" Succ;
           element "drop-a" (Drop Core_type.Nat);
           element "drop-b" (Drop Core_type.Nat);
         ])
      (List.rev
         [
           contain "c-drop-unit" "drop-unit" "entry";
           contain "c-lit" "lit" "entry";
           contain "c-succ" "succ" "entry";
           contain "c-drop-a" "drop-a" "entry";
           contain "c-drop-b" "drop-b" "entry";
         ])
      (List.rev
         [
           bind_parameter "b-param" "entry" (ep "drop-unit" "input");
           bind_result "b-result" "entry" (ep "succ" "result");
         ])
      []
      [ branch "branch-lit" (ep "lit" "value") [ ep "succ" "input"; ep "drop-a" "input"; ep "drop-b" "input" ] ]
  in
  let a = validate raw_a in
  let b = validate raw_b in
  assert (String.equal (S.canonical_view a) (S.canonical_view b))

let expect_error name predicate raw =
  let first = S.validate raw in
  let second = S.validate raw in
  let render result =
    match result with
    | Ok _ -> "<ok>"
    | Error errors -> String.concat "|" (List.map S.render_error errors)
  in
  assert (String.equal (render first) (render second));
  match first with
  | Ok _ -> failwith (name ^ ": expected error")
  | Error errors ->
      if not (List.exists predicate errors) then
        failwith (name ^ ": unexpected errors " ^ render first)

let () =
  expect_error "empty" (function S.Missing_entry_container -> true | _ -> false)
    (raw [] [] [] [] [] []);
  expect_error "duplicate-relation"
    (function S.Duplicate_relation_id _ -> true | _ -> false)
    (raw [ entry "entry" Core_type.Nat ] [ element "a" Unit_literal ]
       [ contain "same" "a" "entry" ] [ bind_result "same" "entry" (ep "a" "value") ] [] []);
  expect_error "duplicate-element"
    (function S.Duplicate_element_id _ -> true | _ -> false)
    (raw [ entry "entry" Core_type.Nat ] [ element "a" Unit_literal; element "a" Unit_literal ] [] [] [] []);
  expect_error "duplicate-container"
    (function S.Duplicate_container_id _ -> true | _ -> false)
    (raw [ entry "entry" Core_type.Nat; entry "entry" Core_type.Nat ] [] [] [] [] []);
  expect_error "dangling-endpoint"
    (function S.Dangling_endpoint _ -> true | _ -> false)
    (raw [ entry "entry" Core_type.Nat ] [] [] [] [ connect "c" (ep "x" "value") (ep "y" "input") ] []);
  expect_error "output-target"
    (function S.Endpoint_direction_mismatch _ -> true | _ -> false)
    (raw [ entry "entry" Core_type.Nat ] [ element "a" Unit_literal; element "b" Unit_literal ]
       [ contain "ca" "a" "entry"; contain "cb" "b" "entry" ] []
       [ connect "c" (ep "a" "value") (ep "b" "value") ] []);
  expect_error "input-source"
    (function S.Endpoint_direction_mismatch _ -> true | _ -> false)
    (raw [ entry "entry" Core_type.Nat ] [ element "a" (Drop Core_type.Unit); element "b" (Drop Core_type.Unit) ]
       [ contain "ca" "a" "entry"; contain "cb" "b" "entry" ] []
       [ connect "c" (ep "a" "input") (ep "b" "input") ] []);
  expect_error "type-mismatch"
    (function S.Endpoint_type_mismatch _ -> true | _ -> false)
    (raw [ entry "entry" Core_type.Nat ] [ element "u" Unit_literal; element "s" Succ ]
       [ contain "cu" "u" "entry"; contain "cs" "s" "entry" ] []
       [ connect "c" (ep "u" "value") (ep "s" "input") ] []);
  expect_error "multiple-input-sources"
    (function S.Multiple_input_sources _ -> true | _ -> false)
    (raw [ entry "entry" Core_type.Nat ]
       [
         element "left" (Nat_literal Nat.zero);
         element "right" (Nat_literal Nat.zero);
         element "succ" Succ;
       ]
       [ contain "cl" "left" "entry"; contain "cr" "right" "entry"; contain "cs" "succ" "entry" ]
       []
       [
         connect "c1" (ep "left" "value") (ep "succ" "input");
         connect "c2" (ep "right" "value") (ep "succ" "input");
       ]
       []);
  expect_error "implicit-fanout"
    (function S.Implicit_fanout _ -> true | _ -> false)
    (raw [ entry "entry" Core_type.Nat ]
       [ element "n" (Nat_literal Nat.zero); element "a" (Drop Core_type.Nat); element "b" (Drop Core_type.Nat) ]
       [ contain "cn" "n" "entry"; contain "ca" "a" "entry"; contain "cb" "b" "entry" ] []
       [ connect "c1" (ep "n" "value") (ep "a" "input"); connect "c2" (ep "n" "value") (ep "b" "input") ] []);
  expect_error "branch-empty"
    (function S.Invalid_branch_target_count _ -> true | _ -> false)
    (raw [ entry "entry" Core_type.Nat ] [ element "n" (Nat_literal Nat.zero) ] [ contain "cn" "n" "entry" ] [] [] [ branch "b" (ep "n" "value") [] ]);
  expect_error "branch-one"
    (function S.Invalid_branch_target_count _ -> true | _ -> false)
    (raw [ entry "entry" Core_type.Nat ] [ element "n" (Nat_literal Nat.zero); element "d" (Drop Core_type.Nat) ] [ contain "cn" "n" "entry"; contain "cd" "d" "entry" ] [] [] [ branch "b" (ep "n" "value") [ ep "d" "input" ] ]);
  expect_error "duplicate-branch-target"
    (function S.Duplicate_branch_target _ -> true | _ -> false)
    (raw [ entry "entry" Core_type.Nat ] [ element "n" (Nat_literal Nat.zero); element "d" (Drop Core_type.Nat) ] [ contain "cn" "n" "entry"; contain "cd" "d" "entry" ] [] [] [ branch "b" (ep "n" "value") [ ep "d" "input"; ep "d" "input" ] ]);
  expect_error "branch-type-mismatch"
    (function S.Endpoint_type_mismatch _ -> true | _ -> false)
    (raw [ entry "entry" Core_type.Nat ]
       [
         element "u" Unit_literal;
         element "succ" Succ;
         element "drop" (Drop Core_type.Nat);
       ]
       [ contain "cu" "u" "entry"; contain "cs" "succ" "entry"; contain "cd" "drop" "entry" ]
       [] [] [ branch "b" (ep "u" "value") [ ep "succ" "input"; ep "drop" "input" ] ]);
  expect_error "containment-cycle"
    (function S.Containment_cycle _ -> true | _ -> false)
    (raw
       [
         entry ~parent:(cid "body") "entry" Core_type.Nat;
         template ~parent:(cid "entry") "body" Core_type.Unit Core_type.Nat [] [];
       ]
       [] [] [] [] []);
  expect_error "missing-owner"
    (function S.Missing_owner _ -> true | _ -> false)
    (raw [ entry "entry" Core_type.Nat ] [ element "n" (Nat_literal Nat.zero) ] [] [] [] []);
  expect_error "multiple-owner"
    (function S.Multiple_owners _ -> true | _ -> false)
    (raw [ entry "entry" Core_type.Nat; entry "entry2" Core_type.Nat ] [ element "n" (Nat_literal Nat.zero) ] [ contain "c1" "n" "entry"; contain "c2" "n" "entry2" ] [] [] []);
  expect_error "missing-parameter"
    (function S.Missing_parameter_bind _ -> true | _ -> false)
    (raw [ entry "entry" Core_type.Nat ] [ element "n" (Nat_literal Nat.zero) ] [ contain "cn" "n" "entry" ] [ bind_result "r" "entry" (ep "n" "value") ] [] []);
  expect_error "duplicate-parameter"
    (function S.Duplicate_parameter_bind _ -> true | _ -> false)
    (raw [ entry "entry" Core_type.Nat ]
       [
         element "drop-a" (Drop Core_type.Unit);
         element "drop-b" (Drop Core_type.Unit);
         element "n" (Nat_literal Nat.zero);
       ]
       [ contain "ca" "drop-a" "entry"; contain "cb" "drop-b" "entry"; contain "cn" "n" "entry" ]
       [
         bind_parameter "p1" "entry" (ep "drop-a" "input");
         bind_parameter "p2" "entry" (ep "drop-b" "input");
         bind_result "r" "entry" (ep "n" "value");
       ]
       [] []);
  expect_error "missing-result"
    (function S.Missing_result_bind _ -> true | _ -> false)
    (raw [ entry "entry" Core_type.Nat ] [ element "d" (Drop Core_type.Unit) ] [ contain "cd" "d" "entry" ] [ bind_parameter "p" "entry" (ep "d" "input") ] [] []);
  expect_error "duplicate-result"
    (function S.Duplicate_result_bind _ -> true | _ -> false)
    (raw [ entry "entry" Core_type.Nat ] [ element "n" (Nat_literal Nat.zero); element "d" (Drop Core_type.Unit) ] [ contain "cn" "n" "entry"; contain "cd" "d" "entry" ] [ bind_parameter "p" "entry" (ep "d" "input"); bind_result "r1" "entry" (ep "n" "value"); bind_result "r2" "entry" (ep "n" "value") ] [] []);
  let capture = { key = Port_key.capture "n"; typ = Core_type.Nat } in
  expect_error "missing-capture"
    (function S.Missing_capture_bind _ -> true | _ -> false)
    (raw [ entry ~captures:[ capture ] "entry" Core_type.Nat ]
       [ element "d" (Drop Core_type.Unit); element "n" (Nat_literal Nat.zero) ]
       [ contain "cd" "d" "entry"; contain "cn" "n" "entry" ]
       [
         bind_parameter "p" "entry" (ep "d" "input");
         bind_result "r" "entry" (ep "n" "value");
       ]
       [] []);
  expect_error "duplicate-capture"
    (function S.Duplicate_capture_bind _ -> true | _ -> false)
    (raw [ entry ~captures:[ capture ] "entry" Core_type.Nat ]
       [
         element "d" (Drop Core_type.Unit);
         element "succ-a" Succ;
         element "succ-b" Succ;
       ]
       [ contain "cd" "d" "entry"; contain "ca" "succ-a" "entry"; contain "cb" "succ-b" "entry" ]
       [
         bind_parameter "p" "entry" (ep "d" "input");
         bind_capture "c1" "entry" capture.key (ep "succ-a" "input");
         bind_capture "c2" "entry" capture.key (ep "succ-b" "input");
         bind_result "r" "entry" (ep "succ-a" "result");
       ]
       [] []);
  expect_error "unexpected-capture"
    (function S.Unexpected_capture_bind _ -> true | _ -> false)
    (raw [ entry "entry" Core_type.Nat ]
       [ element "d" (Drop Core_type.Unit); element "succ" Succ ]
       [ contain "cd" "d" "entry"; contain "cs" "succ" "entry" ]
       [
         bind_parameter "p" "entry" (ep "d" "input");
         bind_capture "c" "entry" capture.key (ep "succ" "input");
         bind_result "r" "entry" (ep "succ" "result");
       ]
       [] []);
  expect_error "cross-container-connection"
    (function S.Cross_container_connection _ -> true | _ -> false)
    (raw
       [
         entry "entry" Core_type.Nat;
         template "other" Core_type.Unit Core_type.Nat [] [];
       ]
       [
         element "n" (Nat_literal Nat.zero);
         element "succ" Succ;
         element "entry-drop" (Drop Core_type.Unit);
         element "other-drop" (Drop Core_type.Unit);
       ]
       [
         contain "cn" "n" "entry";
         contain "cs" "succ" "other";
         contain "ced" "entry-drop" "entry";
         contain "cod" "other-drop" "other";
       ]
       [
         bind_parameter "ep" "entry" (ep "entry-drop" "input");
         bind_result "er" "entry" (ep "n" "value");
         bind_parameter "op" "other" (ep "other-drop" "input");
         bind_result "or" "other" (ep "succ" "result");
       ]
       [ connect "cross" (ep "n" "value") (ep "succ" "input") ] []);
  expect_error "value-dependency-cycle"
    (function S.Core_validation_errors _ -> true | _ -> false)
    (raw [ entry "entry" Core_type.Nat ]
       [ element "d" (Drop Core_type.Unit); element "succ" Succ ]
       [ contain "cd" "d" "entry"; contain "cs" "succ" "entry" ]
       [
         bind_parameter "p" "entry" (ep "d" "input");
         bind_result "r" "entry" (ep "succ" "result");
       ]
       [ connect "cycle" (ep "succ" "result") (ep "succ" "input") ] []);
  let template_a = tid "a-template" in
  let template_b = tid "b-template" in
  expect_error "function-template-cycle"
    (function S.Core_validation_errors _ -> true | _ -> false)
    (raw
       [
         entry ~dependencies:[ template_a ] "entry" Core_type.Nat;
         template "a" Core_type.Unit Core_type.Nat [] [ template_b ];
         template "b" Core_type.Unit Core_type.Nat [] [ template_a ];
       ]
       [
         element "entry-drop" (Drop Core_type.Unit);
         element "entry-lit" (Nat_literal Nat.zero);
         element "a-drop" (Drop Core_type.Unit);
         element "a-lit" (Nat_literal Nat.zero);
         element "b-drop" (Drop Core_type.Unit);
         element "b-lit" (Nat_literal Nat.zero);
       ]
       [
         contain "ced" "entry-drop" "entry";
         contain "cel" "entry-lit" "entry";
         contain "cad" "a-drop" "a";
         contain "cal" "a-lit" "a";
         contain "cbd" "b-drop" "b";
         contain "cbl" "b-lit" "b";
       ]
       [
         bind_parameter "ep" "entry" (ep "entry-drop" "input");
         bind_result "er" "entry" (ep "entry-lit" "value");
         bind_parameter "ap" "a" (ep "a-drop" "input");
         bind_result "ar" "a" (ep "a-lit" "value");
         bind_parameter "bp" "b" (ep "b-drop" "input");
         bind_result "br" "b" (ep "b-lit" "value");
       ]
       [] []);
  expect_error "generated-id-collision"
    (function S.Generated_id_collision _ -> true | _ -> false)
    (raw [ entry "entry" Core_type.Nat ] [ element "__sym_entry_parameter" Unit_literal ] [ contain "c" "__sym_entry_parameter" "entry" ] [] [] [])
