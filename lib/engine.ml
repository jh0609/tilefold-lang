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
  | Runtime_invariant_violation of string

type port_binding = {
  port_ref : CG.port_ref;
  value : Runtime_value.t;
}

type node_state =
  | Pending
  | Waiting_for_return of Instance_id.t
  | Completed

type instance = {
  id : Instance_id.t;
  graph : CG.Validated_graph.t;
  bindings : port_binding list;
  node_states : (CG.Node_id.t * node_state) list;
  ready_candidates : ready_candidate list;
  result_value : Runtime_value.t option;
}

type call_frame = {
  caller_instance_id : Instance_id.t;
  apply_node_id : CG.Node_id.t;
  callee_instance_id : Instance_id.t;
  expected_result_type : Core_type.t;
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
    let instance_values =
      machine.instances
      |> List.concat_map (fun instance ->
             let binding_values = List.map (fun binding -> binding.value) instance.bindings in
             let result_values =
               match instance.result_value with
               | Some value -> [ value ]
               | None -> []
             in
             binding_values @ result_values)
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
  | Completed | Waiting_for_return _ -> false
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

let make_event machine instance candidate rule consumed created ?callee_instance_id () =
  {
    Rewrite_event.index = machine.Machine.next_event_index;
    rule;
    instance_id = instance.id;
    subject = event_subject_id instance candidate.node_id;
    ready_epoch = candidate.ready_epoch;
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
         | Pending | Waiting_for_return _ -> true)

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

let instantiate_callee machine caller candidate closure argument =
  match function_template_by_id machine.Machine.function_templates closure.Runtime_value.template_id with
  | None ->
      Error
        (Apply_template_not_found
           { node_id = candidate.node_id; template_id = closure.template_id })
  | Some template ->
      let event_index = machine.Machine.next_event_index in
      let callee_id =
        Instance_id.call ~parent:caller.id ~apply_node:candidate.node_id
          ~call_index:event_index
      in
      let body = CG.Function_template.body template in
      let result =
        activate_instance ~id:callee_id ~graph:body ~parameter_value:argument
          ~captures:closure.captures
      in
      result
      |> Result.map_error (fun message -> Runtime_invariant_violation message)
      |> Result.map (fun callee -> (template, callee_id, callee))

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
                    apply_node_id = candidate.node_id;
                    callee_instance_id = callee_id;
                    expected_result_type = signature.apply_result_type;
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

let rewrite_apply_return machine callee frame =
  match (callee.result_value, Machine.instance_by_id machine frame.caller_instance_id) with
  | Some result_value, Some caller ->
      if not (Core_type.equal (Runtime_value.typ result_value) frame.expected_result_type)
      then
        Runtime_error
          (Apply_result_type_mismatch
             {
               node_id = frame.apply_node_id;
               expected = frame.expected_result_type;
               actual = Runtime_value.typ result_value;
             })
      else if
        not
          (match node_state caller frame.apply_node_id with
          | Waiting_for_return waiting ->
              Instance_id.equal waiting frame.callee_instance_id
          | Pending | Completed -> false)
      then
        Runtime_error
          (Runtime_invariant_violation
             ("ApplyReturn frame does not match caller node lifecycle at "
            ^ CG.Node_id.to_string frame.apply_node_id))
      else
        let candidate =
          {
            instance_id = caller.id;
            node_id = frame.apply_node_id;
            ready_epoch = machine.Machine.next_event_index;
            priority_spine_rank = None;
            default_order_rank = Option.value (default_order_rank caller.graph frame.apply_node_id) ~default:0;
          }
        in
        let created =
          Runtime_value.create
            ~id:
              (rewrite_output_id caller machine.Machine.next_event_index
                 frame.apply_node_id CG.Port_key.result)
            ~payload:(Runtime_value.payload result_value)
            ~origin:
              (rewrite_output_origin caller machine.Machine.next_event_index
                 frame.apply_node_id CG.Port_key.result)
        in
        let event =
          make_event machine caller candidate Rewrite_event.ApplyReturn
            [ Runtime_value.id result_value ] [ created ]
            ~callee_instance_id:callee.id ()
        in
        let caller = mark_completed caller frame.apply_node_id in
        let machine = append_event (update_instance machine caller) event in
        let caller = Machine.instance_by_id machine caller.id |> Option.get in
        (match deliver_output caller.graph caller frame.apply_node_id CG.Port_key.result created with
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

let step machine =
  match Machine.active_instance machine with
  | None -> Runtime_error (Runtime_invariant_violation "active instance missing")
  | Some active when Machine.instance_completed active -> (
      match machine.Machine.call_stack with
      | frame :: _ when Instance_id.equal frame.callee_instance_id active.id ->
          rewrite_apply_return machine active frame
      | [] when Instance_id.equal active.id root_instance_id -> (
          match active.result_value with
          | Some value -> Completed value
          | None -> Stuck (stuck_reason active))
      | _ -> Runtime_error (Runtime_invariant_violation "completed instance without matching frame"))
  | Some active -> (
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
          | _ -> Stuck (stuck_reason active)))

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
  | Runtime_invariant_violation message -> "runtime invariant violation: " ^ message
