import { expect, test, type Page } from "@playwright/test";
import { writeFileSync } from "node:fs";

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

const stdAddProject = {
  format: "tilefold-project",
  version: 1,
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
        id: "add-function",
        kind: "function",
        bounds: { x: 80, y: 180, width: 128, height: 72 },
        properties: {
          templateId: "tilefold.std.nat.add",
          parameterType: "nat",
          resultType: { arrow: ["nat", "nat"] },
          captures: [],
        },
        portAnchors: [{ port: "value", x: 208, y: 216 }],
      },
      {
        id: "left",
        kind: "nat_literal",
        bounds: { x: 80, y: 300, width: 96, height: 56 },
        properties: { value: "2" },
        portAnchors: [{ port: "value", x: 176, y: 328 }],
      },
      {
        id: "apply-left",
        kind: "apply",
        bounds: { x: 260, y: 260, width: 120, height: 90 },
        properties: {
          parameterType: "nat",
          resultType: { arrow: ["nat", "nat"] },
        },
        portAnchors: [
          { port: "function", x: 260, y: 290 },
          { port: "argument", x: 260, y: 320 },
          { port: "result", x: 380, y: 305 },
        ],
      },
      {
        id: "right",
        kind: "nat_literal",
        bounds: { x: 260, y: 380, width: 96, height: 56 },
        properties: { value: "3" },
        portAnchors: [{ port: "value", x: 356, y: 408 }],
      },
      {
        id: "apply-right",
        kind: "apply",
        bounds: { x: 460, y: 320, width: 120, height: 90 },
        properties: { parameterType: "nat", resultType: "nat" },
        portAnchors: [
          { port: "function", x: 460, y: 350 },
          { port: "argument", x: 460, y: 380 },
          { port: "result", x: 580, y: 365 },
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
          dependencies: ["tilefold.std.nat.add"],
        },
        bounds: { x: 0, y: 0, width: 700, height: 500 },
        boundaryPorts: [
          {
            id: "entry-parameter",
            role: "parameter",
            type: "unit",
            anchor: { x: 0, y: 108 },
          },
          {
            id: "entry-result",
            role: "result",
            type: "nat",
            anchor: { x: 700, y: 365 },
          },
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
        sourceHint: {
          kind: "boundary_port",
          containerId: "entry",
          boundaryId: "entry-parameter",
        },
        targetHint: {
          kind: "element_port",
          elementId: "unit-drop",
          port: "input",
        },
      },
      {
        id: "w-function-apply",
        points: [
          { x: 208, y: 216 },
          { x: 260, y: 290 },
        ],
        sourceHint: {
          kind: "element_port",
          elementId: "add-function",
          port: "value",
        },
        targetHint: {
          kind: "element_port",
          elementId: "apply-left",
          port: "function",
        },
      },
      {
        id: "w-left-apply",
        points: [
          { x: 176, y: 328 },
          { x: 260, y: 320 },
        ],
        sourceHint: {
          kind: "element_port",
          elementId: "left",
          port: "value",
        },
        targetHint: {
          kind: "element_port",
          elementId: "apply-left",
          port: "argument",
        },
      },
      {
        id: "w-partial-apply",
        points: [
          { x: 380, y: 305 },
          { x: 460, y: 350 },
        ],
        sourceHint: {
          kind: "element_port",
          elementId: "apply-left",
          port: "result",
        },
        targetHint: {
          kind: "element_port",
          elementId: "apply-right",
          port: "function",
        },
      },
      {
        id: "w-right-apply",
        points: [
          { x: 356, y: 408 },
          { x: 460, y: 380 },
        ],
        sourceHint: {
          kind: "element_port",
          elementId: "right",
          port: "value",
        },
        targetHint: {
          kind: "element_port",
          elementId: "apply-right",
          port: "argument",
        },
      },
      {
        id: "w-result",
        points: [
          { x: 580, y: 365 },
          { x: 700, y: 365 },
        ],
        sourceHint: {
          kind: "element_port",
          elementId: "apply-right",
          port: "result",
        },
        targetHint: {
          kind: "boundary_port",
          containerId: "entry",
          boundaryId: "entry-result",
        },
      },
    ],
    junctions: [],
  },
  surfaceLibraryCalls: [
    {
      id: "library_call_1",
      library: "tilefold.std",
      functionId: "nat.add",
      templateId: "tilefold.std.nat.add",
      version: "v1",
      functionElementId: "add-function",
      applyElementIds: ["apply-left", "apply-right"],
    },
  ],
};

function coreTypeJson(type: "nat" | "nat-to-nat") {
  return type === "nat" ? "nat" : { arrow: ["nat", "nat"] };
}

