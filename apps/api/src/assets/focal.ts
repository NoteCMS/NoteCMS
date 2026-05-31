/** Clamp focal point coordinates to 0–1 (center = 0.5). */
export function normalizeFocal01(value: unknown, fallback = 0.5): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback;
  return Math.min(1, Math.max(0, value));
}
