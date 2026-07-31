module E = Tilefold.Project_execution
module P = Tilefold.Project_document
module SL = Tilefold.Standard_library
module Nat = Tilefold.Nat
module RV = Tilefold.Runtime_value

let read_file path =
  let channel = open_in_bin path in
  Fun.protect
    ~finally:(fun () -> close_in channel)
    (fun () -> really_input_string channel (in_channel_length channel))

let member name json = Yojson.Safe.Util.member name json

let pt x y : P.point = { x; y }
let bounds x y width height : P.bounds = { x; y; width; height }
let anchor port x y : P.port_anchor = { port; at = pt x y }

let element id kind bounds port_anchors : P.element =
  { id; kind; bounds; port_anchors }

let boundary id role typ x y : P.boundary_port =
  { id; role; typ; anchor = pt x y }

let wire id source target points : P.wire =
  { id; source_hint = Some source; target_hint = Some target; points }

let element_port element_id port = P.Element_port { element_id; port }
let boundary_port container_id boundary_id = P.Boundary_port { container_id; boundary_id }

let project_execution_result project =
  E.run_json (P.encode_json project) |> Yojson.Safe.from_string

let json_type = function
  | "nat" -> {json|"nat"|json}
  | "bool" -> {json|"bool"|json}
  | "nat_to_nat" -> {json|{ "arrow": ["nat", "nat"] }|json}
  | "bool_to_bool" -> {json|{ "arrow": ["bool", "bool"] }|json}
  | value -> invalid_arg ("unknown test type: " ^ value)

let _standard_call_project ~function_id ~template_id ~function_result_type
    ~arguments =
  let arity = List.length arguments in
  let dependency = template_id in
  let elements =
    let unit_drop =
      {json|{
        "id": "unit-drop",
        "kind": "drop",
        "bounds": { "x": 80, "y": 80, "width": 88, "height": 56 },
        "properties": { "type": "unit" },
        "portAnchors": [{ "port": "input", "x": 80, "y": 108 }]
      }|json}
    in
    let function_node =
      Printf.sprintf
        {json|{
        "id": "std-function",
        "kind": "function",
        "bounds": { "x": 80, "y": 180, "width": 128, "height": 72 },
        "properties": {
          "templateId": "%s",
          "parameterType": "nat",
          "resultType": %s,
          "captures": []
        },
        "portAnchors": [{ "port": "value", "x": 208, "y": 216 }]
      }|json}
        template_id (json_type function_result_type)
    in
    let argument_nodes =
      arguments
      |> List.mapi (fun index value ->
             let x = 80 + (index * 180) in
             let y = 300 + (index * 60) in
             Printf.sprintf
               {json|{
        "id": "argument-%d",
        "kind": "nat_literal",
        "bounds": { "x": %d, "y": %d, "width": 96, "height": 56 },
        "properties": { "value": "%s" },
        "portAnchors": [{ "port": "value", "x": %d, "y": %d }]
      }|json}
               index x y value (x + 96) (y + 28))
    in
    let apply_nodes =
      arguments
      |> List.mapi (fun index _ ->
             let x = 260 + (index * 190) in
             let y = 260 + (index * 60) in
             let result_type =
               if index = arity - 1 then "nat" else "nat_to_nat"
             in
             Printf.sprintf
               {json|{
        "id": "apply-%d",
        "kind": "apply",
        "bounds": { "x": %d, "y": %d, "width": 120, "height": 90 },
        "properties": { "parameterType": "nat", "resultType": %s },
        "portAnchors": [
          { "port": "function", "x": %d, "y": %d },
          { "port": "argument", "x": %d, "y": %d },
          { "port": "result", "x": %d, "y": %d }
        ]
      }|json}
               index x y (json_type result_type) x (y + 30) x (y + 60)
               (x + 120) (y + 45))
    in
    String.concat ",\n"
      (unit_drop :: function_node :: (argument_nodes @ apply_nodes))
  in
  let wires =
    let unit_wire =
      {json|{
        "id": "w-unit-drop",
        "points": [{ "x": 0, "y": 108 }, { "x": 80, "y": 108 }],
        "sourceHint": { "kind": "boundary_port", "containerId": "entry", "boundaryId": "entry-parameter" },
        "targetHint": { "kind": "element_port", "elementId": "unit-drop", "port": "input" }
      }|json}
    in
    let function_wires =
      arguments
      |> List.mapi (fun index _ ->
             let source_x, source_y =
               if index = 0 then (208, 216)
               else
                 let x = 260 + ((index - 1) * 190) in
                 let y = 260 + ((index - 1) * 60) in
                 (x + 120, y + 45)
             in
             let target_x = 260 + (index * 190) in
             let target_y = 260 + (index * 60) + 30 in
             let source =
               if index = 0 then
                 {json|{ "kind": "element_port", "elementId": "std-function", "port": "value" }|json}
               else
                 Printf.sprintf
                   {json|{ "kind": "element_port", "elementId": "apply-%d", "port": "result" }|json}
                   (index - 1)
             in
             Printf.sprintf
               {json|{
        "id": "w-function-%d",
        "points": [{ "x": %d, "y": %d }, { "x": %d, "y": %d }],
        "sourceHint": %s,
        "targetHint": { "kind": "element_port", "elementId": "apply-%d", "port": "function" }
      }|json}
               index source_x source_y target_x target_y source index)
    in
    let argument_wires =
      arguments
      |> List.mapi (fun index _ ->
             let source_x = 80 + (index * 180) + 96 in
             let source_y = 300 + (index * 60) + 28 in
             let target_x = 260 + (index * 190) in
             let target_y = 260 + (index * 60) + 60 in
             Printf.sprintf
               {json|{
        "id": "w-argument-%d",
        "points": [{ "x": %d, "y": %d }, { "x": %d, "y": %d }],
        "sourceHint": { "kind": "element_port", "elementId": "argument-%d", "port": "value" },
        "targetHint": { "kind": "element_port", "elementId": "apply-%d", "port": "argument" }
      }|json}
               index source_x source_y target_x target_y index index)
    in
    let result_wire =
      Printf.sprintf
        {json|{
        "id": "w-result",
        "points": [{ "x": %d, "y": %d }, { "x": 700, "y": 365 }],
        "sourceHint": { "kind": "element_port", "elementId": "apply-%d", "port": "result" },
        "targetHint": { "kind": "boundary_port", "containerId": "entry", "boundaryId": "entry-result" }
      }|json}
        (260 + ((arity - 1) * 190) + 120)
        (260 + ((arity - 1) * 60) + 45)
        (arity - 1)
    in
    String.concat ",\n"
      ([ unit_wire ] @ function_wires @ argument_wires @ [ result_wire ])
  in
  let apply_ids =
    arguments
    |> List.mapi (fun index _ -> Printf.sprintf {json|"apply-%d"|json} index)
    |> String.concat ", "
  in
  Printf.sprintf
    {json|{
  "format": "tilefold-project",
  "version": 2,
  "geometry": {
    "snapTolerance": 8,
    "elements": [%s],
    "containers": [
      {
        "id": "entry",
        "kind": {
          "kind": "entry",
          "templateId": "entry_template",
          "resultType": "nat",
          "dependencies": ["%s"]
        },
        "bounds": { "x": 0, "y": 0, "width": 700, "height": 500 },
        "boundaryPorts": [
          { "id": "entry-parameter", "role": "parameter", "type": "unit", "anchor": { "x": 0, "y": 108 } },
          { "id": "entry-result", "role": "result", "type": "nat", "anchor": { "x": 700, "y": 365 } }
        ]
      }
    ],
    "wires": [%s],
    "junctions": []
  },
  "surfaceLibraryCalls": [
    {
      "id": "library-call",
      "library": "tilefold.std",
      "functionId": "%s",
      "templateId": "%s",
      "version": "v1",
      "functionElementId": "std-function",
      "applyElementIds": [%s]
    }
  ]
}
|json}
    elements dependency wires function_id template_id apply_ids

let expect_mode_result project mode expected =
  let response =
    E.run_json_with_mode project ~mode |> Yojson.Safe.from_string
  in
  if member "status" response <> `String "completed" then
    failwith
      (mode ^ " execution did not complete: "
      ^ Yojson.Safe.to_string response);
  if member "result" response <> `String ("Nat(" ^ expected ^ ")") then
    failwith
      (mode ^ " execution returned unexpected result: "
      ^ Yojson.Safe.to_string response);
  response

type test_arg = Nat_arg of string | Bool_arg of bool

