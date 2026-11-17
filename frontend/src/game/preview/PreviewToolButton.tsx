import { forwardRef, type ComponentPropsWithoutRef } from "react";
import "./previewControls.css";

type PreviewToolButtonProps = Omit<ComponentPropsWithoutRef<"button">, "type" | "aria-label" | "title"> & {
  label: string;
};

export const PreviewToolButton = forwardRef<HTMLButtonElement, PreviewToolButtonProps>(function PreviewToolButton({
  label, className, ...props
}, ref) {
  return <button {...props} ref={ref} type="button" aria-label={label} title={label}
    className={className ? `menu-control fitting-tool-icon ${className}` : "menu-control fitting-tool-icon"} />;
});
