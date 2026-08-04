import { expect, test, type Locator, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

type BrowserIssues = { consoleErrors: string[]; pageErrors: string[] };

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

function element(page: Page, id: string) {
  return page.locator(`g.element-node[data-node-id="${id}"]`);
}

function port(page: Page, id: string, name: string, direction: string) {
  return page.locator(
    `circle[role="button"][data-node-id="${id}"][data-port-name="${name}"][data-port-direction="${direction}"]`,
  );
}

function boundaryPort(
  page: Page,
  containerId: string,
  name: string,
  direction: string,
) {
  return page.locator(
    `circle[role="button"][data-port-kind="boundary"][data-container-id="${containerId}"][data-port-name="${name}"][data-port-direction="${direction}"]`,
  );
}

async function center(locator: Locator) {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  return { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
}

function parsePoints(points: string | null) {
  expect(points).not.toBeNull();
  return points!.split(" ").map((pair) => {
    const [x, y] = pair.split(",").map(Number);
    return { x, y };
  });
}

function expectPointNear(
  actual: { x: number; y: number } | undefined,
  expected: { x: number; y: number },
  label: string,
) {
  expect(actual, label).toBeTruthy();
  expect(Math.abs(actual!.x - expected.x), `${label} x`).toBeLessThanOrEqual(1);
  expect(Math.abs(actual!.y - expected.y), `${label} y`).toBeLessThanOrEqual(1);
}

function expectPointMoved(
  before: { x: number; y: number },
  after: { x: number; y: number },
  label: string,
) {
  expect(
    Math.hypot(after.x - before.x, after.y - before.y),
    `${label} moved from its previous endpoint`,
  ).toBeGreaterThan(20);
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

async function dragBy(page: Page, locator: Locator, dx: number, dy: number) {
  const from = await center(locator);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 12 });
  await page.mouse.up();
}

async function dragConnect(page: Page, source: Locator, target: Locator) {
  const before = await page.locator('polyline[data-testid^="wire-"]').count();
  const from = await center(source);
  const to = await center(target);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 32 });
  await page.mouse.move(to.x + 1, to.y + 1);
  await page.mouse.move(to.x, to.y);
  await page.mouse.up();
  try {
    await expect
      .poll(() => page.locator('polyline[data-testid^="wire-"]').count())
      .toBe(before + 1);
  } catch {
    await source.dragTo(target, { force: true });
    await expect
      .poll(() => page.locator('polyline[data-testid^="wire-"]').count())
      .toBe(before + 1);
  }
}

async function selectAndDelete(page: Page, locator: Locator) {
  await expect(locator).toBeAttached();
  await locator.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Delete selected" })).toBeEnabled();
  await page.getByRole("button", { name: "Delete selected" }).click();
}

async function addNodeAndGetId(page: Page, buttonName: string, kind: string) {
  const before = await page
    .locator(`g.element-node[data-node-kind="${kind}"]`)
    .evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("data-node-id") ?? ""),
    );
  await page.getByRole("button", { name: buttonName, exact: true }).click();
  const beforeSet = new Set(before);
  const created = (
    await page
      .locator(`g.element-node[data-node-kind="${kind}"]`)
      .evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("data-node-id") ?? ""),
      )
  ).find((id) => !beforeSet.has(id));
  expect(created).toBeTruthy();
  return created!;
}

async function setElementPosition(page: Page, id: string, x: number, y: number) {
  await element(page, id).focus();
  await page.keyboard.press("Enter");
  await page.locator("#inspector-x").fill(String(x));
  await page.locator("#inspector-x").blur();
  await page.locator("#inspector-y").fill(String(y));
  await page.locator("#inspector-y").blur();
}

async function setNatValue(page: Page, id: string, value: string) {
  await element(page, id).focus();
  await page.keyboard.press("Enter");
  await page.getByLabel("Nat value").fill(value);
}

async function runMode(page: Page, mode: "transparent" | "fast", result: string) {
  await page.getByLabel("Execution mode").selectOption(mode);
  await page.getByRole("button", { name: "Run" }).click();
  await expect(page.getByText(/Result:/)).toContainText(result);
}

async function importJson(page: Page, json: string, name = "project.tilefold.json") {
  await page.getByLabel("Open JSON file").setInputFiles({
    name,
    mimeType: "application/json",
    buffer: Buffer.from(json),
  });
}

