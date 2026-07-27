import { expect, test, type Locator, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

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
  return { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
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

function element(page: Page, id: string) {
  return page.locator(`[data-node-id="${id}"].element-node`);
}

function elementPort(page: Page, id: string, port: string, direction: string) {
  return page.locator(
    `[data-node-id="${id}"][data-port-name="${port}"][data-port-direction="${direction}"]`,
  );
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

async function selectAndDelete(page: Page, locator: Locator) {
  await locator.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("button", { name: "Delete selected" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Delete selected" }).click();
}

async function addCapturedSuccFunction(page: Page) {
  await page.getByRole("button", { name: "Add Function" }).click();
  await page.getByLabel("Function name").fill("capturedSucc");
  await page.getByLabel("Argument 1 name").fill("ignored");
  await page.getByLabel("Argument 1 type").selectOption("nat");
  await page.getByRole("button", { name: "Add argument" }).click();
  await page.getByLabel("Argument 2 name").fill("value");
  await page.getByLabel("Argument 2 type").selectOption("nat");
  await page.getByLabel("Result name").fill("result");
  await page.getByLabel("Result type").selectOption("nat");
  await page.getByRole("button", { name: "Create total function" }).click();

  await expect(page.getByText(/Created capturedSucc/)).toBeVisible();
  const templateContainerId = await page
    .locator('[data-container-kind="template"][data-template-id="capturedSucc"]')
    .getAttribute("data-container-id");
  expect(templateContainerId).not.toBeNull();
  return templateContainerId!;
}

async function rewriteCapturedSuccBody(page: Page, templateContainerId: string) {
  await page.getByRole("button", { name: "Add Succ" }).click();
  const succ = page.locator('g.element-node.selected[data-node-kind="succ"]');
  await expect(succ).toBeVisible();
  const succId = await succ.getAttribute("data-node-id");
  expect(succId).not.toBeNull();

  await selectAndDelete(
    page,
    page.locator(
      'polyline[data-source-node-kind="copy"][data-source-port-name="left"][data-target-boundary-role="result"]',
    ),
  );

  await dragConnect(
    page,
    page.locator(
      '[data-node-kind="copy"][data-port-name="left"][data-port-direction="output"]',
    ),
    elementPort(page, succId!, "input", "input"),
  );
  await dragConnect(
    page,
    elementPort(page, succId!, "result", "output"),
    boundaryPort(page, templateContainerId, "result", "input"),
  );
}

async function removeInitialEntryResultGraph(page: Page) {
  await selectAndDelete(page, element(page, "node_succ"));
  await selectAndDelete(page, element(page, "node_nat_2"));
}

async function addCapturedSuccCall(page: Page) {
  await page.getByRole("button", { name: "Add Call" }).click();
  await expect(page.getByText("1. ignored: Nat")).toBeVisible();
  await expect(page.getByText("2. value: Nat")).toBeVisible();
  await page.getByRole("button", { name: "Create call" }).click();
  await expect(page.getByText(/Created a call to capturedSucc/)).toBeVisible();

  const ignoredWire = page
    .locator(
      'polyline[data-target-node-kind="function"][data-target-port-name="ignored"]',
    )
    .last();
  const valueWire = page
    .locator(
      'polyline[data-target-node-kind="apply"][data-target-port-name="argument"]',
    )
    .last();
  const ignoredSource = await ignoredWire.getAttribute("data-source-node-id");
  const valueSource = await valueWire.getAttribute("data-source-node-id");
  expect(ignoredSource).not.toBeNull();
  expect(valueSource).not.toBeNull();

  await element(page, ignoredSource!).click();
  await page.getByLabel("Nat value").fill("99");
  await element(page, valueSource!).click();
  await page.getByLabel("Nat value").fill("2");

  const resultDropWire = page
    .locator(
      'polyline[data-source-node-kind="apply"][data-source-port-name="result"][data-target-node-kind="drop"]',
    )
    .last();
  const resultDropId = await resultDropWire.getAttribute("data-target-node-id");
  expect(resultDropId).not.toBeNull();
  await selectAndDelete(page, element(page, resultDropId!));

  const applyId = await page
    .locator('g.element-node[data-node-kind="apply"]')
    .last()
    .getAttribute("data-node-id");
  expect(applyId).not.toBeNull();
  await dragConnect(
    page,
    elementPort(page, applyId!, "result", "output"),
    boundaryPort(page, "entry", "result", "input"),
  );
}

async function runAndExpectNat3(page: Page) {
  await page.getByRole("button", { name: "Run" }).click();
  await expect(page.getByText(/Result:/)).toContainText("Nat(3)");
}

async function openTemplate(page: Page, templateContainerId: string) {
  await page.locator(`g.container-shape[data-container-id="${templateContainerId}"]`).focus();
  await page.keyboard.press("Enter");
}

test("edits, undoes, redoes, exports, and reloads a referenced Surface function signature", async ({
  page,
  context,
}, testInfo) => {
  const issues = watchBrowserIssues(page);
  await page.goto("/");

  const templateContainerId = await addCapturedSuccFunction(page);
  await rewriteCapturedSuccBody(page, templateContainerId);
  await openTemplate(page, templateContainerId);
  await page.getByRole("button", { name: "Return to entry graph" }).click();

  await removeInitialEntryResultGraph(page);
  await addCapturedSuccCall(page);
  await runAndExpectNat3(page);

  await openTemplate(page, templateContainerId);
  await page.getByRole("button", { name: "Edit signature" }).click();
  await expect(
    page.getByRole("dialog", { name: "Edit signature" }),
  ).toBeVisible();
  await page.getByLabel("Function name").fill("incrementLater");
  await page.getByLabel("Parameter 1 name").fill("unused");
  await page.getByLabel("Parameter 2 name").fill("input");
  await page.getByLabel("Move parameter 2 up").click();
  await page.getByRole("button", { name: "Apply signature" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByText(/incrementLater\(input: "nat", unused: "nat"\)/),
  ).toBeVisible();
  await expect(page.getByText(/\d+ undo · 0 redo/)).toBeVisible();

  await page.getByRole("button", { name: "Return to entry graph" }).click();
  await page.getByRole("button", { name: "Add Call" }).click();
  await expect(page.getByText("1. input: Nat")).toBeVisible();
  await expect(page.getByText("2. unused: Nat")).toBeVisible();
  await page.getByRole("button", { name: "Cancel function call" }).click();
  await expect(
    page.locator(
      'polyline[data-target-node-kind="function"][data-target-port-name="input"]',
    ),
  ).toHaveCount(2);
  await runAndExpectNat3(page);

  await page.getByRole("button", { name: "Undo" }).click();
  await openTemplate(page, templateContainerId);
  await expect(
    page.getByText(/capturedSucc\(ignored: "nat", value: "nat"\)/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Redo" }).click();
  await expect(
    page.getByText(/incrementLater\(input: "nat", unused: "nat"\)/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Return to entry graph" }).click();
  await runAndExpectNat3(page);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  const download = await downloadPromise;
  const savedPath = testInfo.outputPath("signature-edit.tilefold.json");
  await download.saveAs(savedPath);
  const savedJson = readFileSync(savedPath, "utf8");
  expect(savedJson).toContain('"name": "incrementLater"');
  expect(savedJson).toContain('"name": "input"');
  expect(savedJson).toContain('"name": "unused"');

  const reloaded = await context.newPage();
  const reloadIssues = watchBrowserIssues(reloaded);
  await reloaded.goto("/");
  await reloaded.getByLabel("Open JSON file").setInputFiles(savedPath);
  await expect(reloaded.getByText("signature-edit.tilefold.json")).toBeVisible();
  await reloaded.getByRole("button", { name: "Fit view" }).click();
  await openTemplate(reloaded, templateContainerId);
  await expect(
    reloaded.getByText(/incrementLater\(input: "nat", unused: "nat"\)/),
  ).toBeVisible();
  await runAndExpectNat3(reloaded);

  await expectNoBrowserIssues(issues);
  await expectNoBrowserIssues(reloadIssues);
});

test("blocks unsafe signature edits and keeps the function runnable", async ({
  page,
}) => {
  const issues = watchBrowserIssues(page);
  await page.goto("/");

  const templateContainerId = await addCapturedSuccFunction(page);
  await rewriteCapturedSuccBody(page, templateContainerId);
  await openTemplate(page, templateContainerId);
  await page.getByRole("button", { name: "Return to entry graph" }).click();
  await removeInitialEntryResultGraph(page);
  await addCapturedSuccCall(page);

  await openTemplate(page, templateContainerId);
  await page.getByRole("button", { name: "Edit signature" }).click();
  await page.getByLabel("Remove parameter 1").click();
  await expect(page.getByRole("button", { name: "Apply signature" })).toBeEnabled();
  await page.getByRole("button", { name: "Apply signature" }).click();
  await expect(page.getByRole("alert")).toContainText(
    'Disconnect 3 connection(s) before removing "ignored".',
  );
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Return to entry graph" }).click();
  await runAndExpectNat3(page);

  await openTemplate(page, templateContainerId);
  await page.getByRole("button", { name: "Edit signature" }).click();
  await page.getByLabel("Function name").fill("");
  await expect(page.getByText("Function name is required")).toBeVisible();
  await expect(page.getByRole("button", { name: "Apply signature" })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(
    page.getByText(/capturedSucc\(ignored: "nat", value: "nat"\)/),
  ).toBeVisible();

  await expectNoBrowserIssues(issues);
});
