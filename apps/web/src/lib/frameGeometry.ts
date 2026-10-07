import type { Frame, FrameAppearance, FrameColor, FrameStyle } from './api';

export const FRAME_COLORS: FrameColor[] = ['black', 'white', 'walnut', 'oak', 'natural'];
export const FRAME_STYLES: FrameStyle[] = ['thin', 'thick', 'classic'];
/** Sizes offered in settings (inches). */
export const KNOWN_DIAGONALS = [7.3, 13.3, 28.5, 31.5];

/** Moulding profiles, in mm: visible face width and depth off the wall. */
const PROFILES: Record<FrameStyle, { face: number; depth: number }> = {
  thin: { face: 12, depth: 20 },
  thick: { face: 35, depth: 30 },
  classic: { face: 22, depth: 25 },
};

export const DEFAULT_APPEARANCE: Required<FrameAppearance> = { mat: true, color: 'black', style: 'thin' };

export function withDefaults(a?: FrameAppearance | null): Required<FrameAppearance> {
  return { ...DEFAULT_APPEARANCE, ...(a ?? {}) };
}

export interface FrameGeometry {
  /** Outer size as hung, mm. */
  width: number;
  height: number;
  /** Visible screen, mm. */
  screenW: number;
  screenH: number;
  /** Moulding face and passepartout width (0 without one), mm. */
  face: number;
  mat: number;
  depth: number;
}

/** Real-world proportions of the framed canvas, so a 7.3" and a 28.5" don't look alike. */
export function frameGeometry(
  frame: Pick<Frame, 'width' | 'height' | 'orientation'> & { diagonal?: number | null },
  appearance: Required<FrameAppearance>,
): FrameGeometry {
  const short = Math.min(frame.width, frame.height);
  const long = Math.max(frame.width, frame.height);
  // Unknown size: assume the common 13.3".
  const diag = (frame.diagonal ?? 13.3) * 25.4;
  const k = diag / Math.hypot(short, long);
  const [sw, sh] = frame.orientation === 'landscape' ? [long * k, short * k] : [short * k, long * k];
  const { face, depth } = PROFILES[appearance.style];
  // Wider mats on bigger canvases, as a framer would cut them.
  const mat = appearance.mat ? Math.max(35, Math.min(sw, sh) * 0.18) : 0;
  return { width: sw + 2 * (mat + face), height: sh + 2 * (mat + face), screenW: sw, screenH: sh, face, mat, depth };
}

/** "30 × 37 cm" */
export const formatCm = (g: FrameGeometry) => `${Math.round(g.width / 10)} × ${Math.round(g.height / 10)} cm`;
