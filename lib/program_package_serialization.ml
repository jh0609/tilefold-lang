module CG = Core_graph
module P = Program_package

type error =
  | Parse_error of string
  | Expected_list of string
  | Expected_atom of string
  | Unknown_field of string
  | Missing_field of string
  | Duplicate_field of string
  | Unsupported_format_version of string
  | Unsupported_semantics_profile of string
  | Invalid_identifier of {
      kind : string;
      value : string;
      message : string;
    }
  | Invalid_type
  | Invalid_node_kind
  | Invalid_payload
  | Non_canonical_nat of string
  | Unsupported_program_literal_payload
  | Dangling_template_reference of CG.Function_template_id.t
  | Template_dependency_cycle of CG.Function_template_id.t list
  | Package_validation_errors of P.validation_error list

let format_version = "tilefold-program-package-v1"
let semantics_profile = "transparent-v0"

let ( let* ) result f = match result with Ok value -> f value | Error _ as error -> error
let ( >>= ) result f = match result with Ok value -> f value | Error _ as error -> error

type sexp =
  | Atom of string
  | List of sexp list

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

let atom value = Atom value
let tagged tag values = List (Atom tag :: values)

let rec render_sexp = function
  | Atom value -> quote value
  | List values -> "(" ^ String.concat " " (List.map render_sexp values) ^ ")"

let encode_string sexp = render_sexp sexp ^ "\n"

let rec render_type = function
  | Core_type.Unit -> tagged "Unit" []
  | Nat -> tagged "Nat" []
  | Arrow (input, output) -> tagged "Arrow" [ render_type input; render_type output ]

let render_capture (capture : CG.capture) =
  tagged "capture"
    [ atom (CG.Port_key.to_string capture.key); render_type capture.typ ]

let render_port_ref (port_ref : CG.port_ref) =
  tagged "port-ref"
    [
      atom (CG.Node_id.to_string port_ref.node_id);
      atom (CG.Port_key.to_string port_ref.port_key);
    ]

let render_function_signature signature =
  tagged "Function"
    [
      atom (CG.Function_template_id.to_string signature.CG.template_id);
      render_type signature.parameter_type;
      render_type signature.result_type;
      tagged "captures" (List.map render_capture signature.captures);
    ]

let render_apply_signature signature =
  tagged "Apply"
    [
      render_type signature.CG.apply_parameter_type;
      render_type signature.apply_result_type;
    ]

let render_node_kind = function
  | CG.Unit_literal -> tagged "UnitLiteral" []
  | Nat_literal nat -> tagged "NatLiteral" [ atom (Nat.to_string nat) ]
  | Parameter typ -> tagged "Parameter" [ render_type typ ]
  | Capture capture -> tagged "Capture" [ render_capture capture ]
  | Result typ -> tagged "Result" [ render_type typ ]
  | Succ -> tagged "Succ" []
  | Drop typ -> tagged "Drop" [ render_type typ ]
  | Copy typ -> tagged "Copy" [ render_type typ ]
  | Function signature -> render_function_signature signature
  | Apply signature -> render_apply_signature signature
  | NatRec typ -> tagged "NatRec" [ render_type typ ]

let render_node (node : CG.node) =
  tagged "node" [ atom (CG.Node_id.to_string node.CG.id); render_node_kind node.kind ]

let render_edge (edge : CG.edge) =
  tagged "edge"
    [
      atom (CG.Edge_id.to_string edge.CG.id);
      tagged "source" [ render_port_ref edge.source ];
      tagged "target" [ render_port_ref edge.target ];
    ]

let render_payload = function
  | Runtime_value.Unit -> tagged "Unit" []
  | Nat nat -> tagged "Nat" [ atom (Nat.to_string nat) ]
  | Closure _ -> tagged "Closure" []

let sorted_nodes graph =
  CG.Validated_graph.nodes graph
  |> List.sort (fun (left : CG.node) (right : CG.node) ->
         CG.Node_id.compare left.id right.id)

let sorted_edges graph =
  CG.Validated_graph.edges graph
  |> List.sort (fun (left : CG.edge) (right : CG.edge) ->
         CG.Edge_id.compare left.id right.id)

let render_order ids =
  List.map (fun id -> atom (CG.Node_id.to_string id)) ids

let render_priority_spine = function
  | None -> tagged "none" []
  | Some ids -> tagged "some" (render_order ids)

