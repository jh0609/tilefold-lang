module P = Project_document

let strings values = `List (List.map (fun value -> `String value) values)

let error stage messages =
  `Assoc
    [
      ("status", `String "error");
      ("stage", `String stage);
      ("messages", strings messages);
    ]

let result_value value =
  match Runtime_value.payload value with
  | Unit -> "Unit"
  | Nat nat -> "Nat(" ^ Nat.to_string nat ^ ")"
  | Closure closure ->
      "Closure("
      ^ Core_graph.Function_template_id.to_string closure.template_id
      ^ ")"

let trace_event (event : Rewrite_event.t) =
  `Assoc
    [
      ("index", `Int event.index);
      ("rule", `String (Rewrite_event.rule_to_string event.rule));
      ("subject", `String (Core_graph.Node_id.to_string event.subject));
    ]

let execute document =
  match P.infer_symbolic document with
  | Error (`Validation errors) ->
      error "validation" (List.map P.Validation_error.to_string errors)
  | Error (`Conversion errors) ->
      error "conversion" (List.map P.Conversion_error.to_string errors)
  | Error (`Geometry errors) ->
      error "geometry" (List.map Surface_geometry.render_validation_error errors)
  | Error (`Inference errors) ->
      error "inference" (List.map Surface_geometry.render_inference_error errors)
  | Ok symbolic ->
      let package = Surface_symbolic.lower_to_program_package symbolic in
      (match Program_package.run_completed package with
      | Ok { value; trace; _ } ->
          `Assoc
            [
              ("status", `String "completed");
              ("result", `String (result_value value));
              ("rewriteCount", `Int (List.length trace));
              ("trace", `List (List.map trace_event trace));
            ]
      | Error (Stuck { reason; _ }) ->
          error "execution"
            [
              "Execution stuck in "
              ^ Runtime_value.Instance_id.to_string reason.instance_id;
            ]
      | Error (Run_error { error = execution_error; _ }) ->
          error "execution"
            [ Program_package.execution_error_to_string execution_error ]
      | Error (Step_limit_exceeded { executed_steps; limit; _ }) ->
          error "execution"
            [
              Printf.sprintf "Step limit exceeded: executed=%s limit=%s"
                (Nat.to_string executed_steps) (Nat.to_string limit);
            ]
      | Error (Completed _) ->
          error "execution" [ "Unexpected completed execution result" ])

let run_json project_json =
  let response =
    match P.decode_json project_json with
    | Error decode_error ->
        error "decode" [ P.Decode_error.to_string decode_error ]
    | Ok document -> execute document
  in
  Yojson.Safe.to_string response
