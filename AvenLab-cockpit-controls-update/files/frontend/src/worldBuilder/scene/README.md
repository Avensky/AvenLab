# Editor renderers

WorldBuilderScene.tsx chooses layout vs collider view. LayoutScene.tsx owns camera/gizmos/imperative ghost motion. LayoutPlan.tsx is the SVG fallback. LayoutMeshes.tsx instances explicit shapes. WorldReference.tsx shows optional source GLBs or lightweight boxes. SpawnMarkers.tsx shows team headings.

## How to edit

Authoring uses a demand canvas. Imperative ghost moves must call invalidate(). LOD checks run on demanded frames and retain throttling during continuous gameplay. Prefab previews do not spawn Rapier bodies. Fit includes spawn points and authored geometry. The running Sandbox renderers unmount while this scene is active.
