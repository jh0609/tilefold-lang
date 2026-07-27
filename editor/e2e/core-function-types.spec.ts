import { expect, test, type Page } from "@playwright/test";
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

async function setTypeToNatArrowNat(page: Page, label: string) {
  await page.getByLabel(label).selectOption("function");
  await expect(page.getByLabel(`${label} input`)).toHaveValue("nat");
  await expect(page.getByLabel(`${label} output`)).toHaveValue("nat");
  await expect(page.getByText("Nat -> Nat").first()).toBeVisible();
}

test("authors and round-trips a function type parameter through the UI", async ({
  page,
}, testInfo) => {
  const issues = watchBrowserIssues(page);
  await page.goto("/");

  await page.getByRole("button", { name: "Add Function" }).click();
  await page.getByLabel("Function name").fill("takesFunction");
  await page.getByLabel("Argument 1 name").fill("f");
  await setTypeToNatArrowNat(page, "Argument 1 type");
  await page.getByLabel("Result name").fill("result");
  await page.getByLabel("Result type").selectOption("nat");
  await page.getByRole("button", { name: "Create total function" }).click();

  await expect(page.getByText(/takesFunction\(f: Nat -> Nat\)/)).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  const download = await downloadPromise;
  const savedPath = testInfo.outputPath("takesFunction.tilefold.json");
  await download.saveAs(savedPath);
  const savedJson = readFileSync(savedPath, "utf8");
  expect(savedJson).toContain('"arrow"');
  expect(savedJson).not.toContain("sourceDiagnostics");

  await page.reload();
  await page.getByLabel("Open JSON file").setInputFiles(savedPath);
  await expect(page.getByText("takesFunction.tilefold.json")).toBeVisible();
  await page
    .locator('[data-container-kind="template"][data-template-id="takesFunction"]')
    .focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText(/takesFunction\(f: Nat -> Nat\)/)).toBeVisible();
  await expectNoBrowserIssues(issues);
});

test("leaves function-typed Call arguments explicit and source-maps the diagnostic", async ({
  page,
}) => {
  const issues = watchBrowserIssues(page);
  await page.goto("/");

  await page.getByRole("button", { name: "Add Function" }).click();
  await page.getByLabel("Function name").fill("needsFunction");
  await page.getByLabel("Argument 1 name").fill("f");
  await setTypeToNatArrowNat(page, "Argument 1 type");
  await page.getByRole("button", { name: "Add argument" }).click();
  await page.getByLabel("Argument 2 name").fill("value");
  await page.getByLabel("Argument 2 type").selectOption("nat");
  await page.getByLabel("Result type").selectOption("nat");
  await page.getByRole("button", { name: "Create total function" }).click();
  await page.getByRole("button", { name: "Return to entry graph" }).click();

  await page.getByRole("button", { name: "Add Call" }).click();
  await expect(page.getByText("1. f: Nat -> Nat")).toBeVisible();
  await expect(page.getByText("2. value: Nat")).toBeVisible();
  await page.getByRole("button", { name: "Create call" }).click();
  await expect(
    page.locator('polyline[data-target-node-kind="function"][data-target-port-name="f"]'),
  ).toHaveCount(0);

  await page.getByRole("button", { name: "Run" }).click();
  const diagnostic = page.getByRole("button", {
    name: /Call "needsFunction" is missing a value for argument "f"/,
  });
  await expect(diagnostic).toBeVisible();
  await diagnostic.click();
  await expect(
    page.locator('g.element-node.selected[data-node-kind="function"]'),
  ).toBeVisible();
  await expectNoBrowserIssues(issues);
});
