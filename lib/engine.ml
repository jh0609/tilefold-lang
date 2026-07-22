module CG = Core_graph

type initialization_error =
  | Input_type_mismatch of {
      expected : Core_type.t;
      actual : Core_type.t;
    }
  | Unsupported_runtime_input_type of Core_type.t
  | Initial_delivery_invariant_violation of string

type ready_candidate = {
  node_id : CG.Node_id.t;
  ready_epoch : int;
  default_order_rank : int;
}

type stuck_reason = {
  unexecuted_nodes : CG.Node_id.t list;
  result_missing : bool;
}

type runtime_error =
  | Unsupported_copy_payload_type of {
      node_id : CG.Node_id.t;
      typ : Core_type.t;
    }
  | Runtime_invariant_violation of string

type port_binding = {
  port_ref : CG.port_ref;
  value : Runtime_value.t;
}

module Machine = struct
  type t = {
    graph : CG.Validated_graph.t;
    bindings : port_binding list;
    executed_nodes : CG.Node_id.t list;
    ready_candidates : ready_candidate list;
    result_value : Runtime_value.t option;
    next_event_index : int;
    trace_events : Rewrite_event.t list;
  }

  let ready_candidates machine = machine.ready_candidates
  let result_value machine = machine.result_value
  let trace_events machine = machine.trace_events

  let values machine =
    let binding_values = List.map (fun binding -> binding.value) machine.bindings in
    let result_values =
      match machine.result_value with
      | Some value -> [ value ]
      | None -> []
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
    add_unique [] (binding_values @ result_values @ created_values)

  let executable_nodes machine =
    CG.Validated_graph.default_node_order machine.graph

  let is_executed machine node_id =
    List.exists (fun executed -> CG.Node_id.equal executed node_id) machine.executed_nodes

  let is_completed machine =
    Option.is_some machine.result_value
    && List.for_all (is_executed machine) (executable_nodes machine)
    && machine.ready_candidates = []
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

let executable_node_ids graph = CG.Validated_graph.default_node_order graph

let is_ready graph bindings executed_nodes node_id =
  if List.exists (fun executed -> CG.Node_id.equal executed node_id) executed_nodes then
    false
  else
    match node_by_id graph node_id with
    | None -> false
    | Some { kind = CG.Succ; _ } -> (
        match binding_for bindings node_id CG.Port_key.input with
        | Some value -> Core_type.equal (Runtime_value.typ value) Core_type.Nat
        | None -> false)
    | Some { kind = CG.Drop expected; _ } -> (
        match binding_for bindings node_id CG.Port_key.input with
        | Some value -> Core_type.equal (Runtime_value.typ value) expected
        | None -> false)
    | Some { kind = CG.Copy expected; _ } -> (
        match binding_for bindings node_id CG.Port_key.input with
        | Some value -> Core_type.equal (Runtime_value.typ value) expected
        | None -> false)
    | Some _ -> false

let ready_candidate graph epoch node_id =
  match default_order_rank graph node_id with
  | Some default_order_rank -> Some { node_id; ready_epoch = epoch; default_order_rank }
  | None -> None

let initial_ready_candidates graph bindings =
  executable_node_ids graph
  |> List.filter (is_ready graph bindings [])
  |> List.filter_map (ready_candidate graph 0)

let ready_contains ready node_id =
  List.exists (fun candidate -> CG.Node_id.equal candidate.node_id node_id) ready

let refresh_ready_candidates graph bindings executed_nodes existing_ready epoch =
  let still_ready =
    existing_ready
    |> List.filter (fun candidate ->
           is_ready graph bindings executed_nodes candidate.node_id)
  in
  let new_ready =
    executable_node_ids graph
    |> List.filter (fun node_id ->
           is_ready graph bindings executed_nodes node_id
           && not (ready_contains still_ready node_id))
    |> List.filter_map (ready_candidate graph epoch)
  in
  still_ready @ new_ready

