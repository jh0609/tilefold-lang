(** Persistent, editor-facing Tilefold project documents.

    This model is deliberately distinct from {!Surface_geometry.Raw_scene}. *)

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
  | Apply of {
      parameter_type : Core_type.t;
      result_type : Core_type.t;
    }
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

type boundary_role =
  | Parameter
  | Result
  | Capture of string

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

type outlet = {
  id : string;
  order : int;
  anchor : point;
}

type junction = {
  id : string;
  anchor : point;
  outlets : outlet list;
}

type view = {
  camera_x : int;
  camera_y : int;
  zoom : int;
}

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

module Decode_error : sig
  type kind =
    | Invalid_json of string
    | Missing_field
    | Wrong_type of string
    | Unknown_field
    | Unknown_format of string
    | Unsupported_version of int
    | Invalid_value of string

  type t = { path : string; kind : kind }
  val to_string : t -> string
end

module Validation_error : sig
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

  val to_string : t -> string
end

type validated

module Conversion_error : sig
  type t =
    | Invalid_internal_id of { id : string; message : string }
    | Port_hint_mismatch of { wire_id : string; side : string; hint : string }

  val to_string : t -> string
end

val decode_json : string -> (t, Decode_error.t) result
val encode_json : t -> string
val validate : t -> (validated, Validation_error.t list) result
val document : validated -> t

val to_raw_scene :
  validated -> (Surface_geometry.Raw_scene.t, Conversion_error.t list) result

(** Decode, validate, convert, validate geometry, and infer validated symbolic
    relations while preserving project IDs in geometry diagnostics. *)
val infer_symbolic :
  t ->
  (Surface_symbolic.t,
   [ `Validation of Validation_error.t list
   | `Conversion of Conversion_error.t list
   | `Geometry of Surface_geometry.validation_error list
   | `Inference of Surface_geometry.inference_error list ])
  result
