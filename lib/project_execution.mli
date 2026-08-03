(** Diagnostic Project JSON execution boundary shared by native and browser
    runners. The JSON result is an editor transport, not a stable public trace
    serialization format. *)

val run_json : string -> string
val run_json_with_mode : string -> mode:string -> string
val start_trace_session_json : string -> string
val trace_session_next_json : session_id:int -> batch_size:int -> string
val dispose_trace_session : session_id:int -> unit
