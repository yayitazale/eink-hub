import { useRef, useState, type PointerEvent } from 'react';
import { Clock } from 'lucide-react';
import { useI18n } from '../i18n';
import { Button, Modal, cx, inputClass } from './ui';

const pad = (n: number) => String(n).padStart(2, '0');
const parse = (v: string) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(v);
  return m ? { h: Math.min(23, Number(m[1])), m: Math.min(59, Number(m[2])) } : { h: 7, m: 0 };
};

/**
 * Our own time field (Material You time picker) instead of <input type="time">: shows HH:MM and
 * opens a dialog with the hour and minute (typeable) and a 24-hour dial.
 */
export function TimeField({
  value,
  onChange,
  disabled,
  'aria-label': ariaLabel,
  className,
}: {
  /** "HH:MM", or empty for nothing chosen yet. */
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  'aria-label'?: string;
  className?: string;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        disabled={disabled}
        aria-label={ariaLabel ? `${ariaLabel}: ${value || '--:--'}` : undefined}
        onClick={() => setOpen(true)}
        className={cx(
          inputClass,
          'flex items-center justify-between gap-2 text-left tabular-nums disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
      >
        <span className={cx(!value && 'text-muted')}>{value || '--:--'}</span>
        <Clock className="size-4 shrink-0 text-muted" />
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={t('picker.time')} wide="sm">
        {open && (
          <TimePicker
            initial={parse(value)}
            onCancel={() => setOpen(false)}
            onDone={(h, m) => {
              onChange(`${pad(h)}:${pad(m)}`);
              setOpen(false);
            }}
          />
        )}
      </Modal>
    </>
  );
}

const SIZE = 256;
const C = SIZE / 2;
const OUTER = 104;
const INNER = 68;

/** Angle in degrees from 12 o'clock, clockwise. */
const angleOf = (x: number, y: number) => ((Math.atan2(x - C, C - y) * 180) / Math.PI + 360) % 360;
const at = (deg: number, r: number) => ({ x: C + r * Math.sin((deg * Math.PI) / 180), y: C - r * Math.cos((deg * Math.PI) / 180) });

function TimePicker({ initial, onCancel, onDone }: { initial: { h: number; m: number }; onCancel: () => void; onDone: (h: number, m: number) => void }) {
  const { t } = useI18n();
  const [h, setH] = useState(initial.h);
  const [m, setM] = useState(initial.m);
  const [mode, setMode] = useState<'h' | 'm'>('h');
  // While typing, the boxes hold what was typed; otherwise they show the padded value.
  const [draft, setDraft] = useState<{ h?: string; m?: string }>({});
  const minuteBox = useRef<HTMLInputElement>(null);
  const dial = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  // Android-style 24 h dial: 1–12 on the outer ring, 00 and 13–23 on the inner one.
  const hourRing = (hour: number) => (hour >= 1 && hour <= 12 ? OUTER : INNER);
  const fromPointer = (e: PointerEvent<HTMLDivElement>) => {
    const r = dial.current!.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * SIZE;
    const y = ((e.clientY - r.top) / r.height) * SIZE;
    const deg = angleOf(x, y);
    if (mode === 'm') return setM(Math.round(deg / 6) % 60);
    const idx = Math.round(deg / 30) % 12;
    const inner = Math.hypot(x - C, y - C) < (OUTER + INNER) / 2;
    setH(inner ? (idx === 0 ? 0 : idx + 12) : idx === 0 ? 12 : idx);
  };

  const hand = mode === 'h' ? at((h % 12) * 30, hourRing(h)) : at(m * 6, OUTER);
  const labels =
    mode === 'h'
      ? [
          ...Array.from({ length: 12 }, (_, i) => ({ v: i === 0 ? 12 : i, r: OUTER })),
          ...Array.from({ length: 12 }, (_, i) => ({ v: i === 0 ? 0 : i + 12, r: INNER })),
        ].map((l) => ({ ...l, text: l.r === INNER ? pad(l.v) : String(l.v), pos: at((l.v % 12) * 30, l.r), on: l.v === h }))
      : Array.from({ length: 12 }, (_, i) => i * 5).map((v) => ({ v, r: OUTER, text: pad(v), pos: at(v * 6, OUTER), on: v === m }));

  const box = (which: 'h' | 'm') => {
    const val = which === 'h' ? h : m;
    return (
      <input
        ref={which === 'm' ? minuteBox : undefined}
        inputMode="numeric"
        aria-label={t(which === 'h' ? 'picker.hour' : 'picker.minute')}
        value={draft[which] ?? pad(val)}
        onFocus={(e) => {
          setMode(which);
          e.target.select();
        }}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, '').slice(-2);
          setDraft((d) => ({ ...d, [which]: digits }));
          const n = Number(digits);
          if (digits && n <= (which === 'h' ? 23 : 59)) (which === 'h' ? setH : setM)(n);
          if (which === 'h' && digits.length === 2) minuteBox.current?.focus();
        }}
        onBlur={() => setDraft((d) => ({ ...d, [which]: undefined }))}
        className={cx(
          'h-20 w-24 rounded-2xl text-center text-5xl font-medium tabular-nums outline-none transition',
          mode === which ? 'bg-accent-soft text-accent' : 'bg-surface-2 text-ink hover:bg-line/60',
        )}
      />
    );
  };

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="flex items-center gap-2">
        {box('h')}
        <span className="text-5xl font-medium text-ink-2">:</span>
        {box('m')}
      </div>

      <div
        ref={dial}
        aria-hidden
        className="relative touch-none select-none rounded-full bg-surface-2"
        style={{ width: SIZE, height: SIZE }}
        onPointerDown={(e) => {
          dragging.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          fromPointer(e);
        }}
        onPointerMove={(e) => dragging.current && fromPointer(e)}
        onPointerUp={() => {
          dragging.current = false;
          // Like Material: choosing the hour moves on to the minutes.
          if (mode === 'h') setMode('m');
        }}
      >
        <svg className="pointer-events-none absolute inset-0" viewBox={`0 0 ${SIZE} ${SIZE}`}>
          <line x1={C} y1={C} x2={hand.x} y2={hand.y} className="stroke-accent" strokeWidth={2} />
          <circle cx={C} cy={C} r={4} className="fill-accent" />
          <circle cx={hand.x} cy={hand.y} r={20} className="fill-accent" />
        </svg>
        {labels.map((l) => (
          <span
            key={`${l.r}-${l.v}`}
            className={cx(
              'pointer-events-none absolute flex size-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full tabular-nums',
              l.r === INNER ? 'text-xs' : 'text-sm',
              l.on ? 'font-semibold text-white' : l.r === INNER ? 'text-muted' : 'text-ink',
            )}
            style={{ left: l.pos.x, top: l.pos.y }}
          >
            {l.text}
          </span>
        ))}
      </div>

      <div className="flex w-full justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <Button variant="primary" onClick={() => onDone(h, m)}>
          {t('common.ok')}
        </Button>
      </div>
    </div>
  );
}
