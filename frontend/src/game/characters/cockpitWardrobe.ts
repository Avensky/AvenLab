import { Matrix4, Mesh, MeshStandardMaterial, Vector3, type Object3D } from "three";

type Cloth = {
  mesh: Mesh;
  uniforms: {
    garageLap: { value: number };
    garageSleeve: { value: number };
    garageLeftElbow: { value: Vector3 };
    garageLeftWrist: { value: Vector3 };
    garageRightElbow: { value: Vector3 };
    garageRightWrist: { value: Vector3 };
    garageToCar: { value: Matrix4 };
    garageToCloth: { value: Matrix4 };
    garageRim: { value: Vector3 };
    garageRadius: { value: number };
  };
};

const wardrobes = new WeakMap<Object3D, Cloth[]>();

/** Drape the seated skirt after skinning so its folds clear the real rim. */
export function cockpitWardrobe(driver: Object3D) {
  let cloth = wardrobes.get(driver);
  if (!cloth) {
    cloth = [];
    const prepared = new Set<MeshStandardMaterial>();
    driver.traverse(mesh => {
      if (!(mesh instanceof Mesh)) return;
      const piece = mesh.userData.clothingPiece;
      const sleeve = mesh.name === "CLOTH_ARMS_SLEEVES" || piece === "sleeves";
      const skirt = piece === "skirt" || piece === "underskirt";
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) {
        if (!(material instanceof MeshStandardMaterial) || (!skirt && !sleeve && material.name !== "MAT_ClothLower")
          || driver.name !== "garage-villager-female" || prepared.has(material)) continue;
        prepared.add(material);
        const uniforms = {
          garageLap: { value: 0 },
          garageSleeve: { value: sleeve ? 1 : 0 },
          garageLeftElbow: { value: new Vector3() }, garageLeftWrist: { value: new Vector3() },
          garageRightElbow: { value: new Vector3() }, garageRightWrist: { value: new Vector3() },
          garageToCar: { value: new Matrix4() },
          garageToCloth: { value: new Matrix4() },
          garageRim: { value: new Vector3() },
          garageRadius: { value: 0 },
        };
        const previous = material.onBeforeCompile;
        const key = material.customProgramCacheKey();
        material.onBeforeCompile = (shader, renderer) => {
          previous.call(material, shader, renderer);
          Object.assign(shader.uniforms, uniforms);
          shader.vertexShader = `
            uniform float garageLap;
            uniform float garageSleeve;
            uniform vec3 garageLeftElbow;
            uniform vec3 garageLeftWrist;
            uniform vec3 garageRightElbow;
            uniform vec3 garageRightWrist;
            vec3 drapeCuff(vec3 p, vec3 elbow, vec3 wrist) {
              vec3 along = wrist - elbow;
              float t = clamp(dot(p - elbow, along) / max(dot(along, along), 0.00001), 0.0, 1.0);
              vec3 axis = elbow + along * t;
              vec3 offset = p - axis;
              float radius = mix(0.12, 0.045, smoothstep(0.30, 1.0, t));
              float envelope = 1.0 - smoothstep(0.25, 0.38, length(offset));
              float weight = smoothstep(0.15, 0.75, t) * envelope * garageLap;
              return mix(p, axis + offset * min(1.0, radius / max(length(offset), 0.0001)), weight);
            }
            uniform mat4 garageToCar;
            uniform mat4 garageToCloth;
            uniform vec3 garageRim;
            uniform float garageRadius;
          ` + shader.vertexShader.replace("#include <skinning_vertex>", `
            #include <skinning_vertex>
            if (garageLap > 0.0) {
              vec3 lap = (garageToCar * vec4(transformed, 1.0)).xyz;
              if (garageSleeve > 0.5) {
                float leftDistance = distance(lap, garageLeftWrist);
                float rightDistance = distance(lap, garageRightWrist);
                lap = leftDistance < rightDistance ? drapeCuff(lap, garageLeftElbow, garageLeftWrist)
                  : drapeCuff(lap, garageRightElbow, garageRightWrist);
              } else {
                vec3 delta = lap - garageRim;
                float across = 1.0 - smoothstep(garageRadius + 0.06, garageRadius + 0.18, abs(delta.x));
                float along = smoothstep(-0.43, -0.20, delta.z) * (1.0 - smoothstep(0.10, 0.23, delta.z));
                float ceiling = garageRim.y - garageRadius - 0.035;
                lap.y = mix(lap.y, min(lap.y, ceiling), garageLap * across * along);
              }
              transformed = (garageToCloth * vec4(lap, 1.0)).xyz;
            }
          `);
        };
        material.customProgramCacheKey = () => key + "|garage-seated-drape-v3";
        material.needsUpdate = true;
        cloth!.push({ mesh, uniforms });
      }
    });
    wardrobes.set(driver, cloth);
  }
  const inverse = new Matrix4();
  const leftElbow = driver.getObjectByName("lowerarm_l"), leftWrist = driver.getObjectByName("hand_l");
  const rightElbow = driver.getObjectByName("lowerarm_r"), rightWrist = driver.getObjectByName("hand_r");
  return {
    sample(car: Object3D, rim: Vector3, radius: number, amount: number) {
      car.updateWorldMatrix(true, false);
      inverse.copy(car.matrixWorld).invert();
      for (const { mesh, uniforms } of cloth) {
        mesh.updateWorldMatrix(true, false);
        uniforms.garageToCar.value.multiplyMatrices(inverse, mesh.matrixWorld);
        uniforms.garageToCloth.value.copy(uniforms.garageToCar.value).invert();
        uniforms.garageRim.value.copy(rim);
        uniforms.garageRadius.value = radius;
        uniforms.garageLap.value = amount;
        if (uniforms.garageSleeve.value && leftElbow && leftWrist && rightElbow && rightWrist) {
          car.worldToLocal(leftElbow.getWorldPosition(uniforms.garageLeftElbow.value));
          car.worldToLocal(leftWrist.getWorldPosition(uniforms.garageLeftWrist.value));
          car.worldToLocal(rightElbow.getWorldPosition(uniforms.garageRightElbow.value));
          car.worldToLocal(rightWrist.getWorldPosition(uniforms.garageRightWrist.value));
        }
      }
    },
    stop() {
      for (const { uniforms } of cloth) uniforms.garageLap.value = 0;
    },
  };
}
