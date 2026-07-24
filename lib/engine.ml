module CG = Core_graph
module Instance_id = Runtime_value.Instance_id

type initialization_error =
  | Input_type_mismatch of {
      expected : Core_type.t;
      actual : Core_type.t;
    }
  | Unsupported_runtime_input_type of Core_type.t
  | Initial_delivery_invariant_violation of string

type ready_candidate = {
  instance_id : Instance_id.t;
  node_id : CG.Node_id.t;
  ready_epoch : int;
  priority_spine_rank : int option;
  default_order_rank : int;
}

type stuck_reason = {
  instance_id : Instance_id.t;
  unexecuted_nodes : CG.Node_id.t list;
  result_missing : bool;
}

type runtime_error =
  | Unsupported_copy_payload_type of {
      node_id : CG.Node_id.t;
      typ : Core_type.t;
    }
  | Function_template_not_found of {
      node_id : CG.Node_id.t;
      template_id : CG.Function_template_id.t;
    }
  | Function_capture_delivery_invariant_violation of {
      node_id : CG.Node_id.t;
      message : string;
    }
  | Invalid_arrow_runtime_payload of {
      node_id : CG.Node_id.t;
      expected : Core_type.t;
      actual : Core_type.t;
    }
  | Invalid_apply_runtime_payload of {
      node_id : CG.Node_id.t;
      expected : Core_type.t;
      actual : Core_type.t;
    }
  | Apply_template_not_found of {
      node_id : CG.Node_id.t;
      template_id : CG.Function_template_id.t;
    }
  | Apply_result_type_mismatch of {
      node_id : CG.Node_id.t;
      expected : Core_type.t;
      actual : Core_type.t;
    }
  | Invalid_natrec_runtime_payload of {
      node_id : CG.Node_id.t;
      expected : Core_type.t;
      actual : Core_type.t;
    }
  | NatRec_lifecycle_error of {
      node_id : CG.Node_id.t;
      message : string;
    }
  | Runtime_invariant_violation of string

type port_binding = {
  port_ref : CG.port_ref;
  value : Runtime_value.t;
}

type natrec_phase =
  | Need_unfold
  | Predecessor_ready
  | Waiting_for_step_function of Instance_id.t
  | Partial_ready
  | Waiting_for_step_accumulator of Instance_id.t
  | Ready_to_complete

type natrec_state = {
  result_type : Core_type.t;
  count : Runtime_value.t;
  total_count : Nat.t;
  step : Runtime_value.t;
  next_predecessor : Nat.t;
  accumulator : Runtime_value.t;
  predecessor : Runtime_value.t option;
  partial : Runtime_value.t option;
  phase : natrec_phase;
}

type node_state =
  | Pending
  | Waiting_for_return of Instance_id.t
  | NatRec_active of natrec_state
  | Completed

type instance = {
  id : Instance_id.t;
  graph : CG.Validated_graph.t;
  bindings : port_binding list;
  node_states : (CG.Node_id.t * node_state) list;
  ready_candidates : ready_candidate list;
  result_value : Runtime_value.t option;
}

type natrec_stage =
  | Step_function
  | Step_accumulator

type return_target =
  | Apply_result of {
      apply_node_id : CG.Node_id.t;
      expected_result_type : Core_type.t;
    }
  | NatRec_step of {
      node_id : CG.Node_id.t;
      iteration : Nat.t;
      stage : natrec_stage;
      expected_result_type : Core_type.t;
    }

type call_frame = {
  caller_instance_id : Instance_id.t;
  callee_instance_id : Instance_id.t;
  return_target : return_target;
}

module Machine = struct
  type t = {
    function_templates : CG.Function_template.t list;
    instances : instance list;
    active_instance_id : Instance_id.t;
    call_stack : call_frame list;
    next_event_index : int;
    trace_events : Rewrite_event.t list;
  }

  let active_instance_id machine = machine.active_instance_id
  let call_depth machine = List.length machine.call_stack

  let instance_by_id machine instance_id =
    List.find_opt (fun instance -> Instance_id.equal instance.id instance_id) machine.instances

  let active_instance machine = instance_by_id machine machine.active_instance_id

  let ready_candidates machine =
    match active_instance machine with
    | Some instance -> instance.ready_candidates
    | None -> []

  let result_value machine =
    match instance_by_id machine Instance_id.root with
    | Some instance -> instance.result_value
    | None -> None

  let trace_events machine = machine.trace_events

  let node_state machine ~instance_id node_id =
    match instance_by_id machine instance_id with
    | None -> None
    | Some instance -> (
        match List.assoc_opt node_id instance.node_states with
        | Some state -> Some state
        | None -> Some Pending)

  let values machine =
    let natrec_state_values state =
      [
        Some state.count;
        Some state.step;
        Some state.accumulator;
        state.predecessor;
        state.partial;
      ]
      |> List.filter_map (fun value -> value)
    in
    let instance_values =
      machine.instances
      |> List.concat_map (fun instance ->
             let binding_values = List.map (fun binding -> binding.value) instance.bindings in
             let lifecycle_values =
               instance.node_states
               |> List.concat_map (function
                    | _, NatRec_active state -> natrec_state_values state
                    | _ -> [])
             in
             let result_values =
               match instance.result_value with
               | Some value -> [ value ]
               | None -> []
             in
             binding_values @ lifecycle_values @ result_values)
    in
    let created_values =
      machine.trace_events |> List.concat_map (fun event -> event.Rewrite_event.created)
    in
    let rec add_unique seen = function
      | [] -> List.rev seen
      | value :: rest ->
          if
            List.exists
              (fun existing ->
                Runtime_value.Value_id.equal (Runtime_value.id existing)
                  (Runtime_value.id value))
              seen
          then add_unique seen rest
          else add_unique (value :: seen) rest
    in
    add_unique [] (instance_values @ created_values)

  let instance_completed instance =
    Option.is_some instance.result_value
    && List.for_all
         (fun node_id ->
           match List.assoc_opt node_id instance.node_states with
           | Some Completed -> true
           | _ -> false)
         (CG.Validated_graph.default_node_order instance.graph)
    && instance.ready_candidates = []

  let is_completed machine =
    match (machine.call_stack, instance_by_id machine Instance_id.root) with
    | [], Some root -> instance_completed root
    | _ -> false
end

type step_result =
  | Rewritten of {
      machine : Machine.t;
      event : Rewrite_event.t;
    }
  | Completed of Runtime_value.t
  | Stuck of stuck_reason
  | Runtime_error of runtime_error

type run_result =
  | Run_completed of {
      value : Runtime_value.t;
      trace : Rewrite_event.t list;
    }
  | Run_stuck of {
      reason : stuck_reason;
      trace : Rewrite_event.t list;
    }
  | Run_error of {
      error : runtime_error;
      trace : Rewrite_event.t list;
    }

let root_instance_id = Instance_id.root

