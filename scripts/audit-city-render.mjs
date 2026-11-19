#!/usr/bin/env node
// Compare matched city-render captures. No GPU/FPS claims are inferred from draw counters.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const load = path => JSON.parse(readFileSync(path, 'utf8'));
export function compare(before, after) {
  if (before.context?.warmupComplete !== true || after.context?.warmupComplete !== true) {
    throw new Error('Captures must be warmed up');
  }
  const fields = ['map', 'route', 'camera', 'viewport', 'dpr', 'vehicle', 'shadows', 'reflections', 'viewDistance'];
  const mismatch = fields.filter(k => JSON.stringify(before.context?.[k]) !== JSON.stringify(after.context?.[k]) || before.context?.[k] === undefined);
  if (mismatch.length) throw new Error('Unmatched capture context: ' + mismatch.join(', '));
  const metrics = ['drawCalls', 'triangles', 'frameP95Ms', 'frameP99Ms'];
  const result = {};
  for (const key of metrics) {
    const a = before.metrics?.[key], b = after.metrics?.[key];
    if (![a,b].every(x => typeof x === 'number' && Number.isFinite(x) && x >= 0)) throw new Error('Invalid metric: ' + key);
    result[key] = { before:a, after:b, delta:b-a, percent:a===0?null:(b-a)/a*100 };
  }
  return { context:before.context, metrics:result, regression:result.drawCalls.delta>0 || result.triangles.delta>0 || result.frameP95Ms.delta>0 || result.frameP99Ms.delta>0 };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [beforePath, afterPath] = process.argv.slice(2);
  try {
    if (!beforePath || !afterPath) throw new Error('Usage: node scripts/audit-city-render.mjs before.json after.json');
    const result = compare(load(beforePath), load(afterPath));
    console.log(JSON.stringify(result,null,2));
    if (result.regression) process.exitCode = 1;
  } catch (e) { console.error(e.message); process.exitCode = 2; }
}
