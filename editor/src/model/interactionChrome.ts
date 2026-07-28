export const INTERACTION_CHROME = {
  portVisibleRadiusPx: 5,
  portHitRadiusPx: 12,
  resizeHandleVisibleRadiusPx: 5,
  resizeHandleHitRadiusPx: 13,
  boundaryPortVisibleRadiusPx: 6,
  wireEndpointVisibleRadiusPx: 6,
  wireEndpointHitRadiusPx: 12,
} as const;

export function screenUnits(px: number, pixelsPerCanvasUnit: number): number {
  const scale =
    Number.isFinite(pixelsPerCanvasUnit) && pixelsPerCanvasUnit > 0
      ? pixelsPerCanvasUnit
      : 1;
  return px / scale;
}

export function pixelsPerCanvasUnit(
  viewBox: { width: number; height: number } | null,
  viewport: { width: number; height: number },
): number {
  if (
    !viewBox ||
    viewBox.width <= 0 ||
    viewBox.height <= 0 ||
    viewport.width <= 0 ||
    viewport.height <= 0
  ) {
    return 1;
  }
  return Math.min(viewport.width / viewBox.width, viewport.height / viewBox.height);
}