let typed_arg_node index arg y =
  match arg with
  | Nat_arg value ->
      Printf.sprintf
        {json|{
        "id": "argument-%d",
        "kind": "nat_literal",
        "bounds": { "x": 80, "y": %d, "width": 96, "height": 56 },
        "properties": { "value": "%s" },
        "portAnchors": [{ "port": "value", "x": 176, "y": %d }]
      }|json}
        index y value (y + 28)
  | Bool_arg value ->
      Printf.sprintf
        {json|{
        "id": "argument-%d",
        "kind": "bool_literal",
        "bounds": { "x": 88, "y": %d, "width": 88, "height": 56 },
        "properties": { "value": %s },
        "portAnchors": [{ "port": "value", "x": 176, "y": %d }]
      }|json}
        index y (if value then "true" else "false") (y + 28)

let folded_standard_call_project_typed ~function_id ~template_id ~arguments
    ~result_type =
  let arity = List.length arguments in
  let call_height = max 82 (58 + (arity * 24)) in
  let spacing = call_height / (arity + 1) in
  let arg_port index = 220 + (spacing * (index + 1)) in
  let argument_nodes =
    arguments
    |> List.mapi (fun index arg -> typed_arg_node index arg (arg_port index - 28))
    |> String.concat ",\n"
  in
  let library_ports =
    (arguments
    |> List.mapi (fun index _ ->
           Printf.sprintf {json|{ "port": "arg_%d", "x": 220, "y": %d }|json}
             index (arg_port index)))
    @ [ Printf.sprintf {json|{ "port": "result", "x": 376, "y": %d }|json}
          (220 + (call_height / 2)) ]
    |> String.concat ", "
  in
  let argument_wires =
    arguments
    |> List.mapi (fun index _ ->
           Printf.sprintf
             {json|{
        "id": "w-argument-%d",
        "points": [{ "x": 176, "y": %d }, { "x": 220, "y": %d }],
        "sourceHint": { "kind": "element_port", "elementId": "argument-%d", "port": "value" },
        "targetHint": { "kind": "element_port", "elementId": "std-call", "port": "arg_%d" }
      }|json}
             index (arg_port index) (arg_port index) index index)
    |> String.concat ",\n"
  in
  Printf.sprintf
    {json|{
  "format": "tilefold-project",
  "version": 2,
  "geometry": {
    "snapTolerance": 8,
    "elements": [
      {
        "id": "unit-drop",
        "kind": "drop",
        "bounds": { "x": 80, "y": 80, "width": 88, "height": 56 },
        "properties": { "type": "unit" },
        "portAnchors": [{ "port": "input", "x": 80, "y": 108 }]
      },
      {
        "id": "std-call",
        "kind": "library_call",
        "bounds": { "x": 220, "y": 220, "width": 156, "height": %d },
        "properties": {
          "library": "tilefold.std",
          "functionId": "%s",
          "templateId": "%s",
          "version": "v1"
        },
        "portAnchors": [%s]
      },
      %s
    ],
    "containers": [
      {
        "id": "entry",
        "kind": {
          "kind": "entry",
          "templateId": "entry_template",
          "resultType": %s,
          "dependencies": ["%s"]
        },
        "bounds": { "x": 0, "y": 0, "width": 600, "height": 420 },
        "boundaryPorts": [
          { "id": "entry-parameter", "role": "parameter", "type": "unit", "anchor": { "x": 0, "y": 108 } },
          { "id": "entry-result", "role": "result", "type": %s, "anchor": { "x": 600, "y": %d } }
        ]
      }
    ],
    "wires": [
      {
        "id": "w-unit-drop",
        "points": [{ "x": 0, "y": 108 }, { "x": 80, "y": 108 }],
        "sourceHint": { "kind": "boundary_port", "containerId": "entry", "boundaryId": "entry-parameter" },
        "targetHint": { "kind": "element_port", "elementId": "unit-drop", "port": "input" }
      },
      %s,
      {
        "id": "w-result",
        "points": [{ "x": 376, "y": %d }, { "x": 600, "y": %d }],
        "sourceHint": { "kind": "element_port", "elementId": "std-call", "port": "result" },
        "targetHint": { "kind": "boundary_port", "containerId": "entry", "boundaryId": "entry-result" }
      }
    ],
    "junctions": []
  },
  "surfaceLibraryCalls": [
    {
      "id": "library-call",
      "library": "tilefold.std",
      "functionId": "%s",
      "templateId": "%s",
      "version": "v1",
      "functionElementId": "std-call",
      "applyElementIds": []
    }
  ]
}
|json}
    call_height function_id template_id library_ports argument_nodes
    (json_type result_type) template_id (json_type result_type)
    (220 + (call_height / 2)) argument_wires (220 + (call_height / 2))
    (220 + (call_height / 2)) function_id template_id

let expect_mode_result_value project mode expected =
  let response =
    E.run_json_with_mode project ~mode |> Yojson.Safe.from_string
  in
  if member "status" response <> `String "completed" then
    failwith
      (mode ^ " execution did not complete: "
      ^ Yojson.Safe.to_string response);
  if member "result" response <> `String expected then
    failwith
      (mode ^ " execution returned unexpected result: "
      ^ Yojson.Safe.to_string response);
  response

let product_pair_project =
  {json|{
  "format": "tilefold-project",
  "version": 2,
  "geometry": {
    "snapTolerance": 8,
    "elements": [
      {
        "id": "unit-drop",
        "kind": "drop",
        "bounds": { "x": 80, "y": 80, "width": 88, "height": 56 },
        "properties": { "type": "unit" },
        "portAnchors": [{ "port": "input", "x": 80, "y": 108 }]
      },
      {
        "id": "nat-three",
        "kind": "nat_literal",
        "bounds": { "x": 80, "y": 180, "width": 96, "height": 56 },
        "properties": { "value": "3" },
        "portAnchors": [{ "port": "value", "x": 176, "y": 208 }]
      },
      {
        "id": "bool-true",
        "kind": "bool_literal",
        "bounds": { "x": 80, "y": 260, "width": 88, "height": 56 },
        "properties": { "value": true },
        "portAnchors": [{ "port": "value", "x": 168, "y": 288 }]
      },
      {
        "id": "pair",
        "kind": "pair",
        "bounds": { "x": 260, "y": 205, "width": 112, "height": 80 },
        "properties": { "leftType": "nat", "rightType": "bool" },
        "portAnchors": [
          { "port": "left", "x": 260, "y": 232 },
          { "port": "right", "x": 260, "y": 258 },
          { "port": "value", "x": 372, "y": 245 }
        ]
      }
    ],
    "containers": [
      {
        "id": "entry",
        "kind": {
          "kind": "entry",
          "templateId": "entry_template",
          "resultType": { "product": ["nat", "bool"] },
          "dependencies": []
        },
        "bounds": { "x": 0, "y": 0, "width": 560, "height": 380 },
        "boundaryPorts": [
          { "id": "entry-parameter", "role": "parameter", "type": "unit", "anchor": { "x": 0, "y": 108 } },
          { "id": "entry-result", "role": "result", "type": { "product": ["nat", "bool"] }, "anchor": { "x": 560, "y": 245 } }
        ]
      }
    ],
    "wires": [
      {
        "id": "w-unit-drop",
        "points": [{ "x": 0, "y": 108 }, { "x": 80, "y": 108 }],
        "sourceHint": { "kind": "boundary_port", "containerId": "entry", "boundaryId": "entry-parameter" },
        "targetHint": { "kind": "element_port", "elementId": "unit-drop", "port": "input" }
      },
      {
        "id": "w-nat-pair",
        "points": [{ "x": 176, "y": 208 }, { "x": 260, "y": 232 }],
        "sourceHint": { "kind": "element_port", "elementId": "nat-three", "port": "value" },
        "targetHint": { "kind": "element_port", "elementId": "pair", "port": "left" }
      },
      {
        "id": "w-bool-pair",
        "points": [{ "x": 168, "y": 288 }, { "x": 260, "y": 258 }],
        "sourceHint": { "kind": "element_port", "elementId": "bool-true", "port": "value" },
        "targetHint": { "kind": "element_port", "elementId": "pair", "port": "right" }
      },
      {
        "id": "w-result",
        "points": [{ "x": 372, "y": 245 }, { "x": 560, "y": 245 }],
        "sourceHint": { "kind": "element_port", "elementId": "pair", "port": "value" },
        "targetHint": { "kind": "boundary_port", "containerId": "entry", "boundaryId": "entry-result" }
      }
    ],
    "junctions": []
  }
}
|json}

