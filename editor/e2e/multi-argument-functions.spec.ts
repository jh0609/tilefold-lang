import { expect, test, type Locator, type Page } from "@playwright/test";

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

async function dragConnect(
  page: Page,
  source: Locator,
  target: Locator,
  expectedWireDelta = 1,
) {
  const before = await page.locator('polyline[data-testid^="wire-"]').count();
  const from = await center(source);
  const to = await center(target);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 16 });
  await page.mouse.up();
  await expect
    .poll(() => page.locator('polyline[data-testid^="wire-"]').count())
    .toBe(before + expectedWireDelta);
}

async function dragBy(page: Page, locator: Locator, deltaX: number, deltaY: number) {
  const from = await center(locator);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + deltaX, from.y + deltaY, { steps: 12 });
  await page.mouse.up();
}

function element(page: Page, id: string) {
  return page.locator(`[data-node-id="${id}"].element-node`);
}

function port(page: Page, id: string, name: string, direction: string) {
  return page.locator(
    `circle[role="button"][data-node-id="${id}"][data-port-name="${name}"][data-port-direction="${direction}"]`,
  );
}

function boundaryPort(
  page: Page,
  containerId: string,
  name: string,
  direction: string,
) {
  return page.locator(
    `circle[role="button"][data-port-kind="boundary"][data-container-id="${containerId}"][data-port-name="${name}"][data-port-direction="${direction}"]`,
  );
}

async function selectAndDelete(page: Page, locator: Locator) {
  await expect(locator).toBeAttached();
  await locator.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Delete selected" })).toBeEnabled();
  await page.getByRole("button", { name: "Delete selected" }).click();
}

async function addNodeAndGetId(page: Page, buttonName: string, kind: string) {
  const before = await page
    .locator(`g.element-node[data-node-kind="${kind}"]`)
    .evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("data-node-id") ?? ""),
    );
  await page.getByRole("button", { name: buttonName, exact: true }).click();
  const beforeSet = new Set(before);
  const created = (
    await page
      .locator(`g.element-node[data-node-kind="${kind}"]`)
      .evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("data-node-id") ?? ""),
      )
  ).find((id) => !beforeSet.has(id));
  expect(created).toBeTruthy();
  return created!;
}

async function setElementPosition(page: Page, nodeId: string, x: number, y: number) {
  await element(page, nodeId).focus();
  await page.keyboard.press("Enter");
  await page.locator("#inspector-x").fill(String(x));
  await page.locator("#inspector-x").blur();
  await page.locator("#inspector-y").fill(String(y));
  await page.locator("#inspector-y").blur();
}

async function setNatValue(page: Page, nodeId: string, value: number) {
  await element(page, nodeId).focus();
  await page.keyboard.press("Enter");
  await page.getByLabel("Nat value").fill(String(value));
}

async function setValueType(page: Page, nodeId: string, type: string) {
  await element(page, nodeId).focus();
  await page.keyboard.press("Enter");
  await page.getByLabel("Value type").selectOption(type);
}

async function removeInitialEntryGraph(page: Page) {
  await selectAndDelete(page, page.getByTestId("wire-wire_result"));
  await selectAndDelete(page, element(page, "node_succ"));
  await selectAndDelete(page, element(page, "node_nat_2"));
}

async function enlargeEntryForMultiArgumentCall(page: Page) {
  await page.locator('g.container-shape[data-container-id="entry"]').focus();
  await page.keyboard.press("Enter");
  await dragBy(page, page.getByTestId("container-entry-resize-south-east"), 60, 240);
}