let render_graph graph =
  tagged "graph"
    [
      tagged "nodes" (List.map render_node (sorted_nodes graph));
      tagged "edges" (List.map render_edge (sorted_edges graph));
      tagged "default-node-order"
        (render_order (CG.Validated_graph.default_node_order graph));
      tagged "priority-spine"
        [ render_priority_spine (CG.Validated_graph.priority_spine graph) ];
    ]

let sorted_templates package =
  P.templates package
  |> List.sort (fun left right ->
         CG.Function_template_id.compare
           (CG.Function_template.id left)
           (CG.Function_template.id right))

let render_template template =
  let dependencies =
    CG.Function_template.dependencies template
    |> List.sort CG.Function_template_id.compare
    |> List.map (fun id -> atom (CG.Function_template_id.to_string id))
  in
  tagged "template"
    [
      atom (CG.Function_template_id.to_string (CG.Function_template.id template));
      tagged "parameter-type" [ render_type (CG.Function_template.parameter_type template) ];
      tagged "result-type" [ render_type (CG.Function_template.result_type template) ];
      tagged "captures" (List.map render_capture (CG.Function_template.captures template));
      tagged "dependencies" dependencies;
      render_graph (CG.Function_template.body template);
    ]

let sorted_literals package =
  P.literals package
  |> List.sort (fun left right -> P.Literal_id.compare left.P.id right.id)

let render_literal literal =
  tagged "literal"
    [ atom (P.Literal_id.to_string literal.P.id); render_payload literal.payload ]

let sorted_entry_captures package =
  P.entry_captures package
  |> List.sort (fun left right -> CG.Port_key.compare left.P.capture_key right.capture_key)

let render_entry_capture capture =
  tagged "entry-capture"
    [
      atom (CG.Port_key.to_string capture.P.capture_key);
      atom (P.Literal_id.to_string capture.literal_id);
    ]

let encode package =
  tagged format_version
    [
      tagged "semantics-profile" [ atom semantics_profile ];
      tagged "entry-template" [ atom (CG.Function_template_id.to_string (P.entry_template_id package)) ];
      tagged "result-type" [ render_type (P.result_type package) ];
      tagged "literals" (List.map render_literal (sorted_literals package));
      tagged "entry-captures"
        (List.map render_entry_capture (sorted_entry_captures package));
      tagged "templates" (List.map render_template (sorted_templates package));
    ]
  |> encode_string

let parse input =
  let length = String.length input in
  let rec skip_ws index =
    if index < length then
      match input.[index] with
      | ' ' | '\n' | '\r' | '\t' -> skip_ws (index + 1)
      | _ -> index
    else index
  in
  let parse_escape index =
    if index >= length then Error (Parse_error "unterminated string escape")
    else
      match input.[index] with
      | '"' -> Ok ('"', index + 1)
      | '\\' -> Ok ('\\', index + 1)
      | 'n' -> Ok ('\n', index + 1)
      | 'r' -> Ok ('\r', index + 1)
      | 't' -> Ok ('\t', index + 1)
      | char -> Error (Parse_error ("unsupported string escape: " ^ String.make 1 char))
  in
  let parse_string index =
    let buffer = Buffer.create 16 in
    let rec loop index =
      if index >= length then Error (Parse_error "unterminated string")
      else
        match input.[index] with
        | '"' -> Ok (Atom (Buffer.contents buffer), index + 1)
        | '\\' ->
            let* char, next = parse_escape (index + 1) in
            Buffer.add_char buffer char;
            loop next
        | char ->
            Buffer.add_char buffer char;
            loop (index + 1)
    in
    loop index
  in
  let rec parse_list values index =
    let index = skip_ws index in
    if index >= length then Error (Parse_error "unterminated list")
    else
      match input.[index] with
      | ')' -> Ok (List (List.rev values), index + 1)
      | _ ->
          let* value, next = parse_value index in
          parse_list (value :: values) next
  and parse_value index =
    let index = skip_ws index in
    if index >= length then Error (Parse_error "expected value")
    else
      match input.[index] with
      | '(' -> parse_list [] (index + 1)
      | '"' -> parse_string (index + 1)
      | ')' -> Error (Parse_error "unexpected closing parenthesis")
      | _ -> Error (Parse_error "expected quoted atom or list")
  in
  let* value, next = parse_value 0 in
  let next = skip_ws next in
  if next = length then Ok value else Error (Parse_error "trailing garbage")

