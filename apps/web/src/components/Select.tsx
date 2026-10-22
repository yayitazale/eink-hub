import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import { cx, inputClass, openLayers } from './ui';

export interface SelectOption<T> {
  value: T;
  label: ReactNode;
  /** Plain text for type-ahead when the label isn't a string. */
  text?: string;
  disabled?: boolean;
}

const MENU_MAX = 320;
const GAP = 6;

/**
 * Our own dropdown (Material You menu) instead of the native <select>: a field like the other
 * inputs that opens a list anchored to it, below or above depending on the room left.
 * Keyboard: arrows, Home/End, Enter/Space, Escape and type-ahead, as a listbox.
 */
export function Select<T extends string | number>({
  value,
  onChange,
  options,
  placeholder,
  disabled,
  className,
  'aria-label': ariaLabel,
}: {
  value: T | '' | null | undefined;
  onChange: (v: T) => void;
  options: SelectOption<T>[];
  /** Shown (muted) while nothing is chosen. */
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [pos, setPos] = useState<CSSProperties>({});
  const typed = useRef({ text: '', at: 0 });

  const selectedIndex = options.findIndex((o) => o.value === value);
  const selected = options[selectedIndex];

  const place = useCallback(() => {
    const r = trigger.current?.getBoundingClientRect();
    if (!r) return;
    const below = window.innerHeight - r.bottom - GAP - 8;
    const above = r.top - GAP - 8;
    const wanted = Math.min(MENU_MAX, options.length * 44 + 16);
    const up = below < wanted && above > below;
    setPos({
      left: Math.max(8, Math.min(r.left, window.innerWidth - Math.max(r.width, 180) - 8)),
      minWidth: r.width,
      maxWidth: Math.max(r.width, window.innerWidth - 16),
      maxHeight: Math.min(MENU_MAX, up ? above : below),
      ...(up ? { bottom: window.innerHeight - r.top + GAP } : { top: r.bottom + GAP }),
    });
  }, [options.length]);

  const show = () => {
    if (disabled) return;
    place();
    setActive(selectedIndex >= 0 ? selectedIndex : options.findIndex((o) => !o.disabled));
    setOpen(true);
  };
  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) trigger.current?.focus();
  };
  const pick = (i: number) => {
    const o = options[i];
    if (!o || o.disabled) return;
    if (o.value !== value) onChange(o.value);
    close();
  };

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const layer = Symbol();
    openLayers.push(layer);
    const outside = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!menu.current?.contains(t) && !trigger.current?.contains(t)) close(false);
    };
    const reposition = () => place();
    document.addEventListener('pointerdown', outside, true);
    window.addEventListener('resize', reposition);
    // Scrolling the page (or the sheet the field is in) moves the field: the menu follows it.
    window.addEventListener('scroll', reposition, true);
    return () => {
      openLayers.splice(openLayers.indexOf(layer), 1);
      document.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open, place]);

  useEffect(() => {
    if (open && active >= 0) menu.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  const step = (from: number, dir: 1 | -1) => {
    for (let i = from + dir; i >= 0 && i < options.length; i += dir) if (!options[i].disabled) return i;
    return from;
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault();
        show();
      }
      return;
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActive((a) => step(a, 1));
        return;
      case 'ArrowUp':
        e.preventDefault();
        setActive((a) => step(a, -1));
        return;
      case 'Home':
        e.preventDefault();
        setActive(step(-1, 1));
        return;
      case 'End':
        e.preventDefault();
        setActive(step(options.length, -1));
        return;
      case 'Enter':
      case ' ':
        e.preventDefault();
        pick(active);
        return;
      case 'Escape':
        // Closing the menu takes it off the layer stack straight away (React flushes effects for key
        // events), so a sheet listening on window would see the same Escape: keep it from getting there.
        e.preventDefault();
        e.stopPropagation();
        close();
        return;
      case 'Tab':
        close(false);
        return;
    }
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const now = Date.now();
      typed.current = { text: (now - typed.current.at < 700 ? typed.current.text : '') + e.key.toLowerCase(), at: now };
      const label = (o: SelectOption<T>) => (o.text ?? (typeof o.label === 'string' ? o.label : String(o.value))).toLowerCase();
      const i = options.findIndex((o) => !o.disabled && label(o).startsWith(typed.current.text));
      if (i >= 0) setActive(i);
    }
  };

  return (
    <>
      <button
        ref={trigger}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${id}-menu` : undefined}
        aria-activedescendant={open && active >= 0 ? `${id}-${active}` : undefined}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => (open ? close() : show())}
        onKeyDown={onKeyDown}
        className={cx(
          inputClass,
          'flex items-center justify-between gap-2 text-left disabled:cursor-not-allowed disabled:opacity-50',
          open && 'border-ink/40 bg-surface',
          className,
        )}
      >
        <span className={cx('min-w-0 truncate', !selected && 'text-muted')}>{selected ? selected.label : (placeholder ?? '')}</span>
        <ChevronDown className={cx('size-4 shrink-0 text-muted transition', open && 'rotate-180')} />
      </button>
      {open &&
        createPortal(
          <ul
            ref={menu}
            id={`${id}-menu`}
            role="listbox"
            aria-label={ariaLabel}
            style={pos}
            className="menu-in fixed z-[70] overflow-y-auto rounded-2xl border border-line/70 bg-surface py-2 shadow-lift"
            // Clicks inside must not reach whatever is under the menu (e.g. a card-wide button).
            onClick={(e) => e.stopPropagation()}
          >
            {options.map((o, i) => (
              <li
                key={String(o.value)}
                id={`${id}-${i}`}
                data-i={i}
                role="option"
                aria-selected={i === selectedIndex}
                aria-disabled={o.disabled || undefined}
                onPointerEnter={() => !o.disabled && setActive(i)}
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => pick(i)}
                className={cx(
                  'mx-2 flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-xl px-3 text-sm transition-colors',
                  o.disabled && 'cursor-default opacity-40',
                  i === selectedIndex ? 'bg-accent-soft font-semibold text-accent' : i === active && 'bg-surface-2',
                  i === selectedIndex && i === active && 'ring-1 ring-accent/30',
                )}
              >
                <span className="min-w-0 truncate">{o.label}</span>
                {i === selectedIndex && <Check className="size-4 shrink-0" />}
              </li>
            ))}
          </ul>,
          document.body,
        )}
    </>
  );
}
