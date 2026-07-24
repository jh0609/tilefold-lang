type rule =
  | Succ
  | Drop
  | Copy
  | Function

type t = {
  index : int;
  rule : rule;
  subject : Core_graph.Node_id.t;
  ready_epoch : int;
  consumed : Runtime_value.Value_id.t list;
  created : Runtime_value.t list;
}

val rule_to_string : rule -> string
val to_string : t -> string
