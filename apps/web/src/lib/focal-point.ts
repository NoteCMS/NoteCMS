/** CSS `object-position` from normalized focal point (0–1), for `object-fit: cover` crops. */
export function focalToObjectPosition(fp: { x: number; y: number } | undefined) {
  const x = fp?.x ?? 0.5;
  const y = fp?.y ?? 0.5;
  return `${x * 100}% ${y * 100}%`;
}

export function clamp01(n: number) {
  if (Number.isNaN(n)) return 0.5;
  return Math.min(1, Math.max(0, n));
}
