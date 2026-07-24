module Value_id = struct
  type t = string

  let equal = String.equal
  let compare = String.compare
  let to_string value = value
end

module Instance_id = struct
  type t =
    | Root
    | Call of {
        parent : t;
        apply_node : Core_graph.Node_id.t;
        call_index : int;
      }

  let root = Root
  let call ~parent ~apply_node ~call_index = Call { parent; apply_node; call_index }

  let rec equal left right =
    match (left, right) with
    | Root, Root -> true
    | ( Call
          { parent = left_parent; apply_node = left_apply; call_index = left_index },
        Call
          { parent = right_parent; apply_node = right_apply; call_index = right_index }
      ) ->
        equal left_parent right_parent
        && Core_graph.Node_id.equal left_apply right_apply
        && left_index = right_index
    | _ -> false

  let rec to_string = function
    | Root -> "Root"
    | Call { parent; apply_node; call_index } ->
        "Call(" ^ to_string parent ^ ","
        ^ Core_graph.Node_id.to_string apply_node
        ^ "," ^ string_of_int call_index ^ ")"

  let compare left right = String.compare (to_string left) (to_string right)
end

type origin =
  | Execution_input
  | Literal of {
      instance_id : Instance_id.t;
      node_id : Core_graph.Node_id.t;
    }
  | Rewrite_output of {
      instance_id : Instance_id.t;
      event_index : int;
      node_id : Core_graph.Node_id.t;
      port_key : Core_graph.Port_key.t;
    }

type t = {
  id : Value_id.t;
  payload : payload;
  origin : origin;
}

and captured_value = {
  capture_key : Core_graph.Port_key.t;
  value : t;
}

and closure = {
  template_id : Core_graph.Function_template_id.t;
  parameter_type : Core_type.t;
  result_type : Core_type.t;
  captures : captured_value list;
}

and payload =
  | Unit
  | Nat of Nat.t
  | Closure of closure

let create ~id ~payload ~origin = { id; payload; origin }
let execution_input_id = "input"

let literal_id instance_id node_id =
  "literal:" ^ Instance_id.to_string instance_id ^ ":"
  ^ Core_graph.Node_id.to_string node_id

let rewrite_output_id instance_id event_index node_id port_key =
  "event:" ^ string_of_int event_index ^ ":" ^ Instance_id.to_string instance_id
  ^ ":"
  ^ Core_graph.Node_id.to_string node_id
  ^ ":" ^ Core_graph.Port_key.to_string port_key

let id value = value.id
let payload value = value.payload
let origin value = value.origin

let payload_type = function
  | Unit -> Core_type.Unit
  | Nat _ -> Core_type.Nat
  | Closure closure -> Core_type.Arrow (closure.parameter_type, closure.result_type)

let typ value = payload_type value.payload

let rec payload_equal left right =
  match (left, right) with
  | Unit, Unit -> true
  | Nat left, Nat right -> Nat.equal left right
  | Closure left, Closure right -> closure_equal left right
  | _ -> false

and closure_equal left right =
  Core_graph.Function_template_id.equal left.template_id right.template_id
  && Core_type.equal left.parameter_type right.parameter_type
  && Core_type.equal left.result_type right.result_type
  && List.length left.captures = List.length right.captures
  && List.for_all2
       (fun left_capture right_capture ->
         Core_graph.Port_key.equal left_capture.capture_key
           right_capture.capture_key
         && equal left_capture.value right_capture.value)
       left.captures right.captures

and equal left right =
  Value_id.equal left.id right.id
  && payload_equal left.payload right.payload
  && left.origin = right.origin

let payload_to_string = function
  | Unit -> "Unit"
  | Nat value -> "Nat(" ^ Nat.to_string value ^ ")"
  | Closure closure ->
      "Closure("
      ^ Core_graph.Function_template_id.to_string closure.template_id
      ^ ", captures=["
      ^ String.concat ", "
          (List.map
             (fun captured ->
               Core_graph.Port_key.to_string captured.capture_key ^ "="
               ^ Value_id.to_string (id captured.value))
             closure.captures)
      ^ "])"

let origin_to_string = function
  | Execution_input -> "Execution_input"
  | Literal { instance_id; node_id } ->
      "Literal(instance=" ^ Instance_id.to_string instance_id ^ ", node="
      ^ Core_graph.Node_id.to_string node_id ^ ")"
  | Rewrite_output { instance_id; event_index; node_id; port_key } ->
      "Rewrite_output(event=" ^ string_of_int event_index ^ ", node="
      ^ Core_graph.Node_id.to_string node_id
      ^ ", instance=" ^ Instance_id.to_string instance_id
      ^ ", port=" ^ Core_graph.Port_key.to_string port_key ^ ")"

let to_string value =
  Value_id.to_string value.id ^ ":" ^ payload_to_string value.payload ^ "@"
  ^ origin_to_string value.origin
