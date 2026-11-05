# Fleet artwork revision

Remote vehicle components subscribe to the artwork revision. A successful detail-tier GLB load increments the revision and wakes subscribers. The request queue is limited by active loads and consumer demand. Failed loads become eligible for retry after 15 seconds. The revision is local and has no periodic publisher.

[Implementation](fleetAssets.ts) · [All store update rates](../store/README.md)
