open Tilefold

module Make_id (Description : sig
  val description : string
end) =
struct
  type t = string

  let of_string value =
    if String.equal value "" then
      Error (Description.description ^ " must not be empty")
    else Ok value

  let compare = String.compare
  let equal = String.equal
  let to_string value = value
end

module Function_id =
  Make_id (struct
    let description = "surface function ID"
  end)

module Name =
  Make_id (struct
    let description = "surface name"
  end)

type parameter = {
  name : Name.t;
  typ : Core_type.t;
}

type result = {
  name : Name.t;
  typ : Core_type.t;
}

type expression =
  | Parameter of Name.t
  | Unit_literal
  | Nat_literal of Nat.t
  | Call of call

and call = {
  function_id : Function_id.t;
  arguments : argument list;
}

and argument = {
  parameter : Name.t;
  value : expression;
}

type function_decl = {
  id : Function_id.t;
  parameters : parameter list;
  result : result;
  body : expression;
}

module Raw = struct
  type t = { functions : function_decl list }

  let create ~functions = { functions }
end

type validation_error =
  | Duplicate_function_id of Function_id.t
  | Duplicate_parameter_name of {
      function_id : Function_id.t;
      name : Name.t;
    }
  | Unknown_parameter_reference of {
      function_id : Function_id.t;
      name : Name.t;
    }
  | Unknown_call_target of {
      function_id : Function_id.t;
      target : Function_id.t;
    }
  | Duplicate_call_argument of {
      function_id : Function_id.t;
      target : Function_id.t;
      parameter : Name.t;
    }
  | Missing_call_argument of {
      function_id : Function_id.t;
      target : Function_id.t;
      parameter : Name.t;
    }
  | Unexpected_call_argument of {
      function_id : Function_id.t;
      target : Function_id.t;
      parameter : Name.t;
    }
  | Call_argument_type_mismatch of {
      function_id : Function_id.t;
      target : Function_id.t;
      parameter : Name.t;
      expected : Core_type.t;
      actual : Core_type.t;
    }
  | Result_type_mismatch of {
      function_id : Function_id.t;
      expected : Core_type.t;
      actual : Core_type.t;
    }
  | Function_call_cycle of Function_id.t list

type t = {
  functions : function_decl list;
  canonical : string;
}

type lowering_error =
  | Entry_function_not_found of Function_id.t
  | Entry_function_requires_no_parameters of {
      function_id : Function_id.t;
      actual : int;
    }
  | Generated_template_id_collision of {
      function_id : Function_id.t;
      generated_id : Core_graph.Function_template_id.t;
    }
  | Unsupported_value_type of {
      function_id : Function_id.t;
      binding : Name.t;
      typ : Core_type.t;
    }
  | Core_graph_validation_errors of {
      function_id : Function_id.t;
      errors : Core_graph.validation_error list;
    }
  | Program_package_validation_errors of Program_package.validation_error list
  | Lowering_invariant_violation of string

let functions program = program.functions
let canonical_serialization program = program.canonical

let find_duplicates compare values =
  let sorted = List.sort compare values in
  let rec loop previous duplicates = function
    | [] -> List.rev duplicates
    | value :: rest ->
        let is_duplicate =
          match previous with
          | Some previous -> compare previous value = 0
          | None -> false
        in
        let already_recorded =
          match duplicates with
          | duplicate :: _ -> compare duplicate value = 0
          | [] -> false
        in
        let duplicates =
          if is_duplicate && not already_recorded then value :: duplicates
          else duplicates
        in
        loop (Some value) duplicates rest
  in
  loop None [] sorted

let sorted_functions functions =
  List.sort
    (fun (left : function_decl) (right : function_decl) ->
      Function_id.compare left.id right.id)
    functions

let find_function functions id =
  List.find_opt
    (fun (function_decl : function_decl) ->
      Function_id.equal function_decl.id id)
    functions

let find_parameter parameters name =
  List.find_opt
    (fun (parameter : parameter) -> Name.equal parameter.name name)
    parameters

let sorted_arguments arguments =
  List.stable_sort
    (fun (left : argument) (right : argument) ->
      Name.compare left.parameter right.parameter)
    arguments

let rec call_targets = function
  | Parameter _ | Unit_literal | Nat_literal _ -> []
  | Call call ->
      call.function_id
      :: List.concat_map
           (fun (argument : argument) -> call_targets argument.value)
           call.arguments

let call_dependencies function_decl =
  call_targets function_decl.body
  |> List.sort_uniq Function_id.compare

let cycle_suffix id path =
  let rec loop = function
    | [] -> []
    | value :: rest as values ->
        if Function_id.equal value id then values else loop rest
  in
  loop path @ [ id ]

