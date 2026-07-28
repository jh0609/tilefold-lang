module P = Tilefold.Project_document
module G = Tilefold.Surface_geometry
module S = Tilefold.Surface_symbolic

let fixture =
  let from_root = "examples/nat-succ.tilefold.json" in
  if Sys.file_exists from_root then from_root
  else "../examples/nat-succ.tilefold.json"

let read_file path =
  let channel = open_in_bin path in
  Fun.protect
    ~finally:(fun () -> close_in channel)
    (fun () -> really_input_string channel (in_channel_length channel))

let decode text =
  match P.decode_json text with
  | Ok value -> value
  | Error error -> failwith (P.Decode_error.to_string error)

let validate document =
  match P.validate document with
  | Ok value -> value
  | Error errors ->
      failwith
        (String.concat "\n" (List.map P.Validation_error.to_string errors))

let symbolic document =
  match P.infer_symbolic document with
  | Ok value -> value
  | Error (`Validation errors) ->
      failwith (String.concat "\n" (List.map P.Validation_error.to_string errors))
  | Error (`Conversion errors) ->
      failwith (String.concat "\n" (List.map P.Conversion_error.to_string errors))
  | Error (`Geometry errors) ->
      failwith (String.concat "\n" (List.map G.render_validation_error errors))
  | Error (`Inference errors) ->
      failwith (String.concat "\n" (List.map G.render_inference_error errors))

let expect_decode predicate text =
  match P.decode_json text with
  | Error error when predicate error -> ()
  | Error error -> failwith ("unexpected decode error: " ^ P.Decode_error.to_string error)
  | Ok _ -> failwith "expected decode error"

let expect_validation predicate document =
  match P.validate document with
  | Error errors when List.exists predicate errors -> ()
  | Error errors ->
      failwith
        ("unexpected validation errors: "
        ^ String.concat "|" (List.map P.Validation_error.to_string errors))
  | Ok _ -> failwith "expected validation error"

