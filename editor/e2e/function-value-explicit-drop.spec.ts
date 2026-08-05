import { expect, test, type Locator, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

type BrowserIssues = { consoleErrors: string[]; pageErrors: string[] };

function watchBrowserIssues(page: Page): BrowserIssues {
  const issues: BrowserIssues = { consoleErrors: [], pageErrors: [] };
  page.on("console", (message) => {
    if (message.type() === "error") issues.consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => issues.pageErrors.push(error.message));
  return issues;
}

async function expectNoBrowserIssues(issues: BrowserIssues) {
  expect(issues.pageErrors, "page errors").toEqual([]);
  expect(issues.consoleErrors, "console errors").toEqual([]);
}

async function center(locator: Locator) {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  return { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
}

async function dragConnect(page: Page, source: Locator, target: Locator) {
  const from = await center(source);
  const to = await center(target);
  const midX = Math.round((from.x + to.x) / 2);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(midX, from.y, { steps: 8 });
  await page.mouse.move(midX, to.y, { steps: 8 });
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
}

function port(page: Page, id: string, name: string, direction: string) {
  return page.locator(
    `circle[role="button"][data-node-id="${id}"][data-port-name="${name}"][data-port-direction="${direction}"]`,
  );
}

function boundaryPort(page: Page, containerId: string, name: string, direction: string) {
  return page.locator(
    `circle[role="button"][data-port-kind="boundary"][data-container-id="${containerId}"][data-port-name="${name}"][data-port-direction="${direction}"]`,
  );
}

async function selectedNodeId(page: Page, kind: string) {
  const node = page.locator(`g.element-node.selected[data-node-kind="${kind}"]`);
  await expect(node).toBeVisible();
  const id = await node.getAttribute("data-node-id");
  expect(id).not.toBeNull();
  return id!;
}

async function addNode(page: Page, buttonName: string, kind: string) {
  await page.getByRole("button", { name: buttonName, exact: true }).click();
  return selectedNodeId(page, kind);
}

async function setSelectedPosition(page: Page, x: string, y: string) {
  await page.locator("#inspector-x").fill(x);
  await page.locator("#inspector-x").blur();
  await page.locator("#inspector-y").fill(y);
  await page.locator("#inspector-y").blur();
}

async function enlargeEntry(page: Page) {
  await page.getByRole("button", { name: "entry container entry" }).click();
  await page.getByRole("button", { name: "Auto Layout entry" }).click();
}

async function deleteInitialEntryResult(page: Page) {
  const wire = page.getByTestId("wire-wire_result");
  await expect(wire).toBeAttached();
  await wire.focus();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Delete selected" }).click();
}

async function deleteElement(page: Page, id: string) {
  const element = page.locator(`g.element-node[data-node-id="${id}"]`);
  await expect(element).toBeAttached();
  await element.focus();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Delete selected" }).click();
}

async function expectUnconsumedFunctionDiagnostic(page: Page, name: string) {
  const diagnostic = page.getByRole("button", {
    name: new RegExp(`Function "${name}" value is not connected`),
  });
  await expect(diagnostic).toBeVisible();
  await expect(diagnostic).toContainText("surface.unconsumed-function-value");
  await expect(diagnostic).toContainText("explicitly added Drop");
  return diagnostic;
}

async function createNatRecStep(page: Page, name: string) {
  await page.getByRole("button", { name: "Add Function" }).click();
  await page.getByLabel("Function name").fill(name);
  await page.getByLabel("Argument 1 name").fill("index");
  await page.getByLabel("Argument 1 type").selectOption("nat");
  await page.getByRole("button", { name: "Add argument" }).click();
  await page.getByLabel("Argument 2 name").fill("previous");
  await page.getByLabel("Argument 2 type").selectOption("nat");
  await page.getByLabel("Result name").fill("result");
  await page.getByLabel("Result type").selectOption("nat");
  await page.getByRole("button", { name: "Create total function" }).click();
  await page.getByRole("button", { name: "Return to entry graph" }).click();
  const node = page.locator(
    `g.element-node[data-node-kind="function"][data-template-id="${name}"]`,
  );
  await expect(node).toBeVisible();
  const id = await node.getAttribute("data-node-id");
  expect(id).not.toBeNull();
  return id!;
}

test("authors a standalone Function value without a starter Drop and connects it directly", async ({
  page,
}, testInfo) => {
  const issues = watchBrowserIssues(page);
  await page.goto("/");

  const functionId = await createNatRecStep(page, "stepFn");
  await expect(
    page.locator(
      `polyline[data-source-node-id="${functionId}"][data-source-port-name="value"]`,
    ),
  ).toHaveCount(0);
  await expect(
    page.locator(
      `polyline[data-source-node-id="${functionId}"][data-source-port-name="value"][data-target-node-kind="drop"]`,
    ),
  ).toHaveCount(0);

  await page.getByLabel("Execution mode").selectOption("transparent");
  await page.getByRole("button", { name: "Run", exact: true }).click();
  const diagnostic = await expectUnconsumedFunctionDiagnostic(page, "stepFn");
  await diagnostic.click();
  await expect(
    page.locator(`g.element-node.selected[data-node-id="${functionId}"]`),
  ).toBeVisible();

  await page.getByLabel("Execution mode").selectOption("fast");
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expectUnconsumedFunctionDiagnostic(page, "stepFn");

  await enlargeEntry(page);
  await page.locator(`g.element-node[data-node-id="${functionId}"]`).click();
  await setSelectedPosition(page, "24", "220");
  await deleteInitialEntryResult(page);
  await deleteElement(page, "node_succ");
  await deleteElement(page, "node_nat_2");
  const natRecId = await addNode(page, "Add NatRec", "nat_rec");
  await setSelectedPosition(page, "220", "100");
  await page.getByLabel("Accumulator / result type").selectOption("nat");
  const baseId = await addNode(page, "Add Nat", "nat_literal");
  await setSelectedPosition(page, "10", "130");
  const countId = await addNode(page, "Add Nat", "nat_literal");
  await setSelectedPosition(page, "10", "240");

  await dragConnect(page, port(page, functionId, "value", "output"), port(page, natRecId, "step", "input"));
  await expect(
    page.locator(
      `polyline[data-source-node-id="${functionId}"][data-source-port-name="value"][data-target-node-id="${natRecId}"][data-target-port-name="step"]`,
    ),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(
    page.locator(
      `polyline[data-source-node-id="${functionId}"][data-source-port-name="value"][data-target-node-id="${natRecId}"]`,
    ),
  ).toHaveCount(0);
  await page.getByLabel("Execution mode").selectOption("transparent");
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expectUnconsumedFunctionDiagnostic(page, "stepFn");
  await page.getByRole("button", { name: "Redo" }).click();
  await expect(
    page.locator(
      `polyline[data-source-node-id="${functionId}"][data-source-port-name="value"][data-target-node-id="${natRecId}"][data-target-port-name="step"]`,
    ),
  ).toHaveCount(1);

  await dragConnect(page, port(page, baseId, "value", "output"), port(page, natRecId, "base", "input"));
  await dragConnect(page, port(page, countId, "value", "output"), port(page, natRecId, "count", "input"));
  await dragConnect(
    page,
    port(page, natRecId, "result", "output"),
    boundaryPort(page, "entry", "result", "input"),
  );

  await page.getByLabel("Execution mode").selectOption("transparent");
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(page.getByText(/Trace Run .* Result:/)).toContainText("Nat(0)");
  await page.getByLabel("Execution mode").selectOption("fast");
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(page.getByText(/Fast Run .* Result:/)).toContainText("Nat(0)");
  await expect(page.getByRole("region", { name: /Diagnostics/ })).toHaveCount(0);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  const download = await downloadPromise;
  const savedPath = testInfo.outputPath("function-value-direct.tilefold.json");
  await download.saveAs(savedPath);
  const exported = JSON.parse(await readFile(savedPath, "utf8"));
  expect(
    exported.geometry.wires.some(
      (wire: { sourceHint?: { elementId?: string; port?: string }; targetHint?: { elementId?: string } }) =>
        wire.sourceHint?.elementId === functionId &&
        wire.sourceHint?.port === "value" &&
        exported.geometry.elements.some(
          (element: { id: string; kind: string }) =>
            element.id === wire.targetHint?.elementId && element.kind === "drop",
        ),
    ),
  ).toBe(false);

  await page.reload();
  await expect(
    page.locator(
      `polyline[data-source-node-id="${functionId}"][data-source-port-name="value"][data-target-node-id="${natRecId}"][data-target-port-name="step"]`,
    ),
  ).toHaveCount(1);
  await page.getByLabel("Open JSON file").setInputFiles(savedPath);
  await expect(page.getByText("function-value-direct.tilefold.json")).toBeVisible();
  await expect(
    page.locator(
      `polyline[data-source-node-id="${functionId}"][data-source-port-name="value"][data-target-node-id="${natRecId}"][data-target-port-name="step"]`,
    ),
  ).toHaveCount(1);
  await page.getByLabel("Execution mode").selectOption("fast");
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(page.getByText(/Fast Run .* Result:/)).toContainText("Nat(0)");
  await expectNoBrowserIssues(issues);
});

test("authors a captured Function value without a host starter Drop", async ({ page }) => {
  const issues = watchBrowserIssues(page);
  await page.goto("/");

  await page.getByRole("button", { name: "Add Function" }).click();
  await page.getByLabel("Function name").fill("capturedStep");
  await page.getByLabel("Argument 1 name").fill("value");
  await page.getByLabel("Argument 1 type").selectOption("nat");
  await page.getByLabel("Result type").selectOption("nat");
  await page.getByRole("button", { name: "Add capture" }).click();
  await page.getByLabel("Capture 1 key").fill("seed");
  await page.getByLabel("Capture 1 type").selectOption("nat");
  await page.getByRole("button", { name: "Create total function" }).click();
  await page.getByRole("button", { name: "Return to entry graph" }).click();

  const node = page.locator(
    'g.element-node[data-node-kind="function"][data-template-id="capturedStep"]',
  );
  await expect(node).toBeVisible();
  const functionId = await node.getAttribute("data-node-id");
  expect(functionId).not.toBeNull();
  await expect(
    page.locator(
      `polyline[data-source-node-id="${functionId}"][data-source-port-name="value"]`,
    ),
  ).toHaveCount(0);
  await expect(
    page.locator(
      `polyline[data-source-node-id="${functionId}"][data-source-port-name="value"][data-target-node-kind="drop"]`,
    ),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expectUnconsumedFunctionDiagnostic(page, "capturedStep");
  await page.getByLabel("Execution mode").selectOption("transparent");
  await page.getByRole("button", { name: "Start stepping" }).click();
  await expectUnconsumedFunctionDiagnostic(page, "capturedStep");
  await expectNoBrowserIssues(issues);
});