let call_cycle_errors functions =
  let rec visit path visited id =
    if List.exists (Function_id.equal id) path then
      (visited, [ Function_call_cycle (cycle_suffix id path) ])
    else if List.exists (Function_id.equal id) visited then (visited, [])
    else
      match find_function functions id with
      | None -> (visited, [])
      | Some function_decl ->
          let dependencies =
            call_dependencies function_decl
            |> List.filter (fun dependency ->
                   Option.is_some (find_function functions dependency))
          in
          let visited, errors =
            List.fold_left
              (fun (visited, errors) dependency ->
                let visited, dependency_errors =
                  visit (path @ [ id ]) visited dependency
                in
                (visited, errors @ dependency_errors))
              (visited, []) dependencies
          in
          (id :: visited, errors)
  in
  let _, errors =
    List.fold_left
      (fun (visited, errors) (function_decl : function_decl) ->
        let visited, function_errors =
          visit [] visited function_decl.id
        in
        (visited, errors @ function_errors))
      ([], []) functions
  in
  errors

let rec infer_expression ~owner ~functions ~parameters expression =
  match expression with
  | Parameter name -> (
      match find_parameter parameters name with
      | Some parameter -> (Some parameter.typ, [])
      | None ->
          ( None,
            [
              Unknown_parameter_reference
                { function_id = owner; name };
            ] ))
  | Unit_literal -> (Some Core_type.Unit, [])
  | Nat_literal _ -> (Some Core_type.Nat, [])
  | Call call ->
      let arguments = sorted_arguments call.arguments in
      let inferred_arguments =
        List.map
          (fun (argument : argument) ->
            let typ, errors =
              infer_expression ~owner ~functions ~parameters argument.value
            in
            (argument, typ, errors))
          arguments
      in
      let expression_errors =
        List.concat_map
          (fun (_, _, errors) -> errors)
          inferred_arguments
      in
      match find_function functions call.function_id with
      | None ->
          ( None,
            expression_errors
            @ [
                Unknown_call_target
                  { function_id = owner; target = call.function_id };
              ] )
      | Some target ->
          let duplicate_errors =
            arguments
            |> List.map (fun (argument : argument) -> argument.parameter)
            |> find_duplicates Name.compare
            |> List.map (fun parameter ->
                   Duplicate_call_argument
                     {
                       function_id = owner;
                       target = call.function_id;
                       parameter;
                     })
          in
          let expected_errors =
            List.concat_map
              (fun (parameter : parameter) ->
                let matching =
                  List.filter
                    (fun (argument, _, _) ->
                      Name.equal argument.parameter parameter.name)
                    inferred_arguments
                in
                match matching with
                | [] ->
                    [
                      Missing_call_argument
                        {
                          function_id = owner;
                          target = call.function_id;
                          parameter = parameter.name;
                        };
                    ]
                | (_, Some actual, _) :: _
                  when not (Core_type.equal parameter.typ actual) ->
                    [
                      Call_argument_type_mismatch
                        {
                          function_id = owner;
                          target = call.function_id;
                          parameter = parameter.name;
                          expected = parameter.typ;
                          actual;
                        };
                    ]
                | _ -> [])
              target.parameters
          in
          let unexpected_errors =
            inferred_arguments
            |> List.filter_map (fun (argument, _, _) ->
                   if
                     Option.is_none
                       (find_parameter target.parameters argument.parameter)
                   then
                     Some
                       (Unexpected_call_argument
                          {
                            function_id = owner;
                            target = call.function_id;
                            parameter = argument.parameter;
                          })
                   else None)
          in
          ( Some target.result.typ,
            expression_errors @ duplicate_errors @ expected_errors
            @ unexpected_errors )

type sexp =
  | Atom of string
  | List of sexp list

let atom value = Atom value
let tagged tag values = List (Atom tag :: values)

let quote value =
  let buffer = Buffer.create (String.length value + 2) in
  Buffer.add_char buffer '"';
  String.iter
    (function
      | '"' -> Buffer.add_string buffer "\\\""
      | '\\' -> Buffer.add_string buffer "\\\\"
      | '\n' -> Buffer.add_string buffer "\\n"
      | '\r' -> Buffer.add_string buffer "\\r"
      | '\t' -> Buffer.add_string buffer "\\t"
      | char -> Buffer.add_char buffer char)
    value;
  Buffer.add_char buffer '"';
  Buffer.contents buffer

let rec render_sexp = function
  | Atom value -> quote value
  | List values ->
      "(" ^ String.concat " " (List.map render_sexp values) ^ ")"

