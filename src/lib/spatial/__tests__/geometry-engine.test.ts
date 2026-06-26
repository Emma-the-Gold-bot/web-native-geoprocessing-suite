/**
 * Tests for geometry-engine.ts — Spatial engine layer
 *
 * Covers:
 *   1. Capability reporting (structure and content of GEOMETRY_CAPABILITIES)
 *   2. Helper factory functions (createCrsWarning, createErrorResult, createSuccessResult)
 *   3. wrapAsFeatureCollection utility
 *   4. GeometryEngine interface contract (method existence on the exported interface type)
 */
import { describe, it, expect } from 'vitest';
import {
  GEOMETRY_CAPABILITIES,
  createCrsWarning,
  createErrorResult,
  createSuccessResult,
  wrapAsFeatureCollection,
} from '../geometry-engine';
import type { GeometryEngine } from '../geometry-engine';

// ─── 1. Capability Reporting ──────────────────────────────────────────

describe('GEOMETRY_CAPABILITIES', () => {
  it('reports buffer and centroid support as validated_local', () => {
    expect(GEOMETRY_CAPABILITIES.bufferSupport.verified).toBe('validated_local');
    expect(GEOMETRY_CAPABILITIES.centroidSupport.verified).toBe('validated_local');
  });

  it('includes dissolve, clip, and intersect capability envelopes', () => {
    expect(GEOMETRY_CAPABILITIES.dissolveSupport).toBeDefined();
    expect(GEOMETRY_CAPABILITIES.dissolveSupport.verified).toBe('partial');
    expect(GEOMETRY_CAPABILITIES.clipSupport).toBeDefined();
    expect(GEOMETRY_CAPABILITIES.clipSupport.verified).toBe('partial');
    expect(GEOMETRY_CAPABILITIES.intersectSupport).toBeDefined();
    expect(GEOMETRY_CAPABILITIES.intersectSupport!.verified).toBe('partial');
  });

  it('has a finite maxFeatureCount that is positive', () => {
    expect(typeof GEOMETRY_CAPABILITIES.maxFeatureCount).toBe('number');
    expect(GEOMETRY_CAPABILITIES.maxFeatureCount).toBeGreaterThan(0);
    expect(Number.isFinite(GEOMETRY_CAPABILITIES.maxFeatureCount)).toBe(true);
  });

  it('includes notes arrays where present (partial operations)', () => {
    // dissolve, clip, convexHull, envelope, simplify, intersect are 'partial' and should have notes
    expect(GEOMETRY_CAPABILITIES.dissolveSupport.notes).toBeInstanceOf(Array);
    expect(GEOMETRY_CAPABILITIES.clipSupport.notes).toBeDefined();
    // Verify notes are arrays when present
    if (GEOMETRY_CAPABILITIES.convexHullSupport?.notes) {
      expect(Array.isArray(GEOMETRY_CAPABILITIES.convexHullSupport.notes)).toBe(true);
    }
  });
});

// ─── 2. Helper Factories ──────────────────────────────────────────────

describe('createCrsWarning', () => {
  it('returns a WarningRef with code CRS_MISSING', () => {
    const warning = createCrsWarning();
    expect(warning.code).toBe('CRS_MISSING');
    expect(warning.severity).toBe('serious');
    expect(warning.title).toBeTruthy();
    expect(warning.message).toBeTruthy();
    expect(warning.id).toBeTruthy();
  });
});

describe('createErrorResult', () => {
  it('produces a result with success=false and the given error', () => {
    const result = createErrorResult('TEST_CODE', 'test message');
    expect(result.success).toBe(false);
    expect(result.output).toBeUndefined();
    expect(result.errors).toEqual([{ code: 'TEST_CODE', message: 'test message' }]);
    expect(result.warnings).toEqual([]);
  });
});

describe('createSuccessResult', () => {
  it('produces a result with success=true and output', () => {
    const fc: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [],
    };
    const result = createSuccessResult(fc);
    expect(result.success).toBe(true);
    expect(result.output).toBe(fc);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('includes warnings when provided', () => {
    const fc: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
    const warning = createCrsWarning();
    const result = createSuccessResult(fc, [warning]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].code).toBe('CRS_MISSING');
  });
});

// ─── 3. wrapAsFeatureCollection ───────────────────────────────────────

describe('wrapAsFeatureCollection', () => {
  it('wraps a Point geometry into a FeatureCollection', () => {
    const point: GeoJSON.Point = { type: 'Point', coordinates: [10, 20] };
    const result = wrapAsFeatureCollection(point);
    expect(result.type).toBe('FeatureCollection');
    expect(result.features).toHaveLength(1);
    expect(result.features[0].type).toBe('Feature');
    expect(result.features[0].geometry).toBe(point);
    expect(result.features[0].properties).toEqual({});
  });

  it('wraps a Polygon geometry into a FeatureCollection', () => {
    const polygon: GeoJSON.Polygon = {
      type: 'Polygon',
      coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
    };
    const result = wrapAsFeatureCollection(polygon);
    expect(result.type).toBe('FeatureCollection');
    expect(result.features[0].geometry).toBe(polygon);
  });
});

// ─── 4. GeometryEngine interface contract ─────────────────────────────

describe('GeometryEngine interface contract', () => {
  it('exports all required method names in the interface type', () => {
    // This test validates the interface type exists and has the expected shape.
    // We cannot instantiate a GeometryEngine (it's an interface), but we can
    // verify the type is importable and assignable.
    const mockEngine: GeometryEngine = {
      initialized: true,
      initialize: async () => {},
      buffer: async () => createSuccessResult({ type: 'FeatureCollection', features: [] }),
      centroid: async () => createSuccessResult({ type: 'FeatureCollection', features: [] }),
      convexHull: async () => createSuccessResult({ type: 'FeatureCollection', features: [] }),
      envelope: async () => createSuccessResult({ type: 'FeatureCollection', features: [] }),
      simplify: async () => createSuccessResult({ type: 'FeatureCollection', features: [] }),
      dissolve: async () => createSuccessResult({ type: 'FeatureCollection', features: [] }),
      clip: async () => createSuccessResult({ type: 'FeatureCollection', features: [] }),
      intersect: async () => createSuccessResult({ type: 'FeatureCollection', features: [] }),
      getCapabilities: () => GEOMETRY_CAPABILITIES,
    };

    expect(typeof mockEngine.initialize).toBe('function');
    expect(typeof mockEngine.buffer).toBe('function');
    expect(typeof mockEngine.getCapabilities).toBe('function');
    expect(typeof mockEngine.clip).toBe('function');
    expect(typeof mockEngine.intersect).toBe('function');
  });
});
