import test from "node:test";
import assert from "node:assert/strict";
import { Group, Mesh, MeshStandardMaterial, BoxGeometry } from "three";
import { prepareGarageDisplay } from "../src/game/preview/prepareGarageDisplay.ts";
import {
  GARAGE_LIGHT_COLORS,
  applyGarageLighting,
} from "../src/theme/garageLighting.ts";
import { createGarageReflectionSnapshot } from "../src/game/preview/garageReflectionSnapshot.ts";
import { configureGarageBloom } from "../src/game/preview/garagePostprocessing.ts";
import {
  configureGarageFloor,
  gateGarageFloorCapture,
} from "../src/game/preview/garageFloorEffects.ts";
import {
  DEFAULT_GARAGE_EFFECTS,
  sanitizeGarageEffects,
} from "../src/store/preferences/garageEffects.ts";

const radiance = (material) =>
  material.emissiveIntensity *
  (material.emissive.r * 0.2126 +
    material.emissive.g * 0.7152 +
    material.emissive.b * 0.0722);

test("garage themes recolor owned fixtures, preserve neutral surfaces and restore contrast without drift", () => {
  const source = new Group(),
    geometry = new BoxGeometry();
  const fixture = new MeshStandardMaterial(),
    wall = new MeshStandardMaterial({ color: 0x224455 });
  fixture.name = "LIGHT";
  source.add(new Mesh(geometry, fixture), new Mesh(geometry, wall));
  const display = prepareGarageDisplay(source),
    bulb = display.root.children[0].material;
  const normalWall = display.root.children[1].material.color.clone();
  for (const [theme, color] of Object.entries(GARAGE_LIGHT_COLORS)) {
    applyGarageLighting(display.root, theme, false);
    assert.equal("#" + bulb.emissive.getHexString(), color);
    assert.ok(
      theme === "scarlet" ? bulb.emissiveIntensity === 6 : Math.abs(radiance(bulb) - 2.88) < 0.00001,
      `${theme} retains the fixture's visible brightness`,
    );
    assert.equal(
      display.root.children[1].material.color.equals(normalWall),
      true,
    );
  }
  applyGarageLighting(display.root, "hacker", true);
  assert.equal(bulb.emissive.getHexString(), "ffffff");
  assert.equal(bulb.emissiveIntensity, 1.2);
  applyGarageLighting(display.root, "hacker", true);
  assert.equal(
    bulb.emissiveIntensity,
    1.2,
    "contrast cannot compound its dimming",
  );
  applyGarageLighting(display.root, "hacker", false);
  assert.ok(Math.abs(radiance(bulb) - 2.88) < 0.00001);
  assert.equal(
    fixture.emissive.getHexString(),
    "000000",
    "the cached GLB never receives theme edits",
  );
  assert.equal(display.root.children[0].geometry, geometry);
  display.dispose();
  geometry.dispose();
  fixture.dispose();
  wall.dispose();
});

test("the first reflection snapshot is already themed, owns its materials and cannot retain the previous green capture", () => {
  const source = new Group(),
    geometry = new BoxGeometry();
  const bulb = new MeshStandardMaterial();
  bulb.name = "LIGHT";
  const fixture = new Mesh(geometry, bulb);
  fixture.name = "fixture";
  source.add(fixture);
  const display = prepareGarageDisplay(source);
  applyGarageLighting(display.root, "hacker", false);
  const displayMaterial = display.root.getObjectByName("fixture").material;
  let disposed = 0;
  displayMaterial.addEventListener("dispose", () => disposed++);
  for (const [theme, color] of Object.entries(GARAGE_LIGHT_COLORS)) {
    const probe = createGarageReflectionSnapshot(
      [display.root],
      theme,
      false,
      1,
    );
    const mesh = probe.root.getObjectByName("fixture");
    assert.equal(
      "#" + mesh.material.emissive.getHexString(),
      color,
      "correct before any React effect or cube capture",
    );
    assert.notEqual(mesh.material, displayMaterial);
    assert.equal(mesh.geometry, geometry);
    assert.ok(theme === "scarlet" ? mesh.material.emissiveIntensity === 6 : Math.abs(radiance(mesh.material) - 2.88) < 0.00001);
    applyGarageLighting(display.root, "strawberry", false);
    assert.equal(
      "#" + mesh.material.emissive.getHexString(),
      color,
      "display updates cannot recolor an in-flight probe",
    );
    probe.dispose();
  }
  assert.equal(
    disposed,
    0,
    "probe cleanup never disposes display/cache materials",
  );
  assert.equal(bulb.emissive.getHexString(), "000000");
  display.dispose();
  geometry.dispose();
  bulb.dispose();
});

