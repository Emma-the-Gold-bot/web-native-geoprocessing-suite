# Plugin Schema — Core → Operations → Chains

## Architecture

```
NL → [AI translates] → Operations / Chains → Engine executes
```

Three layers, one contract. The schema is the interface for all consumers:
- **Engine** — validates inputs, enforces contracts, refuses bad calls
- **UI** — renders dialogs, parameter forms, confirmation surfaces
- **AI** — understands capabilities, maps intent, fills parameters

---

## Type Definitions

### OperationIntent (new — the AI-facing surface)

```typescript
interface OperationIntent {
  /** Words that trigger this operation from natural language */
  triggers: string[];

  /** Plain-English description of what the operation does */
  description: string;

  /** Parameters the AI must resolve before execution */
  parameters: IntentParameter[];

  /** When this operation is the right choice */
  typical_use: string;

  /** What the user probably means when they say certain things */
  examples: IntentExample[];

  /** What NOT to confuse this with */
  disambiguation?: string;
}

interface IntentParameter {
  name: string;
  type: 'artifact' | 'number' | 'string' | 'field' | 'crs';
  required: boolean;
  description: string;
  /** For type='number': unit context */
  unit_hint?: string;
  /** For type='field': which artifact to pull fields from */
  source?: 'primary' | 'secondary';
  /** For type='artifact': role in the operation */
  role?: 'source' | 'mask' | 'overlay' | 'join_table';
}

interface IntentExample {
  query: string;
  resolution: string;  // how the AI interprets this
}
```

### ChainDefinition (new — composed workflows)

```typescript
interface ChainStepInput {
  /** Reference to a step output or user parameter */
  ref: string;
}

interface ChainStep {
  /** Operation id from the registry */
  op: string;

  /** Named inputs — values are refs to step outputs ($stepN.field) or user params ($param) */
  inputs: Record<string, string>;

  /** Optional: override output name */
  output_name?: string;
}

interface ChainDefinition {
  id: string;
  label: string;
  description: string;

  /** AI-facing intent (same shape as OperationIntent) */
  intent: OperationIntent;

  /** User-facing parameters (the AI asks for these) */
  parameters: IntentParameter[];

  /** Ordered execution steps */
  steps: ChainStep[];
}
```

### Extended OperationDefinition

```typescript
interface OperationDefinition {
  // ... all existing fields unchanged ...

  /** NEW: AI-facing intent metadata */
  intent?: OperationIntent;
}
```

---

## Why This Works

1. **One definition, three consumers.** The AI reads `intent`, the UI reads `uiHints` and contracts, the engine reads `geometryContract`/`crsContract`/`outputContract`. Same file.

2. **No separate AI API.** The registry IS the interface. The AI happens to be the one filling parameters this time instead of the human clicking through a form.

3. **Chains compose existing operations.** No new engine code. The orchestrator runs steps sequentially, threading outputs to inputs. The provenance model already tracks multi-step lineage.

4. **Intent metadata is additive.** No existing fields change. The `intent` block sits alongside the existing `OperationDefinition` shape.

---

## Files

| File | Purpose |
|------|---------|
| `PLUGIN-SCHEMA.md` | This document — architecture overview |
| `OPERATION-INTENT-MAP.ts` | Intent metadata for all 15 operations (13 registered + 2 pending) |
| `CHAIN-REGISTRY.ts` | Pre-built composed workflows (7 chains) |

## Open Design Questions

1. **Chain execution**: Does the engine execute chains atomically (transactional, all-or-nothing) or step-by-step (each step produces an intermediate artifact)?
   - Recommendation: step-by-step. Each intermediate artifact is inspectable. Matches the existing provenance model.

2. **Chain storage**: Are chains first-class persisted objects or generated on-the-fly by the AI?
   - Recommendation: both. Pre-built chains live in a registry. The AI can also compose ad-hoc chains from operations and propose them to the user.

3. **Generated operations (Tier 3)**: When the AI generates a new operation from engine primitives, where does it live?
   - Recommendation: not yet. Prove Tier 1 (pre-built ops) and Tier 2 (composed chains) first.

4. **Parameter inference**: Can the AI infer parameters from context? ("Clip to the county" → which county? The one loaded in the workspace.)
   - Recommendation: the AI should always ask when ambiguous. The confirmation step is the safety net.
