import { expect, test, type Page } from "@playwright/test";

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

function element(page: Page, id: string) {
  return page.locator(`g.element-node[data-node-id="${id}"]`);
}

async function setElementPosition(page: Page, id: string, x: number, y: number) {
  await element(page, id).focus();
  await page.keyboard.press("Enter");
  await page.locator("#inspector-x").fill(String(x));
  await page.locator("#inspector-x").blur();
  await page.locator("#inspector-y").fill(String(y));
  await page.locator("#inspector-y").blur();
}

function port(page: Page, id: string, name: string, direction: string) {
  return page.locator(
    `circle[role="button"][data-node-id="${id}"][data-port-name="${name}"][data-port-direction="${direction}"]`,
  );
}

test("shows Rec accumulator/result type in titles, ports, and Inspector", async ({
  page,
}) => {
  const issues = watchBrowserIssues(page);
  await page.goto("/");

  const natRecId = await addNodeAndGetId(page, "Add NatRec", "nat_rec");
  await setElementPosition(page, natRecId, 560, 110);

  await expect(element(page, natRecId)).toContainText("NatRec<Nat>");
  await element(page, natRecId).focus();
  await page.keyboard.press("Enter");
  await page.getByLabel("Accumulator / result type").selectOption("bool");
  await expect(element(page, natRecId)).toContainText("NatRec<Bool>");
  await expect(
    port(page, natRecId, "base", "input"),
  ).toHaveAccessibleName(/input port base \(Bool\)/);

  await expect(page.getByLabel("Accumulator / result type")).toHaveValue("bool");
  await expect(
    page.getByText(/The type accumulated during iteration/),
  ).toBeVisible();

  const boolRecId = await addNodeAndGetId(page, "Add BoolRec", "bool_rec");
  await setElementPosition(page, boolRecId, 560, 260);
  await element(page, boolRecId).focus();
  await page.keyboard.press("Enter");
  await page.getByLabel("Accumulator / result type").selectOption("bool");
  await expect(element(page, boolRecId)).toContainText("BoolRec<Bool>");
  await expect(page.getByText(/both branches and returned/)).toBeVisible();

  await expectNoBrowserIssues(issues);
});
