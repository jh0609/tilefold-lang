import { expect, test, type Page } from "@playwright/test";

function attachIssueWatch(page: Page) {
  const issues = { consoleErrors: [] as string[], pageErrors: [] as string[] };
  page.on("console", (message) => {
    if (message.type() === "error") issues.consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => issues.pageErrors.push(error.message));
  return issues;
}

async function importJson(page: Page, json: string, name = "sum.tilefold.json") {
  await page.getByLabel("Open JSON file").setInputFiles({
    name,
    mimeType: "application/json",
    buffer: Buffer.from(json),
  });
}

async function runMode(page: Page, mode: "transparent" | "fast") {
  await page.getByLabel("Execution mode").selectOption(mode);
  await page.getByRole("button", { name: "Run" }).click();
}

const leftEntryProject = `{
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
        "bounds": { "x": 90, "y": 190, "width": 96, "height": 56 },
        "properties": { "value": "3" },
        "portAnchors": [{ "port": "value", "x": 186, "y": 218 }]
      },
      {
        "id": "left",
        "kind": "left",
        "bounds": { "x": 270, "y": 186, "width": 104, "height": 64 },
        "properties": { "leftType": "nat", "rightType": "bool" },
        "portAnchors": [
          { "port": "input", "x": 270, "y": 218 },
          { "port": "value", "x": 374, "y": 218 }
        ]
      }
    ],
    "containers": [
      {
        "id": "entry",
        "kind": {
          "kind": "entry",
          "templateId": "entry_template",
          "resultType": { "sum": ["nat", "bool"] },
          "dependencies": []
        },
        "bounds": { "x": 0, "y": 0, "width": 620, "height": 340 },
        "boundaryPorts": [
          { "id": "entry-parameter", "role": "parameter", "type": "unit", "anchor": { "x": 0, "y": 108 } },
          { "id": "entry-result", "role": "result", "type": { "sum": ["nat", "bool"] }, "anchor": { "x": 620, "y": 218 } }
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
        "id": "w-nat-left",
        "points": [{ "x": 186, "y": 218 }, { "x": 270, "y": 218 }],
        "sourceHint": { "kind": "element_port", "elementId": "nat-three", "port": "value" },
        "targetHint": { "kind": "element_port", "elementId": "left", "port": "input" }
      },
      {
        "id": "w-left-result",
        "points": [{ "x": 374, "y": 218 }, { "x": 620, "y": 218 }],
        "sourceHint": { "kind": "element_port", "elementId": "left", "port": "value" },
        "targetHint": { "kind": "boundary_port", "containerId": "entry", "boundaryId": "entry-result" }
      }
    ],
    "junctions": []
  }
}`;

const caseProject = `{
  "format": "tilefold-project",
  "version": 2,
  "geometry": {
    "snapTolerance": 8,
    "elements": [
      {
        "id": "entry-drop",
        "kind": "drop",
        "bounds": { "x": 80, "y": 80, "width": 88, "height": 56 },
        "properties": { "type": "unit" },
        "portAnchors": [{ "port": "input", "x": 80, "y": 108 }]
      },
      {
        "id": "nat-three",
        "kind": "nat_literal",
        "bounds": { "x": 90, "y": 190, "width": 96, "height": 56 },
        "properties": { "value": "3" },
        "portAnchors": [{ "port": "value", "x": 186, "y": 218 }]
      },
      {
        "id": "left",
        "kind": "left",
        "bounds": { "x": 270, "y": 186, "width": 104, "height": 64 },
        "properties": { "leftType": "nat", "rightType": "bool" },
        "portAnchors": [
          { "port": "input", "x": 270, "y": 218 },
          { "port": "value", "x": 374, "y": 218 }
        ]
      },
      {
        "id": "on-left-fn",
        "kind": "function",
        "bounds": { "x": 250, "y": 80, "width": 168, "height": 104 },
        "properties": {
          "templateId": "onLeft",
          "parameterType": "nat",
          "resultType": "nat",
          "captures": []
        },
        "portAnchors": [{ "port": "value", "x": 418, "y": 132 }]
      },
      {
        "id": "on-right-fn",
        "kind": "function",
        "bounds": { "x": 250, "y": 260, "width": 168, "height": 104 },
        "properties": {
          "templateId": "onRight",
          "parameterType": "bool",
          "resultType": "nat",
          "captures": []
        },
        "portAnchors": [{ "port": "value", "x": 418, "y": 312 }]
      },
      {
        "id": "case",
        "kind": "case",
        "bounds": { "x": 500, "y": 166, "width": 136, "height": 112 },
        "properties": { "leftType": "nat", "rightType": "bool", "resultType": "nat" },
        "portAnchors": [
          { "port": "scrutinee", "x": 500, "y": 194 },
          { "port": "onLeft", "x": 500, "y": 222 },
          { "port": "onRight", "x": 500, "y": 250 },
          { "port": "result", "x": 636, "y": 222 }
        ]
      },
      {
        "id": "left-param-succ",
        "kind": "succ",
        "bounds": { "x": 220, "y": 510, "width": 88, "height": 56 },
        "properties": {},
        "portAnchors": [
          { "port": "input", "x": 220, "y": 538 },
          { "port": "result", "x": 308, "y": 538 }
        ]
      },
      {
        "id": "right-param-drop",
        "kind": "drop",
        "bounds": { "x": 220, "y": 790, "width": 88, "height": 56 },
        "properties": { "type": "bool" },
        "portAnchors": [{ "port": "input", "x": 220, "y": 818 }]
      },
      {
        "id": "right-zero",
        "kind": "nat_literal",
        "bounds": { "x": 220, "y": 880, "width": 96, "height": 56 },
        "properties": { "value": "0" },
        "portAnchors": [{ "port": "value", "x": 316, "y": 908 }]
      }
    ],
    "containers": [
      {
        "id": "entry",
        "kind": {
          "kind": "entry",
          "templateId": "entry_template",
          "resultType": "nat",
          "dependencies": ["onLeft", "onRight"]
        },
        "bounds": { "x": 0, "y": 0, "width": 820, "height": 400 },
        "boundaryPorts": [
          { "id": "entry-parameter", "role": "parameter", "type": "unit", "anchor": { "x": 0, "y": 108 } },
          { "id": "entry-result", "role": "result", "type": "nat", "anchor": { "x": 820, "y": 222 } }
        ]
      },
      {
        "id": "onLeft-body",
        "kind": {
          "kind": "template",
          "templateId": "onLeft",
          "parameterType": "nat",
          "resultType": "nat",
          "dependencies": []
        },
        "bounds": { "x": 0, "y": 440, "width": 520, "height": 180 },
        "boundaryPorts": [
          { "id": "onLeft-parameter", "role": "parameter", "type": "nat", "anchor": { "x": 0, "y": 98 } },
          { "id": "onLeft-result", "role": "result", "type": "nat", "anchor": { "x": 520, "y": 98 } }
        ]
      },
      {
        "id": "onRight-body",
        "kind": {
          "kind": "template",
          "templateId": "onRight",
          "parameterType": "bool",
          "resultType": "nat",
          "dependencies": []
        },
        "bounds": { "x": 0, "y": 720, "width": 520, "height": 250 },
        "boundaryPorts": [
          { "id": "onRight-parameter", "role": "parameter", "type": "bool", "anchor": { "x": 0, "y": 98 } },
          { "id": "onRight-result", "role": "result", "type": "nat", "anchor": { "x": 520, "y": 188 } }
        ]
      }
    ],
    "wires": [
      {
        "id": "w-entry-drop",
        "points": [{ "x": 0, "y": 108 }, { "x": 80, "y": 108 }],
        "sourceHint": { "kind": "boundary_port", "containerId": "entry", "boundaryId": "entry-parameter" },
        "targetHint": { "kind": "element_port", "elementId": "entry-drop", "port": "input" }
      },
      {
        "id": "w-nat-left",
        "points": [{ "x": 186, "y": 218 }, { "x": 270, "y": 218 }],
        "sourceHint": { "kind": "element_port", "elementId": "nat-three", "port": "value" },
        "targetHint": { "kind": "element_port", "elementId": "left", "port": "input" }
      },
      {
        "id": "w-left-case",
        "points": [{ "x": 374, "y": 218 }, { "x": 500, "y": 194 }],
        "sourceHint": { "kind": "element_port", "elementId": "left", "port": "value" },
        "targetHint": { "kind": "element_port", "elementId": "case", "port": "scrutinee" }
      },
      {
        "id": "w-on-left-case",
        "points": [{ "x": 418, "y": 132 }, { "x": 500, "y": 222 }],
        "sourceHint": { "kind": "element_port", "elementId": "on-left-fn", "port": "value" },
        "targetHint": { "kind": "element_port", "elementId": "case", "port": "onLeft" }
      },
      {
        "id": "w-on-right-case",
        "points": [{ "x": 418, "y": 312 }, { "x": 500, "y": 250 }],
        "sourceHint": { "kind": "element_port", "elementId": "on-right-fn", "port": "value" },
        "targetHint": { "kind": "element_port", "elementId": "case", "port": "onRight" }
      },
      {
        "id": "w-case-result",
        "points": [{ "x": 636, "y": 222 }, { "x": 820, "y": 222 }],
        "sourceHint": { "kind": "element_port", "elementId": "case", "port": "result" },
        "targetHint": { "kind": "boundary_port", "containerId": "entry", "boundaryId": "entry-result" }
      },
      {
        "id": "w-left-param-succ",
        "points": [{ "x": 0, "y": 538 }, { "x": 220, "y": 538 }],
        "sourceHint": { "kind": "boundary_port", "containerId": "onLeft-body", "boundaryId": "onLeft-parameter" },
        "targetHint": { "kind": "element_port", "elementId": "left-param-succ", "port": "input" }
      },
      {
        "id": "w-succ-left-result",
        "points": [{ "x": 308, "y": 538 }, { "x": 520, "y": 538 }],
        "sourceHint": { "kind": "element_port", "elementId": "left-param-succ", "port": "result" },
        "targetHint": { "kind": "boundary_port", "containerId": "onLeft-body", "boundaryId": "onLeft-result" }
      },
      {
        "id": "w-right-param-drop",
        "points": [{ "x": 0, "y": 818 }, { "x": 220, "y": 818 }],
        "sourceHint": { "kind": "boundary_port", "containerId": "onRight-body", "boundaryId": "onRight-parameter" },
        "targetHint": { "kind": "element_port", "elementId": "right-param-drop", "port": "input" }
      },
      {
        "id": "w-zero-right-result",
        "points": [{ "x": 316, "y": 908 }, { "x": 520, "y": 908 }],
        "sourceHint": { "kind": "element_port", "elementId": "right-zero", "port": "value" },
        "targetHint": { "kind": "boundary_port", "containerId": "onRight-body", "boundaryId": "onRight-result" }
      }
    ],
    "junctions": []
  },
  "surfaceFunctions": [
    {
      "name": "onLeft",
      "templateId": "onLeft",
      "bodyContainerId": "onLeft-body",
      "parameters": [{ "name": "n", "type": "nat" }],
      "result": { "name": "result", "type": "nat" }
    },
    {
      "name": "onRight",
      "templateId": "onRight",
      "bodyContainerId": "onRight-body",
      "parameters": [{ "name": "b", "type": "bool" }],
      "result": { "name": "result", "type": "nat" }
    }
  ]
}`;

test("Sum Left is executable and serializable", async ({ page }) => {
  const issues = attachIssueWatch(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Add Left" }).click();
  await expect(page.locator('g.element-node[data-node-kind="left"]')).toHaveCount(1);
  await page.getByRole("button", { name: "Add Right" }).click();
  await expect(page.locator('g.element-node[data-node-kind="right"]')).toHaveCount(1);
  await page.getByRole("button", { name: "Add Case" }).click();
  await expect(page.locator('g.element-node[data-node-kind="case"]')).toHaveCount(1);

  await importJson(page, leftEntryProject);
  await expect(page.getByTestId("element-left-signature")).toContainText("Nat + Bool");

  await runMode(page, "transparent");
  await expect(page.getByText(/Result:/)).toContainText("Left(Nat(3))");
  await expect(page.locator(".trace-event-button", { hasText: "Left" })).toHaveCount(1);

  await runMode(page, "fast");
  await expect(page.getByText(/Result:/)).toContainText("Left(Nat(3))");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  const download = await downloadPromise;
  const exportedPath = await download.path();
  expect(exportedPath).toBeTruthy();

  await page.reload();
  await page.getByLabel("Open JSON file").setInputFiles(exportedPath!);
  await runMode(page, "fast");
  await expect(page.getByText(/Result:/)).toContainText("Left(Nat(3))");

  expect(issues.consoleErrors).toEqual([]);
  expect(issues.pageErrors).toEqual([]);
});

test("Case applies only the selected Sum branch", async ({ page }) => {
  const issues = attachIssueWatch(page);
  await page.goto("/");
  await importJson(page, caseProject, "sum-case.tilefold.json");
  await expect(page.getByTestId("element-case-signature")).toContainText("Nat + Bool");

  await runMode(page, "transparent");
  await expect(page.getByText(/Result:/)).toContainText("Nat(4)");
  await expect(page.locator(".trace-event-button", { hasText: "CaseLeft" })).toHaveCount(1);
  await expect(page.locator(".trace-event-button", { hasText: "CaseRight" })).toHaveCount(0);

  await runMode(page, "fast");
  await expect(page.getByText(/Result:/)).toContainText("Nat(4)");

  await page.locator('g.element-node[data-node-id="case"]').focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("ArrowRight");
  const box = await page.locator('g.element-node[data-node-id="case"]').boundingBox();
  expect(box).not.toBeNull();

  expect(issues.consoleErrors).toEqual([]);
  expect(issues.pageErrors).toEqual([]);
});