async function orderedBuilderItemPorts(page: Page, builderId: string) {
  return await page
    .locator(
      `circle[role="button"][data-node-id="${builderId}"][data-port-direction="input"]`,
    )
    .evaluateAll((nodes) =>
      nodes
        .map((node) => {
          const rect = node.getBoundingClientRect();
          return {
            name: node.getAttribute("data-port-name") ?? "",
            y: rect.y + rect.height / 2,
          };
        })
        .sort((left, right) => left.y - right.y)
        .map((entry) => entry.name),
    );
}

function itemWire(page: Page, builderId: string, itemPort: string) {
  return page.locator(
    `polyline[data-target-node-id="${builderId}"][data-target-port-name="${itemPort}"]`,
  );
}

function resultWire(page: Page, builderId: string) {
  return page.locator(
    `polyline[data-source-node-id="${builderId}"][data-source-port-name="result"][data-target-container-id="entry"][data-target-port-name="result"]`,
  );
}

async function expectResultInTraceAndFast(page: Page, result: string) {
  await runMode(page, "transparent", result);
  await runMode(page, "fast", result);
}

type BuilderGeometrySnapshot = {
  builderBounds: Awaited<ReturnType<typeof svgRect>>;
  itemOrder: string[];
  itemWires: Record<
    string,
    {
      sourceNodeId: string;
      points: { x: number; y: number }[];
      builderEndpoint: { x: number; y: number };
    }
  >;
  resultWire: {
    points: { x: number; y: number }[];
    builderEndpoint: { x: number; y: number };
  };
  natBounds: Record<string, Awaited<ReturnType<typeof svgRect>>>;
};

async function captureBuilderGeometry(
  page: Page,
  builderId: string,
  natIds: readonly string[],
): Promise<BuilderGeometrySnapshot> {
  const itemOrder = await orderedBuilderItemPorts(page, builderId);
  expect(itemOrder).toHaveLength(3);
  const itemWires: BuilderGeometrySnapshot["itemWires"] = {};
  for (const itemPort of itemOrder) {
    const wire = itemWire(page, builderId, itemPort);
    await expect(wire, `wire for ${itemPort}`).toHaveCount(1);
    const points = parsePoints(await wire.getAttribute("points"));
    const builderEndpoint = points.at(-1)!;
    const expectedEndpoint = await portAnchor(
      port(page, builderId, itemPort, "input"),
    );
    expectPointNear(builderEndpoint, expectedEndpoint, `${itemPort} endpoint`);
    itemWires[itemPort] = {
      sourceNodeId: (await wire.getAttribute("data-source-node-id")) ?? "",
      points,
      builderEndpoint,
    };
  }

  const builderResultWire = resultWire(page, builderId);
  await expect(builderResultWire, "builder result wire").toHaveCount(1);
  const resultPoints = parsePoints(await builderResultWire.getAttribute("points"));
  const resultEndpoint = resultPoints[0]!;
  expectPointNear(
    resultEndpoint,
    await portAnchor(port(page, builderId, "result", "output")),
    "result endpoint",
  );

  const natBounds: BuilderGeometrySnapshot["natBounds"] = {};
  for (const natId of natIds) {
    natBounds[natId] = await svgRect(element(page, natId));
  }

  return {
    builderBounds: await svgRect(element(page, builderId)),
    itemOrder,
    itemWires,
    resultWire: {
      points: resultPoints,
      builderEndpoint: resultEndpoint,
    },
    natBounds,
  };
}

function expectStableItemWireIdentity(
  snapshot: BuilderGeometrySnapshot,
  expectedByPort: ReadonlyMap<string, string>,
) {
  for (const [itemPort, natId] of expectedByPort) {
    expect(snapshot.itemWires[itemPort]?.sourceNodeId, itemPort).toBe(natId);
  }
}

function comparableGeometry(snapshot: BuilderGeometrySnapshot) {
  return {
    builderBounds: snapshot.builderBounds,
    itemOrder: snapshot.itemOrder,
    itemWires: Object.fromEntries(
      Object.entries(snapshot.itemWires).map(([portName, wire]) => [
        portName,
        { sourceNodeId: wire.sourceNodeId, points: wire.points },
      ]),
    ),
    resultWirePoints: snapshot.resultWire.points,
    natBounds: snapshot.natBounds,
  };
}