let as_atom context = function
  | Atom value -> Ok value
  | List _ -> Error (Expected_atom context)

let as_list context = function
  | List values -> Ok values
  | Atom _ -> Error (Expected_list context)

let as_tag context expected sexp =
  let* values = as_list context sexp in
  match values with
  | Atom tag :: rest when String.equal tag expected -> Ok rest
  | Atom tag :: _ -> Error (Unknown_field tag)
  | [] | List _ :: _ -> Error (Expected_atom context)

let id_result kind value parser =
  match parser value with
  | Ok id -> Ok id
  | Error message -> Error (Invalid_identifier { kind; value; message })

let parse_node_id value = id_result "node" value CG.Node_id.of_string
let parse_edge_id value = id_result "edge" value CG.Edge_id.of_string
let parse_port_key value = id_result "port" value CG.Port_key.of_string
let parse_template_id value = id_result "template" value CG.Function_template_id.of_string
let parse_literal_id value = id_result "literal" value P.Literal_id.of_string

let parse_nat value =
  match Nat.of_string value with
  | Ok nat -> Ok nat
  | Error Nat.Non_canonical_format -> Error (Non_canonical_nat value)
  | Error _ -> Error Invalid_payload

let rec parse_type sexp =
  match sexp with
  | List [ Atom "Unit" ] -> Ok Core_type.Unit
  | List [ Atom "Nat" ] -> Ok Core_type.Nat
  | List [ Atom "Arrow"; input; output ] ->
      let* input = parse_type input in
      let* output = parse_type output in
      Ok (Core_type.Arrow (input, output))
  | _ -> Error Invalid_type

let parse_capture sexp =
  let* fields = as_tag "capture" "capture" sexp in
  match fields with
  | [ key; typ ] ->
      let* key = as_atom "capture key" key >>= parse_port_key in
      let* typ = parse_type typ in
      Ok { CG.key; typ }
  | _ -> Error Invalid_node_kind

let parse_port_ref sexp =
  let* fields = as_tag "port-ref" "port-ref" sexp in
  match fields with
  | [ node_id; port_key ] ->
      let* node_id = as_atom "node id" node_id >>= parse_node_id in
      let* port_key = as_atom "port key" port_key >>= parse_port_key in
      Ok { CG.node_id; port_key }
  | _ -> Error Invalid_node_kind

let parse_captures sexp =
  let* values = as_tag "captures" "captures" sexp in
  let rec loop acc = function
    | [] -> Ok (List.rev acc)
    | value :: rest ->
        let* capture = parse_capture value in
        loop (capture :: acc) rest
  in
  loop [] values

let parse_node_kind sexp =
  match sexp with
  | List [ Atom "UnitLiteral" ] -> Ok CG.Unit_literal
  | List [ Atom "NatLiteral"; Atom value ] ->
      let* nat = parse_nat value in
      Ok (CG.Nat_literal nat)
  | List [ Atom "Parameter"; typ ] ->
      let* typ = parse_type typ in
      Ok (CG.Parameter typ)
  | List [ Atom "Capture"; capture ] ->
      let* capture = parse_capture capture in
      Ok (CG.Capture capture)
  | List [ Atom "Result"; typ ] ->
      let* typ = parse_type typ in
      Ok (CG.Result typ)
  | List [ Atom "Succ" ] -> Ok CG.Succ
  | List [ Atom "Drop"; typ ] ->
      let* typ = parse_type typ in
      Ok (CG.Drop typ)
  | List [ Atom "Copy"; typ ] ->
      let* typ = parse_type typ in
      Ok (CG.Copy typ)
  | List [ Atom "Function"; template_id; parameter_type; result_type; captures ] ->
      let* template_id = as_atom "template id" template_id >>= parse_template_id in
      let* parameter_type = parse_type parameter_type in
      let* result_type = parse_type result_type in
      let* captures = parse_captures captures in
      Ok (CG.Function { template_id; parameter_type; result_type; captures })
  | List [ Atom "Apply"; parameter_type; result_type ] ->
      let* apply_parameter_type = parse_type parameter_type in
      let* apply_result_type = parse_type result_type in
      Ok (CG.Apply { apply_parameter_type; apply_result_type })
  | List [ Atom "NatRec"; typ ] ->
      let* typ = parse_type typ in
      Ok (CG.NatRec typ)
  | _ -> Error Invalid_node_kind

