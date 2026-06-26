# Implementation Brief: NL → Plan → Confirm → Execute Loop

## Goal
Build the first working loop where a natural language query gets resolved to operations/chains, presented for confirmation, and executed against the engine. This is the proof that the plugin schema works as an AI-consumable interface.

## Architecture

```
User types NL query
       │
       ▼
┌──────────────────────┐
│    Query Resolver     │
│  (trigger matching)   │
│                       │
│  Input: "clip parcels │
│   to Butte County"    │
│                       │
│  Output: ranked       │
│  candidates with      │
│  params + confidence  │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│   Plan Builder        │
│                       │
│  Takes top candidate, │
│  resolves params to   │
│  workspace artifacts, │
│  builds execution     │
│  plan                 │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│   Confirmation UI     │
│                       │
│  Shows:               │
│  • What will happen   │
│  • Which operations   │
│  • Input artifacts    │
│  • Expected outputs   │
│  • Contract warnings  │
│                       │
│  [Confirm] [Edit]     │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│   Plan Executor       │
│                       │
│  Runs confirmed plan  │
│  step by step using   │
│  existing operation   │
│  executors            │
└──────────────────────┘
```

## Files to create

### 1. `src/lib/nl/plan-builder.ts`
Takes a query resolver candidate and workspace state, produces a concrete execution plan.

```typescript
interface PlannedStep {
  operationId: string;
  params: Record<string, any>;
  inputArtifacts: string[];  // artifact ids
  outputName: string;
  outputKind: 'spatial-artifact' | 'measurement-table';
  warnings: string[];        // contract warnings
  refusal?: string;          // if step can't execute
}

interface ExecutionPlan {
  id: string;
  description: string;       // human-readable: "Clip parcels to Butte County, then calculate area"
  source: 'chain' | 'operation';
  sourceId: string;          // chain id or operation id
  steps: PlannedStep[];
  canExecute: boolean;       // false if any step has a refusal
  confidence: number;        // from query resolver
}

function buildPlan(
  candidate: ResolvedCandidate,
  artifacts: Artifact[],
): ExecutionPlan
```

Key behaviors:
- Resolves `$source`, `$mask`, `$overlay`, `$join_table` params to actual artifact ids from workspace
- If param is ambiguous (multiple artifacts match), flag it — plan needs user input
- If param is missing (required but not provided), flag it — plan needs user input
- Validates each step against the operation's contract (CRS, geometry type)
- Populates warnings from the operation's `warningCodes`
- Sets `canExecute=false` if any step has a refusal condition

### 2. `src/lib/nl/plan-executor.ts`
Takes a confirmed execution plan and runs it step by step.

```typescript
interface ExecutionResult {
  success: boolean;
  artifacts: Artifact[];     // produced artifacts
  historyEvents: HistoryEvent[];
  errors: string[];
}

async function executePlan(
  plan: ExecutionPlan,
  context: {
    artifacts: Artifact[];
    addArtifact: (artifact: Artifact) => void;
    engine: any; // existing engine reference
  }
): Promise<ExecutionResult>
```

Key behaviors:
- Runs steps in order
- Threads step outputs to next step's inputs
- Uses existing operation executors (executeRegisteredSingleInputOperation, executeTopologyOperation, etc.)
- Creates history events for each step
- Returns all produced artifacts

### 3. `src/components/NLQueryPanel.tsx`
UI component that ties it all together. This replaces/extends the current SQL pane as the NL entry point.

Layout:
```
┌─────────────────────────────────────┐
│ 🔻 Ask in plain English             │
│                                      │
│ ┌─────────────────────────────────┐ │
│ │ "clip parcels to Butte County   │ │
│ │  and calculate area"         [→]│ │
│ └─────────────────────────────────┘ │
│                                      │
│ ── Execution Plan ───────────────── │
│                                      │
│ Step 1: Clip                         │
│   Source: parcels (12 features)      │
│   Mask: butte_county (1 feature)     │
│   ⚠ CRS: both EPSG:2226 ✓          │
│   Output: parcels_clipped            │
│                                      │
│ Step 2: Area                         │
│   Source: parcels_clipped            │
│   Output: measurement table          │
│   ⚠ Unit: square meters only        │
│                                      │
│ Confidence: high                     │
│                                      │
│ [Execute Plan]  [Edit Parameters]    │
│ [Ask AI to Refine]                   │
└─────────────────────────────────────┘
```

### 4. Extend `src/lib/nl/query-resolver.ts`
The prototype exists. Extend it:
- Add chain resolution (currently only does operations)
- Add parameter extraction from query text (numbers, artifact names)
- Add confidence scoring

## Files to modify

### `src/App.tsx`
- Add NL query panel to the bottom dock (alongside SQL, table, results)
- Wire plan executor to addArtifact / engine
- Add state for active plan

### `src/lib/operations/chain-registry.ts`
- Add `resolveChainStepInputs()` helper that maps $param refs to actual values

## Integration points (do NOT modify these)
- `executeRegisteredSingleInputOperation` — for single-geometry ops
- `executeTopologyOperation` — for clip, intersect
- `executeRegisteredMeasurementOperation` — for area, perimeter, compactness
- `executeRegisteredAggregationOperation` — for dissolve
- `executeAttributeJoinOperation` — for joins
- `executeRegisteredSingleInputOperation` with reproject — for CRS ops

## Test queries to verify

1. **Simple operation:** "Buffer the parcels by 500 feet"
   - Expected: resolves to buffer op, asks for distance if not in query
2. **Two-step chain:** "Clip parcels to Butte County and calculate area"
   - Expected: resolves to area-within-boundary chain
3. **Ambiguous:** "Show me what's near the rivers"
   - Expected: asks "how near?" — no distance provided
4. **Multi-artifact:** "Join ownership to parcels by APN"
   - Expected: resolves to attribute-join, needs key field confirmation
5. **No match:** "Find the median income by census tract"
   - Expected: no operation matches, suggests SQL query instead

## Constraints
- Existing operation execution paths must not change
- Existing UI must not break
- NL panel is additive — sits alongside SQL, not replacing it
- Build must pass
