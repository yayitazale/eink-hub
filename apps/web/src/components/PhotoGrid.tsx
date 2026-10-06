import { Check } from 'lucide-react';
import { cx } from './ui';
import { useI18n } from '../i18n';

export interface GridItem<K> {
  key: K;
  src: string;
  label?: string;
}

/** Square-ish photo grid with optional multi-select. */
export function PhotoGrid<K extends string | number>({
  items,
  selected,
  onToggle,
  onOpen,
}: {
  items: GridItem<K>[];
  selected?: Set<K>;
  onToggle?: (k: K) => void;
  onOpen?: (k: K) => void;
}) {
  const { t } = useI18n();
  const selecting = !!selected && selected.size > 0;
  return (
    <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
      {items.map((it) => {
        const isSel = selected?.has(it.key);
        return (
          <div key={it.key} className="group relative aspect-square overflow-hidden rounded-xl bg-surface-2">
            <img
              src={it.src}
              alt={it.label ?? ''}
              loading="lazy"
              className={cx('size-full cursor-pointer object-cover transition', isSel && 'scale-90 rounded-lg')}
              onClick={() => (selecting && onToggle ? onToggle(it.key) : onOpen?.(it.key))}
            />
            {onToggle && (
              <button
                onClick={() => onToggle(it.key)}
                className={cx(
                  'absolute top-2 left-2 flex size-6 items-center justify-center rounded-full border-2 transition',
                  isSel ? 'border-accent bg-accent text-white' : 'border-white/90 bg-black/10 opacity-0 group-hover:opacity-100',
                  selecting && 'opacity-100',
                )}
                aria-label={t('common.select')}
              >
                {isSel && <Check className="size-3.5" strokeWidth={3} />}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
