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

async function deleteSelected(page: Page, locator: Locator) {
  await locator.focus();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Delete selected" }).click();
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

test("authors a curried lexical capture through the UI", async ({ page }) => {
  const issues = watchBrowserIssues(page);
  await page.goto("/");

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
  const outerContainer = page.locator(
    'g.container-shape[data-template-id="predStep"]',
  );
  const innerContainer = page.locator(
    'g.container-shape[data-template-id="predStep_curried_1"]',
  );
  await expect(outerContainer).toBeVisible();
  await expect(innerContainer).toBeVisible();
  const outerContainerId = await outerContainer.getAttribute("data-container-id");
  const innerContainerId = await innerContainer.getAttribute("data-container-id");
  expect(outerContainerId).not.toBeNull();
  expect(innerContainerId).not.toBeNull();

  await innerContainer.click();
  await page.getByRole("button", { name: "Edit captures" }).click();
  await page.getByRole("button", { name: "Add capture" }).click();
  await page.getByLabel("Capture 1 name").fill("index");
  await page.getByLabel("Capture 1 type").selectOption("nat");
  await page.getByRole("button", { name: "Apply captures" }).click();
  await expect(page.getByText("index: Nat")).toBeVisible();

  const innerFunction = page.locator(
    'g.element-node[data-node-kind="function"][data-template-id="predStep_curried_1"]',
  );
  await expect(innerFunction).toBeVisible();
  const innerFunctionId = await innerFunction.getAttribute("data-node-id");
  expect(innerFunctionId).not.toBeNull();
  await dragConnect(
    page,
    boundaryPort(page, outerContainerId!, "parameter", "output"),
    elementPort(page, innerFunctionId!, "index", "input"),
    0,
  );
  await expect(
    page.locator(
      `polyline[data-source-container-id="${outerContainerId}"][data-target-node-id="${innerFunctionId}"][data-target-port-name="index"]`,
    ),
  ).toHaveCount(1);

  await page.getByRole("button", { name: "Fit view" }).click();
  await innerContainer.click();
  const oldResultWire = page.locator(
    `polyline[data-target-container-id="${innerContainerId}"][data-target-boundary-role="result"][data-source-node-kind="nat_literal"]`,
  );
  await deleteSelected(page, oldResultWire);
  await dragConnect(
    page,
    boundaryPort(page, innerContainerId!, "capture:index", "output"),
    boundaryPort(page, innerContainerId!, "result", "input"),
  );
  await expect(
    page.locator(
      `polyline[data-source-container-id="${innerContainerId}"][data-source-boundary-role="capture"][data-target-boundary-role="result"]`,
    ),
  ).toHaveCount(1);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  const download = await downloadPromise;
  const path = test.info().outputPath("captured-pred-step.tilefold.json");
  await download.saveAs(path);
  await page.reload();
  await page.getByLabel("Open JSON file").setInputFiles(path);
  await expect(
    page.locator(
      'g.container-shape[data-template-id="predStep_curried_1"]',
    ),
  ).toBeVisible();
  await expectNoBrowserIssues(issues);
});
