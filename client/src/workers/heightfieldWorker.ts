/// <reference lib="webworker" />

export type HeightfieldV4In = {
    nx: number;
    ny: number;
    minY: number;
    heights: number[];
};

export type HeightfieldV4Out = {
    nx: number;
    ny: number;
    minHeight: number;
    maxHeight: number;
    heights: number[];
    lodLevels: {
        level: number;
        nx: number;
        ny: number;
        heights: number[];
    }[];
};

/**
 * Hole filling, spike clamping, optional smoothing.
 */
function processHeights(input: HeightfieldV4In): HeightfieldV4Out {
    const { nx, ny, minY } = input;
    const heights = input.heights.slice(); // work on a copy

    // ---------- Hole filling (same idea as v3) ----------
    const fillPasses = 1;
    for (let pass = 0; pass < fillPasses; pass++) {
        for (let iy = 0; iy < ny; iy++) {
            for (let ix = 0; ix < nx; ix++) {
                const i = iy * nx + ix;
                if (heights[i] !== minY) continue;

                const neighbors: number[] = [];
                if (ix > 0) neighbors.push(heights[i - 1]);
                if (ix < nx - 1) neighbors.push(heights[i + 1]);
                if (iy > 0) neighbors.push(heights[i - nx]);
                if (iy < ny - 1) neighbors.push(heights[i + nx]);

                const valid = neighbors.filter((v) => v !== minY);
                if (valid.length > 0) {
                    heights[i] = valid.reduce((a, b) => a + b, 0) / valid.length;
                }
            }
        }
    }

    // ---------- Edge detection & spike clamping (v3 logic) ----------
    const edgeHeightThreshold = 2.5;

    for (let iy = 1; iy < ny - 1; iy++) {
        for (let ix = 1; ix < nx - 1; ix++) {
            const i = iy * nx + ix;
            const h = heights[i];

            const left = heights[i - 1];
            const right = heights[i + 1];
            const up = heights[i - nx];
            const down = heights[i + nx];

            const minNeighbor = Math.min(left, right, up, down);
            const maxNeighbor = Math.max(left, right, up, down);

            const isSpikeUp = h - minNeighbor > edgeHeightThreshold;
            const isSpikeDown = maxNeighbor - h > edgeHeightThreshold;

            if (isSpikeUp || isSpikeDown) {
                const avg = (left + right + up + down) / 4;
                heights[i] = avg;
            }
        }
    }

    // ---------- Optional smoothing ----------
    const smoothingPasses = 1; // you can tweak this
    for (let pass = 0; pass < smoothingPasses; pass++) {
        const copy = heights.slice();

        for (let iy = 1; iy < ny - 1; iy++) {
            for (let ix = 1; ix < nx - 1; ix++) {
                const i = iy * nx + ix;
                const h = copy[i];

                const left = copy[i - 1];
                const right = copy[i + 1];
                const up = copy[i - nx];
                const down = copy[i + nx];

                heights[i] = (h + left + right + up + down) / 5;
            }
        }
    }

    const minHeight = Math.min(...heights);
    const maxHeight = Math.max(...heights);

    // ---------- Build simple LOD levels (2D “octree” / quadtree) ----------
    const lodLevels: HeightfieldV4Out["lodLevels"] = [];
    let levelNx = nx;
    let levelNy = ny;
    let levelData = heights;

    let level = 0;
    while (levelNx >= 2 && levelNy >= 2 && level < 5) {
        lodLevels.push({
            level,
            nx: levelNx,
            ny: levelNy,
            heights: levelData.slice(),
        });

        const nextNx = Math.floor(levelNx / 2);
        const nextNy = Math.floor(levelNy / 2);
        const nextData = new Array(nextNx * nextNy);

        for (let iy = 0; iy < nextNy; iy++) {
            for (let ix = 0; ix < nextNx; ix++) {
                const i00 = (iy * 2) * levelNx + (ix * 2);
                const i10 = i00 + 1;
                const i01 = i00 + levelNx;
                const i11 = i01 + 1;
                const avg =
                    (levelData[i00] +
                        levelData[i10] +
                        levelData[i01] +
                        levelData[i11]) / 4;
                nextData[iy * nextNx + ix] = avg;
            }
        }

        levelData = nextData;
        levelNx = nextNx;
        levelNy = nextNy;
        level++;
    }

    return {
        nx,
        ny,
        minHeight,
        maxHeight,
        heights,
        lodLevels,
    };
}

self.onmessage = (event: MessageEvent) => {
    const { cmd, payload } = event.data as {
        cmd: string;
        payload: HeightfieldV4In;
    };

    if (cmd === "processHeightfield") {
        const result = processHeights(payload);
        (self as DedicatedWorkerGlobalScope).postMessage({
            cmd: "done",
            payload: result,
        });
    }
};
