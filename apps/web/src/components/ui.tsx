import { createContext, useCallback, useContext, useEffect, useRef, useState, type ButtonHTMLAttributes, type PointerEvent, type ReactNode } from 'react';
import { Loader2, X } from 'lucide-react';
import { useI18n } from '../i18n';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');
export { cx };

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent';

export function Button({
  variant = 'secondary',
  size = 'md',
  loading,
  icon,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg'; loading?: boolean; icon?: ReactNode }) {
  const styles: Record<Variant, string> = {
    primary: 'bg-ink text-paper hover:opacity-90',
    accent: 'bg-accent text-white hover:opacity-90',
    secondary: 'bg-surface text-ink border border-line hover:bg-surface-2',
    ghost: 'text-ink-2 hover:bg-surface-2',
    danger: 'bg-surface text-red-600 border border-line hover:bg-red-50 dark:hover:bg-red-950/30',
  };
  const sizes = { sm: 'h-8 px-3 text-[13px] gap-1.5', md: 'h-10 px-4 text-sm gap-2', lg: 'h-12 px-6 text-[15px] gap-2' };
  return (
    <button
      className={cx(
        'inline-flex items-center justify-center rounded-full font-semibold transition disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap',
        styles[variant],
        sizes[size],
        className,
      )}
      disabled={loading || rest.disabled}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

export function IconButton({ className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cx('inline-flex size-9 items-center justify-center rounded-full text-ink-2 transition hover:bg-surface-2 disabled:opacity-40', className)}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx('rounded-3xl bg-surface shadow-soft border border-line/60', className)} {...rest}>
      {children}
    </div>
  );
}

export function SectionTitle({ title, subtitle, action }: { title: string; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-[28px] font-bold tracking-tight leading-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx('size-5 animate-spin text-muted', className)} />;
}

export function Empty({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-line px-6 py-16 text-center">
      <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-surface-2 text-muted">{icon}</div>
      <h3 className="font-semibold">{title}</h3>
      {children && <div className="mt-2 max-w-sm text-sm text-muted">{children}</div>}
    </div>
  );
}

export function Pill({ tone = 'neutral', children }: { tone?: 'neutral' | 'ok' | 'warn' | 'accent'; children: ReactNode }) {
  const tones = {
    neutral: 'bg-surface-2 text-ink-2',
    ok: 'bg-leaf-soft text-leaf',
    warn: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
    accent: 'bg-accent-soft text-accent',
  };
  return <span className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold', tones[tone])}>{children}</span>;
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  fill,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode }[];
  className?: string;
  /** Stretch to the container and share the width equally (never overflows). */
  fill?: boolean;
}) {
  return (
    <div className={cx('rounded-full bg-surface-2 p-1 border border-line/60', fill ? 'flex w-full' : 'inline-flex', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cx(
            'rounded-full py-1.5 text-[13px] font-semibold transition whitespace-nowrap',
            fill ? 'min-w-0 flex-1 truncate px-2' : 'px-3.5',
            value === o.value ? 'bg-surface text-ink shadow-soft' : 'text-muted hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** `group` renders a <div> instead of a <label>, for controls made of several buttons. */
export function Field({ label, hint, children, group }: { label: string; hint?: ReactNode; children: ReactNode; group?: boolean }) {
  const Tag = group ? 'div' : 'label';
  return (
    <Tag className="block min-w-0">
      <span className="mb-1.5 block text-[13px] font-semibold text-ink-2">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </Tag>
  );
}

export function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3">
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{label}</span>
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
      <input type="checkbox" className="size-5 shrink-0 accent-[var(--ink)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

export const inputClass =
  'w-full h-11 rounded-2xl border border-line bg-surface-2 px-4 text-sm outline-none transition focus:border-ink/40 focus:bg-surface placeholder:text-muted';

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** `true`: room for a cropper (4xl); `'md'`: a form next to a small preview (3xl, so long translations fit). */
  wide?: boolean | 'md';
}) {
  const { t } = useI18n();
  const sheet = useSheetDrag(onClose);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-[2px] sm:items-center sm:p-6" onClick={onClose}>
      <div
        className={cx(
          'flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[28px] bg-surface shadow-lift sm:rounded-[28px]',
          wide === 'md' ? 'sm:max-w-3xl' : wide ? 'sm:max-w-4xl' : 'sm:max-w-lg',
        )}
        style={sheet.style}
        onClick={(e) => e.stopPropagation()}
      >
        {/* On a phone it is a bottom sheet: drag the top (handle or title) down to close it. */}
        <div className="touch-none select-none sm:touch-auto sm:select-auto" {...sheet.handlers}>
          <div className="flex justify-center pt-2.5 sm:hidden" aria-hidden>
            <span className="h-1.5 w-10 rounded-full bg-line" />
          </div>
          <div className="flex items-center justify-between px-6 pt-3 pb-3 sm:pt-5">
            <h2 className="text-lg font-bold">{title}</h2>
            <IconButton onClick={onClose} onPointerDown={(e) => e.stopPropagation()} aria-label={t('common.close')}>
              <X className="size-5" />
            </IconButton>
          </div>
        </div>
        <div className="min-w-0 overflow-y-auto overflow-x-hidden px-6 pb-6">{children}</div>
      </div>
    </div>
  );
}

/** Swipe-down-to-close for bottom sheets (phone layout only). */
function useSheetDrag(onClose: () => void) {
  const [dy, setDy] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ y: number; t: number } | null>(null);
  const handlers = {
    onPointerDown: (e: PointerEvent<HTMLDivElement>) => {
      if (window.matchMedia('(min-width: 640px)').matches) return;
      start.current = { y: e.clientY, t: e.timeStamp };
      e.currentTarget.setPointerCapture(e.pointerId);
      setDragging(true);
    },
    onPointerMove: (e: PointerEvent<HTMLDivElement>) => {
      if (start.current) setDy(Math.max(0, e.clientY - start.current.y));
    },
    onPointerUp: (e: PointerEvent<HTMLDivElement>) => {
      const s = start.current;
      if (!s) return;
      start.current = null;
      setDragging(false);
      const moved = Math.max(0, e.clientY - s.y);
      // Far enough, or a quick flick.
      if (moved > 120 || (moved > 30 && moved / Math.max(1, e.timeStamp - s.t) > 0.6)) {
        setDy(window.innerHeight);
        setTimeout(() => {
          setDy(0);
          onClose();
        }, 180);
      } else setDy(0);
    },
    onPointerCancel: () => {
      start.current = null;
      setDragging(false);
      setDy(0);
    },
  };
  const style = { transform: dy ? `translateY(${dy}px)` : undefined, transition: dragging ? 'none' : 'transform 180ms ease-out' };
  return { handlers, style };
}

// --- Toasts ---------------------------------------------------------------------------------
type Toast = { id: number; text: string; tone: 'ok' | 'error' | 'info' };
const ToastCtx = createContext<(text: string, tone?: Toast['tone']) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, tone: Toast['tone'] = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cx(
              'pointer-events-auto max-w-md rounded-2xl px-4 py-3 text-sm font-medium shadow-lift',
              t.tone === 'error' ? 'bg-red-600 text-white' : 'bg-ink text-paper',
            )}
          >
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);
