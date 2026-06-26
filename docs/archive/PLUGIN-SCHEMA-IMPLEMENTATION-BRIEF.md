# Implementation Brief: Plugin Schema Integration

## Goal
Integrate the plugin schema (intent metadata + chain definitions) into the existing web-native geoprocessing suite, making the operation registry AI-readable without breaking existing functionality.

## Scope

### Step 1: Formalize missing operations in registry
Add `dissolve-global` and `crs-assign` to `OPERATION_REGISTRY` in `src/lib/operations/registry.ts`.

**dissolve-global:**
- Family: `aggregation`
- Support tier: `partial` (same as other narrow ops)
- Geometry contract: single-input, polygon/multipolygon only
- CRS contract: require-known
- Output contract: single polygon, no source attributes
- Aggregation contract: scope `global-only`, groupingFieldMode `none`
- Currently exists in: `src/lib/spatial/operation-helper.ts` (line ~91), `src/App.tsx` (line 106 maps `dissolve` → `dissolve-global`)
- Need to wire: executor path, UI dialog, validation

**crs-assign:**
- Family: `crs`
- Support tier: `universal`
- Geometry contract: single-input, any geometry
- CRS contract: require-known-or-explicit (for target), source allow-any
- Output contract: metadata-only, no geometry change
- Currently exists in: `src/lib/spatial/` (assign vs transform separation), `SUPPORT-ENVELOPE.md`
- Need to wire: executor path, UI dialog (CRS picker), validation

### Step 2: Add intent type to OperationDefinition
In `src/lib/operations/types.ts`, add:

```typescript
export interface IntentParameter {
  name: string;
  type: 'artifact' | 'number' | 'string' | 'field' | 'crs';
  required: boolean;
  description: string;
  unit_hint?: string;
  source?: 'primary' | 'secondary';
  role?: 'source' | 'mask' | 'overlay' | 'join_table';
}

export interface IntentExample {
  query: string;
  resolution: string;
}

export interface OperationIntent {
  triggers: string[];
  description: string;
  parameters: IntentParameter[];
  typical_use: string;
  examples: IntentExample[];
  disambiguation?: string;
}
```

Add `intent?: OperationIntent` to `OperationDefinition`.

### Step 3: Merge intent map into registry
Import the intent data from `OPERATION-INTENT-MAP.ts` and add `intent` blocks to each entry in `OPERATION_REGISTRY`. The intent map file lives at project root; move the type definitions to `types.ts` and the data to a new `src/lib/operations/intent-data.ts` file.

### Step 4: Add chain registry
Move `CHAIN-REGISTRY.ts` contents into `src/lib/operations/chain-registry.ts` with proper types. Export `CHAIN_REGISTRY`, `findChainsByTrigger`, `findOperationsByTrigger`.

### Step 5: Build NL query resolver (prototype)
Create `src/lib/nl/query-resolver.ts`:
- `resolveQuery(query: string)` → returns `{ type: 'operation' | 'chain', id: string, params: Record<string, any>, confidence: number }[]`
- Uses trigger matching from intent map + chain registry
- Returns ranked candidates, not a single answer
- The AI/confirmation UX consumes the candidates, not this module

## Constraints
- Do not modify existing operation execution paths
- Do not break existing UI dialogs
- Existing tests must pass
- TypeScript build must pass
- New code should be additive (new files or new fields on existing types)

## Files to modify
- `src/lib/operations/types.ts` — add intent types
- `src/lib/operations/registry.ts` — add dissolve-global, crs-assign, add intent fields
- `src/lib/operations/index.ts` — export new types

## Files to create
- `src/lib/operations/intent-data.ts` — intent map data (from OPERATION-INTENT-MAP.ts)
- `src/lib/operations/chain-registry.ts` — chain definitions (from CHAIN-REGISTRY.ts)
- `src/lib/nl/query-resolver.ts` — NL trigger matching prototype

## Validation
- `npm run build` passes
- Existing operations still render in UI
- New operations (dissolve-global, crs-assign) appear in registry
- Intent data is accessible via `getOperationDefinition('buffer').intent`
- Chain registry is queryable
