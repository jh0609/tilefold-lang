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

function elementPort(page: Page, elementId: string, name: string, direction: string) {
  return page.locator(
    `[data-node-id="${elementId}"][data-port-name="${name}"][data-port-direction="${direction}"]`,
  );
}

async function addNodeAndGetId(page: Page, buttonName: string, kind: string) {
  const before = new Set(
    await page.locator(`[data-node-kind="${kind}"]`).evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("data-node-id")),
    ),
  );
  await page.getByRole("button", { name: buttonName }).click();
  await expect
    .poll(async () => {
      const ids = await page.locator(`[data-node-kind="${kind}"]`).evaluateAll(
        (nodes) => nodes.map((node) => node.getAttribute("data-node-id")),
      );
      return ids.find((id) => id && !before.has(id)) ?? null;
    })
    .not.toBeNull();
  const ids = await page.locator(`[data-node-kind="${kind}"]`).evaluateAll(
    (nodes) => nodes.map((node) => node.getAttribute("data-node-id")),
  );
  return ids.find((id) => id && !before.has(id))!;
}

async function setElementPosition(page: Page, id: string, x: number, y: number) {
  await page.locator(`g.element-node[data-node-id="${id}"]`).click();
  await page.getByRole("textbox", { name: "X" }).fill(String(x));
  await page.getByRole("textbox", { name: "X" }).blur();
  await page.getByRole("textbox", { name: "Y" }).fill(String(y));
  await page.getByRole("textbox", { name: "Y" }).blur();
}

async function setNatValue(page: Page, id: string, value: number) {
  await page.locator(`g.element-node[data-node-id="${id}"]`).click();
  await page.getByLabel("Nat value").fill(String(value));
}

async function selectAndDelete(page: Page, locator: Locator) {
  await locator.focus();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Delete selected" }).click();
}

async function removeInitialEntryGraph(page: Page) {
  while (
    (await page
      .locator('g.element-node[data-node-kind="function"][data-template-id="fanCapture"]')
      .count()) > 0
  ) {
    const functionNode = page
      .locator('g.element-node[data-node-kind="function"][data-template-id="fanCapture"]')
      .first();
    const functionId = await functionNode.getAttribute("data-node-id");
    expect(functionId).not.toBeNull();
    const outputDropWire = page
      .locator(
        `polyline[data-source-node-id="${functionId}"][data-source-port-name="value"][data-target-node-kind="drop"]`,
      )
      .first();
    if ((await outputDropWire.count()) > 0) {
      const dropId = await outputDropWire.getAttribute("data-target-node-id");
      expect(dropId).not.toBeNull();
      await selectAndDelete(page, page.locator(`g.element-node[data-node-id="${dropId}"]`));
    }
    await selectAndDelete(
      page,
      page.locator(`g.element-node[data-node-id="${functionId}"]`),
    );
  }
  await selectAndDelete(page, page.locator('g.element-node[data-node-id="node_succ"]'));
  await expect(page.locator('g.element-node[data-node-id="node_succ"]')).toHaveCount(0);
  await selectAndDelete(page, page.locator('g.element-node[data-node-id="node_nat_2"]'));
  await expect(page.locator('g.element-node[data-node-id="node_nat_2"]')).toHaveCount(0);
}

async function returnToEntry(page: Page, containerId: string) {
  await page.locator(`g.container-shape[data-container-id="${containerId}"]`).focus();
  await page.keyboard.press("Enter");
  const button = page.getByRole("button", { name: "Return to entry graph" });
  if ((await button.count()) > 0) await button.click();
}

async function fitContainerToContent(page: Page, containerId: string) {
  await page.locator(`g.container-shape[data-container-id="${containerId}"]`).focus();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Fit to content" }).click();
}

async function createFanoutFunction(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Add Function" }).click();
  await page.getByLabel("Function name").fill("fanCapture");
  await page.getByLabel("Argument 1 name").fill("unused");
  await page.getByLabel("Argument 1 type").selectOption("unit");
  await page.getByLabel("Result name").fill("result");
  await page.getByLabel("Result type").selectOption("nat");
  await page.getByRole("button", { name: "Create total function" }).click();
  await expect(page.getByText(/Created fanCapture/)).toBeVisible();

  const container = page.locator('g.container-shape[data-template-id="fanCapture"]');
  await expect(container).toBeVisible();
  const containerId = await container.getAttribute("data-container-id");
  expect(containerId).not.toBeNull();
  await container.click();
  await page.getByRole("button", { name: "Edit captures" }).click();
  await page.getByRole("button", { name: "Add capture" }).click();
  await page.getByLabel("Capture 1 name").fill("seed");
  await page.getByLabel("Capture 1 type").selectOption("nat");
  await page.getByRole("button", { name: "Apply captures" }).click();
  await expect(page.getByText("seed: Nat")).toBeVisible();
  return containerId!;
}

async function addDropAt(page: Page, x: number, y: number) {
  const id = await addNodeAndGetId(page, "Add Drop", "drop");
  await setElementPosition(page, id, x, y);
  return id;
}