let parse_node sexp =
  let* fields = as_tag "node" "node" sexp in
  match fields with
  | [ id; kind ] ->
      let* id = as_atom "node id" id >>= parse_node_id in
      let* kind = parse_node_kind kind in
      Ok { CG.id; kind }
  | _ -> Error Invalid_node_kind

let parse_edge sexp =
  let* fields = as_tag "edge" "edge" sexp in
  match fields with
  | [ id; source; target ] ->
      let* id = as_atom "edge id" id >>= parse_edge_id in
      let* source_values = as_tag "source" "source" source in
      let* target_values = as_tag "target" "target" target in
      let* source =
        match source_values with [ value ] -> parse_port_ref value | _ -> Error Invalid_node_kind
      in
      let* target =
        match target_values with [ value ] -> parse_port_ref value | _ -> Error Invalid_node_kind
      in
      Ok { CG.id; source; target }
  | _ -> Error Invalid_node_kind

let unique_field allowed name fields =
  if not (List.exists (String.equal name) allowed) then Error (Unknown_field name)
  else
    let matches =
      List.filter
        (function List (Atom tag :: _) -> String.equal tag name | _ -> false)
        fields
    in
    match matches with
    | [] -> Error (Missing_field name)
    | [ value ] -> Ok value
    | _ -> Error (Duplicate_field name)

let check_unknown_fields allowed fields =
  let rec loop = function
    | [] -> Ok ()
    | List (Atom tag :: _) :: rest ->
        if List.exists (String.equal tag) allowed then loop rest
        else Error (Unknown_field tag)
    | _ -> Error (Expected_list "field")
  in
  loop fields

let field allowed name fields =
  let* () = check_unknown_fields allowed fields in
  unique_field allowed name fields

let parse_id_list tag parser sexp =
  let* values = as_tag tag tag sexp in
  let rec loop acc = function
    | [] -> Ok (List.rev acc)
    | value :: rest ->
        let* id = as_atom tag value >>= parser in
        loop (id :: acc) rest
  in
  loop [] values

let parse_graph sexp =
  let allowed = [ "nodes"; "edges"; "default-node-order"; "priority-spine" ] in
  let* fields = as_tag "graph" "graph" sexp in
  let* nodes_field = field allowed "nodes" fields in
  let* edge_field = field allowed "edges" fields in
  let* order_field = field allowed "default-node-order" fields in
  let* spine_field = field allowed "priority-spine" fields in
  let* node_values = as_tag "nodes" "nodes" nodes_field in
  let* edge_values = as_tag "edges" "edges" edge_field in
  let* nodes =
    List.fold_left
      (fun acc value ->
        let* acc = acc in
        let* node = parse_node value in
        Ok (node :: acc))
      (Ok []) node_values
    |> Result.map List.rev
  in
  let* edges =
    List.fold_left
      (fun acc value ->
        let* acc = acc in
        let* edge = parse_edge value in
        Ok (edge :: acc))
      (Ok []) edge_values
    |> Result.map List.rev
  in
  let* default_node_order =
    parse_id_list "default-node-order" parse_node_id order_field
  in
  let* spine_values = as_tag "priority-spine" "priority-spine" spine_field in
  let* priority_spine =
    match spine_values with
    | [ List [ Atom "none" ] ] -> Ok None
    | [ List (Atom "some" :: values) ] ->
        let* ids =
          List.fold_left
            (fun acc value ->
              let* acc = acc in
              let* id = as_atom "priority spine member" value >>= parse_node_id in
              Ok (id :: acc))
            (Ok []) values
          |> Result.map List.rev
        in
        Ok (Some ids)
    | _ -> Error Invalid_node_kind
  in
  Ok
    (CG.Raw_graph.of_lists_with_priority_spine ~nodes ~edges ~default_node_order
       ~priority_spine)

type raw_template = {
  id : CG.Function_template_id.t;
  parameter_type : Core_type.t;
  result_type : Core_type.t;
  captures : CG.capture list;
  dependencies : CG.Function_template_id.t list;
  graph : CG.Raw_graph.t;
}

