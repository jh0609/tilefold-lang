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

function nat(id: string, x: number, y: number) {
  return {
    id,
    kind: "nat_literal",
    bounds: { x, y, width: 96, height: 56 },
    properties: { value: "1" },
    portAnchors: [{ port: "value", x: x + 96, y: y + 28 }],
  };
}

function succ(id: string, x: number, y: number) {
  return {
    id,
    kind: "succ",
    bounds: { x, y, width: 88, height: 56 },
    properties: {},
    portAnchors: [
      { port: "input", x, y: y + 28 },
      { port: "result", x: x + 88, y: y + 28 },
    ],
  };
}

function wire(id: string, sourceId: string, sourceX: number, sourceY: number, targetId: string, targetX: number, targetY: number) {
  return {
    id,
    points: [
      { x: sourceX, y: sourceY },
      { x: targetX, y: targetY },
    ],
    sourceHint: { kind: "element_port", elementId: sourceId, port: "value" },
    targetHint: { kind: "element_port", elementId: targetId, port: "input" },
  };
}

function scopingProjectJson() {
  const activeSource = nat("active-source", 740, 80);
  const activeTarget = succ("active-target", 940, 80);
  const inactiveNodes = Array.from({ length: 16 }, (_unused, index) =>
    index % 2 === 0
      ? nat(`inactive-${index}`, 1440 + (index % 4) * 120, 80 + Math.floor(index / 4) * 84)
      : succ(`inactive-${index}`, 1440 + (index % 4) * 120, 80 + Math.floor(index / 4) * 84),
  );
  return JSON.stringify({
    format: "tilefold-project",
    version: 2,
    currentContainerId: "active",
    geometry: {
      snapTolerance: 8,
      containers: [
        {
          id: "entry",
          kind: {
            kind: "entry",
            templateId: "entry_template",
            resultType: "nat",
            dependencies: [],
          },
          bounds: { x: 0, y: 0, width: 500, height: 360 },
          boundaryPorts: [
            {
              id: "entry_parameter",
              role: "parameter",
              type: "unit",
              anchor: { x: 0, y: 60 },
            },
            {
              id: "entry_result",
              role: "result",
              type: "nat",
              anchor: { x: 500, y: 120 },
            },
          ],
        },
        {
          id: "active",
          kind: {
            kind: "template",
            templateId: "active",
            parameterType: "unit",
            resultType: "nat",
            dependencies: [],
          },
          bounds: { x: 700, y: 0, width: 500, height: 360 },
          boundaryPorts: [],
        },
        {
          id: "inactive",
          kind: {
            kind: "template",
            templateId: "inactive",
            parameterType: "unit",
            resultType: "nat",
            dependencies: [],
          },
          bounds: { x: 1400, y: 0, width: 640, height: 440 },
          boundaryPorts: [],
        },
      ],
      elements: [activeSource, activeTarget, ...inactiveNodes],
      wires: [
        wire(
          "active-wire",
          "active-source",
          836,
          108,
          "active-target",
          940,
          108,
        ),
      ],
      junctions: [],
    },
    view: { cameraX: 650, cameraY: -40, zoom: 1 },
  });
}

async function importProject(page: Page, json: string) {
  await page.getByLabel("Open JSON file").setInputFiles({
    name: "performance-scoping.tilefold.json",
    mimeType: "application/json",
    buffer: Buffer.from(json),
  });
}

async function exportProject(page: Page) {
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).toBeTruthy();
  return JSON.parse(readFileSync(path!, "utf8"));
}

test("dragging in the active container leaves inactive container geometry untouched", async ({
  page,
}) => {
  const issues = watchBrowserIssues(page);
  await page.goto("/");
  await importProject(page, scopingProjectJson());

  const source = page.locator('[data-node-id="active-source"].element-node');
  await expect(source).toBeVisible();
  const before = await exportProject(page);
  const inactiveBefore = before.geometry.elements
    .filter((element: { id: string }) => element.id.startsWith("inactive-"))
    .map((element: { id: string; bounds: unknown; portAnchors: unknown }) => ({
      id: element.id,
      bounds: element.bounds,
      portAnchors: element.portAnchors,
    }));

  const box = await source.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width / 2 + 60, box!.y + box!.height / 2 + 30, {
    steps: 10,
  });
  await page.mouse.up();

  const after = await exportProject(page);
  const activeAfter = after.geometry.elements.find(
    (element: { id: string }) => element.id === "active-source",
  );
  const activeBefore = before.geometry.elements.find(
    (element: { id: string }) => element.id === "active-source",
  );
  expect(activeAfter.bounds.x).toBeGreaterThan(activeBefore.bounds.x);
  expect(activeAfter.bounds.y).toBeGreaterThan(activeBefore.bounds.y);
  const inactiveAfter = after.geometry.elements
    .filter((element: { id: string }) => element.id.startsWith("inactive-"))
    .map((element: { id: string; bounds: unknown; portAnchors: unknown }) => ({
      id: element.id,
      bounds: element.bounds,
      portAnchors: element.portAnchors,
    }));
  expect(inactiveAfter).toEqual(inactiveBefore);

  await page.getByRole("button", { name: "Undo" }).click();
  const undone = await exportProject(page);
  expect(
    undone.geometry.elements.find((element: { id: string }) => element.id === "active-source").bounds,
  ).toEqual(activeBefore.bounds);

  await page.getByRole("button", { name: "Redo" }).click();
  const redone = await exportProject(page);
  expect(
    redone.geometry.elements.find((element: { id: string }) => element.id === "active-source").bounds,
  ).toEqual(activeAfter.bounds);

  expect(issues.consoleErrors).toEqual([]);
  expect(issues.pageErrors).toEqual([]);
});