const listRecLengthScaffold = JSON.stringify({
  format: "tilefold-project",
  version: 2,
  geometry: {
    snapTolerance: 8,
    elements: [
      {
        id: "unit-drop",
        kind: "drop",
        bounds: { x: 80, y: 80, width: 88, height: 56 },
        properties: { type: "unit" },
        portAnchors: [{ port: "input", x: 80, y: 108 }],
      },
      {
        id: "list-nil",
        kind: "nil",
        bounds: { x: 80, y: 250, width: 96, height: 56 },
        properties: { itemType: "nat" },
        portAnchors: [{ port: "value", x: 176, y: 278 }],
      },
      {
        id: "base-zero",
        kind: "nat_literal",
        bounds: { x: 560, y: 250, width: 96, height: 56 },
        properties: { value: "0" },
        portAnchors: [{ port: "value", x: 656, y: 278 }],
      },
      {
        id: "step-function",
        kind: "function",
        bounds: { x: 560, y: 90, width: 150, height: 80 },
        properties: {
          templateId: "builder-length-step",
          parameterType: { product: ["nat", { product: [{ list: "nat" }, "nat"] }] },
          resultType: "nat",
          captures: [],
        },
        portAnchors: [{ port: "value", x: 710, y: 130 }],
      },
      {
        id: "list-rec",
        kind: "list_rec",
        bounds: { x: 780, y: 150, width: 152, height: 120 },
        properties: { itemType: "nat", resultType: "nat" },
        portAnchors: [
          { port: "list", x: 780, y: 174 },
          { port: "base", x: 780, y: 198 },
          { port: "step", x: 780, y: 222 },
          { port: "result", x: 932, y: 210 },
        ],
      },
      {
        id: "step-unpair-outer",
        kind: "unpair",
        bounds: { x: 90, y: 620, width: 120, height: 84 },
        properties: { leftType: "nat", rightType: { product: [{ list: "nat" }, "nat"] } },
        portAnchors: [
          { port: "value", x: 90, y: 662 },
          { port: "left", x: 210, y: 648 },
          { port: "right", x: 210, y: 676 },
        ],
      },
      {
        id: "drop-head",
        kind: "drop",
        bounds: { x: 280, y: 620, width: 88, height: 56 },
        properties: { type: "nat" },
        portAnchors: [{ port: "input", x: 280, y: 648 }],
      },
      {
        id: "step-unpair-inner",
        kind: "unpair",
        bounds: { x: 280, y: 700, width: 120, height: 84 },
        properties: { leftType: { list: "nat" }, rightType: "nat" },
        portAnchors: [
          { port: "value", x: 280, y: 742 },
          { port: "left", x: 400, y: 728 },
          { port: "right", x: 400, y: 756 },
        ],
      },
      {
        id: "drop-tail",
        kind: "drop",
        bounds: { x: 470, y: 700, width: 88, height: 56 },
        properties: { type: { list: "nat" } },
        portAnchors: [{ port: "input", x: 470, y: 728 }],
      },
      {
        id: "succ-recursive",
        kind: "succ",
        bounds: { x: 600, y: 730, width: 100, height: 60 },
        properties: {},
        portAnchors: [
          { port: "input", x: 600, y: 760 },
          { port: "result", x: 700, y: 760 },
        ],
      },
    ],
    containers: [
      {
        id: "entry",
        kind: {
          kind: "entry",
          templateId: "entry_template",
          resultType: "nat",
          dependencies: ["builder-length-step"],
        },
        bounds: { x: 0, y: 0, width: 1120, height: 520 },
        boundaryPorts: [
          { id: "entry-parameter", role: "parameter", type: "unit", anchor: { x: 0, y: 108 } },
          { id: "entry-result", role: "result", type: "nat", anchor: { x: 1120, y: 210 } },
        ],
      },
      {
        id: "builder-length-step-container",
        kind: {
          kind: "template",
          templateId: "builder-length-step",
          parameterType: { product: ["nat", { product: [{ list: "nat" }, "nat"] }] },
          resultType: "nat",
          dependencies: [],
        },
        bounds: { x: 0, y: 560, width: 980, height: 360 },
        boundaryPorts: [
          {
            id: "step-parameter",
            role: "parameter",
            type: { product: ["nat", { product: [{ list: "nat" }, "nat"] }] },
            anchor: { x: 0, y: 170 },
          },
          { id: "step-result", role: "result", type: "nat", anchor: { x: 980, y: 170 } },
        ],
      },
    ],
    wires: [
      {
        id: "w-unit-drop",
        points: [
          { x: 0, y: 108 },
          { x: 80, y: 108 },
        ],
        sourceHint: { kind: "boundary_port", containerId: "entry", boundaryId: "entry-parameter" },
        targetHint: { kind: "element_port", elementId: "unit-drop", port: "input" },
      },
      {
        id: "w-list-rec-list",
        points: [
          { x: 176, y: 278 },
          { x: 780, y: 174 },
        ],
        sourceHint: { kind: "element_port", elementId: "list-nil", port: "value" },
        targetHint: { kind: "element_port", elementId: "list-rec", port: "list" },
      },
      {
        id: "w-list-rec-base",
        points: [
          { x: 656, y: 278 },
          { x: 780, y: 198 },
        ],
        sourceHint: { kind: "element_port", elementId: "base-zero", port: "value" },
        targetHint: { kind: "element_port", elementId: "list-rec", port: "base" },
      },
      {
        id: "w-list-rec-step",
        points: [
          { x: 710, y: 130 },
          { x: 780, y: 222 },
        ],
        sourceHint: { kind: "element_port", elementId: "step-function", port: "value" },
        targetHint: { kind: "element_port", elementId: "list-rec", port: "step" },
      },
      {
        id: "w-result",
        points: [
          { x: 932, y: 210 },
          { x: 1120, y: 210 },
        ],
        sourceHint: { kind: "element_port", elementId: "list-rec", port: "result" },
        targetHint: { kind: "boundary_port", containerId: "entry", boundaryId: "entry-result" },
      },
      {
        id: "s-param-outer",
        points: [
          { x: 0, y: 730 },
          { x: 90, y: 662 },
        ],
        sourceHint: {
          kind: "boundary_port",
          containerId: "builder-length-step-container",
          boundaryId: "step-parameter",
        },
        targetHint: { kind: "element_port", elementId: "step-unpair-outer", port: "value" },
      },
      {
        id: "s-drop-head",
        points: [
          { x: 210, y: 648 },
          { x: 280, y: 648 },
        ],
        sourceHint: { kind: "element_port", elementId: "step-unpair-outer", port: "left" },
        targetHint: { kind: "element_port", elementId: "drop-head", port: "input" },
      },
      {
        id: "s-inner",
        points: [
          { x: 210, y: 676 },
          { x: 280, y: 742 },
        ],
        sourceHint: { kind: "element_port", elementId: "step-unpair-outer", port: "right" },
        targetHint: { kind: "element_port", elementId: "step-unpair-inner", port: "value" },
      },
      {
        id: "s-drop-tail",
        points: [
          { x: 400, y: 728 },
          { x: 470, y: 728 },
        ],
        sourceHint: { kind: "element_port", elementId: "step-unpair-inner", port: "left" },
        targetHint: { kind: "element_port", elementId: "drop-tail", port: "input" },
      },
      {
        id: "s-succ",
        points: [
          { x: 400, y: 756 },
          { x: 600, y: 760 },
        ],
        sourceHint: { kind: "element_port", elementId: "step-unpair-inner", port: "right" },
        targetHint: { kind: "element_port", elementId: "succ-recursive", port: "input" },
      },
      {
        id: "s-result",
        points: [
          { x: 700, y: 760 },
          { x: 980, y: 730 },
        ],
        sourceHint: { kind: "element_port", elementId: "succ-recursive", port: "result" },
        targetHint: {
          kind: "boundary_port",
          containerId: "builder-length-step-container",
          boundaryId: "step-result",
        },
      },
    ],
    junctions: [],
  },
  surfaceFunctions: [
    {
      name: "builderLengthStep",
      templateId: "builder-length-step",
      bodyContainerId: "builder-length-step-container",
      parameters: [
        { name: "frame", type: { product: ["nat", { product: [{ list: "nat" }, "nat"] }] } },
      ],
      result: { name: "result", type: "nat" },
    },
  ],
});

