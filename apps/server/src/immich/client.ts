/** Minimal Immich REST client (https://api.immich.app). Auth via `x-api-key`. */

export interface ImmichAsset {
  id: string;
  type: 'IMAGE' | 'VIDEO' | string;
  originalFileName?: string;
  fileCreatedAt?: string;
  localDateTime?: string;
  isFavorite?: boolean;
  exifInfo?: { exifImageWidth?: number | null; exifImageHeight?: number | null; orientation?: string | null } | null;
  /** Present on newer Immich versions. */
  width?: number | null;
  height?: number | null;
  thumbhash?: string | null;
}

export type Orientation = 'landscape' | 'portrait' | 'square';
export type OrientationFilter = 'all' | 'landscape' | 'portrait';

/** Displayed size of an asset (EXIF rotation applied), or null when Immich doesn't know it. */
export function assetSize(a: ImmichAsset): { width: number; height: number } | null {
  const w = a.exifInfo?.exifImageWidth;
  const h = a.exifInfo?.exifImageHeight;
  if (w && h) {
    const swap = ['5', '6', '7', '8', 'Rotate 90 CW', 'Rotate 270 CW'].includes(String(a.exifInfo?.orientation ?? ''));
    return swap ? { width: h, height: w } : { width: w, height: h };
  }
  return a.width && a.height ? { width: a.width, height: a.height } : null;
}

export function assetOrientation(a: ImmichAsset): Orientation | null {
  const s = assetSize(a);
  if (!s) return null;
  return s.width > s.height ? 'landscape' : s.height > s.width ? 'portrait' : 'square';
}

/** 'all' keeps everything; otherwise only assets whose known orientation matches. */
export function matchesOrientation(a: ImmichAsset, filter: OrientationFilter | undefined): boolean {
  return !filter || filter === 'all' || assetOrientation(a) === filter;
}

export interface ImmichAlbum {
  id: string;
  albumName: string;
  assetCount: number;
  albumThumbnailAssetId: string | null;
  startDate?: string;
  endDate?: string;
}

export interface ImmichPerson {
  id: string;
  name: string;
  isHidden?: boolean;
}

export interface ImmichMemory {
  id: string;
  type: string;
  data?: { year?: number };
  assets: ImmichAsset[];
}

interface SearchPage {
  assets: { items: ImmichAsset[]; total: number; count: number; nextPage: string | null };
}

export interface MetadataQuery {
  albumIds?: string[];
  personIds?: string[];
  isFavorite?: boolean;
  takenAfter?: string;
  takenBefore?: string;
  city?: string;
  country?: string;
}

export class ImmichError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

export class ImmichClient {
  private base: string;

  constructor(
    url: string,
    private apiKey: string,
  ) {
    const trimmed = url.replace(/\/+$/, '');
    this.base = trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
  }

  async raw(path: string, init: RequestInit = {}, timeoutMs = 30_000): Promise<Response> {
    let res: Response;
    try {
      res = await fetch(this.base + path, {
        ...init,
        headers: { 'x-api-key': this.apiKey, accept: 'application/json', ...(init.headers ?? {}) },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      throw new ImmichError(`Immich unreachable: ${(err as Error).message}`);
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new ImmichError(`Immich ${init.method ?? 'GET'} ${path} → HTTP ${res.status} ${body.slice(0, 200)}`, res.status);
    }
    return res;
  }

  private async json<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await this.raw(path, init);
    return (await res.json()) as T;
  }

  private post<T>(path: string, body: unknown) {
    return this.json<T>(path, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
  }

  ping() {
    return this.json<{ res: string }>('/server/ping');
  }
  me() {
    return this.json<{ id: string; name: string; email: string }>('/users/me');
  }
  version() {
    return this.json<{ major: number; minor: number; patch: number }>('/server/version');
  }

  albums() {
    return this.json<ImmichAlbum[]>('/albums');
  }
  album(id: string) {
    return this.json<ImmichAlbum & { assets?: ImmichAsset[] }>(`/albums/${id}`);
  }
  async people() {
    const res = await this.json<{ people: ImmichPerson[] }>('/people?withHidden=false&size=500');
    return res.people.filter((p) => !p.isHidden);
  }
  personThumbnail(id: string) {
    return this.raw(`/people/${id}/thumbnail`, { headers: { accept: 'image/*' } });
  }

  searchMetadata(q: MetadataQuery, page = 1, size = 100) {
    return this.post<SearchPage>('/search/metadata', { ...q, type: 'IMAGE', page, size, withExif: true });
  }
  searchSmart(query: string, page = 1, size = 100) {
    return this.post<SearchPage>('/search/smart', { query, type: 'IMAGE', page, size });
  }

  /** "On this day" memories for a local calendar day (YYYY-MM-DD). */
  async memories(day: string) {
    let memories: ImmichMemory[];
    try {
      memories = await this.json<ImmichMemory[]>(`/memories?for=${day}`);
    } catch (err) {
      // Immich < 1.13x expected a full ISO date-time here.
      if (!(err instanceof ImmichError && err.status === 400)) throw err;
      memories = await this.json<ImmichMemory[]>(`/memories?for=${encodeURIComponent(new Date(`${day}T12:00:00`).toISOString())}`);
    }
    return memories.filter((m) => m.assets?.length);
  }

  /** Walk paged metadata search up to `max` assets. */
  async allMetadata(q: MetadataQuery, max = 5000): Promise<ImmichAsset[]> {
    const out: ImmichAsset[] = [];
    for (let page = 1; out.length < max; page++) {
      const res = await this.searchMetadata(q, page, 250);
      out.push(...res.assets.items);
      if (!res.assets.nextPage) break;
    }
    return out.slice(0, max);
  }

  async smartTop(query: string, max = 200): Promise<ImmichAsset[]> {
    const out: ImmichAsset[] = [];
    for (let page = 1; out.length < max; page++) {
      const res = await this.searchSmart(query, page, 100);
      out.push(...res.assets.items);
      if (!res.assets.nextPage) break;
    }
    return out.slice(0, max);
  }

  thumbnail(id: string, size: 'thumbnail' | 'preview' | 'fullsize' = 'thumbnail') {
    return this.raw(`/assets/${id}/thumbnail?size=${size}`, { headers: { accept: 'image/*' } });
  }
  original(id: string) {
    return this.raw(`/assets/${id}/original`, { headers: { accept: '*/*' } }, 120_000);
  }
}
