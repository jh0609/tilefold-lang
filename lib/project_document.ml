module G = Surface_geometry
module S = Surface_symbolic
module C = Core_graph

type point = { x : int; y : int }
type bounds = { x : int; y : int; width : int; height : int }
type port_anchor = { port : string; at : point }

type element_kind =
  | Unit_literal
  | Bool_literal of bool
  | Nat_literal of string
  | Succ
  | Drop of Core_type.t
  | Copy of Core_type.t
  | Pair of { left_type : Core_type.t; right_type : Core_type.t }
  | Unpair of { left_type : Core_type.t; right_type : Core_type.t }
  | Left of { left_type : Core_type.t; right_type : Core_type.t }
  | Right of { left_type : Core_type.t; right_type : Core_type.t }
  | Case of {
      left_type : Core_type.t;
      right_type : Core_type.t;
      result_type : Core_type.t;
    }
  | Nil of Core_type.t
  | Cons of Core_type.t
  | ListRec of { item_type : Core_type.t; result_type : Core_type.t }
  | ListBuilder of { item_type : Core_type.t; item_ids : string list }
  | Function of {
      template_id : string;
      parameter_type : Core_type.t;
      result_type : Core_type.t;
      captures : (string * Core_type.t) list;
    }
  | Library_call of {
      library : string;
      function_id : string;
      template_id : string;
      version : string;
    }
  | Project_call of { template_id : string }
  | Apply of { parameter_type : Core_type.t; result_type : Core_type.t }
  | NatRec of Core_type.t
  | BoolRec of Core_type.t

type element = {
  id : string;
  kind : element_kind;
  bounds : bounds;
  port_anchors : port_anchor list;
}

type container_kind =
  | Entry of {
      template_id : string;
      result_type : Core_type.t;
      dependencies : string list;
    }
  | Template of {
      template_id : string;
      parameter_type : Core_type.t;
      result_type : Core_type.t;
      dependencies : string list;
    }

type boundary_role = Parameter | Result | Capture of string

type boundary_port = {
  id : string;
  role : boundary_role;
  typ : Core_type.t;
  anchor : point;
}

type container = {
  id : string;
  kind : container_kind;
  bounds : bounds;
  boundary_ports : boundary_port list;
}

type endpoint_hint =
  | Element_port of { element_id : string; port : string }
  | Boundary_port of { container_id : string; boundary_id : string }
  | Junction of string
  | Junction_outlet of { junction_id : string; outlet_id : string }

type wire = {
  id : string;
  points : point list;
  source_hint : endpoint_hint option;
  target_hint : endpoint_hint option;
}

type outlet = { id : string; order : int; anchor : point }
type junction = { id : string; anchor : point; outlets : outlet list }
type view = { camera_x : int; camera_y : int; zoom : int }

type surface_parameter = { name : string; typ : Core_type.t }

type surface_function = {
  name : string;
  template_id : string;
  body_container_id : string;
  parameters : surface_parameter list;
  result_name : string;
  result_type : Core_type.t;
}

type surface_project_call = {
  id : string;
  template_id : string;
  function_element_id : string;
}

type t = {
  format : string;
  version : int;
  snap_tolerance : int;
  elements : element list;
  containers : container list;
  wires : wire list;
  junctions : junction list;
  view : view option;
  surface_functions : surface_function list;
  surface_project_calls : surface_project_call list;
}

let bounds_contains (outer : bounds) (inner : bounds) =
  inner.x >= outer.x
  && inner.y >= outer.y
  && inner.x + inner.width <= outer.x + outer.width
  && inner.y + inner.height <= outer.y + outer.height

let container_area (container : container) =
  container.bounds.width * container.bounds.height

let element_owner_container (containers : container list) (element : element) =
  containers
  |> List.filter (fun container -> bounds_contains container.bounds element.bounds)
  |> List.sort (fun left right ->
         Int.compare (container_area left) (container_area right))
  |> function
  | owner :: _ -> Some owner
  | [] -> None

let element_template_reference (element : element) =
  match element.kind with
  | Function { template_id; _ }
  | Project_call { template_id }
  | Library_call { template_id; _ } ->
      Some template_id
  | _ -> None

let graph_dependencies_for_container (document : t) (container : container) =
  document.elements
  |> List.filter_map (fun element ->
         match
           ( element_owner_container document.containers element,
             element_template_reference element )
         with
         | Some owner, Some template_id when owner.id = container.id ->
             Some template_id
         | _ -> None)
  |> List.sort_uniq String.compare

module Decode_error = struct
  type kind =
    | Invalid_json of string
    | Missing_field
    | Wrong_type of string
    | Unknown_field
    | Unknown_format of string
    | Unsupported_version of int
    | Invalid_value of string

  type t = { path : string; kind : kind }

  let to_string { path; kind } =
    let message =
      match kind with
      | Invalid_json value -> "invalid JSON: " ^ value
      | Missing_field -> "required field is missing"
      | Wrong_type expected -> "expected " ^ expected
      | Unknown_field -> "unknown field"
      | Unknown_format value -> "unknown format " ^ value
      | Unsupported_version value ->
          "unsupported version " ^ string_of_int value
      | Invalid_value value -> value
    in
    path ^ ": " ^ message
end

module Validation_error = struct
  type t =
    | Invalid_id of { path : string; id : string }
    | Duplicate_id of string
    | Invalid_bounds of { id : string; bounds : bounds }
    | Invalid_snap_tolerance of int
    | Invalid_nat_literal of { element_id : string; value : string }
    | Invalid_port_anchor of { element_id : string; port : string }
    | Invalid_wire_polyline of string
    | Consecutive_duplicate_wire_point of { wire_id : string; point : point }
    | Dangling_reference of { owner_id : string; reference : string }
    | Duplicate_outlet_order of { junction_id : string; order : int }
    | Invalid_outlet_count of string

  let to_string = function
    | Invalid_id { path; id } -> path ^ ": invalid stable ID " ^ id
    | Duplicate_id id -> "duplicate stable ID " ^ id
    | Invalid_bounds { id; _ } -> id ^ ": bounds must have positive size"
    | Invalid_snap_tolerance value ->
        "snapTolerance must be between 0 and 1000000, got "
        ^ string_of_int value
    | Invalid_nat_literal { element_id; value } ->
        element_id ^ ": invalid canonical Nat " ^ value
    | Invalid_port_anchor { element_id; port } ->
        element_id ^ ": invalid or duplicate port anchor " ^ port
    | Invalid_wire_polyline id -> id ^ ": wire needs at least two points"
    | Consecutive_duplicate_wire_point { wire_id; _ } ->
        wire_id ^ ": wire has consecutive duplicate points"
    | Dangling_reference { owner_id; reference } ->
        owner_id ^ ": dangling reference " ^ reference
    | Duplicate_outlet_order { junction_id; order } ->
        junction_id ^ ": duplicate outlet order " ^ string_of_int order
    | Invalid_outlet_count id -> id ^ ": branch junction needs at least two outlets"
end

type validated = t

module Conversion_error = struct
  type t =
    | Invalid_internal_id of { id : string; message : string }
    | Port_hint_mismatch of { wire_id : string; side : string; hint : string }

  let to_string = function
    | Invalid_internal_id { id; message } -> id ^ ": " ^ message
    | Port_hint_mismatch { wire_id; side; hint } ->
        wire_id ^ ": " ^ side ^ " hint does not match geometry: " ^ hint
end

let ( let* ) value continuation =
  match value with Ok result -> continuation result | Error _ as error -> error

let error path kind = Error Decode_error.{ path; kind }

let object_at path = function
  | `Assoc fields -> Ok fields
  | _ -> error path (Wrong_type "object")

let array_at path = function
  | `List values -> Ok values
  | _ -> error path (Wrong_type "array")

let string_at path = function
  | `String value -> Ok value
  | _ -> error path (Wrong_type "string")

let int_at path = function
  | `Int value -> Ok value
  | _ -> error path (Wrong_type "integer")

let field path name fields =
  match List.assoc_opt name fields with
  | Some value -> Ok value
  | None -> error (path ^ "." ^ name) Missing_field

let optional_field name fields = List.assoc_opt name fields

let reject_unknown path allowed fields =
  match
    List.find_opt
      (fun (name, _) -> not (List.exists (String.equal name) allowed))
      fields
  with
  | None -> Ok ()
  | Some (name, _) -> error (path ^ "." ^ name) Unknown_field

let decode_point path json =
  let* fields = object_at path json in
  let* () = reject_unknown path [ "x"; "y" ] fields in
  let* x_json = field path "x" fields in
  let* y_json = field path "y" fields in
  let* x = int_at (path ^ ".x") x_json in
  let* y = int_at (path ^ ".y") y_json in
  Ok { x; y }

let decode_bounds path json =
  let* fields = object_at path json in
  let* () = reject_unknown path [ "x"; "y"; "width"; "height" ] fields in
  let get name =
    let* json = field path name fields in
    int_at (path ^ "." ^ name) json
  in
  let* x = get "x" in
  let* y = get "y" in
  let* width = get "width" in
  let* height = get "height" in
  Ok { x; y; width; height }

let rec decode_type path = function
  | `String "unit" -> Ok Core_type.Unit
  | `String "bool" -> Ok Core_type.Bool
  | `String "nat" -> Ok Core_type.Nat
  | `Assoc fields ->
      if List.exists (fun (name, _) -> String.equal name "arrow") fields then (
        let* () = reject_unknown path [ "arrow" ] fields in
        let* arrow = field path "arrow" fields in
        let* values = array_at (path ^ ".arrow") arrow in
        match values with
        | [ left; right ] ->
            let* left = decode_type (path ^ ".arrow[0]") left in
            let* right = decode_type (path ^ ".arrow[1]") right in
            Ok (Core_type.Arrow (left, right))
        | _ -> error (path ^ ".arrow") (Invalid_value "arrow requires two types"))
      else if List.exists (fun (name, _) -> String.equal name "sum") fields then (
        let* () = reject_unknown path [ "sum" ] fields in
        let* sum = field path "sum" fields in
        let* values = array_at (path ^ ".sum") sum in
        match values with
        | [ left; right ] ->
            let* left = decode_type (path ^ ".sum[0]") left in
            let* right = decode_type (path ^ ".sum[1]") right in
            Ok (Core_type.Sum (left, right))
        | _ -> error (path ^ ".sum") (Invalid_value "sum requires two types"))
      else if List.exists (fun (name, _) -> String.equal name "list") fields then (
        let* () = reject_unknown path [ "list" ] fields in
        let* item = field path "list" fields in
        let* item = decode_type (path ^ ".list") item in
        Ok (Core_type.List item))
      else (
        let* () = reject_unknown path [ "product" ] fields in
        let* product = field path "product" fields in
        let* values = array_at (path ^ ".product") product in
        match values with
        | [ left; right ] ->
            let* left = decode_type (path ^ ".product[0]") left in
            let* right = decode_type (path ^ ".product[1]") right in
            Ok (Core_type.Product (left, right))
        | _ ->
            error (path ^ ".product") (Invalid_value "product requires two types"))
  | _ -> error path (Wrong_type "type")

let decode_string_array path json =
  let* values = array_at path json in
  let rec loop index acc = function
    | [] -> Ok (List.rev acc)
    | value :: rest ->
        let* value = string_at (path ^ "[" ^ string_of_int index ^ "]") value in
        loop (index + 1) (value :: acc) rest
  in
  loop 0 [] values

