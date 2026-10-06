/**
 * Typed wrapper around the BLOOMIN8 Canvas local REST API.
 * Reference: openapi.yaml in ARPOBOT-BLOOMIN8/eink_canvas_home_assistant_component.
 * The device has no auth. It deep-sleeps, so every call may time out: callers treat
 * a DeviceError with `offline: true` as "asleep / unreachable", not as a bug.
 */

export interface DeviceInfo {
  name?: string;
  version?: string;
  board_model?: string;
  screen_model?: string;
  battery?: number;
  fs_ready?: boolean;
  total_size?: number;
  free_size?: number;
  sleep_duration?: number;
  max_idle?: number;
  network_type?: number;
  width?: number;
  height?: number;
  sta_ssid?: string;
  sta_ip?: string;
  image?: string;
  next_time?: number;
  gallery?: string;
  playlist?: string;
  play_type?: number;
  [key: string]: unknown;
}

export interface ShowRequest {
  play_type: 0 | 1 | 2;
  image?: string;
  gallery?: string;
  duration?: number;
  playlist?: string;
  dither?: 0 | 1;
}

export interface DeviceSettings {
  name?: string;
  sleep_duration?: number;
  max_idle?: number;
  idx_wake_sens?: number;
}

export interface PlaylistItem {
  name: string;
  duration?: number;
  time?: string;
}

export interface Playlist {
  name: string;
  type: 'duration' | 'time';
  time_offset?: number;
  list: PlaylistItem[];
}

export interface PullSettings {
  upstream_on: boolean;
  upstream_url: string;
  token: string;
  cron_time?: string;
}

export class DeviceError extends Error {
  constructor(
    message: string,
    readonly offline: boolean,
    readonly status?: number,
  ) {
    super(message);
  }
}

export class FrameClient {
  readonly base: string;

  constructor(
    host: string,
    private timeoutMs = 8000,
  ) {
    this.base = (host.startsWith('http') ? host : `http://${host}`).replace(/\/+$/, '');
  }

  private async request<T>(
    method: string,
    path: string,
    opts: { query?: Record<string, string | number | undefined>; json?: unknown; form?: FormData; timeoutMs?: number } = {},
  ): Promise<T> {
    const url = new URL(this.base + path);
    for (const [k, v] of Object.entries(opts.query ?? {})) if (v !== undefined) url.searchParams.set(k, String(v));
    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers: opts.json !== undefined ? { 'content-type': 'application/json' } : undefined,
        body: opts.form ?? (opts.json !== undefined ? JSON.stringify(opts.json) : undefined),
        signal: AbortSignal.timeout(opts.timeoutMs ?? this.timeoutMs),
      });
    } catch (err) {
      throw new DeviceError(`Frame ${this.base} unreachable: ${(err as Error).message}`, true);
    }
    const text = await res.text();
    if (!res.ok) throw new DeviceError(`Frame ${method} ${path} → HTTP ${res.status}: ${text.slice(0, 200)}`, false, res.status);
    if (!text) return undefined as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      return text as T;
    }
  }

  deviceInfo(timeoutMs?: number) {
    return this.request<DeviceInfo>('GET', '/deviceInfo', { timeoutMs });
  }
  state() {
    return this.request<{ status: number; msg: string }>('GET', '/state');
  }
  show(body: ShowRequest) {
    return this.request('POST', '/show', { json: body });
  }
  showNext() {
    return this.request('POST', '/showNext');
  }
  sleep() {
    return this.request('POST', '/sleep');
  }
  reboot() {
    return this.request('POST', '/reboot');
  }
  clearScreen() {
    return this.request('POST', '/clearScreen');
  }
  updateSettings(body: DeviceSettings) {
    return this.request('POST', '/settings', { json: body });
  }
  whistle() {
    return this.request('GET', '/whistle');
  }

  upload(jpeg: Buffer, filename: string, opts: { gallery?: string; showNow?: boolean } = {}) {
    const form = new FormData();
    form.append('image', new Blob([new Uint8Array(jpeg)], { type: 'image/jpeg' }), filename);
    return this.request<{ status: number; path: string }>('POST', '/upload', {
      query: { filename, gallery: opts.gallery ?? 'default', show_now: opts.showNow ? 1 : 0 },
      form,
      timeoutMs: 60_000,
    });
  }
  deleteImage(image: string, gallery = 'default') {
    return this.request('POST', '/image/delete', { query: { image, gallery } });
  }

  galleryList() {
    return this.request<{ name: string }[]>('GET', '/gallery/list');
  }
  gallery(name: string, offset = 0, limit = 100) {
    return this.request<{ data: { name: string; size: number; time: number }[]; total: number; offset: number; limit: number }>(
      'GET',
      '/gallery',
      { query: { gallery_name: name, offset, limit } },
    );
  }
  createGallery(name: string) {
    return this.request('PUT', '/gallery', { query: { name } });
  }
  deleteGallery(name: string) {
    return this.request('DELETE', '/gallery', { query: { name } });
  }

  playlistList() {
    return this.request<{ name: string; time?: number }[]>('GET', '/playlist/list');
  }
  playlist(name: string) {
    return this.request<Playlist>('GET', '/playlist', { query: { name } });
  }
  putPlaylist(p: Playlist) {
    return this.request('PUT', '/playlist', { json: p });
  }
  deletePlaylist(name: string) {
    return this.request('DELETE', '/playlist', { query: { name } });
  }

  pullSettings() {
    return this.request<PullSettings & { next_cron_time?: number }>('GET', '/upstream/pull_settings');
  }
  setPullSettings(s: PullSettings) {
    return this.request('PUT', '/upstream/pull_settings', { json: s });
  }
}

/** Device returns galleries as "/gallerys/{gallery}/{file}" paths. */
export function galleryPath(gallery: string, filename: string) {
  return `/gallerys/${gallery}/${filename}`;
}
