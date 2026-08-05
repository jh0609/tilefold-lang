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

async function dragConnect(page: Page, source: Locator, target: Locator) {
  const beforeWireCount = await page.locator('polyline[data-testid^="wire-"]').count();
  const from = await center(source);
  const to = await center(target);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 16 });
  await page.mouse.up();
  try {
    await expect
      .poll(() => page.locator('polyline[data-testid^="wire-"]').count(), {
        timeout: 1200,
      })
      .toBe(beforeWireCount + 1);
    return;
  } catch {
    await source.dragTo(target, { force: true });
  }
  await expect
    .poll(() => page.locator('polyline[data-testid^="wire-"]').count())
    .toBe(beforeWireCount + 1);
}

function element(page: Page, id: string) {
  return page.locator(`[data-node-id="${id}"].element-node`);
}

function byTemplate(page: Page, templateId: string) {
  return page.locator(
    `g.element-node[data-node-kind="function"][data-template-id="${templateId}"]`,
  );
}

function port(page: Page, id: string, name: string, direction: string) {
  return page.locator(
    `[data-node-id="${id}"][data-port-name="${name}"][data-port-direction="${direction}"]`,
  );
}

function elementPort(page: Page, id: string, name: string) {
  return page.getByTestId(`port-element:${id}:${name}`);
}

function boundaryPort(page: Page, containerId: string, name: string, direction: string) {
  return page.locator(
    `[data-port-kind="boundary"][data-container-id="${containerId}"][data-port-name="${name}"][data-port-direction="${direction}"]`,
  );
}

async function selectedNodeId(page: Page, kind: string) {
  const node = page.locator(`g.element-node.selected[data-node-kind="${kind}"]`);
  await expect(node).toBeVisible();
  const id = await node.getAttribute("data-node-id");
  expect(id).not.toBeNull();
  return id!;
}

async function parameterCopyId(page: Page, containerId: string) {
  const parameterCopyWire = page.locator(
    `polyline[data-source-container-id="${containerId}"][data-source-boundary-role="parameter"][data-target-node-kind="copy"]`,
  );
  await expect(parameterCopyWire).toHaveCount(1);
  const copyId = await parameterCopyWire.getAttribute("data-target-node-id");
  expect(copyId).not.toBeNull();
  return copyId!;
}

async function addNodeAndGetId(page: Page, buttonName: string, kind: string) {
  const before = await page
    .locator(`g.element-node[data-node-kind="${kind}"]`)
    .evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("data-node-id") ?? ""),
    );
  await page.getByRole("button", { name: buttonName, exact: true }).click();
  const after = await page
    .locator(`g.element-node[data-node-kind="${kind}"]`)
    .evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("data-node-id") ?? ""),
    );
  const beforeSet = new Set(before);
  const created = after.find((id) => !beforeSet.has(id));
  expect(created).toBeTruthy();
  return created!;
}

async function selectAndDelete(page: Page, locator: Locator) {
  await locator.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Delete selected" })).toBeEnabled();
  await page.getByRole("button", { name: "Delete selected" }).click();
}

async function setNatArrowNat(page: Page, label: string) {
  await page.getByLabel(label, { exact: true }).selectOption("function");
  await expect(page.getByLabel(`${label} input`, { exact: true })).toHaveValue("nat");
  await expect(page.getByLabel(`${label} output`, { exact: true })).toHaveValue("nat");
}

async function setNatArrowNatToNatArrowNat(page: Page, label: string) {
  await page.getByLabel(label, { exact: true }).selectOption("function");
  await setNatArrowNat(page, `${label} input`);
  await setNatArrowNat(page, `${label} output`);
}

async function createUnaryNatFunction(page: Page, name: string) {
  await page.getByRole("button", { name: "Add Function" }).click();
  await page.getByLabel("Function name").fill(name);
  await page.getByLabel("Argument 1 name").fill("x");
  await page.getByLabel("Argument 1 type").selectOption("nat");
  await page.getByLabel("Result name").fill("result");
  await page.getByLabel("Result type").selectOption("nat");
  await page.getByRole("button", { name: "Create total function" }).click();
  const containerId = await page
    .locator(`[data-container-kind="template"][data-template-id="${name}"]`)
    .getAttribute("data-container-id");
  expect(containerId).not.toBeNull();
  return containerId!;
}

