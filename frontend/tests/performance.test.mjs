import test from 'node:test';
import assert from 'node:assert/strict';
import { summarize, difference, PerformanceRecorder, capturesCsv } from '../src/performance/measurements.ts';

const context = (key = 'A', ready = true, reason = '') => ({ key, ready, reason, settings: { mode: key } });
function complete(recorder, label, baseline, frameMs, start) {
  recorder.start(label, baseline, 5, context(), start);
  recorder.tick(context(), start);
  // Warm-up samples must not enter the saved statistics.
  recorder.record('frameMs', 900, start + 1000);
  recorder.tick(context(), start + 3000);
  for (let i = 0; i < 300; i++) {
    const time = start + 3000 + i * (5000 / 300);
    recorder.record('frameMs', frameMs, time);
    recorder.packet('snapshot', 1024, 0.2, time);
    recorder.packet('debug', 256, 0.1, time);
  }
  recorder.tick(context(), start + 8000);
}
test('nearest-rank percentiles expose rare long frames and use milliseconds', () => {
  const result = summarize([...Array(95).fill(10), ...Array(4).fill(30), 100]);
  assert.equal(result.mean, 11.7);
  assert.equal(result.p95, 10);
  assert.equal(result.p99, 30);
  assert.equal(summarize([]), undefined);
  assert.equal(difference(18.5, 12), 6.5);
  assert.equal(difference(undefined, 12), null);
});
test('captures exclude warm-up, count packet traffic once, and keep a baseline reference', () => {
  const recorder = new PerformanceRecorder();
  complete(recorder, 'base', true, 10, 0);
  complete(recorder, 'GLB', false, 15, 10000);
  assert.equal(recorder.runs.length, 2);
  const [base, feature] = recorder.runs;
  assert.equal(base.metrics.frameMs.mean, 10);
  assert.equal(base.metrics.frameMs.count, 300);
  assert.equal(base.snapshotHz, 60);
  assert.equal(base.snapshotKiBps, 60);
  assert.equal(base.debugKiBps, 15);
  assert.equal(feature.baselineId, base.id);
  assert.equal(difference(feature.metrics.frameMs.mean, base.metrics.frameMs.mean), 5);
});
test('loading restarts warm-up; a menu, settings change, or missing snapshots discards a measured run', () => {
  const recorder = new PerformanceRecorder();
  recorder.start('test', true, 5, context(), 0);
  recorder.tick(context(), 0);
  recorder.tick(context('A', false, 'assets loading'), 2500);
  recorder.tick(context(), 3000);
  recorder.tick(context(), 5999);
  assert.match(recorder.status, /Warming/);
  recorder.tick(context(), 6000);
  recorder.tick(context('A', false, 'close menus'), 6100);
  assert.equal(recorder.capturing, false);
  assert.equal(recorder.runs.length, 0);
  assert.match(recorder.status, /Discarded/);
  recorder.start('test', true, 5, context(), 7000);
  recorder.tick(context('B'), 7100);
  assert.equal(recorder.capturing, false);
  recorder.start('test', true, 5, context(), 8000);
  recorder.tick(context(), 8000);
  recorder.tick(context(), 11000);
  recorder.tick(context(), 16000);
  assert.match(recorder.status, /insufficient/);
});
test('invalid samples and disabled monitoring do not pollute stats; capture works with overlay off', () => {
  const recorder = new PerformanceRecorder();
  recorder.record('frameMs', 1000, 0);
  assert.equal(recorder.live(0).metrics.frameMs, undefined);
  recorder.enabled = true;
  for (const x of [NaN, Infinity, -1, undefined, null]) recorder.record('frameMs', x, 0);
  assert.equal(recorder.live(0).metrics.frameMs, undefined);
  recorder.enabled = false;
  complete(recorder, 'base', true, 12, 0);
  assert.equal(recorder.runs[0].metrics.frameMs.mean, 12);
});
test('CSV preserves labels/settings and neutralizes spreadsheet formulas', () => {
  const recorder = new PerformanceRecorder();
  complete(recorder, '=SUM(1,2) "label"\nnext', true, 10, 0);
  const csv = capturesCsv(recorder.runs);
  assert.ok(csv.includes('"\'=SUM(1,2) ""label""\nnext"'));
  assert.ok(csv.includes('"{""mode"":""A""}"'));
  assert.ok(csv.includes('frameMs_p95'));
});

test('CSV exports measured improvements as numeric negative deltas', () => {
  const recorder = new PerformanceRecorder();
  complete(recorder, 'base', true, 15, 0);
  complete(recorder, 'lighter', false, 10, 10000);
  const csv = capturesCsv(recorder.runs);
  assert.ok(csv.includes('"-5"'));
  assert.ok(!csv.includes('"\'-5"'));
});