async function createNat3Function(page: Page, name: string, resultType = "nat") {
  await page.getByRole("button", { name: "Add Function" }).click();
  await page.getByLabel("Function name").fill(name);
  await page.getByLabel("Argument 1 name").fill("n");
  await page.getByLabel("Argument 1 type").selectOption("nat");
  await page.getByRole("button", { name: "Add argument" }).click();
  await page.getByLabel("Argument 2 name").fill("lower");
  await page.getByLabel("Argument 2 type").selectOption("nat");
  await page.getByRole("button", { name: "Add argument" }).click();
  await page.getByLabel("Argument 3 name").fill("upper");
  await page.getByLabel("Argument 3 type").selectOption("nat");
  await page.getByLabel("Result name").fill("result");
  await page.getByLabel("Result type").selectOption(resultType);
  await page.getByRole("button", { name: "Create total function" }).click();
  await expect(page.getByText(new RegExp(`Created ${name}`))).toBeVisible();
  const container = page.locator(`g.container-shape[data-template-id="${name}"]`);
  await expect(container).toBeVisible();
  const containerId = await container.getAttribute("data-container-id");
  expect(containerId).not.toBeNull();
  await expect(boundaryPort(page, containerId!, "parameter", "output")).toHaveCount(3);
  await expect(
    page.locator(`g.container-shape[data-template-id="${name}_curried_1"]`),
  ).toHaveCount(0);
  return containerId!;
}

async function addStandardCall(page: Page, name: string, templateId: string) {
  const before = await page
    .locator('g.element-node[data-node-kind="library_call"]')
    .evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("data-node-id") ?? ""),
    );
  await page.getByRole("button", { name: `Add Standard Library ${name}` }).click();
  const beforeSet = new Set(before);
  const id = (
    await page
      .locator(
        `g.element-node[data-node-kind="library_call"][data-template-id="${templateId}"]`,
      )
      .evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("data-node-id") ?? ""),
      )
  ).find((candidate) => !beforeSet.has(candidate));
  expect(id).toBeTruthy();
  return id!;
}

async function clearAutoInputsAndResultDrop(page: Page, nodeId: string, arity: number) {
  for (let index = 0; index < arity; index += 1) {
    const wire = page
      .locator(`polyline[data-target-node-id="${nodeId}"][data-target-port-name="arg_${index}"]`)
      .first();
    const sourceId = await wire.getAttribute("data-source-node-id");
    if (sourceId) await selectAndDelete(page, element(page, sourceId));
  }
  const resultDropWire = page
    .locator(`polyline[data-source-node-id="${nodeId}"][data-source-port-name="result"][data-target-node-kind="drop"]`)
    .first();
  const dropId = await resultDropWire.getAttribute("data-target-node-id");
  if (dropId) await selectAndDelete(page, element(page, dropId));
}

async function clearFunctionResultLiteral(page: Page, containerId: string) {
  const wire = page
    .locator(
      `polyline[data-target-container-id="${containerId}"][data-target-boundary-role="result"][data-source-node-kind$="_literal"]`,
    )
    .first();
  const sourceId = await wire.getAttribute("data-source-node-id");
  expect(sourceId).not.toBeNull();
  await selectAndDelete(page, element(page, sourceId!));
}

async function returnToEntry(page: Page, containerId: string) {
  await page.locator(`g.container-shape[data-container-id="${containerId}"]`).focus();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Return to entry graph" }).click();
}

async function openContainer(page: Page, containerId: string) {
  await page.locator(`g.container-shape[data-container-id="${containerId}"]`).focus();
  await page.keyboard.press("Enter");
  if (containerId !== "entry") {
    await expect(
      page.getByRole("button", { name: "Return to entry graph" }),
    ).toBeVisible();
  }
}

async function buildClamp(page: Page) {
  const containerId = await createNat3Function(page, "clamp");
  await openContainer(page, containerId);
  const params = boundaryPort(page, containerId, "parameter", "output");
  await clearFunctionResultLiteral(page, containerId);
  await openContainer(page, containerId);
  const maxId = await addStandardCall(page, "max", "tilefold.std.nat.max");
  const minId = await addStandardCall(page, "min", "tilefold.std.nat.min");
  await clearAutoInputsAndResultDrop(page, maxId, 2);
  await clearAutoInputsAndResultDrop(page, minId, 2);
  await dragConnect(page, params.nth(0), port(page, maxId, "arg_0", "input"), 0);
  await dragConnect(page, params.nth(1), port(page, maxId, "arg_1", "input"), 0);
  await dragConnect(page, port(page, maxId, "result", "output"), port(page, minId, "arg_0", "input"));
  await dragConnect(page, params.nth(2), port(page, minId, "arg_1", "input"), 0);
  await dragConnect(page, port(page, minId, "result", "output"), boundaryPort(page, containerId, "result", "input"));
  await returnToEntry(page, containerId);
}

