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

async function openListSum(page: Page) {
  await page.getByLabel("Example project").selectOption("list-sum-three");
  await page.getByRole("button", { name: "Open example" }).click();
  await expect(page.getByText("list-sum-three.tilefold.json")).toBeVisible();
  await expect(page.getByTestId("element-list-rec")).toBeVisible();
}

function parseRewriteCount(text: string): number {
  const match = text.match(/(\d+) rewrites/);
  if (!match) throw new Error(`Unable to read rewrite count from ${text}`);
  return Number(match[1]);
}

async function currentStepRewriteCount(page: Page): Promise<number> {
  const text = await page.getByRole("status").textContent();
  return parseRewriteCount(text ?? "");
}

async function selectedEventNumber(page: Page): Promise<number> {
  const text = await page.locator(".trace-event-position").textContent();
  const match = text?.match(/Event (\d+) of/);
  if (!match) throw new Error(`Unable to read selected event from ${text}`);
  return Number(match[1]);
}

async function matchCount(page: Page): Promise<{ matches: number; total: number }> {
  const text = await page.getByLabel("Trace filter match count").textContent();
  const match = text?.match(/(\d+) of (\d+) events/);
  if (!match) throw new Error(`Unable to parse trace count from ${text}`);
  return { matches: Number(match[1]), total: Number(match[2]) };
}

async function learnRepeatedRule(page: Page): Promise<string> {
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(page.getByText(/Trace Run .* Result:/)).toContainText(
    "Result: Nat(6)",
  );
  const full = await matchCount(page);
  const rules = await page
    .getByLabel("Rule filter")
    .locator("option")
    .evaluateAll((options) =>
      options
        .map((option) => (option as HTMLOptionElement).value)
        .filter(Boolean),
    );
  for (const rule of rules) {
    await page.getByLabel("Rule filter").selectOption(rule);
    const count = await matchCount(page);
    if (count.matches >= 3 && count.matches < full.total) return rule;
  }
  throw new Error("No repeated exact rule was available in the ListRec trace.");
}

test("continues ListRec Step Run to future Trace filter matches", async ({
  page,
}) => {
  const issues = watchBrowserIssues(page);
  await page.goto("/");
  await openListSum(page);
  await page.getByLabel("Execution mode").selectOption("transparent");
  const repeatedRule = await learnRepeatedRule(page);
  await openListSum(page);

  await page.getByRole("button", { name: "Start stepping" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Step Run paused · 0 rewrites",
  );

  for (let step = 0; step < 80; step += 1) {
    if (
      (await page
        .getByLabel("Rule filter")
        .locator(`option[value="${repeatedRule}"]`)
        .count()) > 0
    ) {
      break;
    }
    await page.getByRole("button", { name: "Next Rewrite" }).click();
    await expect(page.getByRole("status")).toContainText("Step Run paused");
  }
  await expect(
    page.getByLabel("Rule filter").locator(`option[value="${repeatedRule}"]`),
  ).toHaveText(repeatedRule);

  await page.getByLabel("Rule filter").selectOption(repeatedRule);
  await expect(page.getByLabel("Trace filter match count")).toContainText(
    "1 of",
  );
  const firstHitEvent = await selectedEventNumber(page);
  const beforeSeekCount = await currentStepRewriteCount(page);

  await page.getByRole("button", { name: "Continue to Match" }).click();
  await expect(page.getByRole("status")).toContainText("Step Run paused");
  const secondHitEvent = await selectedEventNumber(page);
  const afterFirstSeekCount = await currentStepRewriteCount(page);
  expect(secondHitEvent).toBeGreaterThan(firstHitEvent);
  expect(afterFirstSeekCount).toBeGreaterThan(beforeSeekCount + 1);
  await expect(page.locator(".trace-event-details")).toContainText(repeatedRule);

  await page.getByRole("button", { name: "Continue to Match" }).click();
  await expect(page.getByRole("status")).toContainText("Step Run paused");
  const thirdHitEvent = await selectedEventNumber(page);
  expect(thirdHitEvent).toBeGreaterThan(secondHitEvent);
  await expect(page.locator(".trace-event-details")).toContainText(repeatedRule);

  await page.getByRole("button", { name: "Continue", exact: true }).click();
  const traceResult = page.getByText(/Trace Run .* Result:/);
  await expect(traceResult).toContainText("Result: Nat(6)");
  const traceRewriteCount = parseRewriteCount(await traceResult.textContent() ?? "");

  await page.getByLabel("Execution mode").selectOption("fast");
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(page.getByText(/Fast Run .* Result:/)).toContainText("Nat(6)");
  expect(traceRewriteCount).toBeGreaterThan(0);

  await expectNoBrowserIssues(issues);
});