let node_by_id graph node_id =
  CG.Validated_graph.nodes graph
  |> List.find_opt (fun (node : CG.node) -> CG.Node_id.equal node.id node_id)

let outgoing_edge graph node_id port_key =
  CG.Validated_graph.edges graph
  |> List.find_opt (fun (edge : CG.edge) ->
         CG.Node_id.equal edge.source.node_id node_id
         && CG.Port_key.equal edge.source.port_key port_key)

let binding_for bindings node_id port_key =
  bindings
  |> List.find_opt (fun binding ->
         CG.Node_id.equal binding.port_ref.node_id node_id
         && CG.Port_key.equal binding.port_ref.port_key port_key)
  |> Option.map (fun binding -> binding.value)

let payload_matches_type payload typ =
  Core_type.equal (Runtime_value.payload_type payload) typ

let default_order_rank graph node_id =
  let rec loop rank = function
    | [] -> None
    | current :: rest ->
        if CG.Node_id.equal current node_id then Some rank else loop (rank + 1) rest
  in
  loop 0 (CG.Validated_graph.default_node_order graph)

let priority_spine_rank graph node_id =
  match CG.Validated_graph.priority_spine graph with
  | None -> None
  | Some priority_spine ->
      let rec loop rank = function
        | [] -> None
        | current :: rest ->
            if CG.Node_id.equal current node_id then Some rank else loop (rank + 1) rest
      in
      loop 0 priority_spine

let function_template_by_id templates template_id =
  List.find_opt
    (fun template ->
      CG.Function_template_id.equal (CG.Function_template.id template) template_id)
    templates

let node_state instance node_id =
  match List.assoc_opt node_id instance.node_states with
  | Some state -> state
  | None -> Pending

let set_node_state instance node_id state =
  {
    instance with
    node_states =
      (node_id, state)
      :: List.filter
           (fun (existing, _) -> not (CG.Node_id.equal existing node_id))
           instance.node_states;
  }

let is_ready instance node_id =
  match node_state instance node_id with
  | Completed | Waiting_for_return _ | NatRec_active _ -> false
  | Pending ->
    match node_by_id instance.graph node_id with
    | None -> false
    | Some { kind = CG.Succ; _ } -> (
        match binding_for instance.bindings node_id CG.Port_key.input with
        | Some value -> Core_type.equal (Runtime_value.typ value) Core_type.Nat
        | None -> false)
    | Some { kind = CG.Drop expected; _ } -> (
        match binding_for instance.bindings node_id CG.Port_key.input with
        | Some value -> Core_type.equal (Runtime_value.typ value) expected
        | None -> false)
    | Some { kind = CG.Copy expected; _ } -> (
        match binding_for instance.bindings node_id CG.Port_key.input with
        | Some value -> Core_type.equal (Runtime_value.typ value) expected
        | None -> false)
    | Some { kind = CG.Function signature; _ } ->
        List.for_all
          (fun (capture : CG.capture) ->
            match binding_for instance.bindings node_id capture.CG.key with
            | Some value -> Core_type.equal (Runtime_value.typ value) capture.typ
            | None -> false)
          signature.captures
    | Some { kind = CG.Apply signature; _ } -> (
        match
          ( binding_for instance.bindings node_id CG.Port_key.function_input,
            binding_for instance.bindings node_id CG.Port_key.argument )
        with
        | Some function_value, Some argument_value ->
            Core_type.equal (Runtime_value.typ function_value)
              (Core_type.Arrow
                 (signature.apply_parameter_type, signature.apply_result_type))
            && Core_type.equal (Runtime_value.typ argument_value)
                 signature.apply_parameter_type
        | _ -> false)
    | Some { kind = CG.NatRec result_type; _ } -> (
        match
          ( binding_for instance.bindings node_id CG.Port_key.base,
            binding_for instance.bindings node_id CG.Port_key.step,
            binding_for instance.bindings node_id CG.Port_key.count )
        with
        | Some base, Some step, Some count ->
            Core_type.equal (Runtime_value.typ base) result_type
            && Core_type.equal (Runtime_value.typ step)
                 (Core_type.Arrow
                    (Core_type.Nat, Core_type.Arrow (result_type, result_type)))
            && Core_type.equal (Runtime_value.typ count) Core_type.Nat
        | _ -> false)
    | Some _ -> false

let ready_candidate instance_id graph epoch node_id =
  match default_order_rank graph node_id with
  | Some default_order_rank ->
      Some
        {
          instance_id;
          node_id;
          ready_epoch = epoch;
          priority_spine_rank = priority_spine_rank graph node_id;
          default_order_rank;
        }
  | None -> None

let initial_ready_candidates instance =
  CG.Validated_graph.default_node_order instance.graph
  |> List.filter (is_ready instance)
  |> List.filter_map (ready_candidate instance.id instance.graph 0)

let ready_contains ready node_id =
  List.exists (fun candidate -> CG.Node_id.equal candidate.node_id node_id) ready

let refresh_ready_candidates instance epoch =
  let still_ready =
    instance.ready_candidates
    |> List.filter (fun candidate -> is_ready instance candidate.node_id)
  in
  let new_ready =
    CG.Validated_graph.default_node_order instance.graph
    |> List.filter (fun node_id ->
           is_ready instance node_id
           && not (ready_contains still_ready node_id))
    |> List.filter_map (ready_candidate instance.id instance.graph epoch)
  in
  still_ready @ new_ready

let select_ready candidates =
  let compare_candidate (left : ready_candidate) (right : ready_candidate) =
    match Int.compare left.ready_epoch right.ready_epoch with
    | 0 -> (
        match (left.priority_spine_rank, right.priority_spine_rank) with
        | Some left_rank, Some right_rank -> (
            match Int.compare left_rank right_rank with
            | 0 -> Int.compare left.default_order_rank right.default_order_rank
            | other -> other)
        | Some _, None -> -1
        | None, Some _ -> 1
        | None, None -> Int.compare left.default_order_rank right.default_order_rank)
    | other -> other
  in
  match List.sort compare_candidate candidates with
  | selected :: _ -> Some selected
  | [] -> None

let update_instance machine updated =
  {
    machine with
    Machine.instances =
      List.map
        (fun instance -> if Instance_id.equal instance.id updated.id then updated else instance)
        machine.Machine.instances;
  }

let deliver_to_target graph instance target value =
  match node_by_id graph target.CG.node_id with
  | Some { kind = CG.Result _; _ } ->
      if Option.is_some instance.result_value then
        Error "result boundary already has a value"
      else Ok { instance with result_value = Some value }
  | Some _ ->
      if Option.is_some (binding_for instance.bindings target.node_id target.port_key)
      then
        Error
          ("target input already has a value: " ^ CG.Node_id.to_string target.node_id
         ^ "." ^ CG.Port_key.to_string target.port_key)
      else Ok { instance with bindings = { port_ref = target; value } :: instance.bindings }
  | None ->
      Error ("missing delivery target node: " ^ CG.Node_id.to_string target.node_id)

