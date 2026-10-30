# World document and geometry

layoutDocument.ts validates runtime-space authored pieces and spawns. mapDocument.ts validates legacy schema 2 and exports combined maps. spawnDocument.ts converts source spawn locations and degrees/radians. libraryCatalog.ts defines larger prefabs. layoutGeometry.ts builds explicit shapes.

## How to edit

Add a piece with real parts/known assets and update the shared Rust schema. Road/garage physics come from measured catalogs. Layout Y is a base/support elevation; legacy boxes are Blender XYZ and converted exactly once. Pure document modules use explicit .ts imports for Node validation tools.
