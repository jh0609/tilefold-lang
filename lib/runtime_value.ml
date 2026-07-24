module Value_id = struct
  type t = string

  let equal = String.equal
  let compare = String.compare
  let to_string value = value
end

type origin =
  | Execution_input
  | Program_literal of Core_graph.Node_id.t
  | Instance_literal of {
      instance_id : string;
      node_id : Core_graph.Node_id.t;
    }
  | Rewrite_output of {
      event_index : int;
      node_id : Core_graph.Node_id.t;
      port_key : Core_graph.Port_key.t;
    }
  | Scoped_rewrite_output of {
      event_index : int;
      instance_id : string;
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

let program_literal_id node_id =
  "literal:" ^ Core_graph.Node_id.to_string node_id

let instance_literal_id instance_id node_id =
  "instance:" ^ instance_id ^ ":literal:" ^ Core_graph.Node_id.to_string node_id

let rewrite_output_id event_index node_id port_key =
  "event:" ^ string_of_int event_index ^ ":"
  ^ Core_graph.Node_id.to_string node_id
  ^ ":" ^ Core_graph.Port_key.to_string port_key

let scoped_rewrite_output_id event_index instance_id node_id port_key =
  "event:" ^ string_of_int event_index ^ ":instance:" ^ instance_id ^ ":"
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
  | Program_literal node_id ->
      "Program_literal(" ^ Core_graph.Node_id.to_string node_id ^ ")"
  | Instance_literal { instance_id; node_id } ->
      "Instance_literal(instance=" ^ instance_id ^ ", node="
      ^ Core_graph.Node_id.to_string node_id ^ ")"
  | Rewrite_output { event_index; node_id; port_key } ->
      "Rewrite_output(event=" ^ string_of_int event_index ^ ", node="
      ^ Core_graph.Node_id.to_string node_id
      ^ ", port=" ^ Core_graph.Port_key.to_string port_key ^ ")"
  | Scoped_rewrite_output { event_index; instance_id; node_id; port_key } ->
      "Scoped_rewrite_output(event=" ^ string_of_int event_index
      ^ ", instance=" ^ instance_id ^ ", node="
      ^ Core_graph.Node_id.to_string node_id
      ^ ", port=" ^ Core_graph.Port_key.to_string port_key ^ ")"

let to_string value =
  Value_id.to_string value.id ^ ":" ^ payload_to_string value.payload ^ "@"
  ^ origin_to_string value.origin
