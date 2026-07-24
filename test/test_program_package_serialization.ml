open Tilefold
open Core_graph

module P = Program_package
module S = Program_package_serialization

let node_id value =
  match Node_id.of_string value with
  | Ok id -> id
  | Error message -> failwith message

let edge_id value =
  match Edge_id.of_string value with
  | Ok id -> id
  | Error message -> failwith message

let port_key value =
  match Port_key.of_string value with
  | Ok key -> key
  | Error message -> failwith message

let template_id value =
  match Function_template_id.of_string value with
  | Ok id -> id
  | Error message -> failwith message

let literal_id value =
  match P.Literal_id.of_string value with
  | Ok id -> id
  | Error message -> failwith message

let nat value =
  match Nat.of_string value with Ok nat -> nat | Error _ -> failwith value

let node id kind = { id = node_id id; kind }
let pref node port = { node_id = node_id node; port_key = port_key port }
let edge id source target = { id = edge_id id; source; target }

let validate_graph raw =
  match validate raw with
  | Ok graph -> graph
  | Error errors ->
      failwith
        ("graph validation failed: "
        ^ String.concat "; " (List.map validation_error_to_string errors))

let validate_graph_with_templates templates raw =
  match validate_with_templates templates raw with
  | Ok graph -> graph
  | Error errors ->
      failwith
        ("graph validation failed: "
        ^ String.concat "; " (List.map validation_error_to_string errors))

let validate_package raw =
  match P.validate raw with
  | Ok package -> package
  | Error errors ->
      failwith
        ("package validation failed: "
        ^ String.concat "; " (List.map P.validation_error_to_string errors))

let function_signature template captures =
  {
    template_id = Function_template.id template;
    parameter_type = Function_template.parameter_type template;
    result_type = Function_template.result_type template;
    captures;
  }

let package_of_entry ?(templates = []) ?(literals = []) ?(entry_captures = [])
    entry result_type =
  P.Raw.create ~templates:(entry :: templates)
    ~entry_template_id:(Function_template.id entry) ~result_type ~literals
    ~entry_captures ()
  |> validate_package

let unit_entry () =
  let nodes =
    [ node "param" (Parameter Core_type.Unit); node "result" (Result Core_type.Unit) ]
  in
  let edges = [ edge "e-param-result" (pref "param" "value") (pref "result" "value") ] in
  let body = Raw_graph.of_lists ~nodes ~edges ~default_node_order:[] |> validate_graph in
  Function_template.create ~id:(template_id "serialization-unit-entry")
    ~parameter_type:Core_type.Unit ~result_type:Core_type.Unit ~captures:[] ~body ()

let succ_entry () =
  let nodes =
    [
      node "param" (Parameter Core_type.Unit);
      node "drop-param" (Drop Core_type.Unit);
      node "lit" (Nat_literal (nat "4"));
      node "succ" Succ;
      node "result" (Result Core_type.Nat);
    ]
  in
  let edges =
    [
      edge "e-param-drop" (pref "param" "value") (pref "drop-param" "input");
      edge "e-lit-succ" (pref "lit" "value") (pref "succ" "input");
      edge "e-succ-result" (pref "succ" "result") (pref "result" "value");
    ]
  in
  let body =
    Raw_graph.of_lists ~nodes ~edges
      ~default_node_order:[ node_id "succ"; node_id "drop-param" ]
    |> validate_graph
  in
  Function_template.create ~id:(template_id "serialization-succ-entry")
    ~parameter_type:Core_type.Unit ~result_type:Core_type.Nat ~captures:[] ~body ()

