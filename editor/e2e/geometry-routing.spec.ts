import { expect, test, type Locator, type Page } from "@playwright/test";

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

async function center(locator: Locator) {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  return { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
}

async function dragBy(page: Page, locator: Locator, dx: number, dy: number) {
  const from = await center(locator);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 12 });
  await page.mouse.up();
}

async function dragTo(page: Page, source: Locator, target: Locator) {
  const from = await center(source);
  const to = await center(target);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 16 });
  await page.mouse.up();
}

async function setSelectedBounds(page: Page, x: string, y: string) {
  await page.locator("#inspector-x").fill(x);
  await page.locator("#inspector-x").blur();
  await page.locator("#inspector-y").fill(y);
  await page.locator("#inspector-y").blur();
}

function element(page: Page, id: string) {
  return page.locator(`[data-node-id="${id}"].element-node`);
}

async function selectElement(page: Page, id: string) {
  await element(page, id).focus();
  await page.keyboard.press("Enter");
}

function port(page: Page, id: string, name: string, direction: string) {
  return page.locator(
    `[data-node-id="${id}"][data-port-name="${name}"][data-port-direction="${direction}"]`,
  );
}

function parsePoints(points: string | null) {
  expect(points).not.toBeNull();
  return points!.split(" ").map((pair) => {
    const [x, y] = pair.split(",").map(Number);
    return { x, y };
  });
}

async function svgRect(locator: Locator) {
  return locator.evaluate((node) => {
    const rect = node.querySelector("rect.element-body");
    if (!(rect instanceof SVGRectElement)) throw new Error("missing body");
    return {
      x: Number(rect.getAttribute("x")),
      y: Number(rect.getAttribute("y")),
      width: Number(rect.getAttribute("width")),
      height: Number(rect.getAttribute("height")),
    };
  });
}

async function portAnchor(locator: Locator) {
  return locator.evaluate((node) => ({
    x: Number(node.getAttribute("cx")),
    y: Number(node.getAttribute("cy")),
  }));
}

function segmentHitsRect(
  a: { x: number; y: number },
  b: { x: number; y: number },
  rect: { x: number; y: number; width: number; height: number },
) {
  const x1 = rect.x;
  const y1 = rect.y;
  const x2 = rect.x + rect.width;
  const y2 = rect.y + rect.height;
  if (a.x === b.x) {
    const low = Math.min(a.y, b.y);
    const high = Math.max(a.y, b.y);
    return a.x > x1 && a.x < x2 && low < y2 && high > y1;
  }
  if (a.y === b.y) {
    const low = Math.min(a.x, b.x);
    const high = Math.max(a.x, b.x);
    return a.y > y1 && a.y < y2 && low < x2 && high > x1;
  }
  return false;
}

function pathHitsRect(
  points: readonly { x: number; y: number }[],
  rect: { x: number; y: number; width: number; height: number },
) {
  return points.some((point, index) =>
    index > 0 ? segmentHitsRect(points[index - 1]!, point, rect) : false,
  );
}

function pointKey(point: { x: number; y: number }) {
  return `${point.x},${point.y}`;
}

function expectSimpleNonBranchingPath(
  points: readonly { x: number; y: number }[],
) {
  expect(points.length).toBeGreaterThanOrEqual(2);
  for (let index = 1; index < points.length; index += 1) {
    expect(pointKey(points[index]!)).not.toBe(pointKey(points[index - 1]!));
  }
  for (let index = 2; index < points.length; index += 1) {
    expect(pointKey(points[index]!)).not.toBe(pointKey(points[index - 2]!));
  }

  const neighbors = new Map<string, Set<string>>();
  for (let index = 1; index < points.length; index += 1) {
    const from = pointKey(points[index - 1]!);
    const to = pointKey(points[index]!);
    neighbors.set(from, neighbors.get(from) ?? new Set());
    neighbors.set(to, neighbors.get(to) ?? new Set());
    neighbors.get(from)!.add(to);
    neighbors.get(to)!.add(from);
  }

  const source = pointKey(points[0]!);
  const target = pointKey(points.at(-1)!);
  expect(neighbors.get(source)?.size).toBe(1);
  expect(neighbors.get(target)?.size).toBe(1);
  for (const [key, adjacent] of neighbors) {
    if (key !== source && key !== target) {
      expect(adjacent.size, key).toBe(2);
    }
  }
}

