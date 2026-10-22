import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, FolderPlus, ImagePlus, Images, RefreshCw, Send, Trash2, Upload } from 'lucide-react';
import { api, thumbUrl, type Collection, type Image } from '../lib/api';
import { relativeTime } from '../lib/format';
import { useI18n } from '../i18n';
import { useAction, useCollections } from '../lib/hooks';
import { PhotoGrid } from '../components/PhotoGrid';
import { SendDialog } from '../components/SendDialog';
import { Button, Card, Empty, Field, Modal, Pill, SectionTitle, Spinner, inputClass, useConfirm, useToast } from '../components/ui';

export function NewCollectionDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated?: (c: Collection) => void }) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const create = useAction((n: string) => api.post<Collection>('/api/collections', { name: n, type: 'manual' }), {
    success: t('library.created'),
    invalidate: [['collections']],
  });
  return (
    <Modal open={open} onClose={onClose} title={t('library.new')}>
      <Field label={t('common.name')}>
        <input className={inputClass} autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={t('library.name_placeholder')} />
      </Field>
      <Button
        variant="primary"
        className="mt-4 w-full"
        disabled={!name.trim()}
        loading={create.isPending}
        onClick={() =>
          create.mutate(name, {
            onSuccess: (c) => {
              setName('');
              onCreated?.(c);
              onClose();
            },
          })
        }
      >
        {t('common.create')}
      </Button>
    </Modal>
  );
}

function CollectionCard({ c, onOpen }: { c: Collection; onOpen: () => void }) {
  const { t, tn } = useI18n();
  return (
    <button onClick={onOpen} className="group text-left">
      <div className="aspect-[4/5] overflow-hidden rounded-3xl bg-surface-2">
        {c.coverImageId ? (
          <img src={thumbUrl(c.coverImageId)} alt="" className="size-full object-cover transition duration-500 group-hover:scale-105" loading="lazy" />
        ) : (
          <div className="flex size-full items-center justify-center text-muted">
            <Images className="size-8" strokeWidth={1.5} />
          </div>
        )}
      </div>
      <h3 className="mt-3 truncate font-bold">{c.name}</h3>
      <p className="text-[13px] text-muted">
        {t(`collectionType.${c.type}`)} · {tn('common.photos', c.itemCount)}
      </p>
    </button>
  );
}

