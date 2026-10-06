/**
 * Standalone BLOOMIN8 Canvas simulator for development (see src/device/simulator.ts).
 *   npm run fake-frame -- --port 8090 --width 1200 --height 1600
 */
import { startSimulator } from '../src/device/simulator.js';

const arg = (name: string, def: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : def;
};
const width = Number(arg('width', '1200'));
const height = Number(arg('height', '1600'));

const sim = await startSimulator({
  port: Number(arg('port', '8090')),
  width,
  height,
  name: arg('name', 'Fake Canvas'),
  fast: !!process.env.FAKE_FAST,
});
sim.app.log.info(`Fake BLOOMIN8 canvas ${width}x${height} on http://127.0.0.1:${sim.port}`);
