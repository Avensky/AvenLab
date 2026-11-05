/** Compare the negotiated AI-v1 wire values, excluding sequence and dt.
 * A 100 ms refresh stays below the server's 250 ms combat freshness limit.
 * Changed controls (especially release) always send on the next input sample.
 */
export class InputSendGate {
  private previous: Uint8Array | null = null;
  private sentAt = -Infinity;

  reset() { this.previous = null; this.sentAt = -Infinity; }

  shouldSend(buffer: ArrayBuffer, now: number): boolean {
    const bytes = new Uint8Array(buffer), previous = this.previous;
    if (!previous || now - this.sentAt >= 100 || now < this.sentAt || bytes.length !== previous.length) return true;
    for (let i = 0; i < bytes.length; i++) {
      if (i >= 4 && i < 12) continue; // u32 sequence, f32 transport dt
      if (bytes[i] !== previous[i]) return true;
    }
    return false;
  }

  sent(buffer: ArrayBuffer, now: number) {
    this.previous = new Uint8Array(buffer); // encoder returns a new, immutable sample
    this.sentAt = now;
  }
}