test("authors a List Builder through visible controls and preserves it across history and persistence", async ({
  page,
}, testInfo) => {
  const issues = watchBrowserIssues(page);
  await page.goto("/");

  await page.locator('g.container-shape[data-container-id="entry"]').focus();
  await page.keyboard.press("Enter");
  await dragBy(page, page.getByTestId("container-entry-resize-south-east"), 520, 320);

  await selectAndDelete(page, page.getByTestId("wire-wire_result"));
  await selectAndDelete(page, element(page, "node_succ"));
  await selectAndDelete(page, element(page, "node_nat_2"));

  await page.locator('g.container-shape[data-container-id="entry"]').focus();
  await page.keyboard.press("Enter");
  await page.getByLabel("Entry output type").selectOption("list");

  const builderId = await addNodeAndGetId(page, "Add List Builder", "list_builder");
  await setElementPosition(page, builderId, 260, 100);
  await element(page, builderId).focus();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Add item input" }).click();
  await page.getByRole("button", { name: "Add item input" }).click();
  await page.getByRole("button", { name: "Add item input" }).click();
  await expect(element(page, builderId)).toContainText("List Builder<Nat>");
  await expect(element(page, builderId)).toContainText("3 item(s) -> List<Nat>");

  const natIds = [
    await addNodeAndGetId(page, "Add Nat", "nat_literal"),
    await addNodeAndGetId(page, "Add Nat", "nat_literal"),
    await addNodeAndGetId(page, "Add Nat", "nat_literal"),
  ];
  for (const [index, natId] of natIds.entries()) {
    await setElementPosition(page, natId, 40, 70 + index * 60);
    await setNatValue(page, natId, String(index + 1));
  }

  const itemPorts = await orderedBuilderItemPorts(page, builderId);
  expect(itemPorts).toHaveLength(3);
  for (const [index, itemPort] of itemPorts.entries()) {
    await dragConnect(
      page,
      port(page, natIds[index]!, "value", "output"),
      port(page, builderId, itemPort, "input"),
    );
  }
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Fit view" }).click();
  await dragConnect(
    page,
    port(page, builderId, "result", "output"),
    boundaryPort(page, "entry", "result", "input"),
  );
  await runMode(page, "transparent", "List[Nat(1), Nat(2), Nat(3)]");

  await element(page, builderId).focus();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Move item 1 up" }).click();
  await expect(element(page, builderId)).toContainText("3 item(s) -> List<Nat>");
  await runMode(page, "fast", "List[Nat(2), Nat(1), Nat(3)]");
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(element(page, builderId)).toContainText("3 item(s) -> List<Nat>");
  await runMode(page, "fast", "List[Nat(1), Nat(2), Nat(3)]");
  await page.getByRole("button", { name: "Redo" }).click();
  await expect(element(page, builderId)).toContainText("3 item(s) -> List<Nat>");
  await runMode(page, "fast", "List[Nat(2), Nat(1), Nat(3)]");
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(element(page, builderId)).toContainText("3 item(s) -> List<Nat>");
  await runMode(page, "fast", "List[Nat(1), Nat(2), Nat(3)]");

  await page.locator('g.container-shape[data-container-id="entry"]').focus();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Fit container view" }).click();
  await expect(element(page, builderId)).toBeVisible();
  await page.getByRole("button", { name: "Auto Layout entry" }).click();
  await expect(element(page, builderId)).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  const download = await downloadPromise;
  const savedPath = testInfo.outputPath("authored-list-builder.tilefold.json");
  await download.saveAs(savedPath);
  const exported = JSON.parse(readFileSync(savedPath, "utf8"));
  const exportedBuilder = exported.geometry.elements.find(
    (element: { id: string }) => element.id === builderId,
  );
  expect(exportedBuilder.properties.itemIds).toHaveLength(3);

  await page.reload();
  await page.getByLabel("Open JSON file").setInputFiles(savedPath);
  await expect(element(page, builderId)).toBeVisible();
  await expect(orderedBuilderItemPorts(page, builderId)).resolves.toHaveLength(3);
  await runMode(page, "fast", "List[Nat(1), Nat(2), Nat(3)]");

  await page.getByLabel("Open JSON file").setInputFiles(savedPath);
  await expect(element(page, builderId)).toBeVisible();
  await runMode(page, "transparent", "List[Nat(1), Nat(2), Nat(3)]");

  await expectNoBrowserIssues(issues);
});

