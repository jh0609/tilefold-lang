import { expect, test, type Page } from "@playwright/test";

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

async function openAddition(page: Page) {
  await page.getByLabel("Example project").selectOption("addition");
  await page.getByRole("button", { name: "Open example" }).click();
  await expect(page.getByText("addition.tilefold.json")).toBeVisible();
  await expect(page.getByTestId("element-addition_natrec")).toBeVisible();
}

function parseRewriteCount(text: string): number {
  const match = text.match(/(\d+) rewrites/);
  if (!match) throw new Error(`Unable to read rewrite count from ${text}`);
  return Number(match[1]);
}

async function visibleTraceIndexes(page: Page): Promise<number[]> {
  const labels = await page.locator(".trace-event-button code").allTextContents();
  return labels.map((label) => Number(label.replace("#", "")));
}

test("manual Step Run advances and continues the Addition example", async ({
  page,
}) => {
  const issues = watchBrowserIssues(page);
  await page.goto("/");
  await openAddition(page);
  await page.getByLabel("Execution mode").selectOption("transparent");

  await page.getByRole("button", { name: "Start stepping" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Step Run paused · 0 rewrites",
  );

  await page.getByRole("button", { name: "Next Rewrite" }).click();
  await expect(page.locator(".trace-event-button")).toHaveCount(1);
  await expect(page.getByText("Event 1 of 1")).toBeVisible();
  await expect(page.getByText("Source element not present")).toBeVisible();

  await page.getByRole("button", { name: "Next Rewrite" }).click();
  await expect(page.locator(".trace-event-button")).toHaveCount(2);
  expect(await visibleTraceIndexes(page)).toEqual([0, 1]);

  for (let expectedCount = 3; expectedCount <= 10; expectedCount += 1) {
    if ((await page.locator('[data-testid^="trace-highlight-"]').count()) > 0) {
      break;
    }
    await page.getByRole("button", { name: "Next Rewrite" }).click();
    await expect(page.locator(".trace-event-button")).toHaveCount(expectedCount);
  }
  await expect(page.locator('[data-testid^="trace-highlight-"]')).toHaveCount(1);

  await page.getByRole("button", { name: "Continue", exact: true }).click();
  const stepResult = page.getByText(/Trace Run .* Result:/);
  await expect(stepResult).toContainText("Result: Nat(5)");
  const stepRewriteCount = parseRewriteCount(await stepResult.textContent() ?? "");
  const stepIndexes = await visibleTraceIndexes(page);
  expect(stepIndexes).toEqual(
    Array.from({ length: stepRewriteCount }, (_value, index) => index),
  );

  await page.getByRole("button", { name: "Run", exact: true }).click();
  const traceResult = page.getByText(/Trace Run .* Result:/);
  await expect(traceResult).toContainText("Result: Nat(5)");
  expect(parseRewriteCount(await traceResult.textContent() ?? "")).toBe(
    stepRewriteCount,
  );

  await page.getByLabel("Execution mode").selectOption("fast");
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(page.getByText(/Fast Run .* Result:/)).toContainText("Nat(5)");

  await page.getByLabel("Execution mode").selectOption("transparent");
  await page.getByRole("button", { name: "Start stepping" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Step Run paused · 0 rewrites",
  );
  await page.getByRole("button", { name: "Stop" }).click();
  await expect(page.getByRole("status")).toHaveText("Step Run stopped.");
  await expect(page.getByText(/Step Run paused/)).toHaveCount(0);

  await page.getByRole("button", { name: "Start stepping" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Step Run paused · 0 rewrites",
  );
  await page.getByRole("button", { name: "Add Nat", exact: true }).click();
  await expect(page.getByText(/Step Run paused/)).toHaveCount(0);
  await expect(page.getByText("1 undo · 0 redo")).toBeVisible();

  await expectNoBrowserIssues(issues);
});
