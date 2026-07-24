type rule =
  | Succ
  | Drop
  | Copy
  | Function
  | ApplyEnter
  | ApplyReturn

type t = {
  index : int;
  rule : rule;
  instance_id : Runtime_value.Instance_id.t;
  subject : Core_graph.Node_id.t;
  ready_epoch : int;
  consumed : Runtime_value.Value_id.t list;
  created : Runtime_value.t list;
  callee_instance_id : Runtime_value.Instance_id.t option;
}

val rule_to_string : rule -> string
val to_string : t -> string
