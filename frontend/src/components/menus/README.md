# Shared menu surfaces

`MenuFrame.tsx` and `menuFrame.css` provide the theme-driven full-screen shell,
compact header/footer, shared Xbox Back/shortcuts, safe-area spacing and square
scrollable tab strip used by Career, Settings and Worlds/Social. They consume the
same app palette; screens do not keep their own theme settings. Use
`menu-frame-tabs` for a strip and `menu-frame-content` for its scrollable body.

`TabbedMenu.tsx` owns Settings/debugger tab/row navigation and focus. `menus.css`
contains generic menu utilities; `theme/theme.css` supplies palette and contrast.
`menuFocus.ts` traps dialogs; `cityQualityControl.ts` shares graphics rows.

Keep screen logic outside the frame: Career owns its filters/history, Social owns
its in-flight requests and form navigation, and Settings owns its preference
controls. Header/footer actions use reusable controller components, never raw
text keys. Preserve focus, disabled states and visible labels when adding tools.
