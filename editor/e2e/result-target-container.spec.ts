import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

type BrowserIssues = {
  consoleErrors: string[];
  pageErrors: string[];
};

function watchBrowserIssues(page: Page): BrowserIssues {
  const issues: BrowserIssues = { consoleErrors: [], pageErrors: [] };
  page.on("console", (message) => {
    if (message.type() === "error") {
      issues.consoleErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    issues.pageErrors.push(error.message);
  });
  return issues;
}

async function expectNoBrowserIssues(issues: BrowserIssues) {
  expect(issues.pageErrors, "page errors").toEqual([]);
  expect(issues.consoleErrors, "console errors").toEqual([]);
}

test("adds Result to the selected function container", async ({ page }, testInfo) => {
  const issues = watchBrowserIssues(page);
  await page.goto("/");

  await page.getByRole("button", { name: "Add Function" }).click();
  await page.getByLabel("Function name").fill("resultTarget");
  await page.getByLabel("Argument 1 type").selectOption("unit");
  await page.getByLabel("Result type").selectOption("bool");
  await page.getByRole("button", { name: "Create total function" }).click();
  await expect(page.getByText(/Created resultTarget/)).toBeVisible();

  const container = page.locator(
    'g.container-shape[data-template-id="resultTarget"]',
  );
  await expect(container).toBeVisible();
  const containerId = await container.getAttribute("data-container-id");
  expect(containerId).not.toBeNull();

  const oldResult = page.locator(
    `[data-port-kind="boundary"][data-container-id="${containerId}"][data-port-name="result"][data-port-direction="input"]`,
  );
  await oldResult.focus();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Delete selected" }).click();
  await expect(oldResult).toHaveCount(0);
  await expect(
    page.locator('g.container-shape[data-container-id="entry"]'),
  ).toBeVisible();

  await container.click({ force: true });
  await page.getByRole("button", { name: "Add Result" }).click();
  const newResult = page.locator(
    `[data-port-kind="boundary"][data-container-id="${containerId}"][data-port-name="result"][data-port-direction="input"]`,
  );
  await expect(newResult).toHaveCount(1);
  const inspector = page.getByRole("complementary", { name: "Inspector" });
  await expect(inspector.getByText("result boundary", { exact: true })).toBeVisible();
  await expect(inspector.getByText(`Container ${containerId}`)).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  const download = await downloadPromise;
  const path = testInfo.outputPath("selected-result-target.tilefold.json");
  await download.saveAs(path);
  const exported = JSON.parse(readFileSync(path, "utf8"));
  const entry = exported.geometry.containers.find(
    (candidate: { id: string }) => candidate.id === "entry",
  );
  const target = exported.geometry.containers.find(
    (candidate: { id: string }) => candidate.id === containerId,
  );
  expect(
    entry.boundaryPorts.filter((port: { role: string }) => port.role === "result"),
  ).toHaveLength(1);
  expect(
    target.boundaryPorts.filter(
      (port: { role: string; type: string }) =>
        port.role === "result" && port.type === "bool",
    ),
  ).toHaveLength(1);

  await page.reload();
  await page.getByLabel("Open JSON file").setInputFiles(path);
  await expect(
    page.locator(
      `[data-port-kind="boundary"][data-container-id="${containerId}"][data-port-name="result"][data-port-direction="input"]`,
    ),
  ).toHaveCount(1);
  await expectNoBrowserIssues(issues);
});
