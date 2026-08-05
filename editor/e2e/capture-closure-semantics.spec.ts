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

async function dragBy(page: Page, locator: Locator, dx: number, dy: number) {
  const from = await center(locator);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 12 });
  await page.mouse.up();
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
  await page.mouse.move(to.x, to.y, { steps: 18 });
  await page.mouse.up();
  try {
    await expect
      .poll(() => page.locator('polyline[data-testid^="wire-"]').count(), {
        timeout: 1200,
      })
      .toBe(before + expectedWireDelta);
    return;
  } catch {
    await source.dragTo(target, { force: true });
  }
  await expect
    .poll(() => page.locator('polyline[data-testid^="wire-"]').count())
    .toBe(before + expectedWireDelta);
}

async function dragConnectViaMidpoint(
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
  await page.mouse.move(from.x + 80, from.y, { steps: 8 });
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, {
    steps: 12,
  });
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();
  await expect
    .poll(() => page.locator('polyline[data-testid^="wire-"]').count())
    .toBe(before + expectedWireDelta);
}

function element(page: Page, id: string) {
  return page.locator(`[data-node-id="${id}"].element-node`);
}

function byTemplate(page: Page, templateId: string) {
  return page.locator(
    `g.element-node[data-node-kind="function"][data-template-id="${templateId}"]`,
  );
}

function callByTemplate(page: Page, templateId: string) {
  return page.locator(
    `g.element-node[data-node-kind="project_call"][data-template-id="${templateId}"]`,
  );
}

function port(page: Page, id: string, name: string, direction: string) {
  return page.getByTestId(`port-element:${id}:${name}`).or(page.locator(
    `[data-node-id="${id}"][data-port-name="${name}"][data-port-direction="${direction}"]`,
  ));
}

function boundaryPort(
  page: Page,
  containerId: string,
  name: string,
  direction: string,
) {
  return page.locator(
    `[data-port-kind="boundary"][data-container-id="${containerId}"][data-port-name="${name}"][data-port-direction="${direction}"]`,
  );
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

async function dragNodeBy(page: Page, id: string, dx: number, dy: number) {
  const box = await element(page, id).boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width / 2 + dx, box!.y + box!.height / 2 + dy, {
    steps: 12,
  });
  await page.mouse.up();
}

async function selectAndDelete(page: Page, locator: Locator) {
  await locator.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Delete selected" })).toBeEnabled();
  await page.getByRole("button", { name: "Delete selected" }).click();
}

async function setNatValue(page: Page, nodeId: string, value: number) {
  await element(page, nodeId).focus();
  await page.keyboard.press("Enter");
  await page.getByLabel("Nat value").fill(String(value));
}

async function setNatArrowNat(page: Page, label: string) {
  await page.getByLabel(label, { exact: true }).selectOption("function");
  await expect(page.getByLabel(`${label} input`, { exact: true })).toHaveValue("nat");
  await expect(page.getByLabel(`${label} output`, { exact: true })).toHaveValue("nat");
}

async function setElementPosition(page: Page, nodeId: string, x: number, y: number) {
  await element(page, nodeId).focus();
  await page.keyboard.press("Enter");
  await page.locator("#inspector-x").fill(String(x));
  await page.locator("#inspector-x").blur();
  await page.locator("#inspector-y").fill(String(y));
  await page.locator("#inspector-y").blur();
}

async function addNatDropAt(page: Page, x: number, y: number) {
  const dropId = await addNodeAndGetId(page, "Add Drop", "drop");
  await setElementPosition(page, dropId, x, y);
  await element(page, dropId).focus();
  await page.keyboard.press("Enter");
  await page.getByLabel("Value type").selectOption("nat");
  return dropId;
}

async function containerBounds(page: Page, containerId: string) {
  return page
    .locator(`g.container-shape[data-container-id="${containerId}"] rect`)
    .first()
    .evaluate((rect) => {
      if (!(rect instanceof SVGRectElement)) {
        throw new Error("container rect is not an SVG rect");
      }
      return {
        x: rect.x.baseVal.value,
        y: rect.y.baseVal.value,
        width: rect.width.baseVal.value,
        height: rect.height.baseVal.value,
      };
    });
}

