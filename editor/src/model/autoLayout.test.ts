import { describe, expect, it } from "vitest";
import exampleJson from "../../../examples/nat-succ.tilefold.json?raw";
import {
  applyAutoLayoutDocument,
  autoLayoutDocument,
  overlappingBounds,
  stripLayoutForComparison,
} from "./autoLayout";
import { exportProjectJson, parseProjectJson } from "./importProject";
import type { ProjectDocument, ProjectElement } from "./project";

function overlapEntryNodes(document: ProjectDocument): ProjectDocument {
  const elements = document.geometry.elements.map((element, index) => {
    if (index > 2) return element;
    const x = 80 + index * 8;
    const y = 90 + index * 8;
    const dx = x - element.bounds.x;
    const dy = y - element.bounds.y;
    return {
      ...element,
      bounds: { ...element.bounds, x, y },
      portAnchors: element.portAnchors.map((anchor) => ({
        ...anchor,
        x: anchor.x + dx,
        y: anchor.y + dy,
      })),
    };
  });
  return {
    ...document,
    geometry: { ...document.geometry, elements },
  };
}

function entryElements(document: ProjectDocument): ProjectElement[] {
  return document.geometry.elements.filter(
    (element) =>
      element.bounds.x >= 0 &&
      element.bounds.y >= 0 &&
      element.bounds.x + element.bounds.width <= 420 &&
      element.bounds.y + element.bounds.height <= 260,
  );
}

describe("auto layout", () => {
  it("arranges overlapped entry nodes without changing semantic fields", () => {
    const before = overlapEntryNodes(parseProjectJson(exampleJson));
    const result = autoLayoutDocument(before, {
      kind: "container",
      containerId: "entry",
    });
    expect("error" in result ? result.error : undefined).toBeUndefined();
    if ("error" in result) return;

    expect(stripLayoutForComparison(result.document)).toEqual(
      stripLayoutForComparison(before),
    );
    const arranged = entryElements(result.document);
    expect(
      overlappingBounds(
        arranged.map((element) => ({ id: element.id, bounds: element.bounds })),
        4,
      ),
    ).toEqual([]);
    expect(result.changedElementIds.length).toBeGreaterThan(0);
    expect(result.changedWireIds.length).toBeGreaterThan(0);
    expect(() =>
      parseProjectJson(exportProjectJson(result.document)),
    ).not.toThrow();
  });

  it("is deterministic and idempotent for the same project layout", () => {
    const before = overlapEntryNodes(parseProjectJson(exampleJson));
    const first = autoLayoutDocument(before, { kind: "project" });
    const second = autoLayoutDocument(before, { kind: "project" });
    expect("error" in first ? first.error : undefined).toBeUndefined();
    expect("error" in second ? second.error : undefined).toBeUndefined();
    if ("error" in first || "error" in second) return;
    expect(first.document.geometry).toEqual(second.document.geometry);

    const repeated = autoLayoutDocument(first.document, { kind: "project" });
    expect("error" in repeated ? repeated.error : undefined).toBeUndefined();
    if ("error" in repeated) return;
    expect(repeated.changedElementIds).toEqual([]);
    expect(repeated.changedContainerIds).toEqual([]);
    expect(repeated.changedWireIds).toEqual([]);
  });

  it("rejects layout patches that change non-layout data", () => {
    const before = parseProjectJson(exampleJson);
    const result = autoLayoutDocument(before, { kind: "project" });
    expect("error" in result ? result.error : undefined).toBeUndefined();
    if ("error" in result) return;
    const natId = result.document.geometry.elements.find(
      (candidate) => candidate.kind === "nat_literal",
    )?.id;
    const tampered = {
      ...result.document,
      geometry: {
        ...result.document.geometry,
        elements: result.document.geometry.elements.map((element) =>
          element.id === natId && element.kind === "nat_literal"
            ? { ...element, properties: { value: "99" } }
            : element,
        ),
      },
    };
    expect(applyAutoLayoutDocument(before, tampered).error).toBe(
      "Auto Layout attempted to change non-layout project data.",
    );
  });
});