test("keeps resize geometry, ports, wires, undo, and import in sync", async ({
  page,
}, testInfo) => {
  const issues = watchBrowserIssues(page);
  await page.goto("/");

  await element(page, "node_succ").click();
  const before = await svgRect(element(page, "node_succ"));
  await dragBy(page, page.getByTestId("resize-node_succ-south-east"), 80, 40);
  const after = await svgRect(element(page, "node_succ"));
  expect(after.width).toBeGreaterThan(before.width);
  expect(after.height).toBeGreaterThan(before.height);
  const input = await portAnchor(port(page, "node_succ", "input", "input"));
  expect(Math.abs(input.y - (after.y + after.height / 2))).toBeLessThanOrEqual(1);
  await expect(page.getByTestId("wire-wire_nat_succ")).toHaveAttribute(
    "data-semantic-points",
    `80,70 ${input.x},${input.y}`,
  );

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByTestId("wire-wire_nat_succ")).toHaveAttribute(
    "data-semantic-points",
    "80,70 120,70",
  );
  await page.getByRole("button", { name: "Redo" }).click();
  await expect(page.getByTestId("wire-wire_nat_succ")).toHaveAttribute(
    "data-semantic-points",
    `80,70 ${input.x},${input.y}`,
  );

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  const download = await downloadPromise;
  const savedPath = testInfo.outputPath("resized.tilefold.json");
  await download.saveAs(savedPath);
  await page.reload();
  await page.getByLabel("Open JSON file").setInputFiles(savedPath);
  await expect(page.getByTestId("wire-wire_nat_succ")).toHaveAttribute(
    "data-semantic-points",
    `80,70 ${input.x},${input.y}`,
  );
  await expectNoBrowserIssues(issues);
});

test("renders Nat-to-NatRec base routes without dead-end polyline branches", async ({
  page,
}) => {
  const issues = watchBrowserIssues(page);
  await page.goto("/");

  await page.getByRole("button", { name: "Add Nat", exact: true }).click();
  const nat = page.locator('g.element-node.selected[data-node-kind="nat_literal"]');
  await expect(nat).toBeVisible();
  const natId = await nat.getAttribute("data-node-id");
  expect(natId).not.toBeNull();
  await setSelectedBounds(page, "96", "168");

  await page.getByRole("button", { name: "Add NatRec" }).click();
  const natRec = page.locator('g.element-node.selected[data-node-kind="nat_rec"]');
  await expect(natRec).toBeVisible();
  const natRecId = await natRec.getAttribute("data-node-id");
  expect(natRecId).not.toBeNull();
  await setSelectedBounds(page, "280", "22");

  await dragTo(
    page,
    port(page, natId!, "value", "output"),
    port(page, natRecId!, "base", "input"),
  );
  const natRecWire = page.locator(
    `[data-source-node-id="${natId}"][data-target-node-id="${natRecId}"]`,
  );
  await expect(natRecWire).toBeVisible();
  const firstRoute = parsePoints(await natRecWire.getAttribute("points"));
  expectSimpleNonBranchingPath(firstRoute);
  expect(pathHitsRect(firstRoute.slice(1), await svgRect(element(page, natId!)))).toBe(
    false,
  );
  expect(pathHitsRect(firstRoute.slice(0, -1), await svgRect(element(page, natRecId!)))).toBe(false);

  await selectElement(page, natRecId!);
  await setSelectedBounds(page, "220", "190");
  const rerouted = parsePoints(await natRecWire.getAttribute("points"));
  expectSimpleNonBranchingPath(rerouted);
  expect(rerouted.at(-1)).toEqual(
    await portAnchor(port(page, natRecId!, "base", "input")),
  );
  expect(pathHitsRect(rerouted.slice(0, -1), await svgRect(element(page, natRecId!)))).toBe(false);
  await expectNoBrowserIssues(issues);
});

