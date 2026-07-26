import exampleJson from "../../../examples/nat-succ.tilefold.json?raw";
import { describe, expect, it } from "vitest";
import { exportProjectJson, parseProjectJson, StructureError } from "./importProject";

describe("Project JSON v1 import and export", () => {
  it("parses the shared OCaml example", () => {
    const project = parseProjectJson(exampleJson);
    expect(project.format).toBe("tilefold-project");
    expect(project.version).toBe(1);
    expect(project.geometry.elements).toHaveLength(3);
  });

  it.each([
    ["format", { format: "other" }, "$.format"],
    ["version", { version: 2 }, "$.version"],
  ])("rejects a mismatched %s", (_name, patch, path) => {
    const input = { ...JSON.parse(exampleJson), ...patch };
    expect(() => parseProjectJson(JSON.stringify(input))).toThrow(
      expect.objectContaining<Partial<StructureError>>({ path }),
    );
  });

  it("includes the path for a missing required field", () => {
    const input = JSON.parse(exampleJson);
    delete input.geometry.wires;
    expect(() => parseProjectJson(JSON.stringify(input))).toThrow(
      "$.geometry.wires",
    );
  });

  it("rejects a wrong bounds type and non-integer coordinate", () => {
    const wrongType = JSON.parse(exampleJson);
    wrongType.geometry.elements[0].bounds = "not-bounds";
    expect(() => parseProjectJson(JSON.stringify(wrongType))).toThrow(
      "$.geometry.elements[0].bounds",
    );

    const fractional = JSON.parse(exampleJson);
    fractional.geometry.elements[0].bounds.x = 0.5;
    expect(() => parseProjectJson(JSON.stringify(fractional))).toThrow(
      "$.geometry.elements[0].bounds.x",
    );
  });

  it("rejects unknown v1 element kinds instead of dropping them", () => {
    const input = JSON.parse(exampleJson);
    input.geometry.elements[0].kind = "future_kind";
    expect(() => parseProjectJson(JSON.stringify(input))).toThrow(
      'unknown element kind "future_kind"',
    );
  });

  it("rejects missing and malformed Core type properties", () => {
    const missing = JSON.parse(exampleJson);
    delete missing.geometry.elements[0].properties.type;
    expect(() => parseProjectJson(JSON.stringify(missing))).toThrow(
      "$.geometry.elements[0].properties.type",
    );

    const malformed = JSON.parse(exampleJson);
    malformed.geometry.elements[0].properties.type = {
      arrow: ["nat"],
    };
    expect(() => parseProjectJson(JSON.stringify(malformed))).toThrow(
      "expected two type entries",
    );
  });

  it("preserves large Nat strings and meaningful orders", () => {
    const input = JSON.parse(exampleJson);
    const huge = "12345678901234567890123456789012345678901234567890";
    input.geometry.elements[1].properties.value = huge;
    input.geometry.wires[0].points = [
      { x: 3, y: 7 },
      { x: 11, y: 13 },
      { x: 17, y: 19 },
    ];
    input.geometry.junctions = [
      {
        id: "j",
        anchor: { x: 0, y: 0 },
        outlets: [
          { id: "later", order: 9, anchor: { x: 9, y: 0 } },
          { id: "earlier", order: 2, anchor: { x: 2, y: 0 } },
        ],
      },
    ];
    const project = parseProjectJson(JSON.stringify(input));
    const exported = exportProjectJson(project);
    const reparsed = parseProjectJson(exported);
    expect(reparsed.geometry.elements[1]?.properties).toEqual({ value: huge });
    expect(reparsed.geometry.wires[0]?.points).toEqual(input.geometry.wires[0].points);
    expect(reparsed.geometry.junctions[0]?.outlets).toEqual(
      input.geometry.junctions[0].outlets,
    );
    expect(exported).not.toContain(`"value": ${huge}`);
  });

  it("does not export editor-only state", () => {
    const project = parseProjectJson(exampleJson);
    const editorState = {
      document: project,
      selection: { type: "element", id: "node_nat_2" },
      drag: { x: 10, y: 20 },
    };
    const exported = exportProjectJson(editorState.document);
    expect(exported).not.toContain("selection");
    expect(exported).not.toContain('"drag"');
    expect(parseProjectJson(exported)).toEqual(project);
  });
});