async function rewriteCurrentIdentityBodyToSucc(page: Page, containerId: string) {
  await page.getByRole("button", { name: "Add Succ" }).click();
  const succId = await selectedNodeId(page, "succ");
  await selectAndDelete(
    page,
    page.locator(
      'polyline[data-source-node-kind="copy"][data-source-port-name="left"][data-target-boundary-role="result"]',
    ),
  );
  await dragConnect(
    page,
    page.locator('[data-node-kind="copy"][data-port-name="left"][data-port-direction="output"]'),
    port(page, succId, "input", "input"),
  );
  await dragConnect(
    page,
    port(page, succId, "result", "output"),
    boundaryPort(page, containerId, "result", "input"),
  );
}

async function returnToEntry(page: Page, containerId: string) {
  await page.locator(`g.container-shape[data-container-id="${containerId}"]`).focus();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Return to entry graph" }).click();
}

async function createApplyTwice(page: Page) {
  await page.getByRole("button", { name: "Add Function" }).click();
  await page.getByLabel("Function name").fill("applyTwice");
  await page.getByLabel("Argument 1 name").fill("x");
  await page.getByLabel("Argument 1 type").selectOption("nat");
  await page.getByRole("button", { name: "Add capture" }).click();
  await page.getByLabel("Capture 1 key").fill("f");
  await setNatArrowNat(page, "Capture 1 type");
  await page.getByLabel("Result name").fill("result");
  await page.getByLabel("Result type").selectOption("nat");
  await page.getByRole("button", { name: "Create total function" }).click();
  const containerId = await page
    .locator('[data-container-kind="template"][data-template-id="applyTwice"]')
    .getAttribute("data-container-id");
  expect(containerId).not.toBeNull();
  return containerId!;
}

async function createArrowIdentityFunction(page: Page, name: string) {
  await page.getByRole("button", { name: "Add Function" }).click();
  await page.getByLabel("Function name").fill(name);
  await page.getByLabel("Argument 1 name").fill("f");
  await setNatArrowNat(page, "Argument 1 type");
  await page.getByLabel("Result name").fill("result");
  await setNatArrowNat(page, "Result type");
  await page.getByRole("button", { name: "Create total function" }).click();
  const containerId = await page
    .locator(`[data-container-kind="template"][data-template-id="${name}"]`)
    .getAttribute("data-container-id");
  expect(containerId).not.toBeNull();
  return containerId!;
}

async function createNatToArrowStepFunction(page: Page) {
  await page.getByRole("button", { name: "Add Function" }).click();
  await page.getByLabel("Function name").fill("stepArrow");
  await page.getByLabel("Argument 1 name").fill("n");
  await page.getByLabel("Argument 1 type").selectOption("nat");
  await page.getByLabel("Result name").fill("result");
  await setNatArrowNatToNatArrowNat(page, "Result type");
  await page.getByRole("button", { name: "Create total function" }).click();
  const stepContainerId = await page
    .locator('[data-container-kind="template"][data-template-id="stepArrow"]')
    .getAttribute("data-container-id");
  expect(stepContainerId).not.toBeNull();
  return { stepContainerId: stepContainerId! };
}

async function rewriteApplyTwiceBody(page: Page, containerId: string) {
  const captureDrop = page
    .locator(
      'polyline[data-source-boundary-role="capture"][data-source-port-name="capture:f"][data-target-node-kind="drop"]',
    )
    .first();
  const captureDropId = await captureDrop.getAttribute("data-target-node-id");
  expect(captureDropId).not.toBeNull();
  await selectAndDelete(page, element(page, captureDropId!));

  await selectAndDelete(
    page,
    page.locator(
      'polyline[data-source-node-kind="copy"][data-source-port-name="left"][data-target-boundary-role="result"]',
    ),
  );

  const copyFunctionId = await addNodeAndGetId(page, "Add Copy", "copy");
  await element(page, copyFunctionId).click();
  await setNatArrowNat(page, "Value type");

  const applyOneId = await addNodeAndGetId(page, "Add Apply", "apply");
  const applyTwoId = await addNodeAndGetId(page, "Add Apply", "apply");

  await dragConnect(
    page,
    boundaryPort(page, containerId, "capture:f", "output"),
    port(page, copyFunctionId, "input", "input"),
  );
  await dragConnect(
    page,
    port(page, copyFunctionId, "left", "output"),
    port(page, applyOneId, "function", "input"),
  );
  await dragConnect(
    page,
    port(page, copyFunctionId, "right", "output"),
    port(page, applyTwoId, "function", "input"),
  );
  await dragConnect(
    page,
    port(page, await parameterCopyId(page, containerId), "left", "output"),
    port(page, applyOneId, "argument", "input"),
  );
  await dragConnect(
    page,
    port(page, applyOneId, "result", "output"),
    port(page, applyTwoId, "argument", "input"),
  );
  await dragConnect(
    page,
    port(page, applyTwoId, "result", "output"),
    boundaryPort(page, containerId, "result", "input"),
  );
}

