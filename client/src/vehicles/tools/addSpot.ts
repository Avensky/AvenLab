export const addSpot = (
        refObj: { current: SpotLight | null },
        color: number,
        intensity: number,
        distance: number,
        position: [number, number, number],
        target: [number, number, number]
    ) => {
      const light = new SpotLight(color, intensity, distance, Math.PI / 6, 0.2);
      light.position.set(...position);
      light.target.position.set(...target);
      light.visible = false;
      refObj.current = light;

      carGroupRef.current.add(light);
      carGroupRef.current.add(light.target);
    };