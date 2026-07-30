(** Immutable Tilefold Standard Library definitions.

    These functions are ordinary Core function templates. They are not Core
    primitives; the editor and runners may reference them by stable library IDs
    without copying their definitions into every project document. *)

type function_id =
  | Add
  | Multiply
  | Double
  | Square
  | Pred
  | Subtract
  | IsZero
  | Not
  | And
  | Or
  | Equal
  | LessThan
  | LessOrEqual
  | Min
  | Max
  | Divide
  | Modulo

type function_info = {
  id : function_id;
  stable_id : string;
  display_name : string;
  version : string;
  parameter_type : Core_type.t;
  result_type : Core_type.t;
}

val namespace : string
val version : string
val functions : function_info list
val exposed_templates : Core_graph.Function_template.t list
val all_templates : Core_graph.Function_template.t list
val is_standard_template_id : Core_graph.Function_template_id.t -> bool
val find_function : string -> function_info option
val function_template_id : function_id -> Core_graph.Function_template_id.t

val arity : function_id -> int
val id_of_template_id : Core_graph.Function_template_id.t -> function_id option
val evaluate_nat : function_id -> Nat.t list -> (Nat.t, string) result
val evaluate : function_id -> Runtime_value.payload list -> (Runtime_value.payload, string) result