async function removeOriginalEntryResult(page: Page) {
  await selectAndDelete(page, page.getByTestId("wire-wire_result"));
}

async function deleteOriginalExampleComputation(page: Page) {
  await selectAndDelete(page, element(page, "node_succ"));
  await selectAndDelete(page, element(page, "node_nat_2"));
}

async function deleteUnusedFunctionClosure(page: Page, templateId: string) {
  const functionNode = byTemplate(page, templateId).first();
  const functionId = await functionNode.getAttribute("data-node-id");
  expect(functionId).not.toBeNull();
  await deleteFunctionOutputDrop(page, functionId!);
  await selectAndDelete(page, element(page, functionId!));
}

async function deleteFunctionOutputDrop(page: Page, functionId: string) {
  const outputDropWire = page
    .locator(
      `polyline[data-source-node-id="${functionId}"][data-source-port-name="value"][data-target-node-kind="drop"]`,
    )
    .first();
  const dropId = await outputDropWire.getAttribute("data-target-node-id");
  expect(dropId).not.toBeNull();
  await selectAndDelete(page, element(page, dropId!));
}

async function prepareEntryForHigherOrder(page: Page, templatesToDelete: string[]) {
  await removeOriginalEntryResult(page);
  await deleteOriginalExampleComputation(page);
  for (const templateId of templatesToDelete) {
    await deleteUnusedFunctionClosure(page, templateId);
  }
  const incSafetyDrop = page
    .locator(
      'polyline[data-source-node-kind="function"][data-source-node-id][data-source-port-name="value"][data-target-node-kind="drop"]',
    )
    .first();
  const incDropId = await incSafetyDrop.getAttribute("data-target-node-id");
  expect(incDropId).not.toBeNull();
  await selectAndDelete(page, element(page, incDropId!));
}

test("authors apply_twice with Arrow capture, Copy, nested Apply, export, and rerun", async ({
  page,
  context,
}, testInfo) => {
  const issues = watchBrowserIssues(page);
  await page.goto("/");

  const incContainerId = await createUnaryNatFunction(page, "inc");
  await rewriteCurrentIdentityBodyToSucc(page, incContainerId);
  await returnToEntry(page, incContainerId);

  const applyTwiceContainerId = await createApplyTwice(page);
  await rewriteApplyTwiceBody(page, applyTwiceContainerId);
  await returnToEntry(page, applyTwiceContainerId);

  await prepareEntryForHigherOrder(page, ["applyTwice"]);

  await page.getByRole("button", { name: "Add Call" }).click();
  await page.getByLabel("Template to call").selectOption("applyTwice");
  await page.getByRole("button", { name: "Create call" }).click();
  await dragConnect(
    page,
    byTemplate(page, "inc").locator('[data-port-name="value"][data-port-direction="output"]'),
    byTemplate(page, "applyTwice")
      .last()
      .locator('[data-port-name="f"][data-port-direction="input"]'),
  );
  const callApplyId = await page
    .locator('g.element-node[data-node-kind="apply"]')
    .last()
    .getAttribute("data-node-id");
  expect(callApplyId).not.toBeNull();
  await dragConnect(
    page,
    port(page, callApplyId!, "result", "output"),
    boundaryPort(page, "entry", "result", "input"),
  );

  await page.getByRole("button", { name: "Run" }).click();
  await expect(page.getByText(/Result:/)).toContainText("Nat(2)");
  await expect(page.getByRole("button", { name: /Call .*missing/ })).toHaveCount(0);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  const download = await downloadPromise;
  const savedPath = testInfo.outputPath("applyTwice.tilefold.json");
  await download.saveAs(savedPath);
  const reloaded = await context.newPage();
  const reloadIssues = watchBrowserIssues(reloaded);
  await reloaded.goto("/");
  await reloaded.getByLabel("Open JSON file").setInputFiles(savedPath);
  await expect(reloaded.getByText("applyTwice.tilefold.json")).toBeVisible();
  await reloaded.getByRole("button", { name: "Run" }).click();
  await expect(reloaded.getByText(/Result:/)).toContainText("Nat(2)");
  await expectNoBrowserIssues(issues);
  await expectNoBrowserIssues(reloadIssues);
});