function standardCallProject({
  functionId,
  templateId,
  functionResultType,
  args,
}: {
  functionId: string;
  templateId: string;
  functionResultType: "nat" | "nat-to-nat";
  args: string[];
}) {
  const elements: Array<Record<string, unknown>> = [
    {
      id: "unit-drop",
      kind: "drop",
      bounds: { x: 80, y: 80, width: 88, height: 56 },
      properties: { type: "unit" },
      portAnchors: [{ port: "input", x: 80, y: 108 }],
    },
    {
      id: "std-function",
      kind: "function",
      bounds: { x: 80, y: 180, width: 128, height: 72 },
      properties: {
        templateId,
        parameterType: "nat",
        resultType: coreTypeJson(functionResultType),
        captures: [],
      },
      portAnchors: [{ port: "value", x: 208, y: 216 }],
    },
  ];
  for (const [index, value] of args.entries()) {
    const x = 80 + index * 180;
    const y = 300 + index * 60;
    elements.push({
      id: `argument-${index}`,
      kind: "nat_literal",
      bounds: { x, y, width: 96, height: 56 },
      properties: { value },
      portAnchors: [{ port: "value", x: x + 96, y: y + 28 }],
    });
  }
  for (const [index] of args.entries()) {
    const x = 260 + index * 190;
    const y = 260 + index * 60;
    elements.push({
      id: `apply-${index}`,
      kind: "apply",
      bounds: { x, y, width: 120, height: 90 },
      properties: {
        parameterType: "nat",
        resultType: coreTypeJson(index === args.length - 1 ? "nat" : "nat-to-nat"),
      },
      portAnchors: [
        { port: "function", x, y: y + 30 },
        { port: "argument", x, y: y + 60 },
        { port: "result", x: x + 120, y: y + 45 },
      ],
    });
  }
  const wires: Array<Record<string, unknown>> = [
    {
      id: "w-unit-drop",
      points: [
        { x: 0, y: 108 },
        { x: 80, y: 108 },
      ],
      sourceHint: {
        kind: "boundary_port",
        containerId: "entry",
        boundaryId: "entry-parameter",
      },
      targetHint: { kind: "element_port", elementId: "unit-drop", port: "input" },
    },
  ];
  for (const [index] of args.entries()) {
    const source =
      index === 0
        ? {
            hint: { kind: "element_port", elementId: "std-function", port: "value" },
            point: { x: 208, y: 216 },
          }
        : {
            hint: {
              kind: "element_port",
              elementId: `apply-${index - 1}`,
              port: "result",
            },
            point: {
              x: 260 + (index - 1) * 190 + 120,
              y: 260 + (index - 1) * 60 + 45,
            },
          };
    const applyX = 260 + index * 190;
    const applyY = 260 + index * 60;
    wires.push({
      id: `w-function-${index}`,
      points: [source.point, { x: applyX, y: applyY + 30 }],
      sourceHint: source.hint,
      targetHint: {
        kind: "element_port",
        elementId: `apply-${index}`,
        port: "function",
      },
    });
    const argumentX = 80 + index * 180;
    const argumentY = 300 + index * 60;
    wires.push({
      id: `w-argument-${index}`,
      points: [
        { x: argumentX + 96, y: argumentY + 28 },
        { x: applyX, y: applyY + 60 },
      ],
      sourceHint: {
        kind: "element_port",
        elementId: `argument-${index}`,
        port: "value",
      },
      targetHint: {
        kind: "element_port",
        elementId: `apply-${index}`,
        port: "argument",
      },
    });
  }
  wires.push({
    id: "w-result",
    points: [
      { x: 260 + (args.length - 1) * 190 + 120, y: 260 + (args.length - 1) * 60 + 45 },
      { x: 700, y: 365 },
    ],
    sourceHint: {
      kind: "element_port",
      elementId: `apply-${args.length - 1}`,
      port: "result",
    },
    targetHint: {
      kind: "boundary_port",
      containerId: "entry",
      boundaryId: "entry-result",
    },
  });
  return {
    format: "tilefold-project",
    version: 1,
    geometry: {
      snapTolerance: 8,
      elements,
      containers: [
        {
          id: "entry",
          kind: {
            kind: "entry",
            templateId: "entry_template",
            resultType: "nat",
            dependencies: [templateId],
          },
          bounds: { x: 0, y: 0, width: 700, height: 500 },
          boundaryPorts: [
            {
              id: "entry-parameter",
              role: "parameter",
              type: "unit",
              anchor: { x: 0, y: 108 },
            },
            {
              id: "entry-result",
              role: "result",
              type: "nat",
              anchor: { x: 700, y: 365 },
            },
          ],
        },
      ],
      wires,
      junctions: [],
    },
    surfaceLibraryCalls: [
      {
        id: "library-call",
        library: "tilefold.std",
        functionId,
        templateId,
        version: "v1",
        functionElementId: "std-function",
        applyElementIds: args.map((_arg, index) => `apply-${index}`),
      },
    ],
  };
}