let product_swap_project =
  {json|{
  "format": "tilefold-project",
  "version": 2,
  "geometry": {
    "snapTolerance": 8,
    "elements": [
      {
        "id": "unit-drop",
        "kind": "drop",
        "bounds": { "x": 80, "y": 80, "width": 88, "height": 56 },
        "properties": { "type": "unit" },
        "portAnchors": [{ "port": "input", "x": 80, "y": 108 }]
      },
      {
        "id": "nat-three",
        "kind": "nat_literal",
        "bounds": { "x": 80, "y": 180, "width": 96, "height": 56 },
        "properties": { "value": "3" },
        "portAnchors": [{ "port": "value", "x": 176, "y": 208 }]
      },
      {
        "id": "bool-true",
        "kind": "bool_literal",
        "bounds": { "x": 80, "y": 260, "width": 88, "height": 56 },
        "properties": { "value": true },
        "portAnchors": [{ "port": "value", "x": 168, "y": 288 }]
      },
      {
        "id": "pair-in",
        "kind": "pair",
        "bounds": { "x": 260, "y": 205, "width": 112, "height": 80 },
        "properties": { "leftType": "nat", "rightType": "bool" },
        "portAnchors": [
          { "port": "left", "x": 260, "y": 232 },
          { "port": "right", "x": 260, "y": 258 },
          { "port": "value", "x": 372, "y": 245 }
        ]
      },
      {
        "id": "unpair",
        "kind": "unpair",
        "bounds": { "x": 430, "y": 205, "width": 112, "height": 80 },
        "properties": { "leftType": "nat", "rightType": "bool" },
        "portAnchors": [
          { "port": "value", "x": 430, "y": 245 },
          { "port": "left", "x": 542, "y": 232 },
          { "port": "right", "x": 542, "y": 258 }
        ]
      },
      {
        "id": "pair-out",
        "kind": "pair",
        "bounds": { "x": 600, "y": 205, "width": 112, "height": 80 },
        "properties": { "leftType": "bool", "rightType": "nat" },
        "portAnchors": [
          { "port": "left", "x": 600, "y": 232 },
          { "port": "right", "x": 600, "y": 258 },
          { "port": "value", "x": 712, "y": 245 }
        ]
      }
    ],
    "containers": [
      {
        "id": "entry",
        "kind": {
          "kind": "entry",
          "templateId": "entry_template",
          "resultType": { "product": ["bool", "nat"] },
          "dependencies": []
        },
        "bounds": { "x": 0, "y": 0, "width": 880, "height": 380 },
        "boundaryPorts": [
          { "id": "entry-parameter", "role": "parameter", "type": "unit", "anchor": { "x": 0, "y": 108 } },
          { "id": "entry-result", "role": "result", "type": { "product": ["bool", "nat"] }, "anchor": { "x": 880, "y": 245 } }
        ]
      }
    ],
    "wires": [
      {
        "id": "w-unit-drop",
        "points": [{ "x": 0, "y": 108 }, { "x": 80, "y": 108 }],
        "sourceHint": { "kind": "boundary_port", "containerId": "entry", "boundaryId": "entry-parameter" },
        "targetHint": { "kind": "element_port", "elementId": "unit-drop", "port": "input" }
      },
      {
        "id": "w-nat-pair",
        "points": [{ "x": 176, "y": 208 }, { "x": 260, "y": 232 }],
        "sourceHint": { "kind": "element_port", "elementId": "nat-three", "port": "value" },
        "targetHint": { "kind": "element_port", "elementId": "pair-in", "port": "left" }
      },
      {
        "id": "w-bool-pair",
        "points": [{ "x": 168, "y": 288 }, { "x": 260, "y": 258 }],
        "sourceHint": { "kind": "element_port", "elementId": "bool-true", "port": "value" },
        "targetHint": { "kind": "element_port", "elementId": "pair-in", "port": "right" }
      },
      {
        "id": "w-pair-unpair",
        "points": [{ "x": 372, "y": 245 }, { "x": 430, "y": 245 }],
        "sourceHint": { "kind": "element_port", "elementId": "pair-in", "port": "value" },
        "targetHint": { "kind": "element_port", "elementId": "unpair", "port": "value" }
      },
      {
        "id": "w-unpair-right-pair",
        "points": [{ "x": 542, "y": 258 }, { "x": 600, "y": 232 }],
        "sourceHint": { "kind": "element_port", "elementId": "unpair", "port": "right" },
        "targetHint": { "kind": "element_port", "elementId": "pair-out", "port": "left" }
      },
      {
        "id": "w-unpair-left-pair",
        "points": [{ "x": 542, "y": 232 }, { "x": 600, "y": 258 }],
        "sourceHint": { "kind": "element_port", "elementId": "unpair", "port": "left" },
        "targetHint": { "kind": "element_port", "elementId": "pair-out", "port": "right" }
      },
      {
        "id": "w-result",
        "points": [{ "x": 712, "y": 245 }, { "x": 880, "y": 245 }],
        "sourceHint": { "kind": "element_port", "elementId": "pair-out", "port": "value" },
        "targetHint": { "kind": "boundary_port", "containerId": "entry", "boundaryId": "entry-result" }
      }
    ],
    "junctions": []
  }
}
|json}

let folded_standard_call_project ~function_id ~template_id ~arguments =
  let arity = List.length arguments in
  let call_height = max 82 (58 + (arity * 24)) in
  let spacing = call_height / (arity + 1) in
  let arg_port index = 220 + (spacing * (index + 1)) in
  let argument_nodes =
    arguments
    |> List.mapi (fun index value ->
           let y = arg_port index - 28 in
           Printf.sprintf
             {json|{
        "id": "argument-%d",
        "kind": "nat_literal",
        "bounds": { "x": 80, "y": %d, "width": 96, "height": 56 },
        "properties": { "value": "%s" },
        "portAnchors": [{ "port": "value", "x": 176, "y": %d }]
      }|json}
             index y value (y + 28))
    |> String.concat ",\n"
  in
  let library_ports =
    (arguments
    |> List.mapi (fun index _ ->
           Printf.sprintf {json|{ "port": "arg_%d", "x": 220, "y": %d }|json}
             index (arg_port index)))
    @ [ Printf.sprintf {json|{ "port": "result", "x": 376, "y": %d }|json}
          (220 + (call_height / 2)) ]
    |> String.concat ", "
  in
  let argument_wires =
    arguments
    |> List.mapi (fun index _ ->
           Printf.sprintf
             {json|{
        "id": "w-argument-%d",
        "points": [{ "x": 176, "y": %d }, { "x": 220, "y": %d }],
        "sourceHint": { "kind": "element_port", "elementId": "argument-%d", "port": "value" },
        "targetHint": { "kind": "element_port", "elementId": "std-call", "port": "arg_%d" }
      }|json}
             index (arg_port index) (arg_port index) index index)
    |> String.concat ",\n"
  in
  Printf.sprintf
    {json|{
  "format": "tilefold-project",
  "version": 2,
  "geometry": {
    "snapTolerance": 8,
    "elements": [
      {
        "id": "unit-drop",
        "kind": "drop",
        "bounds": { "x": 80, "y": 80, "width": 88, "height": 56 },
        "properties": { "type": "unit" },
        "portAnchors": [{ "port": "input", "x": 80, "y": 108 }]
      },
      {
        "id": "std-call",
        "kind": "library_call",
        "bounds": { "x": 220, "y": 220, "width": 156, "height": %d },
        "properties": {
          "library": "tilefold.std",
          "functionId": "%s",
          "templateId": "%s",
          "version": "v1"
        },
        "portAnchors": [%s]
      },
      %s
    ],
    "containers": [
      {
        "id": "entry",
        "kind": {
          "kind": "entry",
          "templateId": "entry_template",
          "resultType": "nat",
          "dependencies": ["%s"]
        },
        "bounds": { "x": 0, "y": 0, "width": 600, "height": 420 },
        "boundaryPorts": [
          { "id": "entry-parameter", "role": "parameter", "type": "unit", "anchor": { "x": 0, "y": 108 } },
          { "id": "entry-result", "role": "result", "type": "nat", "anchor": { "x": 600, "y": %d } }
        ]
      }
    ],
    "wires": [
      {
        "id": "w-unit-drop",
        "points": [{ "x": 0, "y": 108 }, { "x": 80, "y": 108 }],
        "sourceHint": { "kind": "boundary_port", "containerId": "entry", "boundaryId": "entry-parameter" },
        "targetHint": { "kind": "element_port", "elementId": "unit-drop", "port": "input" }
      },
      %s,
      {
        "id": "w-result",
        "points": [{ "x": 376, "y": %d }, { "x": 600, "y": %d }],
        "sourceHint": { "kind": "element_port", "elementId": "std-call", "port": "result" },
        "targetHint": { "kind": "boundary_port", "containerId": "entry", "boundaryId": "entry-result" }
      }
    ],
    "junctions": []
  },
  "surfaceLibraryCalls": [
    {
      "id": "library-call",
      "library": "tilefold.std",
      "functionId": "%s",
      "templateId": "%s",
      "version": "v1",
      "functionElementId": "std-call",
      "applyElementIds": []
    }
  ]
}
|json}
    call_height function_id template_id library_ports argument_nodes template_id
    (220 + (call_height / 2)) argument_wires (220 + (call_height / 2))
    (220 + (call_height / 2)) function_id template_id

