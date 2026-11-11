import test from 'node:test';
import assert from 'node:assert/strict';
import { MathUtils, PerspectiveCamera, Plane, Ray, Scene, Vector3 } from 'three';
import { createServer } from 'vite';

test('the fitting-room wall mirror shows the rear of the live actor beside the front view', async () => {
  const vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });
  try {
    const { createFittingRoomMirror, FITTING_WALL_MIRROR } = await vite.ssrLoadModule('/src/game/characters/fittingRoomMirror.ts');
    const scene = new Scene(), camera = new PerspectiveCamera(46.7, 16 / 9, .1, 100);
    const actor = new Vector3(0, .923, 0);
    camera.position.set(.50, 1.21, 3.6);
    camera.lookAt(actor);
    camera.updateMatrixWorld();
    let now = 1;
    const mirror = createFittingRoomMirror(true, () => now);
    scene.add(mirror);
    scene.updateMatrixWorld();
    try {
      const reflection = mirror.getRenderTarget();
      assert.equal(reflection.width, 384);
      assert.equal(reflection.samples, 0);
      let target = null, captures = 0, eye = new Vector3();
      const renderer = {
        xr: { enabled: false }, shadowMap: { autoUpdate: true }, autoClear: true,
        state: { buffers: { depth: { setMask() {} } } },
        setRenderTarget(next) { target = next; },
        getRenderTarget() { return target; },
        render(world, reflectedCamera) {
          assert.equal(world, scene, 'the reflector draws the same live scene');
          assert.equal(target, reflection);
          assert.equal(mirror.visible, false, 'the mirror is excluded from its own render');
          assert.equal(this.shadowMap.autoUpdate, false);
          eye.copy(reflectedCamera.position);
          captures++;
        },
      };
      mirror.onBeforeRender(renderer, scene, camera);
      assert.equal(target, null);
      assert.equal(renderer.shadowMap.autoUpdate, true);
      assert(eye.z < -2, 'the virtual eye sees the back of the front-facing actor');

      const plane = new Plane().setFromNormalAndCoplanarPoint(
        new Vector3(0, 0, 1).applyQuaternion(mirror.quaternion), mirror.position,
      );
      const { width, height } = FITTING_WALL_MIRROR;
      assert(Math.abs(Math.atan2(eye.x, -eye.z)) < Math.PI / 6, 'the mirror gives a mostly straight rear view');
      const reflectionPoints = [[0, .023], [0, .923], [0, 1.67], [-.34, .923], [.34, .923]].map(([x, y]) => {
        const direction = new Vector3(x, y, 0).sub(eye).normalize();
        const hit = new Ray(eye, direction).intersectPlane(plane, new Vector3());
        assert(hit);
        const local = mirror.worldToLocal(hit.clone());
        assert(Math.abs(local.x) < width / 2 && Math.abs(local.y) < height / 2, 'the reflection fits head to toe');
        assert(hit.clone().project(camera).x > .15, 'the reflection sits beside the live actor');
        return hit;
      });
      // Gallery + details open at representative desktop and compact landscape widths.
      for (const [w, h, left, right] of [[1280, 720, 267, 246], [568, 320, 167, 146]]) {
        camera.aspect = w / h;
        camera.fov = Math.max(33, MathUtils.radToDeg(2 * Math.atan(Math.tan(MathUtils.degToRad(37.5)) / camera.aspect)));
        camera.setViewOffset(w, h, (right - left) / 2, 0, w, h);
        for (const point of reflectionPoints) {
          const screenX = (point.clone().project(camera).x + 1) * w / 2;
          assert(screenX > left && screenX < w - right, 'both rails leave the reflected figure visible');
        }
      }
      now += 1 / 60;
      mirror.onBeforeRender(renderer, scene, camera);
      assert.equal(captures, 1, 'the mobile pass reuses its capture between updates');
      now += 1 / 15;
      mirror.onBeforeRender(renderer, scene, camera);
      assert.equal(captures, 2);
      camera.position.z = -3.6;
      camera.lookAt(actor);
      camera.updateMatrixWorld();
      now++;
      mirror.onBeforeRender(renderer, scene, camera);
      assert.equal(captures, 2, 'orbiting behind the wall skips its reflection');
    } finally {
      mirror.dispose();
      mirror.geometry.dispose();
    }
  } finally {
    await vite.close();
  }
});
