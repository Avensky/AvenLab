import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePreferencesStore } from "../../store/preferencesStore";

const motionQuery = "(prefers-reduced-motion: reduce)";
const systemReducedMotion = () => window.matchMedia?.(motionQuery).matches ?? false;
function subscribeMotion(listener: () => void) {
  const query = window.matchMedia?.(motionQuery);
  query?.addEventListener("change", listener);
  return () => query?.removeEventListener("change", listener);
}

// Shared by Main and the mode loader. Media readiness never gates menu input.
export function MenuVideoBackground({ loading = false }: { loading?: boolean }) {
  const reducedMotion = usePreferencesStore(s => s.reducedMotion);
  const systemMotion = useSyncExternalStore(subscribeMotion, systemReducedMotion, () => false);
  const [failed, setFailed] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const enabled = !reducedMotion && !systemMotion && !failed;

  useEffect(() => {
    const element = video.current;
    if (!element || !enabled) return;
    const play = () => {
      if (document.hidden) element.pause();
      else void element.play().catch(() => { /* Some mobile browsers require an interaction. */ });
    };
    play();
    document.addEventListener("visibilitychange", play);
    window.addEventListener("pointerdown", play, { passive: true });
    window.addEventListener("keydown", play);
    return () => {
      element.pause();
      document.removeEventListener("visibilitychange", play);
      window.removeEventListener("pointerdown", play);
      window.removeEventListener("keydown", play);
    };
  }, [enabled]);

  return <div aria-hidden="true" className={`menu-video-background${loading ? " menu-video-background-loading" : ""}`}>
    {enabled && <video ref={video} src="/videos/NIWC-Pacific.mp4" autoPlay muted loop playsInline
      preload="metadata" tabIndex={-1} disablePictureInPicture disableRemotePlayback onError={() => setFailed(true)} />}
  </div>;
}