let rec render_type = function
  | Core_type.Unit -> tagged "Unit" []
  | Core_type.Bool -> tagged "Bool" []
  | Core_type.Nat -> tagged "Nat" []
  | Core_type.Product (left, right) ->
      tagged "Product" [ render_type left; render_type right ]
  | Core_type.Sum (left, right) ->
      tagged "Sum" [ render_type left; render_type right ]
  | Core_type.List item -> tagged "List" [ render_type item ]
  | Core_type.Arrow (input, output) ->
      tagged "Arrow" [ render_type input; render_type output ]

let rec render_expression = function
  | Parameter name -> tagged "parameter-ref" [ atom (Name.to_string name) ]
  | Unit_literal -> tagged "unit" []
  | Nat_literal nat -> tagged "nat" [ atom (Nat.to_string nat) ]
  | Call call ->
      let arguments =
        sorted_arguments call.arguments
        |> List.map (fun (argument : argument) ->
               tagged "argument"
                 [
                   atom (Name.to_string argument.parameter);
                   render_expression argument.value;
                 ])
      in
      tagged "call"
        [
          atom (Function_id.to_string call.function_id);
          tagged "arguments" arguments;
        ]

let render_parameter (parameter : parameter) =
  tagged "parameter"
    [ atom (Name.to_string parameter.name); render_type parameter.typ ]

let render_result (result : result) =
  tagged "result"
    [ atom (Name.to_string result.name); render_type result.typ ]

let render_function (function_decl : function_decl) =
  tagged "function"
    [
      atom (Function_id.to_string function_decl.id);
      tagged "parameters"
        (List.map render_parameter function_decl.parameters);
      render_result function_decl.result;
      tagged "body" [ render_expression function_decl.body ];
    ]

let canonical_of_functions functions =
  tagged "tilefold-surface-program-v0"
    [ tagged "functions" (List.map render_function functions) ]
  |> render_sexp
  |> fun value -> value ^ "\n"

let validate raw =
  let functions = sorted_functions raw.Raw.functions in
  let duplicate_function_errors =
    functions
    |> List.map (fun (function_decl : function_decl) -> function_decl.id)
    |> find_duplicates Function_id.compare
    |> List.map (fun id -> Duplicate_function_id id)
  in
  let function_errors =
    List.concat_map
      (fun (function_decl : function_decl) ->
        let duplicate_parameter_errors =
          function_decl.parameters
          |> List.map (fun (parameter : parameter) -> parameter.name)
          |> find_duplicates Name.compare
          |> List.map (fun name ->
                 Duplicate_parameter_name
                   { function_id = function_decl.id; name })
        in
        let actual, expression_errors =
          infer_expression ~owner:function_decl.id ~functions
            ~parameters:function_decl.parameters function_decl.body
        in
        let result_errors =
          match actual with
          | Some actual
            when not (Core_type.equal function_decl.result.typ actual) ->
              [
                Result_type_mismatch
                  {
                    function_id = function_decl.id;
                    expected = function_decl.result.typ;
                    actual;
                  };
              ]
          | _ -> []
        in
        duplicate_parameter_errors @ expression_errors @ result_errors)
      functions
  in
  let errors =
    duplicate_function_errors @ function_errors
    @ call_cycle_errors functions
  in
  match errors with
  | [] ->
      Ok
        {
          functions;
          canonical = canonical_of_functions functions;
        }
  | _ -> Error errors

module CG = Core_graph
module P = Program_package

let ( let* ) result f =
  match result with Ok value -> f value | Error _ as error -> error

let core_template_id id =
  match CG.Function_template_id.of_string (Function_id.to_string id) with
  | Ok id -> id
  | Error message ->
      invalid_arg ("validated Surface function ID is not a Core template ID: " ^ message)

let generated_curried_template_id function_id stage =
  let value =
    Printf.sprintf "__surface_curried_%04d_%s" stage
      (Function_id.to_string function_id)
  in
  match CG.Function_template_id.of_string value with
  | Ok id -> id
  | Error message ->
      invalid_arg ("invalid generated curried template ID: " ^ message)

let generated_node_id value =
  match CG.Node_id.of_string value with
  | Ok id -> id
  | Error message -> invalid_arg ("invalid generated Surface node ID: " ^ message)

let generated_edge_id value =
  match CG.Edge_id.of_string value with
  | Ok id -> id
  | Error message -> invalid_arg ("invalid generated Surface edge ID: " ^ message)

let parameter_node_id = generated_node_id "__surface_parameter"
let result_node_id = generated_node_id "__surface_result"
let unit_drop_node_id = generated_node_id "__surface_unit_drop"
let parameter_drop_node_id = generated_node_id "__surface_parameter_drop"

let capture_node_id index =
  generated_node_id (Printf.sprintf "__surface_capture_%04d" index)

