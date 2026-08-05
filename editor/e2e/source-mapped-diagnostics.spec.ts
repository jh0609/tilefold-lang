import { expect, test, type Locator, type Page } from "@playwright/test";

type BrowserIssues = {
  consoleErrors: string[];
  pageErrors: string[];
};

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
  expect(box, `bounding box for ${locator}`).not.toBeNull();
  return {
    x: box!.x + box!.width / 2,
    y: box!.y + box!.height / 2,
  };
}

async function dragConnect(page: Page, source: Locator, target: Locator) {
  const from = await center(source);
  const to = await center(target);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();
  await expect(page.getByText(/Added wire/)).toBeVisible();
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

function elementPort(page: Page, id: string, name: string, direction: string) {
  return page.locator(
    `[data-node-id="${id}"][data-port-name="${name}"][data-port-direction="${direction}"]`,
  );
}

async function selectAndDelete(page: Page, locator: Locator) {
  await locator.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("button", { name: "Delete selected" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Delete selected" }).click();
}

async function addIdentityFunction(page: Page) {
  await page.getByRole("button", { name: "Add Function" }).click();
  await page.getByLabel("Function name").fill("diagnosticIdentity");
  await page.getByLabel("Argument 1 name").fill("value");
  await page.getByLabel("Argument 1 type").selectOption("nat");
  await page.getByLabel("Result name").fill("result");
  await page.getByLabel("Result type").selectOption("nat");
  await page.getByRole("button", { name: "Create total function" }).click();
  await expect(page.getByText(/Created diagnosticIdentity/)).toBeVisible();
  const templateContainerId = await page
    .locator(
      '[data-container-kind="template"][data-template-id="diagnosticIdentity"]',
    )
    .getAttribute("data-container-id");
  expect(templateContainerId).not.toBeNull();
  return templateContainerId!;
}

async function returnToEntry(page: Page) {
  await page.locator('g.container-shape[data-container-id="entry"]').focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "entry" })).toBeVisible();
}

async function addIdentityCall(page: Page) {
  await page.getByRole("button", { name: "Add Call" }).click();
  await expect(page.getByText("1. value: Nat")).toBeVisible();
  await page.getByRole("button", { name: "Create call" }).click();
  await expect(
    page.getByText(/Created a call to diagnosticIdentity/),
  ).toBeVisible();
}

async function deleteStandaloneFunctionReference(page: Page, templateId: string) {
  const functionNode = page
    .locator(`g.element-node[data-node-kind="function"][data-template-id="${templateId}"]`)
    .first();
  await expect(functionNode).toBeVisible();
  await selectAndDelete(page, functionNode);
}

async function explicitlyDropLastApplyResult(page: Page) {
  const applyId = await page
    .locator('g.element-node[data-node-kind="apply"]')
    .last()
    .getAttribute("data-node-id");
  expect(applyId).not.toBeNull();
  await page.getByRole("button", { name: "Add Drop" }).click();
  const drop = page.locator('g.element-node.selected[data-node-kind="drop"]');
  await expect(drop).toBeVisible();
  const dropId = await drop.getAttribute("data-node-id");
  expect(dropId).not.toBeNull();
  await page.getByLabel("Value type").selectOption("nat");
  await dragConnect(
    page,
    elementPort(page, applyId!, "result", "output"),
    elementPort(page, dropId!, "input", "input"),
  );
}

async function runAndExpectNat3(page: Page) {
  await page.getByRole("button", { name: "Run" }).click();
  await expect(page.getByText(/Result:/)).toContainText("Nat(3)");
}

test("maps a missing Call argument diagnostic back to the exact call site", async ({
  page,
}) => {
  const issues = watchBrowserIssues(page);
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Add Function" })).toBeVisible();

  await addIdentityFunction(page);
  await returnToEntry(page);
  await deleteStandaloneFunctionReference(page, "diagnosticIdentity");
  await addIdentityCall(page);

  const argumentWire = page
    .locator(
      'polyline[data-target-node-kind="apply"][data-target-port-name="argument"]',
    )
    .last();
  await selectAndDelete(page, argumentWire);

  await page.getByRole("button", { name: "Run" }).click();
  const diagnostic = page.getByRole("button", {
    name: /Call "diagnosticIdentity" is missing a value for argument "value"/,
  });
  await expect(diagnostic).toBeVisible();
  await expect(diagnostic).toContainText("surface.missing-call-argument");

  await diagnostic.click();
  await expect(page.locator("g.element-node.selected[data-node-kind='apply']")).toBeVisible();

  await page.getByRole("button", { name: "Undo" }).click();
  await page.getByRole("button", { name: "Undo" }).click();
  await runAndExpectNat3(page);
  await expect(page.getByText(/surface\.missing-call-argument/)).toHaveCount(0);
  await expectNoBrowserIssues(issues);
});

test("maps an incomplete function result diagnostic back to the function body", async ({
  page,
}) => {
  const issues = watchBrowserIssues(page);
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Add Function" })).toBeVisible();

  const templateContainerId = await addIdentityFunction(page);
  await selectAndDelete(
    page,
    page.locator(
      `polyline[data-target-kind="boundary"][data-target-container-id="${templateContainerId}"][data-target-boundary-role="result"]`,
    ),
  );
  await returnToEntry(page);
  await deleteStandaloneFunctionReference(page, "diagnosticIdentity");
  await addIdentityCall(page);
  await explicitlyDropLastApplyResult(page);

  await page.getByRole("button", { name: "Run" }).click();
  const diagnostic = page.getByRole("button", {
    name: /Function "diagnosticIdentity" does not provide a value for result "result"/,
  });
  await expect(diagnostic).toBeVisible();
  await expect(diagnostic).toContainText("surface.missing-result");

  await diagnostic.click();
  await expect(page.getByRole("heading", { name: /boundary_/ })).toBeVisible();

  await dragConnect(
    page,
    page.locator(
      '[data-node-kind="copy"][data-port-name="left"][data-port-direction="output"]',
    ),
    boundaryPort(page, templateContainerId, "result", "input"),
  );
  await returnToEntry(page);
  await runAndExpectNat3(page);
  await expect(page.getByText(/surface\.missing-result/)).toHaveCount(0);
  await expectNoBrowserIssues(issues);
});
