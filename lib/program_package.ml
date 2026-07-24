module CG = Core_graph

module Literal_id = struct
  type t = string

  let of_string value =
    if String.equal value "" then Error "program literal ID must not be empty"
    else Ok value

  let equal = String.equal
  let compare = String.compare
  let to_string value = value
end

type literal = {
  id : Literal_id.t;
  payload : Runtime_value.payload;
}

type entry_capture = {
  capture_key : CG.Port_key.t;
  literal_id : Literal_id.t;
}

module Raw = struct
  type t = {
    templates : CG.Function_template.t list;
    entry_template_id : CG.Function_template_id.t;
    result_type : Core_type.t;
    literals : literal list;
    entry_captures : entry_capture list;
  }

  let create ~templates ~entry_template_id ~result_type ?(literals = [])
      ?(entry_captures = []) () =
    { templates; entry_template_id; result_type; literals; entry_captures }

  let templates t = t.templates
  let entry_template_id t = t.entry_template_id
  let result_type t = t.result_type
  let literals t = t.literals
  let entry_captures t = t.entry_captures
end

type validation_error =
  | Core_validation_errors of CG.validation_error list
  | Entry_template_missing of CG.Function_template_id.t
  | Entry_parameter_not_unit of {
      template_id : CG.Function_template_id.t;
      actual : Core_type.t;
    }
  | Entry_result_type_mismatch of {
      template_id : CG.Function_template_id.t;
      expected : Core_type.t;
      actual : Core_type.t;
    }
  | Duplicate_program_literal_id of Literal_id.t
  | Duplicate_entry_capture of CG.Port_key.t
  | Missing_entry_capture of CG.Port_key.t
  | Unexpected_entry_capture of CG.Port_key.t
  | Entry_capture_literal_missing of {
      capture_key : CG.Port_key.t;
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

type t = {
  raw : Raw.t;
  entry_template : CG.Function_template.t;
  launcher_graph : CG.Validated_graph.t;
  program_literal_nodes : (CG.Node_id.t * Literal_id.t) list;
}

let templates package = Raw.templates package.raw
let entry_template package = package.entry_template
let result_type package = Raw.result_type package.raw
let launcher_graph package = package.launcher_graph

let find_template templates template_id =
  List.find_opt
    (fun template ->
      CG.Function_template_id.equal (CG.Function_template.id template) template_id)
    templates

let duplicate_by compare values =
  let sorted = List.sort compare values in
  let rec loop = function
    | left :: (right :: _ as rest) ->
        if compare left right = 0 then Some left else loop rest
    | [] | [ _ ] -> None
  in
  loop sorted

let node_id value =
  match CG.Node_id.of_string value with
  | Ok id -> id
  | Error message -> failwith message

let edge_id value =
  match CG.Edge_id.of_string value with
  | Ok id -> id
  | Error message -> failwith message

let template_id value =
  match CG.Function_template_id.of_string value with
  | Ok id -> id
  | Error message -> failwith message

let port_key value =
  match CG.Port_key.of_string value with
  | Ok key -> key
  | Error message -> failwith message

let literal_id value =
  match Literal_id.of_string value with
  | Ok id -> id
  | Error message -> failwith message

let nat value =
  match Nat.of_string value with
  | Ok nat -> nat
  | Error _ -> failwith ("invalid Nat literal: " ^ value)

let node id kind = { CG.id = node_id id; kind }
let pref node port = { CG.node_id = node_id node; port_key = port_key port }
let edge id source target = { CG.id = edge_id id; source; target }

let literal_node_kind payload =
  match payload with
  | Runtime_value.Unit -> Ok CG.Unit_literal
  | Runtime_value.Nat nat -> Ok (CG.Nat_literal nat)
  | Runtime_value.Closure _ -> Error "closure program literals are not supported"

let unsupported_literal_payload_errors raw =
  Raw.literals raw
  |> List.filter_map (fun literal ->
         match literal_node_kind literal.payload with
         | Ok _ -> None
         | Error _ ->
             Some
               (Unsupported_program_literal_payload
                  {
                    literal_id = literal.id;
                    typ = Runtime_value.payload_type literal.payload;
                  }))

let launcher_graph_raw raw entry_template =
  let captures = CG.Function_template.captures entry_template in
  let signature =
    {
      CG.template_id = CG.Function_template.id entry_template;
      parameter_type = CG.Function_template.parameter_type entry_template;
      result_type = CG.Function_template.result_type entry_template;
      captures;
    }
  in
  let apply_signature =
    {
      CG.apply_parameter_type = Core_type.Unit;
      apply_result_type = CG.Function_template.result_type entry_template;
    }
  in
  let capture_triples =
    captures
    |> List.mapi (fun index (capture : CG.capture) ->
           let entry_capture =
             Raw.entry_captures raw
             |> List.find (fun entry_capture ->
                    CG.Port_key.equal entry_capture.capture_key capture.CG.key)
           in
           let literal =
             Raw.literals raw
             |> List.find (fun literal ->
                    Literal_id.equal literal.id entry_capture.literal_id)
           in
           let node_name = "entry-capture-" ^ string_of_int index in
           match literal_node_kind literal.payload with
           | Error message -> failwith message
           | Ok kind ->
               ( node node_name kind,
                 edge
                   ("e-entry-capture-" ^ string_of_int index)
                   (pref node_name "value")
                   { CG.node_id = node_id "entry-function"; port_key = capture.key },
                 (node_id node_name, literal.id) ))
  in
  let capture_literal_nodes =
    List.map (fun (literal_node, _, _) -> literal_node) capture_triples
  in
  let capture_literal_edges =
    List.map (fun (_, literal_edge, _) -> literal_edge) capture_triples
  in
  let program_literal_nodes =
    List.map (fun (_, _, program_literal_node) -> program_literal_node) capture_triples
  in
  let nodes =
    [
      node "entry-parameter" (CG.Parameter Core_type.Unit);
      node "entry-function" (CG.Function signature);
      node "entry-apply" (CG.Apply apply_signature);
      node "entry-result" (CG.Result (Raw.result_type raw));
    ]
    @ capture_literal_nodes
  in
  let edges =
    [
      edge "e-entry-function-apply" (pref "entry-function" "value")
        { CG.node_id = node_id "entry-apply"; port_key = CG.Port_key.function_input };
      edge "e-entry-argument-apply" (pref "entry-parameter" "value")
        { CG.node_id = node_id "entry-apply"; port_key = CG.Port_key.argument };
      edge "e-entry-apply-result"
        { CG.node_id = node_id "entry-apply"; port_key = CG.Port_key.result }
        (pref "entry-result" "value");
    ]
    @ capture_literal_edges
  in
  let default_node_order = [ node_id "entry-function"; node_id "entry-apply" ] in
  (CG.Raw_graph.of_lists ~nodes ~edges ~default_node_order, program_literal_nodes)

let validate_entry_captures raw entry_template =
  let expected = CG.Function_template.captures entry_template in
  let actual = Raw.entry_captures raw in
  let actual_keys = List.map (fun (capture : entry_capture) -> capture.capture_key) actual in
  let expected_keys = List.map (fun (capture : CG.capture) -> capture.key) expected in
  let duplicate_capture_errors =
    match duplicate_by CG.Port_key.compare actual_keys with
    | Some key -> [ Duplicate_entry_capture key ]
    | None -> []
  in
  let missing_errors =
    expected_keys
    |> List.filter (fun key ->
           not (List.exists (CG.Port_key.equal key) actual_keys))
    |> List.map (fun key -> Missing_entry_capture key)
  in
  let unexpected_errors =
    actual_keys
    |> List.filter (fun key ->
           not (List.exists (CG.Port_key.equal key) expected_keys))
    |> List.map (fun key -> Unexpected_entry_capture key)
  in
  let literal_lookup_errors, literal_type_errors =
    actual
    |> List.fold_left
         (fun (missing, mismatches) entry_capture ->
           match
             List.find_opt
               (fun literal -> Literal_id.equal literal.id entry_capture.literal_id)
               (Raw.literals raw)
           with
           | None ->
               ( Entry_capture_literal_missing
                   {
                     capture_key = entry_capture.capture_key;
                     literal_id = entry_capture.literal_id;
                   }
                 :: missing,
                 mismatches )
           | Some literal -> (
               match
                 List.find_opt
                   (fun (capture : CG.capture) ->
                     CG.Port_key.equal capture.key entry_capture.capture_key)
                   expected
               with
               | None -> (missing, mismatches)
               | Some capture ->
                   let actual_type = Runtime_value.payload_type literal.payload in
                   if Core_type.equal actual_type capture.typ then (missing, mismatches)
                   else
                     ( missing,
                       Program_literal_type_mismatch
                         {
                           literal_id = literal.id;
                           expected = capture.typ;
                           actual = actual_type;
                         }
                       :: mismatches )))
         ([], [])
  in
  duplicate_capture_errors @ missing_errors @ unexpected_errors
  @ List.rev literal_lookup_errors @ List.rev literal_type_errors

let validate raw =
  let duplicate_literal_errors =
    match duplicate_by Literal_id.compare (List.map (fun literal -> literal.id) (Raw.literals raw)) with
    | Some id -> [ Duplicate_program_literal_id id ]
    | None -> []
  in
  let entry_template =
    find_template (Raw.templates raw) (Raw.entry_template_id raw)
  in
  let entry_errors, launcher_result =
    match entry_template with
    | None -> ([ Entry_template_missing (Raw.entry_template_id raw) ], None)
    | Some entry ->
        let parameter_errors =
          if Core_type.equal (CG.Function_template.parameter_type entry) Core_type.Unit then []
          else
            [
              Entry_parameter_not_unit
                {
                  template_id = CG.Function_template.id entry;
                  actual = CG.Function_template.parameter_type entry;
                };
            ]
        in
        let result_errors =
          if Core_type.equal (CG.Function_template.result_type entry) (Raw.result_type raw)
          then []
          else
            [
              Entry_result_type_mismatch
                {
                  template_id = CG.Function_template.id entry;
                  expected = Raw.result_type raw;
                  actual = CG.Function_template.result_type entry;
                };
            ]
        in
        let capture_errors = validate_entry_captures raw entry in
        let literal_payload_errors = unsupported_literal_payload_errors raw in
        if
          parameter_errors @ result_errors @ capture_errors
          @ literal_payload_errors
          <> []
        then
          ( parameter_errors @ result_errors @ capture_errors
            @ literal_payload_errors,
            None )
        else
          let launcher_raw, program_literal_nodes = launcher_graph_raw raw entry in
          ( [],
            Some
              (entry, launcher_raw, program_literal_nodes) )
  in
  let core_result =
    match launcher_result with
    | None -> None
    | Some (_entry, launcher_raw, _program_literal_nodes) -> (
        match CG.validate_with_templates (Raw.templates raw) launcher_raw with
        | Ok graph -> Some (Ok graph)
        | Error errors -> Some (Error errors))
  in
  let core_errors =
    match core_result with
    | Some (Error errors) -> [ Core_validation_errors errors ]
    | Some (Ok _) | None -> []
  in
  let errors = duplicate_literal_errors @ entry_errors @ core_errors in
  match (errors, entry_template, launcher_result, core_result) with
  | [], Some entry_template, Some (_, _launcher_raw, program_literal_nodes), Some (Ok launcher_graph)
    ->
      Ok { raw; entry_template; launcher_graph; program_literal_nodes }
  | _ -> Error errors

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

let initialize package =
  Engine.initialize_with_templates_and_program_literals (templates package)
    package.launcher_graph
    ~program_literals:
      (List.map
         (fun (node_id, literal_id) -> (node_id, Literal_id.to_string literal_id))
         package.program_literal_nodes)
    ~input:Runtime_value.Unit
  |> Result.map_error (fun error -> Initialization_error error)

let step = Engine.step

let result_value package machine =
  match Engine.Machine.result_value machine with
  | None -> Error Result_requested_before_completion
  | Some value ->
      if Core_type.equal (Runtime_value.typ value) (result_type package) then Ok value
      else
        Error
          (Completed_result_type_mismatch
             {
               expected = result_type package;
               actual = Runtime_value.typ value;
             })

let run ?step_limit package =
  match initialize package with
  | Error error -> Run_error { error; trace = [] }
  | Ok machine ->
      let rec loop executed_steps machine =
        match step_limit with
        | Some limit when Nat.compare executed_steps limit >= 0 ->
            Step_limit_exceeded
              {
                limit;
                executed_steps;
                trace = Engine.Machine.trace_events machine;
              }
        | _ -> (
            match Engine.step machine with
            | Engine.Rewritten { machine; _ } -> loop (Nat.succ executed_steps) machine
            | Engine.Completed value ->
                if Core_type.equal (Runtime_value.typ value) (result_type package) then
                  Completed
                    { value; trace = Engine.Machine.trace_events machine }
                else
                  Run_error
                    {
                      error =
                        Completed_result_type_mismatch
                          {
                            expected = result_type package;
                            actual = Runtime_value.typ value;
                          };
                      trace = Engine.Machine.trace_events machine;
                    }
            | Engine.Stuck reason ->
                Stuck { reason; trace = Engine.Machine.trace_events machine }
            | Engine.Runtime_error error ->
                Run_error
                  {
                    error = Runtime_error error;
                    trace = Engine.Machine.trace_events machine;
                  })
      in
      loop Nat.zero machine

let validation_error_to_string = function
  | Core_validation_errors errors ->
      "Core validation errors: "
      ^ String.concat "; " (List.map CG.validation_error_to_string errors)
  | Entry_template_missing id ->
      "entry template missing: " ^ CG.Function_template_id.to_string id
  | Entry_parameter_not_unit { template_id; actual } ->
      "entry template " ^ CG.Function_template_id.to_string template_id
      ^ " parameter must be Unit, got " ^ Core_type.to_string actual
  | Entry_result_type_mismatch { template_id; expected; actual } ->
      "entry template " ^ CG.Function_template_id.to_string template_id
      ^ " result mismatch: expected " ^ Core_type.to_string expected
      ^ ", actual " ^ Core_type.to_string actual
  | Duplicate_program_literal_id id ->
      "duplicate program literal ID: " ^ Literal_id.to_string id
  | Duplicate_entry_capture key ->
      "duplicate entry capture: " ^ CG.Port_key.to_string key
  | Missing_entry_capture key ->
      "missing entry capture: " ^ CG.Port_key.to_string key
  | Unexpected_entry_capture key ->
      "unexpected entry capture: " ^ CG.Port_key.to_string key
  | Entry_capture_literal_missing { capture_key; literal_id } ->
      "entry capture " ^ CG.Port_key.to_string capture_key
      ^ " references missing literal " ^ Literal_id.to_string literal_id
  | Program_literal_type_mismatch { literal_id; expected; actual } ->
      "program literal " ^ Literal_id.to_string literal_id
      ^ " type mismatch: expected " ^ Core_type.to_string expected
      ^ ", actual " ^ Core_type.to_string actual
  | Unsupported_program_literal_payload { literal_id; typ } ->
      "unsupported program literal payload for " ^ Literal_id.to_string literal_id
      ^ ": " ^ Core_type.to_string typ

let execution_error_to_string = function
  | Initialization_error error -> Engine.initialization_error_to_string error
  | Runtime_error error -> Engine.runtime_error_to_string error
  | Result_requested_before_completion -> "result requested before completion"
  | Completed_result_type_mismatch { expected; actual } ->
      "completed result type mismatch: expected " ^ Core_type.to_string expected
      ^ ", actual " ^ Core_type.to_string actual

let validate_or_fail raw =
  match validate raw with
  | Ok package -> package
  | Error errors ->
      failwith
        ("example package validation failed: "
        ^ String.concat "; " (List.map validation_error_to_string errors))

let validate_graph_or_fail raw =
  match CG.validate raw with
  | Ok graph -> graph
  | Error errors ->
      failwith
        ("example graph validation failed: "
        ^ String.concat "; " (List.map CG.validation_error_to_string errors))

let validate_graph_with_templates_or_fail templates raw =
  match CG.validate_with_templates templates raw with
  | Ok graph -> graph
  | Error errors ->
      failwith
        ("example graph validation failed: "
        ^ String.concat "; " (List.map CG.validation_error_to_string errors))

let function_signature template captures =
  {
    CG.template_id = CG.Function_template.id template;
    parameter_type = CG.Function_template.parameter_type template;
    result_type = CG.Function_template.result_type template;
    captures;
  }

let unit_drop_edges parameter_node drop_node =
  [
    edge ("e-" ^ parameter_node ^ "-drop") (pref parameter_node "value")
      (pref drop_node "input");
  ]

let succ_accumulator_template ~id =
  let nodes =
    [
      node "acc" (CG.Parameter Core_type.Nat);
      node "succ" CG.Succ;
      node "result" (CG.Result Core_type.Nat);
    ]
  in
  let edges =
    [
      edge "e-acc-succ" (pref "acc" "value") (pref "succ" "input");
      edge "e-succ-result" (pref "succ" "result") (pref "result" "value");
    ]
  in
  let body =
    CG.Raw_graph.of_lists ~nodes ~edges ~default_node_order:[ node_id "succ" ]
    |> validate_graph_or_fail
  in
  CG.Function_template.create ~id:(template_id id) ~parameter_type:Core_type.Nat
    ~result_type:Core_type.Nat ~captures:[] ~body ()

let natrec_succ_step_template ~outer_id ~inner_id =
  let inner = succ_accumulator_template ~id:inner_id in
  let inner_arrow = Core_type.Arrow (Core_type.Nat, Core_type.Nat) in
  let nodes =
    [
      node "pred" (CG.Parameter Core_type.Nat);
      node "drop-pred" (CG.Drop Core_type.Nat);
      node "inner-function" (CG.Function (function_signature inner []));
      node "result" (CG.Result inner_arrow);
    ]
  in
  let edges =
    unit_drop_edges "pred" "drop-pred"
    @ [
        edge "e-inner-result" (pref "inner-function" "value")
          (pref "result" "value");
      ]
  in
  let body =
    CG.Raw_graph.of_lists ~nodes ~edges
      ~default_node_order:[ node_id "inner-function"; node_id "drop-pred" ]
    |> validate_graph_with_templates_or_fail [ inner ]
  in
  let outer =
    CG.Function_template.create ~dependencies:[ CG.Function_template.id inner ]
      ~id:(template_id outer_id) ~parameter_type:Core_type.Nat
      ~result_type:inner_arrow ~captures:[] ~body ()
  in
  (inner, outer)

let add2_template ~id ~step_outer =
  let nodes =
    [
      node "base" (CG.Parameter Core_type.Nat);
      node "count" (CG.Nat_literal (nat "2"));
      node "step-function" (CG.Function (function_signature step_outer []));
      node "natrec" (CG.NatRec Core_type.Nat);
      node "result" (CG.Result Core_type.Nat);
    ]
  in
  let edges =
    [
      edge "e-base-natrec" (pref "base" "value")
        { CG.node_id = node_id "natrec"; port_key = CG.Port_key.base };
      edge "e-step-natrec" (pref "step-function" "value")
        { CG.node_id = node_id "natrec"; port_key = CG.Port_key.step };
      edge "e-count-natrec" (pref "count" "value")
        { CG.node_id = node_id "natrec"; port_key = CG.Port_key.count };
      edge "e-natrec-result"
        { CG.node_id = node_id "natrec"; port_key = CG.Port_key.result }
        (pref "result" "value");
    ]
  in
  let body =
    CG.Raw_graph.of_lists ~nodes ~edges
      ~default_node_order:[ node_id "step-function"; node_id "natrec" ]
    |> validate_graph_with_templates_or_fail [ step_outer ]
  in
  CG.Function_template.create ~dependencies:[ CG.Function_template.id step_outer ]
    ~id:(template_id id) ~parameter_type:Core_type.Nat
    ~result_type:Core_type.Nat ~captures:[] ~body ()

let entry_add_template ~id ~step_outer =
  let nodes =
    [
      node "unit" (CG.Parameter Core_type.Unit);
      node "drop-unit" (CG.Drop Core_type.Unit);
      node "base" (CG.Nat_literal (nat "2"));
      node "count" (CG.Nat_literal (nat "3"));
      node "step-function" (CG.Function (function_signature step_outer []));
      node "natrec" (CG.NatRec Core_type.Nat);
      node "result" (CG.Result Core_type.Nat);
    ]
  in
  let edges =
    unit_drop_edges "unit" "drop-unit"
    @ [
        edge "e-base-natrec" (pref "base" "value")
          { CG.node_id = node_id "natrec"; port_key = CG.Port_key.base };
        edge "e-step-natrec" (pref "step-function" "value")
          { CG.node_id = node_id "natrec"; port_key = CG.Port_key.step };
        edge "e-count-natrec" (pref "count" "value")
          { CG.node_id = node_id "natrec"; port_key = CG.Port_key.count };
        edge "e-natrec-result"
          { CG.node_id = node_id "natrec"; port_key = CG.Port_key.result }
          (pref "result" "value");
      ]
  in
  let body =
    CG.Raw_graph.of_lists ~nodes ~edges
      ~default_node_order:
        [ node_id "step-function"; node_id "natrec"; node_id "drop-unit" ]
    |> validate_graph_with_templates_or_fail [ step_outer ]
  in
  CG.Function_template.create ~dependencies:[ CG.Function_template.id step_outer ]
    ~id:(template_id id) ~parameter_type:Core_type.Unit
    ~result_type:Core_type.Nat ~captures:[] ~body ()

let multiply_inner_template ~id ~add2 =
  let nodes =
    [
      node "acc" (CG.Parameter Core_type.Nat);
      node "add2-function" (CG.Function (function_signature add2 []));
      node "apply-add2"
        (CG.Apply { apply_parameter_type = Core_type.Nat; apply_result_type = Core_type.Nat });
      node "result" (CG.Result Core_type.Nat);
    ]
  in
  let edges =
    [
      edge "e-add2-apply" (pref "add2-function" "value")
        { CG.node_id = node_id "apply-add2"; port_key = CG.Port_key.function_input };
      edge "e-acc-apply" (pref "acc" "value")
        { CG.node_id = node_id "apply-add2"; port_key = CG.Port_key.argument };
      edge "e-apply-result"
        { CG.node_id = node_id "apply-add2"; port_key = CG.Port_key.result }
        (pref "result" "value");
    ]
  in
  let body =
    CG.Raw_graph.of_lists ~nodes ~edges
      ~default_node_order:[ node_id "add2-function"; node_id "apply-add2" ]
    |> validate_graph_with_templates_or_fail [ add2 ]
  in
  CG.Function_template.create ~dependencies:[ CG.Function_template.id add2 ]
    ~id:(template_id id) ~parameter_type:Core_type.Nat
    ~result_type:Core_type.Nat ~captures:[] ~body ()

let multiply_step_template ~outer_id ~inner =
  let inner_arrow = Core_type.Arrow (Core_type.Nat, Core_type.Nat) in
  let nodes =
    [
      node "pred" (CG.Parameter Core_type.Nat);
      node "drop-pred" (CG.Drop Core_type.Nat);
      node "inner-function" (CG.Function (function_signature inner []));
      node "result" (CG.Result inner_arrow);
    ]
  in
  let edges =
    unit_drop_edges "pred" "drop-pred"
    @ [
        edge "e-inner-result" (pref "inner-function" "value")
          (pref "result" "value");
      ]
  in
  let body =
    CG.Raw_graph.of_lists ~nodes ~edges
      ~default_node_order:[ node_id "inner-function"; node_id "drop-pred" ]
    |> validate_graph_with_templates_or_fail [ inner ]
  in
  CG.Function_template.create ~dependencies:[ CG.Function_template.id inner ]
    ~id:(template_id outer_id) ~parameter_type:Core_type.Nat
    ~result_type:inner_arrow ~captures:[] ~body ()

let entry_multiply_template ~id ~multiply_step =
  let nodes =
    [
      node "unit" (CG.Parameter Core_type.Unit);
      node "drop-unit" (CG.Drop Core_type.Unit);
      node "base" (CG.Nat_literal (nat "0"));
      node "count" (CG.Nat_literal (nat "3"));
      node "step-function" (CG.Function (function_signature multiply_step []));
      node "natrec" (CG.NatRec Core_type.Nat);
      node "result" (CG.Result Core_type.Nat);
    ]
  in
  let edges =
    unit_drop_edges "unit" "drop-unit"
    @ [
        edge "e-base-natrec" (pref "base" "value")
          { CG.node_id = node_id "natrec"; port_key = CG.Port_key.base };
        edge "e-step-natrec" (pref "step-function" "value")
          { CG.node_id = node_id "natrec"; port_key = CG.Port_key.step };
        edge "e-count-natrec" (pref "count" "value")
          { CG.node_id = node_id "natrec"; port_key = CG.Port_key.count };
        edge "e-natrec-result"
          { CG.node_id = node_id "natrec"; port_key = CG.Port_key.result }
          (pref "result" "value");
      ]
  in
  let body =
    CG.Raw_graph.of_lists ~nodes ~edges
      ~default_node_order:
        [ node_id "step-function"; node_id "natrec"; node_id "drop-unit" ]
    |> validate_graph_with_templates_or_fail [ multiply_step ]
  in
  CG.Function_template.create
    ~dependencies:[ CG.Function_template.id multiply_step ]
    ~id:(template_id id) ~parameter_type:Core_type.Unit
    ~result_type:Core_type.Nat ~captures:[] ~body ()

let nat_to_nat = Core_type.Arrow (Core_type.Nat, Core_type.Nat)

let higher_identity_template ~id =
  let nodes =
    [
      node "value" (CG.Parameter Core_type.Nat);
      node "result" (CG.Result Core_type.Nat);
    ]
  in
  let edges =
    [ edge "e-value-result" (pref "value" "value") (pref "result" "value") ]
  in
  let body = CG.Raw_graph.of_lists ~nodes ~edges ~default_node_order:[] |> validate_graph_or_fail in
  CG.Function_template.create ~id:(template_id id) ~parameter_type:Core_type.Nat
    ~result_type:Core_type.Nat ~captures:[] ~body ()

let higher_wrapper_template ~id =
  let previous = { CG.key = CG.Port_key.capture "previous"; typ = nat_to_nat } in
  let nodes =
    [
      node "value" (CG.Parameter Core_type.Nat);
      node "previous" (CG.Capture previous);
      node "apply-previous"
        (CG.Apply { apply_parameter_type = Core_type.Nat; apply_result_type = Core_type.Nat });
      node "succ" CG.Succ;
      node "result" (CG.Result Core_type.Nat);
    ]
  in
  let edges =
    [
      edge "e-previous-apply" (pref "previous" "value")
        { CG.node_id = node_id "apply-previous"; port_key = CG.Port_key.function_input };
      edge "e-value-apply" (pref "value" "value")
        { CG.node_id = node_id "apply-previous"; port_key = CG.Port_key.argument };
      edge "e-apply-succ"
        { CG.node_id = node_id "apply-previous"; port_key = CG.Port_key.result }
        (pref "succ" "input");
      edge "e-succ-result" (pref "succ" "result") (pref "result" "value");
    ]
  in
  let body =
    CG.Raw_graph.of_lists ~nodes ~edges
      ~default_node_order:[ node_id "apply-previous"; node_id "succ" ]
    |> validate_graph_or_fail
  in
  CG.Function_template.create ~id:(template_id id) ~parameter_type:Core_type.Nat
    ~result_type:Core_type.Nat ~captures:[ previous ] ~body ()

let higher_partial_template ~id ~wrapper =
  let wrapper_capture = { CG.key = CG.Port_key.capture "previous"; typ = nat_to_nat } in
  let nodes =
    [
      node "accumulated" (CG.Parameter nat_to_nat);
      node "wrapper-function"
        (CG.Function (function_signature wrapper [ wrapper_capture ]));
      node "result" (CG.Result nat_to_nat);
    ]
  in
  let edges =
    [
      edge "e-accumulated-wrapper" (pref "accumulated" "value")
        { CG.node_id = node_id "wrapper-function"; port_key = wrapper_capture.key };
      edge "e-wrapper-result" (pref "wrapper-function" "value")
        (pref "result" "value");
    ]
  in
  let body =
    CG.Raw_graph.of_lists ~nodes ~edges
      ~default_node_order:[ node_id "wrapper-function" ]
    |> validate_graph_with_templates_or_fail [ wrapper ]
  in
  CG.Function_template.create ~dependencies:[ CG.Function_template.id wrapper ]
    ~id:(template_id id) ~parameter_type:nat_to_nat ~result_type:nat_to_nat
    ~captures:[] ~body ()

let higher_step_template ~id ~partial =
  let partial_arrow = Core_type.Arrow (nat_to_nat, nat_to_nat) in
  let nodes =
    [
      node "predecessor" (CG.Parameter Core_type.Nat);
      node "drop-predecessor" (CG.Drop Core_type.Nat);
      node "partial-function" (CG.Function (function_signature partial []));
      node "result" (CG.Result partial_arrow);
    ]
  in
  let edges =
    unit_drop_edges "predecessor" "drop-predecessor"
    @ [
        edge "e-partial-result" (pref "partial-function" "value")
          (pref "result" "value");
      ]
  in
  let body =
    CG.Raw_graph.of_lists ~nodes ~edges
      ~default_node_order:[ node_id "partial-function"; node_id "drop-predecessor" ]
    |> validate_graph_with_templates_or_fail [ partial ]
  in
  CG.Function_template.create ~dependencies:[ CG.Function_template.id partial ]
    ~id:(template_id id) ~parameter_type:Core_type.Nat ~result_type:partial_arrow
    ~captures:[] ~body ()

let higher_order_templates () =
  let identity = higher_identity_template ~id:"example-higher-identity" in
  let wrapper = higher_wrapper_template ~id:"example-higher-wrapper" in
  let partial =
    higher_partial_template ~id:"example-higher-partial" ~wrapper
  in
  let step = higher_step_template ~id:"example-higher-step" ~partial in
  (identity, wrapper, partial, step)

let entry_higher_function_template ~id ~identity ~step =
  let count_capture = { CG.key = CG.Port_key.capture "count"; typ = Core_type.Nat } in
  let nodes =
    [
      node "unit" (CG.Parameter Core_type.Unit);
      node "drop-unit" (CG.Drop Core_type.Unit);
      node "count" (CG.Capture count_capture);
      node "base-function" (CG.Function (function_signature identity []));
      node "step-function" (CG.Function (function_signature step []));
      node "natrec" (CG.NatRec nat_to_nat);
      node "result" (CG.Result nat_to_nat);
    ]
  in
  let edges =
    unit_drop_edges "unit" "drop-unit"
    @ [
        edge "e-base-natrec" (pref "base-function" "value")
          { CG.node_id = node_id "natrec"; port_key = CG.Port_key.base };
        edge "e-step-natrec" (pref "step-function" "value")
          { CG.node_id = node_id "natrec"; port_key = CG.Port_key.step };
        edge "e-count-natrec" (pref "count" "value")
          { CG.node_id = node_id "natrec"; port_key = CG.Port_key.count };
        edge "e-natrec-result"
          { CG.node_id = node_id "natrec"; port_key = CG.Port_key.result }
          (pref "result" "value");
      ]
  in
  let body =
    CG.Raw_graph.of_lists ~nodes ~edges
      ~default_node_order:
        [ node_id "base-function"; node_id "step-function"; node_id "natrec"; node_id "drop-unit" ]
    |> validate_graph_with_templates_or_fail [ identity; step ]
  in
  CG.Function_template.create
    ~dependencies:[ CG.Function_template.id identity; CG.Function_template.id step ]
    ~id:(template_id id) ~parameter_type:Core_type.Unit ~result_type:nat_to_nat
    ~captures:[ count_capture ] ~body ()

let entry_higher_apply_template ~id ~identity ~step =
  let count_capture = { CG.key = CG.Port_key.capture "count"; typ = Core_type.Nat } in
  let input_capture = { CG.key = CG.Port_key.capture "input"; typ = Core_type.Nat } in
  let nodes =
    [
      node "unit" (CG.Parameter Core_type.Unit);
      node "drop-unit" (CG.Drop Core_type.Unit);
      node "count" (CG.Capture count_capture);
      node "input" (CG.Capture input_capture);
      node "base-function" (CG.Function (function_signature identity []));
      node "step-function" (CG.Function (function_signature step []));
      node "natrec" (CG.NatRec nat_to_nat);
      node "apply-generated"
        (CG.Apply { apply_parameter_type = Core_type.Nat; apply_result_type = Core_type.Nat });
      node "result" (CG.Result Core_type.Nat);
    ]
  in
  let edges =
    unit_drop_edges "unit" "drop-unit"
    @ [
        edge "e-base-natrec" (pref "base-function" "value")
          { CG.node_id = node_id "natrec"; port_key = CG.Port_key.base };
        edge "e-step-natrec" (pref "step-function" "value")
          { CG.node_id = node_id "natrec"; port_key = CG.Port_key.step };
        edge "e-count-natrec" (pref "count" "value")
          { CG.node_id = node_id "natrec"; port_key = CG.Port_key.count };
        edge "e-natrec-apply"
          { CG.node_id = node_id "natrec"; port_key = CG.Port_key.result }
          { CG.node_id = node_id "apply-generated"; port_key = CG.Port_key.function_input };
        edge "e-input-apply" (pref "input" "value")
          { CG.node_id = node_id "apply-generated"; port_key = CG.Port_key.argument };
        edge "e-apply-result"
          { CG.node_id = node_id "apply-generated"; port_key = CG.Port_key.result }
          (pref "result" "value");
      ]
  in
  let body =
    CG.Raw_graph.of_lists ~nodes ~edges
      ~default_node_order:
        [
          node_id "base-function";
          node_id "step-function";
          node_id "natrec";
          node_id "apply-generated";
          node_id "drop-unit";
        ]
    |> validate_graph_with_templates_or_fail [ identity; step ]
  in
  CG.Function_template.create
    ~dependencies:[ CG.Function_template.id identity; CG.Function_template.id step ]
    ~id:(template_id id) ~parameter_type:Core_type.Unit ~result_type:Core_type.Nat
    ~captures:[ count_capture; input_capture ] ~body ()

let higher_order_package ~entry ~templates ~result_type ~count ?input () =
  let count_literal = literal_id "count" in
  let literals =
    [ { id = count_literal; payload = Runtime_value.Nat (nat count) } ]
  in
  let entry_captures =
    [ { capture_key = CG.Port_key.capture "count"; literal_id = count_literal } ]
  in
  let literals, entry_captures =
    match input with
    | None -> (literals, entry_captures)
    | Some input ->
        let input_literal = literal_id "input" in
        ( literals @ [ { id = input_literal; payload = Runtime_value.Nat (nat input) } ],
          entry_captures
          @ [
              {
                capture_key = CG.Port_key.capture "input";
                literal_id = input_literal;
              };
            ] )
  in
  Raw.create ~templates:(entry :: templates)
    ~entry_template_id:(CG.Function_template.id entry) ~result_type ~literals
    ~entry_captures ()
  |> validate_or_fail

module Examples = struct
  let add () =
    let succ_inner, succ_outer =
      natrec_succ_step_template ~outer_id:"example-add-step"
        ~inner_id:"example-add-step-inner"
    in
    let entry = entry_add_template ~id:"example-add-entry" ~step_outer:succ_outer in
    Raw.create ~templates:[ entry; succ_outer; succ_inner ]
      ~entry_template_id:(CG.Function_template.id entry) ~result_type:Core_type.Nat
      ()
    |> validate_or_fail

  let multiply () =
    let succ_inner, succ_outer =
      natrec_succ_step_template ~outer_id:"example-multiply-add-step"
        ~inner_id:"example-multiply-add-step-inner"
    in
    let add2 = add2_template ~id:"example-add2" ~step_outer:succ_outer in
    let mult_inner =
      multiply_inner_template ~id:"example-multiply-step-inner" ~add2
    in
    let mult_outer =
      multiply_step_template ~outer_id:"example-multiply-step" ~inner:mult_inner
    in
    let entry =
      entry_multiply_template ~id:"example-multiply-entry"
        ~multiply_step:mult_outer
    in
    Raw.create
      ~templates:[ entry; mult_outer; mult_inner; add2; succ_outer; succ_inner ]
      ~entry_template_id:(CG.Function_template.id entry) ~result_type:Core_type.Nat
      ()
    |> validate_or_fail

  let higher_order_function ?(count = "3") () =
    let identity, wrapper, partial, step = higher_order_templates () in
    let entry =
      entry_higher_function_template ~id:"example-higher-function-entry"
        ~identity ~step
    in
    higher_order_package ~entry ~templates:[ step; partial; wrapper; identity ]
      ~result_type:nat_to_nat ~count ()

  let higher_order_apply ?(count = "3") ?(input = "2") () =
    let identity, wrapper, partial, step = higher_order_templates () in
    let entry =
      entry_higher_apply_template ~id:"example-higher-apply-entry" ~identity
        ~step
    in
    higher_order_package ~entry ~templates:[ step; partial; wrapper; identity ]
      ~result_type:Core_type.Nat ~count ~input ()
end
