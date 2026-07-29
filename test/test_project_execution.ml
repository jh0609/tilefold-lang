module E = Tilefold.Project_execution
module SL = Tilefold.Standard_library
module Nat = Tilefold.Nat

let read_file path =
  let channel = open_in_bin path in
  Fun.protect
    ~finally:(fun () -> close_in channel)
    (fun () -> really_input_string channel (in_channel_length channel))

let member name json = Yojson.Safe.Util.member name json

let json_type = function
  | "nat" -> {json|"nat"|json}
  | "nat_to_nat" -> {json|{ "arrow": ["nat", "nat"] }|json}
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
  "version": 1,
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
  "version": 1,
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
  let capture_result_project =
    {json|
{
  "format": "tilefold-project",
  "version": 1,
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
      "parameters": [{ "name": "accumulator", "type": "nat" }],
      "resultName": "result",
      "captures": [{ "key": "predecessor", "type": "nat" }]
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
  let std_add_project =
    {json|
{
  "format": "tilefold-project",
  "version": 1,
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
  expect_evaluator SL.Square [ "123456789" ] "15241578750190521"
