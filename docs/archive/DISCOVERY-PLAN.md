# Data Discovery Integration — Plan

> Phase 2 (PLAN) of spec-driven development.
> Spec: `DISCOVERY-SPEC.md` (approved 2026-06-14)
> Status: **Draft — awaiting human review.**

---

## Work Units

### Unit 1 — Backend Scaffolding
Set up the `discovery/` directory structure, dependencies, FastAPI app skeleton with health check, and Vite proxy configuration.

**Complexity:** S — boilerplate, well-defined

### Unit 2 — Schemas & Types
Define `DiscoveryRequest`, `DiscoveryResult`, `DiscoveryCandidate`, `Provenance`, `BBox` Pydantic models in the backend. These are the contract between backend and frontend.

**Complexity:** S — data shapes, no logic

### Unit 3 — Protocol Clients
Port all 6 protocol clients from geo-harness `sources.py` into the backend, plus Nominatim geocoding. Clients: `overpass`, `fetch_file`, `arcgis_feature_server`, `ckan_search`, `web_search`, `stac_sentinel2`, `geocode`.

**Complexity:** L — bulk of the porting work, each client needs adaptation from geo-harness internals (GeoPandas returns → JSON-serializable responses)

### Unit 4 — Heuristic Router
Build the keyword-matching protocol router and the research loop (web_search → follow-up fetch). No LLM dependency.

**Complexity:** M — routing logic + research chaining

### Unit 5 — Server Endpoint
Wire `POST /api/discover` in `server.py` — takes request, calls router, returns results. Wire `/api/geocode` too. Add Vite proxy config.

**Complexity:** S — glue code

### Unit 6 — Frontend API Client
Create `src/lib/discovery.ts` — typed fetch wrapper for `/api/discover` and `/api/geocode`.

**Complexity:** S — thin HTTP client

### Unit 7 — TypeScript Types
Add `DiscoveryResult`, `DiscoveryCandidate`, `DiscoveryProvenance` types to `src/types.ts`.

**Complexity:** S — type definitions

### Unit 8 — Discovery Panel Component
Create `src/components/DiscoveryPanel.tsx` — search input, result display, import button. Follows existing bottom dock tab patterns.

**Complexity:** M — UI component with state management

### Unit 9 — App Integration
Wire `DiscoveryPanel` as a tab in the bottom dock in `src/App.tsx`. Connect discovery results to the existing import pipeline.

**Complexity:** M — integration with existing UI + import flow

### Unit 10 — Backend Tests
Unit tests for protocol clients (mocked HTTP), router, geocoding, and error handling. Port/adapt tests from geo-harness.

**Complexity:** M — test coverage across all clients

### Unit 11 — Frontend Smoke Test
Manual QA: type a query → see results → import → map renders. Verify end-to-end.

**Complexity:** S — manual verification

---

## Dependency Graph

```
Unit 1 (scaffolding)
  └── Unit 2 (schemas)
       ├── Unit 3 (protocol clients) — depends on schemas for return types
       │    └── Unit 4 (router) — depends on protocol clients existing
       │         └── Unit 5 (server endpoint) — depends on router
       │              └── Unit 6 (frontend API client) — depends on endpoint shape
       │                   ├── Unit 8 (discovery panel) — depends on API client + types
       │                   └── Unit 9 (app integration) — depends on panel + types
       └── Unit 7 (TS types) — depends on backend schema shape
            └── Unit 8 (discovery panel) — depends on types

Unit 10 (backend tests) — runs in parallel with Units 5–9
Unit 11 (smoke test) — after Unit 9
```

## Execution Sequence

Based on dependencies, the implementation order is:

1. **Unit 1** — Backend scaffolding
2. **Unit 2** — Schemas
3. **Unit 7** — TypeScript types (can happen alongside Unit 2 since shape is known from spec)
4. **Unit 3** — Protocol clients
5. **Unit 4** — Router
6. **Unit 5** — Server endpoint
7. **Unit 6** — Frontend API client
8. **Unit 8** — Discovery panel
9. **Unit 9** — App integration
10. **Unit 10** — Backend tests (can start earlier, but needs clients to exist)
11. **Unit 11** — Smoke test

## Risks & Mitigations

| Risk | Unit | Mitigation |
|------|------|-----------|
| GeoPandas dependency heavy for backend | 3 | Protocol clients use lazy imports (same pattern as geo-harness) |
| STAC resolution needs backend post-processing | 3 | Backend resolves STAC asset refs to direct download URLs before returning |
| Import pipeline doesn't accept discovery result format | 9 | Thin adapter layer — discovery result has `data_url` which import pipeline can consume as URL |
| CORS between Vite dev server and backend | 5 | Vite proxy config, no CORS headers needed |

---

## Estimated Effort

- Units 1–2: ~15 min each (boilerplate)
- Unit 3: ~45 min (bulk porting, adaptation from GeoPandas → JSON)
- Units 4–5: ~20 min each
- Units 6–7: ~10 min each
- Unit 8: ~30 min (UI component)
- Unit 9: ~25 min (integration)
- Unit 10: ~30 min (test porting)
- Unit 11: ~10 min (manual QA)

**Total: ~3.5 hours of implementation**
