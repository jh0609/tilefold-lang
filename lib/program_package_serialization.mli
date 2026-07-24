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
  | Dangling_template_reference of Core_graph.Function_template_id.t
  | Template_dependency_cycle of Core_graph.Function_template_id.t list
  | Package_validation_errors of Program_package.validation_error list

val format_version : string
val semantics_profile : string
val encode : Program_package.t -> string
val decode : string -> (Program_package.t, error) result
val render_error : error -> string