let () =
  let text = read_file fixture in
  let project = decode text in
  let encoded_a = P.encode_json project in
  let encoded_b = P.encode_json project in
  assert (String.equal encoded_a encoded_b);
  let round_trip = decode encoded_a in
  assert (String.equal encoded_a (P.encode_json round_trip));
  let without_view = { project with view = None } in
  ignore (decode (P.encode_json without_view));
  let huge =
    "123456789012345678901234567890123456789012345678901234567890"
  in
  let huge_project =
    {
      project with
      elements =
        List.map
          (fun (element : P.element) ->
            if element.id = "node_nat_2" then
              { element with kind = P.Nat_literal huge }
            else element)
          project.elements;
    }
  in
  let huge_round_trip = decode (P.encode_json huge_project) in
  assert
    (List.exists
       (fun (element : P.element) ->
         match element.kind with P.Nat_literal value -> value = huge | _ -> false)
       huge_round_trip.elements);
  let checked = validate project in
  let with_surface_metadata =
    Yojson.Safe.from_string (P.encode_json project)
    |> function
    | `Assoc fields ->
        `Assoc
          (fields
          @ [
              ( "surfaceFunctions",
                `List
                  [
                    `Assoc
                      [
                        ("name", `String "choose_right");
                        ("templateId", `String "entry_template");
                        ("bodyContainerId", `String "entry");
                        ( "parameters",
                          `List
                            [
                              `Assoc
                                [
                                  ("name", `String "left");
                                  ("type", `String "nat");
                                ];
                            ] );
                        ( "result",
                          `Assoc
                            [
                              ("name", `String "selected");
                              ("type", `String "nat");
                            ] );
                      ];
                  ] );
              ("currentContainerId", `String "entry");
            ])
    | _ -> assert false
  in
  ignore (decode (Yojson.Safe.to_string with_surface_metadata));
  let with_drop_provenance =
    Yojson.Safe.from_string (P.encode_json project)
    |> function
    | `Assoc fields ->
        let geometry =
          match List.assoc "geometry" fields with
          | `Assoc geometry_fields ->
              let elements =
                match List.assoc "elements" geometry_fields with
                | `List values ->
                    let patched = ref false in
                    `List
                      (List.map
                         (function
                           | `Assoc element_fields
                             when (not !patched)
                                  && List.assoc_opt "kind" element_fields
                                     = Some (`String "drop") ->
                               patched := true;
                               let properties =
                                 match List.assoc "properties" element_fields with
                                 | `Assoc property_fields ->
                                     `Assoc
                                       (property_fields
                                       @ [
                                           ( "provenance",
                                             `Assoc
                                               [
                                                 ( "kind",
                                                   `String
                                                     "auto_function_output_drop"
                                                 );
                                                 ( "sourceElementId",
                                                   `String "node_function_1" );
                                               ] );
                                         ])
                                 | value -> value
                               in
                               `Assoc
                                 (List.map
                                    (fun (name, value) ->
                                      if String.equal name "properties" then
                                        (name, properties)
                                      else (name, value))
                                    element_fields)
                           | value -> value)
                         values)
                | value -> value
              in
              `Assoc
                (List.map
                   (fun (name, value) ->
                     if String.equal name "elements" then (name, elements)
                     else (name, value))
                   geometry_fields)
          | value -> value
        in
        `Assoc
          (List.map
             (fun (name, value) ->
               if String.equal name "geometry" then (name, geometry)
               else (name, value))
             fields)
    | _ -> assert false
  in
  ignore (decode (Yojson.Safe.to_string with_drop_provenance));
  let with_resource_flow_metadata =
    Yojson.Safe.from_string (P.encode_json project)
    |> function
    | `Assoc fields ->
        let geometry =
          match List.assoc "geometry" fields with
          | `Assoc geometry_fields ->
              let elements =
                match List.assoc "elements" geometry_fields with
                | `List values ->
                    let patched = ref false in
                    `List
                      (List.map
                         (function
                           | `Assoc element_fields
                             when not !patched ->
                               patched := true;
                               `Assoc
                                 (List.map
                                    (fun (name, value) ->
                                      if String.equal name "kind" then
                                        (name, `String "copy")
                                      else if String.equal name "properties" then
                                        ( name,
                                          `Assoc
                                            [
                                              ("type", `String "nat");
                                              ( "provenance",
                                                `Assoc
                                                  [
                                                    ( "kind",
                                                      `String
                                                        "auto_resource_flow" );
                                                    ( "sourcePortId",
                                                      `String "entry:capture:index" );
                                                    ( "connectionId",
                                                      `String "surface_connection_1" );
                                                  ] );
                                            ] )
                                      else (name, value))
                                    element_fields)
                           | value -> value)
                         values)
                | value -> value
              in
              let wires =
                match List.assoc "wires" geometry_fields with
                | `List values ->
                    let patched = ref false in
                    `List
                      (List.map
                         (function
                           | `Assoc wire_fields when not !patched ->
                               patched := true;
                               `Assoc
                                 (wire_fields
                                 @ [
                                     ( "provenance",
                                       `Assoc
                                         [
                                           ("kind", `String "auto_resource_flow");
                                           ( "sourcePortId",
                                             `String "entry:capture:index" );
                                           ("role", `String "consumer-wire");
                                           ( "connectionId",
                                             `String "surface_connection_1" );
                                         ] );
                                   ])
                           | value -> value)
                         values)
                | value -> value
              in
              `Assoc
                (List.map
                   (fun (name, value) ->
                     if String.equal name "elements" then (name, elements)
                     else if String.equal name "wires" then (name, wires)
                     else (name, value))
                   geometry_fields)
          | value -> value
        in
        `Assoc
          (List.map
             (fun (name, value) ->
               if String.equal name "geometry" then (name, geometry)
               else (name, value))
             fields
          @ [
              ( "surfaceResourceFlows",
                `List
                  [
                    `Assoc
                      [ ("sourcePortId", `String "entry:capture:index") ];
                  ] );
              ( "surfaceConnections",
                `List
                  [
                    `Assoc
                      [
                        ("id", `String "surface_connection_1");
                        ("sourcePortId", `String "entry:capture:index");
                        ("targetPortId", `String "node_drop_1:input");
                        ("order", `Int 0);
                      ];
                  ] );
            ])
    | _ -> assert false
  in
  ignore (decode (Yojson.Safe.to_string with_resource_flow_metadata));
  let raw =
    match P.to_raw_scene checked with
    | Ok value -> value
    | Error errors ->
        failwith (String.concat "|" (List.map P.Conversion_error.to_string errors))
  in
  let checked_geometry =
    match G.validate raw with
    | Ok value -> value
    | Error errors ->
        failwith (String.concat "|" (List.map G.render_validation_error errors))
  in
  let canonical_raw = G.canonical_view checked_geometry in
  let reordered =
    {
      project with
      elements = List.rev project.elements;
      containers = List.rev project.containers;
      wires = List.rev project.wires;
      junctions = List.rev project.junctions;
    }
  in
  let reordered_raw =
    match P.to_raw_scene (validate reordered) with Ok value -> value | Error _ -> assert false
  in
  let reordered_geometry =
    match G.validate reordered_raw with Ok value -> value | Error _ -> assert false
  in
  assert (String.equal canonical_raw (G.canonical_view reordered_geometry));
  let symbolic_a = symbolic project in
  let symbolic_b = symbolic reordered in
  assert (String.equal (S.canonical_view symbolic_a) (S.canonical_view symbolic_b));
  let package = S.lower_to_program_package symbolic_a in
  match Tilefold.Program_package.run package with
  | Completed { value; _ } ->
      (match Tilefold.Runtime_value.payload value with
      | Nat value -> assert (String.equal (Tilefold.Nat.to_string value) "3")
      | _ -> failwith "project result was not Nat")
  | _ -> failwith "project did not execute to Nat(3)"

