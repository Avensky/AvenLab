import {forwardRef,type ComponentPropsWithoutRef} from 'react';

type MenuTabButtonProps = Omit<ComponentPropsWithoutRef<"button">, "type" | "role" | "aria-selected"> & {
  selected: boolean;
  angled?: boolean;
  separatorBefore?: boolean;
};

/** Shared native tab surface. Each menu retains its own selection, roving
 * focus and controller routing; focusing a tab never commits by default. */
export const MenuTabButton = forwardRef<HTMLButtonElement, MenuTabButtonProps>(function MenuTabButton({
  selected, angled, separatorBefore, className = "", children, ...props
}, ref) {
  return (
    <button {...props} ref={ref} type="button" role="tab" aria-selected={selected}
      className={`${angled ? "angled-header-tab" : "menu-control"} ${className}`}>
      {children}
      {angled && (
        <svg className="angled-header-edge" data-separator={separatorBefore || undefined} viewBox="0 0 18 72" preserveAspectRatio="none" aria-hidden="true">
          <path d="M18 0 0 72" />
        </svg>
      )}
    </button>
  );
});