function CollectionView({ collection, onBack }: { collection: Collection; onBack: () => void }) {
  const { t, tn } = useI18n();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState(new Set<number>());
  const [sendId, setSendId] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const images = useQuery({
    queryKey: ['images', collection.id],
    queryFn: () => api.get<{ items: Image[]; total: number }>(`/api/images?collectionId=${collection.id}&limit=500`),
  });
  const invalidate = [['images'], ['collections']];
  const sync = useAction(() => api.post(`/api/collections/${collection.id}/sync`), { success: t('library.synced'), invalidate });
  const removeItems = useAction((ids: number[]) => api.del(`/api/collections/${collection.id}/items`, { imageIds: ids }), {
    success: t('library.removed_items'),
    invalidate,
  });
  const deleteCol = useAction(() => api.del(`/api/collections/${collection.id}`), { success: t('library.deleted'), invalidate });
  const isManual = collection.type === 'manual';

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      const form = new FormData();
      for (const f of Array.from(files)) form.append('files', f, f.name);
      await api.post(`/api/images?collectionId=${collection.id}`, form);
      toast(tn('library.uploaded', files.length), 'ok');
      qc.invalidateQueries({ queryKey: ['images'] });
      qc.invalidateQueries({ queryKey: ['collections'] });
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setUploading(false);
    }
  };

  const toggle = (id: number) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div
      onDragOver={(e) => isManual && e.preventDefault()}
      onDrop={(e) => {
        if (!isManual) return;
        e.preventDefault();
        upload(e.dataTransfer.files);
      }}
    >
      <button onClick={onBack} className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> {t('nav.library')}
      </button>
      <SectionTitle
        title={collection.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            {t(`collectionType.${collection.type}`)} · {tn('common.photos', collection.itemCount)}
            {collection.lastSync && <span>· {t('library.synced_ago', { when: relativeTime(collection.lastSync) })}</span>}
            {collection.syncError && <Pill tone="warn">{collection.syncError}</Pill>}
          </span>
        }
        action={
          <div className="flex flex-wrap gap-2">
            {isManual ? (
              <>
                <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => upload(e.target.files)} />
                <Button variant="primary" icon={<Upload className="size-4" />} loading={uploading} onClick={() => fileRef.current?.click()}>
                  {t('library.upload')}
                </Button>
              </>
            ) : (
              <Button icon={<RefreshCw className="size-4" />} loading={sync.isPending} onClick={() => sync.mutate()}>
                {t('library.sync')}
              </Button>
            )}
            <Button
              variant="danger"
              icon={<Trash2 className="size-4" />}
              onClick={async () =>
                (await confirm({ title: t('common.delete'), message: t('library.confirm_delete', { name: collection.name }) })) &&
                deleteCol.mutate(undefined, { onSuccess: onBack })
              }
            >
              {t('common.delete')}
            </Button>
          </div>
        }
      />
      {selected.size > 0 && (
        <div className="sticky top-16 z-20 mb-4 flex items-center justify-between rounded-full bg-ink px-5 py-2.5 text-paper shadow-lift md:top-4">
          <span className="text-sm font-semibold">{tn('common.selected', selected.size)}</span>
          <div className="flex gap-2">
            {isManual && (
              <Button size="sm" variant="secondary" onClick={() => removeItems.mutate([...selected], { onSuccess: () => setSelected(new Set()) })}>
                {t('library.remove_from')}
              </Button>
            )}
            <Button size="sm" variant="ghost" className="text-paper" onClick={() => setSelected(new Set())}>
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      )}
      {images.isLoading ? (
        <Spinner />
      ) : images.data?.items.length ? (
        <PhotoGrid
          items={images.data.items.map((i) => ({ key: i.id, src: thumbUrl(i.id), label: i.originalName ?? '' }))}
          selected={selected}
          onToggle={toggle}
          onOpen={setSendId}
        />
      ) : (
        <Empty icon={<ImagePlus className="size-6" />} title={t('library.empty_collection')}>
          {t(isManual ? 'library.empty_manual_hint' : 'library.empty_dynamic_hint')}
        </Empty>
      )}
      <SendDialog imageId={sendId} open={sendId !== null} onClose={() => setSendId(null)} />
    </div>
  );
}

export function Library() {
  const { t } = useI18n();
  const collections = useCollections();
  const [openId, setOpenId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const open = collections.data?.find((c) => c.id === openId);

  if (open) return <CollectionView collection={open} onBack={() => setOpenId(null)} />;

  const manual = collections.data?.filter((c) => c.type === 'manual') ?? [];
  const dynamic = collections.data?.filter((c) => c.type !== 'manual') ?? [];

  return (
    <>
      <SectionTitle
        title={t('nav.library')}
        subtitle={t('library.subtitle')}
        action={
          <Button variant="primary" icon={<FolderPlus className="size-4" />} onClick={() => setCreating(true)}>
            {t('library.new')}
          </Button>
        }
      />
      {collections.isLoading ? (
        <Spinner />
      ) : !collections.data?.length ? (
        <Empty icon={<Images className="size-6" />} title={t('library.empty')}>
          {t('library.empty_hint')}
        </Empty>
      ) : (
        <div className="space-y-10">
          {manual.length > 0 && (
            <section>
              <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-muted">{t('library.mine')}</h2>
              <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-5">
                {manual.map((c) => (
                  <CollectionCard key={c.id} c={c} onOpen={() => setOpenId(c.id)} />
                ))}
              </div>
            </section>
          )}
          {dynamic.length > 0 && (
            <section>
              <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-muted">{t('library.from_immich')}</h2>
              <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-5">
                {dynamic.map((c) => (
                  <CollectionCard key={c.id} c={c} onOpen={() => setOpenId(c.id)} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
      <p className="mt-10 flex items-center justify-center gap-2 text-center text-xs text-muted">
        <Send className="size-3.5 shrink-0" />
        {t('library.tip')}
      </p>
      <NewCollectionDialog open={creating} onClose={() => setCreating(false)} onCreated={(c) => setOpenId(c.id)} />
    </>
  );
}