test("keeps connected List Builder wire geometry stable across move and repeated Auto Layout", async ({
  page,
}) => {
  const issues = watchBrowserIssues(page);
  await page.goto("/");

  await page.locator('g.container-shape[data-container-id="entry"]').focus();
  await page.keyboard.press("Enter");
  await dragBy(page, page.getByTestId("container-entry-resize-south-east"), 520, 320);

  await selectAndDelete(page, page.getByTestId("wire-wire_result"));
  await selectAndDelete(page, element(page, "node_succ"));
  await selectAndDelete(page, element(page, "node_nat_2"));

  await page.locator('g.container-shape[data-container-id="entry"]').focus();
  await page.keyboard.press("Enter");
  await page.getByLabel("Entry output type").selectOption("list");

  const builderId = await addNodeAndGetId(page, "Add List Builder", "list_builder");
  await setElementPosition(page, builderId, 260, 100);
  await element(page, builderId).focus();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Add item input" }).click();
  await page.getByRole("button", { name: "Add item input" }).click();
  await page.getByRole("button", { name: "Add item input" }).click();

  const natIds = [
    await addNodeAndGetId(page, "Add Nat", "nat_literal"),
    await addNodeAndGetId(page, "Add Nat", "nat_literal"),
    await addNodeAndGetId(page, "Add Nat", "nat_literal"),
  ];
  for (const [index, natId] of natIds.entries()) {
    await setElementPosition(page, natId, 40, 70 + index * 60);
    await setNatValue(page, natId, String(index + 1));
  }

  const initialItemPorts = await orderedBuilderItemPorts(page, builderId);
  expect(initialItemPorts).toHaveLength(3);
  const expectedSourceByPort = new Map<string, string>();
  for (const [index, itemPort] of initialItemPorts.entries()) {
    expectedSourceByPort.set(itemPort, natIds[index]!);
    await dragConnect(
      page,
      port(page, natIds[index]!, "value", "output"),
      port(page, builderId, itemPort, "input"),
    );
  }
  await expect(
    page.locator(`polyline[data-target-node-id="${builderId}"]`),
  ).toHaveCount(3);

  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Fit view" }).click();
  await dragConnect(
    page,
    port(page, builderId, "result", "output"),
    boundaryPort(page, "entry", "result", "input"),
  );
  await expect(resultWire(page, builderId)).toHaveCount(1);

  const beforeMove = await captureBuilderGeometry(page, builderId, natIds);
  expect(beforeMove.itemOrder).toEqual(initialItemPorts);
  expectStableItemWireIdentity(beforeMove, expectedSourceByPort);
  await expectResultInTraceAndFast(page, "List[Nat(1), Nat(2), Nat(3)]");

  await dragBy(page, element(page, builderId), 80, 30);
  const afterMove = await captureBuilderGeometry(page, builderId, natIds);
  expect(afterMove.itemOrder).toEqual(initialItemPorts);
  expectStableItemWireIdentity(afterMove, expectedSourceByPort);
  for (const itemPort of initialItemPorts) {
    expectPointMoved(
      beforeMove.itemWires[itemPort]!.builderEndpoint,
      afterMove.itemWires[itemPort]!.builderEndpoint,
      itemPort,
    );
  }
  expectPointMoved(
    beforeMove.resultWire.builderEndpoint,
    afterMove.resultWire.builderEndpoint,
    "result",
  );
  await expectResultInTraceAndFast(page, "List[Nat(1), Nat(2), Nat(3)]");

  await page.locator('g.container-shape[data-container-id="entry"]').focus();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Auto Layout entry" }).click();
  const scopedOnce = await captureBuilderGeometry(page, builderId, natIds);
  expect(scopedOnce.itemOrder).toEqual(initialItemPorts);
  expectStableItemWireIdentity(scopedOnce, expectedSourceByPort);
  await expectResultInTraceAndFast(page, "List[Nat(1), Nat(2), Nat(3)]");

  await page.locator('g.container-shape[data-container-id="entry"]').focus();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Auto Layout entry" }).click();
  const scopedTwice = await captureBuilderGeometry(page, builderId, natIds);
  expect(comparableGeometry(scopedTwice)).toEqual(comparableGeometry(scopedOnce));
  expectStableItemWireIdentity(scopedTwice, expectedSourceByPort);
  await expectResultInTraceAndFast(page, "List[Nat(1), Nat(2), Nat(3)]");

  await page.getByRole("button", { name: "Auto Layout project" }).click();
  const projectOnce = await captureBuilderGeometry(page, builderId, natIds);
  expect(projectOnce.itemOrder).toEqual(initialItemPorts);
  expectStableItemWireIdentity(projectOnce, expectedSourceByPort);
  await expectResultInTraceAndFast(page, "List[Nat(1), Nat(2), Nat(3)]");

  await page.getByRole("button", { name: "Auto Layout project" }).click();
  const projectTwice = await captureBuilderGeometry(page, builderId, natIds);
  expect(comparableGeometry(projectTwice)).toEqual(comparableGeometry(projectOnce));
  expectStableItemWireIdentity(projectTwice, expectedSourceByPort);
  await expectResultInTraceAndFast(page, "List[Nat(1), Nat(2), Nat(3)]");

  await expectNoBrowserIssues(issues);
});

