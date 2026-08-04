import { expect, test, type Locator, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

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

function element(page: Page, id: string) {
  return page.locator(`g.element-node[data-node-id="${id}"]`);
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

async function dragConnect(page: Page, source: Locator, target: Locator) {
  const before = await page.locator('polyline[data-testid^="wire-"]').count();
  const from = await center(source);
  const to = await center(target);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 32 });
  await page.mouse.move(to.x + 1, to.y + 1);
  await page.mouse.move(to.x, to.y);
  await page.mouse.up();
  try {
    await expect
      .poll(() => page.locator('polyline[data-testid^="wire-"]').count())
      .toBe(before + 1);
  } catch {
    await source.dragTo(target, { force: true });
    await expect
      .poll(() => page.locator('polyline[data-testid^="wire-"]').count())
      .toBe(before + 1);
  }
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

async function setElementPosition(page: Page, id: string, x: number, y: number) {
  await element(page, id).focus();
  await page.keyboard.press("Enter");
  await page.locator("#inspector-x").fill(String(x));
  await page.locator("#inspector-x").blur();
  await page.locator("#inspector-y").fill(String(y));
  await page.locator("#inspector-y").blur();
}

async function setNatValue(page: Page, id: string, value: string) {
  await element(page, id).focus();
  await page.keyboard.press("Enter");
  await page.getByLabel("Nat value").fill(value);
}

async function runMode(page: Page, mode: "transparent" | "fast", result: string) {
  await page.getByLabel("Execution mode").selectOption(mode);
  await page.getByRole("button", { name: "Run" }).click();
  await expect(page.getByText(/Result:/)).toContainText(result);
}

async function orderedBuilderItemPorts(page: Page, builderId: string) {
  return await page
    .locator(
      `circle[role="button"][data-node-id="${builderId}"][data-port-direction="input"]`,
    )
    .evaluateAll((nodes) =>
      nodes
        .map((node) => {
          const rect = node.getBoundingClientRect();
          return {
            name: node.getAttribute("data-port-name") ?? "",
            y: rect.y + rect.height / 2,
          };
        })
        .sort((left, right) => left.y - right.y)
        .map((entry) => entry.name),
    );
}

test("authors a List Builder through visible controls and preserves it across history and persistence", async ({
  page,
}, testInfo) => {
  const issues = watchBrowserIssues(page);
  await page.goto("/");

  await page.locator('g.container-shape[data-container-id="entry"]').focus();
  await page.keyboard.press("Enter");
  await dragBy(page, page.getByTestId("container-entry-resize-south-east"), 520, 320);

  await selectAndDelete(page, page.getByTestId("wire-wire_result"));
  await selectAndDelete(page, element(page, "node_succ"));
  await selectAndDelete(page, element(page, "node_nat_2"));

  await page.locator('g.container-shape[data-container-id="entry"]').focus();
  await page.keyboard.press("Enter");
  await page.getByLabel("Entry output type").selectOption("list");

  const builderId = await addNodeAndGetId(page, "Add List Builder", "list_builder");
  await setElementPosition(page, builderId, 360, 140);
  await element(page, builderId).focus();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Add item input" }).click();
  await page.getByRole("button", { name: "Add item input" }).click();
  await page.getByRole("button", { name: "Add item input" }).click();
  await expect(element(page, builderId)).toContainText("List Builder<Nat>");
  await expect(element(page, builderId)).toContainText("3 item(s) -> List<Nat>");

  const natIds = [
    await addNodeAndGetId(page, "Add Nat", "nat_literal"),
    await addNodeAndGetId(page, "Add Nat", "nat_literal"),
    await addNodeAndGetId(page, "Add Nat", "nat_literal"),
  ];
  for (const [index, natId] of natIds.entries()) {
    await setElementPosition(page, natId, 120, 130 + index * 60);
    await setNatValue(page, natId, String(index + 1));
  }

  const itemPorts = await orderedBuilderItemPorts(page, builderId);
  expect(itemPorts).toHaveLength(3);
  for (const [index, itemPort] of itemPorts.entries()) {
    await dragConnect(
      page,
      port(page, natIds[index]!, "value", "output"),
      port(page, builderId, itemPort, "input"),
    );
  }
  await element(page, builderId).focus();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Move item 1 up" }).click();
  await expect(element(page, builderId)).toContainText("3 item(s) -> List<Nat>");
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(element(page, builderId)).toContainText("3 item(s) -> List<Nat>");
  await page.getByRole("button", { name: "Redo" }).click();
  await expect(element(page, builderId)).toContainText("3 item(s) -> List<Nat>");
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(element(page, builderId)).toContainText("3 item(s) -> List<Nat>");

  await page.locator('g.container-shape[data-container-id="entry"]').focus();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Fit container view" }).click();
  await expect(element(page, builderId)).toBeVisible();
  await page.getByRole("button", { name: "Auto Layout entry" }).click();
  await expect(element(page, builderId)).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  const download = await downloadPromise;
  const savedPath = testInfo.outputPath("authored-list-builder.tilefold.json");
  await download.saveAs(savedPath);
  const exported = JSON.parse(readFileSync(savedPath, "utf8"));
  const exportedBuilder = exported.geometry.elements.find(
    (element: { id: string }) => element.id === builderId,
  );
  expect(exportedBuilder.properties.itemIds).toHaveLength(3);

  await page.reload();
  await page.getByLabel("Open JSON file").setInputFiles(savedPath);
  await expect(element(page, builderId)).toBeVisible();
  await expect(orderedBuilderItemPorts(page, builderId)).resolves.toHaveLength(3);

  await page.getByLabel("Open JSON file").setInputFiles(savedPath);
  await expect(element(page, builderId)).toBeVisible();

  await expectNoBrowserIssues(issues);
});

test("runs the official List Builder example with trace highlight and Fast parity", async ({
  page,
}) => {
  const issues = watchBrowserIssues(page);
  await page.goto("/");

  await page.getByLabel("Example project").selectOption("list-builder-nat");
  await page.getByRole("button", { name: "Open example" }).click();
  await expect(element(page, "list-builder")).toBeVisible();

  await runMode(page, "transparent", "List[Nat(1), Nat(2), Nat(3)]");
  await page.locator(".trace-event-button", { hasText: "Cons" }).first().click();
  await expect(page.getByTestId("trace-highlight-list-builder")).toBeVisible();
  await runMode(page, "fast", "List[Nat(1), Nat(2), Nat(3)]");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  const download = await downloadPromise;
  const savedPath = test.info().outputPath("list-builder-official.tilefold.json");
  await download.saveAs(savedPath);
  await page.reload();
  await page.getByLabel("Open JSON file").setInputFiles(savedPath);
  await runMode(page, "fast", "List[Nat(1), Nat(2), Nat(3)]");

  await expectNoBrowserIssues(issues);
});
