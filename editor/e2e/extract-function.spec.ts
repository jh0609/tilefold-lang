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

function element(page: Page, id: string) {
  return page.locator(`[data-node-id="${id}"].element-node`);
}

function port(page: Page, id: string, name: string, direction: string) {
  return page.locator(
    `[data-node-id="${id}"][data-port-name="${name}"][data-port-direction="${direction}"]`,
  );
}

function boundaryPort(
  page: Page,
  containerId: string,
  boundaryId: string,
  direction: string,
) {
  return page.locator(
    `[data-port-kind="boundary"][data-container-id="${containerId}"][data-boundary-id="${boundaryId}"][data-port-direction="${direction}"]`,
  );
}

async function center(locator: Locator) {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  return { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
}

async function dragTo(page: Page, source: Locator, target: Locator) {
  const from = await center(source);
  const to = await center(target);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 16 });
  await page.mouse.up();
}

async function dragBy(page: Page, locator: Locator, dx: number, dy: number) {
  const from = await center(locator);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 12 });
  await page.mouse.up();
}

async function setSelectedBounds(page: Page, x: string, y: string) {
  await page.locator("#inspector-x").fill(x);
  await page.locator("#inspector-x").blur();
  await page.locator("#inspector-y").fill(y);
  await page.locator("#inspector-y").blur();
}

async function selectElement(page: Page, id: string) {
  await element(page, id).focus();
  await page.keyboard.press("Enter");
}

function selectedElementsHeading(page: Page) {
  return page.locator(".inspector-heading h2", { hasText: "2 elements" });
}

async function addElementToSelection(page: Page, id: string) {
  await page.keyboard.down("Shift");
  await element(page, id).click();
  await page.keyboard.up("Shift");
}

async function runMode(page: Page, mode: "transparent" | "fast", expected: string) {
  await page.getByLabel("Execution mode").selectOption(mode);
  await page.getByRole("button", { name: "Run" }).click();
  await expect(page.getByText(/Result:/)).toContainText(expected);
}

async function addSecondSuccChain(page: Page) {
  await page.getByRole("button", { name: "Add Succ" }).click();
  const secondSucc = page.locator('g.element-node.selected[data-node-kind="succ"]');
  await expect(secondSucc).toBeVisible();
  const secondSuccId = await secondSucc.getAttribute("data-node-id");
  expect(secondSuccId).toBe("node_succ_1");
  await setSelectedBounds(page, "140", "50");

  await page.getByTestId("wire-wire_result").focus();
  await page.keyboard.press("Enter");
  await dragTo(
    page,
    page.getByTestId("wire-wire_result-target-handle"),
    port(page, secondSuccId!, "input", "input"),
  );
  await expect(page.getByTestId("wire-wire_result")).toHaveAttribute(
    "data-target-node-id",
    secondSuccId!,
  );
  await dragTo(
    page,
    port(page, secondSuccId!, "result", "output"),
    boundaryPort(page, "entry", "entry_result", "input"),
  );
  await runMode(page, "fast", "Nat(4)");
  return secondSuccId!;
}

test("extracts a real multi-element Succ chain and preserves execution, history, and persistence", async ({
  page,
}, testInfo) => {
  const issues = watchBrowserIssues(page);
  await page.goto("/");
  const secondSuccId = await addSecondSuccChain(page);

  await selectElement(page, "node_succ");
  await addElementToSelection(page, secondSuccId);
  await expect(selectedElementsHeading(page)).toBeVisible();

  const chainWire = page.locator(
    `polyline[data-source-node-id="node_succ"][data-target-node-id="${secondSuccId}"]`,
  );
  const beforeDragPoints = await chainWire.getAttribute("data-semantic-points");
  await dragBy(page, element(page, secondSuccId), 10, 8);
  await expect(chainWire).not.toHaveAttribute(
    "data-semantic-points",
    beforeDragPoints ?? "",
  );

  await page.getByLabel("Function name").fill("double_succ");
  await expect(page.getByText("input: Nat")).toBeVisible();
  await expect(page.locator(".signature-preview")).toContainText("-> Nat");
  await page.getByRole("button", { name: "Extract function" }).click();
  await expect(page.getByText("Extracted double_succ.")).toBeVisible();
  const call = page.locator(
    'g.element-node[data-node-kind="project_call"][data-template-id="double_succ"]',
  );
  await expect(call).toHaveCount(1);
  const callId = await call.getAttribute("data-node-id");
  expect(callId).not.toBeNull();
  await expect(page.locator(`polyline[data-target-node-id="${callId}"]`)).toHaveCount(1);
  await expect(page.locator(`polyline[data-source-node-id="${callId}"]`)).toHaveCount(1);

  await page.getByRole("button", { name: "Open function double_succ" }).click();
  await expect(page.getByText("function double_succ")).toBeVisible();
  await expect(element(page, "node_succ")).toBeVisible();
  await expect(element(page, secondSuccId)).toBeVisible();
  await expect(page.getByText("input: Nat")).toBeVisible();
  await expect(page.getByText("result: Nat")).toBeVisible();

  await page.getByRole("button", { name: "Return to entry graph" }).click();
  await runMode(page, "transparent", "Nat(4)");
  await runMode(page, "fast", "Nat(4)");
  await expect(page.getByText(/No rewrite events/)).toBeVisible();

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(call).toHaveCount(0);
  await expect(element(page, "node_succ")).toBeVisible();
  await expect(element(page, secondSuccId)).toBeVisible();
  await runMode(page, "fast", "Nat(4)");

  await page.getByRole("button", { name: "Redo" }).click();
  await expect(call).toHaveCount(1);
  await runMode(page, "fast", "Nat(4)");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  const download = await downloadPromise;
  const savedPath = testInfo.outputPath("extract-function.tilefold.json");
  await download.saveAs(savedPath);
  await page.reload();
  await page.getByLabel("Open JSON file").setInputFiles(savedPath);
  await expect(call).toHaveCount(1);
  await runMode(page, "fast", "Nat(4)");

  await page.locator('g.container-shape[data-container-id="entry"]').focus();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Auto Layout entry" }).click();
  await runMode(page, "fast", "Nat(4)");

  await expectNoBrowserIssues(issues);
});

test("refuses an ineligible disconnected extraction without changing execution or history", async ({
  page,
}) => {
  const issues = watchBrowserIssues(page);
  await page.goto("/");
  await runMode(page, "fast", "Nat(3)");

  await selectElement(page, "drop_unit");
  await expect(page.getByRole("heading", { name: "drop_unit" })).toBeVisible();
  await addElementToSelection(page, "node_succ");
  await expect(selectedElementsHeading(page)).toBeVisible();
  await expect(page.getByText("Extract function requires one connected selected subgraph."))
    .toBeVisible();
  await expect(page.getByRole("button", { name: "Extract function" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();

  await runMode(page, "fast", "Nat(3)");
  await expect(page.getByTestId("element-node_project_call_1")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();
  await expectNoBrowserIssues(issues);
});
