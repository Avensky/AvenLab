/** One small shared relay sound, independent of radio and rendering. There is
 * no engine sample, download, idle audio timer or per-frame React update. */
export function createStarterRelayAudio(
  contextFactory: () => AudioContext | null = () =>
    typeof window.AudioContext === "function"
      ? new window.AudioContext()
      : null,
  schedule = (callback: () => void, delay: number) =>
    window.setInterval(callback, delay),
  cancel = (timer: number) => window.clearInterval(timer),
) {
  let context: AudioContext | null = null;
  let timer: number | null = null;
  const owners = new Set<symbol>();
  const voices = new Set<OscillatorNode>();
  const click = () => {
    if (!context || context.state !== "running") return;
    const now = context.currentTime;
    const voice = context.createOscillator(),
      gain = context.createGain();
    voice.type = "square";
    voice.frequency.setValueAtTime(820, now);
    voice.frequency.exponentialRampToValueAtTime(110, now + 0.018);
    gain.gain.setValueAtTime(0.035, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.025);
    voice.connect(gain).connect(context.destination);
    voices.add(voice);
    voice.onended = () => {
      voices.delete(voice);
      voice.disconnect();
      gain.disconnect();
    };
    voice.start(now);
    voice.stop(now + 0.026);
  };
  const stop = () => {
    if (timer !== null) cancel(timer);
    timer = null;
    for (const voice of voices) voice.stop();
    voices.clear();
  };
  return {
    // Called only from a deliberate gesture; the browser owns audio consent.
    unlock() {
      try {
        context ??= contextFactory();
        if (context?.state === "suspended")
          void context.resume().catch(() => {});
      } catch {
        /* Audio-less browsers still operate the key normally. */
      }
    },
    setCranking(owner: symbol, confirmed: boolean) {
      if (confirmed) owners.add(owner);
      else owners.delete(owner);
      if (!owners.size) {
        stop();
        return;
      }
      if (timer === null && context) {
        click();
        timer = schedule(click, 115);
      }
    },
    dispose() {
      owners.clear();
      stop();
      void context?.close().catch(() => {});
      context = null;
    },
  };
}

export const starterRelayAudio = createStarterRelayAudio();
if (import.meta.hot) import.meta.hot.dispose(() => starterRelayAudio.dispose());
