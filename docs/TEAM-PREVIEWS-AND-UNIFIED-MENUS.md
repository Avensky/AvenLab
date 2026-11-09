# Team previews, shared menus and camera dragging

Quickplay hero selection and queue staging use a temporary Red or Blue garage accent derived from the confirmed team. The same garage fixture/reflection pipeline is reused. Leaving staging restores the player's selected palette; team lighting never rewrites the app theme, vehicle style or garage preferences.

The predeployment preview contains only your team's five slots. Vehicle artwork is larger, with player, vehicle and role text to the right. Empty teammate slots remain placeholders. Portrait focus can scroll the strip without selecting a different hero. Full match composition and archived result Team views have View All, Red Team and Blue Team filters. LB/RB remains the primary Team/Stats or result-section row; LT/RT changes composition filters. Keyboard uses 1/3 for the secondary row. Triggers do not also drive while used for composition filtering; ordinary Stats viewing retains existing driving controls.

Heroes starts at the collection with the saved favorite selected, when available. Choose a portrait to open Customize and hold X to set the main. The Abilities tab describes the selected vehicle and Concepts is available beside the role filters in Heroes. LB/RB cycle the visible tabs. The garage uses the shared Play header, footer and theme. Appearance edits save to the player's profile.

Career, Settings and Worlds/Social now share a MenuFrame for theme variables, spacing, header/footer, square tabs, focus glow and safe areas. Content, navigation and authenticated request ownership remain in their screens. The app's existing theme selector is the only theme state.

Primary mouse/trackpad dragging on the bare world canvas moves the driving camera again. Right-drag and touch remain supported. HUD controls keep their own pointer ownership, and menus, loading, pointer loss, blur and hidden-tab transitions release the gesture. Scope uses a separate drag-to-aim owner; the normal camera drag is disabled there. Scope aiming uses existing turret sensitivity preferences and becomes finer at higher zoom. It never fires a weapon by itself and does not change the prior-angle-lock restoration rule.

Acceptance still needed: physical controller/thumb reach, trackpad feel, scope sensitivity, team garage appearance with the installed GLBs, and long multiplayer sessions. Git LFS model placeholders in this checkout limit complete rendered-garage acceptance; source lighting/reflection checks and UI browser checks are separate.
