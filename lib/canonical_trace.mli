val semantics_profile : string

val render_completed :
  Engine.Machine.t -> Runtime_value.t -> string

val render_core_validation_errors :
  Core_graph.validation_error list -> string

val render_package_validation_errors :
  Program_package.validation_error list -> string
