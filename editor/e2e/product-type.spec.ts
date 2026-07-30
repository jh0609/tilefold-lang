import { expect, test, type Page } from "@playwright/test";

function attachIssueWatch(page: Page) {
  const issues = { consoleErrors: [] as string[], pageErrors: [] as string[] };
  page.on("console", (message) => {
    if (message.type() === "error") issues.consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => issues.pageErrors.push(error.message));
  return issues;
}

const productSwapProject = `{
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
}`;

async function importJson(page: Page, json: string, name = "product.tilefold.json") {
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

test("Product Pair and Unpair are authorable, executable, and serializable", async ({
  page,
}) => {
  const issues = attachIssueWatch(page);
  await page.goto("/");

  await page.getByRole("button", { name: "Add Pair" }).click();
  await expect(page.locator('g.element-node[data-node-kind="pair"]')).toHaveCount(1);
  await expect(page.getByTestId(/element-.*-kind-label/).filter({ hasText: "Pair" })).toHaveCount(1);

  await page.getByRole("button", { name: "Add Unpair" }).click();
  await expect(page.locator('g.element-node[data-node-kind="unpair"]')).toHaveCount(1);
  await expect(
    page.getByTestId(/element-.*-kind-label/).filter({ hasText: "Unpair" }),
  ).toHaveCount(1);

  await importJson(page, productSwapProject);
  await expect(page.locator('g.element-node[data-node-kind="pair"]')).toHaveCount(2);
  await expect(page.locator('g.element-node[data-node-kind="unpair"]')).toHaveCount(1);
  await expect(page.getByTestId("element-pair-in-signature")).toContainText("Nat × Bool");
  await expect(page.getByTestId("element-unpair-signature")).toContainText("Nat × Bool");

  await runMode(page, "transparent");
  await expect(page.getByText(/Result:/)).toContainText("Product(Bool(True), Nat(3))");
  await expect
    .poll(() => page.locator(".trace-event-button", { hasText: "Pair" }).count())
    .toBeGreaterThanOrEqual(2);
  await expect(page.locator(".trace-event-button", { hasText: "Unpair" })).toHaveCount(1);

  await runMode(page, "fast");
  await expect(page.getByText(/Result:/)).toContainText("Product(Bool(True), Nat(3))");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  const download = await downloadPromise;
  const exportedPath = await download.path();
  expect(exportedPath).toBeTruthy();

  await page.reload();
  await page.getByLabel("Open JSON file").setInputFiles(exportedPath!);
  await expect(page.locator('g.element-node[data-node-kind="pair"]')).toHaveCount(2);
  await runMode(page, "fast");
  await expect(page.getByText(/Result:/)).toContainText("Product(Bool(True), Nat(3))");

  expect(issues.consoleErrors).toEqual([]);
  expect(issues.pageErrors).toEqual([]);
});
