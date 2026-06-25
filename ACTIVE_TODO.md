# Active TODO — Web-native geoprocessing suite

## Current state

The plugin schema is integrated. The operation registry is the single interface for engine, UI, and AI. All 15 operations have intent metadata. The NL → Plan → Confirm → Execute loop is built.

What is now landed:
- Plugin schema architecture (Core → Operations → Chains)
- Intent metadata on all 15 operations (triggers, parameters, examples, disambiguation)
- Chain registry with 7 composed workflows
- `dissolve-global` and `crs-assign` formalized in the registry
- NL query resolver (trigger matching + chain resolution + parameter extraction + confidence scoring)
- Plan builder with contract validation (CRS, geometry type, refusal conditions)
- Plan executor using existing operation executors
- NL Query Panel ("Ask" tab in bottom dock)
- Build passes, existing behavior unchanged

## Next session priorities

### 1. Test the NL loop with real data
- Load sample GeoJSON or GeoParquet into the workspace
- Run the five test queries:
  1. "Buffer the parcels by 500 feet" → simple op
  2. "Clip parcels to Butte County and calculate area" → chain
  3. "Show me what's near the rivers" → ambiguous, should ask for distance
  4. "Join ownership to parcels by APN" → needs key field
  5. "Find the median income by census tract" → no match, should suggest SQL
- Fix any issues found

### 2. Wire LLM as alternative resolver
- The schema is ready — the AI reads the same registry
- Add an LLM-backed resolver alongside the trigger matcher
- The LLM reads the intent map + chain definitions and returns the same `ResolutionCandidate` shape
- The confirmation step is the safety net regardless of resolver

### 3. Parameter inference from workspace context
- "Clip to the county" → find the county artifact in workspace
- "Buffer the rivers" → find the rivers artifact
- Use artifact name matching, geometry type hints, and spatial metadata
- Always confirm ambiguous matches

### 4. Chain condition handling
- Some chains have optional steps (e.g., "skip enrichment step if not provided")
- The plan builder needs to handle conditional steps gracefully

## Not next

- Do not add new operations until the NL loop is proven with real data
- Do not build the LLM resolver before the trigger-matching path is tested
- Do not add raster or point cloud support
- Do not broaden the support envelope beyond what's validated

## Guiding principle

Prove the interface works before adding intelligence. The schema is the contract — the AI is replaceable.
