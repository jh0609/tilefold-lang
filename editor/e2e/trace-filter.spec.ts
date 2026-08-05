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
  await expect(page.getByTestId("element-sum-add")).toBeVisible();
  await expect(page.getByTestId("element-list-rec")).toBeVisible();
}

async function runTrace(page: Page) {
  await page.getByLabel("Execution mode").selectOption("transparent");
  await page.getByRole("button", { name: "Run" }).click();
  await expect(page.getByText(/Trace Run .* Result:/)).toContainText(
    "Result: Nat(6)",
  );
}

async function matchCount(page: Page): Promise<{ matches: number; total: number }> {
  const text = await page.getByLabel("Trace filter match count").textContent();
  const match = text?.match(/(\d+) of (\d+) events/);
  if (!match) throw new Error(`Unable to parse trace count from ${text}`);
  return { matches: Number(match[1]), total: Number(match[2]) };
}

async function visibleTraceIndexes(page: Page): Promise<number[]> {
  const labels = await page.locator(".trace-event-button code").allTextContents();
  return labels.map((label) => Number(label.replace("#", "")));
}

async function selectRuleAndMappedNodeWithMatches(
  page: Page,
  total: number,
): Promise<{ rule: string; node: string; ruleMatches: number }> {
  const rules = await page
    .getByLabel("Rule filter")
    .locator("option")
    .evaluateAll((options) =>
      options
        .map((option) => (option as HTMLOptionElement).value)
        .filter(Boolean),
    );
  const nodes = await page
    .getByLabel("Surface node filter")
    .locator("option")
    .evaluateAll((options) =>
      options
        .map((option) => (option as HTMLOptionElement).value)
        .filter((value) => value && value !== "__unmapped__"),
    );
  for (const rule of rules) {
    await page.getByLabel("Rule filter").selectOption(rule);
    const count = await matchCount(page);
    if (count.matches <= 1 || count.matches >= total) continue;
    for (const node of nodes) {
      await page.getByLabel("Surface node filter").selectOption(node);
      const combined = await matchCount(page);
      await page.getByLabel("Surface node filter").selectOption("");
      if (combined.matches > 0) {
        await page.getByLabel("Rule filter").selectOption(rule);
        return { rule, node, ruleMatches: count.matches };
      }
    }
  }
  throw new Error("No exact rule and mapped Surface node pair produced matches.");
}

async function selectZeroMatchRule(page: Page): Promise<string> {
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
    if (count.matches === 0) return rule;
  }
  throw new Error("No exact rule produced a zero-match combination.");
}

test("filters ListRec trace events by rule and exact Surface node", async ({
  page,
}) => {
  const issues = watchBrowserIssues(page);
  await page.goto("/");
  await openListSum(page);
  await runTrace(page);

  const full = await matchCount(page);
  expect(full.total).toBeGreaterThan(0);
  expect(full.matches).toBe(full.total);

  await expect(
    page.getByLabel("Rule filter").locator('option[value="ListRecCons"]'),
  ).toHaveText("ListRecCons");
  const selected = await selectRuleAndMappedNodeWithMatches(page, full.total);
  const ruleFiltered = await matchCount(page);
  expect(ruleFiltered.matches).toBe(selected.ruleMatches);
  expect(ruleFiltered.matches).toBeLessThan(full.total);
  const firstButton = page.getByRole("button", { name: "First trace event" });
  if (await firstButton.isEnabled()) await firstButton.click();

  const beforeIndexes = await visibleTraceIndexes(page);
  expect(beforeIndexes.length).toBeGreaterThan(0);
  expect(beforeIndexes[0]).toBeGreaterThan(0);
  await expect(page.getByRole("button", { name: "Next trace event" })).toBeEnabled();
  await page.getByRole("button", { name: "Next trace event" }).click();
  const afterIndexes = await visibleTraceIndexes(page);
  expect(afterIndexes).toEqual(beforeIndexes);

  await page.getByLabel("Surface node filter").selectOption(selected.node);
  const combined = await matchCount(page);
  expect(combined.matches).toBeGreaterThan(0);
  expect(combined.matches).toBeLessThanOrEqual(ruleFiltered.matches);
  await expect(page.getByTestId(`trace-highlight-${selected.node}`)).toBeVisible();

  await expect(page.getByLabel("Rule filter")).toHaveValue(selected.rule);
  await selectZeroMatchRule(page);
  await expect(page.getByText("No trace events match the current filters.")).toBeVisible();
  await expect(page.locator(".trace-event-button")).toHaveCount(0);
  await expect(page.locator('[data-testid^="trace-highlight-"]')).toHaveCount(0);

  await page.getByRole("button", { name: "Clear filters" }).click();
  const cleared = await matchCount(page);
  expect(cleared).toEqual(full);
  await expect(page.locator(".trace-event-button").first()).toBeVisible();

  await expectNoBrowserIssues(issues);
});
