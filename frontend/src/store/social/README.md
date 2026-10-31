# Social view

socialStore stores only the latest sanitized server view plus connection/status
and pending invite-code display state. Physics snapshots are owned by networkStore
and never subscribe this menu to a per-frame rerender. Guest credentials belong to
net/socialClient.ts, not this public view; world passwords remain local form state.