let copy_drop_entry () =
  let nodes =
    [
      node "param" (Parameter Core_type.Unit);
      node "drop-param" (Drop Core_type.Unit);
      node "lit" (Nat_literal (nat "2"));
      node "copy" (Copy Core_type.Nat);
      node "succ" Succ;
      node "drop-copy" (Drop Core_type.Nat);
      node "result" (Result Core_type.Nat);
    ]
  in
  let edges =
    [
      edge "e-param-drop" (pref "param" "value") (pref "drop-param" "input");
      edge "e-lit-copy" (pref "lit" "value") (pref "copy" "input");
      edge "e-copy-left-succ" (pref "copy" "left") (pref "succ" "input");
      edge "e-copy-right-drop" (pref "copy" "right") (pref "drop-copy" "input");
      edge "e-succ-result" (pref "succ" "result") (pref "result" "value");
    ]
  in
  let body =
    Raw_graph.of_lists ~nodes ~edges
      ~default_node_order:
        [ node_id "copy"; node_id "succ"; node_id "drop-copy"; node_id "drop-param" ]
    |> validate_graph
  in
  Function_template.create ~id:(template_id "serialization-copy-drop-entry")
    ~parameter_type:Core_type.Unit ~result_type:Core_type.Nat ~captures:[] ~body ()

let unit_to_nat_template () =
  let nodes =
    [
      node "param" (Parameter Core_type.Unit);
      node "drop-param" (Drop Core_type.Unit);
      node "lit" (Nat_literal (nat "6"));
      node "result" (Result Core_type.Nat);
    ]
  in
  let edges =
    [
      edge "e-param-drop" (pref "param" "value") (pref "drop-param" "input");
      edge "e-lit-result" (pref "lit" "value") (pref "result" "value");
    ]
  in
  let body =
    Raw_graph.of_lists ~nodes ~edges ~default_node_order:[ node_id "drop-param" ]
    |> validate_graph
  in
  Function_template.create ~id:(template_id "serialization-unit-to-nat")
    ~parameter_type:Core_type.Unit ~result_type:Core_type.Nat ~captures:[] ~body ()

let apply_entry target =
  let nodes =
    [
      node "param" (Parameter Core_type.Unit);
      node "drop-param" (Drop Core_type.Unit);
      node "function" (Function (function_signature target []));
      node "argument" Unit_literal;
      node "apply"
        (Apply { apply_parameter_type = Core_type.Unit; apply_result_type = Core_type.Nat });
      node "result" (Result Core_type.Nat);
    ]
  in
  let edges =
    [
      edge "e-param-drop" (pref "param" "value") (pref "drop-param" "input");
      edge "e-function-apply" (pref "function" "value")
        { node_id = node_id "apply"; port_key = Port_key.function_input };
      edge "e-argument-apply" (pref "argument" "value")
        { node_id = node_id "apply"; port_key = Port_key.argument };
      edge "e-apply-result"
        { node_id = node_id "apply"; port_key = Port_key.result }
        (pref "result" "value");
    ]
  in
  let body =
    Raw_graph.of_lists ~nodes ~edges
      ~default_node_order:[ node_id "function"; node_id "apply"; node_id "drop-param" ]
    |> validate_graph_with_templates [ target ]
  in
  Function_template.create ~dependencies:[ Function_template.id target ]
    ~id:(template_id "serialization-apply-entry") ~parameter_type:Core_type.Unit
    ~result_type:Core_type.Nat ~captures:[] ~body ()

let arrow_entry target =
  let arrow = Core_type.Arrow (Core_type.Unit, Core_type.Nat) in
  let nodes =
    [
      node "param" (Parameter Core_type.Unit);
      node "drop-param" (Drop Core_type.Unit);
      node "function" (Function (function_signature target []));
      node "result" (Result arrow);
    ]
  in
  let edges =
    [
      edge "e-param-drop" (pref "param" "value") (pref "drop-param" "input");
      edge "e-function-result" (pref "function" "value") (pref "result" "value");
    ]
  in
  let body =
    Raw_graph.of_lists ~nodes ~edges
      ~default_node_order:[ node_id "function"; node_id "drop-param" ]
    |> validate_graph_with_templates [ target ]
  in
  Function_template.create ~dependencies:[ Function_template.id target ]
    ~id:(template_id "serialization-arrow-entry") ~parameter_type:Core_type.Unit
    ~result_type:arrow ~captures:[] ~body ()