let capture_drop_node_id index =
  generated_node_id (Printf.sprintf "__surface_capture_drop_%04d" index)

let copy_node_id binding_index path =
  generated_node_id
    (Printf.sprintf "__surface_copy_%04d_%s" binding_index path)

let port_ref node_id port_key : CG.port_ref =
  { node_id; port_key }

let output node_id = port_ref node_id CG.Port_key.value
let input node_id = port_ref node_id CG.Port_key.input

let rec supported_value_type = function
  | Core_type.Unit | Core_type.Bool | Core_type.Nat -> true
  | Core_type.Product (left, right) | Core_type.Sum (left, right) ->
      supported_value_type left && supported_value_type right
  | Core_type.List item -> supported_value_type item
  | Core_type.Arrow _ -> false

let rec parameter_use_count parameter = function
  | Parameter name -> if Name.equal parameter name then 1 else 0
  | Unit_literal | Nat_literal _ -> 0
  | Call call ->
      List.fold_left
        (fun count (argument : argument) ->
          count + parameter_use_count parameter argument.value)
        0 call.arguments

let rec curried_result_type parameters result_type =
  match parameters with
  | [] -> result_type
  | (parameter : parameter) :: rest ->
      Core_type.Arrow
        (parameter.typ, curried_result_type rest result_type)

let capture_of_parameter (parameter : parameter) : CG.capture =
  {
    key = CG.Port_key.capture (Name.to_string parameter.name);
    typ = parameter.typ;
  }

type graph_build = {
  next_node : int;
  next_edge : int;
  nodes_rev : CG.node list;
  edges_rev : CG.edge list;
  order_rev : CG.Node_id.t list;
}

let add_expression_node label kind executable state =
  let node_id =
    generated_node_id
      (Printf.sprintf "__surface_expr_%04d_%s" state.next_node label)
  in
  let order_rev =
    if executable then node_id :: state.order_rev else state.order_rev
  in
  ( {
      state with
      next_node = state.next_node + 1;
      nodes_rev = { CG.id = node_id; kind } :: state.nodes_rev;
      order_rev;
    },
    node_id )

let add_edge source target state =
  let id =
    generated_edge_id
      (Printf.sprintf "__surface_edge_%04d" state.next_edge)
  in
  {
    state with
    next_edge = state.next_edge + 1;
    edges_rev = { CG.id; source; target } :: state.edges_rev;
  }

let rec build_copy_tree ~binding_index ~typ ~path ~uses source state =
  if uses <= 0 then
    invalid_arg "a generated Copy tree must have at least one leaf"
  else if uses = 1 then (state, [ source ])
  else
    let node_id = copy_node_id binding_index path in
    let node : CG.node = { id = node_id; kind = CG.Copy typ } in
    let state =
      {
        state with
        nodes_rev = node :: state.nodes_rev;
        order_rev = node_id :: state.order_rev;
      }
      |> add_edge source (input node_id)
    in
    let left_uses = (uses + 1) / 2 in
    let right_uses = uses / 2 in
    let state, left_sources =
      build_copy_tree ~binding_index ~typ ~path:(path ^ "L")
        ~uses:left_uses
        (port_ref node_id CG.Port_key.left)
        state
    in
    let state, right_sources =
      build_copy_tree ~binding_index ~typ ~path:(path ^ "R")
        ~uses:right_uses
        (port_ref node_id CG.Port_key.right)
        state
    in
    (state, left_sources @ right_sources)

type built_function = {
  surface_id : Function_id.t;
  outer_template : CG.Function_template.t;
  templates : CG.Function_template.t list;
}

let find_built_function built id =
  built
  |> List.find_opt (fun built_function ->
         Function_id.equal built_function.surface_id id)

let find_built_template built id =
  find_built_function built id
  |> Option.map (fun built_function -> built_function.outer_template)

let all_built_templates built =
  List.concat_map (fun built_function -> built_function.templates) built

let function_signature ?(captures = []) template : CG.function_signature =
  {
    template_id = CG.Function_template.id template;
    parameter_type = CG.Function_template.parameter_type template;
    result_type = CG.Function_template.result_type template;
    captures;
  }

type parameter_binding = {
  parameter : parameter;
  sources : CG.port_ref list;
}

let take_parameter_source bindings name =
  let rec loop preceding = function
    | [] ->
        Error
          [
            Lowering_invariant_violation
              ("validated parameter binding disappeared: "
              ^ Name.to_string name);
          ]
    | binding :: rest ->
        if Name.equal binding.parameter.name name then
          match binding.sources with
          | source :: sources ->
              Ok
                ( source,
                  List.rev_append preceding
                    ({ binding with sources } :: rest) )
          | [] ->
              Error
                [
                  Lowering_invariant_violation
                    ("generated parameter sources were exhausted: "
                    ^ Name.to_string name);
                ]
        else loop (binding :: preceding) rest
  in
  loop [] bindings

