# World Builder asset collections

Every placeable asset keeps three separate identities:

- **Category** controls the World Builder tab, such as Greenery, Road Rails, Tunnels, or City Props.
- **Collection** records the source pack and powers the Pack filter.
- **Source** records the GLB path or original pack URL.

Keep source assets grouped by collection, but keep placeable pieces as separate assets. The editor can then filter by pack while each piece keeps its own placement, LOD, and collider data.

## Recommended organization

- Put tree species and variants in one collection named after their source pack. Keep each tree model distinct; the runtime can instance repeated trees instead of duplicating a giant merged GLB.
- Give modular bridge parts one shared collection, such as Modular Bridges. Keep spans, supports, ramps, rails, and drawbridge leaves as separate placeable pieces so each can use a matching collider.
- Give canal pieces a Canal Kit collection. Keep water, banks, locks, bridges, and props as separate items when they have different placement or collision behavior.
- Keep the three road systems in separate collections when their geometry, source pack, or collider rules differ. They can still share the same road workflow and stream through the same spatial-cell system.
- Use separate collections for city props, road rails, tunnels, full blocks, and trailers. A category says where to find an item in the editor; a collection says which pack it came from.
- If a source pack contains multiple kinds of assets, keep one collection name across them and choose the best matching category for each item.

For imported models, set `collection` to the exact pack name and `source` to the original GLB path or URL in the model catalog. For authored pieces, set the same fields on the `Piece` entry. Missing collection metadata appears under AvenLab Core, so items remain searchable while their provenance is being filled in.