let captured_entry () =
  let capture = { key = Port_key.capture "n"; typ = Core_type.Nat } in
  let nodes =
    [
      node "param" (Parameter Core_type.Unit);
      node "drop-param" (Drop Core_type.Unit);
      node "capture" (Capture capture);
      node "result" (Result Core_type.Nat);
    ]
  in
  let edges =
    [
      edge "e-param-drop" (pref "param" "value") (pref "drop-param" "input");
      edge "e-capture-result" (pref "capture" "value") (pref "result" "value");
    ]
  in
  let body =
    Raw_graph.of_lists ~nodes ~edges ~default_node_order:[ node_id "drop-param" ]
    |> validate_graph
  in
  Function_template.create ~id:(template_id "serialization-captured-entry")
    ~parameter_type:Core_type.Unit ~result_type:Core_type.Nat ~captures:[ capture ] ~body ()

let captured_package () =
  let entry = captured_entry () in
  let literal = { P.id = literal_id "n"; payload = Runtime_value.Nat (nat "9") } in
  let capture =
    { P.capture_key = Port_key.capture "n"; literal_id = literal_id "n" }
  in
  package_of_entry ~literals:[ literal ] ~entry_captures:[ capture ] entry
    Core_type.Nat

let payload_string value =
  match Runtime_value.payload value with
  | Unit -> "Unit"
  | Nat nat -> "Nat(" ^ Nat.to_string nat ^ ")"
  | Closure closure -> "Closure(" ^ Function_template_id.to_string closure.template_id ^ ")"

let run_completed package =
  match P.run_completed package with Ok completed -> completed | Error _ -> assert false

let assert_roundtrip name package =
  let first_bytes = S.encode package in
  let second_bytes = S.encode package in
  if not (String.equal first_bytes second_bytes) then
    failwith (name ^ ": independent encodes differ");
  let decoded =
    match S.decode first_bytes with
    | Ok package -> package
    | Error error -> failwith (name ^ ": decode failed: " ^ S.render_error error)
  in
  let decoded_bytes = S.encode decoded in
  if not (String.equal first_bytes decoded_bytes) then
    failwith (name ^ ": decode/encode is not canonical");
  let original_run = run_completed package in
  let decoded_run = run_completed decoded in
  assert (Core_type.equal (Runtime_value.typ original_run.value) (Runtime_value.typ decoded_run.value));
  assert (String.equal (payload_string original_run.value) (payload_string decoded_run.value));
  let original_trace = Canonical_trace.render_completed original_run.machine original_run.value in
  let decoded_trace = Canonical_trace.render_completed decoded_run.machine decoded_run.value in
  if not (String.equal original_trace decoded_trace) then
    failwith (name ^ ": decoded canonical trace differs")

let () = assert_roundtrip "program-unit" (package_of_entry (unit_entry ()) Core_type.Unit)
let () = assert_roundtrip "succ" (package_of_entry (succ_entry ()) Core_type.Nat)
let () = assert_roundtrip "copy-drop" (package_of_entry (copy_drop_entry ()) Core_type.Nat)

let () =
  let target = unit_to_nat_template () in
  assert_roundtrip "program-arrow"
    (package_of_entry ~templates:[ target ] (arrow_entry target)
       (Core_type.Arrow (Core_type.Unit, Core_type.Nat)))

let () =
  let target = unit_to_nat_template () in
  assert_roundtrip "ordinary-apply"
    (package_of_entry ~templates:[ target ] (apply_entry target) Core_type.Nat)

let () = assert_roundtrip "add" (P.Examples.add ())
let () = assert_roundtrip "multiply" (P.Examples.multiply ())
let () = assert_roundtrip "higher-order-function" (P.Examples.higher_order_function ())
let () = assert_roundtrip "higher-order-apply" (P.Examples.higher_order_apply ())

let () =
  assert_roundtrip "natrec-count-0" (P.Examples.higher_order_apply ~count:"0" ())

let () =
  assert_roundtrip "natrec-count-1" (P.Examples.higher_order_apply ~count:"1" ())

