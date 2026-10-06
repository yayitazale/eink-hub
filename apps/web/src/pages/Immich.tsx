import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { ArrowLeft, CheckCheck, RectangleHorizontal, RectangleVertical, Heart, History, Search, Sparkles, Users, Images, Plus, Send, FolderPlus } from 'lucide-react';
import { api, immichThumb, type Collection, type CollectionType, type ImmichAssetLite } from '../lib/api';
import { useAction, useCollections, useImmichStatus } from '../lib/hooks';
import { useI18n } from '../i18n';
import { PhotoGrid } from '../components/PhotoGrid';
import { SendDialog } from '../components/SendDialog';
import { Button, Empty, Modal, SectionTitle, Segmented, Spinner, cx, inputClass } from '../components/ui';

type Tab = 'albums' | 'people' | 'favorites' | 'memories' | 'search';
type SearchBody = { kind: 'smart' | 'metadata'; query?: string; albumId?: string; personIds?: string[]; favorites?: boolean; all?: boolean };

function useAssetSearch(body: SearchBody | null) {
  return useInfiniteQuery({
    queryKey: ['immich', 'search', body],
    enabled: !!body,
    initialPageParam: 1,
    queryFn: ({ pageParam }) => api.post<{ items: ImmichAssetLite[]; nextPage: number | null }>('/api/immich/search', { ...body, page: pageParam }),
    getNextPageParam: (last) => last.nextPage ?? undefined,
  });
}

/** Creates a dynamic (auto-synced) collection from an Immich source. */
function SyncButton({ type, config, defaultName, label }: { type: CollectionType; config: Record<string, unknown>; defaultName: string; label?: string }) {
  const { t, tn } = useI18n();
  const create = useAction(() => api.post<Collection>('/api/collections', { name: defaultName, type, config }), {
    success: (c) => tn('immich.collection_created', c.itemCount, { name: c.name }),
    invalidate: [['collections']],
  });
  return (
    <Button variant="primary" icon={<Plus className="size-4" />} loading={create.isPending} onClick={() => create.mutate(undefined)}>
      {label ?? t('immich.create_synced')}
    </Button>
  );
}

