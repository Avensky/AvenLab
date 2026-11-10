export function MenuLogo({ compact = false }: { compact?: boolean }) {
  return <img src="/images/logo.png" alt={compact ? "" : "Redline Vector"}
    className={compact ? "menu-logo menu-logo--header" : "menu-logo"} draggable={false} />;
}