let find_call_argument call (parameter : parameter) =
  List.find_opt
    (fun (argument : argument) ->
      Name.equal argument.parameter parameter.name)
    call.arguments

let rec compile_expression functions built bindings state expression =
  match expression with
  | Parameter name ->
      let* source, bindings =
        take_parameter_source bindings name
      in
      Ok (state, bindings, source)
  | Unit_literal ->
      let state, node_id =
        add_expression_node "unit" CG.Unit_literal false state
      in
      Ok (state, bindings, output node_id)
  | Nat_literal nat ->
      let state, node_id =
        add_expression_node "nat" (CG.Nat_literal nat) false state
      in
      Ok (state, bindings, output node_id)
  | Call call -> (
      match find_function functions call.function_id with
      | None ->
          Error
            [
              Lowering_invariant_violation
                ("validated call target disappeared: "
                ^ Function_id.to_string call.function_id);
            ]
      | Some target -> (
          let* state, bindings, argument_sources_rev =
            List.fold_left
              (fun result (parameter : parameter) ->
                let* state, bindings, sources_rev = result in
                match find_call_argument call parameter with
                | None ->
                    Error
                      [
                        Lowering_invariant_violation
                          ("validated call argument disappeared: "
                          ^ Function_id.to_string call.function_id ^ "."
                          ^ Name.to_string parameter.name);
                      ]
                | Some argument ->
                    let* state, bindings, source =
                      compile_expression functions built bindings state
                        argument.value
                    in
                    Ok
                      ( state,
                        bindings,
                        (parameter, source) :: sources_rev ))
              (Ok (state, bindings, [])) target.parameters
          in
          match find_built_template built target.id with
          | None ->
              Error
                [
                  Lowering_invariant_violation
                    ("call target template was not built first: "
                    ^ Function_id.to_string target.id);
                ]
          | Some target_template ->
              let state, (argument_sources : (parameter option * CG.port_ref) list) =
                match List.rev argument_sources_rev with
                | [] ->
                    let state, unit_id =
                      add_expression_node "unit_argument" CG.Unit_literal false
                        state
                    in
                    (state, [ (None, output unit_id) ])
                | sources ->
                    ( state,
                      List.map
                        (fun (parameter, source) ->
                          (Some parameter, source))
                        sources )
              in
              let state, function_node_id =
                add_expression_node "function"
                  (CG.Function (function_signature target_template))
                  true state
              in
              let rec apply_arguments state function_source
                  (arguments : (parameter option * CG.port_ref) list) =
                match arguments with
                | [] -> Ok (state, bindings, function_source)
                | (parameter, argument_source) :: rest ->
                    let parameter_type, result_type =
                      match parameter with
                      | None ->
                          (Core_type.Unit, target.result.typ)
                      | Some parameter ->
                          ( parameter.typ,
                            curried_result_type
                              (List.filter_map fst rest)
                              target.result.typ )
                    in
                    let state, apply_node_id =
                      add_expression_node "apply"
                        (CG.Apply
                           {
                             apply_parameter_type = parameter_type;
                             apply_result_type = result_type;
                           })
                        true state
                    in
                    let state =
                      add_edge function_source
                        (port_ref apply_node_id CG.Port_key.function_input)
                        state
                    in
                    let state =
                      add_edge argument_source
                        (port_ref apply_node_id CG.Port_key.argument)
                        state
                    in
                    apply_arguments state
                      (port_ref apply_node_id CG.Port_key.result)
                      rest
              in
              apply_arguments state (output function_node_id)
                argument_sources))

let base_graph_state ~parameter_type ~result_type captures =
  let parameter_node : CG.node =
    { id = parameter_node_id; kind = CG.Parameter parameter_type }
  in
  let result_node : CG.node =
    { id = result_node_id; kind = CG.Result result_type }
  in
  let capture_nodes =
    List.mapi
      (fun index (capture : CG.capture) : CG.node ->
        { id = capture_node_id index; kind = CG.Capture capture })
      captures
  in
  let nodes = parameter_node :: capture_nodes @ [ result_node ] in
  {
    next_node = 0;
    next_edge = 0;
    nodes_rev = List.rev nodes;
    edges_rev = [];
    order_rev = [];
  }

let validate_generated_graph ~function_id ~available_templates state =
  let raw_graph =
    CG.Raw_graph.of_lists ~nodes:(List.rev state.nodes_rev)
      ~edges:(List.rev state.edges_rev)
      ~default_node_order:(List.rev state.order_rev)
  in
  match CG.validate_with_templates available_templates raw_graph with
  | Ok body -> Ok body
  | Error errors ->
      Error
        [
          Core_graph_validation_errors
            { function_id; errors };
        ]

