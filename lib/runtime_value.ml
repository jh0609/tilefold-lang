module Value_id = struct
  type t = string

  let equal = String.equal
  let compare = String.compare
  let to_string value = value
end

module Instance_id = struct
  type call_site =
    | Apply_node of Core_graph.Node_id.t
    | Case_branch of {
        node_id : Core_graph.Node_id.t;
        branch : [ `Left | `Right ];
      }
    | NatRec_step_function of {
        node_id : Core_graph.Node_id.t;
        iteration : Nat.t;
      }
    | NatRec_step_accumulator of {
        node_id : Core_graph.Node_id.t;
        iteration : Nat.t;
      }
    | ListRec_step of {
        node_id : Core_graph.Node_id.t;
        index : int;
      }

  type t =
    | Root
    | Call of {
        parent : t;
        call_site : call_site;
        call_index : int;
      }

  let root = Root
  let call_at ~parent ~call_site ~call_index = Call { parent; call_site; call_index }
  let call ~parent ~apply_node ~call_index =
    call_at ~parent ~call_site:(Apply_node apply_node) ~call_index

  let call_site_equal left right =
    match (left, right) with
    | Apply_node left, Apply_node right -> Core_graph.Node_id.equal left right
    | ( Case_branch { node_id = left_node; branch = left_branch },
        Case_branch { node_id = right_node; branch = right_branch } ) ->
        Core_graph.Node_id.equal left_node right_node && left_branch = right_branch
    | ( NatRec_step_function { node_id = left_node; iteration = left_iteration },
        NatRec_step_function { node_id = right_node; iteration = right_iteration } )
    | ( NatRec_step_accumulator { node_id = left_node; iteration = left_iteration },
        NatRec_step_accumulator { node_id = right_node; iteration = right_iteration } ) ->
        Core_graph.Node_id.equal left_node right_node
        && Nat.equal left_iteration right_iteration
    | ( ListRec_step { node_id = left_node; index = left_index },
        ListRec_step { node_id = right_node; index = right_index } ) ->
        Core_graph.Node_id.equal left_node right_node && left_index = right_index
    | _ -> false

  let call_site_to_string = function
    | Apply_node node_id -> "Apply(" ^ Core_graph.Node_id.to_string node_id ^ ")"
    | Case_branch { node_id; branch } ->
        "Case("
        ^ Core_graph.Node_id.to_string node_id
        ^ ","
        ^ (match branch with `Left -> "Left" | `Right -> "Right")
        ^ ")"
    | NatRec_step_function { node_id; iteration } ->
        "NatRecStepFunction(" ^ Core_graph.Node_id.to_string node_id ^ ","
        ^ Nat.to_string iteration ^ ")"
    | NatRec_step_accumulator { node_id; iteration } ->
        "NatRecStepAccumulator(" ^ Core_graph.Node_id.to_string node_id ^ ","
        ^ Nat.to_string iteration ^ ")"
    | ListRec_step { node_id; index } ->
        "ListRecStep(" ^ Core_graph.Node_id.to_string node_id ^ ","
        ^ string_of_int index ^ ")"

  let rec equal left right =
    match (left, right) with
    | Root, Root -> true
    | ( Call
          { parent = left_parent; call_site = left_site; call_index = left_index },
        Call
          { parent = right_parent; call_site = right_site; call_index = right_index }
      ) ->
        equal left_parent right_parent
        && call_site_equal left_site right_site
        && left_index = right_index
    | _ -> false

  let rec to_string = function
    | Root -> "Root"
    | Call { parent; call_site; call_index } ->
        "Call(" ^ to_string parent ^ ","
        ^ call_site_to_string call_site ^ "," ^ string_of_int call_index ^ ")"

  let compare left right = String.compare (to_string left) (to_string right)
end

type origin =
  | Execution_input
  | Program_literal of string
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
  | Bool of bool
  | Nat of Nat.t
  | Product of payload * payload
  | Left of payload * Core_type.t
  | Right of Core_type.t * payload
  | List of Core_type.t * payload list
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

let rec payload_type = function
  | Unit -> Core_type.Unit
  | Bool _ -> Core_type.Bool
  | Nat _ -> Core_type.Nat
  | Product (left, right) ->
      Core_type.Product (payload_type left, payload_type right)
  | Left (payload, right_type) -> Core_type.Sum (payload_type payload, right_type)
  | Right (left_type, payload) -> Core_type.Sum (left_type, payload_type payload)
  | List (item_type, _items) -> Core_type.List item_type
  | Closure closure -> Core_type.Arrow (closure.parameter_type, closure.result_type)

let typ value = payload_type value.payload

let rec payload_equal left right =
  match (left, right) with
  | Unit, Unit -> true
  | Bool left, Bool right -> Bool.equal left right
  | Nat left, Nat right -> Nat.equal left right
  | Product (left_a, left_b), Product (right_a, right_b) ->
      payload_equal left_a right_a && payload_equal left_b right_b
  | Left (left_payload, left_right_type), Left (right_payload, right_right_type) ->
      payload_equal left_payload right_payload
      && Core_type.equal left_right_type right_right_type
  | Right (left_left_type, left_payload), Right (right_left_type, right_payload) ->
      Core_type.equal left_left_type right_left_type
      && payload_equal left_payload right_payload
  | List (left_type, left_items), List (right_type, right_items) ->
      Core_type.equal left_type right_type
      && List.length left_items = List.length right_items
      && List.for_all2 payload_equal left_items right_items
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

let rec payload_to_string = function
  | Unit -> "Unit"
  | Bool value -> if value then "Bool(True)" else "Bool(False)"
  | Nat value -> "Nat(" ^ Nat.to_string value ^ ")"
  | Product (left, right) ->
      "Product(" ^ payload_to_string left ^ ", " ^ payload_to_string right ^ ")"
  | Left (payload, _) -> "Left(" ^ payload_to_string payload ^ ")"
  | Right (_, payload) -> "Right(" ^ payload_to_string payload ^ ")"
  | List (_item_type, items) ->
      "List[" ^ String.concat ", " (List.map payload_to_string items) ^ "]"
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
  | Program_literal id -> "Program_literal(" ^ id ^ ")"
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
