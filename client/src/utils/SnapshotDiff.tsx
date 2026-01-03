import type { CanFrame } from "../store";


export function SnapshotDiff(A: CanFrame[], B: CanFrame[]) {
    const mapA = new Map(A.map(frame => [frame[0], frame]));
    const mapB = new Map(B.map(frame => [frame[0], frame]));

    const diff: Record<string, { changed: boolean; byteDiffs: [string, string][] }> = {};

    const allIds = new Set([...mapA.keys(), ...mapB.keys()]);

    allIds.forEach(id => {
        const frameA = mapA.get(id);
        const frameB = mapB.get(id);

        if (!frameA || !frameB) {
            diff[id] = { changed: true, byteDiffs: [['-', frameB ? 'new' : 'deleted']] };
        } else {
            const bytesA = frameA[8].map(b => b.toString(16).padStart(2, '0'));
            const bytesB = frameB[8].map(b => b.toString(16).padStart(2, '0'));
            const byteDiffs: [string, string][] = [];

            bytesA.forEach((b, idx) => {
                if (b !== bytesB[idx]) {
                    byteDiffs.push([b, bytesB[idx]]);
                }
            });

            diff[id] = { changed: byteDiffs.length > 0, byteDiffs };
        }
    });

    return diff;
}
