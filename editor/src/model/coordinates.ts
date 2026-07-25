import type { Point, SavedView } from "./project";

export interface SvgLike {
  getScreenCTM(): DOMMatrix | null;
  createSVGPoint(): DOMPoint;
}

export function clientToProject(
  svg: SvgLike,
  clientX: number,
  clientY: number,
): Point | null {
  const matrix = svg.getScreenCTM();
  if (!matrix) return null;
  const point = svg.createSVGPoint();
  point.x = clientX;
  point.y = clientY;
  const transformed = point.matrixTransform(matrix.inverse());
  return { x: Math.round(transformed.x), y: Math.round(transformed.y) };
}

export function savedViewBox(view?: SavedView): string {
  const zoom = view && view.zoom > 0 ? view.zoom : 1;
  const width = 400 / zoom;
  const height = 260 / zoom;
  return `${view?.cameraX ?? 0} ${view?.cameraY ?? 0} ${width} ${height}`;
}