let decode_captures path json =
  let* values = array_at path json in
  let decode_one index json =
    let item_path = path ^ "[" ^ string_of_int index ^ "]" in
    let* fields = object_at item_path json in
    let* () = reject_unknown item_path [ "key"; "type" ] fields in
    let* key_json = field item_path "key" fields in
    let* type_json = field item_path "type" fields in
    let* key = string_at (item_path ^ ".key") key_json in
    let* typ = decode_type (item_path ^ ".type") type_json in
    Ok (key, typ)
  in
  let rec loop index acc = function
    | [] -> Ok (List.rev acc)
    | value :: rest ->
        let* decoded = decode_one index value in
        loop (index + 1) (decoded :: acc) rest
  in
  loop 0 [] values

let duplicate_strings values =
  let sorted = List.sort String.compare values in
  let rec loop = function
    | left :: right :: _ when String.equal left right -> Some left
    | _ :: rest -> loop rest
    | [] -> None
  in
  loop sorted

let decode_drop_provenance path fields =
  match optional_field "provenance" fields with
  | None -> Ok ()
  | Some json ->
      let* provenance_fields = object_at (path ^ ".provenance") json in
      let* kind_json = field (path ^ ".provenance") "kind" provenance_fields in
      let* kind = string_at (path ^ ".provenance.kind") kind_json in
      if String.equal kind "auto_function_output_drop" then
        let* () =
          reject_unknown (path ^ ".provenance") [ "kind"; "sourceElementId" ]
            provenance_fields
        in
        let* source_json =
          field (path ^ ".provenance") "sourceElementId" provenance_fields
        in
        let* _source =
          string_at (path ^ ".provenance.sourceElementId") source_json
        in
        Ok ()
      else if String.equal kind "auto_resource_flow" then
        let* () =
          reject_unknown (path ^ ".provenance") [ "kind"; "sourcePortId" ]
            provenance_fields
        in
        let* source_json =
          field (path ^ ".provenance") "sourcePortId" provenance_fields
        in
        let* _source =
          string_at (path ^ ".provenance.sourcePortId") source_json
        in
        Ok ()
      else
        error (path ^ ".provenance.kind")
          (Invalid_value ("unknown drop provenance " ^ kind))

let decode_copy_provenance path fields =
  match optional_field "provenance" fields with
  | None -> Ok ()
  | Some json ->
      let* provenance_fields = object_at (path ^ ".provenance") json in
      let* () =
        reject_unknown (path ^ ".provenance")
          [ "kind"; "sourcePortId"; "connectionId" ]
          provenance_fields
      in
      let* kind_json = field (path ^ ".provenance") "kind" provenance_fields in
      let* kind = string_at (path ^ ".provenance.kind") kind_json in
      let* () =
        if String.equal kind "auto_resource_flow" then Ok ()
        else
          error (path ^ ".provenance.kind")
            (Invalid_value ("unknown copy provenance " ^ kind))
      in
      let* source_json =
        field (path ^ ".provenance") "sourcePortId" provenance_fields
      in
      let* _source =
        string_at (path ^ ".provenance.sourcePortId") source_json
      in
      let* connection_json =
        field (path ^ ".provenance") "connectionId" provenance_fields
      in
      let* _connection =
        string_at (path ^ ".provenance.connectionId") connection_json
      in
      Ok ()

