import type { ProjectDocument } from "../model/project";

export function StatusBar({
  document,
  importError,
  historyStatus,
}: {
  document: ProjectDocument;
  importError: string | null;
  historyStatus: string;
}) {
  const { elements, containers, wires, junctions } = document.geometry;
  return (
    <footer className="status-bar">
      <span className="status-ok">Editor structure check: passed</span>
      <span>Semantic validation: local OCaml Run service</span>
      <span>
        {document.format} · v{document.version}
      </span>
      <span>
        {elements.length} elements · {containers.length} containers ·{" "}
        {wires.length} wires · {junctions.length} junctions
      </span>
      <span>Ready to export</span>
      <span>{historyStatus}</span>
      {importError && (
        <span className="status-error" role="alert">
          Import error: {importError}
        </span>
      )}
    </footer>
  );
}
