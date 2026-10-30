import { useId } from "react";
import { LIBRARY_TABS, type LibraryTab } from "../document/libraryCatalog";
export function LibraryTabs({
  active,
  onChange,
}: {
  active: LibraryTab;
  onChange: (tab: LibraryTab) => void;
}) {
  const id = useId();
  return (
    <nav
      className="le-categories tabbed-menu-tabs"
      role="tablist"
      aria-label="Prefab categories"
    >
      {LIBRARY_TABS.map((tab, index) => (
        <button
          className="menu-control menu-tab"
          key={tab.id}
          id={`${id}-${tab.id}`}
          type="button"
          role="tab"
          aria-selected={active === tab.id}
          aria-controls="world-prefab-library"
          tabIndex={active === tab.id ? 0 : -1}
          onClick={() => onChange(tab.id)}
          onKeyDown={(e) => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key))
              return;
            e.preventDefault();
            e.stopPropagation();
            const next =
              e.key === "Home"
                ? 0
                : e.key === "End"
                  ? LIBRARY_TABS.length - 1
                  : (index +
                      (e.key === "ArrowLeft" ? -1 : 1) +
                      LIBRARY_TABS.length) %
                    LIBRARY_TABS.length;
            onChange(LIBRARY_TABS[next].id);
            document.getElementById(`${id}-${LIBRARY_TABS[next].id}`)?.focus();
          }}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