let decode_element_kind path json =
  let* fields = object_at path json in
  let* kind_json = field path "kind" fields in
  let* kind = string_at (path ^ ".kind") kind_json in
  let type_field name =
    let* json = field path name fields in
    decode_type (path ^ "." ^ name) json
  in
  match kind with
  | "unit_literal" ->
      let* () = reject_unknown path [ "kind" ] fields in
      Ok Unit_literal
  | "bool_literal" ->
      let* () = reject_unknown path [ "kind"; "value" ] fields in
      let* json = field path "value" fields in
      (match json with
      | `Bool value -> Ok (Bool_literal value)
      | _ ->
          error (path ^ ".value")
            (Invalid_value "Bool literal must be a JSON boolean"))
  | "nat_literal" ->
      let* () = reject_unknown path [ "kind"; "value" ] fields in
      let* json = field path "value" fields in
      let* value = string_at (path ^ ".value") json in
      Ok (Nat_literal value)
  | "succ" ->
      let* () = reject_unknown path [ "kind" ] fields in
      Ok Succ
  | "drop" ->
      let* () = reject_unknown path [ "kind"; "type"; "provenance" ] fields in
      let* () = decode_drop_provenance path fields in
      let* typ = type_field "type" in
      Ok (Drop typ)
  | "copy" ->
      let* () = reject_unknown path [ "kind"; "type"; "provenance" ] fields in
      let* () = decode_copy_provenance path fields in
      let* typ = type_field "type" in
      Ok (Copy typ)
  | "pair" ->
      let* () = reject_unknown path [ "kind"; "leftType"; "rightType" ] fields in
      let* left_type = type_field "leftType" in
      let* right_type = type_field "rightType" in
      Ok (Pair { left_type; right_type })
  | "unpair" ->
      let* () = reject_unknown path [ "kind"; "leftType"; "rightType" ] fields in
      let* left_type = type_field "leftType" in
      let* right_type = type_field "rightType" in
      Ok (Unpair { left_type; right_type })
  | "left" ->
      let* () = reject_unknown path [ "kind"; "leftType"; "rightType" ] fields in
      let* left_type = type_field "leftType" in
      let* right_type = type_field "rightType" in
      Ok (Left { left_type; right_type })
  | "right" ->
      let* () = reject_unknown path [ "kind"; "leftType"; "rightType" ] fields in
      let* left_type = type_field "leftType" in
      let* right_type = type_field "rightType" in
      Ok (Right { left_type; right_type })
  | "case" ->
      let* () =
        reject_unknown path [ "kind"; "leftType"; "rightType"; "resultType" ] fields
      in
      let* left_type = type_field "leftType" in
      let* right_type = type_field "rightType" in
      let* result_type = type_field "resultType" in
      Ok (Case { left_type; right_type; result_type })
  | "nil" ->
      let* () = reject_unknown path [ "kind"; "itemType" ] fields in
      let* item_type = type_field "itemType" in
      Ok (Nil item_type)
  | "cons" ->
      let* () = reject_unknown path [ "kind"; "itemType" ] fields in
      let* item_type = type_field "itemType" in
      Ok (Cons item_type)
  | "list_rec" ->
      let* () = reject_unknown path [ "kind"; "itemType"; "resultType" ] fields in
      let* item_type = type_field "itemType" in
      let* result_type = type_field "resultType" in
      Ok (ListRec { item_type; result_type })
  | "list_builder" ->
      let* () = reject_unknown path [ "kind"; "itemType"; "itemIds" ] fields in
      let* item_type = type_field "itemType" in
      let* item_ids_json = field path "itemIds" fields in
      let* item_ids = decode_string_array (path ^ ".itemIds") item_ids_json in
      if List.exists (String.equal "") item_ids then
        error (path ^ ".itemIds") (Invalid_value "item port ID must not be empty")
      else
        (match duplicate_strings item_ids with
        | Some duplicate ->
            error (path ^ ".itemIds") (Invalid_value ("duplicate item port " ^ duplicate))
        | None -> Ok (ListBuilder { item_type; item_ids }))
  | "nat_rec" ->
      let* () = reject_unknown path [ "kind"; "type" ] fields in
      let* typ = type_field "type" in
      Ok (NatRec typ)
  | "bool_rec" ->
      let* () = reject_unknown path [ "kind"; "type" ] fields in
      let* typ = type_field "type" in
      Ok (BoolRec typ)
  | "apply" ->
      let* () =
        reject_unknown path [ "kind"; "parameterType"; "resultType" ] fields
      in
      let* parameter_type = type_field "parameterType" in
      let* result_type = type_field "resultType" in
      Ok (Apply { parameter_type; result_type })
  | "function" ->
      let* () =
        reject_unknown path
          [ "kind"; "templateId"; "parameterType"; "resultType"; "captures" ]
          fields
      in
      let* template_json = field path "templateId" fields in
      let* template_id = string_at (path ^ ".templateId") template_json in
      let* parameter_type = type_field "parameterType" in
      let* result_type = type_field "resultType" in
      let* captures_json = field path "captures" fields in
      let* captures = decode_captures (path ^ ".captures") captures_json in
      Ok (Function { template_id; parameter_type; result_type; captures })
  | "library_call" ->
      let* () =
        reject_unknown path [ "kind"; "library"; "functionId"; "templateId"; "version" ] fields
      in
      let* library_json = field path "library" fields in
      let* library = string_at (path ^ ".library") library_json in
      let* function_id_json = field path "functionId" fields in
      let* function_id = string_at (path ^ ".functionId") function_id_json in
      let* template_id_json = field path "templateId" fields in
      let* template_id = string_at (path ^ ".templateId") template_id_json in
      let* version_json = field path "version" fields in
      let* version = string_at (path ^ ".version") version_json in
      if not (String.equal library Standard_library.namespace) then
        error (path ^ ".library") (Invalid_value ("unknown library " ^ library))
      else (
        match Standard_library.find_function template_id with
        | None ->
            error (path ^ ".templateId")
              (Invalid_value ("unknown Standard Library template " ^ template_id))
        | Some info ->
            let expected_function_id =
              match info.Standard_library.id with
              | Standard_library.Add -> "nat.add"
              | Standard_library.Multiply -> "nat.multiply"
              | Standard_library.Double -> "nat.double"
              | Standard_library.Square -> "nat.square"
              | Standard_library.Pred -> "nat.pred"
              | Standard_library.Subtract -> "nat.subtract"
              | Standard_library.IsZero -> "nat.isZero"
              | Standard_library.Not -> "bool.not"
              | Standard_library.And -> "bool.and"
              | Standard_library.Or -> "bool.or"
              | Standard_library.Equal -> "nat.equal"
              | Standard_library.LessThan -> "nat.lessThan"
              | Standard_library.LessOrEqual -> "nat.lessOrEqual"
              | Standard_library.Min -> "nat.min"
              | Standard_library.Max -> "nat.max"
              | Standard_library.Divide -> "nat.divide"
              | Standard_library.Modulo -> "nat.modulo"
            in
            if not (String.equal info.Standard_library.stable_id template_id) then
              error (path ^ ".templateId")
                (Invalid_value ("unknown Standard Library template " ^ template_id))
            else if not (String.equal expected_function_id function_id) then
              error (path ^ ".functionId")
                (Invalid_value ("function ID does not match " ^ template_id))
            else if not (String.equal version Standard_library.version) then
              error (path ^ ".version")
                (Invalid_value ("unsupported Standard Library version " ^ version))
            else Ok (Library_call { library; function_id; template_id; version }))
  | "project_call" ->
      let* () = reject_unknown path [ "kind"; "templateId" ] fields in
      let* template_json = field path "templateId" fields in
      let* template_id = string_at (path ^ ".templateId") template_json in
      Ok (Project_call { template_id })
  | value -> error (path ^ ".kind") (Invalid_value ("unknown element kind " ^ value))

let decode_port_anchor path json =
  let* fields = object_at path json in
  let* () = reject_unknown path [ "port"; "x"; "y" ] fields in
  let* port_json = field path "port" fields in
  let* port = string_at (path ^ ".port") port_json in
  let* x_json = field path "x" fields in
  let* y_json = field path "y" fields in
  let* x = int_at (path ^ ".x") x_json in
  let* y = int_at (path ^ ".y") y_json in
  Ok { port; at = { x; y } }

let decode_list path decode json =
  let* values = array_at path json in
  let rec loop index acc = function
    | [] -> Ok (List.rev acc)
    | value :: rest ->
        let* decoded = decode (path ^ "[" ^ string_of_int index ^ "]") value in
        loop (index + 1) (decoded :: acc) rest
  in
  loop 0 [] values

let decode_element path json =
  let* fields = object_at path json in
  let* () =
    reject_unknown path [ "id"; "kind"; "bounds"; "properties"; "portAnchors" ] fields
  in
  let* id_json = field path "id" fields in
  let* id = string_at (path ^ ".id") id_json in
  let* kind_json = field path "kind" fields in
  let* kind_name = string_at (path ^ ".kind") kind_json in
  let properties =
    match optional_field "properties" fields with Some value -> value | None -> `Assoc []
  in
  let kind_fields =
    match properties with
    | `Assoc values -> `Assoc (("kind", `String kind_name) :: values)
    | _ -> properties
  in
  let* kind = decode_element_kind (path ^ ".properties") kind_fields in
  let* bounds_json = field path "bounds" fields in
  let* bounds = decode_bounds (path ^ ".bounds") bounds_json in
  let* anchors_json = field path "portAnchors" fields in
  let* port_anchors = decode_list (path ^ ".portAnchors") decode_port_anchor anchors_json in
  Ok { id; kind; bounds; port_anchors }

let decode_boundary path json =
  let* fields = object_at path json in
  let* () = reject_unknown path [ "id"; "role"; "captureKey"; "type"; "anchor" ] fields in
  let* id_json = field path "id" fields in
  let* id = string_at (path ^ ".id") id_json in
  let* role_json = field path "role" fields in
  let* role_name = string_at (path ^ ".role") role_json in
  let* role =
    match role_name with
    | "parameter" -> Ok Parameter
    | "result" -> Ok Result
    | "capture" ->
        let* key_json = field path "captureKey" fields in
        let* key = string_at (path ^ ".captureKey") key_json in
        Ok (Capture key)
    | value -> error (path ^ ".role") (Invalid_value ("unknown boundary role " ^ value))
  in
  let* type_json = field path "type" fields in
  let* typ = decode_type (path ^ ".type") type_json in
  let* anchor_json = field path "anchor" fields in
  let* anchor = decode_point (path ^ ".anchor") anchor_json in
  Ok { id; role; typ; anchor }

let decode_container_kind path json =
  let* fields = object_at path json in
  let* kind_json = field path "kind" fields in
  let* kind = string_at (path ^ ".kind") kind_json in
  let* template_json = field path "templateId" fields in
  let* template_id = string_at (path ^ ".templateId") template_json in
  let* result_json = field path "resultType" fields in
  let* result_type = decode_type (path ^ ".resultType") result_json in
  let* dependencies =
    match optional_field "dependencies" fields with
    | None -> Ok []
    | Some value -> decode_string_array (path ^ ".dependencies") value
  in
  match kind with
  | "entry" ->
      let* () =
        reject_unknown path [ "kind"; "templateId"; "resultType"; "dependencies" ] fields
      in
      Ok (Entry { template_id; result_type; dependencies })
  | "template" ->
      let* () =
        reject_unknown path
          [ "kind"; "templateId"; "parameterType"; "resultType"; "dependencies" ]
          fields
      in
      let* parameter_json = field path "parameterType" fields in
      let* parameter_type = decode_type (path ^ ".parameterType") parameter_json in
      Ok (Template { template_id; parameter_type; result_type; dependencies })
  | value -> error (path ^ ".kind") (Invalid_value ("unknown container kind " ^ value))

let decode_container path json =
  let* fields = object_at path json in
  let* () =
    reject_unknown path [ "id"; "kind"; "bounds"; "boundaryPorts" ] fields
  in
  let* id_json = field path "id" fields in
  let* id = string_at (path ^ ".id") id_json in
  let* kind_json = field path "kind" fields in
  let* kind = decode_container_kind (path ^ ".kind") kind_json in
  let* bounds_json = field path "bounds" fields in
  let* bounds = decode_bounds (path ^ ".bounds") bounds_json in
  let* boundaries_json = field path "boundaryPorts" fields in
  let* boundary_ports =
    decode_list (path ^ ".boundaryPorts") decode_boundary boundaries_json
  in
  Ok { id; kind; bounds; boundary_ports }

let decode_hint path json =
  let* fields = object_at path json in
  let* kind_json = field path "kind" fields in
  let* kind = string_at (path ^ ".kind") kind_json in
  let string_field name =
    let* json = field path name fields in
    string_at (path ^ "." ^ name) json
  in
  match kind with
  | "element_port" ->
      let* () = reject_unknown path [ "kind"; "elementId"; "port" ] fields in
      let* element_id = string_field "elementId" in
      let* port = string_field "port" in
      Ok (Element_port { element_id; port })
  | "boundary_port" ->
      let* () = reject_unknown path [ "kind"; "containerId"; "boundaryId" ] fields in
      let* container_id = string_field "containerId" in
      let* boundary_id = string_field "boundaryId" in
      Ok (Boundary_port { container_id; boundary_id })
  | "junction" ->
      let* () = reject_unknown path [ "kind"; "junctionId" ] fields in
      let* id = string_field "junctionId" in
      Ok (Junction id)
  | "junction_outlet" ->
      let* () = reject_unknown path [ "kind"; "junctionId"; "outletId" ] fields in
      let* junction_id = string_field "junctionId" in
      let* outlet_id = string_field "outletId" in
      Ok (Junction_outlet { junction_id; outlet_id })
  | value -> error (path ^ ".kind") (Invalid_value ("unknown hint kind " ^ value))

let decode_wire path json =
  let* fields = object_at path json in
  let* () =
    reject_unknown path [ "id"; "points"; "sourceHint"; "targetHint"; "provenance" ] fields
  in
  let* id_json = field path "id" fields in
  let* id = string_at (path ^ ".id") id_json in
  let* points_json = field path "points" fields in
  let* points = decode_list (path ^ ".points") decode_point points_json in
  let decode_optional name =
    match optional_field name fields with
    | None -> Ok None
    | Some value ->
        let* hint = decode_hint (path ^ "." ^ name) value in
        Ok (Some hint)
  in
  let* source_hint = decode_optional "sourceHint" in
  let* target_hint = decode_optional "targetHint" in
  let* () =
    match optional_field "provenance" fields with
    | None -> Ok ()
    | Some json ->
        let* provenance_fields = object_at (path ^ ".provenance") json in
        let* () =
          reject_unknown (path ^ ".provenance")
            [ "kind"; "sourcePortId"; "role"; "connectionId" ]
            provenance_fields
        in
        let* kind_json = field (path ^ ".provenance") "kind" provenance_fields in
        let* kind = string_at (path ^ ".provenance.kind") kind_json in
        let* () =
          if String.equal kind "auto_resource_flow" then Ok ()
          else
            error (path ^ ".provenance.kind")
              (Invalid_value ("unknown wire provenance " ^ kind))
        in
        let* source_json =
          field (path ^ ".provenance") "sourcePortId" provenance_fields
        in
        let* _source =
          string_at (path ^ ".provenance.sourcePortId") source_json
        in
        let* role_json = field (path ^ ".provenance") "role" provenance_fields in
        let* role = string_at (path ^ ".provenance.role") role_json in
        let* () =
          if
            List.exists (String.equal role)
              [ "root-wire"; "chain-wire"; "consumer-wire"; "drop-wire" ]
          then Ok ()
          else
            error (path ^ ".provenance.role")
              (Invalid_value ("unknown wire role " ^ role))
        in
        (match optional_field "connectionId" provenance_fields with
        | None -> Ok ()
        | Some connection_json ->
            let* _connection =
              string_at (path ^ ".provenance.connectionId") connection_json
            in
            Ok ())
  in
  Ok { id; points; source_hint; target_hint }

let decode_outlet path json =
  let* fields = object_at path json in
  let* () = reject_unknown path [ "id"; "order"; "anchor" ] fields in
  let* id_json = field path "id" fields in
  let* id = string_at (path ^ ".id") id_json in
  let* order_json = field path "order" fields in
  let* order = int_at (path ^ ".order") order_json in
  let* anchor_json = field path "anchor" fields in
  let* anchor = decode_point (path ^ ".anchor") anchor_json in
  Ok { id; order; anchor }

let decode_junction path json =
  let* fields = object_at path json in
  let* () = reject_unknown path [ "id"; "anchor"; "outlets" ] fields in
  let* id_json = field path "id" fields in
  let* id = string_at (path ^ ".id") id_json in
  let* anchor_json = field path "anchor" fields in
  let* anchor = decode_point (path ^ ".anchor") anchor_json in
  let* outlets_json = field path "outlets" fields in
  let* outlets = decode_list (path ^ ".outlets") decode_outlet outlets_json in
  Ok { id; anchor; outlets }

let decode_view path json =
  let* fields = object_at path json in
  let* () = reject_unknown path [ "cameraX"; "cameraY"; "zoom" ] fields in
  let get name =
    let* json = field path name fields in
    int_at (path ^ "." ^ name) json
  in
  let* camera_x = get "cameraX" in
  let* camera_y = get "cameraY" in
  let* zoom = get "zoom" in
  Ok { camera_x; camera_y; zoom }

let decode_surface_parameter path json =
  let* fields = object_at path json in
  let* () = reject_unknown path [ "name"; "type" ] fields in
  let* name_json = field path "name" fields in
  let* name = string_at (path ^ ".name") name_json in
  let* type_json = field path "type" fields in
  let* typ = decode_type (path ^ ".type") type_json in
  Ok { name; typ }

let decode_surface_function path json =
  let* fields = object_at path json in
  let* () =
    reject_unknown path
      [ "name"; "templateId"; "bodyContainerId"; "parameters"; "result" ]
      fields
  in
  let* name_json = field path "name" fields in
  let* name = string_at (path ^ ".name") name_json in
  let* template_json = field path "templateId" fields in
  let* template_id = string_at (path ^ ".templateId") template_json in
  let* body_json = field path "bodyContainerId" fields in
  let* body_container_id = string_at (path ^ ".bodyContainerId") body_json in
  let* parameters_json = field path "parameters" fields in
  let* parameters =
    decode_list (path ^ ".parameters") decode_surface_parameter parameters_json
  in
  let* result_json = field path "result" fields in
  let* result_fields = object_at (path ^ ".result") result_json in
  let* () = reject_unknown (path ^ ".result") [ "name"; "type" ] result_fields in
  let* result_name_json = field (path ^ ".result") "name" result_fields in
  let* result_name = string_at (path ^ ".result.name") result_name_json in
  let* result_type_json = field (path ^ ".result") "type" result_fields in
  let* result_type = decode_type (path ^ ".result.type") result_type_json in
  Ok { name; template_id; body_container_id; parameters; result_name; result_type }

let decode_surface_project_call path json =
  let* fields = object_at path json in
  let* () = reject_unknown path [ "id"; "templateId"; "functionElementId" ] fields in
  let* id_json = field path "id" fields in
  let* id = string_at (path ^ ".id") id_json in
  let* template_json = field path "templateId" fields in
  let* template_id = string_at (path ^ ".templateId") template_json in
  let* element_json = field path "functionElementId" fields in
  let* function_element_id = string_at (path ^ ".functionElementId") element_json in
  Ok { id; template_id; function_element_id }

let decode_json text =
  let parsed =
    try Ok (Yojson.Safe.from_string text)
    with Yojson.Json_error message -> error "$" (Invalid_json message)
  in
  let* json = parsed in
  let* fields = object_at "$" json in
  let* () =
    reject_unknown "$"
      [
        "format";
        "version";
        "geometry";
        "view";
        "surfaceFunctions";
        "surfaceProjectCalls";
        "surfaceLibraryCalls";
        "currentContainerId";
        "surfaceConnections";
        "surfaceResourceFlows";
      ]
      fields
  in
  let* format_json = field "$" "format" fields in
  let* format = string_at "$.format" format_json in
  let* () =
    if format = "tilefold-project" then Ok ()
    else error "$.format" (Unknown_format format)
  in
  let* version_json = field "$" "version" fields in
  let* version = int_at "$.version" version_json in
  let* () =
    if version = 2 then Ok () else error "$.version" (Unsupported_version version)
  in
  let* geometry_json = field "$" "geometry" fields in
  let* geometry = object_at "$.geometry" geometry_json in
  let* () =
    reject_unknown "$.geometry"
      [ "snapTolerance"; "elements"; "containers"; "wires"; "junctions" ]
      geometry
  in
  let* tolerance_json = field "$.geometry" "snapTolerance" geometry in
  let* snap_tolerance = int_at "$.geometry.snapTolerance" tolerance_json in
  let decode_geometry_list name decode =
    let* json = field "$.geometry" name geometry in
    decode_list ("$.geometry." ^ name) decode json
  in
  let* elements = decode_geometry_list "elements" decode_element in
  let* containers = decode_geometry_list "containers" decode_container in
  let* wires = decode_geometry_list "wires" decode_wire in
  let* junctions = decode_geometry_list "junctions" decode_junction in
  let* view =
    match optional_field "view" fields with
    | None -> Ok None
    | Some json ->
        let* value = decode_view "$.view" json in
        Ok (Some value)
  in
  let* surface_functions =
    match optional_field "surfaceFunctions" fields with
    | None -> Ok []
    | Some json -> decode_list "$.surfaceFunctions" decode_surface_function json
  in
  let* surface_project_calls =
    match optional_field "surfaceProjectCalls" fields with
    | None -> Ok []
    | Some json ->
        decode_list "$.surfaceProjectCalls" decode_surface_project_call json
  in
  Ok
    {
      format;
      version;
      snap_tolerance;
      elements;
      containers;
      wires;
      junctions;
      view;
      surface_functions;
      surface_project_calls;
    }

let json_point (point : point) =
  `Assoc [ ("x", `Int point.x); ("y", `Int point.y) ]

let json_bounds (value : bounds) =
  `Assoc
    [
      ("x", `Int value.x);
      ("y", `Int value.y);
      ("width", `Int value.width);
      ("height", `Int value.height);
    ]

let rec json_type = function
  | Core_type.Unit -> `String "unit"
  | Core_type.Bool -> `String "bool"
  | Core_type.Nat -> `String "nat"
  | Core_type.Product (left, right) ->
      `Assoc [ ("product", `List [ json_type left; json_type right ]) ]
  | Core_type.Sum (left, right) ->
      `Assoc [ ("sum", `List [ json_type left; json_type right ]) ]
  | Core_type.List item -> `Assoc [ ("list", json_type item) ]
  | Core_type.Arrow (left, right) -> `Assoc [ ("arrow", `List [ json_type left; json_type right ]) ]

let json_captures captures =
  captures
  |> List.sort (fun (left, _) (right, _) -> String.compare left right)
  |> List.map (fun (key, typ) ->
         `Assoc [ ("key", `String key); ("type", json_type typ) ])

let json_element_kind = function
  | Unit_literal -> ("unit_literal", `Assoc [])
  | Bool_literal value -> ("bool_literal", `Assoc [ ("value", `Bool value) ])
  | Nat_literal value -> ("nat_literal", `Assoc [ ("value", `String value) ])
  | Succ -> ("succ", `Assoc [])
  | Drop typ -> ("drop", `Assoc [ ("type", json_type typ) ])
  | Copy typ -> ("copy", `Assoc [ ("type", json_type typ) ])
  | Pair { left_type; right_type } ->
      ( "pair",
        `Assoc
          [
            ("leftType", json_type left_type);
            ("rightType", json_type right_type);
          ] )
  | Unpair { left_type; right_type } ->
      ( "unpair",
        `Assoc
          [
            ("leftType", json_type left_type);
            ("rightType", json_type right_type);
          ] )
  | Left { left_type; right_type } ->
      ( "left",
        `Assoc
          [
            ("leftType", json_type left_type);
            ("rightType", json_type right_type);
          ] )
  | Right { left_type; right_type } ->
      ( "right",
        `Assoc
          [
            ("leftType", json_type left_type);
            ("rightType", json_type right_type);
          ] )
  | Case { left_type; right_type; result_type } ->
      ( "case",
        `Assoc
          [
            ("leftType", json_type left_type);
            ("rightType", json_type right_type);
            ("resultType", json_type result_type);
          ] )
  | Nil item_type -> ("nil", `Assoc [ ("itemType", json_type item_type) ])
  | Cons item_type -> ("cons", `Assoc [ ("itemType", json_type item_type) ])
  | ListRec { item_type; result_type } ->
      ( "list_rec",
        `Assoc
          [
            ("itemType", json_type item_type);
            ("resultType", json_type result_type);
          ] )
  | ListBuilder { item_type; item_ids } ->
      ( "list_builder",
        `Assoc
          [
            ("itemType", json_type item_type);
            ("itemIds", `List (List.map (fun id -> `String id) item_ids));
          ] )
  | NatRec typ -> ("nat_rec", `Assoc [ ("type", json_type typ) ])
  | BoolRec typ -> ("bool_rec", `Assoc [ ("type", json_type typ) ])
  | Apply { parameter_type; result_type } ->
      ( "apply",
        `Assoc
          [
            ("parameterType", json_type parameter_type);
            ("resultType", json_type result_type);
          ] )
  | Function { template_id; parameter_type; result_type; captures } ->
      ( "function",
        `Assoc
          [
            ("templateId", `String template_id);
            ("parameterType", json_type parameter_type);
            ("resultType", json_type result_type);
            ("captures", `List (json_captures captures));
          ] )
  | Library_call { library; function_id; template_id; version } ->
      ( "library_call",
        `Assoc
          [
            ("library", `String library);
            ("functionId", `String function_id);
            ("templateId", `String template_id);
            ("version", `String version);
          ] )
  | Project_call { template_id } ->
      ("project_call", `Assoc [ ("templateId", `String template_id) ])

let json_element (element : element) =
  let kind, properties = json_element_kind element.kind in
  let anchors =
    element.port_anchors
    |> List.sort (fun left right -> String.compare left.port right.port)
    |> List.map (fun anchor ->
           `Assoc
             [
               ("port", `String anchor.port);
               ("x", `Int anchor.at.x);
               ("y", `Int anchor.at.y);
             ])
  in
  `Assoc
    [
      ("id", `String element.id);
      ("kind", `String kind);
      ("bounds", json_bounds element.bounds);
      ("properties", properties);
      ("portAnchors", `List anchors);
    ]

let json_boundary boundary =
  let role_fields =
    match boundary.role with
    | Parameter -> [ ("role", `String "parameter") ]
    | Result -> [ ("role", `String "result") ]
    | Capture key ->
        [ ("role", `String "capture"); ("captureKey", `String key) ]
  in
  `Assoc
    ([ ("id", `String boundary.id) ]
    @ role_fields
    @ [ ("type", json_type boundary.typ); ("anchor", json_point boundary.anchor) ])

let json_container_kind = function
  | Entry { template_id; result_type; dependencies } ->
      `Assoc
        [
          ("kind", `String "entry");
          ("templateId", `String template_id);
          ("resultType", json_type result_type);
          ("dependencies", `List (List.map (fun value -> `String value) (List.sort String.compare dependencies)));
        ]
  | Template { template_id; parameter_type; result_type; dependencies } ->
      `Assoc
        [
          ("kind", `String "template");
          ("templateId", `String template_id);
          ("parameterType", json_type parameter_type);
          ("resultType", json_type result_type);
          ("dependencies", `List (List.map (fun value -> `String value) (List.sort String.compare dependencies)));
        ]

let json_container (container : container) =
  `Assoc
    [
      ("id", `String container.id);
      ("kind", json_container_kind container.kind);
      ("bounds", json_bounds container.bounds);
      ( "boundaryPorts",
        `List
          (container.boundary_ports
          |> List.sort (fun (left : boundary_port) (right : boundary_port) ->
                 String.compare left.id right.id)
          |> List.map json_boundary) );
    ]

let json_hint = function
  | Element_port { element_id; port } ->
      `Assoc
        [
          ("kind", `String "element_port");
          ("elementId", `String element_id);
          ("port", `String port);
        ]
  | Boundary_port { container_id; boundary_id } ->
      `Assoc
        [
          ("kind", `String "boundary_port");
          ("containerId", `String container_id);
          ("boundaryId", `String boundary_id);
        ]
  | Junction id ->
      `Assoc [ ("kind", `String "junction"); ("junctionId", `String id) ]
  | Junction_outlet { junction_id; outlet_id } ->
      `Assoc
        [
          ("kind", `String "junction_outlet");
          ("junctionId", `String junction_id);
          ("outletId", `String outlet_id);
        ]

let json_wire (wire : wire) =
  let fields =
    [
      ("id", `String wire.id);
      ("points", `List (List.map json_point wire.points));
    ]
  in
  let fields =
    match wire.source_hint with
    | None -> fields
    | Some hint -> fields @ [ ("sourceHint", json_hint hint) ]
  in
  let fields =
    match wire.target_hint with
    | None -> fields
    | Some hint -> fields @ [ ("targetHint", json_hint hint) ]
  in
  `Assoc fields

let json_junction (junction : junction) =
  `Assoc
    [
      ("id", `String junction.id);
      ("anchor", json_point junction.anchor);
      ( "outlets",
        `List
          (junction.outlets
          |> List.sort (fun (left : outlet) (right : outlet) ->
                 Int.compare left.order right.order)
          |> List.map (fun (outlet : outlet) ->
                 `Assoc
                   [
                     ("id", `String outlet.id);
                     ("order", `Int outlet.order);
                     ("anchor", json_point outlet.anchor);
                   ])) );
    ]

let json_surface_function (function_info : surface_function) =
  `Assoc
    [
      ("name", `String function_info.name);
      ("templateId", `String function_info.template_id);
      ("bodyContainerId", `String function_info.body_container_id);
      ( "parameters",
        `List
          (List.map
             (fun (parameter : surface_parameter) ->
               `Assoc
                 [
                   ("name", `String parameter.name);
                   ("type", json_type parameter.typ);
                 ])
             function_info.parameters) );
      ( "result",
        `Assoc
          [
            ("name", `String function_info.result_name);
            ("type", json_type function_info.result_type);
          ] );
    ]

let json_surface_project_call (call : surface_project_call) =
  `Assoc
    [
      ("id", `String call.id);
      ("templateId", `String call.template_id);
      ("functionElementId", `String call.function_element_id);
    ]

let encode_json document =
  let by_id get left right = String.compare (get left) (get right) in
  let geometry =
    `Assoc
      [
        ("snapTolerance", `Int document.snap_tolerance);
        ( "elements",
          `List
            (document.elements
            |> List.sort (by_id (fun (value : element) -> value.id))
            |> List.map json_element) );
        ( "containers",
          `List
            (document.containers
            |> List.sort (by_id (fun (value : container) -> value.id))
            |> List.map json_container) );
        ( "wires",
          `List
            (document.wires
            |> List.sort (by_id (fun (value : wire) -> value.id))
            |> List.map json_wire) );
        ( "junctions",
          `List
            (document.junctions
            |> List.sort (by_id (fun (value : junction) -> value.id))
            |> List.map json_junction) );
      ]
  in
  let fields =
    [
      ("format", `String document.format);
      ("version", `Int document.version);
      ("geometry", geometry);
    ]
  in
  let fields =
    match document.view with
    | None -> fields
    | Some view ->
        fields
        @ [
            ( "view",
              `Assoc
                [
                  ("cameraX", `Int view.camera_x);
                  ("cameraY", `Int view.camera_y);
                  ("zoom", `Int view.zoom);
                ] );
          ]
  in
  let fields =
    if document.surface_functions = [] then fields
    else
      fields
      @ [
          ( "surfaceFunctions",
            `List
              (document.surface_functions
              |> List.sort (by_id (fun (value : surface_function) -> value.template_id))
              |> List.map json_surface_function) );
        ]
  in
  let fields =
    if document.surface_project_calls = [] then fields
    else
      fields
      @ [
          ( "surfaceProjectCalls",
            `List
              (document.surface_project_calls
              |> List.sort (by_id (fun (value : surface_project_call) -> value.id))
              |> List.map json_surface_project_call) );
        ]
  in
  Yojson.Safe.pretty_to_string ~std:true (`Assoc fields) ^ "\n"

let valid_id value =
  let valid_character = function
    | 'a' .. 'z' | 'A' .. 'Z' | '0' .. '9' | '_' | '-' | '.' -> true
    | _ -> false
  in
  String.length value > 0
  && String.length value <= 128
  && String.for_all valid_character value

let core_kind = function
  | Unit_literal -> Ok C.Unit_literal
  | Bool_literal value -> Ok (C.Bool_literal value)
  | Nat_literal value ->
      (match Nat.of_string value with
      | Ok value -> Ok (C.Nat_literal value)
      | Error _ -> Error ())
  | Succ -> Ok C.Succ
  | Drop typ -> Ok (C.Drop typ)
  | Copy typ -> Ok (C.Copy typ)
  | Pair { left_type; right_type } -> Ok (C.Pair { left_type; right_type })
  | Unpair { left_type; right_type } -> Ok (C.Unpair { left_type; right_type })
  | Left { left_type; right_type } ->
      Ok (C.Left { sum_left_type = left_type; sum_right_type = right_type })
  | Right { left_type; right_type } ->
      Ok (C.Right { sum_left_type = left_type; sum_right_type = right_type })
  | Case { left_type; right_type; result_type } ->
      Ok
        (C.Case
           {
             case_left_type = left_type;
             case_right_type = right_type;
             case_result_type = result_type;
           })
  | Nil item_type -> Ok (C.Nil item_type)
  | Cons item_type -> Ok (C.Cons item_type)
  | ListRec { item_type; result_type } ->
      Ok (C.ListRec { list_item_type = item_type; list_result_type = result_type })
  | NatRec typ -> Ok (C.NatRec typ)
  | BoolRec typ -> Ok (C.BoolRec typ)
  | Apply { parameter_type; result_type } ->
      Ok
        (C.Apply
           { apply_parameter_type = parameter_type; apply_result_type = result_type })
  | Function { template_id; parameter_type; result_type; captures } ->
      (match C.Function_template_id.of_string template_id with
      | Error _ -> Error ()
      | Ok template_id ->
          let rec decode_captures acc = function
            | [] -> Ok (List.rev acc)
            | (key, typ) :: rest ->
                (match C.Port_key.of_string key with
                | Error _ -> Error ()
                | Ok key -> decode_captures ({ C.key; typ } :: acc) rest)
          in
          (match decode_captures [] captures with
          | Error () -> Error ()
          | Ok captures ->
              Ok
                (C.Function
                   { template_id; parameter_type; result_type; captures })))
  | Library_call _ -> Error ()
  | Project_call _ -> Error ()
  | ListBuilder _ -> Error ()

let duplicate_values values =
  let sorted = List.sort String.compare values in
  let rec loop acc = function
    | left :: (right :: _ as rest) when left = right -> loop (left :: acc) rest
    | _ :: rest -> loop acc rest
    | [] -> List.sort_uniq String.compare acc
  in
  loop [] sorted

let point_equal (left : point) (right : point) =
  left.x = right.x && left.y = right.y

let validate document =
  let errors = ref [] in
  let add error = errors := error :: !errors in
  if document.snap_tolerance < 0 || document.snap_tolerance > 1_000_000 then
    add (Validation_error.Invalid_snap_tolerance document.snap_tolerance);
  let ids =
    List.map (fun (element : element) -> ("elements", element.id)) document.elements
    @ List.concat_map
        (fun (element : element) ->
          match element.kind with
          | ListBuilder { item_ids; _ } ->
              List.map (fun id -> ("listBuilderItems", id)) item_ids
          | _ -> [])
        document.elements
    @ List.map (fun (container : container) -> ("containers", container.id)) document.containers
    @ List.concat_map
        (fun (container : container) ->
          List.map
            (fun (boundary : boundary_port) -> ("boundaryPorts", boundary.id))
            container.boundary_ports)
        document.containers
    @ List.map (fun (wire : wire) -> ("wires", wire.id)) document.wires
    @ List.map (fun (junction : junction) -> ("junctions", junction.id)) document.junctions
    @ List.concat_map
        (fun (junction : junction) ->
          List.map (fun (outlet : outlet) -> ("outlets", outlet.id)) junction.outlets)
        document.junctions
  in
  List.iter
    (fun (path, id) ->
      if not (valid_id id) then add (Validation_error.Invalid_id { path; id }))
    ids;
  duplicate_values (List.map snd ids)
  |> List.iter (fun id -> add (Validation_error.Duplicate_id id));
  let check_bounds id bounds =
    if bounds.width <= 0 || bounds.height <= 0 then
      add (Validation_error.Invalid_bounds { id; bounds })
  in
  List.iter (fun (element : element) -> check_bounds element.id element.bounds) document.elements;
  List.iter (fun (container : container) -> check_bounds container.id container.bounds) document.containers;
  List.iter
    (fun (element : element) ->
      (match element.kind with
      | Nat_literal value ->
          if Result.is_error (Nat.of_string value) then
            add (Validation_error.Invalid_nat_literal { element_id = element.id; value })
      | Function { template_id; captures; _ } ->
          if not (valid_id template_id) then
            add (Validation_error.Invalid_id { path = "templateId"; id = template_id });
          List.iter
            (fun (key, _) ->
              if not (valid_id key) then
                add (Validation_error.Invalid_id { path = "capture key"; id = key }))
            captures
      | _ -> ());
      match core_kind element.kind with
      | Error () -> (
          match element.kind with
          | Library_call { template_id; _ } -> (
              match Standard_library.find_function template_id with
              | None -> ()
              | Some info ->
                  let expected =
                    List.init (Standard_library.arity info.id)
                      (fun index -> "arg_" ^ string_of_int index)
                    @ [ "result" ]
                    |> List.sort String.compare
                  in
                  let actual =
                    element.port_anchors
                    |> List.map (fun (anchor : port_anchor) -> anchor.port)
                    |> List.sort String.compare
                  in
                  let invalid =
                    expected <> actual || duplicate_values actual <> []
                  in
                  if invalid then
                    let port = String.concat "," actual in
                    add
                      (Validation_error.Invalid_port_anchor
                         { element_id = element.id; port }))
          | Project_call { template_id } -> (
              match
                List.find_opt
                  (fun (function_info : surface_function) ->
                    String.equal function_info.template_id template_id)
                  document.surface_functions
              with
              | None -> ()
              | Some function_info ->
                  let expected =
                    List.init (List.length function_info.parameters)
                      (fun index -> "arg_" ^ string_of_int index)
                    @ [ "result" ]
                    |> List.sort String.compare
                  in
                  let actual =
                    element.port_anchors
                    |> List.map (fun (anchor : port_anchor) -> anchor.port)
                    |> List.sort String.compare
                  in
                  let invalid =
                    expected <> actual || duplicate_values actual <> []
                  in
                  if invalid then
                    let port = String.concat "," actual in
                    add
                      (Validation_error.Invalid_port_anchor
                         { element_id = element.id; port }))
          | ListBuilder { item_ids; _ } ->
              let expected = (item_ids @ [ "result" ]) |> List.sort String.compare in
              let actual =
                element.port_anchors
                |> List.map (fun (anchor : port_anchor) -> anchor.port)
                |> List.sort String.compare
              in
              let invalid = expected <> actual || duplicate_values actual <> [] in
              if invalid then
                let port = String.concat "," actual in
                add (Validation_error.Invalid_port_anchor { element_id = element.id; port })
          | _ -> ())
      | Ok kind ->
          let expected =
            C.ports_of_node_kind kind
            |> List.map (fun port -> C.Port_key.to_string port.C.key)
            |> List.sort String.compare
          in
          let actual =
            List.map (fun anchor -> anchor.port) element.port_anchors
            |> List.sort String.compare
          in
          let invalid = expected <> actual || duplicate_values actual <> [] in
          if invalid then
            let port = String.concat "," actual in
            add (Validation_error.Invalid_port_anchor { element_id = element.id; port }))
    document.elements;
  List.iter
    (fun (wire : wire) ->
      if List.length wire.points < 2 then
        add (Validation_error.Invalid_wire_polyline wire.id);
      let rec duplicates (points : point list) =
        match points with
        | left :: (right :: _ as rest) ->
            if point_equal left right then
              add
                (Validation_error.Consecutive_duplicate_wire_point
                   { wire_id = wire.id; point = left });
            duplicates rest
        | _ -> ()
      in
      duplicates wire.points)
    document.wires;
  List.iter
    (fun (junction : junction) ->
      if List.length junction.outlets < 2 then
        add (Validation_error.Invalid_outlet_count junction.id);
      duplicate_values
        (List.map (fun (outlet : outlet) -> string_of_int outlet.order) junction.outlets)
      |> List.iter (fun order ->
             add
               (Validation_error.Duplicate_outlet_order
                  { junction_id = junction.id; order = int_of_string order })))
    document.junctions;
  let find_element id = List.find_opt (fun (value : element) -> value.id = id) document.elements in
  let find_container id = List.find_opt (fun (value : container) -> value.id = id) document.containers in
  let find_junction id = List.find_opt (fun (value : junction) -> value.id = id) document.junctions in
  let check_hint (wire : wire) hint =
    let dangling reference =
      add (Validation_error.Dangling_reference { owner_id = wire.id; reference })
    in
    match hint with
    | Element_port { element_id; port } ->
        (match find_element element_id with
        | None -> dangling element_id
        | Some element ->
            if not (List.exists (fun (anchor : port_anchor) -> anchor.port = port) element.port_anchors)
            then dangling (element_id ^ ":" ^ port))
    | Boundary_port { container_id; boundary_id } ->
        (match find_container container_id with
        | None -> dangling container_id
        | Some container ->
            if
              not
                (List.exists
                   (fun (boundary : boundary_port) -> boundary.id = boundary_id)
                   container.boundary_ports)
            then dangling boundary_id)
    | Junction id -> if Option.is_none (find_junction id) then dangling id
    | Junction_outlet { junction_id; outlet_id } ->
        (match find_junction junction_id with
        | None -> dangling junction_id
        | Some junction ->
            if not (List.exists (fun (outlet : outlet) -> outlet.id = outlet_id) junction.outlets)
            then dangling outlet_id)
  in
  List.iter
    (fun (wire : wire) ->
      Option.iter (check_hint wire) wire.source_hint;
      Option.iter (check_hint wire) wire.target_hint)
    document.wires;
  if !errors = [] then Ok document
  else Error (List.rev !errors)

let document validated = validated

let absolute (container : container) (point : point) =
  { G.x = container.bounds.x + point.x; y = container.bounds.y + point.y }

let geometry_bounds (bounds : bounds) =
  {
    G.left = bounds.x;
    top = bounds.y;
    right = bounds.x + bounds.width;
    bottom = bounds.y + bounds.height;
  }

let point_of_anchor (anchor : port_anchor) = { G.x = anchor.at.x; y = anchor.at.y }

let anchor_named anchors name =
  List.find_opt (fun (anchor : port_anchor) -> String.equal anchor.port name) anchors

let generated_wire id source target =
  { G.id = id; points = [ source; target ] }

let standard_library_apply_types info =
  let rec loop remaining typ acc =
    if remaining = 0 then Ok (List.rev acc)
    else
      match typ with
      | Core_type.Arrow (parameter_type, result_type) ->
          loop (remaining - 1) result_type ((parameter_type, result_type) :: acc)
      | _ -> Error ()
  in
  loop (Standard_library.arity info.Standard_library.id)
    (Core_type.Arrow (info.parameter_type, info.result_type))
    []

let curried_type parameters result_type =
  List.fold_right
    (fun (parameter : surface_parameter) result ->
      Core_type.Arrow (parameter.typ, result))
    parameters result_type

let surface_function_apply_types function_info =
  let rec loop index acc =
    match List.nth_opt function_info.parameters index with
    | None -> Ok (List.rev acc)
    | Some parameter ->
        let remaining =
          let rec drop count values =
            match (count, values) with
            | 0, values -> values
            | _, [] -> []
            | count, _ :: rest -> drop (count - 1) rest
          in
          drop (index + 1) function_info.parameters
        in
        let result_type = curried_type remaining function_info.result_type in
        loop (index + 1) ((parameter.typ, result_type) :: acc)
  in
  loop 0 []

let standard_library_generated_scene (element : element) =
  match element.kind with
  | Library_call { template_id; _ } -> (
      match Standard_library.find_function template_id with
      | None -> ([], [])
      | Some info -> (
          match Standard_library.id_of_template_id (Standard_library.function_template_id info.id) with
          | None -> ([], [])
          | Some _ ->
              let arity = Standard_library.arity info.id in
              let result_anchor = anchor_named element.port_anchors "result" in
              let argument_anchors =
                List.init arity (fun index -> anchor_named element.port_anchors ("arg_" ^ string_of_int index))
              in
              if Option.is_none result_anchor || List.exists Option.is_none argument_anchors then
                ([], [])
              else
                match standard_library_apply_types info with
                | Error () -> ([], [])
                | Ok apply_types ->
                    let result_point = point_of_anchor (Option.get result_anchor) in
                    let argument_points =
                      argument_anchors
                      |> List.map (fun value -> point_of_anchor (Option.get value))
                    in
                    let function_value =
                      {
                        G.x = element.bounds.x + 12;
                        y = element.bounds.y + (element.bounds.height / 2);
                      }
                    in
                    let function_input index =
                      {
                        G.x = element.bounds.x + 32 + (index * 22);
                        y = element.bounds.y + 16 + (index * 10);
                      }
                    in
                    let apply_result index =
                      if index = arity - 1 then result_point
                      else
                        {
                          G.x = element.bounds.x + element.bounds.width - 48 + (index * 8);
                          y = element.bounds.y + 22 + (index * 14);
                        }
                    in
                    let node_id suffix =
                      match S.Element_id.of_string (element.id ^ "__std_" ^ suffix) with
                      | Ok id -> id
                      | Error _ -> assert false
                    in
                    let wire_id suffix =
                      match G.Wire_id.of_string (element.id ^ "__std_" ^ suffix) with
                      | Ok id -> id
                      | Error _ -> assert false
                    in
                    let function_element =
                      {
                        G.id = node_id "function";
                        kind =
                          C.Function
                            {
                              template_id = Standard_library.function_template_id info.id;
                              parameter_type = info.parameter_type;
                              result_type = info.result_type;
                              captures = [];
                            };
                        bounds = geometry_bounds element.bounds;
                        ports = [ (C.Port_key.value, function_value) ];
                      }
                    in
                    let apply_elements =
                      List.combine argument_points apply_types
                      |> List.mapi (fun index (argument_point, (parameter_type, result_type)) ->
                             let function_point = function_input index in
                             let result_point = apply_result index in
                             {
                               G.id = node_id ("apply_" ^ string_of_int index);
                               kind =
                                 C.Apply
                                   {
                                     apply_parameter_type = parameter_type;
                                     apply_result_type = result_type;
                                   };
                               bounds = geometry_bounds element.bounds;
                               ports =
                                 [
                                   (C.Port_key.function_input, function_point);
                                   (C.Port_key.argument, argument_point);
                                   (C.Port_key.result, result_point);
                                 ];
                             })
                    in
                    let internal_wires =
                      argument_points
                      |> List.mapi (fun index _ ->
                             let source =
                               if index = 0 then function_value else apply_result (index - 1)
                             in
                             generated_wire
                               (wire_id ("wire_function_" ^ string_of_int index))
                               source (function_input index))
                    in
                    (function_element :: apply_elements, internal_wires)))
  | _ -> ([], [])

let project_call_generated_scene document (element : element) =
  match element.kind with
  | Project_call { template_id } -> (
      match
        List.find_opt
          (fun (function_info : surface_function) ->
            String.equal function_info.template_id template_id)
          document.surface_functions
      with
      | None -> ([], [])
      | Some function_info -> (
          match function_info.parameters with
          | [] -> ([], [])
          | first_parameter :: rest_parameters ->
              let arity = List.length function_info.parameters in
              let result_anchor = anchor_named element.port_anchors "result" in
              let argument_anchors =
                List.init arity (fun index ->
                    anchor_named element.port_anchors ("arg_" ^ string_of_int index))
              in
              if Option.is_none result_anchor || List.exists Option.is_none argument_anchors then
                ([], [])
              else
                match surface_function_apply_types function_info with
                | Error () -> ([], [])
                | Ok apply_types ->
                    let result_point = point_of_anchor (Option.get result_anchor) in
                    let argument_points =
                      argument_anchors
                      |> List.map (fun value -> point_of_anchor (Option.get value))
                    in
                    let function_value =
                      {
                        G.x = element.bounds.x + 12;
                        y = element.bounds.y + (element.bounds.height / 2);
                      }
                    in
                    let function_input index =
                      {
                        G.x = element.bounds.x + 32 + (index * 22);
                        y = element.bounds.y + 16 + (index * 10);
                      }
                    in
                    let apply_result index =
                      if index = arity - 1 then result_point
                      else
                        {
                          G.x = element.bounds.x + element.bounds.width - 48 + (index * 8);
                          y = element.bounds.y + 22 + (index * 14);
                        }
                    in
                    let node_id suffix =
                      match S.Element_id.of_string (element.id ^ "__call_" ^ suffix) with
                      | Ok id -> id
                      | Error _ -> assert false
                    in
                    let wire_id suffix =
                      match G.Wire_id.of_string (element.id ^ "__call_" ^ suffix) with
                      | Ok id -> id
                      | Error _ -> assert false
                    in
                    let function_element =
                      {
                        G.id = node_id "function";
                        kind =
                          C.Function
                            {
                              template_id =
                                (match C.Function_template_id.of_string template_id with
                                | Ok id -> id
                                | Error _ -> assert false);
                              parameter_type = first_parameter.typ;
                              result_type =
                                curried_type rest_parameters function_info.result_type;
                              captures = [];
                            };
                        bounds = geometry_bounds element.bounds;
                        ports = [ (C.Port_key.value, function_value) ];
                      }
                    in
                    let apply_elements =
                      List.combine argument_points apply_types
                      |> List.mapi (fun index (argument_point, (parameter_type, result_type)) ->
                             let function_point = function_input index in
                             let result_point = apply_result index in
                             {
                               G.id = node_id ("apply_" ^ string_of_int index);
                               kind =
                                 C.Apply
                                   {
                                     apply_parameter_type = parameter_type;
                                     apply_result_type = result_type;
                                   };
                               bounds = geometry_bounds element.bounds;
                               ports =
                                 [
                                   (C.Port_key.function_input, function_point);
                                   (C.Port_key.argument, argument_point);
                                   (C.Port_key.result, result_point);
                                 ];
                             })
                    in
                    let internal_wires =
                      argument_points
                      |> List.mapi (fun index _ ->
                             let source =
                               if index = 0 then function_value else apply_result (index - 1)
                             in
                             generated_wire
                               (wire_id ("wire_function_" ^ string_of_int index))
                               source (function_input index))
                    in
                    (function_element :: apply_elements, internal_wires)))
  | _ -> ([], [])

let list_builder_generated_id builder_id suffix =
  "__list_builder_" ^ builder_id ^ "_" ^ suffix

let list_builder_generated_wire_id builder_id suffix =
  "__list_builder_" ^ builder_id ^ "_wire_" ^ suffix

let list_builder_generated_expansion (element : element) =
  match element.kind with
  | ListBuilder { item_type; item_ids } -> (
      let result_anchor = anchor_named element.port_anchors "result" in
      let item_anchors =
        item_ids
        |> List.map (fun item_id -> (item_id, anchor_named element.port_anchors item_id))
      in
      if Option.is_none result_anchor || List.exists (fun (_, anchor) -> Option.is_none anchor) item_anchors then
        ([], [])
      else
        let result_point = (Option.get result_anchor).at in
        let clamp low high value = max low (min high value) in
        let point index =
          if index = 0 then result_point
          else
            {
              x =
                clamp (element.bounds.x + 12)
                  (element.bounds.x + element.bounds.width - 12)
                  (result_point.x - (index * 24));
              y =
                clamp (element.bounds.y + 12)
                  (element.bounds.y + element.bounds.height - 12)
                  (result_point.y + (index * 8));
            }
        in
        let nil_value = point (List.length item_ids) in
        let nil =
          {
            id = list_builder_generated_id element.id "nil";
            kind = Nil item_type;
            bounds = element.bounds;
            port_anchors = [ { port = "value"; at = nil_value } ];
          }
        in
        let cons_entries =
          List.mapi
            (fun index (item_id, anchor) ->
                 let value_point = point index in
                 let tail_point =
                   {
                     x =
                       clamp (element.bounds.x + 12)
                         (element.bounds.x + element.bounds.width - 12)
                         (value_point.x - 32);
                     y =
                       clamp (element.bounds.y + 12)
                         (element.bounds.y + element.bounds.height - 12)
                         (value_point.y + 18);
                   }
                 in
                 let next_value = point (index + 1) in
                 let head_point = (Option.get anchor).at in
                 let cons_id = list_builder_generated_id element.id ("cons_" ^ item_id) in
                 let cons =
                   {
                     id = cons_id;
                     kind = Cons item_type;
                     bounds = element.bounds;
                     port_anchors =
                       [
                         { port = "head"; at = head_point };
                         { port = "tail"; at = tail_point };
                         { port = "value"; at = value_point };
                       ];
                   }
                 in
                 let wire =
                   {
                     id = list_builder_generated_wire_id element.id ("tail_" ^ item_id);
                     points = [ next_value; tail_point ];
                     source_hint =
                       Some
                         (Element_port
                            {
                              element_id =
                                (match List.nth_opt item_ids (index + 1) with
                                | Some next_item_id ->
                                    list_builder_generated_id element.id
                                      ("cons_" ^ next_item_id)
                                | None -> list_builder_generated_id element.id "nil");
                              port = "value";
                            });
                     target_hint =
                       Some (Element_port { element_id = cons_id; port = "tail" });
                   }
                 in
                 (cons, wire, next_value))
            item_anchors
        in
        let cons_nodes, wires, _last_value =
          List.fold_right
            (fun (cons, wire, _next_value) (nodes, wires, last) ->
              (cons :: nodes, wire :: wires, last))
            cons_entries ([], [], nil_value)
        in
        (nil :: cons_nodes, wires))
  | _ -> ([], [])

let list_builder_output_endpoint builder_id item_ids =
  match item_ids with
  | [] ->
      Element_port { element_id = list_builder_generated_id builder_id "nil"; port = "value" }
  | first :: _ ->
      Element_port
        {
          element_id = list_builder_generated_id builder_id ("cons_" ^ first);
          port = "value";
        }

let expand_list_builders document =
  let builders =
    document.elements
    |> List.filter_map (fun (element : element) ->
           match element.kind with
           | ListBuilder { item_ids; _ } -> Some (element.id, item_ids)
           | _ -> None)
  in
  let builder_item_target element_id port =
    match List.assoc_opt element_id builders with
    | Some item_ids when List.exists (String.equal port) item_ids ->
        Some
          (Element_port
             {
               element_id = list_builder_generated_id element_id ("cons_" ^ port);
               port = "head";
             })
    | _ -> None
  in
  let remap_endpoint = function
    | Some (Element_port { element_id; port = "result" }) -> (
        match List.assoc_opt element_id builders with
        | Some item_ids -> Some (list_builder_output_endpoint element_id item_ids)
        | None -> Some (Element_port { element_id; port = "result" }))
    | Some (Element_port { element_id; port }) -> (
        match builder_item_target element_id port with
        | Some endpoint -> Some endpoint
        | None -> Some (Element_port { element_id; port }))
    | other -> other
  in
  let generated_elements, generated_wires =
    document.elements
    |> List.map list_builder_generated_expansion
    |> List.fold_left
         (fun (elements, wires) (next_elements, next_wires) ->
           (elements @ next_elements, wires @ next_wires))
         ([], [])
  in
  let elements =
    document.elements
    |> List.filter (fun (element : element) ->
           match element.kind with ListBuilder _ -> false | _ -> true)
    |> fun elements -> elements @ generated_elements
  in
  let wires =
    document.wires
    |> List.map (fun (wire : wire) ->
           {
             wire with
             source_hint = remap_endpoint wire.source_hint;
             target_hint = remap_endpoint wire.target_hint;
           })
    |> fun wires -> wires @ generated_wires
  in
  { document with elements; wires }

let multi_surface_function_for_body document container_id =
  document.surface_functions
  |> List.find_opt (fun function_info ->
         String.equal function_info.body_container_id container_id
         && List.length function_info.parameters > 1)

let flat_body_template_id (function_info : surface_function) =
  function_info.template_id ^ "__flat_body"

let curried_template_id (function_info : surface_function) index =
  if index = 0 then function_info.template_id
  else function_info.template_id ^ "__curried_" ^ string_of_int index

let flat_generated_capture key typ = { C.key = key; typ }

let sort_captures_by_port_key captures =
  List.sort
    (fun (left : C.capture) (right : C.capture) ->
      C.Port_key.compare left.C.key right.C.key)
    captures

let explicit_captures_of_boundary_ports boundary_ports =
  boundary_ports
  |> List.filter_map (fun (boundary : boundary_port) ->
         match boundary.role with
         | Capture key -> Some (key, boundary.typ)
         | _ -> None)
  |> List.sort (fun (left_key, _) (right_key, _) -> String.compare left_key right_key)

let explicit_core_captures_of_boundary_ports ~invalid boundary_ports =
  explicit_captures_of_boundary_ports boundary_ports
  |> List.filter_map (fun (key, typ) ->
         match C.Port_key.of_string key with
         | Ok key -> Some { C.key; typ }
         | Error message ->
             invalid key message;
             None)
  |> sort_captures_by_port_key

let generated_core_captures_of_parameters parameters =
  parameters
  |> List.map (fun (parameter : surface_parameter) ->
         match C.Port_key.of_string parameter.name with
         | Ok key -> flat_generated_capture key parameter.typ
         | Error _ -> assert false)

let flat_core_captures ~invalid container parameters =
  explicit_core_captures_of_boundary_ports ~invalid container.boundary_ports
  @ generated_core_captures_of_parameters parameters
  |> sort_captures_by_port_key

let list_filteri predicate values =
  values
  |> List.mapi (fun index value -> (index, value))
  |> List.filter_map (fun (index, value) ->
         if predicate index value then Some value else None)

let port_key_or_fail value =
  match C.Port_key.of_string value with Ok key -> key | Error _ -> assert false

let function_template_id_or_fail value =
  match C.Function_template_id.of_string value with Ok id -> id | Error _ -> assert false

let sort_parameters_by_port_key parameters =
  parameters
  |> List.sort (fun (left : surface_parameter) (right : surface_parameter) ->
         C.Port_key.compare (port_key_or_fail left.name) (port_key_or_fail right.name))

let generated_curried_surface_scene document =
  let make_for_function function_index function_info =
    match function_info.parameters with
    | [] | [ _ ] -> ([], [], [], [])
    | parameters ->
        let explicit_captures =
          document.containers
          |> List.find_opt (fun (container : container) ->
                 String.equal container.id function_info.body_container_id)
          |> Option.map (fun container ->
                 explicit_captures_of_boundary_ports container.boundary_ports
                 |> List.map (fun (name, typ) : surface_parameter -> { name; typ }))
          |> Option.value ~default:[]
        in
        let last_index = List.length parameters - 1 in
        let containers = ref [] in
        let boundaries = ref [] in
        let elements = ref [] in
        let wires = ref [] in
        let base_x =
          50_000
          + (function_index * 10_000)
          + (String.length function_info.template_id * 10)
        in
        for index = 0 to last_index - 1 do
          let parameter = List.nth parameters index in
          let previous = list_filteri (fun i _ -> i < index) parameters in
          let captures_for_container =
            sort_parameters_by_port_key (previous @ explicit_captures)
          in
          let captured_for_next =
            list_filteri (fun i _ -> i <= index) parameters
          in
          let remaining_after_current =
            list_filteri (fun i _ -> i > index) parameters
          in
          let result_type =
            curried_type remaining_after_current function_info.result_type
          in
          let container_id = curried_template_id function_info index in
          let next_template_id =
            if index = last_index - 1 then flat_body_template_id function_info
            else curried_template_id function_info (index + 1)
          in
          let x = base_x + (index * 480) in
          let y = 50_000 in
          let bounds = { G.left = x; top = y; right = x + 360; bottom = y + 180 } in
          let container =
            {
              G.id =
                (match S.Container_id.of_string ("__flat_" ^ container_id) with
                | Ok id -> id
                | Error _ -> assert false);
              kind =
                S.Template
                  {
                    template_id = function_template_id_or_fail container_id;
                    parameter_type = parameter.typ;
                    result_type;
                    captures =
                      generated_core_captures_of_parameters captures_for_container
                      |> sort_captures_by_port_key;
                    dependencies = [ function_template_id_or_fail next_template_id ];
                  };
              bounds;
            }
          in
          containers := container :: !containers;
          let boundary_id suffix =
            match G.Boundary_id.of_string ("__flat_" ^ container_id ^ "_" ^ suffix) with
            | Ok id -> id
            | Error _ -> assert false
          in
          boundaries :=
            {
              G.id = boundary_id "parameter";
              container_id = container.G.id;
              role = G.Boundary_parameter;
              typ = parameter.typ;
              position = { G.x = x; y = y + 64 };
            }
            :: {
                 G.id = boundary_id "result";
                 container_id = container.G.id;
                 role = G.Boundary_result;
                 typ = result_type;
                 position = { G.x = x + 360; y = y + 64 };
               }
            :: !boundaries;
          captures_for_container
          |> List.iteri (fun capture_index (capture : surface_parameter) ->
                 boundaries :=
                   {
                     G.id = boundary_id ("capture_" ^ capture.name);
                     container_id = container.G.id;
                     role = G.Boundary_capture (port_key_or_fail capture.name);
                     typ = capture.typ;
                     position = { G.x = x; y = y + 112 + (capture_index * 24) };
                   }
                   :: !boundaries);
          let function_id =
            match S.Element_id.of_string ("__flat_" ^ container_id ^ "_function") with
            | Ok id -> id
            | Error _ -> assert false
          in
          let function_x = x + 168 in
          let function_y = y + 48 in
          let ordered_captures_for_next =
            sort_parameters_by_port_key (captured_for_next @ explicit_captures)
          in
          let captures =
            generated_core_captures_of_parameters ordered_captures_for_next
            |> sort_captures_by_port_key
          in
          let function_element =
            {
              G.id = function_id;
              kind =
                C.Function
                  {
                    template_id = function_template_id_or_fail next_template_id;
                    parameter_type =
                      (List.nth parameters (index + 1)).typ;
                    result_type =
                      curried_type
                        (list_filteri (fun i _ -> i > index + 1) parameters)
                        function_info.result_type;
                    captures;
                  };
              bounds =
                { G.left = function_x; top = function_y; right = function_x + 128; bottom = function_y + 72 };
              ports =
                (List.mapi
                   (fun capture_index (capture : surface_parameter) ->
                     ( port_key_or_fail capture.name,
                       { G.x = function_x; y = function_y + 24 + (capture_index * 20) } ))
                   ordered_captures_for_next)
                @ [ (C.Port_key.value, { G.x = function_x + 128; y = function_y + 36 }) ];
            }
          in
          elements := function_element :: !elements;
          let wire_id suffix =
            match G.Wire_id.of_string ("__flat_" ^ container_id ^ "_" ^ suffix) with
            | Ok id -> id
            | Error _ -> assert false
          in
          let connect_capture source_point target_key suffix =
            let target =
              List.assoc target_key function_element.G.ports
            in
            wires :=
              generated_wire (wire_id suffix) source_point target :: !wires
          in
          connect_capture { G.x = x; y = y + 64 } (port_key_or_fail parameter.name)
            ("parameter_to_" ^ parameter.name);
          captures_for_container
          |> List.iteri (fun capture_index (capture : surface_parameter) ->
                 connect_capture
                   { G.x = x; y = y + 112 + (capture_index * 24) }
                   (port_key_or_fail capture.name)
                   ("capture_to_" ^ capture.name));
          wires :=
            generated_wire (wire_id "result")
              { G.x = function_x + 128; y = function_y + 36 }
              { G.x = x + 360; y = y + 64 }
            :: !wires
        done;
        (!containers, !boundaries, !elements, !wires)
  in
  document.surface_functions
  |> List.mapi make_for_function
  |> List.fold_left
       (fun (containers, boundaries, elements, wires)
            (next_containers, next_boundaries, next_elements, next_wires) ->
         ( containers @ next_containers,
           boundaries @ next_boundaries,
           elements @ next_elements,
           wires @ next_wires ))
       ([], [], [], [])

let to_raw_scene document =
  let document = expand_list_builders document in
  let conversion_errors = ref [] in
  let invalid id message =
    conversion_errors := Conversion_error.Invalid_internal_id { id; message } :: !conversion_errors
  in
  let id convert value =
    match convert value with Ok value -> Some value | Error message -> invalid value message; None
  in
  let expanded_library_elements, expanded_library_wires =
    document.elements
    |> List.map standard_library_generated_scene
    |> List.fold_left
         (fun (elements, wires) (next_elements, next_wires) ->
           (elements @ next_elements, wires @ next_wires))
         ([], [])
  in
  let expanded_project_call_elements, expanded_project_call_wires =
    document.elements
    |> List.map (project_call_generated_scene document)
    |> List.fold_left
         (fun (elements, wires) (next_elements, next_wires) ->
           (elements @ next_elements, wires @ next_wires))
         ([], [])
  in
  let
    ( generated_flat_containers,
      generated_flat_boundaries,
      generated_flat_elements,
      generated_flat_wires )
    =
    generated_curried_surface_scene document
  in
  let core_elements =
    document.elements
    |> List.filter_map (fun (element : element) ->
           match (id S.Element_id.of_string element.id, core_kind element.kind) with
           | Some element_id, Ok kind ->
               let ports =
                 element.port_anchors
                 |> List.filter_map (fun anchor ->
                        match C.Port_key.of_string anchor.port with
                        | Ok key -> Some (key, { G.x = anchor.at.x; y = anchor.at.y })
                        | Error message -> invalid anchor.port message; None)
               in
               Some { G.id = element_id; kind; bounds = geometry_bounds element.bounds; ports }
           | _ -> None)
    |> fun elements ->
    elements @ expanded_library_elements @ expanded_project_call_elements
    @ generated_flat_elements
  in
  let flat_info_for_container (container : container) =
    multi_surface_function_for_body document container.id
  in
  let captures_of_container (container : container) =
    match flat_info_for_container container with
    | Some function_info ->
        let parameters = function_info.parameters in
        let generated_parameters =
          parameters |> List.rev |> List.tl |> List.rev
        in
        flat_core_captures ~invalid container generated_parameters
    | None ->
        container.boundary_ports
        |> List.filter_map (fun (boundary : boundary_port) ->
               match boundary.role with
               | Capture key ->
                   (match C.Port_key.of_string key with
                   | Ok key -> Some { C.key; typ = boundary.typ }
                   | Error message -> invalid key message; None)
               | _ -> None)
        |> List.sort (fun (left : C.capture) (right : C.capture) ->
               C.Port_key.compare left.C.key right.C.key)
  in
  let dependencies values =
    values
    |> List.filter_map (id C.Function_template_id.of_string)
    |> List.sort C.Function_template_id.compare
  in
  let container_dependencies container stored =
    List.sort_uniq String.compare
      (stored @ graph_dependencies_for_container document container)
    |> dependencies
  in
  let core_containers =
    document.containers
    |> List.filter_map (fun (container : container) ->
           match id S.Container_id.of_string container.id with
           | None -> None
           | Some container_id ->
               let captures = captures_of_container container in
               let kind =
                 match container.kind with
                 | Entry { template_id; result_type; dependencies = deps } ->
                     Option.map
                       (fun template_id ->
                         S.Entry
                           {
                             template_id;
                             result_type;
                             captures;
                             dependencies = container_dependencies container deps;
                           })
                       (id C.Function_template_id.of_string template_id)
                 | Template
                     { template_id; parameter_type; result_type; dependencies = deps } ->
                     let template_id, parameter_type, result_type =
                       match flat_info_for_container container with
                       | None -> (template_id, parameter_type, result_type)
                       | Some function_info ->
                           let last_parameter =
                             List.hd (List.rev function_info.parameters)
                           in
                           ( flat_body_template_id function_info,
                             last_parameter.typ,
                             function_info.result_type )
                     in
                     Option.map
                       (fun template_id ->
                         S.Template
                           {
                             template_id;
                             parameter_type;
                             result_type;
                             captures;
                             dependencies = container_dependencies container deps;
                           })
                       (id C.Function_template_id.of_string template_id)
               in
               Option.map
                 (fun kind ->
                   { G.id = container_id; kind; bounds = geometry_bounds container.bounds })
                 kind)
    |> fun containers -> containers @ generated_flat_containers
  in
  let boundaries =
    (document.containers
    |> List.concat_map (fun (container : container) ->
           let flat_info = flat_info_for_container container in
           let flat_last_parameter_id =
             match flat_info with
             | None -> None
             | Some _function_info -> (
                 container.boundary_ports
                 |> List.filter (fun (boundary : boundary_port) ->
                        boundary.role = Parameter)
                 |> List.sort (fun (left : boundary_port) (right : boundary_port) ->
                        Int.compare left.anchor.y right.anchor.y)
                 |> List.rev
                 |> function
                 | boundary :: _ -> Some boundary.id
                 | [] -> None)
           in
           container.boundary_ports
           |> List.filter_map (fun (boundary : boundary_port) ->
                  match
                    ( id G.Boundary_id.of_string boundary.id,
                      id S.Container_id.of_string container.id )
                  with
                  | Some boundary_id, Some container_id ->
                      let role =
                        match boundary.role with
                        | Parameter -> (
                            match flat_info with
                            | Some function_info
                              when Some boundary.id <> flat_last_parameter_id ->
                                let ordered_parameters =
                                  container.boundary_ports
                                  |> List.filter (fun (candidate : boundary_port) ->
                                         candidate.role = Parameter)
                                  |> List.sort (fun (left : boundary_port) (right : boundary_port) ->
                                         Int.compare left.anchor.y right.anchor.y)
                                in
                                let parameter_index =
                                  ordered_parameters
                                  |> List.mapi (fun index value -> (index, value))
                                  |> List.find_map
                                       (fun (index, (candidate : boundary_port)) ->
                                         if String.equal candidate.id boundary.id then
                                           Some index
                                         else None)
                                in
                                (match parameter_index with
                                | Some index -> (
                                    match List.nth_opt function_info.parameters index with
                                    | Some parameter ->
                                        Option.map
                                          (fun key -> G.Boundary_capture key)
                                          (id C.Port_key.of_string parameter.name)
                                    | None -> None)
                                | None -> None)
                            | _ -> Some G.Boundary_parameter)
                        | Result -> Some G.Boundary_result
                        | Capture key ->
                            Option.map
                              (fun key -> G.Boundary_capture key)
                              (id C.Port_key.of_string key)
                      in
                      Option.map
                        (fun role ->
                          {
                            G.id = boundary_id;
                            container_id;
                            role;
                            typ = boundary.typ;
                            position = absolute container boundary.anchor;
                          })
                        role
                  | _ -> None)))
    @ generated_flat_boundaries
  in
  let core_wires =
    document.wires
    |> List.filter_map (fun (wire : wire) ->
           Option.map
             (fun wire_id ->
               {
                 G.id = wire_id;
                 points =
                   List.map
                     (fun (point : point) -> { G.x = point.x; y = point.y })
                     wire.points;
               })
             (id G.Wire_id.of_string wire.id))
    |> fun wires ->
    wires @ expanded_library_wires @ expanded_project_call_wires @ generated_flat_wires
  in
  let core_junctions =
    document.junctions
    |> List.filter_map (fun (junction : junction) ->
           Option.map
             (fun junction_id ->
               {
                 G.id = junction_id;
                 position = { G.x = junction.anchor.x; y = junction.anchor.y };
                 outlets =
                   junction.outlets
                   |> List.sort (fun (left : outlet) (right : outlet) ->
                          Int.compare left.order right.order)
                   |> List.map (fun (outlet : outlet) ->
                          {
                            G.order = outlet.order;
                            position = { G.x = outlet.anchor.x; y = outlet.anchor.y };
                          });
               })
             (id G.Junction_id.of_string junction.id))
  in
  let rec hint_point hint =
    match hint with
    | Element_port { element_id; port } ->
        Option.bind
          (find_element_by_id document.elements element_id)
          (fun (element : element) ->
            List.find_opt
              (fun (anchor : port_anchor) -> anchor.port = port)
              element.port_anchors)
        |> Option.map (fun (anchor : port_anchor) -> anchor.at)
    | Boundary_port { container_id; boundary_id } ->
        Option.bind
          (find_container_by_id document.containers container_id)
          (fun (container : container) ->
            List.find_opt
              (fun (boundary : boundary_port) -> boundary.id = boundary_id)
              container.boundary_ports
            |> Option.map (fun (boundary : boundary_port) ->
                   {
                     x = container.bounds.x + boundary.anchor.x;
                     y = container.bounds.y + boundary.anchor.y;
                   }))
    | Junction id ->
        find_junction_by_id document.junctions id |> Option.map (fun value -> value.anchor)
    | Junction_outlet { junction_id; outlet_id } ->
        Option.bind
          (find_junction_by_id document.junctions junction_id)
          (fun (junction : junction) ->
            List.find_opt
              (fun (outlet : outlet) -> outlet.id = outlet_id)
              junction.outlets)
        |> Option.map (fun (outlet : outlet) -> outlet.anchor)
  and find_element_by_id (values : element list) id =
    List.find_opt (fun (value : element) -> value.id = id) values
  and find_container_by_id (values : container list) id =
    List.find_opt (fun (value : container) -> value.id = id) values
  and find_junction_by_id (values : junction list) id =
    List.find_opt (fun (value : junction) -> value.id = id) values
  in
  let distance2 (left : point) (right : point) =
    let dx = Int64.of_int (left.x - right.x) in
    let dy = Int64.of_int (left.y - right.y) in
    Int64.add (Int64.mul dx dx) (Int64.mul dy dy)
  in
  let candidate_points =
    List.concat_map
      (fun (element : element) ->
        List.map (fun (anchor : port_anchor) -> anchor.at) element.port_anchors)
      document.elements
    @ List.concat_map
        (fun (container : container) ->
          List.map
            (fun (boundary : boundary_port) ->
              {
                x = container.bounds.x + boundary.anchor.x;
                y = container.bounds.y + boundary.anchor.y;
              })
            container.boundary_ports)
        document.containers
    @ List.concat_map
        (fun (junction : junction) ->
          junction.anchor
          :: List.map (fun (outlet : outlet) -> outlet.anchor) junction.outlets)
        document.junctions
  in
  let tolerance2 =
    let value = Int64.of_int document.snap_tolerance in
    Int64.mul value value
  in
  let hint_name = function
    | Element_port { element_id; port } -> element_id ^ ":" ^ port
    | Boundary_port { boundary_id; _ } -> boundary_id
    | Junction id -> id
    | Junction_outlet { outlet_id; _ } -> outlet_id
  in
  List.iter
    (fun (wire : wire) ->
      let check side endpoint = function
        | None -> ()
        | Some hint ->
            (match hint_point hint with
            | Some expected ->
                let expected_distance = distance2 endpoint expected in
                let minimum_distance =
                  candidate_points
                  |> List.map (distance2 endpoint)
                  |> List.sort Int64.compare
                  |> function [] -> None | value :: _ -> Some value
                in
                if
                  Int64.compare expected_distance tolerance2 <= 0
                  && Option.equal Int64.equal minimum_distance
                       (Some expected_distance)
                then ()
                else
                  conversion_errors :=
                    Conversion_error.Port_hint_mismatch
                      { wire_id = wire.id; side; hint = hint_name hint }
                    :: !conversion_errors
            | _ ->
                conversion_errors :=
                  Conversion_error.Port_hint_mismatch
                    { wire_id = wire.id; side; hint = hint_name hint }
                  :: !conversion_errors)
      in
      match wire.points with
      | first :: rest ->
          check "source" first wire.source_hint;
          check "target" (List.hd (List.rev rest)) wire.target_hint
      | [] -> ())
    document.wires;
  if !conversion_errors <> [] then Error (List.rev !conversion_errors)
  else
    Ok
      (G.Raw_scene.create ~tolerance:document.snap_tolerance
         ~containers:core_containers ~elements:core_elements
         ~boundary_ports:boundaries ~wires:core_wires ~junctions:core_junctions ())

let infer_symbolic document =
  match validate document with
  | Error errors -> Error (`Validation errors)
  | Ok validated ->
      (match to_raw_scene validated with
      | Error errors -> Error (`Conversion errors)
      | Ok raw ->
          (match G.validate raw with
          | Error errors -> Error (`Geometry errors)
          | Ok scene ->
              (match G.infer_and_validate_symbolic scene with
              | Ok symbolic -> Ok symbolic
              | Error errors -> Error (`Inference errors))))
