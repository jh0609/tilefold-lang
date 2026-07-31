import { expect, test, type Page } from "@playwright/test";

function attachIssueWatch(page: Page) {
  const issues = { consoleErrors: [] as string[], pageErrors: [] as string[] };
  page.on("console", (message) => {
    if (message.type() === "error") issues.consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => issues.pageErrors.push(error.message));
  return issues;
}

async function importJson(page: Page, json: string, name = "list.tilefold.json") {
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

const list123Project = `{
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
        "id": "nil",
        "kind": "nil",
        "bounds": { "x": 80, "y": 220, "width": 96, "height": 56 },
        "properties": { "itemType": "nat" },
        "portAnchors": [{ "port": "value", "x": 176, "y": 248 }]
      },
      {
        "id": "nat-three",
        "kind": "nat_literal",
        "bounds": { "x": 80, "y": 300, "width": 96, "height": 56 },
        "properties": { "value": "3" },
        "portAnchors": [{ "port": "value", "x": 176, "y": 328 }]
      },
      {
        "id": "cons-three",
        "kind": "cons",
        "bounds": { "x": 250, "y": 260, "width": 120, "height": 84 },
        "properties": { "itemType": "nat" },
        "portAnchors": [
          { "port": "head", "x": 250, "y": 288 },
          { "port": "tail", "x": 250, "y": 316 },
          { "port": "value", "x": 370, "y": 302 }
        ]
      },
      {
        "id": "nat-two",
        "kind": "nat_literal",
        "bounds": { "x": 250, "y": 150, "width": 96, "height": 56 },
        "properties": { "value": "2" },
        "portAnchors": [{ "port": "value", "x": 346, "y": 178 }]
      },
      {
        "id": "cons-two",
        "kind": "cons",
        "bounds": { "x": 430, "y": 205, "width": 120, "height": 84 },
        "properties": { "itemType": "nat" },
        "portAnchors": [
          { "port": "head", "x": 430, "y": 233 },
          { "port": "tail", "x": 430, "y": 261 },
          { "port": "value", "x": 550, "y": 247 }
        ]
      },
      {
        "id": "nat-one",
        "kind": "nat_literal",
        "bounds": { "x": 430, "y": 90, "width": 96, "height": 56 },
        "properties": { "value": "1" },
        "portAnchors": [{ "port": "value", "x": 526, "y": 118 }]
      },
      {
        "id": "cons-one",
        "kind": "cons",
        "bounds": { "x": 610, "y": 150, "width": 120, "height": 84 },
        "properties": { "itemType": "nat" },
        "portAnchors": [
          { "port": "head", "x": 610, "y": 178 },
          { "port": "tail", "x": 610, "y": 206 },
          { "port": "value", "x": 730, "y": 192 }
        ]
      }
    ],
    "containers": [
      {
        "id": "entry",
        "kind": {
          "kind": "entry",
          "templateId": "entry_template",
          "resultType": { "list": "nat" },
          "dependencies": []
        },
        "bounds": { "x": 0, "y": 0, "width": 900, "height": 440 },
        "boundaryPorts": [
          { "id": "entry-parameter", "role": "parameter", "type": "unit", "anchor": { "x": 0, "y": 108 } },
          { "id": "entry-result", "role": "result", "type": { "list": "nat" }, "anchor": { "x": 900, "y": 192 } }
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
        "id": "w-three-head",
        "points": [{ "x": 176, "y": 328 }, { "x": 250, "y": 288 }],
        "sourceHint": { "kind": "element_port", "elementId": "nat-three", "port": "value" },
        "targetHint": { "kind": "element_port", "elementId": "cons-three", "port": "head" }
      },
      {
        "id": "w-nil-tail",
        "points": [{ "x": 176, "y": 248 }, { "x": 250, "y": 316 }],
        "sourceHint": { "kind": "element_port", "elementId": "nil", "port": "value" },
        "targetHint": { "kind": "element_port", "elementId": "cons-three", "port": "tail" }
      },
      {
        "id": "w-two-head",
        "points": [{ "x": 346, "y": 178 }, { "x": 430, "y": 233 }],
        "sourceHint": { "kind": "element_port", "elementId": "nat-two", "port": "value" },
        "targetHint": { "kind": "element_port", "elementId": "cons-two", "port": "head" }
      },
      {
        "id": "w-three-tail",
        "points": [{ "x": 370, "y": 302 }, { "x": 430, "y": 261 }],
        "sourceHint": { "kind": "element_port", "elementId": "cons-three", "port": "value" },
        "targetHint": { "kind": "element_port", "elementId": "cons-two", "port": "tail" }
      },
      {
        "id": "w-one-head",
        "points": [{ "x": 526, "y": 118 }, { "x": 610, "y": 178 }],
        "sourceHint": { "kind": "element_port", "elementId": "nat-one", "port": "value" },
        "targetHint": { "kind": "element_port", "elementId": "cons-one", "port": "head" }
      },
      {
        "id": "w-two-tail",
        "points": [{ "x": 550, "y": 247 }, { "x": 610, "y": 206 }],
        "sourceHint": { "kind": "element_port", "elementId": "cons-two", "port": "value" },
        "targetHint": { "kind": "element_port", "elementId": "cons-one", "port": "tail" }
      },
      {
        "id": "w-result",
        "points": [{ "x": 730, "y": 192 }, { "x": 900, "y": 192 }],
        "sourceHint": { "kind": "element_port", "elementId": "cons-one", "port": "value" },
        "targetHint": { "kind": "boundary_port", "containerId": "entry", "boundaryId": "entry-result" }
      }
    ],
    "junctions": []
  }
}`;

test("List constructors are authorable, executable, and serializable", async ({
  page,
}) => {
  const issues = attachIssueWatch(page);
  await page.goto("/");

  await page.getByRole("button", { name: "Add Nil" }).click();
  await expect(page.locator('g.element-node[data-node-kind="nil"]')).toHaveCount(1);
  await page.getByRole("button", { name: "Add Cons" }).click();
  await expect(page.locator('g.element-node[data-node-kind="cons"]')).toHaveCount(1);
  await page.getByRole("button", { name: "Add ListRec" }).click();
  await expect(page.locator('g.element-node[data-node-kind="list_rec"]')).toHaveCount(1);

  await importJson(page, list123Project);
  await expect(page.locator('g.element-node[data-node-kind="nil"]')).toHaveCount(1);
  await expect(page.locator('g.element-node[data-node-kind="cons"]')).toHaveCount(3);
  await expect(page.getByTestId("element-cons-one-signature")).toContainText(
    "List<Nat>",
  );

  await runMode(page, "transparent");
  await expect(page.getByText(/Result:/)).toContainText(
    "List[Nat(1), Nat(2), Nat(3)]",
  );
  await expect
    .poll(() => page.locator(".trace-event-button", { hasText: "Cons" }).count())
    .toBeGreaterThanOrEqual(3);
  await expect(page.locator(".trace-event-button", { hasText: "Nil" })).toHaveCount(1);

  await runMode(page, "fast");
  await expect(page.getByText(/Result:/)).toContainText(
    "List[Nat(1), Nat(2), Nat(3)]",
  );

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  const download = await downloadPromise;
  const exportedPath = await download.path();
  expect(exportedPath).toBeTruthy();

  await page.reload();
  await page.getByLabel("Open JSON file").setInputFiles(exportedPath!);
  await expect(page.locator('g.element-node[data-node-kind="cons"]')).toHaveCount(3);
  await runMode(page, "fast");
  await expect(page.getByText(/Result:/)).toContainText(
    "List[Nat(1), Nat(2), Nat(3)]",
  );

  expect(issues.consoleErrors).toEqual([]);
  expect(issues.pageErrors).toEqual([]);
});
