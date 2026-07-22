module Value_id = struct
  type t = string

  let equal = String.equal
  let compare = String.compare
  let to_string value = value
end

type payload =
  | Unit
  | Nat of Nat.t

type origin =
  | Execution_input
  | Program_literal of Core_graph.Node_id.t
  | Rewrite_output of {
      event_index : int;
      node_id : Core_graph.Node_id.t;
      port_key : Core_graph.Port_key.t;
    }

type t = {
  id : Value_id.t;
  payload : payload;
  origin : origin;
}

let create ~id ~payload ~origin = { id; payload; origin }
let execution_input_id = "input"

let program_literal_id node_id =
  "literal:" ^ Core_graph.Node_id.to_string node_id

let rewrite_output_id event_index node_id port_key =
  "event:" ^ string_of_int event_index ^ ":"
  ^ Core_graph.Node_id.to_string node_id
  ^ ":" ^ Core_graph.Port_key.to_string port_key

let id value = value.id
let payload value = value.payload
let origin value = value.origin

let payload_type = function
  | Unit -> Core_type.Unit
  | Nat _ -> Core_type.Nat

let typ value = payload_type value.payload

let payload_equal left right =
  match (left, right) with
  | Unit, Unit -> true
  | Nat left, Nat right -> Nat.equal left right
  | _ -> false

let equal left right =
  Value_id.equal left.id right.id
  && payload_equal left.payload right.payload
  && left.origin = right.origin

let payload_to_string = function
  | Unit -> "Unit"
  | Nat value -> "Nat(" ^ Nat.to_string value ^ ")"

let origin_to_string = function
  | Execution_input -> "Execution_input"
  | Program_literal node_id ->
      "Program_literal(" ^ Core_graph.Node_id.to_string node_id ^ ")"
  | Rewrite_output { event_index; node_id; port_key } ->
      "Rewrite_output(event=" ^ string_of_int event_index ^ ", node="
      ^ Core_graph.Node_id.to_string node_id
      ^ ", port=" ^ Core_graph.Port_key.to_string port_key ^ ")"

let to_string value =
  Value_id.to_string value.id ^ ":" ^ payload_to_string value.payload ^ "@"
  ^ origin_to_string value.origin
