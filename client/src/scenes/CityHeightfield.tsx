import { useMemo } from "react";
import { BufferAttribute, BufferGeometry } from "three";
import type { JSX } from "react";


type HFProps = JSX.IntrinsicElements["mesh"] & {
    data: {
        nx: number;
        ny: number;
        width: number;
        depth: number;
        heights: number[];
    };
};


export function CityHeightfield({ data, ...props }: HFProps) {
    const geometry = useMemo(() => {
        const { nx, ny, width, depth, heights } = data;

        const geometry = new BufferGeometry();

        const vertices = new Float32Array(nx * ny * 3);

        const dx = width / (nx - 1);
        const dz = depth / (ny - 1);

        for (let iy = 0; iy < ny; iy++) {
            for (let ix = 0; ix < nx; ix++) {
                const i = iy * nx + ix;
                const x = ix * dx - width / 2;
                const y = heights[i];
                const z = iy * dz - depth / 2;

                vertices[i * 3 + 0] = x;
                vertices[i * 3 + 1] = y;
                vertices[i * 3 + 2] = z;
            }
        }

        geometry.setAttribute("position", new BufferAttribute(vertices, 3));

        const indices: number[] = [];

        for (let iy = 0; iy < ny - 1; iy++) {
            for (let ix = 0; ix < nx - 1; ix++) {
                const a = iy * nx + ix;
                const b = iy * nx + ix + 1;
                const c = (iy + 1) * nx + ix;
                const d = (iy + 1) * nx + ix + 1;

                // two triangles per quad
                indices.push(a, b, d);
                indices.push(a, d, c);
            }
        }

        geometry.setIndex(indices);
        geometry.computeVertexNormals();

        return geometry;
    }, [data]);

    return (
        <mesh {...props} geometry={geometry}>
            <meshStandardMaterial color="green" wireframe={false} />
        </mesh>
    );
}
