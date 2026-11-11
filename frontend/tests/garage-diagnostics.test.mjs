import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Texture } from "three";
import { prepareVehicleVisual } from "../src/vehicles/tools/vehicleMaterials.ts";

test("AE86 wheel color and depth come from instance-owned material", () => {
  const texture = new Texture({ width: 1, height: 1 });
  const authored = new MeshStandardMaterial({ map: texture, transparent: true, metalness: 1 });
  authored.name = "SteeringWheel.002";
  const root = new Group(), geometry = new BoxGeometry();
  root.add(new Mesh(geometry, authored));
  const prepared = prepareVehicleVisual(root, "ae86");
  try {
    const wheel = prepared.root.children[0].material;
    assert.equal(wheel.color.getHexString(), "292a2d");
    assert.equal(wheel.roughness, .78);
    assert.equal(wheel.metalness, 0);
    assert.equal(wheel.transparent, false);
    assert.equal(wheel.depthWrite, true);
    assert.equal(wheel.map, texture);
    assert.equal(authored.transparent, true);
    assert.equal(authored.color.getHexString(), "ffffff");
  } finally {
    prepared.dispose(); geometry.dispose(); authored.dispose(); texture.dispose();
  }
});

test("garage diagnostics use measured mounts and preserve live controls and shared glass", async t => {
  const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom", logLevel: "error" });
  const load = path => server.ssrLoadModule(`/src/${path}`);
  try {
    const { useGarageDiagnostics, EMPTY_GARAGE_TEST, garageLampState, garageMounts } = await load("game/preview/garageDiagnosticsStore.ts");
    const { useInputStore } = await load("store/input/inputStore.ts");
    const { lensProfiles, exhaustOutlets, AE_HINGE } = await load("vehicles/tools/roadLamps.ts");
    const { prepareGarageHeadlightGlass } = await load("game/preview/garageHeadlightGlass.ts");
    const { createVehiclePartRig, advanceVehiclePartRig } = await load("game/preview/vehiclePartRig.ts");
    await t.test("light, hazard and exhaust adjustments belong to the previewed model", () => {
      const input = useInputStore.getState().input;
      const diagnostics = useGarageDiagnostics.getState();
      const original = garageMounts("ae86", "exhaust");
      assert.equal(original[0][1], exhaustOutlets.ae86[0][1] + lensProfiles.ae86.floor);
      assert.deepEqual(garageMounts("ae86", "headlights"), lensProfiles.ae86.mounts);
      diagnostics.update("ae86", { lights: "high", signal: "hazards", brake: true, nitrous: true });
      diagnostics.adjust("ae86", "exhaust", 0, 2, -2.22);
      diagnostics.adjust("ae86", "exhaust", 0, 2, NaN);
      const test = useGarageDiagnostics.getState().tests.ae86;
      assert.equal(test.markers, true);
      assert.deepEqual(garageMounts("ae86", "exhaust", test), [[original[0][0], original[0][1], -2.22]]);
      assert.deepEqual(garageLampState(test, .25), [2, 1, 2, 2]);
      assert.deepEqual(garageLampState(test, .75), [2, 1, 1, 1]);
      assert.deepEqual(garageLampState({ ...EMPTY_GARAGE_TEST, signal: "right" }, .25), [0, 0, 0, 2]);
      assert.deepEqual(garageLampState(useGarageDiagnostics.getState().tests.brz ?? EMPTY_GARAGE_TEST, .25), [0, 0, 0, 0]);
      assert.equal(useInputStore.getState().input, input);
      diagnostics.reset("ae86");
      assert.equal(useGarageDiagnostics.getState().tests.ae86, undefined);
      assert.deepEqual(garageMounts("ae86", "exhaust"), original);
    });
    await t.test("headlight covers stay separate from rear glass and follow the AE86 pop-ups", () => {
      const root = new Group(), lid = new Group();
      const geometry = new BoxGeometry(.3, .3, .1), glass = new MeshStandardMaterial({ transparent: true, opacity: .42 });
      const body = new MeshStandardMaterial();
      glass.name = "LampCovers.002";
      lid.name = "Headlights";
      lid.add(new Mesh(geometry, body));
      const cover = new Mesh(geometry, glass), rear = new Mesh(geometry, glass);
      const at = garageMounts("ae86", "headlights")[0];
      cover.name = "HeadlightLenses"; cover.position.fromArray(at);
      rear.name = "LightLenses"; rear.position.z = -2;
      root.add(lid, cover, rear);
      const fit = prepareGarageHeadlightGlass(root, garageMounts("ae86", "headlights"));
      try {
        assert.equal(fit.count, 1);
        fit.apply("hidden");
        assert.equal(cover.material.visible, false);
        assert.equal(rear.material, glass);
        assert.equal(glass.visible, true);
        fit.apply("clear");
        assert.equal(cover.material.opacity, .16);
        assert.equal(cover.material.depthWrite, false);
        fit.apply("factory");
        assert.equal(cover.material.opacity, .42);
        assert.equal(cover.material.visible, true);
        const [popup] = createVehiclePartRig(root, "ae86");
        assert.deepEqual(popup.pivot.position.toArray(), [...AE_HINGE]);
        assert.equal(popup.pivot.children.length, 2, "all lid and lens primitives swing together");
        advanceVehiclePartRig([popup], { headlights: false }, 1, undefined, true);
        assert.ok(popup.angle < -1, "garage headlight circuit opens the pop-up");
        assert.equal(lid.parent, root);
      } finally {
        fit.dispose(); geometry.dispose(); glass.dispose(); body.dispose();
      }
    });
  } finally { await server.close(); }
});