async function runAndExpect(page: Page, result: number) {
  await page.getByRole("button", { name: "Run" }).click();
  await expect(page.getByText(/Result:/)).toContainText(`Nat(${result})`);
  await expect(page.getByRole("region", { name: /Diagnostics/ })).toHaveCount(0);
}

async function removeInitialEntryGraph(page: Page) {
  while (
    (await page
      .locator('polyline[data-target-container-id="entry"][data-target-boundary-role="result"]')
      .count()) > 0
  ) {
    await selectAndDelete(
      page,
      page
        .locator('polyline[data-target-container-id="entry"][data-target-boundary-role="result"]')
        .first(),
    );
  }
  await selectAndDelete(page, element(page, "node_succ"));
  await expect(element(page, "node_succ")).toHaveCount(0);
  await selectAndDelete(page, element(page, "node_nat_2"));
  await expect(element(page, "node_nat_2")).toHaveCount(0);
}

async function returnToEntry(page: Page, containerId: string) {
  await page.locator(`g.container-shape[data-container-id="${containerId}"]`).focus();
  await page.keyboard.press("Enter");
  const button = page.getByRole("button", { name: "Return to entry graph" });
  if ((await button.count()) > 0) {
    await button.click();
  }
}

async function openContainer(page: Page, containerId: string) {
  await page.locator(`g.container-shape[data-container-id="${containerId}"]`).focus();
  await page.keyboard.press("Enter");
}

async function fitContainerToContent(page: Page, containerId: string) {
  await page.locator(`g.container-shape[data-container-id="${containerId}"]`).focus();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Fit to content" }).click();
}

async function enlargeEntryContainer(page: Page) {
  await page.locator('g.container-shape[data-container-id="entry"]').focus();
  await page.keyboard.press("Enter");
  await dragBy(page, page.getByTestId("container-entry-resize-south-east"), 120, 180);
}

async function createPredStep(page: Page) {
  await page.getByRole("button", { name: "Add Function" }).click();
  await page.getByLabel("Function name").fill("predStep");
  await page.getByLabel("Argument 1 name").fill("index");
  await page.getByLabel("Argument 1 type").selectOption("nat");
  await page.getByRole("button", { name: "Add argument" }).click();
  await page.getByLabel("Argument 2 name").fill("previous");
  await page.getByLabel("Argument 2 type").selectOption("nat");
  await page.getByLabel("Result name").fill("result");
  await page.getByLabel("Result type").selectOption("nat");
  await page.getByRole("button", { name: "Create total function" }).click();
  await expect(page.getByText(/Created predStep/)).toBeVisible();

  await page.getByRole("button", { name: "Fit view" }).click();
  const container = page.locator('g.container-shape[data-template-id="predStep"]');
  await expect(container).toBeVisible();
  await expect(
    page.locator('g.container-shape[data-template-id="predStep_curried_1"]'),
  ).toHaveCount(0);
  const containerId = await container.getAttribute("data-container-id");
  expect(containerId).not.toBeNull();

  await openContainer(page, containerId!);
  const oldResultWire = page
    .locator(
      `polyline[data-target-container-id="${containerId}"][data-target-boundary-role="result"][data-source-node-kind="nat_literal"]`,
    )
    .first();
  const oldResultLiteralId = await oldResultWire.getAttribute("data-source-node-id");
  expect(oldResultLiteralId).not.toBeNull();
  await selectAndDelete(page, oldResultWire);
  await selectAndDelete(page, element(page, oldResultLiteralId!));
  await dragConnect(
    page,
    boundaryPort(page, containerId!, "parameter", "output").nth(0),
    boundaryPort(page, containerId!, "result", "input"),
    0,
  );
  await fitContainerToContent(page, containerId!);

  await returnToEntry(page, containerId!);
  return { outerId: containerId!, innerId: containerId! };
}

async function deleteFunctionOutputDrop(page: Page, functionId: string) {
  const outputDropWire = page
    .locator(
      `polyline[data-source-node-id="${functionId}"][data-source-port-name="value"][data-target-node-kind="drop"]`,
    )
    .first();
  if ((await outputDropWire.count()) === 0) return;
  const dropId = await outputDropWire.getAttribute("data-target-node-id");
  expect(dropId).not.toBeNull();
  await selectAndDelete(page, element(page, dropId!));
}

