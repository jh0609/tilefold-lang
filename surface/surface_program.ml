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
  | Core_type.Nat -> tagged "Nat" []
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