let deliver_output graph instance node_id port_key value =
  match outgoing_edge graph node_id port_key with
  | None ->
      Error
        ("missing outgoing edge from " ^ CG.Node_id.to_string node_id ^ "."
       ^ CG.Port_key.to_string port_key)
  | Some edge -> deliver_to_target graph instance edge.target value

let event_subject_id _instance node_id = node_id

let rewrite_output_id instance event_index node_id port_key =
  Runtime_value.rewrite_output_id instance.id event_index node_id port_key

let rewrite_output_origin instance event_index node_id port_key =
  Runtime_value.Rewrite_output
    { instance_id = instance.id; event_index; node_id; port_key }

let literal_id instance node_id =
  Runtime_value.literal_id instance.id node_id

let literal_origin instance node_id =
  Runtime_value.Literal { instance_id = instance.id; node_id }

let materialize_literal instance = function
  | { CG.kind = CG.Unit_literal; id } ->
      Some
        (Runtime_value.create ~id:(literal_id instance id)
           ~payload:Runtime_value.Unit ~origin:(literal_origin instance id))
  | { CG.kind = CG.Nat_literal nat; id } ->
      Some
        (Runtime_value.create ~id:(literal_id instance id)
           ~payload:(Runtime_value.Nat nat) ~origin:(literal_origin instance id))
  | _ -> None

let bind_boundary_output instance node_id value =
  deliver_output instance.graph instance node_id CG.Port_key.value value

let append_event machine event =
  {
    machine with
    Machine.trace_events = machine.Machine.trace_events @ [ event ];
    next_event_index = machine.Machine.next_event_index + 1;
  }

let mark_completed instance node_id = set_node_state instance node_id Completed

let mark_waiting_for_return instance node_id callee_instance_id =
  set_node_state instance node_id (Waiting_for_return callee_instance_id)

let remove_ready instance node_id =
  {
    instance with
    ready_candidates =
      List.filter
        (fun candidate -> not (CG.Node_id.equal candidate.node_id node_id))
        instance.ready_candidates;
  }

let refresh_after_event instance event_index =
  { instance with ready_candidates = refresh_ready_candidates instance event_index }

let make_event machine instance candidate rule ?(used = []) consumed created
    ?callee_instance_id () =
  {
    Rewrite_event.index = machine.Machine.next_event_index;
    rule;
    instance_id = instance.id;
    subject = event_subject_id instance candidate.node_id;
    ready_epoch = candidate.ready_epoch;
    used;
    consumed;
    created;
    callee_instance_id;
  }

let empty_instance id graph =
  {
    id;
    graph;
    bindings = [];
    node_states = [];
    ready_candidates = [];
    result_value = None;
  }

let materialize_input graph input =
  let expected = CG.Validated_graph.parameter_type graph in
  match expected with
  | Core_type.Arrow _ -> Error (Unsupported_runtime_input_type expected)
  | Core_type.Unit | Core_type.Nat ->
      if payload_matches_type input expected then
        Ok
          (Runtime_value.create ~id:Runtime_value.execution_input_id ~payload:input
             ~origin:Runtime_value.Execution_input)
      else Error (Input_type_mismatch { expected; actual = Runtime_value.payload_type input })

let initialize_instance_literals instance =
  CG.Validated_graph.nodes instance.graph
  |> List.filter_map (materialize_literal instance)
  |> List.fold_left
       (fun state_result value ->
         match state_result with
         | Error _ as error -> error
         | Ok instance -> (
             match Runtime_value.origin value with
             | Literal { node_id; _ } ->
                 deliver_output instance.graph instance node_id CG.Port_key.value value
             | Execution_input | Rewrite_output _ ->
                 Error "unexpected non-literal value during literal materialization"))
       (Ok instance)

let bind_capture_boundary instance (captured : Runtime_value.captured_value) =
  let capture_node =
    CG.Validated_graph.nodes instance.graph
    |> List.find_opt (function
         | { CG.kind = CG.Capture capture; _ } ->
             CG.Port_key.equal capture.key captured.capture_key
         | _ -> false)
  in
  match capture_node with
  | None ->
      Error
        ("missing capture boundary "
        ^ CG.Port_key.to_string captured.capture_key)
  | Some node -> bind_boundary_output instance node.id captured.value

let activate_instance ~id ~graph ~parameter_value ~captures =
  let initial = empty_instance id graph in
  let parameter = CG.Validated_graph.parameter_node graph in
  let result = bind_boundary_output initial parameter.id parameter_value in
  let result =
    match result with
    | Error _ as error -> error
    | Ok instance ->
        List.fold_left
          (fun state_result captured ->
            match state_result with
            | Error _ as error -> error
            | Ok instance -> bind_capture_boundary instance captured)
          (Ok instance) captures
  in
  let result =
    match result with
    | Error _ as error -> error
    | Ok instance -> initialize_instance_literals instance
  in
  Result.map
    (fun instance ->
      { instance with ready_candidates = initial_ready_candidates instance })
    result

let initialize_with_templates function_templates graph ~input =
  match materialize_input graph input with
  | Error error -> Error error
  | Ok input_value ->
      let result =
        activate_instance ~id:root_instance_id ~graph ~parameter_value:input_value
          ~captures:[]
      in
      result
      |> Result.map_error (fun message -> Initial_delivery_invariant_violation message)
      |> Result.map (fun root ->
             {
               Machine.function_templates;
               instances = [ root ];
               active_instance_id = root_instance_id;
               call_stack = [];
               next_event_index = 0;
               trace_events = [];
             })

let initialize graph ~input = initialize_with_templates [] graph ~input

let unexecuted_nodes instance =
  CG.Validated_graph.default_node_order instance.graph
  |> List.filter (fun node_id ->
         match node_state instance node_id with
         | Completed -> false
         | Pending | Waiting_for_return _ | NatRec_active _ -> true)

let stuck_reason instance =
  {
    instance_id = instance.id;
    unexecuted_nodes = unexecuted_nodes instance;
    result_missing = Option.is_none instance.result_value;
  }

let rewrite_succ machine instance candidate =
  match binding_for instance.bindings candidate.node_id CG.Port_key.input with
  | Some input_value -> (
      match Runtime_value.payload input_value with
      | Runtime_value.Nat nat ->
          let event_index = machine.Machine.next_event_index in
          let created =
            Runtime_value.create
              ~id:(rewrite_output_id instance event_index candidate.node_id CG.Port_key.result)
              ~payload:(Runtime_value.Nat (Nat.succ nat))
              ~origin:(rewrite_output_origin instance event_index candidate.node_id CG.Port_key.result)
          in
          let event =
            make_event machine instance candidate Rewrite_event.Succ
              [ Runtime_value.id input_value ] [ created ] ()
          in
          let instance =
            remove_ready instance candidate.node_id
            |> fun i -> mark_completed i candidate.node_id
          in
          let machine = append_event (update_instance machine instance) event in
          let instance = Machine.instance_by_id machine instance.id |> Option.get in
          (match deliver_output instance.graph instance candidate.node_id CG.Port_key.result created with
          | Error message -> Runtime_error (Runtime_invariant_violation message)
          | Ok instance ->
              let instance = refresh_after_event instance machine.Machine.next_event_index in
              Rewritten { machine = update_instance machine instance; event })
      | Runtime_value.Unit | Runtime_value.Closure _ -> Stuck (stuck_reason instance))
  | None -> Stuck (stuck_reason instance)

