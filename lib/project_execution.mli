(** Diagnostic Project JSON execution boundary shared by native and browser
    runners. The JSON result is an editor transport, not a stable public trace
    serialization format. *)

val run_json : string -> string
val run_json_with_mode : string -> mode:string -> string