test("green PST fixture paint follows the palette without becoming a new light or mutating cached paint", () => {
  const source = new Group(),
    geometry = new BoxGeometry();
  const paint = new MeshStandardMaterial({ color: 0x0c3e00 });
  paint.name = "PST";
  source.add(new Mesh(geometry, paint));
  const original = paint.color.clone(),
    display = prepareGarageDisplay(source);
  const material = display.root.children[0].material;
  applyGarageLighting(display.root, "strawberry", false);
  assert.ok(material.color.r > material.color.g * 2);
  assert.equal(
    material.emissiveIntensity,
    0,
    "a colored switch face stays non-emissive",
  );
  assert.ok(paint.color.equals(original));
  display.dispose();
  geometry.dispose();
  paint.dispose();
});

test("garage settings sanitize old/corrupt values and bloom off skips its blur passes", () => {
  assert.deepEqual(sanitizeGarageEffects(undefined), DEFAULT_GARAGE_EFFECTS);
  const clean = sanitizeGarageEffects({
    bloom: "yes",
    bloomStrength: 100,
    bloomRadius: -1,
    bloomThreshold: Infinity,
    exposure: -20,
    accentBrightness: NaN,
    reflectionBlur: 2,
    floorReflections: false,
  });
  assert.equal(clean.bloom, true);
  assert.equal(clean.bloomStrength, 1.5);
  assert.equal(clean.bloomRadius, 0);
  assert.equal(clean.bloomThreshold, 1);
  assert.equal(clean.exposure, 0.5);
  assert.equal(clean.accentBrightness, 1);
  assert.equal(clean.reflectionBlur, 1);
  assert.equal(clean.floorReflections, false);
  const pass = {};
  configureGarageBloom(pass, DEFAULT_GARAGE_EFFECTS, false);
  assert.equal(pass.enabled, true);
  assert.equal(pass.strength, 0.5);
  configureGarageBloom(
    pass,
    { ...DEFAULT_GARAGE_EFFECTS, bloom: false },
    false,
  );
  assert.equal(pass.enabled, false);
  configureGarageBloom(
    pass,
    { ...DEFAULT_GARAGE_EFFECTS, bloomStrength: 0 },
    false,
  );
  assert.equal(pass.enabled, false);
  configureGarageBloom(pass, DEFAULT_GARAGE_EFFECTS, true);
  assert.equal(pass.enabled, false);
  assert.equal(pass.strength, 0);
});

test("turning off garage mirrors skips their capture and keeps the tile shader alive", () => {
  let captures = 0;
  let time = 0;
  const floor = {
    userData: {},
    material: {
      uniforms: {
        reflectionStrength: { value: 1 },
        reflectionBlur: { value: 0.25 },
      },
    },
    onBeforeRender() {
      assert.equal(this, floor);
      captures++;
    },
  };
  gateGarageFloorCapture(floor, () => time);
  configureGarageFloor(floor, DEFAULT_GARAGE_EFFECTS);
  floor.onBeforeRender();
  assert.equal(captures, 1);
  time += 1 / 60;
  floor.onBeforeRender();
  assert.equal(captures, 1, "reuse the capture on the next 60 Hz frame");
  time += 1 / 60;
  floor.onBeforeRender();
  assert.equal(captures, 2);
  configureGarageFloor(floor, {
    ...DEFAULT_GARAGE_EFFECTS,
    floorReflections: false,
  });
  floor.onBeforeRender();
  assert.equal(captures, 2);
  assert.equal(floor.material.uniforms.reflectionStrength.value, 0);
  configureGarageFloor(floor, {
    ...DEFAULT_GARAGE_EFFECTS,
    reflectionStrength: 0,
  });
  floor.onBeforeRender();
  assert.equal(captures, 2);
  configureGarageFloor(floor, {
    ...DEFAULT_GARAGE_EFFECTS,
    reflectionBlur: 0.75,
  });
  floor.onBeforeRender();
  assert.equal(captures, 3);
  assert.equal(floor.material.uniforms.reflectionBlur.value, 0.75);
});