let copy_payload candidate expected input_value =
  match (expected, Runtime_value.payload input_value) with
  | Core_type.Unit, Runtime_value.Unit -> Ok Runtime_value.Unit
  | Core_type.Nat, Runtime_value.Nat nat -> Ok (Runtime_value.Nat nat)
  | Core_type.Arrow _, Runtime_value.Closure closure
    when Core_type.equal (Core_type.Arrow (closure.parameter_type, closure.result_type)) expected ->
      Ok (Runtime_value.Closure closure)
  | Core_type.Arrow _, _ ->
      Error
        (Invalid_arrow_runtime_payload
           { node_id = candidate.node_id; expected; actual = Runtime_value.typ input_value })
  | _ ->
      Error
        (Runtime_invariant_violation
           ("Copy input payload does not match declared type at "
          ^ CG.Node_id.to_string candidate.node_id))

let copy_created_value instance event_index node_id port_key payload =
  Runtime_value.create
    ~id:(rewrite_output_id instance event_index node_id port_key)
    ~payload
    ~origin:(rewrite_output_origin instance event_index node_id port_key)

let rewrite_copy machine instance candidate expected =
  match binding_for instance.bindings candidate.node_id CG.Port_key.input with
  | None -> Stuck (stuck_reason instance)
  | Some input_value -> (
      match copy_payload candidate expected input_value with
      | Error error -> Runtime_error error
      | Ok payload ->
          let event_index = machine.Machine.next_event_index in
          let left = copy_created_value instance event_index candidate.node_id CG.Port_key.left payload in
          let right = copy_created_value instance event_index candidate.node_id CG.Port_key.right payload in
          if Runtime_value.Value_id.equal (Runtime_value.id left) (Runtime_value.id right)
          then Runtime_error (Runtime_invariant_violation "Copy output ID collision")
          else if
            Runtime_value.Value_id.equal (Runtime_value.id left) (Runtime_value.id input_value)
            || Runtime_value.Value_id.equal (Runtime_value.id right) (Runtime_value.id input_value)
          then Runtime_error (Runtime_invariant_violation "Copy output ID aliases input")
          else
            let event =
              make_event machine instance candidate Rewrite_event.Copy
                [ Runtime_value.id input_value ] [ left; right ] ()
            in
            let instance =
              remove_ready instance candidate.node_id
              |> fun i -> mark_completed i candidate.node_id
            in
            let machine = append_event (update_instance machine instance) event in
            let instance = Machine.instance_by_id machine instance.id |> Option.get in
            match deliver_output instance.graph instance candidate.node_id CG.Port_key.left left with
            | Error message -> Runtime_error (Runtime_invariant_violation message)
            | Ok instance -> (
                match deliver_output instance.graph instance candidate.node_id CG.Port_key.right right with
                | Error message -> Runtime_error (Runtime_invariant_violation message)
                | Ok instance ->
                    let instance = refresh_after_event instance machine.Machine.next_event_index in
                    Rewritten { machine = update_instance machine instance; event }))

let rewrite_function machine instance candidate signature =
  match function_template_by_id machine.Machine.function_templates signature.CG.template_id with
  | None ->
      Runtime_error
        (Function_template_not_found
           { node_id = candidate.node_id; template_id = signature.template_id })
  | Some template ->
      let captures = CG.Function_template.captures template in
      let collect_capture (capture : CG.capture) =
        match binding_for instance.bindings candidate.node_id capture.CG.key with
        | Some value when Core_type.equal (Runtime_value.typ value) capture.typ ->
            Ok { Runtime_value.capture_key = capture.key; value }
        | Some value ->
            Error
              ("capture " ^ CG.Port_key.to_string capture.key
             ^ " type mismatch: expected " ^ Core_type.to_string capture.typ
             ^ ", actual " ^ Core_type.to_string (Runtime_value.typ value))
        | None -> Error ("capture " ^ CG.Port_key.to_string capture.key ^ " is missing")
      in
      let rec collect = function
        | [] -> Ok []
        | capture :: rest -> (
            match collect_capture capture with
            | Error _ as error -> error
            | Ok captured -> (
                match collect rest with
                | Error _ as error -> error
                | Ok captured_rest -> Ok (captured :: captured_rest)))
      in
      (match collect captures with
      | Error message ->
          Runtime_error
            (Function_capture_delivery_invariant_violation
               { node_id = candidate.node_id; message })
      | Ok captured_values ->
          let event_index = machine.Machine.next_event_index in
          let closure =
            {
              Runtime_value.template_id = CG.Function_template.id template;
              parameter_type = CG.Function_template.parameter_type template;
              result_type = CG.Function_template.result_type template;
              captures = captured_values;
            }
          in
          let created =
            Runtime_value.create
              ~id:(rewrite_output_id instance event_index candidate.node_id CG.Port_key.value)
              ~payload:(Runtime_value.Closure closure)
              ~origin:(rewrite_output_origin instance event_index candidate.node_id CG.Port_key.value)
          in
          let event =
            make_event machine instance candidate Rewrite_event.Function
              (List.map
                 (fun captured -> Runtime_value.id captured.Runtime_value.value)
                 captured_values)
              [ created ] ()
          in
          let instance =
            remove_ready instance candidate.node_id
            |> fun i -> mark_completed i candidate.node_id
          in
          let machine = append_event (update_instance machine instance) event in
          let instance = Machine.instance_by_id machine instance.id |> Option.get in
          match deliver_output instance.graph instance candidate.node_id CG.Port_key.value created with
          | Error message -> Runtime_error (Runtime_invariant_violation message)
          | Ok instance ->
              let instance = refresh_after_event instance machine.Machine.next_event_index in
              Rewritten { machine = update_instance machine instance; event })