let select_ready candidates =
  let compare_candidate left right =
    match Int.compare left.ready_epoch right.ready_epoch with
    | 0 -> Int.compare left.default_order_rank right.default_order_rank
    | other -> other
  in
  match List.sort compare_candidate candidates with
  | selected :: _ -> Some selected
  | [] -> None

let deliver_to_target graph state target value =
  match node_by_id graph target.CG.node_id with
  | Some { kind = CG.Result _; _ } ->
      if Option.is_some state.Machine.result_value then
        Error "result boundary already has a value"
      else Ok { state with Machine.result_value = Some value }
  | Some _ ->
      if Option.is_some (binding_for state.Machine.bindings target.node_id target.port_key)
      then
        Error
          ("target input already has a value: " ^ CG.Node_id.to_string target.node_id
         ^ "." ^ CG.Port_key.to_string target.port_key)
      else Ok { state with bindings = { port_ref = target; value } :: state.bindings }
  | None ->
      Error ("missing delivery target node: " ^ CG.Node_id.to_string target.node_id)

let deliver_output graph state node_id port_key value =
  match outgoing_edge graph node_id port_key with
  | None ->
      Error
        ("missing outgoing edge from " ^ CG.Node_id.to_string node_id ^ "."
       ^ CG.Port_key.to_string port_key)
  | Some edge -> deliver_to_target graph state edge.target value

let empty_machine graph =
  {
    Machine.graph;
    bindings = [];
    executed_nodes = [];
    ready_candidates = [];
    result_value = None;
    next_event_index = 0;
    trace_events = [];
  }

let materialize_input graph input =
  let expected = CG.Validated_graph.parameter_type graph in
  match expected with
  | Core_type.Arrow _ -> Error (Unsupported_runtime_input_type expected)
  | Core_type.Unit | Core_type.Nat ->
      if payload_matches_type input expected then
        let value =
          Runtime_value.create ~id:Runtime_value.execution_input_id ~payload:input
            ~origin:Runtime_value.Execution_input
        in
        Ok value
      else Error (Input_type_mismatch { expected; actual = Runtime_value.payload_type input })

let materialize_literal = function
  | { CG.kind = CG.Unit_literal; id } ->
      Some
        (Runtime_value.create ~id:(Runtime_value.program_literal_id id)
           ~payload:Runtime_value.Unit
           ~origin:(Runtime_value.Program_literal id))
  | { CG.kind = CG.Nat_literal nat; id } ->
      Some
        (Runtime_value.create ~id:(Runtime_value.program_literal_id id)
           ~payload:(Runtime_value.Nat nat)
           ~origin:(Runtime_value.Program_literal id))
  | _ -> None

let initialize graph ~input =
  match materialize_input graph input with
  | Error error -> Error error
  | Ok input_value ->
      let initial = empty_machine graph in
      let parameter = CG.Validated_graph.parameter_node graph in
      let result =
        deliver_output graph initial parameter.id CG.Port_key.value input_value
        |> Result.map_error (fun message ->
               Initial_delivery_invariant_violation message)
      in
      let result =
        match result with
        | Error _ as error -> error
        | Ok state ->
            CG.Validated_graph.nodes graph
            |> List.filter_map materialize_literal
            |> List.fold_left
                 (fun state_result value ->
                   match state_result with
                   | Error _ as error -> error
                   | Ok state -> (
                       match Runtime_value.origin value with
                       | Program_literal node_id ->
                           deliver_output graph state node_id CG.Port_key.value value
                           |> Result.map_error (fun message ->
                                  Initial_delivery_invariant_violation message)
                       | Execution_input | Rewrite_output _ ->
                           Error
                             (Initial_delivery_invariant_violation
                                "unexpected non-literal value during literal materialization")))
                 (Ok state)
      in
      result
      |> Result.map (fun state ->
             {
               state with
               Machine.ready_candidates =
                 initial_ready_candidates graph state.Machine.bindings;
             })

