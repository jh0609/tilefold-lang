open Js_of_ocaml

let () =
  Js.export "TilefoldRunner"
    (object%js
       method runProjectJson project_json =
         project_json |> Js.to_string |> Tilefold.Project_execution.run_json
         |> Js.string

       method runProjectJsonWithMode project_json mode =
         Tilefold.Project_execution.run_json_with_mode
           (Js.to_string project_json) ~mode:(Js.to_string mode)
         |> Js.string

       method startTraceProjectJson project_json =
         Tilefold.Project_execution.start_trace_session_json
           (Js.to_string project_json)
         |> Js.string

       method traceProjectJsonNext session_id batch_size =
         Tilefold.Project_execution.trace_session_next_json
           ~session_id:(int_of_float (Js.float_of_number session_id))
           ~batch_size:(int_of_float (Js.float_of_number batch_size))
         |> Js.string

       method disposeTraceSession session_id =
         Tilefold.Project_execution.dispose_trace_session
           ~session_id:(int_of_float (Js.float_of_number session_id))
    end)