test("reroutes displayed wires around moved and resized obstacles", async ({
  page,
}) => {
  const issues = watchBrowserIssues(page);
  await page.goto("/");

  await selectElement(page, "node_succ");
  await setSelectedBounds(page, "430", "50");
  await expect(element(page, "node_succ").locator("rect.element-body")).toHaveAttribute(
    "x",
    "430",
  );
  await page.getByRole("button", { name: "Add Drop" }).click();
  const obstacleNode = page.locator('g.element-node.selected[data-node-kind="drop"]');
  await expect(obstacleNode).toBeVisible();
  await setSelectedBounds(page, "160", "44");
  await expect(obstacleNode.locator("rect.element-body")).toHaveAttribute("x", "160");
  await expect(obstacleNode.locator("rect.element-body")).toHaveAttribute("y", "44");
  const obstacle = await svgRect(obstacleNode);
  const routed = parsePoints(
    await page.getByTestId("wire-wire_nat_succ").getAttribute("points"),
  );
  expect(routed.some((point) => Number.isNaN(point.x) || Number.isNaN(point.y))).toBe(
    false,
  );
  expect(routed.length).toBeGreaterThan(2);

  await dragBy(
    page,
    page.locator('circle.resize-handle.south-east').last(),
    40,
    40,
  );
  const largerObstacle = await svgRect(obstacleNode);
  const rerouted = parsePoints(
    await page.getByTestId("wire-wire_nat_succ").getAttribute("points"),
  );
  expect(pathHitsRect(rerouted, largerObstacle)).toBe(false);
  await page.getByRole("button", { name: "Zoom in" }).click();
  await page.getByRole("button", { name: "Zoom out" }).click();
  await expect(page.getByTestId("wire-wire_nat_succ")).toBeVisible();
  await expectNoBrowserIssues(issues);
});

test("reconnects an endpoint and keeps the routed path clear of obstacles", async ({
  page,
}) => {
  const issues = watchBrowserIssues(page);
  await page.goto("/");

  await selectElement(page, "node_succ");
  await setSelectedBounds(page, "250", "50");
  await page.getByRole("button", { name: "Add Drop" }).click();
  const obstacleNode = page.locator('g.element-node.selected[data-node-kind="drop"]');
  await setSelectedBounds(page, "120", "44");
  const obstacleId = await obstacleNode.getAttribute("data-node-id");
  expect(obstacleId).not.toBeNull();
  const obstacle = await svgRect(obstacleNode);

  await page.getByRole("button", { name: "Add Nat", exact: true }).click();
  const replacementNat = page.locator('g.element-node.selected[data-node-kind="nat_literal"]');
  await expect(replacementNat).toBeVisible();
  const replacementNatId = await replacementNat.getAttribute("data-node-id");
  expect(replacementNatId).not.toBeNull();
  await setSelectedBounds(page, "4", "60");

  await page.getByTestId("wire-wire_nat_succ").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("wire-wire_nat_succ-source-handle")).toBeVisible();
  await dragTo(
    page,
    page.getByTestId("wire-wire_nat_succ-source-handle"),
    port(page, replacementNatId!, "value", "output"),
  );
  await expect(page.getByTestId("wire-wire_nat_succ")).toHaveAttribute(
    "data-source-node-id",
    replacementNatId!,
  );
  const routed = parsePoints(
    await page.getByTestId("wire-wire_nat_succ").getAttribute("points"),
  );
  expect(pathHitsRect(routed, obstacle), JSON.stringify({ routed, obstacle })).toBe(
    false,
  );
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByTestId("wire-wire_nat_succ")).toHaveAttribute(
    "data-source-node-id",
    "node_nat_2",
  );
  await page.getByRole("button", { name: "Redo" }).click();
  await expect(page.getByTestId("wire-wire_nat_succ")).toHaveAttribute(
    "data-source-node-id",
    replacementNatId!,
  );
  await selectElement(page, "node_succ");
  await setSelectedBounds(page, "120", "50");
  await selectElement(page, obstacleId!);
  await page.getByRole("button", { name: "Delete selected" }).click();
  await selectElement(page, "node_nat_2");
  await page.getByRole("button", { name: "Delete selected" }).click();

  await page.getByRole("button", { name: "Run" }).click();
  await expect(page.getByText(/Result:/)).toContainText("Nat(1)");
  await expectNoBrowserIssues(issues);
});

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1024, height: 768 },
  { width: 760, height: 900 },
] as const) {
  test(`supports resize, port drag, zoom, pan, and diagnostics wrapping at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    const issues = watchBrowserIssues(page);
    await page.setViewportSize(viewport);
    await page.goto("/");

    await element(page, "node_succ").click();
    await expect(page.getByTestId("resize-node_succ-south-east")).toBeVisible();
    await dragBy(page, page.getByTestId("resize-node_succ-east"), 24, 0);
    await page.getByRole("button", { name: "Zoom in" }).click();
    await page.getByRole("button", { name: "Zoom out" }).click();
    await page.getByRole("button", { name: "Fit view" }).click();
    await expect(page.getByLabel("Node palette")).toBeVisible();
    await expect(page.getByLabel("Inspector")).toBeVisible();
    await expect(page.getByTestId("wire-wire_nat_succ")).toHaveAttribute(
      "data-semantic-points",
      /80,70/,
    );
    await expect(page.getByText("Wheel zoom")).toBeVisible();
    await expectNoBrowserIssues(issues);
  });
}
