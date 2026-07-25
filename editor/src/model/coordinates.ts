import type { Point, SavedView } from "./project";

export interface CameraViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SvgLike {
  getScreenCTM(): DOMMatrix | null;
  createSVGPoint(): DOMPoint;
}

const MIN_ZOOM_RATIO = 0.25;
const MAX_ZOOM_RATIO = 4;

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

export function parseViewBox(value: string): CameraViewBox | null {
  const values = value
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (
    values.length !== 4 ||
    values.some((item) => !Number.isFinite(item)) ||
    values[2] <= 0 ||
    values[3] <= 0
  ) {
    return null;
  }
  return {
    x: values[0],
    y: values[1],
    width: values[2],
    height: values[3],
  };
}

function formatCameraNumber(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

export function formatViewBox(viewBox: CameraViewBox): string {
  return [
    viewBox.x,
    viewBox.y,
    viewBox.width,
    viewBox.height,
  ]
    .map(formatCameraNumber)
    .join(" ");
}

export function panViewBox(
  viewBox: CameraViewBox,
  delta: Point,
): CameraViewBox {
  return {
    ...viewBox,
    x: viewBox.x + delta.x,
    y: viewBox.y + delta.y,
  };
}

export function zoomViewBox(
  viewBox: CameraViewBox,
  anchor: Point,
  factor: number,
  reference: CameraViewBox,
): CameraViewBox {
  if (!Number.isFinite(factor) || factor <= 0) return viewBox;
  const minimumWidth = reference.width / MAX_ZOOM_RATIO;
  const maximumWidth = reference.width / MIN_ZOOM_RATIO;
  const nextWidth = Math.min(
    maximumWidth,
    Math.max(minimumWidth, viewBox.width * factor),
  );
  const appliedFactor = nextWidth / viewBox.width;
  return {
    x: anchor.x - (anchor.x - viewBox.x) * appliedFactor,
    y: anchor.y - (anchor.y - viewBox.y) * appliedFactor,
    width: nextWidth,
    height: viewBox.height * appliedFactor,
  };
}

export function cameraZoomPercent(
  viewBox: CameraViewBox,
  reference: CameraViewBox,
): number {
  return Math.round((reference.width / viewBox.width) * 100);
}

export function savedViewBox(view?: SavedView): string {
  const zoom = view && view.zoom > 0 ? view.zoom : 1;
  const width = 400 / zoom;
  const height = 260 / zoom;
  return `${view?.cameraX ?? 0} ${view?.cameraY ?? 0} ${width} ${height}`;
}
