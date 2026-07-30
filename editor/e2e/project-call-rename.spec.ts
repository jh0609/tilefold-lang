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

test("renames existing folded project Call nodes immediately", async ({
  page,
}, testInfo) => {
  const issues = watchBrowserIssues(page);
  await page.goto("/");

  await page.getByRole("button", { name: "Add Function" }).click();
  await page.getByLabel("Function name").fill("foo");
  await page.getByRole("button", { name: "Add argument" }).click();
  await page.getByLabel("Argument 1 name").fill("left");
  await page.getByLabel("Argument 1 type").selectOption("nat");
  await page.getByLabel("Argument 2 name").fill("right");
  await page.getByLabel("Argument 2 type").selectOption("nat");
  await page.getByLabel("Result type").selectOption("nat");
  await page.getByRole("button", { name: "Create total function" }).click();
  await expect(page.getByText(/Created foo/)).toBeVisible();

  await page.getByRole("button", { name: "Return to entry graph" }).click();
  await page.getByRole("button", { name: "Add Call" }).click();
  await expect(page.getByText("1. left: Nat")).toBeVisible();
  await expect(page.getByText("2. right: Nat")).toBeVisible();
  await page.getByRole("button", { name: "Create call" }).click();
  await expect(page.getByRole("button", { name: "Function call foo" })).toBeVisible();

  const call = page.getByRole("button", { name: "Function call foo" });
  await call.focus();
  await page.keyboard.press("Enter");
  const inspector = page.getByRole("complementary", { name: "Inspector" });
  await expect(
    inspector.locator("code").filter({ hasText: /^foo$/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Open function foo" }).click();
  await page.getByRole("button", { name: "Edit signature" }).click();
  await page.getByLabel("Function name").fill("bar");
  await page.getByRole("button", { name: "Apply signature" }).click();
  await page.getByRole("button", { name: "Return to entry graph" }).click();

  await expect(page.getByRole("button", { name: "Function call bar" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Function call foo" })).toHaveCount(0);

  await page.getByTitle("Undo Edit signature for foo").click();
  await expect(page.getByRole("button", { name: "Function call foo" })).toBeVisible();
  await page.getByTitle("Redo Edit signature for foo").click();
  await expect(page.getByRole("button", { name: "Function call bar" })).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  const download = await downloadPromise;
  const path = testInfo.outputPath("project-call-rename.tilefold.json");
  await download.saveAs(path);
  const exported = JSON.parse(readFileSync(path, "utf8"));
  expect(exported.surfaceFunctions[0]).toMatchObject({
    name: "bar",
    templateId: "foo",
  });
  const exportedCall = exported.geometry.elements.find(
    (element: { kind: string }) => element.kind === "project_call",
  );
  expect(exportedCall.properties).toEqual({ templateId: "foo" });

  await page.reload();
  await page.getByLabel("Open JSON file").setInputFiles(path);
  await expect(page.getByRole("button", { name: "Function call bar" })).toBeVisible();
  await expectNoBrowserIssues(issues);
});