function AssetBrowser({ assets, loadMore, hasMore, loading, header }: { assets: ImmichAssetLite[]; loadMore?: () => void; hasMore?: boolean; loading?: boolean; header?: ReactNode }) {
  const { t, tn } = useI18n();
  const collections = useCollections();
  const [selected, setSelected] = useState(new Set<string>());
  const [sendImageId, setSendImageId] = useState<number | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const importAssets = useAction((b: { assetIds: string[]; collectionId?: number }) => api.post<{ imageIds: number[] }>('/api/immich/import', b), {
    invalidate: [['collections'], ['images']],
  });

  const open = (id: string) => importAssets.mutate({ assetIds: [id] }, { onSuccess: (r) => setSendImageId(r.imageIds[0]) });
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const manual = collections.data?.filter((c) => c.type === 'manual') ?? [];
  const selectAll = () => setSelected(new Set(assets.map((a) => a.id)));

  return (
    <div>
      {header}
      {selected.size === 0 && assets.length > 1 && (
        <div className="mb-3 flex justify-end">
          <Button size="sm" variant="ghost" icon={<CheckCheck className="size-4" />} onClick={selectAll}>
            {t('immich.select_all', { n: assets.length })}
          </Button>
        </div>
      )}
      {selected.size > 0 && (
        <div className="sticky top-16 z-20 mb-4 flex items-center justify-between gap-2 rounded-full bg-ink px-5 py-2.5 text-paper shadow-lift md:top-4">
          <span className="text-sm font-semibold">{tn('common.selected', selected.size)}</span>
          <div className="flex gap-2">
            {selected.size < assets.length && (
              <Button size="sm" variant="ghost" className="text-paper" onClick={selectAll}>
                {t('immich.all')}
              </Button>
            )}
            {selected.size === 1 && (
              <Button size="sm" icon={<Send className="size-3.5" />} onClick={() => open([...selected][0])}>
                {t('device.show')}
              </Button>
            )}
            <Button size="sm" icon={<FolderPlus className="size-3.5" />} onClick={() => setAddOpen(true)}>
              {t('immich.add_to_collection')}
            </Button>
            <Button size="sm" variant="ghost" className="text-paper" onClick={() => setSelected(new Set())}>
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      )}
      {loading ? (
        <Spinner />
      ) : assets.length ? (
        <PhotoGrid items={assets.map((a) => ({ key: a.id, src: immichThumb(a.id), label: a.name }))} selected={selected} onToggle={toggle} onOpen={open} />
      ) : (
        <Empty icon={<Images className="size-6" />} title={t('immich.no_photos')} />
      )}
      {hasMore && (
        <div className="mt-6 flex justify-center">
          <Button onClick={loadMore}>{t('immich.load_more')}</Button>
        </div>
      )}
      {importAssets.isPending && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/10">
          <Spinner className="size-8" />
        </div>
      )}
      <SendDialog imageId={sendImageId} open={sendImageId !== null} onClose={() => setSendImageId(null)} />
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title={t('immich.add_to_collection')}>
        {manual.length === 0 ? (
          <p className="text-sm text-muted">
            {t('immich.need_manual')}{' '}
            <Link to="/library" className="font-semibold text-accent">
              {t('immich.go_library')}
            </Link>
          </p>
        ) : (
          <div className="space-y-2">
            {manual.map((c) => (
              <button
                key={c.id}
                className="flex w-full items-center justify-between rounded-2xl bg-surface-2 px-4 py-3 text-left font-semibold hover:bg-line/50"
                onClick={() =>
                  importAssets.mutate(
                    { assetIds: [...selected], collectionId: c.id },
                    {
                      onSuccess: () => {
                        setAddOpen(false);
                        setSelected(new Set());
                      },
                    },
                  )
                }
              >
                {c.name}
                <span className="text-sm font-normal text-muted">{tn('common.photos', c.itemCount)}</span>
              </button>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}

function SearchResults({ body, header }: { body: SearchBody; header?: ReactNode }) {
  const q = useAssetSearch(body);
  const assets = q.data?.pages.flatMap((p) => p.items) ?? [];
  return <AssetBrowser assets={assets} loading={q.isLoading} hasMore={q.hasNextPage} loadMore={() => q.fetchNextPage()} header={header} />;
}

type OrientationFilter = 'all' | 'landscape' | 'portrait';

function AlbumView({ album, onBack }: { album: { id: string; name: string }; onBack: () => void }) {
  const { t, tn } = useI18n();
  const [filter, setFilter] = useState<OrientationFilter>('all');
  const q = useAssetSearch({ kind: 'metadata', albumId: album.id, all: true });
  const all = q.data?.pages.flatMap((p) => p.items) ?? [];
  const count = (o: OrientationFilter) => (o === 'all' ? all.length : all.filter((a) => a.orientation === o).length);
  const assets = filter === 'all' ? all : all.filter((a) => a.orientation === filter);
  return (
    <AssetBrowser
      key={filter}
      assets={assets}
      loading={q.isLoading}
      header={
        <div className="mb-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink">
              <ArrowLeft className="size-4" /> {album.name}
            </button>
            <SyncButton
              type="immich_album"
              config={{ albumId: album.id, orientation: filter }}
              defaultName={filter === 'all' ? album.name : `${album.name} · ${t(`immich.${filter}_lc`)}`}
              label={filter === 'all' ? undefined : t('immich.create_filtered', { what: t(`immich.${filter}_lc`) })}
            />
          </div>
          <Segmented
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: <span className="inline-flex items-center gap-1.5"><Images className="size-3.5" />{t('immich.all')} · {count('all')}</span> },
              { value: 'landscape', label: <span className="inline-flex items-center gap-1.5"><RectangleHorizontal className="size-3.5" />{t('immich.landscape')} · {count('landscape')}</span> },
              { value: 'portrait', label: <span className="inline-flex items-center gap-1.5"><RectangleVertical className="size-3.5" />{t('immich.portrait')} · {count('portrait')}</span> },
            ]}
            className="max-w-full overflow-x-auto scrollbar-none"
          />
          {filter !== 'all' && (
            <p className="text-xs text-muted">
              {t('immich.filter_hint', { what: t(`immich.${filter}_lc`) })}
            </p>
          )}
        </div>
      }
    />
  );
}

function Albums() {
  const { t, tn } = useI18n();
  const albums = useQuery({ queryKey: ['immich', 'albums'], queryFn: () => api.get<{ id: string; name: string; count: number; thumbAssetId: string | null }[]>('/api/immich/albums') });
  const [open, setOpen] = useState<{ id: string; name: string } | null>(null);
  if (open) return <AlbumView album={open} onBack={() => setOpen(null)} />;
  if (albums.isLoading) return <Spinner />;
  return (
    <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-5">
      {albums.data?.map((a) => (
        <button key={a.id} className="group text-left" onClick={() => setOpen(a)}>
          <div className="aspect-square overflow-hidden rounded-3xl bg-surface-2">
            {a.thumbAssetId && <img src={immichThumb(a.thumbAssetId)} alt="" className="size-full object-cover transition duration-500 group-hover:scale-105" loading="lazy" />}
          </div>
          <h3 className="mt-2.5 truncate font-bold">{a.name}</h3>
          <p className="text-[13px] text-muted">{tn('device.items', a.count)}</p>
        </button>
      ))}
    </div>
  );
}

function People() {
  const { t, tn } = useI18n();
  const people = useQuery({ queryKey: ['immich', 'people'], queryFn: () => api.get<{ id: string; name: string }[]>('/api/immich/people') });
  const [ids, setIds] = useState<string[]>([]);
  if (people.isLoading) return <Spinner />;
  const names = people.data?.filter((p) => ids.includes(p.id)).map((p) => p.name || t('immich.unnamed')) ?? [];
  return (
    <div className="space-y-6">
      <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-none">
        {people.data?.map((p) => (
          <button
            key={p.id}
            onClick={() => setIds((s) => (s.includes(p.id) ? s.filter((x) => x !== p.id) : [...s, p.id]))}
            className="flex w-20 shrink-0 flex-col items-center gap-1.5"
          >
            <img
              src={`/api/immich/people/${p.id}/thumbnail`}
              alt=""
              loading="lazy"
              className={cx('size-16 rounded-full object-cover ring-offset-2 ring-offset-paper transition', ids.includes(p.id) ? 'ring-3 ring-accent' : 'ring-0')}
            />
            <span className="w-full truncate text-center text-xs font-semibold">{p.name || '—'}</span>
          </button>
        ))}
      </div>
      {ids.length > 0 ? (
        <SearchResults
          body={{ kind: 'metadata', personIds: ids }}
          header={
            <div className="mb-5 flex justify-end">
              <SyncButton type="immich_person" config={{ personIds: ids }} defaultName={names.join(t('immich.and'))} />
            </div>
          }
        />
      ) : (
        <p className="text-sm text-muted">{t('immich.people_hint')}</p>
      )}
    </div>
  );
}

function Memories() {
  const { t, tn } = useI18n();
  const memories = useQuery({
    queryKey: ['immich', 'memories'],
    queryFn: () => api.get<{ id: string; year?: number; assets: ImmichAssetLite[] }[]>('/api/immich/memories'),
  });
  const assets = memories.data?.flatMap((m) => m.assets) ?? [];
  return (
    <AssetBrowser
      assets={assets}
      loading={memories.isLoading}
      header={
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted">
            {memories.data?.length
              ? t('immich.on_this_day', { years: memories.data.map((m) => m.year).filter(Boolean).join(', ') })
              : t('immich.no_memories')}
          </p>
          <SyncButton type="immich_memories" config={{}} defaultName={t('collectionType.immich_memories')} />
        </div>
      }
    />
  );
}

function SmartSearch() {
  const { t, tn } = useI18n();
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  return (
    <div className="space-y-5">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(input.trim());
        }}
        className="relative"
      >
        <Search className="absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted" />
        <input className={cx(inputClass, 'h-12 pl-11')} placeholder={t('immich.search_placeholder')} value={input} onChange={(e) => setInput(e.target.value)} />
      </form>
      {query ? (
        <SearchResults
          body={{ kind: 'smart', query }}
          header={
            <div className="mb-5 flex justify-end">
              <SyncButton type="immich_smart" config={{ query, limit: 150 }} defaultName={query} />
            </div>
          }
        />
      ) : (
        <p className="text-sm text-muted">{t('immich.search_hint')}</p>
      )}
    </div>
  );
}

