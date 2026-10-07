import type { CSSProperties } from 'react';
import { ImageOff } from 'lucide-react';
import { renderUrl, thumbUrl, type Frame, type FrameAppearance, type FrameColor } from '../lib/api';
import { frameGeometry, withDefaults } from '../lib/frameGeometry';
import { cx } from './ui';

type Side = 'top' | 'right' | 'bottom' | 'left';
const SIDES: Side[] = ['top', 'right', 'bottom', 'left'];
/** Light from the top left. */
const LIGHT: Record<Side, string> = {
  top: 'rgb(255 255 255 / 0.10)',
  left: 'rgb(255 255 255 / 0.03)',
  right: 'rgb(0 0 0 / 0.10)',
  bottom: 'rgb(0 0 0 / 0.20)',
};
/** Gradient direction from the outer edge of a moulding towards the picture. */
const INWARD: Record<Side, string> = { top: 'to bottom', right: 'to left', bottom: 'to top', left: 'to right' };

/** The moulding's material, without lighting. */
function material(color: FrameColor, side: Side) {
  const vertical = side === 'left' || side === 'right';
  if (color === 'black') return 'linear-gradient(135deg, #2a2926, #161513)';
  if (color === 'white') return 'linear-gradient(135deg, #f8f6f1, #e8e5de)';
  // Wood: real grain, running along the moulding (see public/textures).
  return `url(/textures/${color}-${vertical ? 'v' : 'h'}.webp)`;
}

/** Cross-section of the moulding, outer edge → picture. Classic has a stepped inner bevel. */
function profile(style: 'thin' | 'thick' | 'classic', dir: string) {
  if (style === 'classic')
    return `linear-gradient(${dir}, rgb(255 255 255 / 0.22) 0%, rgb(255 255 255 / 0) 9%, rgb(0 0 0 / 0) 54%, rgb(0 0 0 / 0.35) 56%, rgb(255 255 255 / 0.18) 59%, rgb(0 0 0 / 0.04) 62%, rgb(0 0 0 / 0.32) 97%, rgb(0 0 0 / 0.5) 100%)`;
  return `linear-gradient(${dir}, rgb(255 255 255 / 0.2) 0%, rgb(255 255 255 / 0) ${style === 'thin' ? 18 : 8}%, rgb(0 0 0 / 0) ${style === 'thin' ? 84 : 93}%, rgb(0 0 0 / 0.4) 100%)`;
}

const mm = (n: number) => `calc(var(--mm) * ${n.toFixed(2)})`;

/** Physical-looking framed canvas at real proportions, showing what is on it. */
export function FrameMockup({
  frame,
  src,
  className,
  appearance: override,
}: {
  frame: Pick<Frame, 'orientation' | 'currentRender' | 'currentImageId' | 'width' | 'height'> & {
    kind?: Frame['kind'];
    diagonal?: number | null;
    appearance?: FrameAppearance;
  };
  src?: string | null;
  className?: string;
  /** Unsaved appearance, for a live preview. */
  appearance?: FrameAppearance;
}) {
  const landscape = frame.orientation === 'landscape';
  // BLOOMIN8 renders are stored portrait; for landscape ones show the un-rotated thumbnail instead.
  const rotated = landscape && (frame.kind ?? 'bloomin8') === 'bloomin8';
  const image =
    src ??
    (frame.currentRender && !rotated
      ? renderUrl(frame.currentRender)
      : frame.currentImageId
        ? thumbUrl(frame.currentImageId)
        : null);
  const look = withDefaults(override ?? frame.appearance);
  const g = frameGeometry(frame, look);
  const F = g.face;
  const bevel = look.mat ? 2 : 0;

  const piece = (side: Side): CSSProperties => {
    const horizontal = side === 'top' || side === 'bottom';
    const f = mm(F);
    const clip = {
      top: `polygon(0 0, 100% 0, calc(100% - ${f}) 100%, ${f} 100%)`,
      bottom: `polygon(${f} 0, calc(100% - ${f}) 0, 100% 100%, 0 100%)`,
      left: `polygon(0 0, 100% ${f}, 100% calc(100% - ${f}), 0 100%)`,
      right: `polygon(0 ${f}, 100% 0, 100% 100%, 0 calc(100% - ${f}))`,
    }[side];
    return {
      position: 'absolute',
      [side]: 0,
      ...(horizontal ? { left: 0, right: 0, height: f } : { top: 0, bottom: 0, width: f }),
      clipPath: clip,
      backgroundImage: `${profile(look.style, INWARD[side])}, linear-gradient(${LIGHT[side]}, ${LIGHT[side]}), ${material(look.color, side)}`,
      backgroundSize: `auto, auto, ${mm(220)} ${mm(220)}`,
    };
  };

  return (
    <div
      className={cx('frame-mockup', className)}
      style={
        {
          aspectRatio: `${g.width} / ${g.height}`,
          '--W': g.width,
          '--depth': g.depth,
        } as CSSProperties
      }
    >
      {look.mat && (
        <div className="frame-mat" style={{ inset: mm(F) }}>
          <div className="frame-bevel" style={{ inset: mm(g.mat - bevel), borderWidth: mm(bevel) }} />
        </div>
      )}
      <div className="frame-screen" style={{ inset: mm(F + g.mat) }}>
        {image ? (
          <img src={image} alt="" className="absolute inset-0 size-full object-cover" loading="lazy" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-[#b9b4aa]">
            <ImageOff className="size-8" strokeWidth={1.5} />
          </div>
        )}
      </div>
      {SIDES.map((s) => (
        <div key={s} style={piece(s)} />
      ))}
    </div>
  );
}