async function buildBetween(page: Page) {
  const containerId = await createNat3Function(page, "between", "bool");
  await openContainer(page, containerId);
  const params = boundaryPort(page, containerId, "parameter", "output");
  await clearFunctionResultLiteral(page, containerId);
  await openContainer(page, containerId);
  const copyId = await addNodeAndGetId(page, "Add Copy", "copy");
  const lowerToNId = await addStandardCall(
    page,
    "lessOrEqual",
    "tilefold.std.nat.lessOrEqual",
  );
  const nToUpperId = await addStandardCall(
    page,
    "lessOrEqual",
    "tilefold.std.nat.lessOrEqual",
  );
  const andId = await addStandardCall(page, "and", "tilefold.std.bool.and");
  await clearAutoInputsAndResultDrop(page, lowerToNId, 2);
  await clearAutoInputsAndResultDrop(page, nToUpperId, 2);
  await clearAutoInputsAndResultDrop(page, andId, 2);
  await dragConnect(page, params.nth(0), port(page, copyId, "input", "input"), 0);
  await dragConnect(page, params.nth(1), port(page, lowerToNId, "arg_0", "input"), 0);
  await dragConnect(page, port(page, copyId, "left", "output"), port(page, lowerToNId, "arg_1", "input"));
  await dragConnect(page, port(page, copyId, "right", "output"), port(page, nToUpperId, "arg_0", "input"));
  await dragConnect(page, params.nth(2), port(page, nToUpperId, "arg_1", "input"), 0);
  await dragConnect(page, port(page, lowerToNId, "result", "output"), port(page, andId, "arg_0", "input"));
  await dragConnect(page, port(page, nToUpperId, "result", "output"), port(page, andId, "arg_1", "input"));
  await dragConnect(page, port(page, andId, "result", "output"), boundaryPort(page, containerId, "result", "input"));
  await returnToEntry(page, containerId);
}

async function addProjectCall(page: Page, templateId: string) {
  const before = await page
    .locator(`g.element-node[data-node-kind="project_call"][data-template-id="${templateId}"]`)
    .evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("data-node-id") ?? ""),
    );
  await page.getByRole("button", { name: "Add Call" }).click();
  await page.getByLabel("Template to call").selectOption(templateId);
  await page.getByRole("button", { name: "Create call" }).click();
  const beforeSet = new Set(before);
  const id = (
    await page
      .locator(`g.element-node[data-node-kind="project_call"][data-template-id="${templateId}"]`)
      .evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("data-node-id") ?? ""),
      )
  ).find((candidate) => !beforeSet.has(candidate));
  expect(id).toBeTruthy();
  return id!;
}

async function connectCallToEntry(page: Page, callId: string) {
  const resultDropWire = page
    .locator(`polyline[data-source-node-id="${callId}"][data-source-port-name="result"][data-target-node-kind="drop"]`)
    .first();
  const dropId = await resultDropWire.getAttribute("data-target-node-id");
  expect(dropId).not.toBeNull();
  await selectAndDelete(page, element(page, dropId!));
  await dragConnect(page, port(page, callId, "result", "output"), boundaryPort(page, "entry", "result", "input"));
}

async function callArgumentSources(page: Page, callId: string, arity = 3) {
  const ids = [];
  for (let index = 0; index < arity; index += 1) {
    const wire = page
      .locator(`polyline[data-target-node-id="${callId}"][data-target-port-name="arg_${index}"]`)
      .first();
    const sourceId = await wire.getAttribute("data-source-node-id");
    expect(sourceId).not.toBeNull();
    ids.push(sourceId!);
  }
  return ids;
}

