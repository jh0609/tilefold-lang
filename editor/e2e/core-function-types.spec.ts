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

async function center(locator: ReturnType<Page["locator"]>) {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  return { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
}

async function dragTo(
  page: Page,
  source: ReturnType<Page["locator"]>,
  target: ReturnType<Page["locator"]>,
) {
  const from = await center(source);
  const to = await center(target);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 16 });
  await page.mouse.up();
}

function port(page: Page, id: string, name: string, direction: string) {
  return page.locator(
    `[data-node-id="${id}"][data-port-name="${name}"][data-port-direction="${direction}"]`,
  );
}

function boundaryPort(page: Page, containerId: string, name: string, direction: string) {
  return page.locator(
    `[data-container-id="${containerId}"][data-port-name="${name}"][data-port-direction="${direction}"]`,
  );
}

async function selectAndDelete(
  page: Page,
  locator: ReturnType<Page["locator"]>,
) {
  await expect(locator).toBeVisible();
  await locator.focus();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Delete selected" }).click();
}

async function setSelectedBounds(page: Page, x: string, y: string) {
  await page.locator("#inspector-x").fill(x);
  await page.locator("#inspector-x").blur();
  await page.locator("#inspector-y").fill(y);
  await page.locator("#inspector-y").blur();
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
    page.locator('g.element-node.selected[data-node-kind="project_call"]'),
  ).toBeVisible();
  await expectNoBrowserIssues(issues);
});

test("keeps Apply signature arguments separate from captures for NatRec step functions", async ({
  page,
}, testInfo) => {
  const issues = watchBrowserIssues(page);
  await page.goto("/");

  await page.getByRole("button", { name: "Add Function" }).click();
  await page.getByLabel("Function name").fill("isZeroStep");
  await page.getByLabel("Argument 1 name").fill("index");
  await page.getByLabel("Argument 1 type").selectOption("nat");
  await page.getByRole("button", { name: "Add argument" }).click();
  await page.getByLabel("Argument 2 name").fill("previous");
  await page.getByLabel("Argument 2 type").selectOption("nat");
  await page.getByLabel("Result name").fill("result");
  await page.getByLabel("Result type").selectOption("nat");
  await page.getByRole("button", { name: "Create total function" }).click();

  await expect(
    page.getByText(/isZeroStep\(index: Nat, previous: Nat\)/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Return to entry graph" }).click();

  const functionNode = page
    .locator('g.element-node[data-node-kind="function"][data-template-id="isZeroStep"]')
    .first();
  await expect(functionNode).toBeVisible();
  const functionNodeId = await functionNode.getAttribute("data-node-id");
  expect(functionNodeId).not.toBeNull();
  await expect(functionNode.locator("text.element-signature")).toContainText(
    /Nat -> \(?Nat -> Nat\)?/,
  );
  await functionNode.click();
  await setSelectedBounds(page, "0", "180");
  await expect(
    functionNode.locator('[data-port-direction="input"]'),
  ).toHaveCount(0);
  await expect(
    page.locator(
      `polyline[data-target-node-id="${functionNodeId}"][data-target-node-kind="function"]`,
    ),
  ).toHaveCount(0);

  const starterDropWire = page.locator(
    `polyline[data-source-node-id="${functionNodeId}"][data-source-port-name="value"][data-target-node-kind="drop"]`,
  );
  await expect(starterDropWire).toBeVisible();
  const starterDropId = await starterDropWire.getAttribute("data-target-node-id");
  expect(starterDropId).not.toBeNull();
  await page.getByRole("button", { name: "Add NatRec" }).click();
  const natRecNode = page.locator('g.element-node.selected[data-node-kind="nat_rec"]');
  await expect(natRecNode).toBeVisible();
  const natRecId = await natRecNode.getAttribute("data-node-id");
  expect(natRecId).not.toBeNull();
  await setSelectedBounds(page, "100", "60");
  await dragTo(
    page,
    port(page, functionNodeId!, "value", "output"),
    port(page, natRecId!, "step", "input"),
  );
  await expect(
    page.locator(
      `polyline[data-source-node-id="${functionNodeId}"][data-source-port-name="value"][data-target-node-id="${natRecId}"][data-target-port-name="step"]`,
    ),
  ).toHaveCount(1);
  await expect(page.locator(`[data-node-id="${starterDropId}"]`)).toHaveCount(0);
  await expect(starterDropWire).toHaveCount(0);

  await selectAndDelete(page, page.locator('[data-node-id="node_succ"].element-node'));
  await dragTo(
    page,
    port(page, "node_nat_2", "value", "output"),
    port(page, natRecId!, "count", "input"),
  );
  await page.getByRole("button", { name: "Add Nat", exact: true }).click();
  const baseNat = page.locator('g.element-node.selected[data-node-kind="nat_literal"]');
  await expect(baseNat).toBeVisible();
  const baseNatId = await baseNat.getAttribute("data-node-id");
  expect(baseNatId).not.toBeNull();
  await setSelectedBounds(page, "4", "200");
  await page.getByLabel("Nat value").fill("1");
  await dragTo(
    page,
    port(page, baseNatId!, "value", "output"),
    port(page, natRecId!, "base", "input"),
  );
  await dragTo(
    page,
    port(page, natRecId!, "result", "output"),
    boundaryPort(page, "entry", "result", "input"),
  );
  await page.getByRole("button", { name: "Run" }).click();
  await expect(page.getByText(/Result:/)).toContainText("Nat(0)");
  await expect(page.getByRole("region", { name: /Diagnostics/ })).toHaveCount(0);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  const download = await downloadPromise;
  const savedPath = testInfo.outputPath("isZeroStep.tilefold.json");
  await download.saveAs(savedPath);
  const savedJson = readFileSync(savedPath, "utf8");
  const project = JSON.parse(savedJson) as {
    surfaceFunctions: Array<{
      id: string;
      name: string;
      parameters: Array<{ name: string; type: unknown }>;
      result: { name: string; type: unknown };
    }>;
    geometry: {
      elements: Array<{
        kind: string;
        properties?: { templateId?: string; captures?: unknown[] };
      }>;
    };
  };
  const surfaceFunction = project.surfaceFunctions.find(
    (candidate) => candidate.name === "isZeroStep",
  );
  expect(surfaceFunction?.parameters.map((parameter) => parameter.name)).toEqual([
    "index",
    "previous",
  ]);
  expect(surfaceFunction?.result.name).toBe("result");
  const functionElement = project.geometry.elements.find(
    (element) =>
      element.kind === "function" &&
      element.properties?.templateId === surfaceFunction?.id,
  );
  expect(functionElement?.properties?.captures ?? []).toEqual([]);

  await page.reload();
  await page.getByLabel("Open JSON file").setInputFiles(savedPath);
  await page.getByRole("button", { name: "Add Call" }).click();
  await expect(page.getByText("1. index: Nat")).toBeVisible();
  await expect(page.getByText("2. previous: Nat")).toBeVisible();
  await expectNoBrowserIssues(issues);
});
