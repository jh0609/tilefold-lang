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

let rule_to_string = function
  | Succ -> "Succ"
  | Drop -> "Drop"
  | Copy -> "Copy"
  | Function -> "Function"

let to_string event =
  "event " ^ string_of_int event.index ^ " " ^ rule_to_string event.rule
  ^ " subject=" ^ Core_graph.Node_id.to_string event.subject
  ^ " ready_epoch=" ^ string_of_int event.ready_epoch
