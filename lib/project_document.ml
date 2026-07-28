module G = Surface_geometry
module S = Surface_symbolic
module C = Core_graph

type point = { x : int; y : int }
type bounds = { x : int; y : int; width : int; height : int }
type port_anchor = { port : string; at : point }

type element_kind =
  | Unit_literal
  | Nat_literal of string
  | Succ
  | Drop of Core_type.t
  | Copy of Core_type.t
  | Function of {
      template_id : string;
      parameter_type : Core_type.t;
      result_type : Core_type.t;
      captures : (string * Core_type.t) list;
    }
  | Apply of { parameter_type : Core_type.t; result_type : Core_type.t }
  | NatRec of Core_type.t

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

type t = {
  format : string;
  version : int;
  snap_tolerance : int;
  elements : element list;
  containers : container list;
  wires : wire list;
  junctions : junction list;
  view : view option;
}

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
  | `String "nat" -> Ok Core_type.Nat
  | `Assoc fields ->
      let* () = reject_unknown path [ "arrow" ] fields in
      let* arrow = field path "arrow" fields in
      let* values = array_at (path ^ ".arrow") arrow in
      (match values with
      | [ left; right ] ->
          let* left = decode_type (path ^ ".arrow[0]") left in
          let* right = decode_type (path ^ ".arrow[1]") right in
          Ok (Core_type.Arrow (left, right))
      | _ -> error (path ^ ".arrow") (Invalid_value "arrow requires two types"))
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

let decode_drop_provenance path fields =
  match optional_field "provenance" fields with
  | None -> Ok ()
  | Some json ->
      let* provenance_fields = object_at (path ^ ".provenance") json in
      let* () =
        reject_unknown (path ^ ".provenance") [ "kind"; "sourceElementId" ]
          provenance_fields
      in
      let* kind_json = field (path ^ ".provenance") "kind" provenance_fields in
      let* kind = string_at (path ^ ".provenance.kind") kind_json in
      let* () =
        if String.equal kind "auto_function_output_drop" then Ok ()
        else
          error (path ^ ".provenance.kind")
            (Invalid_value ("unknown drop provenance " ^ kind))
      in
      let* source_json =
        field (path ^ ".provenance") "sourceElementId" provenance_fields
      in
      let* _source =
        string_at (path ^ ".provenance.sourceElementId") source_json
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
  | "copy" | "nat_rec" ->
      let* () = reject_unknown path [ "kind"; "type" ] fields in
      let* typ = type_field "type" in
      Ok (if kind = "copy" then Copy typ else NatRec typ)
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
  let* () = reject_unknown path [ "id"; "points"; "sourceHint"; "targetHint" ] fields in
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

let decode_json text =
  let parsed =
    try Ok (Yojson.Safe.from_string text)
    with Yojson.Json_error message -> error "$" (Invalid_json message)
  in
  let* json = parsed in
  let* fields = object_at "$" json in
  let* () =
    reject_unknown "$"
      [ "format"; "version"; "geometry"; "view"; "surfaceFunctions"; "currentContainerId" ]
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
    if version = 1 then Ok () else error "$.version" (Unsupported_version version)
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
  Ok { format; version; snap_tolerance; elements; containers; wires; junctions; view }

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
  | Core_type.Nat -> `String "nat"
  | Core_type.Arrow (left, right) -> `Assoc [ ("arrow", `List [ json_type left; json_type right ]) ]

let json_captures captures =
  captures
  |> List.sort (fun (left, _) (right, _) -> String.compare left right)
  |> List.map (fun (key, typ) ->
         `Assoc [ ("key", `String key); ("type", json_type typ) ])

let json_element_kind = function
  | Unit_literal -> ("unit_literal", `Assoc [])
  | Nat_literal value -> ("nat_literal", `Assoc [ ("value", `String value) ])
  | Succ -> ("succ", `Assoc [])
  | Drop typ -> ("drop", `Assoc [ ("type", json_type typ) ])
  | Copy typ -> ("copy", `Assoc [ ("type", json_type typ) ])
  | NatRec typ -> ("nat_rec", `Assoc [ ("type", json_type typ) ])
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
  | Nat_literal value ->
      (match Nat.of_string value with
      | Ok value -> Ok (C.Nat_literal value)
      | Error _ -> Error ())
  | Succ -> Ok C.Succ
  | Drop typ -> Ok (C.Drop typ)
  | Copy typ -> Ok (C.Copy typ)
  | NatRec typ -> Ok (C.NatRec typ)
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
      | Error () -> ()
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

let to_raw_scene document =
  let conversion_errors = ref [] in
  let invalid id message =
    conversion_errors := Conversion_error.Invalid_internal_id { id; message } :: !conversion_errors
  in
  let id convert value =
    match convert value with Ok value -> Some value | Error message -> invalid value message; None
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
  in
  let captures_of_container (container : container) =
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
                             dependencies = dependencies deps;
                           })
                       (id C.Function_template_id.of_string template_id)
                 | Template
                     { template_id; parameter_type; result_type; dependencies = deps } ->
                     Option.map
                       (fun template_id ->
                         S.Template
                           {
                             template_id;
                             parameter_type;
                             result_type;
                             captures;
                             dependencies = dependencies deps;
                           })
                       (id C.Function_template_id.of_string template_id)
               in
               Option.map
                 (fun kind ->
                   { G.id = container_id; kind; bounds = geometry_bounds container.bounds })
                 kind)
  in
  let boundaries =
    document.containers
    |> List.concat_map (fun (container : container) ->
           container.boundary_ports
           |> List.filter_map (fun (boundary : boundary_port) ->
                  match
                    ( id G.Boundary_id.of_string boundary.id,
                      id S.Container_id.of_string container.id )
                  with
                  | Some boundary_id, Some container_id ->
                      let role =
                        match boundary.role with
                        | Parameter -> Some G.Boundary_parameter
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
                  | _ -> None))
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