let unexecuted_nodes machine =
  Machine.executable_nodes machine
  |> List.filter (fun node_id -> not (Machine.is_executed machine node_id))

let stuck_reason machine =
  {
    unexecuted_nodes = unexecuted_nodes machine;
    result_missing = Option.is_none (Machine.result_value machine);
  }

let append_event machine event =
  {
    machine with
    Machine.trace_events = machine.Machine.trace_events @ [ event ];
    next_event_index = machine.Machine.next_event_index + 1;
  }

let mark_executed machine node_id =
  { machine with Machine.executed_nodes = node_id :: machine.Machine.executed_nodes }

let remove_ready machine node_id =
  {
    machine with
    Machine.ready_candidates =
      List.filter
        (fun candidate -> not (CG.Node_id.equal candidate.node_id node_id))
        machine.Machine.ready_candidates;
  }

let rewrite_succ machine candidate =
  match binding_for machine.Machine.bindings candidate.node_id CG.Port_key.input with
  | Some input_value -> (
      match Runtime_value.payload input_value with
      | Runtime_value.Nat nat ->
          let event_index = machine.Machine.next_event_index in
          let created =
            Runtime_value.create
              ~id:
                (Runtime_value.rewrite_output_id event_index candidate.node_id
                   CG.Port_key.result)
              ~payload:(Runtime_value.Nat (Nat.succ nat))
              ~origin:
                (Runtime_value.Rewrite_output
                   {
                     event_index;
                     node_id = candidate.node_id;
                     port_key = CG.Port_key.result;
                   })
          in
          let event =
            {
              Rewrite_event.index = event_index;
              rule = Rewrite_event.Succ;
              subject = candidate.node_id;
              ready_epoch = candidate.ready_epoch;
              consumed = [ Runtime_value.id input_value ];
              created = [ created ];
            }
          in
          let machine = remove_ready machine candidate.node_id in
          let machine = mark_executed machine candidate.node_id in
          let machine = append_event machine event in
          (match
             deliver_output machine.Machine.graph machine candidate.node_id
               CG.Port_key.result created
           with
          | Error message -> Runtime_error (Runtime_invariant_violation message)
          | Ok machine ->
              let machine =
                {
                  machine with
                  Machine.ready_candidates =
                    refresh_ready_candidates machine.Machine.graph machine.Machine.bindings
                      machine.Machine.executed_nodes machine.Machine.ready_candidates
                      machine.Machine.next_event_index;
                }
              in
              Rewritten { machine; event })
      | Runtime_value.Unit -> Stuck (stuck_reason machine))
  | None -> Stuck (stuck_reason machine)

let copy_payload candidate expected input_value =
  match (expected, Runtime_value.payload input_value) with
  | Core_type.Unit, Runtime_value.Unit -> Ok Runtime_value.Unit
  | Core_type.Nat, Runtime_value.Nat nat -> Ok (Runtime_value.Nat nat)
  | Core_type.Arrow _, _ ->
      Error (Unsupported_copy_payload_type { node_id = candidate.node_id; typ = expected })
  | _ ->
      Error
        (Runtime_invariant_violation
           ("Copy input payload does not match declared type at "
          ^ CG.Node_id.to_string candidate.node_id))

let copy_created_value event_index node_id port_key payload =
  Runtime_value.create
    ~id:(Runtime_value.rewrite_output_id event_index node_id port_key)
    ~payload
    ~origin:(Runtime_value.Rewrite_output { event_index; node_id; port_key })

