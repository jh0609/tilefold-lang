import { expect, test, type Locator, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

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

async function containerProjectRect(page: Page, id: string) {
  return page.locator(`g.container-shape[data-container-id="${id}"]`).evaluate((node) => {
    const rect = node.querySelector("rect");
    if (!(rect instanceof SVGRectElement)) throw new Error("missing container rect");
    return {
      x: Number(rect.getAttribute("x")),
      y: Number(rect.getAttribute("y")),
      width: Number(rect.getAttribute("width")),
      height: Number(rect.getAttribute("height")),
    };
  });
}

async function screenBox(locator: Locator) {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  return box!;
}

function boxesOverlap(
  left: { x: number; y: number; width: number; height: number },
  right: { x: number; y: number; width: number; height: number },
) {
  return (
    left.x < right.x + right.width &&
    left.x + left.width > right.x &&
    left.y < right.y + right.height &&
    left.y + left.height > right.y
  );
}


function containsBox(
  outer: { x: number; y: number; width: number; height: number },
  inner: { x: number; y: number; width: number; height: number },
) {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}
function boxesOverlapWithGap(
  left: { x: number; y: number; width: number; height: number },
  right: { x: number; y: number; width: number; height: number },
  gap: number,
) {
  return (
    left.x < right.x + right.width + gap &&
    left.x + left.width + gap > right.x &&
    left.y < right.y + right.height + gap &&
    left.y + left.height + gap > right.y
  );
}

function scopedOverlapFixture() {
  const examplePath = path.resolve(process.cwd(), "../examples/nat-succ.tilefold.json");
  const project = JSON.parse(fs.readFileSync(examplePath, "utf8"));
  project.geometry.elements = project.geometry.elements.map((element: any, index: number) => {
    if (index > 2) return element;
    const x = 80 + index * 8;
    const y = 90 + index * 8;
    const dx = x - element.bounds.x;
    const dy = y - element.bounds.y;
    return {
      ...element,
      bounds: { ...element.bounds, x, y },
      portAnchors: element.portAnchors.map((anchor: any) => ({
        ...anchor,
        x: anchor.x + dx,
        y: anchor.y + dy,
      })),
    };
  });
  function templateContainer(id: string, x: number, y: number, width = 220, height = 140) {
    return {
      id,
      kind: {
        kind: "template",
        templateId: `${id}_template`,
        parameterType: "unit",
        resultType: "unit",
        dependencies: [],
      },
      bounds: { x, y, width, height },
      boundaryPorts: [
        {
          id: `${id}_parameter`,
          role: "parameter",
          type: "unit",
          anchor: { x: 0, y: 44 },
        },
        {
          id: `${id}_result`,
          role: "result",
          type: "unit",
          anchor: { x: width, y: 84 },
        },
      ],
    };
  }
  const neighbor = templateContainer("neighbor", 400, 0);
  const stable = templateContainer("stable", 900, 0);
  project.geometry.containers.push(neighbor, stable);
  for (const item of [neighbor, stable]) {
    project.geometry.elements.push(
      {
        id: `${item.id}_drop`,
        kind: "drop",
        bounds: { x: item.bounds.x + 40, y: item.bounds.y + 60, width: 20, height: 20 },
        properties: { type: "unit" },
        portAnchors: [{ port: "input", x: item.bounds.x + 40, y: item.bounds.y + 70 }],
      },
      {
        id: `${item.id}_unit`,
        kind: "unit_literal",
        bounds: { x: item.bounds.x + 130, y: item.bounds.y + 60, width: 20, height: 20 },
        properties: {},
        portAnchors: [{ port: "value", x: item.bounds.x + 150, y: item.bounds.y + 70 }],
      },
    );
    project.geometry.wires.push(
      {
        id: `${item.id}_parameter_wire`,
        points: [
          { x: item.bounds.x, y: item.bounds.y + 44 },
          { x: item.bounds.x + 40, y: item.bounds.y + 70 },
        ],
        sourceHint: {
          kind: "boundary_port",
          containerId: item.id,
          boundaryId: `${item.id}_parameter`,
        },
        targetHint: {
          kind: "element_port",
          elementId: `${item.id}_drop`,
          port: "input",
        },
      },
      {
        id: `${item.id}_result_wire`,
        points: [
          { x: item.bounds.x + 150, y: item.bounds.y + 70 },
          { x: item.bounds.x + item.bounds.width, y: item.bounds.y + 84 },
        ],
        sourceHint: {
          kind: "element_port",
          elementId: `${item.id}_unit`,
          port: "value",
        },
        targetHint: {
          kind: "boundary_port",
          containerId: item.id,
          boundaryId: `${item.id}_result`,
        },
      },
    );
  }
  project.surfaceFunctions = [
    ...(project.surfaceFunctions ?? []),
    {
      name: "neighbor",
      templateId: "neighbor_template",
      bodyContainerId: "neighbor",
      parameters: [{ name: "parameter", type: "unit" }],
      result: { name: "result", type: "unit" },
    },
    {
      name: "stable",
      templateId: "stable_template",
      bodyContainerId: "stable",
      parameters: [{ name: "parameter", type: "unit" }],
      result: { name: "result", type: "unit" },
    },
  ];
  return project;
}

async function expectNoScreenOverlap(left: Locator, right: Locator) {
  expect(boxesOverlap(await screenBox(left), await screenBox(right))).toBe(false);
}

async function resetZoom(page: Page) {
  await page.getByRole("button", { name: "Reset view" }).click();
  await expect(page.getByLabel("Canvas zoom")).toHaveText("100%");
}

async function setZoomNear(page: Page, target: 50 | 100 | 200) {
  await resetZoom(page);
  if (target === 50) {
    for (let count = 0; count < 3; count += 1) {
      await page.getByRole("button", { name: "Zoom out" }).click();
    }
    await expect(page.getByLabel("Canvas zoom")).toHaveText("51%");
  }
  if (target === 200) {
    for (let count = 0; count < 3; count += 1) {
      await page.getByRole("button", { name: "Zoom in" }).click();
    }
    await expect(page.getByLabel("Canvas zoom")).toHaveText("195%");
  }
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

async function containerRect(locator: Locator) {
  return locator.evaluate((node) => {
    const rect = node.querySelector("rect");
    if (!(rect instanceof SVGRectElement)) throw new Error("missing container");
    return {
      x: Number(rect.getAttribute("x")),
      y: Number(rect.getAttribute("y")),
      width: Number(rect.getAttribute("width")),
      height: Number(rect.getAttribute("height")),
    };
  });
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

test("resizes selected graph containers from corner handles and persists geometry", async ({
  page,
}, testInfo) => {
  const issues = watchBrowserIssues(page);
  await page.goto("/");

  const entry = page.locator('g.container-shape[data-container-id="entry"]');
  await entry.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("container-entry-resize-north-west")).toBeVisible();
  await expect(page.getByTestId("container-entry-resize-north-east")).toBeVisible();
  await expect(page.getByTestId("container-entry-resize-south-west")).toBeVisible();
  await expect(page.getByTestId("container-entry-resize-south-east")).toBeVisible();

  const succBefore = await svgRect(element(page, "node_succ"));
  const before = await containerRect(entry);
  await dragBy(page, page.getByTestId("container-entry-resize-south-east"), 120, 90);
  const expanded = await containerRect(entry);
  expect(expanded.x).toBe(before.x);
  expect(expanded.y).toBe(before.y);
  expect(expanded.width).toBeGreaterThan(before.width);
  expect(expanded.height).toBeGreaterThan(before.height);
  expect(await svgRect(element(page, "node_succ"))).toEqual(succBefore);

  await dragBy(page, page.getByTestId("container-entry-resize-north-west"), -40, -30);
  const movedOrigin = await containerRect(entry);
  expect(movedOrigin.x).toBeLessThan(expanded.x);
  expect(movedOrigin.y).toBeLessThan(expanded.y);
  expect(movedOrigin.x + movedOrigin.width).toBe(expanded.x + expanded.width);
  expect(movedOrigin.y + movedOrigin.height).toBe(expanded.y + expanded.height);
  expect(await svgRect(element(page, "node_succ"))).toEqual(succBefore);

  await dragBy(page, page.getByTestId("container-entry-resize-south-east"), -1000, -1000);
  const clamped = await containerRect(entry);
  const succ = await svgRect(element(page, "node_succ"));
  expect(clamped.x + clamped.width).toBeGreaterThan(succ.x + succ.width);
  expect(clamped.y + clamped.height).toBeGreaterThan(succ.y + succ.height);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  const download = await downloadPromise;
  const savedPath = testInfo.outputPath("container-resize.tilefold.json");
  await download.saveAs(savedPath);
  const beforeReload = await containerRect(entry);
  await page.reload();
  await page.getByLabel("Open JSON file").setInputFiles(savedPath);
  await expect
    .poll(() => containerRect(entry))
    .toEqual(beforeReload);
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
  const obstacleId = await obstacleNode.getAttribute("data-node-id");
  expect(obstacleId).not.toBeNull();
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
    page.getByTestId(`resize-${obstacleId!}-south-east`),
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

test("keeps interaction chrome screen-sized across zoom while resize math stays in canvas coordinates", async ({
  page,
}) => {
  const issues = watchBrowserIssues(page);
  await page.goto("/");

  await page.getByRole("button", { name: "Add Function" }).click();
  await page.getByLabel("Function name").fill("screenChrome");
  await page.getByRole("button", { name: "Create total function" }).click();
  const functionNode = page.locator(
    'g.element-node[data-node-kind="function"][data-template-id="screenChrome"]',
  );
  await expect(functionNode).toBeVisible();
  const functionId = await functionNode.getAttribute("data-node-id");
  expect(functionId).not.toBeNull();
  await functionNode.focus();
  await page.keyboard.press("Enter");
  await setSelectedBounds(page, "120", "130");

  const visibleHandle = page.getByTestId(
    `resize-${functionId!}-south-east-visible`,
  );
  const sizes: number[] = [];
  for (const zoom of [50, 100, 200] as const) {
    await setZoomNear(page, zoom);
    await functionNode.focus();
    await page.keyboard.press("Enter");
    const box = await screenBox(visibleHandle);
    sizes.push(box.width);
    expect(box.width).toBeGreaterThanOrEqual(8);
    expect(box.width).toBeLessThanOrEqual(13);
  }
  expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(2.5);

  await setZoomNear(page, 200);
  await functionNode.focus();
  await page.keyboard.press("Enter");
  const before = await svgRect(functionNode);
  await dragBy(page, page.getByTestId(`resize-${functionId!}-east`), 39, 0);
  const after = await svgRect(functionNode);
  expect(after.width - before.width).toBeGreaterThanOrEqual(9);
  expect(after.width - before.width).toBeLessThanOrEqual(11);
  await page.getByRole("button", { name: "Undo" }).click();
  expect(await svgRect(functionNode)).toEqual(before);
  await page.getByRole("button", { name: "Redo" }).click();
  expect(await svgRect(functionNode)).toEqual(after);
  await expectNoBrowserIssues(issues);
});

test("keeps Nat, Succ, and Drop ports clear of node content across zoom levels", async ({
  page,
}) => {
  const issues = watchBrowserIssues(page);
  await page.goto("/");

  await page.getByRole("button", { name: "Add Drop" }).click();
  const dropNode = page.locator('g.element-node.selected[data-node-kind="drop"]');
  await expect(dropNode).toBeVisible();
  const dropId = await dropNode.getAttribute("data-node-id");
  expect(dropId).not.toBeNull();
  await setSelectedBounds(page, "250", "145");
  await page.getByRole("button", { name: "Add Nat", exact: true }).click();
  const sourceNat = page.locator('g.element-node.selected[data-node-kind="nat_literal"]');
  await expect(sourceNat).toBeVisible();
  const sourceNatId = await sourceNat.getAttribute("data-node-id");
  expect(sourceNatId).not.toBeNull();
  await setSelectedBounds(page, "130", "145");

  for (const zoom of [50, 100, 200] as const) {
    await setZoomNear(page, zoom);
    await expectNoScreenOverlap(
      page.getByTestId("port-visible-node_nat_2-value"),
      page.getByTestId("element-node_nat_2-primary-value"),
    );
    await expectNoScreenOverlap(
      page.getByTestId("port-visible-node_succ-input"),
      page.getByTestId("element-node_succ-kind-label"),
    );
    await expectNoScreenOverlap(
      page.getByTestId("port-visible-node_succ-result"),
      page.getByTestId("element-node_succ-kind-label"),
    );
    await expectNoScreenOverlap(
      page.getByTestId(`port-visible-${dropId!}-input`),
      page.getByTestId(`element-${dropId!}-kind-label`),
    );
  }

  await dragTo(
    page,
    port(page, sourceNatId!, "value", "output"),
    port(page, dropId!, "input", "input"),
  );
  const wire = page.locator(
    `polyline[data-source-node-id="${sourceNatId}"][data-target-node-id="${dropId}"]`,
  );
  await expect(wire).toHaveCount(1);
  const route = parsePoints(await wire.getAttribute("points"));
  expect(route[0]).toEqual(await portAnchor(port(page, sourceNatId!, "value", "output")));
  expect(route.at(-1)).toEqual(await portAnchor(port(page, dropId!, "input", "input")));
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

test("auto layout arranges a selected container without changing execution", async ({
  page,
}, testInfo) => {
  const issues = watchBrowserIssues(page);
  await page.goto("/");

  await page.getByRole("button", { name: "Run" }).click();
  await expect(page.getByText(/Result:/)).toContainText("Nat(3)");

  await selectElement(page, "node_succ");
  await setSelectedBounds(page, "30", "45");
  const overlappedNat = await svgRect(element(page, "node_nat_2"));
  const overlappedSucc = await svgRect(element(page, "node_succ"));
  expect(boxesOverlap(overlappedNat, overlappedSucc)).toBe(true);

  await page.locator('g.container-shape[data-container-id="entry"]').focus();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Auto Layout entry" }).click();
  const arrangedNat = await svgRect(element(page, "node_nat_2"));
  const arrangedSucc = await svgRect(element(page, "node_succ"));
  expect(boxesOverlap(arrangedNat, arrangedSucc)).toBe(false);
  await expect(page.getByTestId("wire-wire_nat_succ")).toHaveAttribute(
    "data-source-node-id",
    "node_nat_2",
  );
  await expect(page.getByTestId("wire-wire_nat_succ")).toHaveAttribute(
    "data-target-node-id",
    "node_succ",
  );

  await page.getByRole("button", { name: "Run" }).click();
  await expect(page.getByText(/Result:/)).toContainText("Nat(3)");

  await page.getByRole("button", { name: "Undo" }).click();
  expect(
    boxesOverlap(
      await svgRect(element(page, "node_nat_2")),
      await svgRect(element(page, "node_succ")),
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Redo" }).click();
  expect(
    boxesOverlap(
      await svgRect(element(page, "node_nat_2")),
      await svgRect(element(page, "node_succ")),
    ),
  ).toBe(false);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  const download = await downloadPromise;
  const savedPath = testInfo.outputPath("auto-layout.tilefold.json");
  await download.saveAs(savedPath);
  await page.reload();
  await page.getByLabel("Open JSON file").setInputFiles(savedPath);
  expect(
    boxesOverlap(
      await svgRect(element(page, "node_nat_2")),
      await svgRect(element(page, "node_succ")),
    ),
  ).toBe(false);
  await page.getByRole("button", { name: "Run" }).click();
  await expect(page.getByText(/Result:/)).toContainText("Nat(3)");

  await expectNoBrowserIssues(issues);
});

test("scoped auto layout displaces overlapping top-level sibling containers", async ({
  page,
}, testInfo) => {
  const issues = watchBrowserIssues(page);
  await page.goto("/");
  const fixturePath = testInfo.outputPath("scoped-overlap.tilefold.json");
  fs.writeFileSync(fixturePath, JSON.stringify(scopedOverlapFixture(), null, 2));
  await page.getByLabel("Open JSON file").setInputFiles(fixturePath);

  const beforeEntry = await containerProjectRect(page, "entry");
  const beforeNeighbor = await containerProjectRect(page, "neighbor");
  const beforeStable = await containerProjectRect(page, "stable");
  const beforeNeighborDrop = await svgRect(element(page, "neighbor_drop"));
  const beforeNeighborUnit = await svgRect(element(page, "neighbor_unit"));
  const beforeNeighborWire = parsePoints(
    await page.getByTestId("wire-neighbor_result_wire").getAttribute("points"),
  );

  await page.locator('g.container-shape[data-container-id="entry"]').focus();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Auto Layout entry" }).click();

  const afterEntry = await containerProjectRect(page, "entry");
  const afterNeighbor = await containerProjectRect(page, "neighbor");
  const afterStable = await containerProjectRect(page, "stable");
  expect(afterEntry.x).toBe(beforeEntry.x);
  expect(afterEntry.y).toBe(beforeEntry.y);
  expect(afterNeighbor).not.toEqual(beforeNeighbor);
  expect(afterStable).toEqual(beforeStable);
  expect(boxesOverlapWithGap(afterEntry, afterNeighbor, 120)).toBe(false);
  expect(boxesOverlapWithGap(afterEntry, afterStable, 120)).toBe(false);
  expect(boxesOverlapWithGap(afterNeighbor, afterStable, 120)).toBe(false);

  for (const id of ["node_nat_2", "node_succ"] as const) {
    expect(containsBox(afterEntry, await svgRect(element(page, id))), id).toBe(true);
  }

  const dx = afterNeighbor.x - beforeNeighbor.x;
  const dy = afterNeighbor.y - beforeNeighbor.y;
  const afterNeighborDrop = await svgRect(element(page, "neighbor_drop"));
  const afterNeighborUnit = await svgRect(element(page, "neighbor_unit"));
  expect(afterNeighborDrop.x - beforeNeighborDrop.x).toBe(dx);
  expect(afterNeighborDrop.y - beforeNeighborDrop.y).toBe(dy);
  expect(afterNeighborUnit.x - beforeNeighborUnit.x).toBe(dx);
  expect(afterNeighborUnit.y - beforeNeighborUnit.y).toBe(dy);
  const afterNeighborWire = parsePoints(
    await page.getByTestId("wire-neighbor_result_wire").getAttribute("points"),
  );
  expect(afterNeighborWire[0]).toEqual({
    x: beforeNeighborWire[0]!.x + dx,
    y: beforeNeighborWire[0]!.y + dy,
  });
  expect(afterNeighborWire.at(-1)).toEqual({
    x: afterNeighbor.x + afterNeighbor.width,
    y: afterNeighbor.y + 84,
  });

  await page.getByRole("button", { name: "Run" }).click();
  await expect(page.getByText(/Result:/)).toContainText("Nat(3)");

  await page.getByRole("button", { name: "Undo" }).click();
  expect(await containerProjectRect(page, "neighbor")).toEqual(beforeNeighbor);
  await page.getByRole("button", { name: "Redo" }).click();
  expect(await containerProjectRect(page, "neighbor")).toEqual(afterNeighbor);

  await page.locator('g.container-shape[data-container-id="entry"]').focus();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Auto Layout entry" }).click();
  expect(await containerProjectRect(page, "neighbor")).toEqual(afterNeighbor);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  const download = await downloadPromise;
  const savedPath = testInfo.outputPath("scoped-overlap-resolved.tilefold.json");
  await download.saveAs(savedPath);
  await page.reload();
  await page.getByLabel("Open JSON file").setInputFiles(savedPath);
  expect(await containerProjectRect(page, "neighbor")).toEqual(afterNeighbor);
  expect(
    boxesOverlapWithGap(
      await containerProjectRect(page, "entry"),
      await containerProjectRect(page, "neighbor"),
      120,
    ),
  ).toBe(false);

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