test("returns an Arrow value from a Call and re-applies it", async ({
  page,
  context,
}, testInfo) => {
  const issues = watchBrowserIssues(page);
  await page.goto("/");

  const incContainerId = await createUnaryNatFunction(page, "inc");
  await rewriteCurrentIdentityBodyToSucc(page, incContainerId);
  await returnToEntry(page, incContainerId);

  const returnContainerId = await createArrowIdentityFunction(page, "returnFunction");
  await returnToEntry(page, returnContainerId);
  await prepareEntryForHigherOrder(page, ["returnFunction"]);

  await page.getByRole("button", { name: "Add Call" }).click();
  await page.getByLabel("Template to call").selectOption("returnFunction");
  await page.getByRole("button", { name: "Create call" }).click();
  const callApplyId = await page
    .locator('g.element-node[data-node-kind="apply"]')
    .last()
    .getAttribute("data-node-id");
  expect(callApplyId).not.toBeNull();
  await dragConnect(
    page,
    byTemplate(page, "inc").locator('[data-port-name="value"][data-port-direction="output"]'),
    port(page, callApplyId!, "argument", "input"),
  );

  const reapplyId = await addNodeAndGetId(page, "Add Apply", "apply");
  const natId = await addNodeAndGetId(page, "Add Nat", "nat_literal");
  await dragConnect(
    page,
    port(page, callApplyId!, "result", "output"),
    port(page, reapplyId, "function", "input"),
  );
  await dragConnect(
    page,
    port(page, natId, "value", "output"),
    port(page, reapplyId, "argument", "input"),
  );
  await dragConnect(
    page,
    port(page, reapplyId, "result", "output"),
    boundaryPort(page, "entry", "result", "input"),
  );

  await page.getByRole("button", { name: "Run" }).click();
  await expect(page.getByText(/Result:/)).toContainText("Nat(1)");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  const download = await downloadPromise;
  const savedPath = testInfo.outputPath("returnFunction.tilefold.json");
  await download.saveAs(savedPath);
  const reloaded = await context.newPage();
  const reloadIssues = watchBrowserIssues(reloaded);
  await reloaded.goto("/");
  await reloaded.getByLabel("Open JSON file").setInputFiles(savedPath);
  await expect(reloaded.getByText("returnFunction.tilefold.json")).toBeVisible();
  await reloaded.getByRole("button", { name: "Run" }).click();
  await expect(reloaded.getByText(/Result:/)).toContainText("Nat(1)");
  await expectNoBrowserIssues(issues);
  await expectNoBrowserIssues(reloadIssues);
});

test("copies and drops an Arrow value while one copy is applied", async ({ page }) => {
  const issues = watchBrowserIssues(page);
  await page.goto("/");

  const incContainerId = await createUnaryNatFunction(page, "inc");
  await rewriteCurrentIdentityBodyToSucc(page, incContainerId);
  await returnToEntry(page, incContainerId);
  await prepareEntryForHigherOrder(page, []);

  const copyId = await addNodeAndGetId(page, "Add Copy", "copy");
  await expect(element(page, copyId)).toHaveAttribute("data-owner-container-id", "entry");
  await element(page, copyId).click();
  await setNatArrowNat(page, "Value type");
  const dropId = await addNodeAndGetId(page, "Add Drop", "drop");
  await element(page, dropId).click();
  await setNatArrowNat(page, "Value type");
  const applyId = await addNodeAndGetId(page, "Add Apply", "apply");
  const natId = await addNodeAndGetId(page, "Add Nat", "nat_literal");

  await dragConnect(
    page,
    elementPort(page, "node_function_1", "value"),
    elementPort(page, copyId, "input"),
  );
  await dragConnect(
    page,
    port(page, copyId, "left", "output"),
    port(page, applyId, "function", "input"),
  );
  await dragConnect(
    page,
    port(page, copyId, "right", "output"),
    port(page, dropId, "input", "input"),
  );
  await dragConnect(
    page,
    port(page, natId, "value", "output"),
    port(page, applyId, "argument", "input"),
  );
  await dragConnect(
    page,
    port(page, applyId, "result", "output"),
    boundaryPort(page, "entry", "result", "input"),
  );

  await page.getByRole("button", { name: "Run" }).click();
  await expect(page.getByText(/Result:/)).toContainText("Nat(1)");

  const dropWire = page.locator(
    `polyline[data-source-node-id="${copyId}"][data-source-port-name="right"][data-target-node-id="${dropId}"]`,
  );
  await selectAndDelete(page, dropWire);
  await page.getByRole("button", { name: "Run" }).click();
  await expect(page.getByRole("region", { name: /Diagnostics/ })).toBeVisible();
  await dragConnect(
    page,
    port(page, copyId, "right", "output"),
    port(page, dropId, "input", "input"),
  );
  await page.getByRole("button", { name: "Run" }).click();
  await expect(page.getByText(/Result:/)).toContainText("Nat(1)");
  await expect(page.getByRole("region", { name: /Diagnostics/ })).toHaveCount(0);
  await expectNoBrowserIssues(issues);
});