async function connectBoolCallToNatEntry(page: Page, callId: string) {
  const resultDropWire = page
    .locator(`polyline[data-source-node-id="${callId}"][data-source-port-name="result"][data-target-node-kind="drop"]`)
    .first();
  const dropId = await resultDropWire.getAttribute("data-target-node-id");
  expect(dropId).not.toBeNull();
  await selectAndDelete(page, element(page, dropId!));
  const boolRecId = await addNodeAndGetId(page, "Add BoolRec", "bool_rec");
  await setValueType(page, boolRecId, "nat");
  const falseId = await addNodeAndGetId(page, "Add Nat", "nat_literal");
  const trueId = await addNodeAndGetId(page, "Add Nat", "nat_literal");
  await setNatValue(page, falseId, 0);
  await setNatValue(page, trueId, 1);
  await dragConnect(page, port(page, callId, "result", "output"), port(page, boolRecId, "condition", "input"));
  await dragConnect(page, port(page, falseId, "value", "output"), port(page, boolRecId, "false_case", "input"));
  await dragConnect(page, port(page, trueId, "value", "output"), port(page, boolRecId, "true_case", "input"));
  await dragConnect(page, port(page, boolRecId, "result", "output"), boundaryPort(page, "entry", "result", "input"));
}

async function runAndExpect(page: Page, expected: string) {
  await page.getByRole("button", { name: "Run" }).click();
  await expect(page.getByText(/Result:/)).toContainText(expected);
  await expect(page.getByRole("region", { name: /Diagnostics/ })).toHaveCount(0);
}

test("authors flat multi-argument clamp and calls it as one node", async ({
  page,
}, testInfo) => {
  const issues = watchBrowserIssues(page);
  await page.goto("/");
  await buildClamp(page);
  await enlargeEntryForMultiArgumentCall(page);
  await removeInitialEntryGraph(page);
  const callId = await addProjectCall(page, "clamp");
  await setElementPosition(page, callId, 72, 118);
  const [nId, lowerId, upperId] = await callArgumentSources(page, callId);
  await setElementPosition(page, nId, 8, 84);
  await setElementPosition(page, lowerId, 8, 160);
  await setElementPosition(page, upperId, 8, 236);
  await connectCallToEntry(page, callId);

  await setNatValue(page, nId, 3);
  await setNatValue(page, lowerId, 5);
  await setNatValue(page, upperId, 10);
  await runAndExpect(page, "Nat(5)");
  await setNatValue(page, nId, 7);
  await runAndExpect(page, "Nat(7)");
  await setNatValue(page, nId, 15);
  await runAndExpect(page, "Nat(10)");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  const download = await downloadPromise;
  const savedPath = testInfo.outputPath("flat-clamp.tilefold.json");
  await download.saveAs(savedPath);
  await page.reload();
  await page.getByLabel("Open JSON file").setInputFiles(savedPath);
  await expect(page.getByText("flat-clamp.tilefold.json")).toBeVisible();
  await runAndExpect(page, "Nat(10)");
  await expectNoBrowserIssues(issues);
});

test("authors flat multi-argument between with explicit Copy", async ({
  page,
}, testInfo) => {
  const issues = watchBrowserIssues(page);
  await page.goto("/");
  await buildBetween(page);
  await enlargeEntryForMultiArgumentCall(page);
  await removeInitialEntryGraph(page);
  const callId = await addProjectCall(page, "between");
  await setElementPosition(page, callId, 72, 118);
  const [nId, lowerId, upperId] = await callArgumentSources(page, callId);
  await setElementPosition(page, nId, 8, 84);
  await setElementPosition(page, lowerId, 8, 160);
  await setElementPosition(page, upperId, 8, 236);
  await connectBoolCallToNatEntry(page, callId);

  await setNatValue(page, lowerId, 5);
  await setNatValue(page, upperId, 10);
  for (const [n, expected] of [
    [7, "Nat(1)"],
    [5, "Nat(1)"],
    [10, "Nat(1)"],
    [3, "Nat(0)"],
    [15, "Nat(0)"],
  ] as const) {
    await setNatValue(page, nId, n);
    await runAndExpect(page, expected);
  }

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  const download = await downloadPromise;
  const savedPath = testInfo.outputPath("flat-between.tilefold.json");
  await download.saveAs(savedPath);
  await page.reload();
  await page.getByLabel("Open JSON file").setInputFiles(savedPath);
  await expect(page.getByText("flat-between.tilefold.json")).toBeVisible();
  await runAndExpect(page, "Nat(0)");
  await expectNoBrowserIssues(issues);
});
