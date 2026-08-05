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
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 16 });
  await page.mouse.up();
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

async function createChooseRight(page: Page) {
  await page.getByRole("button", { name: "Add Function" }).click();
  await page.getByLabel("Function name").fill("chooseRight");
  await page.getByLabel("Argument 1 name").fill("left");
  await page.getByLabel("Argument 1 type").selectOption("nat");
  await page.getByRole("button", { name: "Add argument" }).click();
  await page.getByLabel("Argument 2 name").fill("right");
  await page.getByLabel("Argument 2 type").selectOption("nat");
  await page.getByLabel("Result name").fill("result");
  await page.getByLabel("Result type").selectOption("nat");
  await page.getByRole("button", { name: "Create total function" }).click();
  await expect(page.getByText(/Created chooseRight/)).toBeVisible();
}

async function deleteFunctionReference(page: Page, templateId: string) {
  const functionNode = page
    .locator(`g.element-node[data-node-kind="function"][data-template-id="${templateId}"]`)
    .first();
  await expect(functionNode).toBeVisible();
  const functionId = await functionNode.getAttribute("data-node-id");
  expect(functionId).not.toBeNull();
  const outputDropWire = page
    .locator(
      `polyline[data-source-node-id="${functionId}"][data-source-port-name="value"][data-target-node-kind="drop"]`,
    )
    .first();
  if ((await outputDropWire.count()) > 0) {
    const dropId = await outputDropWire.getAttribute("data-target-node-id");
    if (dropId) await selectAndDelete(page, page.locator(`g.element-node[data-node-id="${dropId}"]`));
  }
  await selectAndDelete(page, functionNode);
}

async function addProjectCall(page: Page, templateId: string) {
  await page.getByRole("button", { name: "Add Call" }).click();
  await page.getByLabel("Template to call").selectOption(templateId);
  await page.getByRole("button", { name: "Create call" }).click();
  const call = page.locator(
    `g.element-node[data-node-kind="project_call"][data-template-id="${templateId}"]`,
  );
  await expect(call).toBeVisible();
  const id = await call.getAttribute("data-node-id");
  expect(id).not.toBeNull();
  return id!;
}

async function addStandardCall(page: Page, name: string, templateId: string) {
  await page.getByRole("button", { name: `Add Standard Library ${name}` }).click();
  const call = page.locator(
    `g.element-node[data-node-kind="library_call"][data-template-id="${templateId}"]`,
  );
  await expect(call).toBeVisible();
  const id = await call.getAttribute("data-node-id");
  expect(id).not.toBeNull();
  return id!;
}

async function removeInitialEntryResultGraph(page: Page) {
  await selectAndDelete(page, page.getByTestId("wire-wire_result"));
  await selectAndDelete(page, page.locator('g.element-node[data-node-id="node_succ"]'));
  await selectAndDelete(page, page.locator('g.element-node[data-node-id="node_nat_2"]'));
}

async function deleteCallAndDefaultArguments(page: Page, callId: string) {
  const argumentSourceIds = await page
    .locator(`polyline[data-target-node-id="${callId}"][data-target-port-name^="arg_"]`)
    .evaluateAll((wires) =>
      wires
        .map((wire) => wire.getAttribute("data-source-node-id"))
        .filter((id): id is string => Boolean(id)),
    );
  await selectAndDelete(
    page,
    page.locator(`g.element-node[data-node-id="${callId}"]`),
  );
  for (const sourceId of argumentSourceIds) {
    await selectAndDelete(
      page,
      page.locator(`g.element-node[data-node-id="${sourceId}"]`),
    );
  }
}

async function expectUnconsumedDiagnostic(page: Page, name: string) {
  await page.getByRole("button", { name: "Run" }).click();
  const diagnostic = page.getByRole("button", {
    name: new RegExp(`Call "${name}" result is not connected`),
  });
  await expect(diagnostic).toBeVisible();
  await expect(diagnostic).toContainText("surface.unconsumed-call-result");
  await expect(diagnostic).toContainText("explicitly added Drop");
  await diagnostic.click();
}