let () =
  assert_roundtrip "natrec-count-3" (P.Examples.higher_order_apply ~count:"3" ())

let () = assert_roundtrip "nested-natrec" (P.Examples.multiply ())
let () = assert_roundtrip "arrow-accumulator" (P.Examples.higher_order_function ())
let () = assert_roundtrip "nested-apply" (P.Examples.higher_order_apply ())

let () =
  assert_roundtrip "function-capture"
    (captured_package ())

let () =
  let target = unit_to_nat_template () in
  let entry = apply_entry target in
  let package_a =
    P.Raw.create ~templates:[ entry; target ]
      ~entry_template_id:(Function_template.id entry) ~result_type:Core_type.Nat ()
    |> validate_package
  in
  let package_b =
    P.Raw.create ~templates:[ target; entry ]
      ~entry_template_id:(Function_template.id entry) ~result_type:Core_type.Nat ()
    |> validate_package
  in
  assert (String.equal (S.encode package_a) (S.encode package_b))

let () =
  let package = P.Examples.higher_order_apply () in
  let reordered =
    P.Raw.create
      ~templates:(List.rev (P.templates package))
      ~entry_template_id:(P.entry_template_id package)
      ~result_type:(P.result_type package)
      ~literals:(List.rev (P.literals package))
      ~entry_captures:(List.rev (P.entry_captures package))
      ()
    |> validate_package
  in
  assert (String.equal (S.encode package) (S.encode reordered))

let () =
  let raw_nodes =
    [
      node "param" (Parameter Core_type.Unit);
      node "drop-param" (Drop Core_type.Unit);
      node "lit" (Nat_literal (nat "4"));
      node "succ" Succ;
      node "result" (Result Core_type.Nat);
    ]
  in
  let raw_edges =
    [
      edge "e-param-drop" (pref "param" "value") (pref "drop-param" "input");
      edge "e-lit-succ" (pref "lit" "value") (pref "succ" "input");
      edge "e-succ-result" (pref "succ" "result") (pref "result" "value");
    ]
  in
  let make nodes edges =
    let body =
      Raw_graph.of_lists ~nodes ~edges
        ~default_node_order:[ node_id "succ"; node_id "drop-param" ]
      |> validate_graph
    in
    Function_template.create ~id:(template_id "serialization-order-entry")
      ~parameter_type:Core_type.Unit ~result_type:Core_type.Nat ~captures:[] ~body ()
    |> fun entry -> package_of_entry entry Core_type.Nat
  in
  assert (String.equal (S.encode (make raw_nodes raw_edges)) (S.encode (make (List.rev raw_nodes) (List.rev raw_edges))))

let expect_error name predicate input =
  let first = S.decode input in
  let second = S.decode input in
  let render = function Ok _ -> "<ok>" | Error error -> S.render_error error in
  if not (String.equal (render first) (render second)) then
    failwith (name ^ ": error rendering is not deterministic");
  match first with
  | Ok _ -> failwith (name ^ ": expected decode error")
  | Error error -> if not (predicate error) then failwith (name ^ ": unexpected error: " ^ S.render_error error)

let valid_bytes = S.encode (P.Examples.add ())
let captured_bytes = S.encode (captured_package ())
let succ_bytes = S.encode (package_of_entry (succ_entry ()) Core_type.Nat)
let apply_bytes =
  let target = unit_to_nat_template () in
  S.encode (package_of_entry ~templates:[ target ] (apply_entry target) Core_type.Nat)

let replace_first source target replacement =
  let source_length = String.length source in
  let target_length = String.length target in
  let rec loop index =
    if index + target_length > source_length then source
    else if String.equal (String.sub source index target_length) target then
      String.sub source 0 index ^ replacement
      ^ String.sub source (index + target_length) (source_length - index - target_length)
    else loop (index + 1)
  in
  loop 0