test("feeds an authored List Builder into ListRec length", async ({ page }) => {
  const issues = watchBrowserIssues(page);
  await page.goto("/");
  await importJson(page, listRecLengthScaffold, "listrec-length-scaffold.tilefold.json");

  await selectAndDelete(page, page.getByTestId("wire-w-list-rec-list"));
  await selectAndDelete(page, element(page, "list-nil"));

  const builderId = await addNodeAndGetId(page, "Add List Builder", "list_builder");
  await setElementPosition(page, builderId, 300, 100);
  await element(page, builderId).focus();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Add item input" }).click();
  await page.getByRole("button", { name: "Add item input" }).click();
  await page.getByRole("button", { name: "Add item input" }).click();

  const natIds = [
    await addNodeAndGetId(page, "Add Nat", "nat_literal"),
    await addNodeAndGetId(page, "Add Nat", "nat_literal"),
    await addNodeAndGetId(page, "Add Nat", "nat_literal"),
  ];
  for (const [index, natId] of natIds.entries()) {
    await setElementPosition(page, natId, 80, 80 + index * 70);
    await setNatValue(page, natId, String(index + 1));
  }

  const itemPorts = await orderedBuilderItemPorts(page, builderId);
  expect(itemPorts).toHaveLength(3);
  for (const [index, itemPort] of itemPorts.entries()) {
    await dragConnect(
      page,
      port(page, natIds[index]!, "value", "output"),
      port(page, builderId, itemPort, "input"),
    );
  }
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Fit view" }).click();
  await dragConnect(
    page,
    port(page, builderId, "result", "output"),
    port(page, "list-rec", "list", "input"),
  );

  await runMode(page, "transparent", "Nat(3)");
  await expect
    .poll(() => page.locator(".trace-event-button", { hasText: "ListRecCons" }).count())
    .toBeGreaterThanOrEqual(1);
  await runMode(page, "fast", "Nat(3)");

  await expectNoBrowserIssues(issues);
});

test("runs the official List Builder example with trace highlight and Fast parity", async ({
  page,
}) => {
  const issues = watchBrowserIssues(page);
  await page.goto("/");

  await page.getByLabel("Example project").selectOption("list-builder-nat");
  await page.getByRole("button", { name: "Open example" }).click();
  await expect(element(page, "list-builder")).toBeVisible();

  await runMode(page, "transparent", "List[Nat(1), Nat(2), Nat(3)]");
  await page.locator(".trace-event-button", { hasText: "Cons" }).first().click();
  await expect(page.getByTestId("trace-highlight-list-builder")).toBeVisible();
  await runMode(page, "fast", "List[Nat(1), Nat(2), Nat(3)]");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  const download = await downloadPromise;
  const savedPath = test.info().outputPath("list-builder-official.tilefold.json");
  await download.saveAs(savedPath);
  await page.reload();
  await page.getByLabel("Open JSON file").setInputFiles(savedPath);
  await runMode(page, "fast", "List[Nat(1), Nat(2), Nat(3)]");

  await expectNoBrowserIssues(issues);
});