let rewrite_drop machine instance candidate =
  match binding_for instance.bindings candidate.node_id CG.Port_key.input with
  | Some input_value -> (
      let expected =
        match node_by_id instance.graph candidate.node_id with
        | Some { kind = CG.Drop expected; _ } -> expected
        | _ -> Runtime_value.typ input_value
      in
      if not (Core_type.equal (Runtime_value.typ input_value) expected) then
        Runtime_error
          (Runtime_invariant_violation
             ("Drop input payload does not match declared type at "
            ^ CG.Node_id.to_string candidate.node_id))
      else
        match (expected, Runtime_value.payload input_value) with
        | Core_type.Arrow _, Runtime_value.Closure _
        | Core_type.Unit, Runtime_value.Unit
        | Core_type.Nat, Runtime_value.Nat _ ->
            let event =
              make_event machine instance candidate Rewrite_event.Drop
                [ Runtime_value.id input_value ] [] ()
            in
            let instance =
              remove_ready instance candidate.node_id
              |> fun i -> mark_completed i candidate.node_id
            in
            let machine = append_event (update_instance machine instance) event in
            let instance = Machine.instance_by_id machine instance.id |> Option.get in
            let instance = refresh_after_event instance machine.Machine.next_event_index in
            Rewritten { machine = update_instance machine instance; event }
        | Core_type.Arrow _, _ ->
            Runtime_error
              (Invalid_arrow_runtime_payload
                 { node_id = candidate.node_id; expected; actual = Runtime_value.typ input_value })
        | _ ->
            Runtime_error
              (Runtime_invariant_violation
                 ("Drop input payload does not match declared type at "
                ^ CG.Node_id.to_string candidate.node_id)))
  | None -> Stuck (stuck_reason instance)

let instantiate_closure_callee machine caller ~node_id ~call_site closure argument =
  match function_template_by_id machine.Machine.function_templates closure.Runtime_value.template_id with
  | None ->
      Error
        (Apply_template_not_found
           { node_id; template_id = closure.template_id })
  | Some template ->
      let event_index = machine.Machine.next_event_index in
      let callee_id =
        Instance_id.call_at ~parent:caller.id ~call_site ~call_index:event_index
      in
      let body = CG.Function_template.body template in
      let result =
        activate_instance ~id:callee_id ~graph:body ~parameter_value:argument
          ~captures:closure.captures
      in
      result
      |> Result.map_error (fun message -> Runtime_invariant_violation message)
      |> Result.map (fun callee -> (template, callee_id, callee))

let instantiate_callee machine caller candidate closure argument =
  instantiate_closure_callee machine caller ~node_id:candidate.node_id
    ~call_site:(Instance_id.Apply_node candidate.node_id) closure argument

let rewrite_apply_enter machine caller candidate signature =
  match
    ( binding_for caller.bindings candidate.node_id CG.Port_key.function_input,
      binding_for caller.bindings candidate.node_id CG.Port_key.argument )
  with
  | Some closure_value, Some argument_value -> (
      match Runtime_value.payload closure_value with
      | Runtime_value.Closure closure ->
          let expected_arrow =
            Core_type.Arrow
              (signature.CG.apply_parameter_type, signature.apply_result_type)
          in
          if not (Core_type.equal (Runtime_value.typ closure_value) expected_arrow) then
            Runtime_error
              (Invalid_apply_runtime_payload
                 {
                   node_id = candidate.node_id;
                   expected = expected_arrow;
                   actual = Runtime_value.typ closure_value;
                 })
          else if
            not
              (Core_type.equal (Runtime_value.typ argument_value)
                 signature.apply_parameter_type)
          then
            Runtime_error
              (Invalid_apply_runtime_payload
                 {
                   node_id = candidate.node_id;
                   expected = signature.apply_parameter_type;
                   actual = Runtime_value.typ argument_value;
                 })
          else (
            match instantiate_callee machine caller candidate closure argument_value with
            | Error error -> Runtime_error error
            | Ok (_template, callee_id, callee) ->
                let event =
                  make_event machine caller candidate Rewrite_event.ApplyEnter
                    [ Runtime_value.id closure_value; Runtime_value.id argument_value ]
                    [] ~callee_instance_id:callee_id ()
                in
                let caller =
                  remove_ready caller candidate.node_id
                  |> fun caller ->
                  mark_waiting_for_return caller candidate.node_id callee_id
                in
                let frame =
                  {
                    caller_instance_id = caller.id;
                    callee_instance_id = callee_id;
                    return_target =
                      Apply_result
                        {
                          apply_node_id = candidate.node_id;
                          expected_result_type = signature.apply_result_type;
                        };
                  }
                in
                let machine =
                  {
                    machine with
                    Machine.instances =
                      callee
                      :: List.map
                           (fun instance ->
                             if Instance_id.equal instance.id caller.id then caller else instance)
                           machine.Machine.instances;
                    active_instance_id = callee_id;
                    call_stack = frame :: machine.Machine.call_stack;
                  }
                in
                Rewritten { machine = append_event machine event; event })
      | Runtime_value.Unit | Runtime_value.Nat _ ->
          Runtime_error
            (Invalid_apply_runtime_payload
               {
                 node_id = candidate.node_id;
                 expected =
                   Core_type.Arrow
                     (signature.apply_parameter_type, signature.apply_result_type);
                 actual = Runtime_value.typ closure_value;
               }))
  | _ -> Stuck (stuck_reason caller)

let rewrite_apply_return machine callee frame apply_node_id expected_result_type =
  match (callee.result_value, Machine.instance_by_id machine frame.caller_instance_id) with
  | Some result_value, Some caller ->
      if not (Core_type.equal (Runtime_value.typ result_value) expected_result_type)
      then
        Runtime_error
          (Apply_result_type_mismatch
             {
               node_id = apply_node_id;
               expected = expected_result_type;
               actual = Runtime_value.typ result_value;
             })
      else if
        not
          (match node_state caller apply_node_id with
          | Waiting_for_return waiting ->
              Instance_id.equal waiting frame.callee_instance_id
          | Pending | NatRec_active _ | Completed -> false)
      then
        Runtime_error
          (Runtime_invariant_violation
             ("ApplyReturn frame does not match caller node lifecycle at "
            ^ CG.Node_id.to_string apply_node_id))
      else
        let candidate =
          {
            instance_id = caller.id;
            node_id = apply_node_id;
            ready_epoch = machine.Machine.next_event_index;
            priority_spine_rank = None;
            default_order_rank =
              Option.value (default_order_rank caller.graph apply_node_id) ~default:0;
          }
        in
        let created =
          Runtime_value.create
            ~id:
              (rewrite_output_id caller machine.Machine.next_event_index
                 apply_node_id CG.Port_key.result)
            ~payload:(Runtime_value.payload result_value)
            ~origin:
              (rewrite_output_origin caller machine.Machine.next_event_index
                 apply_node_id CG.Port_key.result)
        in
        let event =
          make_event machine caller candidate Rewrite_event.ApplyReturn
            [ Runtime_value.id result_value ] [ created ]
            ~callee_instance_id:callee.id ()
        in
        let caller = mark_completed caller apply_node_id in
        let machine = append_event (update_instance machine caller) event in
        let caller = Machine.instance_by_id machine caller.id |> Option.get in
        (match deliver_output caller.graph caller apply_node_id CG.Port_key.result created with
        | Error message -> Runtime_error (Runtime_invariant_violation message)
        | Ok caller ->
            let caller = refresh_after_event caller machine.Machine.next_event_index in
            let machine =
              {
                (update_instance machine caller) with
                Machine.active_instance_id = caller.id;
                call_stack = List.tl machine.Machine.call_stack;
              }
            in
            Rewritten { machine; event })
  | None, _ -> Stuck (stuck_reason callee)
  | _, None -> Runtime_error (Runtime_invariant_violation "caller instance missing")