test("fans out a Capture boundary output through managed Copy and Drop materialization", async ({
  page,
}) => {
  const issues = watchBrowserIssues(page);
  const containerId = await createFanoutFunction(page);
  const source = boundaryPort(page, containerId, "capture:seed", "output");

  await expect(
    page.locator(
      `polyline[data-source-container-id="${containerId}"][data-source-boundary-role="capture"][data-target-node-kind="drop"]`,
    ),
  ).toHaveCount(1);
  const result = boundaryPort(page, containerId, "result", "input");
  const initialResultWire = page.locator(
    `polyline[data-target-container-id="${containerId}"][data-target-boundary-role="result"]`,
  );
  const initialResultLiteralId = await initialResultWire.getAttribute(
    "data-source-node-id",
  );
  expect(initialResultLiteralId).not.toBeNull();
  await selectAndDelete(
    page,
    initialResultWire,
  );
  await selectAndDelete(
    page,
    page.locator(`g.element-node[data-node-id="${initialResultLiteralId}"]`),
  );
  await dragConnect(page, source, result, 0);
  await expect(
    page.locator(
      `polyline[data-source-container-id="${containerId}"][data-source-boundary-role="capture"][data-target-boundary-role="result"]`,
    ),
  ).toHaveCount(1);

  const dropA = await addDropAt(page, 405, 165);
  await dragConnect(page, source, elementPort(page, dropA, "input", "input"), 2);
  await expect(
    page.locator(
      `polyline[data-source-container-id="${containerId}"][data-source-boundary-role="capture"][data-target-node-kind="copy"]`,
    ),
  ).toHaveCount(1);

  const dropB = await addDropAt(page, 485, 220);
  await dragConnect(page, source, elementPort(page, dropB, "input", "input"), 2);
  await expect(page.locator('g.element-node[data-node-kind="copy"]')).toHaveCount(2);

  const consumerWires = page.locator(
    'polyline[data-testid^="wire-"][data-source-node-kind="copy"]',
  );
  await expect(consumerWires).toHaveCount(4);
  await fitContainerToContent(page, containerId);

  await returnToEntry(page, containerId);
  await removeInitialEntryGraph(page);
  await page.getByRole("button", { name: "Add Call" }).click();
  await page.getByLabel("Template to call").selectOption("fanCapture");
  await page.getByRole("button", { name: "Create call" }).click();
  await expect(page.getByText(/Created a call to fanCapture/)).toBeVisible();
  const callFunction = page.locator('g.element-node[data-node-kind="function"][data-template-id="fanCapture"]').last();
  const callFunctionId = await callFunction.getAttribute("data-node-id");
  expect(callFunctionId).not.toBeNull();
  const seedWire = page
    .locator(
      `polyline[data-target-node-id="${callFunctionId}"][data-target-port-name="seed"]`,
    )
    .first();
  const seedLiteralId = await seedWire.getAttribute("data-source-node-id");
  expect(seedLiteralId).not.toBeNull();
  await setNatValue(page, seedLiteralId!, 4);
  const applyId = await page
    .locator('g.element-node[data-node-kind="apply"]')
    .last()
    .getAttribute("data-node-id");
  expect(applyId).not.toBeNull();
  const resultDropWire = page
    .locator(
      `polyline[data-source-node-id="${applyId}"][data-source-port-name="result"][data-target-node-kind="drop"]`,
    )
    .first();
  const resultDropId = await resultDropWire.getAttribute("data-target-node-id");
  expect(resultDropId).not.toBeNull();
  await selectAndDelete(page, page.locator(`g.element-node[data-node-id="${resultDropId}"]`));
  await dragConnect(
    page,
    elementPort(page, applyId!, "result", "output"),
    boundaryPort(page, "entry", "result", "input"),
  );
  await page.getByRole("button", { name: "Run" }).click();
  await expect(page.getByText(/Result:/)).toContainText("Nat(4)");
  await expect(page.locator(".trace-event-button", { hasText: "Copy" })).toHaveCount(2);
  await expect(page.getByRole("region", { name: /Diagnostics/ })).toHaveCount(0);

  await page.getByRole("button", { name: "Fit view" }).click();
  await page.locator(`g.container-shape[data-container-id="${containerId}"]`).click({
    force: true,
  });

  const middleWire = page.locator(
    `polyline[data-target-node-id="${dropA}"][data-target-port-name="input"]`,
  );
  await selectAndDelete(page, middleWire);
  await expect(page.locator(`g.element-node[data-node-id="${dropA}"]`)).toHaveCount(1);
  await expect(
    page.locator(
      `polyline[data-source-container-id="${containerId}"][data-source-boundary-role="capture"][data-target-node-kind="copy"]`,
    ),
  ).toHaveCount(1);

  const lastDropWire = page.locator(
    `polyline[data-target-node-id="${dropB}"][data-target-port-name="input"]`,
  );
  await selectAndDelete(page, lastDropWire);
  await expect(
    page.locator(
      `polyline[data-source-container-id="${containerId}"][data-source-boundary-role="capture"][data-target-node-kind="copy"]`,
    ),
  ).toHaveCount(0);

  const resultWire = page.locator(
    `polyline[data-source-container-id="${containerId}"][data-source-boundary-role="capture"][data-target-boundary-role="result"]`,
  );
  await selectAndDelete(page, resultWire);
  await expect(
    page.locator(
      `polyline[data-source-container-id="${containerId}"][data-source-boundary-role="capture"][data-target-node-kind="drop"]`,
    ),
  ).toHaveCount(1);

  await page.keyboard.press("Control+Z");
  await expect(resultWire).toHaveCount(1);
  await page.keyboard.press("Control+Y");
  await expect(
    page.locator(
      `polyline[data-source-container-id="${containerId}"][data-source-boundary-role="capture"][data-target-node-kind="drop"]`,
    ),
  ).toHaveCount(1);

  await expectNoBrowserIssues(issues);
});
