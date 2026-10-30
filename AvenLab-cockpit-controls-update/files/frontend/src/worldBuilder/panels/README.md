# Editor controls

WorldBuilderPanel.tsx is the header/library/tool shell. LayoutInspector.tsx shows one control section at a time. SpawnInspector.tsx edits teams/XYZ/heading. EditorWorldControls.tsx chooses source/theme/LOD. CollisionBuilderPanel.tsx edits legacy boxes; PiecePreview.tsx previews one source.

## How to edit

Keep world identity, theme, detail and inspector visibility in the header. Export title is file metadata under Files. Narrow selectors keep cursor updates from rerendering unrelated controls. NumberField commits on blur/Enter, validates once, and supplies undo; never write a draft on every input keystroke.
