# Scripts

Map/catalog generators: build-road-colliders.mjs and build-placement-colliders.mjs measure assets; build-road-jump-lab.mjs, build-workshop-yard.mjs and build-road-test-map.mjs create server maps. sync-world-builder-map.mjs copies installed maps to frontend/public/world-builder at dev/build. Preview scripts build the isolated tools. city-lod/ and optimize-city-textures.py build visual variants.

Run generators from repository root. Inspect their diff and run frontend/Rust checks before installing. Generated collision catalogs are shared contracts, not independently hand-edited copies.
