import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

type BrowserIssues = {
  consoleErrors: string[];
  pageErrors: string[];
};

const EXAMPLES = [
  {
    id: "successor",
    label: "Successor — 2 → 3",
    fileName: "successor.tilefold.json",
    marker: "element-successor_succ",
    result: "Nat(3)",
    rewrites: 5,
  },
  {
    id: "addition",
    label: "Addition — 2 + 3 = 5",
    fileName: "addition.tilefold.json",
    marker: "element-addition_natrec",
    result: "Nat(5)",
    rewrites: 34,
  },
  {
    id: "multiplication",
    label: "Multiplication — 3 × 4 = 12",
    fileName: "multiplication.tilefold.json",
    marker: "element-multiplication_natrec",
    result: "Nat(12)",
    rewrites: 205,
  },
] as const;

const STRUCTURED_EXAMPLES = [
  {
    id: "option-safe-pred-get-or-else",
    fileName: "option-safe-pred-get-or-else.tilefold.json",
    marker: "element-case",
    result: "Nat(4)",
  },
  {
    id: "list-nat",
    fileName: "list-nat.tilefold.json",
    marker: "element-cons-one",
    result: "List[Nat(1), Nat(2), Nat(3)]",
  },
  {
    id: "list-builder-nat",
    fileName: "list-builder-nat.tilefold.json",
    marker: "element-list-builder",
    result: "List[Nat(1), Nat(2), Nat(3)]",
  },
  {
    id: "list-sum-three",
    fileName: "list-sum-three.tilefold.json",
    marker: "element-sum-add",
    result: "Nat(6)",
  },
  {
    id: "list-map-succ-three",
    fileName: "list-map-succ-three.tilefold.json",
    marker: "element-map-succ-head",
    result: "List[Nat(2), Nat(3), Nat(4)]",
  },
] as const;

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

async function openExample(page: Page, id: string) {
  await page.getByLabel("Example project").selectOption(id);
  await page.getByRole("button", { name: "Open example" }).click();
}

async function runAndExpect(
  page: Page,
  expected: { result: string; rewrites: number },
) {
  await page.getByLabel("Execution mode").selectOption("transparent");
  await page.getByRole("button", { name: "Run" }).click();
  await expect(page.getByText(/Result:/)).toContainText(
    `Result: ${expected.result} · ${expected.rewrites} rewrites`,
  );
}

async function runModeAndExpect(page: Page, mode: "transparent" | "fast", result: string) {
  await page.getByLabel("Execution mode").selectOption(mode);
  await page.getByRole("button", { name: "Run" }).click();
  await expect(page.getByText(/Result:/)).toContainText(result);
}

test("lists the original and natural-number examples in canonical order", async ({
  page,
}) => {
  const issues = watchBrowserIssues(page);
  await page.goto("/");
  const picker = page.getByLabel("Example project");
  await expect(picker).toBeVisible();
  await expect(picker.locator("option")).toHaveText([
    "Original — Nat(2) → Succ",
    "Successor — 2 → 3",
    "Addition — 2 + 3 = 5",
    "Multiplication — 3 × 4 = 12",
    "Option fallback — safePred/getOrElse",
    "List — [1, 2, 3]",
    "List Builder — [1, 2, 3]",
    "List sum — [1, 2, 3] = 6",
    "List map Succ — [1, 2, 3] = [2, 3, 4]",
  ]);
  await expectNoBrowserIssues(issues);
});

test("runs each natural-number example in Chromium with exact results", async ({
  page,
}) => {
  const issues = watchBrowserIssues(page);
  await page.goto("/");

  for (const example of EXAMPLES) {
    await openExample(page, example.id);
    await expect(page.getByText(example.fileName)).toBeVisible();
    await expect(page.getByTestId(example.marker)).toBeVisible();
    await runAndExpect(page, example);
  }

  await expectNoBrowserIssues(issues);
});