let lower_body_template functions built function_decl =
  let preceding_parameters, current_parameter, parameter_type, template_id =
    match List.rev function_decl.parameters with
    | [] ->
        ([], None, Core_type.Unit, core_template_id function_decl.id)
    | current :: reversed_preceding ->
        let preceding = List.rev reversed_preceding in
        let stage = List.length preceding in
        let template_id =
          if stage = 0 then core_template_id function_decl.id
          else generated_curried_template_id function_decl.id stage
        in
        (preceding, Some current, current.typ, template_id)
  in
  let captures = List.map capture_of_parameter preceding_parameters in
  let initial =
    base_graph_state ~parameter_type
      ~result_type:function_decl.result.typ captures
  in
  let parameter_sources =
    List.mapi
      (fun index parameter ->
        (parameter, output (capture_node_id index)))
      preceding_parameters
  in
  let parameter_sources =
    match current_parameter with
    | None -> parameter_sources
    | Some parameter ->
        parameter_sources @ [ (parameter, output parameter_node_id) ]
  in
  let initial, bindings, drop_ids_rev =
    match current_parameter with
    | None ->
        let drop_node : CG.node =
          { id = unit_drop_node_id; kind = CG.Drop Core_type.Unit }
        in
        let state =
          { initial with nodes_rev = drop_node :: initial.nodes_rev }
          |> add_edge (output parameter_node_id) (input unit_drop_node_id)
        in
        (state, [], [ unit_drop_node_id ])
    | Some _ ->
        List.fold_left
          (fun (state, bindings_rev, drop_ids_rev)
               (index, ((parameter : parameter), source)) ->
            let uses =
              parameter_use_count parameter.name function_decl.body
            in
            if uses = 0 then
              let node_id =
                if index = List.length preceding_parameters then
                  parameter_drop_node_id
                else capture_drop_node_id index
              in
              let drop_node : CG.node =
                { id = node_id; kind = CG.Drop parameter.typ }
              in
              let state =
                { state with nodes_rev = drop_node :: state.nodes_rev }
                |> add_edge source (input node_id)
              in
              ( state,
                { parameter; sources = [] } :: bindings_rev,
                node_id :: drop_ids_rev )
            else
              let state, sources =
                build_copy_tree ~binding_index:index ~typ:parameter.typ
                  ~path:"root" ~uses source state
              in
              ( state,
                { parameter; sources } :: bindings_rev,
                drop_ids_rev ))
          (initial, [], [])
          (List.mapi
             (fun index parameter_source ->
               (index, parameter_source))
             parameter_sources)
        |> fun (state, bindings_rev, drop_ids_rev) ->
        (state, List.rev bindings_rev, drop_ids_rev)
  in
  let* state, remaining_bindings, body_source =
    compile_expression functions built bindings initial function_decl.body
  in
  let* () =
    match
      List.find_opt
        (fun binding -> binding.sources <> [])
        remaining_bindings
    with
    | None -> Ok ()
    | Some binding ->
        Error
          [
            Lowering_invariant_violation
              ("generated parameter sources were not consumed: "
              ^ Name.to_string binding.parameter.name);
          ]
  in
  let state =
    add_edge body_source
      (port_ref result_node_id CG.Port_key.value)
      state
  in
  let state =
    List.fold_left
      (fun state drop_id ->
        { state with order_rev = drop_id :: state.order_rev })
      state (List.rev drop_ids_rev)
  in
  let* body =
    validate_generated_graph ~function_id:function_decl.id
      ~available_templates:(all_built_templates built)
      state
  in
  let dependencies =
    call_dependencies function_decl
    |> List.map core_template_id
  in
  Ok
    (CG.Function_template.create ~dependencies ~id:template_id
       ~parameter_type ~result_type:function_decl.result.typ ~captures
       ~body ())

