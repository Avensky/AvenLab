# Docked carrier

BigEDocked renders the normalized CVN-65 geometry shared by the selection preview and the docked carrier prefab. The prefab origin lies on the flight deck. World Builder uses the same measured deck strips as Rapier. The detailed ship is a static platform.

Run `python scripts/build-carrier-prefab.py` with NumPy installed to bake the runtime mesh and collision measurements from the Big E source. Run `node scripts/build-harbor-canals.mjs` to rebuild the installed map presets after changing their layout.
