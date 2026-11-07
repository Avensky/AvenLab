# Commercial building preview library

This branch prepares AvenLab’s World Builder for the 44 uploaded commercial building models. The binary GLBs are supplied in the separate AvenLab-WorldBuilder-Commercial-Assets.zip because they are too large for the repository write path used here.

After pulling this branch, copy the archive contents into the repository root and run:

    python scripts/build-commercial-buildings.py

The generator measures the GLB hierarchy, hashes each source, and builds the server/frontend model catalog. The UI continues using the existing shared lazy preview renderer. Full collection inventory is in docs/COMMERCIAL_BUILDING_INVENTORY.md.