let () =
  expect_error "empty" (function S.Parse_error _ -> true | _ -> false) "";
  expect_error "bad-syntax" (function S.Parse_error _ -> true | _ -> false) "(";
  expect_error "trailing-garbage" (function S.Parse_error _ -> true | _ -> false)
    (valid_bytes ^ "garbage");
  expect_error "unsupported-version"
    (function S.Unsupported_format_version _ -> true | _ -> false)
    (replace_first valid_bytes S.format_version "tilefold-program-package-v2");
  expect_error "unsupported-profile"
    (function S.Unsupported_semantics_profile _ -> true | _ -> false)
    (replace_first valid_bytes S.semantics_profile "future-profile");
  expect_error "missing-field" (function S.Missing_field _ -> true | _ -> false)
    (replace_first valid_bytes "(\"literals\")" "");
  expect_error "duplicate-field" (function S.Duplicate_field _ -> true | _ -> false)
    (replace_first valid_bytes "(\"literals\"" "(\"literals\") (\"literals\"");
  expect_error "non-canonical-nat"
    (function S.Non_canonical_nat _ -> true | _ -> false)
    (replace_first valid_bytes "\"3\"" "\"03\"");
  expect_error "unsupported-literal-payload"
    (function S.Unsupported_program_literal_payload -> true | _ -> false)
    (replace_first captured_bytes "(\"Nat\" \"9\")" "(\"Closure\")");
  expect_error "dangling-template"
    (function S.Dangling_template_reference _ | S.Package_validation_errors _ -> true | _ -> false)
    (replace_first valid_bytes "\"example-add-step\"" "\"missing-template\"");
  expect_error "invalid-type"
    (function S.Invalid_type | S.Package_validation_errors _ -> true | _ -> false)
    (replace_first valid_bytes "(\"Nat\")" "(\"Bogus\")");
  expect_error "duplicate-id"
    (function S.Package_validation_errors _ -> true | _ -> false)
    (replace_first succ_bytes "\"e-lit-succ\"" "\"e-succ-result\"");
  expect_error "dangling-port-reference"
    (function S.Package_validation_errors _ -> true | _ -> false)
    (replace_first succ_bytes
       "(\"port-ref\" \"succ\" \"input\")"
       "(\"port-ref\" \"missing\" \"input\")");
  expect_error "invalid-node-schema"
    (function S.Invalid_node_kind -> true | _ -> false)
    (replace_first succ_bytes "(\"Succ\")" "(\"Succ\" \"extra\")");
  expect_error "type-mismatch"
    (function S.Package_validation_errors _ -> true | _ -> false)
    (replace_first succ_bytes "(\"NatLiteral\" \"4\")" "(\"UnitLiteral\")");
  expect_error "invalid-default-node-order"
    (function S.Package_validation_errors _ -> true | _ -> false)
    (replace_first succ_bytes
       "(\"default-node-order\" \"succ\" \"drop-param\")"
       "(\"default-node-order\" \"missing\" \"drop-param\")");
  expect_error "invalid-capture"
    (function S.Package_validation_errors _ -> true | _ -> false)
    (replace_first captured_bytes "(\"Nat\" \"9\")" "(\"Unit\")");
  expect_error "invalid-signature"
    (function S.Package_validation_errors _ -> true | _ -> false)
    (replace_first apply_bytes
       "(\"Function\" \"serialization-unit-to-nat\" (\"Unit\") (\"Nat\")"
       "(\"Function\" \"serialization-unit-to-nat\" (\"Unit\") (\"Unit\")");
  expect_error "function-template-cycle"
    (function S.Template_dependency_cycle _ | S.Package_validation_errors _ -> true | _ -> false)
    (replace_first captured_bytes
       "(\"dependencies\")"
       "(\"dependencies\" \"serialization-captured-entry\")");
  expect_error "value-dependency-cycle"
    (function S.Package_validation_errors _ -> true | _ -> false)
    (replace_first succ_bytes
       "(\"source\" (\"port-ref\" \"lit\" \"value\")) (\"target\" (\"port-ref\" \"succ\" \"input\"))"
       "(\"source\" (\"port-ref\" \"succ\" \"result\")) (\"target\" (\"port-ref\" \"succ\" \"input\"))")
