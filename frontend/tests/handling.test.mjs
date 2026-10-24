import test from 'node:test';
import assert from 'node:assert/strict';
import { Quaternion, Vector3 } from 'three';
import { handlingSample } from '../src/performance/handling.ts';
import { PerformanceRecorder, capturesCsv } from '../src/performance/measurements.ts';

test('roll measurement is independent of turn direction and world heading', () => {
  for (const yaw of [-2.1, 0, 1.7]) for (const roll of [-0.05, 0.05]) {
    const rotation = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yaw)
      .multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), roll)).toArray();
    const sample = handlingSample({ rotation });
    assert.ok(Math.abs(sample.bodyRollDeg - Math.abs(roll) * 180 / Math.PI) < 1e-6);
  }
});
test('contact counts follow authoritative wheel flags and distinguish unknown from airborne', () => {
  const entity = { rotation: [0, 0, 0, 1], wheels: [true, false, true, true].map(grounded => ({ grounded })) };
  assert.deepEqual(handlingSample(entity), { bodyRollDeg: 0, groundedWheels: 3, airborneWheels: 1, wheelCount: 4 });
  assert.equal(handlingSample({ ...entity, wheels: [{}] }).airborneWheels, null);
  assert.equal(handlingSample(undefined).bodyRollDeg, null);
});
test('handling percentiles are recorded and included in CSV exports', () => {
  const recorder = new PerformanceRecorder(); recorder.enabled = true;
  recorder.record('bodyRollDeg', 2.5, 0); recorder.record('airborneWheels', 0, 0);
  assert.equal(recorder.live(1).metrics.bodyRollDeg.p95, 2.5);
  assert.equal(recorder.live(1).metrics.airborneWheels.mean, 0);
  const csv = capturesCsv([]);
  assert.ok(csv.includes('bodyRollDeg_p95')); assert.ok(csv.includes('airborneWheels_p95'));
});