function foldedStandardCallProject({
  functionId,
  templateId,
  args,
}: {
  functionId: string;
  templateId: string;
  args: string[];
}) {
  const height = Math.max(82, 58 + args.length * 24);
  const spacing = height / (args.length + 1);
  const argY = (index: number) => Math.round(220 + spacing * (index + 1));
  return {
    format: "tilefold-project",
    version: 1,
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
          id: "std-call",
          kind: "library_call",
          bounds: { x: 220, y: 220, width: 156, height },
          properties: {
            library: "tilefold.std",
            functionId,
            templateId,
            version: "v1",
          },
          portAnchors: [
            ...args.map((_arg, index) => ({
              port: `arg_${index}`,
              x: 220,
              y: argY(index),
            })),
            { port: "result", x: 376, y: 220 + Math.round(height / 2) },
          ],
        },
        ...args.map((value, index) => ({
          id: `argument-${index}`,
          kind: "nat_literal",
          bounds: { x: 80, y: argY(index) - 28, width: 96, height: 56 },
          properties: { value },
          portAnchors: [{ port: "value", x: 176, y: argY(index) }],
        })),
      ],
      containers: [
        {
          id: "entry",
          kind: {
            kind: "entry",
            templateId: "entry_template",
            resultType: "nat",
            dependencies: [templateId],
          },
          bounds: { x: 0, y: 0, width: 600, height: 420 },
          boundaryPorts: [
            {
              id: "entry-parameter",
              role: "parameter",
              type: "unit",
              anchor: { x: 0, y: 108 },
            },
            {
              id: "entry-result",
              role: "result",
              type: "nat",
              anchor: { x: 600, y: 220 + Math.round(height / 2) },
            },
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
          sourceHint: {
            kind: "boundary_port",
            containerId: "entry",
            boundaryId: "entry-parameter",
          },
          targetHint: { kind: "element_port", elementId: "unit-drop", port: "input" },
        },
        ...args.map((_value, index) => ({
          id: `w-argument-${index}`,
          points: [
            { x: 176, y: argY(index) },
            { x: 220, y: argY(index) },
          ],
          sourceHint: {
            kind: "element_port",
            elementId: `argument-${index}`,
            port: "value",
          },
          targetHint: {
            kind: "element_port",
            elementId: "std-call",
            port: `arg_${index}`,
          },
        })),
        {
          id: "w-result",
          points: [
            { x: 376, y: 220 + Math.round(height / 2) },
            { x: 600, y: 220 + Math.round(height / 2) },
          ],
          sourceHint: {
            kind: "element_port",
            elementId: "std-call",
            port: "result",
          },
          targetHint: {
            kind: "boundary_port",
            containerId: "entry",
            boundaryId: "entry-result",
          },
        },
      ],
      junctions: [],
    },
    surfaceLibraryCalls: [
      {
        id: "library-call",
        library: "tilefold.std",
        functionId,
        templateId,
        version: "v1",
        functionElementId: "std-call",
        applyElementIds: [],
      },
    ],
  };
}

test("runs a Standard Library add call transparently and with fast execution", async ({
  page,
}, testInfo) => {
  const issues = watchBrowserIssues(page);
  const fixturePath = testInfo.outputPath("standard-library-add.tilefold.json");
  writeFileSync(fixturePath, `${JSON.stringify(stdAddProject, null, 2)}\n`);

  await page.goto("/");
  await expect(page.getByRole("button", { name: "Add Standard Library add" })).toBeVisible();
  await page.getByLabel("Open JSON file").setInputFiles(fixturePath);
  await expect(page.getByTestId("element-add-function-kind-label")).toHaveText("add");

  await page.getByLabel("Execution mode").selectOption("transparent");
  await page.getByRole("button", { name: "Run" }).click();
  await expect(page.getByText(/Result:/)).toContainText("Result: Nat(5)");
  await expect(page.getByText("FastCallCompleted(tilefold.std.nat.add@v1)")).toHaveCount(0);

  await page.getByLabel("Execution mode").selectOption("fast");
  await page.getByRole("button", { name: "Run" }).click();
  await expect(page.getByText(/Result:/)).toContainText("Result: Nat(5) · 1 rewrites");
  await expect(
    page.getByRole("button", {
      name: "Event 1: FastCallCompleted(tilefold.std.nat.add@v1)",
    }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Event 1: FastCallCompleted(tilefold.std.nat.add@v1)",
    })
    .click();
  await expect(page.getByTestId("element-add-function")).toHaveAttribute(
    "data-trace-highlighted",
    "true",
  );

  await expectNoBrowserIssues(issues);
});

