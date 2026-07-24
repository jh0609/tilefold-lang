open Tilefold
open Core_graph

module G = Surface_geometry
module S = Surface_symbolic
module P = Program_package

let eid value =
  match S.Element_id.of_string value with Ok id -> id | Error message -> failwith message

let cid value =
  match S.Container_id.of_string value with Ok id -> id | Error message -> failwith message

let wid value =
  match G.Wire_id.of_string value with Ok id -> id | Error message -> failwith message

let jid value =
  match G.Junction_id.of_string value with Ok id -> id | Error message -> failwith message

let bid value =
  match G.Boundary_id.of_string value with Ok id -> id | Error message -> failwith message

let tid value =
  match Function_template_id.of_string value with Ok id -> id | Error message -> failwith message

let pk value = Port_key.of_string value |> Result.get_ok
let nat value = match Nat.of_string value with Ok nat -> nat | Error _ -> failwith value
let p x y = { G.x; y }
let b left top right bottom = { G.left; top; right; bottom }

let entry ?(dependencies = []) ?(captures = []) id result_type bounds =
  {
    G.id = cid id;
    bounds;
    kind = Entry { template_id = tid (id ^ "-template"); result_type; captures; dependencies };
  }

let template ?(dependencies = []) ?(captures = []) id parameter_type result_type bounds =
  {
    G.id = cid id;
    bounds;
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

let element id kind bounds ports =
  { G.id = eid id; kind; bounds; ports = List.map (fun (key, point) -> (pk key, point)) ports }

let boundary id container_id role typ position =
  { G.id = bid id; container_id = cid container_id; role; typ; position }

let wire id points = { G.id = wid id; points }

let junction id position outlets =
  {
    G.id = jid id;
    position;
    outlets = List.map (fun (order, position) -> { G.order; position }) outlets;
  }

let scene ?(tolerance = 0) ?(literals = []) ?(entry_captures = []) containers
    elements boundary_ports wires junctions =
  G.Raw_scene.create ~tolerance ~containers ~elements ~boundary_ports ~wires
    ~junctions ~literals ~entry_captures ()

let validate scene =
  match G.validate scene with
  | Ok value -> value
  | Error errors ->
      failwith
        ("geometry validation failed: "
        ^ String.concat "; " (List.map G.render_validation_error errors))

let infer scene =
  let validated = validate scene in
  match G.infer_and_validate_symbolic validated with
  | Ok symbolic -> (validated, symbolic)
  | Error errors ->
      failwith
        ("inference failed: "
        ^ String.concat "; " (List.map G.render_inference_error errors))

let run package =
  match P.run_completed package with Ok completed -> completed | Error _ -> assert false

let payload_string value =
  match Runtime_value.payload value with
  | Unit -> "Unit"
  | Nat nat -> "Nat(" ^ Nat.to_string nat ^ ")"
  | Closure closure -> "Closure(" ^ Function_template_id.to_string closure.template_id ^ ")"

let assert_scene_fixture ?expect_rule name raw expected_type expected_payload =
  let first_geometry, first_symbolic = infer raw in
  let second_geometry, second_symbolic = infer raw in
  assert (String.equal (G.canonical_view first_geometry) (G.canonical_view second_geometry));
  assert (String.equal (S.canonical_view first_symbolic) (S.canonical_view second_symbolic));
  let first_package = S.lower_to_program_package first_symbolic in
  let second_package = S.lower_to_program_package second_symbolic in
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
  Option.iter
    (fun rule ->
      if
        not
          (List.exists
             (fun event ->
               String.equal
                 (Rewrite_event.rule_to_string event.Rewrite_event.rule)
                 rule)
             first_run.trace)
      then failwith (name ^ ": trace does not contain rule " ^ rule))
    expect_rule

let simple_connect_scene ?(tolerance = 0) ?(offset = 0) ?(bend = p 60 80) () =
  let shift point = p (point.G.x + offset) (point.y + offset) in
  scene ~tolerance
    [ entry "entry" Core_type.Nat (b (0 + offset) (0 + offset) (200 + offset) (120 + offset)) ]
    [
      element "drop-unit" (Drop Core_type.Unit) (b (20 + offset) (20 + offset) (40 + offset) (40 + offset))
        [ ("input", shift (p 20 30)) ];
      element "zero" (Nat_literal Nat.zero) (b (50 + offset) (20 + offset) (70 + offset) (40 + offset))
        [ ("value", shift (p 70 30)) ];
      element "succ" Succ (b (100 + offset) (20 + offset) (130 + offset) (50 + offset))
        [ ("input", shift (p 100 30)); ("result", shift (p 130 30)) ];
    ]
    [
      boundary "entry-param" "entry" G.Boundary_parameter Core_type.Unit (shift (p 0 30));
      boundary "entry-result" "entry" G.Boundary_result Core_type.Nat (shift (p 200 30));
    ]
    [
      wire "w-param" [ shift (p 0 30); shift (p 20 30) ];
      wire "w-lit-succ" [ shift (p 70 30); bend; shift (p 100 30) ];
      wire "w-result" [ shift (p 130 30); shift (p 200 30) ];
    ]
    []

let () =
  assert_scene_fixture "exact-connect" (simple_connect_scene ()) "Nat" "Nat(1)";
  assert_scene_fixture "tolerance-connect"
    (simple_connect_scene ~tolerance:2 ~bend:(p 64 83) ())
    "Nat" "Nat(1)";
  let _, exact = infer (simple_connect_scene ()) in
  let _, moved =
    infer (simple_connect_scene ~tolerance:2 ~bend:(p 64 83) ())
  in
  assert (String.equal (S.canonical_view exact) (S.canonical_view moved));
  let _, translated = infer (simple_connect_scene ~offset:100 ()) in
  assert (String.equal (S.canonical_view exact) (S.canonical_view translated));
  let _, rebent = infer (simple_connect_scene ~bend:(p 60 100) ()) in
  assert (String.equal (S.canonical_view exact) (S.canonical_view rebent))

let branch_scene target_count =
  let outlets =
    match target_count with
    | 2 -> [ (0, p 91 20); (1, p 91 50) ]
    | 3 -> [ (0, p 91 20); (1, p 91 50); (2, p 91 80) ]
    | _ -> []
  in
  let targets =
    match target_count with
    | 2 -> [ wire "w-j-succ" [ p 91 20; p 110 20 ]; wire "w-j-drop-a" [ p 91 50; p 110 50 ] ]
    | 3 ->
        [
          wire "w-j-succ" [ p 91 20; p 110 20 ];
          wire "w-j-drop-a" [ p 91 50; p 110 50 ];
          wire "w-j-drop-b" [ p 91 80; p 110 80 ];
        ]
    | _ -> []
  in
  let elements =
    [
      element "drop-unit" (Drop Core_type.Unit) (b 20 20 40 40) [ ("input", p 20 30) ];
      element "lit" (Nat_literal (nat "4")) (b 50 20 70 40) [ ("value", p 70 30) ];
      element "succ" Succ (b 110 10 140 30) [ ("input", p 110 20); ("result", p 140 20) ];
      element "drop-a" (Drop Core_type.Nat) (b 110 40 140 60) [ ("input", p 110 50) ];
    ]
    @
    if target_count = 3 then
      [ element "drop-b" (Drop Core_type.Nat) (b 110 70 140 90) [ ("input", p 110 80) ] ]
    else []
  in
  scene
    [ entry "entry" Core_type.Nat (b 0 0 220 120) ]
    elements
    [
      boundary "entry-param" "entry" G.Boundary_parameter Core_type.Unit (p 0 30);
      boundary "entry-result" "entry" G.Boundary_result Core_type.Nat (p 220 20);
    ]
    ([ wire "w-param" [ p 0 30; p 20 30 ]; wire "w-lit-j" [ p 70 30; p 90 30 ]; wire "w-result" [ p 140 20; p 220 20 ] ]
    @ targets)
    [ junction "j" (p 90 30) outlets ]

let () =
  assert_scene_fixture ~expect_rule:"Copy" "branch-two"
    (branch_scene 2) "Nat" "Nat(5)";
  assert_scene_fixture ~expect_rule:"Copy" "branch-three"
    (branch_scene 3) "Nat" "Nat(5)";
  let _, branch_a = infer (branch_scene 3) in
  let reordered =
    scene
      [ entry "entry" Core_type.Nat (b 0 0 220 120) ]
      (List.rev
         [
           element "drop-unit" (Drop Core_type.Unit) (b 20 20 40 40) [ ("input", p 20 30) ];
           element "lit" (Nat_literal (nat "4")) (b 50 20 70 40) [ ("value", p 70 30) ];
           element "succ" Succ (b 110 10 140 30) [ ("input", p 110 20); ("result", p 140 20) ];
           element "drop-a" (Drop Core_type.Nat) (b 110 40 140 60) [ ("input", p 110 50) ];
           element "drop-b" (Drop Core_type.Nat) (b 110 70 140 90) [ ("input", p 110 80) ];
         ])
      (List.rev
         [
           boundary "entry-param" "entry" G.Boundary_parameter Core_type.Unit (p 0 30);
           boundary "entry-result" "entry" G.Boundary_result Core_type.Nat (p 220 20);
         ])
      (List.rev
         [
           wire "w-param" [ p 0 30; p 20 30 ];
           wire "w-lit-j" [ p 70 30; p 90 30 ];
           wire "w-result" [ p 140 20; p 220 20 ];
           wire "w-j-succ" [ p 91 20; p 110 20 ];
           wire "w-j-drop-a" [ p 91 50; p 110 50 ];
           wire "w-j-drop-b" [ p 91 80; p 110 80 ];
         ])
      [ junction "j" (p 90 30) [ (2, p 91 80); (0, p 91 20); (1, p 91 50) ] ]
  in
  let _, branch_b = infer reordered in
  assert (String.equal (S.canonical_view branch_a) (S.canonical_view branch_b))

let apply_branch_scene () =
  let target_id = tid "branch-template-template" in
  scene
    [
      entry ~dependencies:[ target_id ] "entry" Core_type.Nat (b 0 0 300 180);
      template "branch-template" Core_type.Unit Core_type.Nat (b 60 60 260 170);
    ]
    [
      element "entry-drop" (Drop Core_type.Unit) (b 20 20 40 40) [ ("input", p 20 30) ];
      element "make-function"
        (Function
             {
               template_id = target_id;
             parameter_type = Core_type.Unit;
             result_type = Core_type.Nat;
             captures = [];
           })
        (b 60 20 90 40) [ ("value", p 90 30) ];
      element "argument" Unit_literal (b 100 20 130 40) [ ("value", p 130 30) ];
      element "apply"
        (Apply { apply_parameter_type = Core_type.Unit; apply_result_type = Core_type.Nat })
        (b 160 20 200 50)
        [ ("function", p 160 25); ("argument", p 160 45); ("result", p 200 35) ];
      element "tmpl-drop" (Drop Core_type.Unit) (b 80 90 100 110) [ ("input", p 80 100) ];
      element "tmpl-lit" (Nat_literal (nat "4")) (b 80 125 100 145) [ ("value", p 100 135) ];
      element "succ" Succ (b 120 90 150 110) [ ("input", p 120 100); ("result", p 150 100) ];
      element "drop-copy" (Drop Core_type.Nat) (b 120 130 150 150) [ ("input", p 120 140) ];
    ]
    [
      boundary "entry-param" "entry" G.Boundary_parameter Core_type.Unit (p 0 30);
      boundary "entry-result" "entry" G.Boundary_result Core_type.Nat (p 300 35);
      boundary "tmpl-param" "branch-template" G.Boundary_parameter Core_type.Unit (p 60 100);
      boundary "tmpl-result" "branch-template" G.Boundary_result Core_type.Nat (p 260 100);
    ]
    [
      wire "w-entry-param" [ p 0 30; p 20 30 ];
      wire "w-fn" [ p 90 30; p 160 25 ];
      wire "w-arg" [ p 130 30; p 160 45 ];
      wire "w-entry-result" [ p 200 35; p 300 35 ];
      wire "w-tmpl-param" [ p 60 100; p 80 100 ];
      wire "w-lit-j" [ p 100 135; p 90 120 ];
      wire "w-j-succ" [ p 91 100; p 120 100 ];
      wire "w-j-drop" [ p 91 140; p 120 140 ];
      wire "w-result" [ p 150 100; p 260 100 ];
    ]
    [ junction "param-branch" (p 90 120) [ (0, p 91 100); (1, p 91 140) ] ]

let () =
  assert_scene_fixture ~expect_rule:"ApplyEnter" "connect-contain-bind-branch"
    (apply_branch_scene ()) "Nat" "Nat(5)"

let nested_containment_scene () =
  let outer_id = tid "outer-template" in
  let inner_id = tid "inner-template" in
  scene
    [
      entry ~dependencies:[ outer_id ] "entry" Core_type.Nat (b 0 0 400 300);
      template ~dependencies:[ inner_id ] "outer" Core_type.Unit Core_type.Nat
        (b 50 60 350 260);
      template "inner" Core_type.Unit Core_type.Nat (b 100 120 300 240);
    ]
    [
      element "entry-drop" (Drop Core_type.Unit) (b 20 20 40 40) [ ("input", p 20 30) ];
      element "make-outer"
        (Function
           {
             template_id = outer_id;
             parameter_type = Core_type.Unit;
             result_type = Core_type.Nat;
             captures = [];
           })
        (b 60 20 90 40) [ ("value", p 90 30) ];
      element "arg" Unit_literal (b 110 20 130 40) [ ("value", p 130 30) ];
      element "apply"
        (Apply { apply_parameter_type = Core_type.Unit; apply_result_type = Core_type.Nat })
        (b 160 20 200 50)
        [ ("function", p 160 25); ("argument", p 160 45); ("result", p 200 35) ];
      element "outer-drop" (Drop Core_type.Unit) (b 80 80 100 100) [ ("input", p 80 90) ];
      element "make-inner"
        (Function
           {
             template_id = inner_id;
             parameter_type = Core_type.Unit;
             result_type = Core_type.Nat;
             captures = [];
           })
        (b 120 80 150 100) [ ("value", p 150 90) ];
      element "inner-arg" Unit_literal (b 170 80 190 100) [ ("value", p 190 90) ];
      element "inner-apply"
        (Apply { apply_parameter_type = Core_type.Unit; apply_result_type = Core_type.Nat })
        (b 210 80 250 110)
        [ ("function", p 210 85); ("argument", p 210 105); ("result", p 250 95) ];
      element "inner-drop" (Drop Core_type.Unit) (b 130 150 150 170) [ ("input", p 130 160) ];
      element "inner-lit" (Nat_literal (nat "7")) (b 180 150 200 170) [ ("value", p 200 160) ];
    ]
    [
      boundary "entry-param" "entry" G.Boundary_parameter Core_type.Unit (p 0 30);
      boundary "entry-result" "entry" G.Boundary_result Core_type.Nat (p 400 35);
      boundary "outer-param" "outer" G.Boundary_parameter Core_type.Unit (p 50 90);
      boundary "outer-result" "outer" G.Boundary_result Core_type.Nat (p 350 95);
      boundary "inner-param" "inner" G.Boundary_parameter Core_type.Unit (p 100 160);
      boundary "inner-result" "inner" G.Boundary_result Core_type.Nat (p 300 160);
    ]
    [
      wire "w-entry-param" [ p 0 30; p 20 30 ];
      wire "w-entry-fn" [ p 90 30; p 160 25 ];
      wire "w-entry-arg" [ p 130 30; p 160 45 ];
      wire "w-entry-result" [ p 200 35; p 400 35 ];
      wire "w-outer-param" [ p 50 90; p 80 90 ];
      wire "w-inner-fn" [ p 150 90; p 210 85 ];
      wire "w-inner-arg" [ p 190 90; p 210 105 ];
      wire "w-outer-result" [ p 250 95; p 350 95 ];
      wire "w-inner-param" [ p 100 160; p 130 160 ];
      wire "w-inner-result" [ p 200 160; p 300 160 ];
    ]
    []

let () =
  assert_scene_fixture ~expect_rule:"ApplyEnter" "nested-containment"
    (nested_containment_scene ()) "Nat" "Nat(7)"

let crossing_scene () =
  scene
    [ entry "entry" Core_type.Nat (b 0 0 240 140) ]
    [
      element "drop-unit" (Drop Core_type.Unit) (b 20 20 40 40) [ ("input", p 20 30) ];
      element "lit-a" (Nat_literal Nat.zero) (b 50 20 70 40) [ ("value", p 70 30) ];
      element "succ" Succ (b 150 90 180 120) [ ("input", p 150 100); ("result", p 180 100) ];
      element "lit-b" (Nat_literal (nat "9")) (b 50 90 70 110) [ ("value", p 70 100) ];
      element "drop-b" (Drop Core_type.Nat) (b 150 20 180 50) [ ("input", p 150 30) ];
    ]
    [
      boundary "entry-param" "entry" G.Boundary_parameter Core_type.Unit (p 0 30);
      boundary "entry-result" "entry" G.Boundary_result Core_type.Nat (p 240 100);
    ]
    [
      wire "w-param" [ p 0 30; p 20 30 ];
      wire "w-a-succ" [ p 70 30; p 150 100 ];
      wire "w-b-drop" [ p 70 100; p 150 30 ];
      wire "w-result" [ p 180 100; p 240 100 ];
    ]
    []

let () =
  assert_scene_fixture "wire-crossing-without-junction" (crossing_scene ()) "Nat"
    "Nat(1)"

let symbolic_add_geometry_scene () =
  let inner_id = tid "add-step-inner-template" in
  let step_id = tid "add-step-template" in
  let nat_to_nat = Core_type.Arrow (Core_type.Nat, Core_type.Nat) in
  scene
    [
      entry ~dependencies:[ step_id ] "entry" Core_type.Nat (b 0 0 420 190);
      template ~dependencies:[ inner_id ] "add-step" Core_type.Nat nat_to_nat
        (b 50 210 340 330);
      template "add-step-inner" Core_type.Nat Core_type.Nat (b 80 360 300 460);
    ]
    [
      element "entry-drop" (Drop Core_type.Unit) (b 20 20 40 40) [ ("input", p 20 30) ];
      element "base" (Nat_literal (nat "2")) (b 60 20 80 40) [ ("value", p 80 30) ];
      element "count" (Nat_literal (nat "3")) (b 60 70 80 90) [ ("value", p 80 80) ];
      element "step-function"
        (Function
           {
             template_id = step_id;
             parameter_type = Core_type.Nat;
             result_type = nat_to_nat;
             captures = [];
           })
        (b 60 120 90 140) [ ("value", p 90 130) ];
      element "natrec" (NatRec Core_type.Nat) (b 170 40 230 120)
        [ ("base", p 170 50); ("step", p 170 80); ("count", p 170 110); ("result", p 230 80) ];
      element "drop-pred" (Drop Core_type.Nat) (b 80 230 100 250) [ ("input", p 80 240) ];
      element "inner-function"
        (Function
           {
             template_id = inner_id;
             parameter_type = Core_type.Nat;
             result_type = Core_type.Nat;
             captures = [];
           })
        (b 150 230 180 250) [ ("value", p 180 240) ];
      element "succ" Succ (b 120 390 150 420) [ ("input", p 120 400); ("result", p 150 400) ];
    ]
    [
      boundary "entry-param" "entry" G.Boundary_parameter Core_type.Unit (p 0 30);
      boundary "entry-result" "entry" G.Boundary_result Core_type.Nat (p 420 80);
      boundary "step-param" "add-step" G.Boundary_parameter Core_type.Nat (p 50 240);
      boundary "step-result" "add-step" G.Boundary_result nat_to_nat (p 340 240);
      boundary "inner-param" "add-step-inner" G.Boundary_parameter Core_type.Nat (p 80 400);
      boundary "inner-result" "add-step-inner" G.Boundary_result Core_type.Nat (p 300 400);
    ]
    [
      wire "w-entry-param" [ p 0 30; p 20 30 ];
      wire "w-base" [ p 80 30; p 170 50 ];
      wire "w-step" [ p 90 130; p 170 80 ];
      wire "w-count" [ p 80 80; p 170 110 ];
      wire "w-entry-result" [ p 230 80; p 420 80 ];
      wire "w-step-param" [ p 50 240; p 80 240 ];
      wire "w-step-result" [ p 180 240; p 340 240 ];
      wire "w-inner-param" [ p 80 400; p 120 400 ];
      wire "w-inner-result" [ p 150 400; p 300 400 ];
    ]
    []

let () =
  assert_scene_fixture ~expect_rule:"NatRecStart" "geometry-natrec-add"
    (symbolic_add_geometry_scene ()) "Nat" "Nat(5)"

let expect_geometry_error name predicate raw =
  let first = G.validate raw in
  let second = G.validate raw in
  let render result =
    match result with
    | Ok _ -> "<ok>"
    | Error errors -> String.concat "|" (List.map G.render_validation_error errors)
  in
  assert (String.equal (render first) (render second));
  match first with
  | Ok _ -> failwith (name ^ ": expected geometry error")
  | Error errors ->
      if not (List.exists predicate errors) then
        failwith (name ^ ": unexpected errors " ^ render first)

let expect_inference_error name predicate raw =
  let checked = validate raw in
  let first = G.infer_and_validate_symbolic checked in
  let second = G.infer_and_validate_symbolic checked in
  let render result =
    match result with
    | Ok _ -> "<ok>"
    | Error errors -> String.concat "|" (List.map G.render_inference_error errors)
  in
  assert (String.equal (render first) (render second));
  match first with
  | Ok _ -> failwith (name ^ ": expected inference error")
  | Error errors ->
      if not (List.exists predicate errors) then
        failwith (name ^ ": unexpected errors " ^ render first)

let () =
  expect_geometry_error "empty" (function G.Empty_scene -> true | _ -> false)
    (scene [] [] [] [] []);
  expect_geometry_error "duplicate-element"
    (function G.Duplicate_element_id _ -> true | _ -> false)
    (scene [ entry "entry" Core_type.Nat (b 0 0 100 100) ]
       [
         element "x" Unit_literal (b 10 10 20 20) [ ("value", p 20 20) ];
         element "x" Unit_literal (b 30 30 40 40) [ ("value", p 40 40) ];
       ]
       [] [] []);
  expect_geometry_error "duplicate-container"
    (function G.Duplicate_container_id _ -> true | _ -> false)
    (scene
       [
         entry "entry" Core_type.Nat (b 0 0 100 100);
         entry "entry" Core_type.Nat (b 200 0 300 100);
       ]
       [] [] [] []);
  expect_geometry_error "invalid-bounds"
    (function G.Invalid_bounds _ -> true | _ -> false)
    (scene [ entry "entry" Core_type.Nat (b 10 10 10 20) ] [] [] [] []);
  expect_geometry_error "invalid-tolerance"
    (function G.Invalid_tolerance _ -> true | _ -> false)
    (simple_connect_scene ~tolerance:(-1) ());
  expect_geometry_error "coordinate-out-of-range"
    (function G.Coordinate_out_of_range _ -> true | _ -> false)
    (scene [ entry "entry" Core_type.Nat (b 0 0 100 100) ]
       [ element "u" Unit_literal (b 10 10 20 20) [ ("value", p 1_000_000_001 20) ] ]
       [] [] []);
  expect_geometry_error "port-outside"
    (function G.Port_outside_element _ -> true | _ -> false)
    (scene [ entry "entry" Core_type.Nat (b 0 0 100 100) ]
       [ element "u" Unit_literal (b 10 10 20 20) [ ("value", p 50 50) ] ]
       [] [] []);
  expect_geometry_error "boundary-not-on-boundary"
    (function G.Boundary_port_not_on_container_boundary _ -> true | _ -> false)
    (scene [ entry "entry" Core_type.Nat (b 0 0 100 100) ] []
       [ boundary "bad" "entry" G.Boundary_result Core_type.Nat (p 50 50) ]
       [] []);
  expect_geometry_error "invalid-polyline"
    (function G.Invalid_polyline _ -> true | _ -> false)
    (scene [ entry "entry" Core_type.Nat (b 0 0 100 100) ] [] []
       [ wire "w" [ p 0 0 ] ] []);
  expect_geometry_error "zero-length-wire"
    (function G.Zero_length_wire _ -> true | _ -> false)
    (scene [ entry "entry" Core_type.Nat (b 0 0 100 100) ] [] []
       [ wire "w" [ p 0 0; p 0 0 ] ] []);
  expect_geometry_error "duplicate-junction-outlet"
    (function G.Duplicate_branch_outlet_order _ -> true | _ -> false)
    (scene [ entry "entry" Core_type.Nat (b 0 0 100 100) ] [] [] []
       [ junction "j" (p 10 10) [ (0, p 20 10); (0, p 20 20) ] ]);
  expect_geometry_error "element-without-owner"
    (function G.Element_without_owner _ -> true | _ -> false)
    (scene [ entry "entry" Core_type.Nat (b 0 0 100 100) ]
       [ element "n" (Nat_literal Nat.zero) (b 120 120 130 130) [ ("value", p 130 130) ] ]
       [] [] []);
  expect_geometry_error "ambiguous-owner"
    (function G.Ambiguous_element_owner _ -> true | _ -> false)
    (scene
       [
         entry "entry" Core_type.Nat (b 0 0 100 100);
         template "other" Core_type.Unit Core_type.Nat (b 0 0 100 100);
       ]
       [ element "n" (Nat_literal Nat.zero) (b 10 10 20 20) [ ("value", p 20 20) ] ]
       [] [] []);
  expect_geometry_error "overlapping-sibling-containers"
    (function G.Overlapping_sibling_containers _ -> true | _ -> false)
    (scene
       [
         entry "entry" Core_type.Nat (b 0 0 300 300);
         template "left" Core_type.Unit Core_type.Nat (b 20 20 180 180);
         template "right" Core_type.Unit Core_type.Nat (b 100 100 260 260);
       ]
       [] [] [] []);
  expect_inference_error "no-snap-candidate"
    (function G.Endpoint_has_no_candidate _ -> true | _ -> false)
    (scene [ entry "entry" Core_type.Nat (b 0 0 100 100) ] []
       [ boundary "entry-param" "entry" G.Boundary_parameter Core_type.Unit (p 0 10) ]
       [ wire "w" [ p 0 10; p 80 80 ] ] []);
  expect_inference_error "ambiguous-snap"
    (function G.Endpoint_has_ambiguous_candidates _ -> true | _ -> false)
    (scene ~tolerance:1 [ entry "entry" Core_type.Nat (b 0 0 100 100) ]
       [
         element "a" Unit_literal (b 10 10 20 20) [ ("value", p 20 20) ];
         element "b" Unit_literal (b 10 10 20 20) [ ("value", p 20 20) ];
       ]
       [] [ wire "w" [ p 20 20; p 20 21 ] ] []);
  expect_inference_error "input-to-input"
    (function G.Input_used_as_source _ -> true | _ -> false)
    (scene [ entry "entry" Core_type.Nat (b 0 0 100 100) ]
       [
         element "a" (Drop Core_type.Unit) (b 10 10 20 20) [ ("input", p 20 20) ];
         element "b" (Drop Core_type.Unit) (b 40 10 50 20) [ ("input", p 40 20) ];
       ]
       [] [ wire "w" [ p 20 20; p 40 20 ] ] []);
  expect_inference_error "output-to-output"
    (function G.Output_used_as_target _ -> true | _ -> false)
    (scene [ entry "entry" Core_type.Nat (b 0 0 100 100) ]
       [
         element "a" Unit_literal (b 10 10 20 20) [ ("value", p 20 20) ];
         element "b" Unit_literal (b 40 10 50 20) [ ("value", p 40 20) ];
       ]
       [] [ wire "w" [ p 20 20; p 40 20 ] ] []);
  expect_inference_error "type-mismatch"
    (function G.Type_mismatch _ -> true | _ -> false)
    (scene [ entry "entry" Core_type.Nat (b 0 0 120 100) ]
       [
         element "u" Unit_literal (b 10 10 20 20) [ ("value", p 20 20) ];
         element "succ" Succ (b 50 10 80 40) [ ("input", p 50 20); ("result", p 80 20) ];
       ]
       [] [ wire "w" [ p 20 20; p 50 20 ] ] []);
  expect_inference_error "implicit-fanout"
    (function G.Symbolic_validation_failed _ -> true | _ -> false)
    (scene [ entry "entry" Core_type.Nat (b 0 0 180 120) ]
       [
         element "n" (Nat_literal Nat.zero) (b 10 10 20 20) [ ("value", p 20 20) ];
         element "a" (Drop Core_type.Nat) (b 60 10 80 30) [ ("input", p 60 20) ];
         element "b" (Drop Core_type.Nat) (b 60 60 80 80) [ ("input", p 60 70) ];
       ]
       [] [ wire "w1" [ p 20 20; p 60 20 ]; wire "w2" [ p 20 20; p 60 70 ] ] []);
  expect_inference_error "junction-no-incoming"
    (function G.Junction_without_incoming_wire _ -> true | _ -> false)
    (scene [ entry "entry" Core_type.Nat (b 0 0 160 120) ]
       [
         element "a" (Drop Core_type.Nat) (b 80 10 100 30) [ ("input", p 80 20) ];
         element "b" (Drop Core_type.Nat) (b 80 60 100 80) [ ("input", p 80 70) ];
       ]
       []
       [ wire "w1" [ p 51 20; p 80 20 ]; wire "w2" [ p 51 70; p 80 70 ] ]
       [ junction "j" (p 50 50) [ (0, p 51 20); (1, p 51 70) ] ]);
  expect_inference_error "junction-one-outgoing"
    (function G.Junction_with_too_few_outgoing_wires _ -> true | _ -> false)
    (scene [ entry "entry" Core_type.Nat (b 0 0 160 120) ]
       [
         element "n" (Nat_literal Nat.zero) (b 10 40 20 60) [ ("value", p 20 50) ];
         element "a" (Drop Core_type.Nat) (b 80 10 100 30) [ ("input", p 80 20) ];
       ]
       []
       [ wire "in" [ p 20 50; p 50 50 ]; wire "out" [ p 51 20; p 80 20 ] ]
       [ junction "j" (p 50 50) [ (0, p 51 20); (1, p 51 70) ] ])
