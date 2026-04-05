/**
 * CRS Engine Interface
 * 
 * Provides coordinate reference system operations using PROJ-WASM.
 * This module defines the boundary between product artifacts and 
 * PROJ compute operations.
 */

import type {
  GeometryOperationInput,
  GeometryOperationResult,
  CrsCapabilities,
  CrsInfo,
  TransformPair,
  WarningRef,
} from './types';

export interface CrsEngine {
  readonly initialized: boolean;
  initialize(): Promise<void>;
  getCRSInfo(epsgCode: string): Promise<CrsInfo | null>;
  transform(
    input: GeometryOperationInput,
    sourceEpsg: string,
    targetEpsg: string
  ): Promise<GeometryOperationResult>;
  assignCRS(input: GeometryOperationInput, epsgCode: string): Promise<GeometryOperationResult>;
  getSupportedTransforms(): Promise<TransformPair[]>;
}

/**
 * CRS engine capabilities - reflects what's actually implemented
 */
export const CRS_CAPABILITIES: CrsCapabilities = {
  // Common projections that PROJ-WASM supports via bundled proj.db
  supportedProjections: [
    'EPSG:4326', // WGS84
    'EPSG:3857', // Web Mercator
    'EPSG:32610', // UTM Zone 10N
    'EPSG:32611', // UTM Zone 11N
    'EPSG:32612', // UTM Zone 12N
    // Add more as needed
  ],
  autoTransform: false, // Require explicit user action for transforms
  transformSupport: {
    verified: 'validated_local',
    runtimeSensitive: true,
    notes: ['Broader runtime support is environment-sensitive outside the hardened local setup.'],
  },
  assignSupport: {
    verified: 'universal',
    notes: ['Assign CRS is metadata-only and does not move coordinates.'],
  },
};

/**
 * Common CRS codes that are typically supported
 */
export const COMMON_CRS_CODES = [
  { code: 'EPSG:4326', name: 'WGS84', description: 'World Geodetic System 1984' },
  { code: 'EPSG:3857', name: 'Web Mercator', description: 'Google Maps / OpenStreetMap projection' },
  { code: 'EPSG:32610', name: 'UTM Zone 10N', description: 'Universal Transverse Mercator Zone 10 North' },
  { code: 'EPSG:32611', name: 'UTM Zone 11N', description: 'Universal Transverse Mercator Zone 11 North' },
  { code: 'EPSG:32612', name: 'UTM Zone 12N', description: 'Universal Transverse Mercator Zone 12 North' },
];

// Re-export helpers from types
export type { CrsCapabilities, CrsInfo, TransformPair, WarningRef };