export function Immich() {
  const { t, tn } = useI18n();
  const status = useImmichStatus();
  const [tab, setTab] = useState<Tab>('albums');

  if (status.isLoading) return <Spinner />;
  if (!status.data?.configured || !status.data.ok)
    return (
      <>
        <SectionTitle title="Immich" />
        <Empty icon={<Sparkles className="size-6" />} title={t(status.data?.configured ? 'immich.cannot_connect' : 'immich.connect')}>
          <p>{status.data?.error ?? t('immich.connect_hint')}</p>
          <Link to="/settings" className="mt-4 inline-block font-semibold text-accent">
            {t('immich.go_settings')} →
          </Link>
        </Empty>
      </>
    );

  return (
    <>
      <SectionTitle title="Immich" subtitle={t('immich.connected_as', { user: status.data.user?.name || status.data.user?.email || '' })} />
      <Segmented
        value={tab}
        onChange={setTab}
        className="mb-6 max-w-full overflow-x-auto scrollbar-none"
        options={[
          { value: 'albums', label: <span className="inline-flex items-center gap-1.5"><Images className="size-3.5" />{t('immich.albums')}</span> },
          { value: 'people', label: <span className="inline-flex items-center gap-1.5"><Users className="size-3.5" />{t('immich.people')}</span> },
          { value: 'favorites', label: <span className="inline-flex items-center gap-1.5"><Heart className="size-3.5" />{t('immich.favorites')}</span> },
          { value: 'memories', label: <span className="inline-flex items-center gap-1.5"><History className="size-3.5" />{t('immich.memories')}</span> },
          { value: 'search', label: <span className="inline-flex items-center gap-1.5"><Search className="size-3.5" />{t('immich.search')}</span> },
        ]}
      />
      {tab === 'albums' && <Albums />}
      {tab === 'people' && <People />}
      {tab === 'favorites' && (
        <SearchResults
          body={{ kind: 'metadata', favorites: true }}
          header={
            <div className="mb-5 flex justify-end">
              <SyncButton type="immich_favorites" config={{}} defaultName={t('immich.favorites')} />
            </div>
          }
        />
      )}
      {tab === 'memories' && <Memories />}
      {tab === 'search' && <SmartSearch />}
    </>
  );
}

