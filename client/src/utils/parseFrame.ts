import type { CanFrame, NormalFrame } from "../store";


export function isCanArray(frame: unknown): frame is CanFrame {
    return Array.isArray(frame) && typeof frame[0] === 'string' && frame.length > 8;
}

function hexStringToByteArray(hexStr: string): number[] {
    if (!hexStr || typeof hexStr !== 'string') return [];

    // Clean spaces and ensure even length
    const cleaned = hexStr.replace(/\s+/g, '').trim();
    const padded = cleaned.length % 2 !== 0 ? '0' + cleaned : cleaned;

    const bytes: number[] = [];
    for (let i = 0; i < padded.length; i += 2) {
        const byte = parseInt(padded.slice(i, i + 2), 16);
        if (!isNaN(byte)) bytes.push(byte);
    }
    return bytes;
}

export const normalizeData = (input: Record<string, unknown>) => {
    if (!input) return [];

    if (Array.isArray(input)) {
        return input.filter(Boolean); // removes null/undefined
    }

    return Object.values(input).filter(Boolean); // assumes object values are the data entries
};

export function normalizeToCanFrames(normalFrames: NormalFrame[]): CanFrame[] {
    // if (!Array.isArray(frames)) return [];
    return normalFrames.map(frame => {
        const hexId = frame.hex_id ?? `0x${(frame.raw_id || 0).toString(16)}`;
        const timestamp = Number(frame.timestamp) || 0;
        const elapsed = frame.elapsed_ms ?? 0;
        const dlc = frame.dlc ?? (frame.raw_payload?.data?.length || 0);
        const rawData = frame?.data || [];
        // ✅ Convert string to number[]
        const data = Array.isArray(rawData) ? rawData : hexStringToByteArray(rawData);

        // Convert to CanFrame shape
        return [
            hexId,                      // 0: hex id
            frame.signal_name ?? "",    // 1: signal name
            frame.raw_id ?? 0,          // 2: id (if exists)
            frame.decoded ?? "",        // 3: decoded
            timestamp,                  // 4: timestamp
            elapsed,                    // 5: elapsed time
            data,                       // 8: byte array
            dlc                         // 9: data length
        ] as CanFrame;
    });
}