let parse_template sexp =
  let allowed =
    [ "parameter-type"; "result-type"; "captures"; "dependencies"; "graph" ]
  in
  let* fields = as_tag "template" "template" sexp in
  match fields with
  | id :: fields ->
      let* id = as_atom "template id" id >>= parse_template_id in
      let* parameter_field = field allowed "parameter-type" fields in
      let* result_field = field allowed "result-type" fields in
      let* captures_field = field allowed "captures" fields in
      let* dependencies_field = field allowed "dependencies" fields in
      let* graph_field = field allowed "graph" fields in
      let* parameter_values = as_tag "parameter-type" "parameter-type" parameter_field in
      let* result_values = as_tag "result-type" "result-type" result_field in
      let* parameter_type =
        match parameter_values with [ value ] -> parse_type value | _ -> Error Invalid_type
      in
      let* result_type =
        match result_values with [ value ] -> parse_type value | _ -> Error Invalid_type
      in
      let* captures = parse_captures captures_field in
      let* dependencies =
        parse_id_list "dependencies" parse_template_id dependencies_field
      in
      let* graph = parse_graph graph_field in
      Ok { id; parameter_type; result_type; captures; dependencies; graph }
  | [] -> Error (Missing_field "template id")

let parse_payload = function
  | List [ Atom "Unit" ] -> Ok Runtime_value.Unit
  | List [ Atom "Nat"; Atom value ] ->
      let* nat = parse_nat value in
      Ok (Runtime_value.Nat nat)
  | List [ Atom "Closure" ] -> Error Unsupported_program_literal_payload
  | _ -> Error Invalid_payload

let parse_literal sexp =
  let* fields = as_tag "literal" "literal" sexp in
  match fields with
  | [ id; payload ] ->
      let* id = as_atom "literal id" id >>= parse_literal_id in
      let* payload = parse_payload payload in
      Ok { P.id; payload }
  | _ -> Error Invalid_payload

let parse_entry_capture sexp =
  let* fields = as_tag "entry-capture" "entry-capture" sexp in
  match fields with
  | [ key; id ] ->
      let* capture_key = as_atom "capture key" key >>= parse_port_key in
      let* literal_id = as_atom "literal id" id >>= parse_literal_id in
      Ok { P.capture_key; literal_id }
  | _ -> Error Invalid_payload

let graph_function_dependencies raw_graph =
  CG.Raw_graph.nodes raw_graph
  |> List.filter_map (function
       | { CG.kind = Function signature; _ } -> Some signature.template_id
       | _ -> None)

let raw_template_dependencies template =
  template.dependencies @ graph_function_dependencies template.graph

let find_raw_template templates id =
  List.find_opt (fun template -> CG.Function_template_id.equal template.id id) templates

let build_templates raw_templates =
  let sorted =
    List.sort
      (fun left right -> CG.Function_template_id.compare left.id right.id)
      raw_templates
  in
  let rec visit visiting built template =
    if List.exists (CG.Function_template_id.equal template.id) visiting then
      Error (Template_dependency_cycle (List.rev (template.id :: visiting)))
    else if
      List.exists
        (fun built_template ->
          CG.Function_template_id.equal
            (CG.Function_template.id built_template)
            template.id)
        built
    then Ok built
    else
      let dependencies =
        raw_template_dependencies template
        |> List.sort_uniq CG.Function_template_id.compare
      in
      let* built =
        List.fold_left
          (fun acc dependency_id ->
            let* acc = acc in
            match find_raw_template raw_templates dependency_id with
            | None -> Error (Dangling_template_reference dependency_id)
            | Some dependency -> visit (template.id :: visiting) acc dependency)
          (Ok built) dependencies
      in
      let* body =
        match CG.validate_with_templates built template.graph with
        | Ok body -> Ok body
        | Error errors -> Error (Package_validation_errors [ P.Core_validation_errors errors ])
      in
      Ok
        (CG.Function_template.create ~dependencies:template.dependencies
           ~id:template.id ~parameter_type:template.parameter_type
           ~result_type:template.result_type ~captures:template.captures ~body ()
        :: built)
  in
  let* built =
    List.fold_left
      (fun acc template ->
        let* acc = acc in
        visit [] acc template)
      (Ok []) sorted
  in
  Ok
    (List.sort
       (fun left right ->
         CG.Function_template_id.compare
           (CG.Function_template.id left)
           (CG.Function_template.id right))
       built)

