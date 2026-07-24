let semantics_profile = "transparent-v0"

let line key value = key ^ ": " ^ value

let render_list render values =
  "[" ^ String.concat ", " (List.map render values) ^ "]"

let render_type = Core_type.to_string
let render_value_id = Runtime_value.Value_id.to_string
let render_instance_id = Runtime_value.Instance_id.to_string
let render_node_id = Core_graph.Node_id.to_string
let render_port_key = Core_graph.Port_key.to_string
let render_template_id = Core_graph.Function_template_id.to_string

let render_origin = function
  | Runtime_value.Execution_input -> "ExecutionInput"
  | Program_literal id -> "ProgramLiteral(" ^ id ^ ")"
  | Literal { instance_id; node_id } ->
      "Literal(instance=" ^ render_instance_id instance_id ^ ",node="
      ^ render_node_id node_id ^ ")"
  | Rewrite_output { instance_id; event_index; node_id; port_key } ->
      "RewriteOutput(instance=" ^ render_instance_id instance_id ^ ",event="
      ^ string_of_int event_index ^ ",node=" ^ render_node_id node_id
      ^ ",port=" ^ render_port_key port_key ^ ")"

let rec render_payload = function
  | Runtime_value.Unit -> "Unit"
  | Nat nat -> "Nat(" ^ Nat.to_string nat ^ ")"
  | Closure closure ->
      "Closure(template=" ^ render_template_id closure.template_id
      ^ ",parameter=" ^ render_type closure.parameter_type
      ^ ",result=" ^ render_type closure.result_type
      ^ ",captures="
      ^ render_list render_capture closure.captures
      ^ ")"

and render_capture captured =
  "{key=" ^ render_port_key captured.Runtime_value.capture_key ^ ",value="
  ^ render_value_id (Runtime_value.id captured.value)
  ^ "}"

let render_value value =
  "{id=" ^ render_value_id (Runtime_value.id value) ^ ",type="
  ^ render_type (Runtime_value.typ value)
  ^ ",payload=" ^ render_payload (Runtime_value.payload value)
  ^ ",origin=" ^ render_origin (Runtime_value.origin value) ^ "}"

let value_table machine =
  Engine.Machine.values machine
  |> List.sort (fun left right ->
         Runtime_value.Value_id.compare (Runtime_value.id left) (Runtime_value.id right))

let find_value values id =
  List.find_opt
    (fun value -> Runtime_value.Value_id.equal (Runtime_value.id value) id)
    values

let render_value_ref values id =
  match find_value values id with
  | Some value -> render_value value
  | None -> "{id=" ^ render_value_id id ^ ",type=<unknown>,payload=<unknown>,origin=<unknown>}"

let render_call_site = function
  | Runtime_value.Instance_id.Apply_node node_id ->
      "Apply(node=" ^ render_node_id node_id ^ ")"
  | NatRec_step_function { node_id; iteration } ->
      "NatRecStepFunction(node=" ^ render_node_id node_id ^ ",iteration="
      ^ Nat.to_string iteration ^ ")"
  | NatRec_step_accumulator { node_id; iteration } ->
      "NatRecStepAccumulator(node=" ^ render_node_id node_id
      ^ ",iteration=" ^ Nat.to_string iteration ^ ")"

let rec render_instance = function
  | Runtime_value.Instance_id.Root -> "Root"
  | Call { parent; call_site; call_index } ->
      "Call(parent=" ^ render_instance parent ^ ",site="
      ^ render_call_site call_site ^ ",call_index=" ^ string_of_int call_index
      ^ ")"

let render_callee = function
  | None -> "None"
  | Some callee -> render_instance callee

let render_natrec_detail event =
  match event.Rewrite_event.callee_instance_id with
  | Some (Runtime_value.Instance_id.Call { call_site = NatRec_step_function { iteration; _ }; _ })
  | Some (Call { call_site = NatRec_step_accumulator { iteration; _ }; _ }) ->
      " natrec_iteration=" ^ Nat.to_string iteration
  | _ -> (
      match event.rule with
      | NatRecUnfold -> (
          match event.created with
          | [ value ] -> " natrec_predecessor=" ^ render_value_id (Runtime_value.id value)
          | _ -> "")
      | _ -> "")

let render_event values event =
  "event index=" ^ string_of_int event.Rewrite_event.index ^ " rule="
  ^ Rewrite_event.rule_to_string event.rule ^ " instance="
  ^ render_instance event.instance_id ^ " node=" ^ render_node_id event.subject
  ^ " ready_epoch=" ^ string_of_int event.ready_epoch ^ " consumed="
  ^ render_list (render_value_ref values) event.consumed ^ " used="
  ^ render_list (render_value_ref values) event.used ^ " produced="
  ^ render_list render_value event.created ^ " callee="
  ^ render_callee event.callee_instance_id
  ^ render_natrec_detail event

let render_completed machine final_value =
  let values = value_table machine in
  let events = Engine.Machine.trace_events machine in
  String.concat "\n"
    ([
       line "semantics_profile" semantics_profile;
       line "final_result" (render_value final_value);
       line "event_count" (string_of_int (List.length events));
     ]
    @ List.map (render_event values) events)

let render_core_validation_errors errors =
  "diagnostic_profile: " ^ semantics_profile ^ "\n"
  ^ "core_validation_errors: "
  ^ render_list Core_graph.validation_error_to_string errors

let render_package_validation_errors errors =
  "diagnostic_profile: " ^ semantics_profile ^ "\n"
  ^ "package_validation_errors: "
  ^ render_list Program_package.validation_error_to_string errors
