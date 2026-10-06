import { describe, expect, it, vi } from 'vitest';
import { createLogStream, formatEntry, queryLogs } from '../src/lib/logbuffer.js';

const line = (o: Record<string, unknown>) => JSON.stringify({ time: Date.now(), ...o }) + '\n';

describe('log buffer', () => {
  it('keeps useful lines per Canvas and drops request chatter', () => {
    vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    const s = createLogStream();
    s.write(line({ level: 30, msg: 'incoming request', req: { url: '/api/frames' } }));
    s.write(line({ level: 30, msg: 'request completed', res: { statusCode: 200 } }));
    s.write(line({ level: 30, msg: 'request completed', res: { statusCode: 502 }, req: { method: 'GET', url: '/x' } }));
    s.write(line({ level: 30, msg: 'image pushed', frame: 7, imageId: 3 }));
    s.write(line({ level: 50, msg: 'boom', frame: 8, err: { message: 'bad' } }));

    expect(queryLogs().map((e) => e.msg)).toEqual(['request completed', 'image pushed', 'boom']);
    expect(queryLogs({ frame: 7 })).toHaveLength(1);
    expect(queryLogs({ level: 'error' })[0].data).toEqual({ err: 'bad' });
    expect(queryLogs({ q: 'IMAGE' })).toHaveLength(1);
    expect(formatEntry(queryLogs({ frame: 7 })[0])).toMatch(/INFO  image pushed \{"imageId":3\}$/);
  });
});