let decode input =
  let* sexp = parse input in
  let allowed =
    [
      "semantics-profile";
      "entry-template";
      "result-type";
      "literals";
      "entry-captures";
      "templates";
    ]
  in
  let* fields =
    match sexp with
    | List (Atom tag :: fields) when String.equal tag format_version -> Ok fields
    | List (Atom tag :: _) -> Error (Unsupported_format_version tag)
    | List [] -> Error (Expected_atom "package format version")
    | Atom _ -> Error (Expected_list "package")
    | List (List _ :: _) -> Error (Expected_atom "package format version")
  in
  let* profile_field = field allowed "semantics-profile" fields in
  let* entry_field = field allowed "entry-template" fields in
  let* result_field = field allowed "result-type" fields in
  let* literals_field = field allowed "literals" fields in
  let* entry_captures_field = field allowed "entry-captures" fields in
  let* templates_field = field allowed "templates" fields in
  let* profile_values = as_tag "semantics-profile" "semantics-profile" profile_field in
  let* () =
    match profile_values with
    | [ Atom profile ] when String.equal profile semantics_profile -> Ok ()
    | [ Atom profile ] -> Error (Unsupported_semantics_profile profile)
    | _ -> Error (Expected_atom "semantics profile")
  in
  let* entry_values = as_tag "entry-template" "entry-template" entry_field in
  let* entry_template_id =
    match entry_values with
    | [ value ] -> as_atom "entry template" value >>= parse_template_id
    | _ -> Error (Expected_atom "entry template")
  in
  let* result_values = as_tag "result-type" "result-type" result_field in
  let* result_type =
    match result_values with [ value ] -> parse_type value | _ -> Error Invalid_type
  in
  let* literal_values = as_tag "literals" "literals" literals_field in
  let* literals =
    List.fold_left
      (fun acc value ->
        let* acc = acc in
        let* literal = parse_literal value in
        Ok (literal :: acc))
      (Ok []) literal_values
    |> Result.map List.rev
  in
  let* entry_capture_values =
    as_tag "entry-captures" "entry-captures" entry_captures_field
  in
  let* entry_captures =
    List.fold_left
      (fun acc value ->
        let* acc = acc in
        let* capture = parse_entry_capture value in
        Ok (capture :: acc))
      (Ok []) entry_capture_values
    |> Result.map List.rev
  in
  let* template_values = as_tag "templates" "templates" templates_field in
  let* raw_templates =
    List.fold_left
      (fun acc value ->
        let* acc = acc in
        let* template = parse_template value in
        Ok (template :: acc))
      (Ok []) template_values
    |> Result.map List.rev
  in
  let* templates = build_templates raw_templates in
  let raw =
    P.Raw.create ~templates ~entry_template_id ~result_type ~literals
      ~entry_captures ()
  in
  match P.validate raw with
  | Ok package -> Ok package
  | Error errors -> Error (Package_validation_errors errors)

let render_error = function
  | Parse_error message -> "parse error: " ^ message
  | Expected_list context -> "expected list: " ^ context
  | Expected_atom context -> "expected atom: " ^ context
  | Unknown_field field -> "unknown field: " ^ field
  | Missing_field field -> "missing field: " ^ field
  | Duplicate_field field -> "duplicate field: " ^ field
  | Unsupported_format_version version -> "unsupported format version: " ^ version
  | Unsupported_semantics_profile profile ->
      "unsupported semantics profile: " ^ profile
  | Invalid_identifier { kind; value; message } ->
      "invalid " ^ kind ^ " identifier " ^ value ^ ": " ^ message
  | Invalid_type -> "invalid type"
  | Invalid_node_kind -> "invalid node kind"
  | Invalid_payload -> "invalid payload"
  | Non_canonical_nat value -> "non-canonical Nat: " ^ value
  | Unsupported_program_literal_payload -> "unsupported program literal payload"
  | Dangling_template_reference id ->
      "dangling template reference: " ^ CG.Function_template_id.to_string id
  | Template_dependency_cycle ids ->
      "template dependency cycle: "
      ^ String.concat " -> " (List.map CG.Function_template_id.to_string ids)
  | Package_validation_errors errors ->
      "package validation errors: "
      ^ String.concat "; " (List.map P.validation_error_to_string errors)
