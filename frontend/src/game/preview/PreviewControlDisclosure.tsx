import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { PreviewToolButton } from "./PreviewToolButton";
import { PreviewToolIcon } from "./PreviewToolIcon";

export function PreviewControlDisclosure({ label, icon, children, panelClass = "fitting-camera-panel" }: {
  label: string;
  icon: ReactNode;
  children: ReactNode;
  panelClass?: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const container = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const focusPanel = useRef(false);

  useEffect(() => {
    if (!open) return;
    const element = container.current;
    if (focusPanel.current) {
      const selected = panel.current?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]:not(:disabled)');
      (selected ?? panel.current?.querySelector<HTMLElement>("button:not(:disabled), select:not(:disabled), input:not(:disabled)"))?.focus();
    }
    function dismissOutside(event: MouseEvent) {
      if (!element?.contains(event.target as Node)) setOpen(false);
    }
    function dismiss(event: Event) {
      event.preventDefault();
      event.stopImmediatePropagation();
      setOpen(false);
      toggle.current?.focus();
    }
    function dismissOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape" || event.code === "Escape") dismiss(event);
    }
    function dismissOnBack(event: Event) {
      if ((event as CustomEvent).detail === "back" && element?.contains(document.activeElement)) dismiss(event);
    }
    document.addEventListener("click", dismissOutside, true);
    element?.addEventListener("keydown", dismissOnEscape, true);
    window.addEventListener("avenlab:panel-action", dismissOnBack, true);
    return () => {
      document.removeEventListener("click", dismissOutside, true);
      element?.removeEventListener("keydown", dismissOnEscape, true);
      window.removeEventListener("avenlab:panel-action", dismissOnBack, true);
    };
  }, [open]);

  return <div ref={container} className="preview-control-disclosure" data-controller-row>
    <PreviewToolButton ref={toggle} label={label}
      aria-controls={id} aria-expanded={open}
      onClick={event => { focusPanel.current = event.detail === 0; setOpen(previous => !previous); }}>{icon}</PreviewToolButton>
    <div ref={panel} className={panelClass} id={id} hidden={!open}>{children}</div>
  </div>;
}

export function PreviewCameraAngles({ children }: { children: ReactNode }) {
  return <PreviewControlDisclosure label="Camera angles" icon={<PreviewToolIcon icon="camera" />}
    panelClass="fitting-camera-panel fitting-camera-angles">{children}</PreviewControlDisclosure>;
}