let natrec_candidate machine instance node_id =
  {
    instance_id = instance.id;
    node_id;
    ready_epoch = machine.Machine.next_event_index;
    priority_spine_rank = None;
    default_order_rank = Option.value (default_order_rank instance.graph node_id) ~default:0;
  }

let natrec_error node_id message =
  Runtime_error (NatRec_lifecycle_error { node_id; message })

let natrec_state_for instance node_id =
  match node_state instance node_id with
  | NatRec_active state -> Some state
  | _ -> None

let natrec_created_value instance machine node_id port_key payload =
  Runtime_value.create
    ~id:(rewrite_output_id instance machine.Machine.next_event_index node_id port_key)
    ~payload
    ~origin:(rewrite_output_origin instance machine.Machine.next_event_index node_id port_key)

let rewrite_natrec_zero machine instance candidate base step count =
  let created =
    natrec_created_value instance machine candidate.node_id CG.Port_key.result
      (Runtime_value.payload base)
  in
  if Runtime_value.Value_id.equal (Runtime_value.id created) (Runtime_value.id base)
  then Runtime_error (Runtime_invariant_violation "NatRecZero result aliases base")
  else
    let event =
      make_event machine instance candidate Rewrite_event.NatRecZero
        [ Runtime_value.id base; Runtime_value.id step; Runtime_value.id count ]
        [ created ] ()
    in
    let instance =
      remove_ready instance candidate.node_id
      |> fun instance -> mark_completed instance candidate.node_id
    in
    let machine = append_event (update_instance machine instance) event in
    let instance = Machine.instance_by_id machine instance.id |> Option.get in
    match deliver_output instance.graph instance candidate.node_id CG.Port_key.result created with
    | Error message -> Runtime_error (Runtime_invariant_violation message)
    | Ok instance ->
        let instance = refresh_after_event instance machine.Machine.next_event_index in
        Rewritten { machine = update_instance machine instance; event }

let rewrite_natrec_start machine instance candidate result_type base step count total_count =
  let state =
    {
      result_type;
      count;
      total_count;
      step;
      next_predecessor = Nat.zero;
      accumulator = base;
      predecessor = None;
      partial = None;
      phase = Need_unfold;
    }
  in
  let event =
    make_event machine instance candidate Rewrite_event.NatRecStart
      [ Runtime_value.id base; Runtime_value.id step; Runtime_value.id count ]
      [] ()
  in
  let instance =
    remove_ready instance candidate.node_id
    |> fun instance -> set_node_state instance candidate.node_id (NatRec_active state)
  in
  Rewritten { machine = append_event (update_instance machine instance) event; event }

let rewrite_natrec_initial machine instance candidate result_type =
  match
    ( binding_for instance.bindings candidate.node_id CG.Port_key.base,
      binding_for instance.bindings candidate.node_id CG.Port_key.step,
      binding_for instance.bindings candidate.node_id CG.Port_key.count )
  with
  | Some base, Some step, Some count -> (
      let expected_step =
        Core_type.Arrow
          (Core_type.Nat, Core_type.Arrow (result_type, result_type))
      in
      if not (Core_type.equal (Runtime_value.typ base) result_type) then
        Runtime_error
          (Invalid_natrec_runtime_payload
             { node_id = candidate.node_id; expected = result_type; actual = Runtime_value.typ base })
      else if not (Core_type.equal (Runtime_value.typ step) expected_step) then
        Runtime_error
          (Invalid_natrec_runtime_payload
             { node_id = candidate.node_id; expected = expected_step; actual = Runtime_value.typ step })
      else if not (Core_type.equal (Runtime_value.typ count) Core_type.Nat) then
        Runtime_error
          (Invalid_natrec_runtime_payload
             { node_id = candidate.node_id; expected = Core_type.Nat; actual = Runtime_value.typ count })
      else
        match Runtime_value.payload count with
        | Runtime_value.Nat total_count ->
            if Nat.equal total_count Nat.zero then
              rewrite_natrec_zero machine instance candidate base step count
            else rewrite_natrec_start machine instance candidate result_type base step count total_count
        | Runtime_value.Unit | Runtime_value.Closure _ ->
            Runtime_error
              (Invalid_natrec_runtime_payload
                 { node_id = candidate.node_id; expected = Core_type.Nat; actual = Runtime_value.typ count }))
  | _ -> Stuck (stuck_reason instance)

let rewrite_natrec_unfold machine instance node_id state =
  if not (Nat.compare state.next_predecessor state.total_count < 0) then
    natrec_error node_id "NatRecUnfold iteration is out of range"
  else
    let candidate = natrec_candidate machine instance node_id in
    let predecessor =
      natrec_created_value instance machine node_id CG.Port_key.predecessor
        (Runtime_value.Nat state.next_predecessor)
    in
    let state =
      {
        state with
        predecessor = Some predecessor;
        partial = None;
        phase = Predecessor_ready;
      }
    in
    let event =
      make_event machine instance candidate Rewrite_event.NatRecUnfold []
        [ predecessor ] ()
    in
    let instance = set_node_state instance node_id (NatRec_active state) in
    Rewritten { machine = append_event (update_instance machine instance) event; event }

let closure_payload node_id expected value =
  match Runtime_value.payload value with
  | Runtime_value.Closure closure
    when Core_type.equal (Runtime_value.typ value) expected ->
      Ok closure
  | Runtime_value.Closure _ ->
      Error
        (Invalid_natrec_runtime_payload
           { node_id; expected; actual = Runtime_value.typ value })
  | Runtime_value.Unit | Runtime_value.Nat _ ->
      Error
        (Invalid_natrec_runtime_payload
           { node_id; expected; actual = Runtime_value.typ value })

