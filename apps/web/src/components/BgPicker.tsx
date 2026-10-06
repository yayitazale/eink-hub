import { useEffect, useRef, useState } from 'react';
import { HexColorInput, HexColorPicker } from 'react-colorful';
import { Pipette } from 'lucide-react';
import { cx } from './ui';

const PRESETS = ['#ffffff', '#f4f1eb', '#000000'];

/** Border colour for "Encajar" (fit: contain): three presets plus a free colour in a popover picker. */
export function BgPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const custom = !PRESETS.includes(value.toLowerCase());

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative flex items-center gap-3">
      {PRESETS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={cx('size-9 rounded-full border-2', value.toLowerCase() === c ? 'border-accent' : 'border-line')}
          style={{ background: c }}
          aria-label={c}
        />
      ))}
      <button
        type="button"
        aria-label="Color"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cx('flex size-9 items-center justify-center rounded-full border-2 bg-surface-2 text-muted', custom || open ? 'border-accent' : 'border-line')}
        style={custom ? { background: value } : undefined}
      >
        <Pipette className={cx('size-4', custom && 'text-white mix-blend-difference')} />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-2 w-[220px] space-y-3 rounded-2xl border border-line bg-surface p-3 shadow-lift">
          <HexColorPicker color={value} onChange={onChange} style={{ width: '100%' }} />
          <div className="flex items-center gap-2 text-sm font-semibold text-muted">
            #
            <HexColorInput
              color={value}
              onChange={onChange}
              className="min-w-0 flex-1 rounded-lg border border-line bg-surface-2 px-2 py-1.5 font-mono text-ink uppercase"
            />
          </div>
        </div>
      )}
    </div>
  );
}
