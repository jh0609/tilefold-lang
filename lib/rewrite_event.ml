type rule =
  | Succ
  | Drop
  | Copy
  | Function
  | ApplyEnter
  | ApplyReturn
  | NatRecZero
  | NatRecStart
  | NatRecUnfold
  | NatRecStepFunctionEnter
  | NatRecStepFunctionReturn
  | NatRecStepAccumulatorEnter
  | NatRecStepAccumulatorReturn
  | NatRecComplete

type t = {
  index : int;
  rule : rule;
  instance_id : Runtime_value.Instance_id.t;
  subject : Core_graph.Node_id.t;
  ready_epoch : int;
  used : Runtime_value.Value_id.t list;
  consumed : Runtime_value.Value_id.t list;
  created : Runtime_value.t list;
  callee_instance_id : Runtime_value.Instance_id.t option;
}

let rule_to_string = function
  | Succ -> "Succ"
  | Drop -> "Drop"
  | Copy -> "Copy"
  | Function -> "Function"
  | ApplyEnter -> "ApplyEnter"
  | ApplyReturn -> "ApplyReturn"
  | NatRecZero -> "NatRecZero"
  | NatRecStart -> "NatRecStart"
  | NatRecUnfold -> "NatRecUnfold"
  | NatRecStepFunctionEnter -> "NatRecStepFunctionEnter"
  | NatRecStepFunctionReturn -> "NatRecStepFunctionReturn"
  | NatRecStepAccumulatorEnter -> "NatRecStepAccumulatorEnter"
  | NatRecStepAccumulatorReturn -> "NatRecStepAccumulatorReturn"
  | NatRecComplete -> "NatRecComplete"

let render_ids ids =
  ids |> List.map Runtime_value.Value_id.to_string |> String.concat ","

let render_values values =
  values
  |> List.map (fun value ->
         Runtime_value.Value_id.to_string (Runtime_value.id value))
  |> String.concat ","

let to_string event =
  "event " ^ string_of_int event.index ^ " " ^ rule_to_string event.rule
  ^ " instance=" ^ Runtime_value.Instance_id.to_string event.instance_id
  ^ " subject="
  ^ Core_graph.Node_id.to_string event.subject
  ^ " ready_epoch=" ^ string_of_int event.ready_epoch
  ^ " used=[" ^ render_ids event.used ^ "] consumed=["
  ^ render_ids event.consumed ^ "] created=[" ^ render_values event.created ^ "]"
  ^
  match event.callee_instance_id with
  | None -> ""
  | Some callee -> " callee=" ^ Runtime_value.Instance_id.to_string callee
