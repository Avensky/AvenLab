# Road navigation algorithms

roadNavigation.ts deduplicates up to 1024 road boxes, connects nearby segments and provides nearest-road/A* route helpers.

## How to edit

Edit route math here; marker/theme/layout changes belong to ui/Minimap. A mission supplies its target through navigationStore, not by changing a collider or forcing a GPS click.