let lower_wrapper_template built function_decl ~stage ~inner_templates =
  let inner_template = List.hd inner_templates in
  let current_parameter = List.nth function_decl.parameters stage in
  let preceding_parameters =
    function_decl.parameters
    |> List.mapi (fun index parameter -> (index, parameter))
    |> List.filter_map (fun (index, parameter) ->
           if index < stage then Some parameter else None)
  in
  let captures = List.map capture_of_parameter preceding_parameters in
  let inner_captures =
    captures @ [ capture_of_parameter current_parameter ]
  in
  let result_type = CG.Function_template.signature_type inner_template in
  let initial =
    base_graph_state ~parameter_type:current_parameter.typ ~result_type
      captures
  in
  let function_node_id =
    generated_node_id "__surface_curried_function"
  in
  let function_node : CG.node =
    {
      id = function_node_id;
      kind =
        CG.Function
          (function_signature ~captures:inner_captures inner_template);
    }
  in
  let state =
    {
      initial with
      nodes_rev = function_node :: initial.nodes_rev;
      order_rev = [ function_node_id ];
    }
  in
  let state =
    List.mapi
      (fun index (capture : CG.capture) ->
        (output (capture_node_id index), capture.key))
      captures
    |> List.fold_left
         (fun state (source, target_key) ->
           add_edge source (port_ref function_node_id target_key) state)
         state
  in
  let state =
    add_edge (output parameter_node_id)
      (port_ref function_node_id
         (capture_of_parameter current_parameter).key)
      state
  in
  let state =
    add_edge (output function_node_id)
      (port_ref result_node_id CG.Port_key.value)
      state
  in
  let* body =
    validate_generated_graph ~function_id:function_decl.id
      ~available_templates:
        (inner_templates @ all_built_templates built)
      state
  in
  let id =
    if stage = 0 then core_template_id function_decl.id
    else generated_curried_template_id function_decl.id stage
  in
  Ok
    (CG.Function_template.create
       ~dependencies:[ CG.Function_template.id inner_template ]
       ~id ~parameter_type:current_parameter.typ ~result_type ~captures
       ~body ())

let lower_function_decl functions built function_decl =
  let* body_template =
    lower_body_template functions built function_decl
  in
  match List.length function_decl.parameters with
  | 0 | 1 ->
      Ok
        {
          surface_id = function_decl.id;
          outer_template = body_template;
          templates = [ body_template ];
        }
  | count ->
      let rec wrap stage inner_templates =
        if stage < 0 then
          Ok
            {
              surface_id = function_decl.id;
              outer_template = List.hd inner_templates;
              templates = inner_templates;
            }
        else
          let* wrapper =
            lower_wrapper_template built function_decl ~stage
              ~inner_templates
          in
          wrap (stage - 1) (wrapper :: inner_templates)
      in
      wrap (count - 2) [ body_template ]

let rec build_function functions built id =
  match find_built_function built id with
  | Some _ -> Ok built
  | None -> (
      match find_function functions id with
      | None ->
          Error
            [
              Lowering_invariant_violation
                ("validated Surface function disappeared: "
                ^ Function_id.to_string id);
            ]
      | Some function_decl ->
          let dependencies = call_dependencies function_decl in
          let* built =
            List.fold_left
              (fun result dependency ->
                let* built = result in
                build_function functions built dependency)
              (Ok built) dependencies
          in
          let* built_function =
            lower_function_decl functions built function_decl
          in
          Ok (built_function :: built))

let generated_template_collision_errors functions =
  let surface_ids =
    List.map
      (fun (function_decl : function_decl) ->
        core_template_id function_decl.id)
      functions
  in
  let generated =
    List.concat_map
      (fun (function_decl : function_decl) ->
        let rec loop stage generated =
          if stage >= List.length function_decl.parameters then
            List.rev generated
          else
            loop (stage + 1)
              (( function_decl.id,
                 generated_curried_template_id function_decl.id stage )
              :: generated)
        in
        loop 1 [])
      functions
  in
  let generated_ids = List.map snd generated in
  List.filter_map
    (fun (function_id, generated_id) ->
      let collides_with_surface =
        List.exists
          (CG.Function_template_id.equal generated_id)
          surface_ids
      in
      let generated_occurrences =
        List.fold_left
          (fun count candidate ->
            if
              CG.Function_template_id.equal generated_id candidate
            then count + 1
            else count)
          0 generated_ids
      in
      if collides_with_surface || generated_occurrences > 1 then
        Some
          (Generated_template_id_collision
             { function_id; generated_id })
      else None)
    generated

let lowering_preflight_errors ~entry_function_id functions =
  let entry_errors =
    match find_function functions entry_function_id with
    | None -> [ Entry_function_not_found entry_function_id ]
    | Some entry when entry.parameters <> [] ->
        [
          Entry_function_requires_no_parameters
            {
              function_id = entry.id;
              actual = List.length entry.parameters;
            };
        ]
    | Some _ -> []
  in
  let function_errors =
    List.concat_map
      (fun (function_decl : function_decl) ->
        let parameter_type_errors =
          function_decl.parameters
          |> List.filter_map (fun (parameter : parameter) ->
                 if supported_value_type parameter.typ then None
                 else
                   Some
                     (Unsupported_value_type
                        {
                          function_id = function_decl.id;
                          binding = parameter.name;
                          typ = parameter.typ;
                        }))
        in
        let result_type_errors =
          if supported_value_type function_decl.result.typ then []
          else
            [
              Unsupported_value_type
                {
                  function_id = function_decl.id;
                  binding = function_decl.result.name;
                  typ = function_decl.result.typ;
                };
            ]
        in
        parameter_type_errors @ result_type_errors)
      functions
  in
  entry_errors @ generated_template_collision_errors functions
  @ function_errors