async function dropNat2FunctionValue(page: Page, templateId: string) {
  const functionNode = byTemplate(page, templateId).first();
  await expect(functionNode).toBeVisible();
  const functionId = await functionNode.getAttribute("data-node-id");
  expect(functionId).not.toBeNull();
  const dropId = await addNodeAndGetId(page, "Add Drop", "drop");
  await setElementPosition(page, dropId, 115, 40);
  await element(page, dropId).focus();
  await page.keyboard.press("Enter");
  await page.getByLabel("Value type", { exact: true }).selectOption("function");
  await page.getByLabel("Value type output", { exact: true }).selectOption("function");
  await expect(page.getByLabel("Value type input", { exact: true })).toHaveValue("nat");
  await expect(page.getByLabel("Value type output input", { exact: true })).toHaveValue("nat");
  await expect(page.getByLabel("Value type output output", { exact: true })).toHaveValue("nat");
  await page.getByRole("button", { name: "Fit view" }).click();
  await dragConnect(
    page,
    port(page, functionId!, "value", "output"),
    port(page, dropId, "input", "input"),
  );
}

async function buildPredStepEntry(page: Page, index: number, previous: number) {
  await removeInitialEntryGraph(page);
  await enlargeEntryContainer(page);
  await page.getByRole("button", { name: "Add Call" }).click();
  await page.getByLabel("Template to call").selectOption("predStep");
  await page.getByRole("button", { name: "Create call" }).click();
  const callId = await callByTemplate(page, "predStep").last().getAttribute("data-node-id");
  expect(callId).not.toBeNull();
  await setElementPosition(page, callId!, 72, 135);
  const indexWire = page
    .locator(`polyline[data-target-node-id="${callId}"][data-target-port-name="arg_0"]`)
    .first();
  const previousWire = page
    .locator(`polyline[data-target-node-id="${callId}"][data-target-port-name="arg_1"]`)
    .first();
  const indexId = await indexWire.getAttribute("data-source-node-id");
  const previousId = await previousWire.getAttribute("data-source-node-id");
  expect(indexId).not.toBeNull();
  expect(previousId).not.toBeNull();
  await setElementPosition(page, indexId!, 15, 90);
  await setElementPosition(page, previousId!, 15, 210);
  await setNatValue(page, indexId!, index);
  await setNatValue(page, previousId!, previous);
  await dragConnectViaMidpoint(
    page,
    port(page, callId!, "result", "output"),
    boundaryPort(page, "entry", "result", "input"),
  );
  await expect(
    page.locator(
      `polyline[data-source-node-id="${callId}"][data-source-port-name="result"][data-target-container-id="entry"][data-target-boundary-role="result"]`,
    ),
  ).toHaveCount(1);
  await fitContainerToContent(page, "entry");
}

async function createAndRunPredStep(page: Page, index: number, previous: number) {
  await page.goto("/");
  await createPredStep(page);
  await dropNat2FunctionValue(page, "predStep");
  await buildPredStepEntry(page, index, previous);
  await runAndExpect(page, index);
}

async function buildPredEntry(page: Page, n: number) {
  await removeInitialEntryGraph(page);
  await enlargeEntryContainer(page);
  const functionId = await byTemplate(page, "predStep").first().getAttribute("data-node-id");
  expect(functionId).not.toBeNull();
  await setElementPosition(page, functionId!, 30, 240);
  const natRecId = await addNodeAndGetId(page, "Add NatRec", "nat_rec");
  await setElementPosition(page, natRecId, 110, 130);
  await element(page, natRecId).click();
  await page.getByLabel("Accumulator / result type").selectOption("nat");
  const baseId = await addNodeAndGetId(page, "Add Nat", "nat_literal");
  await setElementPosition(page, baseId, 15, 80);
  const countId = await addNodeAndGetId(page, "Add Nat", "nat_literal");
  await setElementPosition(page, countId, 15, 250);
  await setNatValue(page, baseId, 0);
  await setNatValue(page, countId, n);
  await dragConnect(
    page,
    port(page, baseId, "value", "output"),
    port(page, natRecId, "base", "input"),
  );
  await deleteFunctionOutputDrop(page, functionId!);
  await dragConnect(
    page,
    port(page, functionId!, "value", "output"),
    port(page, natRecId, "step", "input"),
  );
  await expect(
    page.locator(
      `polyline[data-source-node-id="${functionId}"][data-source-port-name="value"][data-target-node-id="${natRecId}"][data-target-port-name="step"]`,
    ),
  ).toHaveCount(1);
  await dragConnect(
    page,
    port(page, countId, "value", "output"),
    port(page, natRecId, "count", "input"),
  );
  await dragConnect(
    page,
    port(page, natRecId, "result", "output"),
    boundaryPort(page, "entry", "result", "input"),
  );
  await fitContainerToContent(page, "entry");
}

