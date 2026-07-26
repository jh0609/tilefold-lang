module P = Tilefold.Project_document

let read_stdin () =
  let buffer = Buffer.create 4096 in
  (try
     while true do
       Buffer.add_string buffer (input_line stdin);
       Buffer.add_char buffer '\n'
     done
   with End_of_file -> ());
  Buffer.contents buffer

let strings values = `List (List.map (fun value -> `String value) values)

let error stage messages =
  `Assoc
    [
      ("status", `String "error");
      ("stage", `String stage);
      ("messages", strings messages);
    ]

let result_value value =
  match Tilefold.Runtime_value.payload value with
  | Unit -> "Unit"
  | Nat nat -> "Nat(" ^ Tilefold.Nat.to_string nat ^ ")"
  | Closure closure ->
      "Closure("
      ^ Tilefold.Core_graph.Function_template_id.to_string closure.template_id
      ^ ")"

let trace_event (event : Tilefold.Rewrite_event.t) =
  `Assoc
    [
      ("index", `Int event.index);
      ("rule", `String (Tilefold.Rewrite_event.rule_to_string event.rule));
      ("subject", `String (Tilefold.Core_graph.Node_id.to_string event.subject));
    ]

let run document =
  match P.infer_symbolic document with
  | Error (`Validation errors) ->
      error "validation" (List.map P.Validation_error.to_string errors)
  | Error (`Conversion errors) ->
      error "conversion" (List.map P.Conversion_error.to_string errors)
  | Error (`Geometry errors) ->
      error "geometry"
        (List.map Tilefold.Surface_geometry.render_validation_error errors)
  | Error (`Inference errors) ->
      error "inference"
        (List.map Tilefold.Surface_geometry.render_inference_error errors)
  | Ok symbolic ->
      let package = Tilefold.Surface_symbolic.lower_to_program_package symbolic in
      (match Tilefold.Program_package.run_completed package with
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
              ^ Tilefold.Runtime_value.Instance_id.to_string reason.instance_id;
            ]
      | Error (Run_error { error = execution_error; _ }) ->
          error "execution"
            [
              Tilefold.Program_package.execution_error_to_string execution_error;
            ]
      | Error (Step_limit_exceeded { executed_steps; limit; _ }) ->
          error "execution"
            [
              Printf.sprintf "Step limit exceeded: executed=%s limit=%s"
                (Tilefold.Nat.to_string executed_steps)
                (Tilefold.Nat.to_string limit);
            ]
      | Error (Completed _) ->
          error "execution" [ "Unexpected completed execution result" ])

let () =
  let response =
    match P.decode_json (read_stdin ()) with
    | Error decode_error ->
        error "decode" [ P.Decode_error.to_string decode_error ]
    | Ok document -> run document
  in
  Yojson.Safe.to_channel stdout response;
  output_char stdout '\n'