let rewrite_natrec_step_function_enter machine instance node_id state =
  match state.predecessor with
  | None -> natrec_error node_id "NatRec step predecessor is missing"
  | Some predecessor -> (
      let expected_step =
        Core_type.Arrow
          (Core_type.Nat, Core_type.Arrow (state.result_type, state.result_type))
      in
      match closure_payload node_id expected_step state.step with
      | Error error -> Runtime_error error
      | Ok closure -> (
          let call_site =
            Instance_id.NatRec_step_function
              { node_id; iteration = state.next_predecessor }
          in
          match
            instantiate_closure_callee machine instance ~node_id ~call_site closure
              predecessor
          with
          | Error error -> Runtime_error error
          | Ok (_template, callee_id, callee) ->
              let candidate = natrec_candidate machine instance node_id in
              let event =
                make_event machine instance candidate
                  Rewrite_event.NatRecStepFunctionEnter
                  ~used:[ Runtime_value.id state.step ]
                  [ Runtime_value.id predecessor ] [] ~callee_instance_id:callee_id ()
              in
              let state =
                {
                  state with
                  predecessor = None;
                  phase = Waiting_for_step_function callee_id;
                }
              in
              let caller = set_node_state instance node_id (NatRec_active state) in
              let frame =
                {
                  caller_instance_id = caller.id;
                  callee_instance_id = callee_id;
                  return_target =
                    NatRec_step
                      {
                        node_id;
                        iteration = state.next_predecessor;
                        stage = Step_function;
                        expected_result_type =
                          Core_type.Arrow (state.result_type, state.result_type);
                      };
                }
              in
              let machine =
                {
                  machine with
                  Machine.instances =
                    callee
                    :: List.map
                         (fun existing ->
                           if Instance_id.equal existing.id caller.id then caller
                           else existing)
                         machine.Machine.instances;
                  active_instance_id = callee_id;
                  call_stack = frame :: machine.Machine.call_stack;
                }
              in
              Rewritten { machine = append_event machine event; event }))

let rewrite_natrec_step_accumulator_enter machine instance node_id state =
  match state.partial with
  | None -> natrec_error node_id "NatRec partial closure is missing"
  | Some partial -> (
      let expected_partial = Core_type.Arrow (state.result_type, state.result_type) in
      match closure_payload node_id expected_partial partial with
      | Error error -> Runtime_error error
      | Ok closure -> (
          let call_site =
            Instance_id.NatRec_step_accumulator
              { node_id; iteration = state.next_predecessor }
          in
          match
            instantiate_closure_callee machine instance ~node_id ~call_site closure
              state.accumulator
          with
          | Error error -> Runtime_error error
          | Ok (_template, callee_id, callee) ->
              let candidate = natrec_candidate machine instance node_id in
              let event =
                make_event machine instance candidate
                  Rewrite_event.NatRecStepAccumulatorEnter
                  [ Runtime_value.id partial; Runtime_value.id state.accumulator ]
                  [] ~callee_instance_id:callee_id ()
              in
              let state =
                {
                  state with
                  partial = None;
                  phase = Waiting_for_step_accumulator callee_id;
                }
              in
              let caller = set_node_state instance node_id (NatRec_active state) in
              let frame =
                {
                  caller_instance_id = caller.id;
                  callee_instance_id = callee_id;
                  return_target =
                    NatRec_step
                      {
                        node_id;
                        iteration = state.next_predecessor;
                        stage = Step_accumulator;
                        expected_result_type = state.result_type;
                      };
                }
              in
              let machine =
                {
                  machine with
                  Machine.instances =
                    callee
                    :: List.map
                         (fun existing ->
                           if Instance_id.equal existing.id caller.id then caller
                           else existing)
                         machine.Machine.instances;
                  active_instance_id = callee_id;
                  call_stack = frame :: machine.Machine.call_stack;
                }
              in
              Rewritten { machine = append_event machine event; event }))

let rewrite_natrec_complete machine instance node_id state =
  let candidate = natrec_candidate machine instance node_id in
  let created =
    natrec_created_value instance machine node_id CG.Port_key.result
      (Runtime_value.payload state.accumulator)
  in
  if
    Runtime_value.Value_id.equal (Runtime_value.id created)
      (Runtime_value.id state.accumulator)
  then Runtime_error (Runtime_invariant_violation "NatRecComplete result aliases accumulator")
  else
    let event =
      make_event machine instance candidate Rewrite_event.NatRecComplete
        [ Runtime_value.id state.accumulator ] [ created ] ()
    in
    let instance = mark_completed instance node_id in
    let machine = append_event (update_instance machine instance) event in
    let instance = Machine.instance_by_id machine instance.id |> Option.get in
    match deliver_output instance.graph instance node_id CG.Port_key.result created with
    | Error message -> Runtime_error (Runtime_invariant_violation message)
    | Ok instance ->
        let instance = refresh_after_event instance machine.Machine.next_event_index in
        Rewritten { machine = update_instance machine instance; event }

let rewrite_natrec_active machine instance node_id state =
  match state.phase with
  | Need_unfold -> rewrite_natrec_unfold machine instance node_id state
  | Predecessor_ready -> rewrite_natrec_step_function_enter machine instance node_id state
  | Partial_ready -> rewrite_natrec_step_accumulator_enter machine instance node_id state
  | Ready_to_complete -> rewrite_natrec_complete machine instance node_id state
  | Waiting_for_step_function _ | Waiting_for_step_accumulator _ ->
      natrec_error node_id "NatRec is waiting for a callee return"

let rewrite_natrec_step_function_return machine callee frame node_id iteration
    expected_result_type =
  match (callee.result_value, Machine.instance_by_id machine frame.caller_instance_id) with
  | Some result_value, Some caller -> (
      match natrec_state_for caller node_id with
      | None -> natrec_error node_id "NatRec state missing for step function return"
      | Some state -> (
          match state.phase with
          | Waiting_for_step_function waiting
            when Instance_id.equal waiting frame.callee_instance_id
                 && Nat.equal iteration state.next_predecessor ->
              if
                not
                  (Core_type.equal (Runtime_value.typ result_value)
                     expected_result_type)
              then
                Runtime_error
                  (Invalid_natrec_runtime_payload
                     {
                       node_id;
                       expected = expected_result_type;
                       actual = Runtime_value.typ result_value;
                     })
              else
                let candidate = natrec_candidate machine caller node_id in
                let partial =
                  natrec_created_value caller machine node_id CG.Port_key.partial
                    (Runtime_value.payload result_value)
                in
                let event =
                  make_event machine caller candidate
                    Rewrite_event.NatRecStepFunctionReturn
                    [ Runtime_value.id result_value ] [ partial ]
                    ~callee_instance_id:callee.id ()
                in
                let state =
                  { state with partial = Some partial; phase = Partial_ready }
                in
                let caller = set_node_state caller node_id (NatRec_active state) in
                let machine =
                  {
                    (append_event (update_instance machine caller) event) with
                    Machine.active_instance_id = caller.id;
                    call_stack = List.tl machine.Machine.call_stack;
                  }
                in
                Rewritten { machine; event }
          | Waiting_for_step_function _ ->
              natrec_error node_id "NatRec step function return instance mismatch"
          | _ -> natrec_error node_id "NatRec is not waiting for step function return"))
  | None, _ -> Stuck (stuck_reason callee)
  | _, None -> Runtime_error (Runtime_invariant_violation "caller instance missing")

