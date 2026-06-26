# Tomorrow — Web-native geoprocessing suite

## Starting point

The plugin schema is integrated and the NL loop is built.

What is now true:
- 15 operations in the registry, all with intent metadata (triggers, parameters, examples, disambiguation)
- 7 composed workflows in the chain registry
- NL → Plan → Confirm → Execute loop: query resolver, plan builder, plan executor, NL Query Panel
- `dissolve-global` and `crs-assign` formalized (were previously outside the registry)
- Build passes, existing behavior unchanged
- All prior milestone work (Milestone 0, Milestone 1 tranche 1, operations, substrate) remains intact

## First task next session

Test the NL loop with real data. Load a sample GeoJSON/GeoParquet into the workspace and run the five test queries through the NL Query Panel:

1. "Buffer the parcels by 500 feet" — simple operation, parameter extraction
2. "Clip parcels to Butte County and calculate area" — chain resolution
3. "Show me what's near the rivers" — ambiguous, should ask for distance
4. "Join ownership to parcels by APN" — needs key field confirmation
5. "Find the median income by census tract" — no match, should suggest SQL

Fix any issues found. Then decide whether to wire the LLM resolver or add parameter inference first.

## Near-term priority order

1. **NL loop QA with real data** — prove the loop works end-to-end
2. **Parameter inference** — resolve artifact references from workspace context
3. **LLM resolver** — wire an LLM as alternative to trigger matching
4. **Chain condition handling** — optional steps in composed workflows

## Still not next

- Do not add new operations until the NL loop is proven
- Do not build the LLM resolver before the trigger-matching path is tested
- Do not add raster, point cloud, or 3D support
- Do not broaden the support envelope

## Reminder

The plugin schema is the foundation. The AI is a replaceable engine that reads it. Prove the interface, then add intelligence.