test.describe("capture closure execution semantics", () => {
  for (const [index, previous] of [
    [0, 9],
    [1, 9],
    [5, 2],
  ] as const) {
    test(`runs predStep ${index} ${previous}`, async ({ page }) => {
      const issues = watchBrowserIssues(page);
      await createAndRunPredStep(page, index, previous);
      await expectNoBrowserIssues(issues);
    });
  }

  for (const [n, result] of [
    [0, 0],
    [1, 0],
    [2, 1],
    [5, 4],
  ] as const) {
    test(`runs pred(${n})`, async ({ page }) => {
      const issues = watchBrowserIssues(page);
      await page.goto("/");
      await createPredStep(page);
      await buildPredEntry(page, n);
      await runAndExpect(page, result);
      await expectNoBrowserIssues(issues);
    });
  }

  test("keeps closure captures isolated across instances", async ({ page }) => {
    const issues = watchBrowserIssues(page);
    await page.goto("/");
    await createPredStep(page);
    await dropNat2FunctionValue(page, "predStep");
    await removeInitialEntryGraph(page);

    async function addPredStepApplication(index: number, previous: number) {
      const beforeCalls = await callByTemplate(page, "predStep").evaluateAll(
        (nodes) => nodes.map((node) => node.getAttribute("data-node-id") ?? ""),
      );
      await page.getByRole("button", { name: "Add Call" }).click();
      await page.getByLabel("Template to call").selectOption("predStep");
      await page.getByRole("button", { name: "Create call" }).click();
      const beforeCallSet = new Set(beforeCalls);
      const callId = (
        await callByTemplate(page, "predStep").evaluateAll((nodes) =>
          nodes.map((node) => node.getAttribute("data-node-id") ?? ""),
        )
      ).find((id) => !beforeCallSet.has(id));
      expect(callId).toBeTruthy();
      const indexWire = page
        .locator(
          `polyline[data-target-node-id="${callId}"][data-target-port-name="arg_0"]`,
        )
        .first();
      const previousWire = page
        .locator(
          `polyline[data-target-node-id="${callId}"][data-target-port-name="arg_1"]`,
        )
        .first();
      const indexId = await indexWire.getAttribute("data-source-node-id");
      const previousId = await previousWire.getAttribute("data-source-node-id");
      expect(indexId).not.toBeNull();
      expect(previousId).not.toBeNull();
      const rowY = index === 1 ? 55 : 135;
      await setElementPosition(page, indexId!, 10, rowY + 15);
      await setElementPosition(page, callId!, 72, rowY + 70);
      await setElementPosition(page, previousId!, 10, rowY + 175);
      await setNatValue(page, indexId!, index);
      await setNatValue(page, previousId!, previous);
      return callId!;
    }

    const applyA = await addPredStepApplication(1, 9);
    const applyB = await addPredStepApplication(5, 2);
    await page.locator('g.container-shape[data-container-id="entry"]').focus();
    await page.keyboard.press("Enter");
    await dragBy(page, page.getByTestId("container-entry-resize-south-east"), 0, 300);
    let inactiveDrop = await addNatDropAt(page, 125, 320);
    await dragConnect(
      page,
      port(page, applyB, "result", "output"),
      port(page, inactiveDrop, "input", "input"),
    );
    await expect(
      page.locator(
        `polyline[data-source-node-id="${applyB}"][data-source-port-name="result"][data-target-node-id="${inactiveDrop}"]`,
      ),
    ).toHaveCount(1);

    await dragConnect(
      page,
      port(page, applyA, "result", "output"),
      boundaryPort(page, "entry", "result", "input"),
    );
    await fitContainerToContent(page, "entry");
    await runAndExpect(page, 1);
    await selectAndDelete(
      page,
      page.locator(`polyline[data-source-node-id="${applyA}"][data-target-container-id="entry"]`),
    );
    await selectAndDelete(page, element(page, inactiveDrop));
    inactiveDrop = await addNatDropAt(page, 125, 220);
    await dragConnect(
      page,
      port(page, applyA, "result", "output"),
      port(page, inactiveDrop, "input", "input"),
    );
    await expect(
      page.locator(
        `polyline[data-source-node-id="${applyA}"][data-source-port-name="result"][data-target-node-id="${inactiveDrop}"]`,
      ),
    ).toHaveCount(1);
    await dragConnect(
      page,
      port(page, applyB, "result", "output"),
      boundaryPort(page, "entry", "result", "input"),
    );
    await fitContainerToContent(page, "entry");
    await runAndExpect(page, 5);
    await selectAndDelete(
      page,
      page.locator(`polyline[data-source-node-id="${applyB}"][data-target-container-id="entry"]`),
    );
    await selectAndDelete(page, element(page, inactiveDrop));
    inactiveDrop = await addNatDropAt(page, 125, 320);
    await dragConnect(
      page,
      port(page, applyB, "result", "output"),
      port(page, inactiveDrop, "input", "input"),
    );
    await expect(
      page.locator(
        `polyline[data-source-node-id="${applyB}"][data-source-port-name="result"][data-target-node-id="${inactiveDrop}"]`,
      ),
    ).toHaveCount(1);
    await dragConnect(
      page,
      port(page, applyA, "result", "output"),
      boundaryPort(page, "entry", "result", "input"),
    );
    await fitContainerToContent(page, "entry");
    await runAndExpect(page, 1);
    await expectNoBrowserIssues(issues);
  });
});