async function expectNoResultDrop(page: Page, callId: string) {
  await expect(
    page.locator(
      `polyline[data-source-node-id="${callId}"][data-source-port-name="result"][data-target-node-kind="drop"]`,
    ),
  ).toHaveCount(0);
  await expect(
    page.locator(`polyline[data-source-node-id="${callId}"][data-source-port-name="result"]`),
  ).toHaveCount(0);
}

async function runTransparentAndFast(page: Page, expected: string) {
  await page.getByLabel("Execution mode").selectOption("transparent");
  await page.getByRole("button", { name: "Run" }).click();
  await expect(page.getByText(/Result:/)).toContainText(expected);
  await page.getByLabel("Execution mode").selectOption("fast");
  await page.getByRole("button", { name: "Run" }).click();
  await expect(page.getByText(/Result:/)).toContainText(expected);
  await expect(page.getByRole("region", { name: /Diagnostics/ })).toHaveCount(0);
}

test("authors project and Standard Library call results without starter Drops", async ({
  page,
}, testInfo) => {
  const issues = watchBrowserIssues(page);
  await page.goto("/");
  await createChooseRight(page);
  await deleteFunctionReference(page, "chooseRight");
  await removeInitialEntryResultGraph(page);

  const projectCallId = await addProjectCall(page, "chooseRight");
  await expectNoResultDrop(page, projectCallId);
  await expectUnconsumedDiagnostic(page, "chooseRight");
  await expect(page.locator(`g.element-node.selected[data-node-id="${projectCallId}"]`)).toBeVisible();

  await dragConnect(
    page,
    port(page, projectCallId, "result", "output"),
    boundaryPort(page, "entry", "result", "input"),
  );
  await expect(
    page.locator(
      `polyline[data-source-node-id="${projectCallId}"][data-source-port-name="result"][data-target-container-id="entry"][data-target-boundary-role="result"]`,
    ),
  ).toHaveCount(1);
  await runTransparentAndFast(page, "Nat(0)");

  await page.getByRole("button", { name: "Undo" }).click();
  await expectUnconsumedDiagnostic(page, "chooseRight");
  await page.getByRole("button", { name: "Redo" }).click();
  await runTransparentAndFast(page, "Nat(0)");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  const download = await downloadPromise;
  const savedPath = testInfo.outputPath("project-call-result-direct.tilefold.json");
  await download.saveAs(savedPath);
  const exported = JSON.parse(await readFile(savedPath, "utf8"));
  expect(
    exported.geometry.wires.some(
      (wire: { sourceHint?: { elementId?: string; port?: string }; targetHint?: { elementId?: string } }) =>
        wire.sourceHint?.elementId === projectCallId &&
        wire.sourceHint?.port === "result" &&
        exported.geometry.elements.some(
          (element: { id: string; kind: string }) =>
            element.id === wire.targetHint?.elementId && element.kind === "drop",
        ),
    ),
  ).toBe(false);

  await page.reload();
  await page.getByLabel("Open JSON file").setInputFiles(savedPath);
  await expect(page.getByText("project-call-result-direct.tilefold.json")).toBeVisible();
  await expect(
    page.locator(
      `polyline[data-source-node-id="${projectCallId}"][data-source-port-name="result"][data-target-container-id="entry"][data-target-boundary-role="result"]`,
    ),
  ).toHaveCount(1);
  await runTransparentAndFast(page, "Nat(0)");

  await selectAndDelete(
    page,
    page.locator(
      `polyline[data-source-node-id="${projectCallId}"][data-source-port-name="result"][data-target-container-id="entry"]`,
    ),
  );
  await deleteCallAndDefaultArguments(page, projectCallId);
  const standardCallId = await addStandardCall(
    page,
    "add",
    "tilefold.std.nat.add",
  );
  await expectNoResultDrop(page, standardCallId);
  await expectUnconsumedDiagnostic(page, "add");
  await dragConnect(
    page,
    port(page, standardCallId, "result", "output"),
    boundaryPort(page, "entry", "result", "input"),
  );
  await runTransparentAndFast(page, "Nat(0)");
  await expectNoBrowserIssues(issues);
});