test("defaults to Fast and runs natural-number Project functions from examples", async ({
  page,
}) => {
  const issues = watchBrowserIssues(page);
  await page.goto("/");
  await expect(page.getByLabel("Execution mode")).toHaveValue("fast");

  for (const example of EXAMPLES) {
    await openExample(page, example.id);
    await expect(page.getByLabel("Execution mode")).toHaveValue("fast");
    await page.getByRole("button", { name: "Run" }).click();
    await expect(page.getByText(/Result:/)).toContainText(example.result);
    await expect(page.getByText(/runner\.internal/)).toHaveCount(0);
  }

  await expectNoBrowserIssues(issues);
});

test("runs structured official examples from the picker in both modes", async ({
  page,
}) => {
  const issues = watchBrowserIssues(page);
  await page.goto("/");

  for (const example of STRUCTURED_EXAMPLES) {
    await openExample(page, example.id);
    await expect(page.getByText(example.fileName)).toBeVisible();
    await expect(page.getByTestId(example.marker)).toBeVisible();
    await runModeAndExpect(page, "transparent", example.result);
    await runModeAndExpect(page, "fast", example.result);
  }

  await expectNoBrowserIssues(issues);
});

test("opening another example clears stale execution and editor history", async ({
  page,
}) => {
  const issues = watchBrowserIssues(page);
  await page.goto("/");

  await openExample(page, "successor");
  await runAndExpect(page, EXAMPLES[0]);
  await page.getByRole("button", { name: "Add Nat", exact: true }).click();
  await expect(page.getByRole("button", { name: "Undo" })).toBeEnabled();

  await openExample(page, "addition");

  await expect(page.getByText("addition.tilefold.json")).toBeVisible();
  await expect(page.getByTestId("element-addition_natrec")).toBeVisible();
  await expect(page.getByText(/Result:/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();
  await expect(page.getByText("No selection")).toBeVisible();
  await runAndExpect(page, EXAMPLES[1]);

  await expectNoBrowserIssues(issues);
});

test("exports and reloads a natural-number example through the UI", async ({
  page,
  context,
}, testInfo) => {
  const issues = watchBrowserIssues(page);
  await page.goto("/");
  const recursiveExample = STRUCTURED_EXAMPLES.find(
    (example) => example.id === "list-sum-three",
  )!;
  await openExample(page, recursiveExample.id);
  await runModeAndExpect(page, "transparent", recursiveExample.result);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  const download = await downloadPromise;
  const savedPath = testInfo.outputPath(recursiveExample.fileName);
  await download.saveAs(savedPath);
  const savedJson = readFileSync(savedPath, "utf8");
  expect(savedJson).toContain('"list_rec"');
  expect(savedJson).toContain('"sum-add"');

  const reloaded = await context.newPage();
  const reloadIssues = watchBrowserIssues(reloaded);
  await reloaded.goto("/");
  await reloaded.getByLabel("Open JSON file").setInputFiles(savedPath);
  await expect(reloaded.getByText(recursiveExample.fileName)).toBeVisible();
  await expect(reloaded.getByTestId(recursiveExample.marker)).toBeVisible();
  await runModeAndExpect(reloaded, "transparent", recursiveExample.result);
  await runModeAndExpect(reloaded, "fast", recursiveExample.result);

  await reloaded.reload();
  await expect(reloaded.getByText(recursiveExample.fileName)).toBeVisible();
  await expect(reloaded.getByTestId(recursiveExample.marker)).toBeVisible();
  await expect(reloaded.getByTestId("element-list-rec")).toContainText(
    "ListRec<Nat, Nat>",
  );
  await expect(reloaded.getByTestId("element-sum-add")).toHaveAttribute(
    "data-library-function-id",
    "nat.add",
  );
  await runModeAndExpect(reloaded, "transparent", recursiveExample.result);
  await runModeAndExpect(reloaded, "fast", recursiveExample.result);

  await expectNoBrowserIssues(issues);
  await expectNoBrowserIssues(reloadIssues);
});