let () =
  expect_decode
    (fun error ->
      match error.P.Decode_error.kind with Unknown_format _ -> true | _ -> false)
    {|{"format":"other","version":1,"geometry":{}}|};
  expect_decode
    (fun error ->
      match error.P.Decode_error.kind with Unsupported_version 2 -> true | _ -> false)
    {|{"format":"tilefold-project","version":2,"geometry":{}}|};
  expect_decode
    (fun error -> String.equal error.P.Decode_error.path "$.geometry")
    {|{"format":"tilefold-project","version":1}|};
  expect_decode
    (fun error ->
      match error.P.Decode_error.kind with Wrong_type _ -> true | _ -> false)
    {|{"format":"tilefold-project","version":1,"geometry":[]}|};
  let project = decode (read_file fixture) in
  let first = List.hd project.elements in
  expect_validation
    (function P.Validation_error.Duplicate_id _ -> true | _ -> false)
    { project with elements = first :: project.elements };
  expect_validation
    (function P.Validation_error.Invalid_id _ -> true | _ -> false)
    {
      project with
      elements =
        { first with id = "not allowed!" } :: List.tl project.elements;
    };
  expect_validation
    (function P.Validation_error.Invalid_bounds _ -> true | _ -> false)
    {
      project with
      elements =
        { first with bounds = { first.bounds with width = 0 } }
        :: List.tl project.elements;
    };
  let nat =
    List.find (fun (element : P.element) -> element.id = "node_nat_2") project.elements
  in
  expect_validation
    (function P.Validation_error.Invalid_nat_literal _ -> true | _ -> false)
    {
      project with
      elements =
        { nat with kind = P.Nat_literal "02" }
        :: List.filter (fun (element : P.element) -> element.id <> nat.id) project.elements;
    };
  let wire = List.hd project.wires in
  expect_validation
    (function P.Validation_error.Invalid_wire_polyline _ -> true | _ -> false)
    { project with wires = { wire with points = [ List.hd wire.points ] } :: List.tl project.wires };
  expect_validation
    (function P.Validation_error.Consecutive_duplicate_wire_point _ -> true | _ -> false)
    {
      project with
      wires =
        { wire with points = [ List.hd wire.points; List.hd wire.points ] }
        :: List.tl project.wires;
    };
  let hinted =
    {
      wire with
      source_hint =
        Some (P.Element_port { element_id = "missing"; port = "value" });
    }
  in
  expect_validation
    (function P.Validation_error.Dangling_reference _ -> true | _ -> false)
    { project with wires = hinted :: List.tl project.wires };
  let mismatched =
    {
      wire with
      source_hint =
        Some
          (P.Element_port
             { element_id = "node_nat_2"; port = "value" });
    }
  in
  let mismatch_project =
    { project with wires = mismatched :: List.tl project.wires }
  in
  (match P.to_raw_scene (validate mismatch_project) with
  | Error errors
    when List.exists
           (function P.Conversion_error.Port_hint_mismatch _ -> true | _ -> false)
           errors ->
      ()
  | _ -> failwith "expected port hint mismatch");
  let ambiguous_element : P.element =
    {
      id = "ambiguous_unit";
      kind = P.Unit_literal;
      bounds = { x = 70; y = 60; width = 10; height = 10 };
      port_anchors = [ { port = "value"; at = { x = 80; y = 70 } } ];
    }
  in
  let ambiguous =
    {
      project with
      snap_tolerance = 1;
      elements = ambiguous_element :: project.elements;
      wires =
        List.map
          (fun (wire : P.wire) ->
            if wire.id = "wire_nat_succ" then
              { wire with source_hint = None }
            else wire)
          project.wires;
    }
  in
  (match P.infer_symbolic ambiguous with
  | Error (`Inference errors)
    when List.exists
           (function
             | G.Endpoint_has_ambiguous_candidates { wire_id; _ } ->
                 G.Wire_id.to_string wire_id = "wire_nat_succ"
             | _ -> false)
           errors ->
      ()
  | _ -> failwith "expected ambiguous endpoint with project wire ID")

let () =
  let project = decode (read_file fixture) in
  let outlet id order y : P.outlet = { id; order; anchor = { x = 101; y } } in
  let junction : P.junction =
    {
      id = "branch";
      anchor = { x = 100; y = 50 };
      outlets = [ outlet "out_b" 1 70; outlet "out_a" 0 30 ];
    }
  in
  let with_junction = { project with junctions = [ junction ] } in
  let encoded = P.encode_json with_junction in
  let zero = String.index_from encoded 0 '0' in
  let one = String.index_from encoded zero '1' in
  assert (zero < one);
  expect_validation
    (function P.Validation_error.Duplicate_outlet_order _ -> true | _ -> false)
    {
      project with
      junctions =
        [
          {
            junction with
            outlets = [ outlet "out_a" 0 30; outlet "out_b" 0 70 ];
          };
        ];
    }

let () =
  if Array.length Sys.argv > 1 then
    let exported = decode (read_file Sys.argv.(1)) in
    ignore (validate exported)