test("deletes unreferenced functions and refuses referenced templates", async ({
  page,
}, testInfo) => {
  const issues = watchBrowserIssues(page);
  await page.goto("/");

  await page.getByRole("button", { name: "Add Function" }).click();
  await page.getByLabel("Function name").fill("deleteMe");
  await page.getByLabel("Argument 1 name").fill("value");
  await page.getByLabel("Argument 1 type").selectOption("nat");
  await page.getByLabel("Result name").fill("result");
  await page.getByLabel("Result type").selectOption("nat");
  await page.getByRole("button", { name: "Create total function" }).click();
  const container = page.locator('g.container-shape[data-template-id="deleteMe"]');
  await expect(container).toBeVisible();
  const containerId = await container.getAttribute("data-container-id");
  expect(containerId).not.toBeNull();

  await container.click();
  await expect(page.getByText(/Delete these Function references first/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete function" })).toHaveCount(0);

  const functionId = await byTemplate(page, "deleteMe").getAttribute("data-node-id");
  expect(functionId).not.toBeNull();
  await deleteFunctionOutputDrop(page, functionId!);
  await selectAndDelete(page, element(page, functionId!));

  await container.click();
  await expect(page.getByRole("button", { name: "Delete function" })).toBeVisible();
  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("deleteMe");
    await dialog.dismiss();
  });
  await page.getByRole("button", { name: "Delete function" }).click();
  await expect(container).toBeVisible();

  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("deleteMe");
    await dialog.accept();
  });
  await page.getByRole("button", { name: "Delete function" }).click();
  await expect(container).toHaveCount(0);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  const download = await downloadPromise;
  const savedPath = testInfo.outputPath("deleted-function.tilefold.json");
  await download.saveAs(savedPath);
  const exported = await import("node:fs/promises").then((fs) =>
    fs.readFile(savedPath, "utf8"),
  );
  expect(exported).not.toContain("deleteMe");
  await page.reload();
  await page.getByLabel("Open JSON file").setInputFiles(savedPath);
  await expect(
    page.locator('g.container-shape[data-template-id="deleteMe"]'),
  ).toHaveCount(0);
  await expectNoBrowserIssues(issues);
});