let lower_to_program_package ~entry_function_id program =
  let functions = program.functions in
  let preflight_errors =
    lowering_preflight_errors ~entry_function_id functions
  in
  match preflight_errors with
  | _ :: _ -> Error preflight_errors
  | [] ->
      let* built =
        List.fold_left
          (fun result (function_decl : function_decl) ->
            let* built = result in
            build_function functions built function_decl.id)
          (Ok []) functions
      in
      let templates =
        built
        |> all_built_templates
        |> List.sort (fun left right ->
               CG.Function_template_id.compare
                 (CG.Function_template.id left)
                 (CG.Function_template.id right))
      in
      let entry =
        match find_function functions entry_function_id with
        | Some entry -> entry
        | None -> assert false
      in
      let raw =
        P.Raw.create ~templates
          ~entry_template_id:(core_template_id entry_function_id)
          ~result_type:entry.result.typ ()
      in
      (match P.validate raw with
      | Ok package -> Ok package
      | Error errors ->
          Error [ Program_package_validation_errors errors ])

let render_function_id id = Function_id.to_string id
let render_name name = Name.to_string name

let render_validation_error = function
  | Duplicate_function_id id ->
      "duplicate surface function ID: " ^ render_function_id id
  | Duplicate_parameter_name { function_id; name } ->
      "duplicate parameter name in " ^ render_function_id function_id
      ^ ": " ^ render_name name
  | Unknown_parameter_reference { function_id; name } ->
      "unknown parameter reference in " ^ render_function_id function_id
      ^ ": " ^ render_name name
  | Unknown_call_target { function_id; target } ->
      "unknown call target in " ^ render_function_id function_id ^ ": "
      ^ render_function_id target
  | Duplicate_call_argument { function_id; target; parameter } ->
      "duplicate call argument in " ^ render_function_id function_id
      ^ " calling " ^ render_function_id target ^ ": "
      ^ render_name parameter
  | Missing_call_argument { function_id; target; parameter } ->
      "missing call argument in " ^ render_function_id function_id
      ^ " calling " ^ render_function_id target ^ ": "
      ^ render_name parameter
  | Unexpected_call_argument { function_id; target; parameter } ->
      "unexpected call argument in " ^ render_function_id function_id
      ^ " calling " ^ render_function_id target ^ ": "
      ^ render_name parameter
  | Call_argument_type_mismatch
      { function_id; target; parameter; expected; actual } ->
      "call argument type mismatch in " ^ render_function_id function_id
      ^ " calling " ^ render_function_id target ^ " for "
      ^ render_name parameter ^ ": expected "
      ^ Core_type.to_string expected ^ ", got "
      ^ Core_type.to_string actual
  | Result_type_mismatch { function_id; expected; actual } ->
      "result type mismatch in " ^ render_function_id function_id
      ^ ": expected " ^ Core_type.to_string expected ^ ", got "
      ^ Core_type.to_string actual
  | Function_call_cycle ids ->
      "surface function call cycle: "
      ^ String.concat " -> " (List.map render_function_id ids)

let render_lowering_error = function
  | Entry_function_not_found function_id ->
      "Surface lowering entry function not found: "
      ^ render_function_id function_id
  | Entry_function_requires_no_parameters { function_id; actual } ->
      "Surface lowering entry function must have no parameters: "
      ^ render_function_id function_id ^ " has "
      ^ string_of_int actual
  | Generated_template_id_collision { function_id; generated_id } ->
      "Surface lowering generated a Core template ID collision for "
      ^ render_function_id function_id ^ ": "
      ^ CG.Function_template_id.to_string generated_id
  | Unsupported_value_type { function_id; binding; typ } ->
      "Surface lowering currently supports only Unit and Nat values: "
      ^ render_function_id function_id ^ "."
      ^ render_name binding ^ " has type "
      ^ Core_type.to_string typ
  | Core_graph_validation_errors { function_id; errors } ->
      "Surface lowering produced an invalid Core graph for "
      ^ render_function_id function_id ^ ": "
      ^ String.concat "; " (List.map CG.validation_error_to_string errors)
  | Program_package_validation_errors errors ->
      "Surface lowering produced an invalid program package: "
      ^ String.concat "; " (List.map P.validation_error_to_string errors)
  | Lowering_invariant_violation message ->
      "Surface lowering invariant violation: " ^ message