let rewrite_copy machine candidate expected =
  match binding_for machine.Machine.bindings candidate.node_id CG.Port_key.input with
  | None -> Stuck (stuck_reason machine)
  | Some input_value -> (
      match copy_payload candidate expected input_value with
      | Error error -> Runtime_error error
      | Ok payload ->
          let event_index = machine.Machine.next_event_index in
          let left =
            copy_created_value event_index candidate.node_id CG.Port_key.left payload
          in
          let right =
            copy_created_value event_index candidate.node_id CG.Port_key.right payload
          in
          if Runtime_value.Value_id.equal (Runtime_value.id left) (Runtime_value.id right)
          then Runtime_error (Runtime_invariant_violation "Copy output ID collision")
          else if
            Runtime_value.Value_id.equal (Runtime_value.id left)
              (Runtime_value.id input_value)
            || Runtime_value.Value_id.equal (Runtime_value.id right)
                 (Runtime_value.id input_value)
          then Runtime_error (Runtime_invariant_violation "Copy output ID aliases input")
          else
            let event =
              {
                Rewrite_event.index = event_index;
                rule = Rewrite_event.Copy;
                subject = candidate.node_id;
                ready_epoch = candidate.ready_epoch;
                consumed = [ Runtime_value.id input_value ];
                created = [ left; right ];
              }
            in
            let machine = remove_ready machine candidate.node_id in
            let machine = mark_executed machine candidate.node_id in
            let machine = append_event machine event in
            match
              deliver_output machine.Machine.graph machine candidate.node_id
                CG.Port_key.left left
            with
            | Error message -> Runtime_error (Runtime_invariant_violation message)
            | Ok machine -> (
                match
                  deliver_output machine.Machine.graph machine candidate.node_id
                    CG.Port_key.right right
                with
                | Error message -> Runtime_error (Runtime_invariant_violation message)
                | Ok machine ->
                    let machine =
                      {
                        machine with
                        Machine.ready_candidates =
                          refresh_ready_candidates machine.Machine.graph
                            machine.Machine.bindings machine.Machine.executed_nodes
                            machine.Machine.ready_candidates
                            machine.Machine.next_event_index;
                      }
                    in
                    Rewritten { machine; event }))

let rewrite_drop machine candidate =
  match binding_for machine.Machine.bindings candidate.node_id CG.Port_key.input with
  | Some input_value ->
      let event_index = machine.Machine.next_event_index in
      let event =
        {
          Rewrite_event.index = event_index;
          rule = Rewrite_event.Drop;
          subject = candidate.node_id;
          ready_epoch = candidate.ready_epoch;
          consumed = [ Runtime_value.id input_value ];
          created = [];
        }
      in
      let machine = remove_ready machine candidate.node_id in
      let machine = mark_executed machine candidate.node_id in
      let machine = append_event machine event in
      let machine =
        {
          machine with
          Machine.ready_candidates =
            refresh_ready_candidates machine.Machine.graph machine.Machine.bindings
              machine.Machine.executed_nodes machine.Machine.ready_candidates
              machine.Machine.next_event_index;
        }
      in
      Rewritten { machine; event }
  | None -> Stuck (stuck_reason machine)

let step machine =
  match Machine.result_value machine with
  | Some value when Machine.is_completed machine -> Completed value
  | _ -> (
      match select_ready (Machine.ready_candidates machine) with
      | None -> Stuck (stuck_reason machine)
      | Some candidate -> (
          match node_by_id machine.Machine.graph candidate.node_id with
          | Some { kind = CG.Succ; _ } -> rewrite_succ machine candidate
          | Some { kind = CG.Drop _; _ } -> rewrite_drop machine candidate
          | Some { kind = CG.Copy expected; _ } -> rewrite_copy machine candidate expected
          | _ -> Stuck (stuck_reason machine)))

let run machine =
  let rec loop machine =
    match step machine with
    | Completed value ->
        Run_completed { value; trace = Machine.trace_events machine }
    | Stuck reason -> Run_stuck { reason; trace = Machine.trace_events machine }
    | Runtime_error error ->
        Run_error { error; trace = Machine.trace_events machine }
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
  | Runtime_invariant_violation message -> "runtime invariant violation: " ^ message
