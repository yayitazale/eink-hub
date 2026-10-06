import { ImageOff } from 'lucide-react';
import { renderUrl, thumbUrl, type Frame } from '../lib/api';
import { cx } from './ui';

/** Physical-looking frame (black bezel + white mat) showing what is on the canvas. */
export function FrameMockup({
  frame,
  src,
  className,
}: {
  frame: Pick<Frame, 'orientation' | 'currentRender' | 'currentImageId' | 'width' | 'height'>;
  src?: string | null;
  className?: string;
}) {
  const landscape = frame.orientation === 'landscape';
  const short = Math.min(frame.width, frame.height);
  const long = Math.max(frame.width, frame.height);
  // Renders are stored portrait; for landscape frames show the un-rotated thumbnail instead.
  const image =
    src ??
    (frame.currentRender && !landscape
      ? renderUrl(frame.currentRender)
      : frame.currentImageId
        ? thumbUrl(frame.currentImageId)
        : null);
  return (
    <div className={cx('frame-outer', className)}>
      <div className="frame-mat">
        <div className="frame-screen relative" style={{ aspectRatio: landscape ? `${long}/${short}` : `${short}/${long}` }}>
          {image ? (
            <img src={image} alt="" className="absolute inset-0 size-full object-cover" loading="lazy" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-[#b9b4aa]">
              <ImageOff className="size-8" strokeWidth={1.5} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
