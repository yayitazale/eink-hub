import type { Frame } from '../db/schema.js';

/** Known E Ink panels by resolution (short × long side) → diagonal in inches. */
const BY_RESOLUTION: Record<string, number> = {
  '480x800': 7.3,
  '1200x1600': 13.3,
  '2160x3060': 28.5,
  '1440x2560': 31.5,
};

/**
 * Physical screen diagonal in inches, from what the frame tells us about itself:
 * the panel part number ("EL133UF1" → 13.3), the size in the model name ('AI Art Frame 7.3"'),
 * or a known resolution. Null when nothing matches; the user can then set it by hand.
 */
export function inferDiagonal(f: Pick<Frame, 'model' | 'width' | 'height'>): number | null {
  const model = f.model ?? '';
  // E Ink part numbers carry tenths of an inch: EL073… = 7.3", EL133… = 13.3", EL285… = 28.5".
  const part = /EL(\d{3})/i.exec(model);
  if (part) return Number(part[1]) / 10;
  const inches = /(\d{1,2}(?:\.\d)?)\s*(?:"|''|″|in\b|inch)/i.exec(model);
  if (inches) return Number(inches[1]);
  const short = Math.min(f.width, f.height);
  const long = Math.max(f.width, f.height);
  return BY_RESOLUTION[`${short}x${long}`] ?? null;
}
