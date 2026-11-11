import { Matrix4, Mesh, MeshStandardMaterial, PointLight, Vector3, type Object3D } from "three";
import type { GarageStation } from "./garageStations";

/** Light the authored gauges and trim in a bounded dashboard region. Seats and
 * bodywork keep their normal material response. Programs warm with the car. */
export function prepareGarageDashboard(car: Object3D, station: GarageStation) {
  if (station.kind !== "wheel") return;
  const uniforms = {
    garageDashGain: { value: 0 },
    garageDashToCar: { value: new Matrix4() },
    garageDashRim: { value: new Vector3(...station.rim) },
  };
  const visited = new Set<MeshStandardMaterial>();
  car.traverse(object => {
    if (!(object instanceof Mesh)) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (!(material instanceof MeshStandardMaterial) || visited.has(material) ||
        !/interior|internal|dashboard|speedo|gauge|plastic|black1|emissive/i.test(object.name + " " + material.name)) continue;
      visited.add(material);
      const previous = material.onBeforeCompile, key = material.customProgramCacheKey();
      material.onBeforeCompile = (shader, renderer) => {
        previous.call(material, shader, renderer);
        Object.assign(shader.uniforms, uniforms);
        shader.vertexShader = "uniform mat4 garageDashToCar; varying vec3 garageDashPoint;\n" +
          shader.vertexShader.replace("#include <project_vertex>", `
            garageDashPoint = (garageDashToCar * modelMatrix * vec4(transformed, 1.0)).xyz;
            #include <project_vertex>
          `);
        shader.fragmentShader = "uniform float garageDashGain; uniform vec3 garageDashRim; varying vec3 garageDashPoint;\n" +
          shader.fragmentShader.replace("#include <emissivemap_fragment>", `
            #include <emissivemap_fragment>
            vec3 dash = garageDashPoint - garageDashRim;
            float cluster = (1.0 - smoothstep(0.55, 0.85, abs(dash.x)))
              * smoothstep(-0.045, 0.02, dash.y) * (1.0 - smoothstep(0.25, 0.39, dash.y))
              * smoothstep(0.10, 0.18, dash.z) * (1.0 - smoothstep(0.64, 0.79, dash.z));
            totalEmissiveRadiance += diffuseColor.rgb * cluster * garageDashGain * 0.55;
          `);
      };
      material.customProgramCacheKey = () => key + "|garage-dashboard-v1";
      material.needsUpdate = true;
    }
  });
  const fill = new PointLight("#bddcff", 0, 0, 2);
  fill.name = "garage-dashboard-light";
  fill.position.set(station.rim[0], station.rim[1] + .20, station.rim[2] + .12);
  car.add(fill);
  let active = false;
  return {
    setActive(value: boolean) {
      if (value === active) return;
      active = value;
      uniforms.garageDashGain.value = value ? 1 : 0;
      const scale = car.getWorldScale(new Vector3()).y;
      fill.intensity = value ? .16 * scale * scale : 0;
      fill.distance = 1.25 * scale;
    },
    update() {
      if (!active) return;
      car.updateWorldMatrix(true, false);
      uniforms.garageDashToCar.value.copy(car.matrixWorld).invert();
    },
    dispose() { fill.removeFromParent(); },
  };
}
