import fs from 'node:fs';
import path from 'node:path';
import { Writable } from 'node:stream';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export interface LogEntry {
  /** ms since epoch */
  t: number;
  level: LogLevel;
  msg: string;
  /** Canvas this line is about, when the log call tagged one (`{ frame: id }`). */
  frame?: number;
  /** Remaining structured fields (error message, path…), already stringified-safe. */
  data?: Record<string, unknown>;
}

const LEVELS: Record<number, LogLevel> = { 10: 'debug', 20: 'debug', 30: 'info', 40: 'warn', 50: 'error', 60: 'error' };
const MAX_ENTRIES = 2000;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const OMIT = new Set(['level', 'time', 'pid', 'hostname', 'msg', 'frame', 'req', 'res', 'reqId', 'responseTime']);

const entries: LogEntry[] = [];

/** Request chatter (every poll, every pull) would bury the useful lines: keep only failed requests. */
function parse(line: string): LogEntry | null {
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(line);
  } catch {
    return null;
  }
  const res = o.res as { statusCode?: number } | undefined;
  if (o.msg === 'incoming request') return null;
  if (o.msg === 'request completed' && (res?.statusCode ?? 0) < 400) return null;
  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (!OMIT.has(k)) data[k] = k === 'err' ? ((v as { message?: string })?.message ?? v) : v;
  if (res?.statusCode) data.status = res.statusCode;
  const req = o.req as { method?: string; url?: string } | undefined;
  if (req?.url) data.request = `${req.method} ${req.url}`;
  return {
    t: typeof o.time === 'number' ? o.time : Date.now(),
    level: LEVELS[o.level as number] ?? 'info',
    msg: String(o.msg ?? ''),
    ...(typeof o.frame === 'number' ? { frame: o.frame } : {}),
    ...(Object.keys(data).length ? { data } : {}),
  };
}

/** One text line, shared by the on-disk file and the downloads. */
export function formatEntry(e: LogEntry): string {
  const data = e.data ? ` ${JSON.stringify(e.data)}` : '';
  return `${new Date(e.t).toISOString()} ${e.level.toUpperCase().padEnd(5)} ${e.msg}${data}`;
}

/**
 * Log destination for Fastify's pino: forwards to stdout (so `docker logs` is unchanged), keeps the
 * last MAX_ENTRIES lines in memory for the UI, and appends them to <dir>/hub.log (rotated once at 5 MB).
 */
export function createLogStream(dir?: string): Writable {
  const file = dir ? path.join(dir, 'hub.log') : null;
  let size = 0;
  if (file) {
    try {
      size = fs.statSync(file).size;
    } catch {
      /* first run */
    }
  }
  return new Writable({
    write(chunk, _enc, cb) {
      process.stdout.write(chunk);
      for (const line of chunk.toString().split('\n')) {
        if (!line.trim()) continue;
        const e = parse(line);
        if (!e) continue;
        entries.push(e);
        if (entries.length > MAX_ENTRIES) entries.shift();
        if (!file || e.level === 'debug') continue;
        try {
          const text = formatEntry(e) + '\n';
          if (size + text.length > MAX_FILE_BYTES) {
            fs.renameSync(file, `${file}.1`);
            size = 0;
          }
          fs.appendFileSync(file, text);
          size += text.length;
        } catch {
          /* a full or read-only disk must not take the hub down */
        }
      }
      cb();
    },
  });
}

const RANK: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

export function queryLogs(opts: { level?: LogLevel; frame?: number; q?: string; limit?: number } = {}): LogEntry[] {
  const min = RANK[opts.level ?? 'info'];
  const q = opts.q?.toLowerCase();
  const out = entries.filter(
    (e) =>
      RANK[e.level] >= min &&
      (opts.frame == null || e.frame === opts.frame) &&
      (!q || formatEntry(e).toLowerCase().includes(q)),
  );
  return opts.limit ? out.slice(-opts.limit) : out;
}
