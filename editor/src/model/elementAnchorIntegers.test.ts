import exampleJson from "../../../examples/nat-succ.tilefold.json?raw";
import { describe, expect, it } from "vitest";
import { applyEditorCommand } from "./editorCommands";
import { addElement, type AddableElementKind } from "./editorOps";
import { exportProjectJson, parseProjectJson } from "./importProject";

const ADDABLE_KINDS: readonly AddableElementKind[] = [
  "unit_literal",
  "bool_literal",
  "nat_literal",
  "succ",
  "drop",
  "copy",
  "pair",
  "unpair",
  "apply",
  "bool_rec",
  "nat_rec",
];

describe("generated element geometry", () => {
  it.each(ADDABLE_KINDS)(
    "creates integer port anchors for %s",
    (kind) => {
      const project = parseProjectJson(exampleJson);
      const added = addElement(project, kind, { x: 500, y: 300 });

      expect(
        added.element.portAnchors.every(
          (anchor) =>
            Number.isInteger(anchor.x) && Number.isInteger(anchor.y),
        ),
      ).toBe(true);
      expect(() =>
        parseProjectJson(exportProjectJson(added.document)),
      ).not.toThrow();
    },
  );

  it.each(["pair", "unpair"] as const)(
    "keeps editor moves available after adding %s",
    (kind) => {
      const project = parseProjectJson(exampleJson);
      const added = addElement(project, kind, { x: 500, y: 300 });
      const before = {
        x: added.element.bounds.x,
        y: added.element.bounds.y,
      };
      const result = applyEditorCommand(added.document, {
        type: "move_element",
        id: added.element.id,
        from: before,
        to: { x: before.x + 17, y: before.y + 11 },
      });

      expect(result.error).toBeUndefined();
      expect(
        result.document.geometry.elements.find(
          (element) => element.id === added.element.id,
        )?.bounds,
      ).toMatchObject({ x: before.x + 17, y: before.y + 11 });
      expect(() =>
        parseProjectJson(exportProjectJson(result.document)),
      ).not.toThrow();
    },
  );
});
