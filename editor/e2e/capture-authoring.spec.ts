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
  const container = page.locator(
    'g.container-shape[data-template-id="predStep"]',
  );
  await expect(container).toBeVisible();
  await expect(
    page.locator('g.container-shape[data-template-id="predStep_curried_1"]'),
  ).toHaveCount(0);
  const containerId = await container.getAttribute("data-container-id");
  expect(containerId).not.toBeNull();

  await container.click({ force: true });
  await expect(page.getByText(/predStep\(index: Nat, previous: Nat\)/)).toBeVisible();
  await expect(
    boundaryPort(page, containerId!, "parameter", "output"),
  ).toHaveCount(2);
  const oldResultWire = page.locator(
    `polyline[data-target-container-id="${containerId}"][data-target-boundary-role="result"][data-source-node-kind="nat_literal"]`,
  );
  await deleteSelected(page, oldResultWire);
  await dragConnect(
    page,
    boundaryPort(page, containerId!, "parameter", "output").nth(0),
    boundaryPort(page, containerId!, "result", "input"),
    0,
  );
  await expect(
    page.locator(
      `polyline[data-source-container-id="${containerId}"][data-source-boundary-role="parameter"][data-target-boundary-role="result"]`,
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
    page.locator('g.container-shape[data-template-id="predStep"]'),
  ).toBeVisible();
  await expect(
    page.locator('g.container-shape[data-template-id="predStep_curried_1"]'),
  ).toHaveCount(0);
  await expectNoBrowserIssues(issues);
});
