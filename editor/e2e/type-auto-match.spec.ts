import { readFileSync } from "node:fs";
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

function element(page: Page, id: string) {
  return page.locator(`g.element-node[data-node-id="${id}"]`);
}

function port(page: Page, id: string, name: string, direction: string) {
  return page.locator(
    `circle[role="button"][data-node-id="${id}"][data-port-name="${name}"][data-port-direction="${direction}"]`,
  );
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

async function setSelectedItemType(page: Page, type: string) {
  await page.getByLabel("Item type").selectOption(type);
}

async function dragPort(page: Page, source: Locator, target: Locator) {
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  expect(sourceBox).toBeTruthy();
  expect(targetBox).toBeTruthy();
  await page.mouse.move(
    sourceBox!.x + sourceBox!.width / 2,
    sourceBox!.y + sourceBox!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    targetBox!.x + targetBox!.width / 2,
    targetBox!.y + targetBox!.height / 2,
    { steps: 8 },
  );
  await page.mouse.up();
}

async function exportProject(page: Page) {
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).toBeTruthy();
  return { path: path!, json: JSON.parse(readFileSync(path!, "utf8")) };
}

async function connectWithAutoMatch(
  page: Page,
  source: Locator,
  target: Locator,
  expectedChange: RegExp,
) {
  await dragPort(page, source, target);
  const dialog = page.getByRole("dialog", { name: "Change type and connect?" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(expectedChange);
  await expect(dialog).toContainText("Affected existing wires");
  await page.getByRole("button", { name: "Change and connect" }).click();
  await expect(dialog).toHaveCount(0);
}

test("confirmed type auto-match updates Cons item type and connects atomically", async ({
  page,
}) => {
  const issues = watchBrowserIssues(page);
  await page.goto("/");

  const natId = await addNodeAndGetId(page, "Add Nat", "nat_literal");
  const consId = await addNodeAndGetId(page, "Add Cons", "cons");
  await setElementPosition(page, natId, 140, 120);
  await setElementPosition(page, consId, 360, 110);
  await element(page, consId).focus();
  await page.keyboard.press("Enter");
  await setSelectedItemType(page, "bool");
  await expect(element(page, consId)).toContainText("Cons<Bool>");

  const wireSelector = `polyline[data-source-node-id="${natId}"][data-target-node-id="${consId}"][data-target-port-name="head"]`;
  await connectWithAutoMatch(
    page,
    port(page, natId, "value", "output"),
    port(page, consId, "head", "input"),
    /Bool.*Nat/,
  );
  await expect(page.locator(wireSelector)).toHaveCount(1);
  await expect(element(page, consId)).toContainText("Cons<Nat>");
  await expect(port(page, consId, "tail", "input")).toHaveAccessibleName(
    /input port tail \(List<Nat>\)/,
  );
  await expect(port(page, consId, "value", "output")).toHaveAccessibleName(
    /output port value \(List<Nat>\)/,
  );

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.locator(wireSelector)).toHaveCount(0);
  await expect(element(page, consId)).toContainText("Cons<Bool>");
  await page.getByRole("button", { name: "Redo" }).click();
  await expect(page.locator(wireSelector)).toHaveCount(1);
  await expect(element(page, consId)).toContainText("Cons<Nat>");

  const exported = await exportProject(page);
  expect(
    exported.json.geometry.elements.find((node: { id: string }) => node.id === consId)
      .properties.itemType,
  ).toBe("nat");

  await page.reload();
  await page.getByLabel("Open JSON file").setInputFiles(exported.path);
  await expect(page.locator(wireSelector)).toHaveCount(1);
  await expect(element(page, consId)).toContainText("Cons<Nat>");

  await expectNoBrowserIssues(issues);
});

test("cancelled auto-match leaves type and wires unchanged", async ({ page }) => {
  const issues = watchBrowserIssues(page);
  await page.goto("/");

  const natId = await addNodeAndGetId(page, "Add Nat", "nat_literal");
  const consId = await addNodeAndGetId(page, "Add Cons", "cons");
  await setElementPosition(page, natId, 140, 120);
  await setElementPosition(page, consId, 360, 110);
  await element(page, consId).focus();
  await page.keyboard.press("Enter");
  await setSelectedItemType(page, "bool");

  const wireSelector = `polyline[data-source-node-id="${natId}"][data-target-node-id="${consId}"][data-target-port-name="head"]`;
  await dragPort(
    page,
    port(page, natId, "value", "output"),
    port(page, consId, "head", "input"),
  );
  const dialog = page.getByRole("dialog", { name: "Change type and connect?" });
  await expect(dialog).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(wireSelector)).toHaveCount(0);
  await expect(element(page, consId)).toContainText("Cons<Bool>");

  await dragPort(
    page,
    port(page, natId, "value", "output"),
    port(page, consId, "head", "input"),
  );
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(wireSelector)).toHaveCount(0);
  await expect(element(page, consId)).toContainText("Cons<Bool>");

  await expectNoBrowserIssues(issues);
});

test("fixed primitive mismatch keeps the existing incompatible feedback", async ({
  page,
}) => {
  const issues = watchBrowserIssues(page);
  await page.goto("/");

  const boolId = await addNodeAndGetId(page, "Add Bool", "bool_literal");
  const succId = await addNodeAndGetId(page, "Add Succ", "succ");
  await setElementPosition(page, boolId, 140, 120);
  await setElementPosition(page, succId, 360, 110);

  await dragPort(
    page,
    port(page, boolId, "value", "output"),
    port(page, succId, "input", "input"),
  );
  await expect(
    page.getByRole("dialog", { name: "Change type and connect?" }),
  ).toHaveCount(0);
  await expect(page.getByText(/Type mismatch: Bool.*Nat/)).toBeVisible();
  await expect(
    page.locator(
      `polyline[data-source-node-id="${boolId}"][data-target-node-id="${succId}"]`,
    ),
  ).toHaveCount(0);

  await expectNoBrowserIssues(issues);
});

test("auto-match updates ListRec item type and derived step port type", async ({
  page,
}) => {
  const issues = watchBrowserIssues(page);
  await page.goto("/");

  const nilId = await addNodeAndGetId(page, "Add Nil", "nil");
  const listRecId = await addNodeAndGetId(page, "Add ListRec", "list_rec");
  await setElementPosition(page, nilId, 140, 120);
  await setElementPosition(page, listRecId, 380, 100);
  await element(page, listRecId).focus();
  await page.keyboard.press("Enter");
  await setSelectedItemType(page, "bool");
  await expect(element(page, listRecId)).toContainText("ListRec<Bool, Nat>");

  await connectWithAutoMatch(
    page,
    port(page, nilId, "value", "output"),
    port(page, listRecId, "list", "input"),
    /Bool.*Nat/,
  );
  await expect(element(page, listRecId)).toContainText("ListRec<Nat, Nat>");
  await expect(port(page, listRecId, "step", "input")).toHaveAccessibleName(
    /Nat × List<Nat> × Nat -> Nat/,
  );

  await expectNoBrowserIssues(issues);
});