test("authors NatRec with an Arrow accumulator and applies the result", async ({
  page,
  context,
}, testInfo) => {
  const issues = watchBrowserIssues(page);
  await page.goto("/");

  const incContainerId = await createUnaryNatFunction(page, "inc");
  await rewriteCurrentIdentityBodyToSucc(page, incContainerId);
  await returnToEntry(page, incContainerId);

  const { stepContainerId } = await createNatToArrowStepFunction(page);
  await returnToEntry(page, stepContainerId);
  await removeOriginalEntryResult(page);
  await deleteOriginalExampleComputation(page);
  const incFunctionId = await byTemplate(page, "inc").getAttribute("data-node-id");
  const stepFunctionId = await byTemplate(page, "stepArrow").getAttribute("data-node-id");
  expect(incFunctionId).not.toBeNull();
  expect(stepFunctionId).not.toBeNull();
  await deleteFunctionOutputDrop(page, incFunctionId!);
  await deleteFunctionOutputDrop(page, stepFunctionId!);

  const natRecId = await addNodeAndGetId(page, "Add NatRec", "nat_rec");
  await element(page, natRecId).click();
  await setNatArrowNat(page, "Accumulator / result type");
  const applyId = await addNodeAndGetId(page, "Add Apply", "apply");
  const countId = await addNodeAndGetId(page, "Add Nat", "nat_literal");
  await element(page, countId).click();
  await page.getByLabel("Nat value").fill("2");
  const argumentId = await addNodeAndGetId(page, "Add Nat", "nat_literal");

  await dragConnect(
    page,
    byTemplate(page, "inc").locator('[data-port-name="value"][data-port-direction="output"]'),
    port(page, natRecId, "base", "input"),
  );
  await dragConnect(
    page,
    byTemplate(page, "stepArrow")
      .locator('[data-port-name="value"][data-port-direction="output"]'),
    port(page, natRecId, "step", "input"),
  );
  await dragConnect(
    page,
    port(page, countId, "value", "output"),
    port(page, natRecId, "count", "input"),
  );
  await dragConnect(
    page,
    port(page, natRecId, "result", "output"),
    port(page, applyId, "function", "input"),
  );
  await dragConnect(
    page,
    port(page, argumentId, "value", "output"),
    port(page, applyId, "argument", "input"),
  );
  await dragConnect(
    page,
    port(page, applyId, "result", "output"),
    boundaryPort(page, "entry", "result", "input"),
  );

  await page.getByLabel("Execution mode").selectOption("transparent");
  await page.getByRole("button", { name: "Run" }).click();
  await expect(page.getByText(/Result:/)).toContainText("Nat(0)");
  await expect(
    page.locator(".trace-event-button", { hasText: "NatRecStart" }),
  ).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  const download = await downloadPromise;
  const savedPath = testInfo.outputPath("natRecArrow.tilefold.json");
  await download.saveAs(savedPath);
  const reloaded = await context.newPage();
  const reloadIssues = watchBrowserIssues(reloaded);
  await reloaded.goto("/");
  await reloaded.getByLabel("Open JSON file").setInputFiles(savedPath);
  await expect(reloaded.getByText("natRecArrow.tilefold.json")).toBeVisible();
  await reloaded.getByLabel("Execution mode").selectOption("transparent");
  await reloaded.getByRole("button", { name: "Run" }).click();
  await expect(reloaded.getByText(/Result:/)).toContainText("Nat(0)");
  await expect(
    reloaded.locator(".trace-event-button", { hasText: "NatRecStart" }),
  ).toBeVisible();
  await expectNoBrowserIssues(issues);
  await expectNoBrowserIssues(reloadIssues);
});
