import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

function watchBrowserIssues(page: Page) {
  const issues = { consoleErrors: [] as string[], pageErrors: [] as string[] };
  page.on("console", (message) => {
    if (message.type() === "error") issues.consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => issues.pageErrors.push(error.message));
  return issues;
}

async function exportProject(page: Page, name: string) {
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path, name).toBeTruthy();
  return JSON.parse(readFileSync(path!, "utf8")) as {
    geometry: {
      elements: Array<{
        id: string;
        kind: string;
        bounds: { x: number; y: number; width: number; height: number };
      }>;
      containers: Array<{
        id: string;
        kind: { kind: string; templateId?: string };
        bounds: { x: number; y: number; width: number; height: number };
      }>;
    };
    currentContainerId?: string;
  };
}

function inside(
  bounds: { x: number; y: number; width: number; height: number },
  container: { x: number; y: number; width: number; height: number },
) {
  return (
    bounds.x >= container.x &&
    bounds.y >= container.y &&
    bounds.x + bounds.width <= container.x + container.width &&
    bounds.y + bounds.height <= container.y + container.height
  );
}

test("palette node creation follows the selected entry container after editing a function", async ({
  page,
}) => {
  const issues = watchBrowserIssues(page);
  await page.goto("/");

  await page.getByRole("button", { name: "Add Function" }).click();
  await page.getByLabel("Function name").fill("helper");
  await page.getByLabel("Argument 1 name").fill("input");
  await page.getByLabel("Argument 1 type").selectOption("nat");
  await page.getByLabel("Result name").fill("result");
  await page.getByLabel("Result type").selectOption("nat");
  await page.getByRole("button", { name: "Create total function" }).click();
  await expect(page.getByText(/Created helper/)).toBeVisible();

  await page.getByRole("button", { name: "Add Succ" }).click();
  await expect(page.locator('g.element-node.selected[data-node-kind="succ"]')).toBeVisible();

  await page.getByRole("button", { name: "Fit view" }).click();
  await page
    .locator('.container-shape[data-container-id="entry"]')
    .click({ position: { x: 24, y: 18 } });
  await expect(page.getByRole("heading", { name: "entry", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Add Nat", exact: true }).click();
  const createdNat = page.locator('g.element-node.selected[data-node-kind="nat_literal"]');
  await expect(createdNat).toBeVisible();
  const createdNatId = await createdNat.getAttribute("data-node-id");
  expect(createdNatId).toBeTruthy();

  const exported = await exportProject(page, "after-add");
  const entry = exported.geometry.containers.find(
    (container) => container.kind.kind === "entry",
  )!;
  const helper = exported.geometry.containers.find(
    (container) => container.kind.templateId === "helper",
  )!;
  const nat = exported.geometry.elements.find((element) => element.id === createdNatId)!;
  expect(exported.currentContainerId).toBe("entry");
  expect(inside(nat.bounds, entry.bounds)).toBe(true);
  expect(inside(nat.bounds, helper.bounds)).toBe(false);

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.locator(`g.element-node[data-node-id="${createdNatId}"]`)).toHaveCount(0);
  await page.getByRole("button", { name: "Redo" }).click();
  await expect(page.locator(`g.element-node[data-node-id="${createdNatId}"]`)).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  const download = await downloadPromise;
  const savedPath = await download.path();
  expect(savedPath).toBeTruthy();
  await page.reload();
  await page.getByLabel("Open JSON file").setInputFiles(savedPath!);
  await expect(page.locator(`g.element-node[data-node-id="${createdNatId}"]`)).toBeVisible();

  expect(issues.consoleErrors).toEqual([]);
  expect(issues.pageErrors).toEqual([]);
});