test("places a complete multi-argument Standard Library call from the palette", async ({
  page,
}) => {
  const issues = watchBrowserIssues(page);
  await page.goto("/");

  const beforeApplyCount = await page.locator('g.element-node[data-node-kind="apply"]').count();
  const beforeLibraryCallCount = await page
    .locator('g.element-node[data-node-kind="library_call"]')
    .count();
  await page.getByRole("button", { name: "Add Standard Library add" }).click();

  await expect
    .poll(() => page.locator('g.element-node[data-node-kind="apply"]').count())
    .toBe(beforeApplyCount);
  await expect
    .poll(() =>
      page.locator('g.element-node[data-node-kind="library_call"]').count(),
    )
    .toBe(beforeLibraryCallCount + 1);
  const functionNode = page.locator(
    'g.element-node[data-node-kind="library_call"][data-template-id="tilefold.std.nat.add"]',
  );
  await expect(functionNode).toBeVisible();
  const functionId = await functionNode.getAttribute("data-node-id");
  expect(functionId).not.toBeNull();
  await expect(page.getByTestId(`element-${functionId}-kind-label`)).toHaveText(
    "add",
  );
  await expect(page.getByTestId(`element-${functionId}-library-source`)).toHaveText(
    "Standard Library",
  );
  await expect(functionNode).toHaveAttribute("data-library", "tilefold.std");
  await expect(functionNode).toHaveAttribute("data-library-function-id", "nat.add");
  await functionNode.click();
  await page
    .getByRole("button", { name: "Open Standard Library definition add" })
    .click();
  await expect(page.getByRole("heading", { name: "add" })).toBeVisible();
  await expect(page.getByText("Immutable definition · read only")).toBeVisible();
  await page.getByRole("button", { name: "Back to call" }).click();
  await expect(page.getByTestId(`element-${functionId}-kind-label`)).toBeVisible();

  await expectNoBrowserIssues(issues);
});

test("compares Standard Library transparent and fast execution for all exposed calls", async ({
  page,
}, testInfo) => {
  const issues = watchBrowserIssues(page);
  const cases = [
    {
      name: "add",
      project: foldedStandardCallProject({
        functionId: "nat.add",
        templateId: "tilefold.std.nat.add",
        args: ["2", "3"],
      }),
      expected: "Nat(5)",
    },
    {
      name: "multiply",
      project: foldedStandardCallProject({
        functionId: "nat.multiply",
        templateId: "tilefold.std.nat.multiply",
        args: ["3", "4"],
      }),
      expected: "Nat(12)",
    },
    {
      name: "double",
      project: foldedStandardCallProject({
        functionId: "nat.double",
        templateId: "tilefold.std.nat.double",
        args: ["6"],
      }),
      expected: "Nat(12)",
    },
    {
      name: "square",
      project: foldedStandardCallProject({
        functionId: "nat.square",
        templateId: "tilefold.std.nat.square",
        args: ["5"],
      }),
      expected: "Nat(25)",
    },
  ];

  for (const scenario of cases) {
    const fixturePath = testInfo.outputPath(`standard-library-${scenario.name}.tilefold.json`);
    writeFileSync(fixturePath, `${JSON.stringify(scenario.project, null, 2)}\n`);
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Add Standard Library add" })).toBeVisible();
    await page.getByLabel("Open JSON file").setInputFiles(fixturePath);
    await expect(page.getByTestId("element-std-call-kind-label")).toHaveText(
      scenario.name,
    );

    await page.getByLabel("Execution mode").selectOption("transparent");
    await page.getByRole("button", { name: "Run" }).click();
    await expect(page.getByText(/Result:/)).toContainText(`Result: ${scenario.expected}`);

    await page.getByLabel("Execution mode").selectOption("fast");
    await page.getByRole("button", { name: "Run" }).click();
    await expect(page.getByText(/Result:/)).toContainText(`Result: ${scenario.expected}`);
    await expect(
      page.getByRole("button", {
        name: new RegExp(`FastCallCompleted\\(tilefold\\.std\\.nat\\.${scenario.name}@v1\\)`),
      }),
    ).toBeVisible();
  }

  await expectNoBrowserIssues(issues);
});