let () =
  let completed =
    read_file "../examples/nat-succ.tilefold.json" |> E.run_json
    |> Yojson.Safe.from_string
  in
  assert (member "status" completed = `String "completed");
  assert (member "result" completed = `String "Nat(3)");
  assert (member "rewriteCount" completed = `Int 5);
  let malformed = E.run_json "{" |> Yojson.Safe.from_string in
  assert (member "status" malformed = `String "error");
  assert (member "stage" malformed = `String "decode");
  let product_pair_transparent =
    expect_mode_result_value product_pair_project "transparent"
      "Product(Nat(3), Bool(True))"
  in
  let product_pair_fast =
    expect_mode_result_value product_pair_project "fast"
      "Product(Nat(3), Bool(True))"
  in
  assert (member "result" product_pair_transparent = member "result" product_pair_fast);
  let product_swap_transparent =
    expect_mode_result_value product_swap_project "transparent"
      "Product(Bool(True), Nat(3))"
  in
  let product_swap_fast =
    expect_mode_result_value product_swap_project "fast"
      "Product(Bool(True), Nat(3))"
  in
  assert (member "result" product_swap_transparent = member "result" product_swap_fast);
  let boolrec_project =
    {json|{
  "format": "tilefold-project",
  "version": 2,
  "geometry": {
    "snapTolerance": 8,
    "elements": [
      {
        "id": "unit-drop",
        "kind": "drop",
        "bounds": { "x": 20, "y": 20, "width": 88, "height": 56 },
        "properties": { "type": "unit" },
        "portAnchors": [{ "port": "input", "x": 20, "y": 48 }]
      },
      {
        "id": "condition",
        "kind": "bool_literal",
        "bounds": { "x": 80, "y": 120, "width": 88, "height": 56 },
        "properties": { "value": false },
        "portAnchors": [{ "port": "value", "x": 168, "y": 148 }]
      },
      {
        "id": "false-value",
        "kind": "nat_literal",
        "bounds": { "x": 80, "y": 190, "width": 96, "height": 56 },
        "properties": { "value": "2" },
        "portAnchors": [{ "port": "value", "x": 176, "y": 218 }]
      },
      {
        "id": "true-value",
        "kind": "nat_literal",
        "bounds": { "x": 80, "y": 260, "width": 96, "height": 56 },
        "properties": { "value": "3" },
        "portAnchors": [{ "port": "value", "x": 176, "y": 288 }]
      },
      {
        "id": "branch",
        "kind": "bool_rec",
        "bounds": { "x": 260, "y": 160, "width": 136, "height": 112 },
        "properties": { "type": "nat" },
        "portAnchors": [
          { "port": "condition", "x": 260, "y": 188 },
          { "port": "false_case", "x": 260, "y": 216 },
          { "port": "true_case", "x": 260, "y": 244 },
          { "port": "result", "x": 396, "y": 216 }
        ]
      }
    ],
    "containers": [
      {
        "id": "entry",
        "kind": { "kind": "entry", "templateId": "entry_template", "resultType": "nat", "dependencies": [] },
        "bounds": { "x": 0, "y": 0, "width": 520, "height": 360 },
        "boundaryPorts": [
          { "id": "entry-param", "role": "parameter", "type": "unit", "anchor": { "x": 0, "y": 48 } },
          { "id": "entry-result", "role": "result", "type": "nat", "anchor": { "x": 520, "y": 216 } }
        ]
      }
    ],
    "wires": [
      {
        "id": "w-unit-drop",
        "points": [{ "x": 0, "y": 48 }, { "x": 20, "y": 48 }],
        "sourceHint": { "kind": "boundary_port", "containerId": "entry", "boundaryId": "entry-param" },
        "targetHint": { "kind": "element_port", "elementId": "unit-drop", "port": "input" }
      },
      {
        "id": "w-condition",
        "points": [{ "x": 168, "y": 148 }, { "x": 260, "y": 188 }],
        "sourceHint": { "kind": "element_port", "elementId": "condition", "port": "value" },
        "targetHint": { "kind": "element_port", "elementId": "branch", "port": "condition" }
      },
      {
        "id": "w-false",
        "points": [{ "x": 176, "y": 218 }, { "x": 260, "y": 216 }],
        "sourceHint": { "kind": "element_port", "elementId": "false-value", "port": "value" },
        "targetHint": { "kind": "element_port", "elementId": "branch", "port": "false_case" }
      },
      {
        "id": "w-true",
        "points": [{ "x": 176, "y": 288 }, { "x": 260, "y": 244 }],
        "sourceHint": { "kind": "element_port", "elementId": "true-value", "port": "value" },
        "targetHint": { "kind": "element_port", "elementId": "branch", "port": "true_case" }
      },
      {
        "id": "w-result",
        "points": [{ "x": 396, "y": 216 }, { "x": 520, "y": 216 }],
        "sourceHint": { "kind": "element_port", "elementId": "branch", "port": "result" },
        "targetHint": { "kind": "boundary_port", "containerId": "entry", "boundaryId": "entry-result" }
      }
    ],
    "junctions": []
  }
}
|json}
  in
  let boolrec_result = E.run_json boolrec_project |> Yojson.Safe.from_string in
  assert (member "status" boolrec_result = `String "completed");
  assert (member "result" boolrec_result = `String "Nat(2)");
  let capture_result_project =
    {json|
{
  "format": "tilefold-project",
  "version": 2,
  "geometry": {
    "snapTolerance": 8,
    "elements": [
      {
        "id": "entry-unit-drop",
        "kind": "drop",
        "bounds": { "x": 20, "y": 20, "width": 88, "height": 56 },
        "properties": { "type": "unit" },
        "portAnchors": [{ "port": "input", "x": 20, "y": 48 }]
      },
      {
        "id": "captured-value",
        "kind": "nat_literal",
        "bounds": { "x": 70, "y": 70, "width": 96, "height": 56 },
        "properties": { "value": "5" },
        "portAnchors": [{ "port": "value", "x": 166, "y": 98 }]
      },
      {
        "id": "function",
        "kind": "function",
        "bounds": { "x": 220, "y": 55, "width": 128, "height": 72 },
        "properties": {
          "templateId": "captureReturn",
          "parameterType": "nat",
          "resultType": "nat",
          "captures": [{ "key": "predecessor", "type": "nat" }]
        },
        "portAnchors": [
          { "port": "predecessor", "x": 220, "y": 79 },
          { "port": "value", "x": 348, "y": 91 }
        ]
      },
      {
        "id": "argument",
        "kind": "nat_literal",
        "bounds": { "x": 180, "y": 140, "width": 96, "height": 56 },
        "properties": { "value": "9" },
        "portAnchors": [{ "port": "value", "x": 276, "y": 168 }]
      },
      {
        "id": "apply",
        "kind": "apply",
        "bounds": { "x": 420, "y": 70, "width": 120, "height": 90 },
        "properties": { "parameterType": "nat", "resultType": "nat" },
        "portAnchors": [
          { "port": "function", "x": 420, "y": 100 },
          { "port": "argument", "x": 420, "y": 130 },
          { "port": "result", "x": 540, "y": 115 }
        ]
      },
      {
        "id": "accumulator-drop",
        "kind": "drop",
        "bounds": { "x": 100, "y": 470, "width": 88, "height": 56 },
        "properties": { "type": "nat" },
        "portAnchors": [{ "port": "input", "x": 100, "y": 498 }]
      }
    ],
    "containers": [
      {
        "id": "entry",
        "kind": {
          "kind": "entry",
          "templateId": "entry_template",
          "resultType": "nat",
          "dependencies": ["captureReturn"]
        },
        "bounds": { "x": 0, "y": 0, "width": 650, "height": 220 },
        "boundaryPorts": [
          { "id": "entry-param", "role": "parameter", "type": "unit", "anchor": { "x": 0, "y": 48 } },
          { "id": "entry-result", "role": "result", "type": "nat", "anchor": { "x": 650, "y": 115 } }
        ]
      },
      {
        "id": "capture-return-container",
        "kind": {
          "kind": "template",
          "templateId": "captureReturn",
          "parameterType": "nat",
          "resultType": "nat",
          "dependencies": []
        },
        "bounds": { "x": 60, "y": 420, "width": 360, "height": 160 },
        "boundaryPorts": [
          { "id": "inner-param", "role": "parameter", "type": "nat", "anchor": { "x": 0, "y": 78 } },
          { "id": "inner-capture", "role": "capture", "captureKey": "predecessor", "type": "nat", "anchor": { "x": 0, "y": 125 } },
          { "id": "inner-result", "role": "result", "type": "nat", "anchor": { "x": 360, "y": 125 } }
        ]
      }
    ],
    "wires": [
      {
        "id": "w-entry-param",
        "points": [{ "x": 0, "y": 48 }, { "x": 20, "y": 48 }],
        "sourceHint": { "kind": "boundary_port", "containerId": "entry", "boundaryId": "entry-param" },
        "targetHint": { "kind": "element_port", "elementId": "entry-unit-drop", "port": "input" }
      },
      {
        "id": "w-capture-function",
        "points": [{ "x": 166, "y": 98 }, { "x": 220, "y": 79 }],
        "sourceHint": { "kind": "element_port", "elementId": "captured-value", "port": "value" },
        "targetHint": { "kind": "element_port", "elementId": "function", "port": "predecessor" }
      },
      {
        "id": "w-function-apply",
        "points": [{ "x": 348, "y": 91 }, { "x": 420, "y": 100 }],
        "sourceHint": { "kind": "element_port", "elementId": "function", "port": "value" },
        "targetHint": { "kind": "element_port", "elementId": "apply", "port": "function" }
      },
      {
        "id": "w-argument-apply",
        "points": [{ "x": 276, "y": 168 }, { "x": 420, "y": 130 }],
        "sourceHint": { "kind": "element_port", "elementId": "argument", "port": "value" },
        "targetHint": { "kind": "element_port", "elementId": "apply", "port": "argument" }
      },
      {
        "id": "w-entry-result",
        "points": [{ "x": 540, "y": 115 }, { "x": 650, "y": 115 }],
        "sourceHint": { "kind": "element_port", "elementId": "apply", "port": "result" },
        "targetHint": { "kind": "boundary_port", "containerId": "entry", "boundaryId": "entry-result" }
      },
      {
        "id": "w-inner-param",
        "points": [{ "x": 60, "y": 498 }, { "x": 100, "y": 498 }],
        "sourceHint": { "kind": "boundary_port", "containerId": "capture-return-container", "boundaryId": "inner-param" },
        "targetHint": { "kind": "element_port", "elementId": "accumulator-drop", "port": "input" }
      },
      {
        "id": "auto_rf_consumer_wire_capture_to_result",
        "points": [{ "x": 60, "y": 545 }, { "x": 420, "y": 545 }],
        "sourceHint": { "kind": "boundary_port", "containerId": "capture-return-container", "boundaryId": "inner-capture" },
        "targetHint": { "kind": "boundary_port", "containerId": "capture-return-container", "boundaryId": "inner-result" },
        "provenance": {
          "kind": "auto_resource_flow",
          "sourcePortId": "boundary:capture-return-container:inner-capture",
          "role": "consumer-wire",
          "connectionId": "surface_conn_capture_to_result"
        }
      }
    ],
    "junctions": []
  },
  "surfaceFunctions": [
    {
      "name": "captureReturn",
      "templateId": "captureReturn",
      "bodyContainerId": "capture-return-container",
      "parameters": [{ "name": "accumulator", "type": "nat" }],
      "result": { "name": "result", "type": "nat" }
    }
  ],
  "surfaceConnections": [
    {
      "id": "surface_conn_capture_to_result",
      "sourcePortId": "boundary:capture-return-container:inner-capture",
      "targetPortId": "boundary:capture-return-container:inner-result",
      "order": 0
    }
  ],
  "surfaceResourceFlows": [
    { "sourcePortId": "boundary:capture-return-container:inner-capture" }
  ]
}
|json}
  in
  let capture_result =
    E.run_json capture_result_project |> Yojson.Safe.from_string
  in
  assert (member "status" capture_result = `String "completed");
  assert (member "result" capture_result = `String "Nat(5)");
  let flat_capture_project : P.t =
    {
      format = "tilefold-project";
      version = 2;
      snap_tolerance = 8;
      view = None;
      junctions = [];
      surface_project_calls = [];
      surface_functions =
        [
          {
            name = "flatCaptured";
            template_id = "flatCaptured";
            body_container_id = "flatCaptured-body";
            parameters =
              [
                { name = "index"; typ = Tilefold.Core_type.Nat };
                { name = "previous"; typ = Tilefold.Core_type.Nat };
              ];
            result_name = "result";
            result_type = Tilefold.Core_type.Nat;
          };
        ];
      containers =
        [
          {
            id = "entry";
            bounds = bounds 0 0 760 360;
            kind =
              P.Entry
                {
                  template_id = "entry-template";
                  result_type = Tilefold.Core_type.Nat;
                  dependencies = [ "flatCaptured" ];
                };
            boundary_ports =
              [
                boundary "entry-parameter" P.Parameter Tilefold.Core_type.Unit 0 108;
                boundary "entry-result" P.Result Tilefold.Core_type.Nat 760 186;
              ];
          };
          {
            id = "flatCaptured-body";
            bounds = bounds 900 0 480 280;
            kind =
              P.Template
                {
                  template_id = "flatCaptured";
                  parameter_type = Tilefold.Core_type.Nat;
                  result_type = Tilefold.Core_type.Nat;
                  dependencies = [];
                };
            boundary_ports =
              [
                boundary "flat-index" P.Parameter Tilefold.Core_type.Nat 0 72;
                boundary "flat-previous" P.Parameter Tilefold.Core_type.Nat 0 136;
                boundary "flat-capture-n" (P.Capture "n") Tilefold.Core_type.Nat 0 204;
                boundary "flat-result" P.Result Tilefold.Core_type.Nat 480 204;
              ];
          };
        ];
      elements =
        [
          element "entry-drop" (P.Drop Tilefold.Core_type.Unit) (bounds 80 80 88 56)
            [ anchor "input" 80 108 ];
          element "captured-n" (P.Nat_literal "5") (bounds 80 150 96 56)
            [ anchor "value" 176 178 ];
          element
            "flat-function"
            (P.Function
               {
                 template_id = "flatCaptured";
                 parameter_type = Tilefold.Core_type.Nat;
                 result_type =
                   Tilefold.Core_type.Arrow
                     (Tilefold.Core_type.Nat, Tilefold.Core_type.Nat);
                 captures = [ ("n", Tilefold.Core_type.Nat) ];
               })
            (bounds 240 136 128 72)
            [ anchor "n" 240 160; anchor "value" 368 172 ];
          element "arg-index" (P.Nat_literal "0") (bounds 240 240 96 56)
            [ anchor "value" 336 268 ];
          element
            "apply-index"
            (P.Apply
               {
                 parameter_type = Tilefold.Core_type.Nat;
                 result_type =
                   Tilefold.Core_type.Arrow
                     (Tilefold.Core_type.Nat, Tilefold.Core_type.Nat);
               })
            (bounds 420 128 120 90)
            [
              anchor "function" 420 158;
              anchor "argument" 420 188;
              anchor "result" 540 173;
            ];
          element "arg-previous" (P.Nat_literal "0") (bounds 420 250 96 56)
            [ anchor "value" 516 278 ];
          element
            "apply-previous"
            (P.Apply
               {
                 parameter_type = Tilefold.Core_type.Nat;
                 result_type = Tilefold.Core_type.Nat;
               })
            (bounds 600 142 120 90)
            [
              anchor "function" 600 172;
              anchor "argument" 600 202;
              anchor "result" 720 187;
            ];
          element "drop-index" (P.Drop Tilefold.Core_type.Nat) (bounds 980 46 88 56)
            [ anchor "input" 980 74 ];
          element "drop-previous" (P.Drop Tilefold.Core_type.Nat) (bounds 980 110 88 56)
            [ anchor "input" 980 138 ];
        ];
      wires =
        [
          wire "w-entry-param"
            (boundary_port "entry" "entry-parameter")
            (element_port "entry-drop" "input")
            [ pt 0 108; pt 80 108 ];
          wire "w-capture-bind"
            (element_port "captured-n" "value")
            (element_port "flat-function" "n")
            [ pt 176 178; pt 240 160 ];
          wire "w-function-apply-index"
            (element_port "flat-function" "value")
            (element_port "apply-index" "function")
            [ pt 368 172; pt 420 158 ];
          wire "w-arg-index"
            (element_port "arg-index" "value")
            (element_port "apply-index" "argument")
            [ pt 336 268; pt 420 188 ];
          wire "w-apply-index"
            (element_port "apply-index" "result")
            (element_port "apply-previous" "function")
            [ pt 540 173; pt 600 172 ];
          wire "w-arg-previous"
            (element_port "arg-previous" "value")
            (element_port "apply-previous" "argument")
            [ pt 516 278; pt 600 202 ];
          wire "w-entry-result"
            (element_port "apply-previous" "result")
            (boundary_port "entry" "entry-result")
            [ pt 720 187; pt 760 186 ];
          wire "w-flat-index"
            (boundary_port "flatCaptured-body" "flat-index")
            (element_port "drop-index" "input")
            [ pt 900 72; pt 980 74 ];
          wire "w-flat-previous"
            (boundary_port "flatCaptured-body" "flat-previous")
            (element_port "drop-previous" "input")
            [ pt 900 136; pt 980 138 ];
          wire "w-flat-capture-result"
            (boundary_port "flatCaptured-body" "flat-capture-n")
            (boundary_port "flatCaptured-body" "flat-result")
            [ pt 900 204; pt 1380 204 ];
        ];
    }
  in
  let flat_capture_result =
    project_execution_result flat_capture_project
  in
  assert (member "status" flat_capture_result = `String "completed");
  assert (member "result" flat_capture_result = `String "Nat(5)");
  let factorial_project : P.t =
    {
      format = "tilefold-project";
      version = 2;
      snap_tolerance = 8;
      view = None;
      junctions = [];
      surface_functions =
        [
          {
            name = "factorialStep";
            template_id = "factorialStep";
            body_container_id = "factorialStep-body";
            parameters =
              [
                { name = "index"; typ = Tilefold.Core_type.Nat };
                { name = "previous"; typ = Tilefold.Core_type.Nat };
              ];
            result_name = "result";
            result_type = Tilefold.Core_type.Nat;
          };
        ];
      surface_project_calls =
        [
          {
            id = "project-call-factorial-step";
            template_id = "factorialStep";
            function_element_id = "factorialStep-direct-call";
          };
        ];
      containers =
        [
          {
            id = "entry";
            bounds = bounds 0 0 760 420;
            kind =
              P.Entry
                {
                  template_id = "entry-template";
                  result_type = Tilefold.Core_type.Nat;
                  dependencies = [ "factorialStep" ];
                };
            boundary_ports =
              [
                boundary "entry-parameter" P.Parameter Tilefold.Core_type.Unit 0 108;
                boundary "entry-result" P.Result Tilefold.Core_type.Nat 760 186;
              ];
          };
          {
            id = "factorialStep-body";
            bounds = bounds 840 0 560 260;
            kind =
              P.Template
                {
                  template_id = "factorialStep";
                  parameter_type = Tilefold.Core_type.Nat;
                  result_type =
                    Tilefold.Core_type.Arrow
                      (Tilefold.Core_type.Nat, Tilefold.Core_type.Nat);
                  dependencies = [ "tilefold.std.nat.multiply" ];
                };
            boundary_ports =
              [
                boundary "factorialStep-index" P.Parameter Tilefold.Core_type.Nat 0 80;
                boundary "factorialStep-previous" P.Parameter Tilefold.Core_type.Nat 0 140;
                boundary "factorialStep-result" P.Result Tilefold.Core_type.Nat 560 120;
              ];
          };
        ];
      elements =
        [
          element "entry-unit-drop" (P.Drop Tilefold.Core_type.Unit)
            (bounds 80 80 88 56) [ anchor "input" 80 108 ];
          element "factorialStep-function"
            (P.Function
               {
                 template_id = "factorialStep";
                 parameter_type = Tilefold.Core_type.Nat;
                 result_type =
                   Tilefold.Core_type.Arrow
                     (Tilefold.Core_type.Nat, Tilefold.Core_type.Nat);
                 captures = [];
               })
            (bounds 40 330 128 72) [ anchor "value" 168 366 ];
          element "factorial-base" (P.Nat_literal "1") (bounds 20 120 96 56)
            [ anchor "value" 116 148 ];
          element "factorial-count" (P.Nat_literal "5") (bounds 20 240 96 56)
            [ anchor "value" 116 268 ];
          element "factorial-rec" (P.NatRec Tilefold.Core_type.Nat)
            (bounds 160 130 128 112)
            [
              anchor "base" 160 158;
              anchor "step" 160 186;
              anchor "count" 160 214;
              anchor "result" 288 186;
            ];
          element "direct-left" (P.Nat_literal "2") (bounds 280 255 96 56)
            [ anchor "value" 376 283 ];
          element "direct-right" (P.Nat_literal "3") (bounds 280 335 96 56)
            [ anchor "value" 376 363 ];
          element "factorialStep-direct-call" (P.Project_call { template_id = "factorialStep" })
            (bounds 420 260 188 106)
            [ anchor "arg_0" 420 295; anchor "arg_1" 420 330; anchor "result" 608 313 ];
          element "direct-result-drop" (P.Drop Tilefold.Core_type.Nat)
            (bounds 656 285 88 56) [ anchor "input" 656 313 ];
          element "factorialStep-index-succ" P.Succ (bounds 970 50 96 56)
            [ anchor "input" 970 78; anchor "result" 1066 78 ];
          element "factorialStep-multiply"
            (P.Library_call
               {
                 library = "tilefold.std";
                 function_id = "nat.multiply";
                 template_id = "tilefold.std.nat.multiply";
                 version = "v1";
               })
            (bounds 1140 82 188 106)
            [ anchor "arg_0" 1140 117; anchor "arg_1" 1140 152; anchor "result" 1328 135 ];
        ];
      wires =
        [
          wire "w-entry-unit-drop"
            (boundary_port "entry" "entry-parameter")
            (element_port "entry-unit-drop" "input")
            [ pt 0 108; pt 80 108 ];
          wire "w-factorial-base"
            (element_port "factorial-base" "value")
            (element_port "factorial-rec" "base")
            [ pt 116 148; pt 160 158 ];
          wire "w-factorial-step"
            (element_port "factorialStep-function" "value")
            (element_port "factorial-rec" "step")
            [ pt 168 366; pt 160 186 ];
          wire "w-factorial-count"
            (element_port "factorial-count" "value")
            (element_port "factorial-rec" "count")
            [ pt 116 268; pt 160 214 ];
          wire "w-factorial-result"
            (element_port "factorial-rec" "result")
            (boundary_port "entry" "entry-result")
            [ pt 288 186; pt 760 186 ];
          wire "w-direct-left"
            (element_port "direct-left" "value")
            (element_port "factorialStep-direct-call" "arg_0")
            [ pt 376 283; pt 420 295 ];
          wire "w-direct-right"
            (element_port "direct-right" "value")
            (element_port "factorialStep-direct-call" "arg_1")
            [ pt 376 363; pt 420 330 ];
          wire "w-direct-result-drop"
            (element_port "factorialStep-direct-call" "result")
            (element_port "direct-result-drop" "input")
            [ pt 608 313; pt 656 313 ];
          wire "w-step-index-succ"
            (boundary_port "factorialStep-body" "factorialStep-index")
            (element_port "factorialStep-index-succ" "input")
            [ pt 840 80; pt 970 78 ];
          wire "w-step-previous-multiply"
            (boundary_port "factorialStep-body" "factorialStep-previous")
            (element_port "factorialStep-multiply" "arg_0")
            [ pt 840 140; pt 1140 117 ];
          wire "w-step-succ-multiply"
            (element_port "factorialStep-index-succ" "result")
            (element_port "factorialStep-multiply" "arg_1")
            [ pt 1066 78; pt 1140 152 ];
          wire "w-step-result"
            (element_port "factorialStep-multiply" "result")
            (boundary_port "factorialStep-body" "factorialStep-result")
            [ pt 1328 135; pt 1400 120 ];
        ];
    }
  in
  let factorial_result = project_execution_result factorial_project in
  assert (member "status" factorial_result = `String "completed");
  assert (member "result" factorial_result = `String "Nat(120)");
  let factorial_missing_dependency_project =
    {
      factorial_project with
      containers =
        List.map
          (fun (container : P.container) ->
            match container.kind with
            | P.Entry entry when container.id = "entry" ->
                { container with kind = P.Entry { entry with dependencies = [] } }
            | _ -> container)
          factorial_project.containers;
    }
  in
  let factorial_missing_dependency_result =
    project_execution_result factorial_missing_dependency_project
  in
  assert (member "status" factorial_missing_dependency_result = `String "completed");
  assert (member "result" factorial_missing_dependency_result = `String "Nat(120)");
  let std_add_project =
    {json|
{
  "format": "tilefold-project",
  "version": 2,
  "geometry": {
    "snapTolerance": 8,
    "elements": [
      {
        "id": "unit-drop",
        "kind": "drop",
        "bounds": { "x": 80, "y": 80, "width": 88, "height": 56 },
        "properties": { "type": "unit" },
        "portAnchors": [{ "port": "input", "x": 80, "y": 108 }]
      },
      {
        "id": "add-function",
        "kind": "function",
        "bounds": { "x": 80, "y": 180, "width": 128, "height": 72 },
        "properties": {
          "templateId": "tilefold.std.nat.add",
          "parameterType": "nat",
          "resultType": { "arrow": ["nat", "nat"] },
          "captures": []
        },
        "portAnchors": [{ "port": "value", "x": 208, "y": 216 }]
      },
      {
        "id": "left",
        "kind": "nat_literal",
        "bounds": { "x": 80, "y": 300, "width": 96, "height": 56 },
        "properties": { "value": "2" },
        "portAnchors": [{ "port": "value", "x": 176, "y": 328 }]
      },
      {
        "id": "apply-left",
        "kind": "apply",
        "bounds": { "x": 260, "y": 260, "width": 120, "height": 90 },
        "properties": {
          "parameterType": "nat",
          "resultType": { "arrow": ["nat", "nat"] }
        },
        "portAnchors": [
          { "port": "function", "x": 260, "y": 290 },
          { "port": "argument", "x": 260, "y": 320 },
          { "port": "result", "x": 380, "y": 305 }
        ]
      },
      {
        "id": "right",
        "kind": "nat_literal",
        "bounds": { "x": 260, "y": 380, "width": 96, "height": 56 },
        "properties": { "value": "3" },
        "portAnchors": [{ "port": "value", "x": 356, "y": 408 }]
      },
      {
        "id": "apply-right",
        "kind": "apply",
        "bounds": { "x": 460, "y": 320, "width": 120, "height": 90 },
        "properties": { "parameterType": "nat", "resultType": "nat" },
        "portAnchors": [
          { "port": "function", "x": 460, "y": 350 },
          { "port": "argument", "x": 460, "y": 380 },
          { "port": "result", "x": 580, "y": 365 }
        ]
      }
    ],
    "containers": [
      {
        "id": "entry",
        "kind": {
          "kind": "entry",
          "templateId": "entry_template",
          "resultType": "nat",
          "dependencies": ["tilefold.std.nat.add"]
        },
        "bounds": { "x": 0, "y": 0, "width": 700, "height": 500 },
        "boundaryPorts": [
          { "id": "entry-parameter", "role": "parameter", "type": "unit", "anchor": { "x": 0, "y": 108 } },
          { "id": "entry-result", "role": "result", "type": "nat", "anchor": { "x": 700, "y": 365 } }
        ]
      }
    ],
    "wires": [
      {
        "id": "w-unit-drop",
        "points": [{ "x": 0, "y": 108 }, { "x": 80, "y": 108 }],
        "sourceHint": { "kind": "boundary_port", "containerId": "entry", "boundaryId": "entry-parameter" },
        "targetHint": { "kind": "element_port", "elementId": "unit-drop", "port": "input" }
      },
      {
        "id": "w-function-apply",
        "points": [{ "x": 208, "y": 216 }, { "x": 260, "y": 290 }],
        "sourceHint": { "kind": "element_port", "elementId": "add-function", "port": "value" },
        "targetHint": { "kind": "element_port", "elementId": "apply-left", "port": "function" }
      },
      {
        "id": "w-left-apply",
        "points": [{ "x": 176, "y": 328 }, { "x": 260, "y": 320 }],
        "sourceHint": { "kind": "element_port", "elementId": "left", "port": "value" },
        "targetHint": { "kind": "element_port", "elementId": "apply-left", "port": "argument" }
      },
      {
        "id": "w-partial-apply",
        "points": [{ "x": 380, "y": 305 }, { "x": 460, "y": 350 }],
        "sourceHint": { "kind": "element_port", "elementId": "apply-left", "port": "result" },
        "targetHint": { "kind": "element_port", "elementId": "apply-right", "port": "function" }
      },
      {
        "id": "w-right-apply",
        "points": [{ "x": 356, "y": 408 }, { "x": 460, "y": 380 }],
        "sourceHint": { "kind": "element_port", "elementId": "right", "port": "value" },
        "targetHint": { "kind": "element_port", "elementId": "apply-right", "port": "argument" }
      },
      {
        "id": "w-result",
        "points": [{ "x": 580, "y": 365 }, { "x": 700, "y": 365 }],
        "sourceHint": { "kind": "element_port", "elementId": "apply-right", "port": "result" },
        "targetHint": { "kind": "boundary_port", "containerId": "entry", "boundaryId": "entry-result" }
      }
    ],
    "junctions": []
  },
  "surfaceLibraryCalls": [
    {
      "id": "library_call_1",
      "library": "tilefold.std",
      "functionId": "nat.add",
      "templateId": "tilefold.std.nat.add",
      "version": "v1",
      "functionElementId": "add-function",
      "applyElementIds": ["apply-left", "apply-right"]
    }
  ]
}
|json}
  in
  let std_add = E.run_json std_add_project |> Yojson.Safe.from_string in
  assert (member "status" std_add = `String "completed");
  assert (member "result" std_add = `String "Nat(5)");
  let std_add_fast =
    E.run_json_with_mode std_add_project ~mode:"fast" |> Yojson.Safe.from_string
  in
  assert (member "status" std_add_fast = `String "completed");
  assert (member "result" std_add_fast = `String "Nat(5)");
  assert (member "rewriteCount" std_add_fast = `Int 1);
  let trace = member "trace" std_add_fast in
  assert (
    match trace with
    | `List [ event ] ->
        member "rule" event
        = `String "FastCallCompleted(tilefold.std.nat.add@v1)"
    | _ -> false);
  let std_cases =
    [
      ( "nat.add",
        "tilefold.std.nat.add",
        "nat_to_nat",
        [ "0"; "0" ],
        "0" );
      ( "nat.add",
        "tilefold.std.nat.add",
        "nat_to_nat",
        [ "2"; "3" ],
        "5" );
      ( "nat.multiply",
        "tilefold.std.nat.multiply",
        "nat_to_nat",
        [ "3"; "4" ],
        "12" );
      ("nat.double", "tilefold.std.nat.double", "nat", [ "6" ], "12");
      ("nat.square", "tilefold.std.nat.square", "nat", [ "5" ], "25");
      ( "nat.add",
        "tilefold.std.nat.add",
        "nat_to_nat",
        [ "123456789012345678901234567890"; "1" ],
        "123456789012345678901234567891" );
    ]
  in
  List.iter
    (fun
      ( function_id,
        template_id,
        function_result_type,
        arguments,
        expected )
    ->
      let project =
        let _ = function_result_type in
        folded_standard_call_project ~function_id ~template_id ~arguments
      in
      let transparent = expect_mode_result project "transparent" expected in
      let fast = expect_mode_result project "fast" expected in
      assert (member "result" transparent = member "result" fast))
    std_cases;
  let typed_std_cases =
    [
      ( "nat.pred",
        "tilefold.std.nat.pred",
        [ Nat_arg "0" ],
        "nat",
        "Nat(0)" );
      ( "nat.pred",
        "tilefold.std.nat.pred",
        [ Nat_arg "2" ],
        "nat",
        "Nat(1)" );
      ( "nat.subtract",
        "tilefold.std.nat.subtract",
        [ Nat_arg "5"; Nat_arg "2" ],
        "nat",
        "Nat(3)" );
      ( "nat.subtract",
        "tilefold.std.nat.subtract",
        [ Nat_arg "3"; Nat_arg "5" ],
        "nat",
        "Nat(0)" );
      ( "nat.isZero",
        "tilefold.std.nat.isZero",
        [ Nat_arg "0" ],
        "bool",
        "Bool(True)" );
      ( "nat.isZero",
        "tilefold.std.nat.isZero",
        [ Nat_arg "1" ],
        "bool",
        "Bool(False)" );
      ( "bool.not",
        "tilefold.std.bool.not",
        [ Bool_arg true ],
        "bool",
        "Bool(False)" );
      ( "bool.and",
        "tilefold.std.bool.and",
        [ Bool_arg true; Bool_arg false ],
        "bool",
        "Bool(False)" );
      ( "bool.or",
        "tilefold.std.bool.or",
        [ Bool_arg true; Bool_arg false ],
        "bool",
        "Bool(True)" );
      ( "nat.equal",
        "tilefold.std.nat.equal",
        [ Nat_arg "0"; Nat_arg "0" ],
        "bool",
        "Bool(True)" );
      ( "nat.equal",
        "tilefold.std.nat.equal",
        [ Nat_arg "3"; Nat_arg "5" ],
        "bool",
        "Bool(False)" );
      ( "nat.equal",
        "tilefold.std.nat.equal",
        [ Nat_arg "8"; Nat_arg "8" ],
        "bool",
        "Bool(True)" );
      ( "nat.lessOrEqual",
        "tilefold.std.nat.lessOrEqual",
        [ Nat_arg "3"; Nat_arg "5" ],
        "bool",
        "Bool(True)" );
      ( "nat.lessOrEqual",
        "tilefold.std.nat.lessOrEqual",
        [ Nat_arg "5"; Nat_arg "3" ],
        "bool",
        "Bool(False)" );
      ( "nat.lessThan",
        "tilefold.std.nat.lessThan",
        [ Nat_arg "0"; Nat_arg "1" ],
        "bool",
        "Bool(True)" );
      ( "nat.lessThan",
        "tilefold.std.nat.lessThan",
        [ Nat_arg "3"; Nat_arg "3" ],
        "bool",
        "Bool(False)" );
      ( "nat.lessThan",
        "tilefold.std.nat.lessThan",
        [ Nat_arg "8"; Nat_arg "9" ],
        "bool",
        "Bool(True)" );
      ( "nat.min",
        "tilefold.std.nat.min",
        [ Nat_arg "3"; Nat_arg "5" ],
        "nat",
        "Nat(3)" );
      ( "nat.min",
        "tilefold.std.nat.min",
        [ Nat_arg "5"; Nat_arg "3" ],
        "nat",
        "Nat(3)" );
      ( "nat.max",
        "tilefold.std.nat.max",
        [ Nat_arg "3"; Nat_arg "5" ],
        "nat",
        "Nat(5)" );
      ( "nat.max",
        "tilefold.std.nat.max",
        [ Nat_arg "5"; Nat_arg "3" ],
        "nat",
        "Nat(5)" );
      ( "nat.divide",
        "tilefold.std.nat.divide",
        [ Nat_arg "13"; Nat_arg "5" ],
        "nat",
        "Nat(2)" );
      ( "nat.divide",
        "tilefold.std.nat.divide",
        [ Nat_arg "12"; Nat_arg "3" ],
        "nat",
        "Nat(4)" );
      ( "nat.divide",
        "tilefold.std.nat.divide",
        [ Nat_arg "3"; Nat_arg "5" ],
        "nat",
        "Nat(0)" );
      ( "nat.divide",
        "tilefold.std.nat.divide",
        [ Nat_arg "5"; Nat_arg "0" ],
        "nat",
        "Nat(0)" );
      ( "nat.modulo",
        "tilefold.std.nat.modulo",
        [ Nat_arg "13"; Nat_arg "5" ],
        "nat",
        "Nat(3)" );
      ( "nat.modulo",
        "tilefold.std.nat.modulo",
        [ Nat_arg "12"; Nat_arg "3" ],
        "nat",
        "Nat(0)" );
      ( "nat.modulo",
        "tilefold.std.nat.modulo",
        [ Nat_arg "3"; Nat_arg "5" ],
        "nat",
        "Nat(3)" );
      ( "nat.modulo",
        "tilefold.std.nat.modulo",
        [ Nat_arg "5"; Nat_arg "0" ],
        "nat",
        "Nat(5)" );
    ]
  in
  List.iter
    (fun (function_id, template_id, arguments, result_type, expected) ->
      let project =
        folded_standard_call_project_typed ~function_id ~template_id ~arguments
          ~result_type
      in
      let transparent = expect_mode_result_value project "transparent" expected in
      let fast = expect_mode_result_value project "fast" expected in
      assert (member "result" transparent = member "result" fast))
    typed_std_cases;
  let nat value =
    match Nat.of_string value with Ok value -> value | Error _ -> assert false
  in
  let expect_evaluator id args expected =
    match SL.evaluate_nat id (List.map nat args) with
    | Ok actual -> assert (Nat.to_string actual = expected)
    | Error message -> failwith message
  in
  expect_evaluator SL.Add
    [ "900719925474099312345"; "900719925474099312345" ]
    "1801439850948198624690";
  expect_evaluator SL.Multiply [ "123456789"; "987654321" ]
    "121932631112635269";
  expect_evaluator SL.Double [ "12345678901234567890" ]
    "24691357802469135780";
  expect_evaluator SL.Square [ "123456789" ] "15241578750190521";
  expect_evaluator SL.Min [ "900719925474099312345"; "42" ] "42";
  expect_evaluator SL.Max [ "900719925474099312345"; "42" ]
    "900719925474099312345";
  expect_evaluator SL.Divide [ "13"; "5" ] "2";
  expect_evaluator SL.Divide [ "12"; "3" ] "4";
  expect_evaluator SL.Divide [ "3"; "5" ] "0";
  expect_evaluator SL.Divide [ "0"; "5" ] "0";
  expect_evaluator SL.Divide [ "5"; "1" ] "5";
  expect_evaluator SL.Divide [ "5"; "0" ] "0";
  expect_evaluator SL.Divide [ "0"; "0" ] "0";
  expect_evaluator SL.Modulo [ "13"; "5" ] "3";
  expect_evaluator SL.Modulo [ "12"; "3" ] "0";
  expect_evaluator SL.Modulo [ "3"; "5" ] "3";
  expect_evaluator SL.Modulo [ "0"; "5" ] "0";
  expect_evaluator SL.Modulo [ "5"; "1" ] "0";
  expect_evaluator SL.Modulo [ "5"; "0" ] "5";
  expect_evaluator SL.Modulo [ "0"; "0" ] "0";
  List.iter
    (fun (number, divisor) ->
      if divisor <> 0 then (
        let number_nat = nat (string_of_int number) in
        let divisor_nat = nat (string_of_int divisor) in
        let quotient =
          match SL.evaluate_nat SL.Divide [ number_nat; divisor_nat ] with
          | Ok value -> value
          | Error message -> failwith message
        in
        let remainder =
          match SL.evaluate_nat SL.Modulo [ number_nat; divisor_nat ] with
          | Ok value -> value
          | Error message -> failwith message
        in
        let recomposed =
          Z.add
            (Z.mul (Nat.to_z divisor_nat) (Nat.to_z quotient))
            (Nat.to_z remainder)
        in
        assert (Z.equal recomposed (Nat.to_z number_nat));
        assert (Z.lt (Nat.to_z remainder) (Nat.to_z divisor_nat))))
    [
      (0, 1);
      (1, 1);
      (3, 5);
      (12, 3);
      (13, 5);
      (25, 7);
      (99, 10);
    ];
  expect_evaluator SL.Divide
    [ "123456789012345678901234567890"; "1000000000000000000000" ]
    "123456789";
  expect_evaluator SL.Modulo
    [ "123456789012345678901234567890"; "1000000000000000000000" ]
    "12345678901234567890";
  let expect_bool_evaluator id args expected =
    match SL.evaluate id (List.map (fun value -> RV.Nat (nat value)) args) with
    | Ok (RV.Bool actual) -> assert (Bool.equal actual expected)
    | Ok _ -> failwith "expected Bool payload"
    | Error message -> failwith message
  in
  expect_bool_evaluator SL.Equal [ "3"; "3" ] true;
  expect_bool_evaluator SL.Equal [ "3"; "5" ] false;
  expect_bool_evaluator SL.LessOrEqual [ "3"; "5" ] true;
  expect_bool_evaluator SL.LessOrEqual [ "5"; "3" ] false;
  expect_bool_evaluator SL.LessOrEqual
    [ "900719925474099312345"; "900719925474099312346" ]
    true;
  expect_bool_evaluator SL.LessThan [ "3"; "5" ] true;
  expect_bool_evaluator SL.LessThan [ "5"; "3" ] false;
  expect_bool_evaluator SL.Equal
    [ "123456789012345678901234567890"; "123456789012345678901234567890" ]
    true