let rewrite_natrec_step_accumulator_return machine callee frame node_id iteration
    expected_result_type =
  match (callee.result_value, Machine.instance_by_id machine frame.caller_instance_id) with
  | Some result_value, Some caller -> (
      match natrec_state_for caller node_id with
      | None -> natrec_error node_id "NatRec state missing for step accumulator return"
      | Some state -> (
          match state.phase with
          | Waiting_for_step_accumulator waiting
            when Instance_id.equal waiting frame.callee_instance_id
                 && Nat.equal iteration state.next_predecessor ->
              if
                not
                  (Core_type.equal (Runtime_value.typ result_value)
                     expected_result_type)
              then
                Runtime_error
                  (Invalid_natrec_runtime_payload
                     {
                       node_id;
                       expected = expected_result_type;
                       actual = Runtime_value.typ result_value;
                     })
              else
                let candidate = natrec_candidate machine caller node_id in
                let next_accumulator =
                  natrec_created_value caller machine node_id CG.Port_key.accumulator
                    (Runtime_value.payload result_value)
                in
                let next_predecessor = Nat.succ state.next_predecessor in
                let phase =
                  if Nat.compare next_predecessor state.total_count >= 0 then
                    Ready_to_complete
                  else Need_unfold
                in
                let event =
                  make_event machine caller candidate
                    Rewrite_event.NatRecStepAccumulatorReturn
                    [ Runtime_value.id result_value ] [ next_accumulator ]
                    ~callee_instance_id:callee.id ()
                in
                let state =
                  {
                    state with
                    next_predecessor;
                    accumulator = next_accumulator;
                    phase;
                  }
                in
                let caller = set_node_state caller node_id (NatRec_active state) in
                let machine =
                  {
                    (append_event (update_instance machine caller) event) with
                    Machine.active_instance_id = caller.id;
                    call_stack = List.tl machine.Machine.call_stack;
                  }
                in
                Rewritten { machine; event }
          | Waiting_for_step_accumulator _ ->
              natrec_error node_id "NatRec step accumulator return instance mismatch"
          | _ -> natrec_error node_id "NatRec is not waiting for step accumulator return"))
  | None, _ -> Stuck (stuck_reason callee)
  | _, None -> Runtime_error (Runtime_invariant_violation "caller instance missing")

let step machine =
  match Machine.active_instance machine with
  | None -> Runtime_error (Runtime_invariant_violation "active instance missing")
  | Some active when Machine.instance_completed active -> (
      match machine.Machine.call_stack with
      | frame :: _ when Instance_id.equal frame.callee_instance_id active.id -> (
          match frame.return_target with
          | Apply_result { apply_node_id; expected_result_type } ->
              rewrite_apply_return machine active frame apply_node_id
                expected_result_type
          | NatRec_step { node_id; iteration; stage = Step_function; expected_result_type } ->
              rewrite_natrec_step_function_return machine active frame node_id
                iteration expected_result_type
          | NatRec_step { node_id; iteration; stage = Step_accumulator; expected_result_type } ->
              rewrite_natrec_step_accumulator_return machine active frame node_id
                iteration expected_result_type)
      | [] when Instance_id.equal active.id root_instance_id -> (
          match active.result_value with
          | Some value -> Completed value
          | None -> Stuck (stuck_reason active))
      | _ -> Runtime_error (Runtime_invariant_violation "completed instance without matching frame"))
  | Some active -> (
      match
        active.node_states
        |> List.find_opt (function
             | _, NatRec_active _ -> true
             | _ -> false)
      with
      | Some (node_id, NatRec_active state) ->
          rewrite_natrec_active machine active node_id state
      | _ -> (
      match select_ready active.ready_candidates with
      | None -> Stuck (stuck_reason active)
      | Some candidate -> (
          match node_by_id active.graph candidate.node_id with
          | Some { kind = CG.Succ; _ } -> rewrite_succ machine active candidate
          | Some { kind = CG.Drop _; _ } -> rewrite_drop machine active candidate
          | Some { kind = CG.Copy expected; _ } -> rewrite_copy machine active candidate expected
          | Some { kind = CG.Function signature; _ } ->
              rewrite_function machine active candidate signature
          | Some { kind = CG.Apply signature; _ } ->
              rewrite_apply_enter machine active candidate signature
          | Some { kind = CG.NatRec result_type; _ } ->
              rewrite_natrec_initial machine active candidate result_type
          | _ -> Stuck (stuck_reason active))))

let run machine =
  let rec loop machine =
    match step machine with
    | Completed value -> Run_completed { value; trace = Machine.trace_events machine }
    | Stuck reason -> Run_stuck { reason; trace = Machine.trace_events machine }
    | Runtime_error error -> Run_error { error; trace = Machine.trace_events machine }
    | Rewritten { machine; _ } -> loop machine
  in
  loop machine

let initialization_error_to_string = function
  | Input_type_mismatch { expected; actual } ->
      "input type mismatch: expected " ^ Core_type.to_string expected ^ ", actual "
      ^ Core_type.to_string actual
  | Unsupported_runtime_input_type typ ->
      "unsupported runtime input type: " ^ Core_type.to_string typ
  | Initial_delivery_invariant_violation message ->
      "initial delivery invariant violation: " ^ message

let runtime_error_to_string = function
  | Unsupported_copy_payload_type { node_id; typ } ->
      "unsupported Copy payload type at " ^ CG.Node_id.to_string node_id ^ ": "
      ^ Core_type.to_string typ
  | Function_template_not_found { node_id; template_id } ->
      "function template not found at " ^ CG.Node_id.to_string node_id ^ ": "
      ^ CG.Function_template_id.to_string template_id
  | Function_capture_delivery_invariant_violation { node_id; message } ->
      "Function capture delivery invariant violation at "
      ^ CG.Node_id.to_string node_id ^ ": " ^ message
  | Invalid_arrow_runtime_payload { node_id; expected; actual } ->
      "invalid Arrow runtime payload at " ^ CG.Node_id.to_string node_id
      ^ ": expected " ^ Core_type.to_string expected ^ ", actual "
      ^ Core_type.to_string actual
  | Invalid_apply_runtime_payload { node_id; expected; actual } ->
      "invalid Apply runtime payload at " ^ CG.Node_id.to_string node_id
      ^ ": expected " ^ Core_type.to_string expected ^ ", actual "
      ^ Core_type.to_string actual
  | Apply_template_not_found { node_id; template_id } ->
      "Apply template not found at " ^ CG.Node_id.to_string node_id ^ ": "
      ^ CG.Function_template_id.to_string template_id
  | Apply_result_type_mismatch { node_id; expected; actual } ->
      "Apply result type mismatch at " ^ CG.Node_id.to_string node_id
      ^ ": expected " ^ Core_type.to_string expected ^ ", actual "
      ^ Core_type.to_string actual
  | Invalid_natrec_runtime_payload { node_id; expected; actual } ->
      "invalid NatRec runtime payload at " ^ CG.Node_id.to_string node_id
      ^ ": expected " ^ Core_type.to_string expected ^ ", actual "
      ^ Core_type.to_string actual
  | NatRec_lifecycle_error { node_id; message } ->
      "NatRec lifecycle error at " ^ CG.Node_id.to_string node_id ^ ": "
      ^ message
  | Runtime_invariant_violation message -> "runtime invariant violation: " ^ message
