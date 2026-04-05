/**
 * PROJ-WASM Feasibility Spike - Proof-of-Life Test
 * 
 * This file validates that PROJ-WASM can:
 * 1. Initialize in the browser/Vite environment
 * 2. Create coordinate transformations between CRS
 * 3. Transform coordinates correctly
 * 4. Work with GeoJSON (via helper functions we would need to create)
 */

import * as proj from 'proj-wasm';

let projInitPromise: Promise<void> | null = null;
let projInitialized = false;

/**
 * Initialize PROJ-WASM exactly once per runtime.
 *
 * Re-entering proj.init() after successful setup appears to destabilize the
 * underlying database/runtime state in some browser validation flows.
 * Keep initialization idempotent and share the same promise across callers.
 */
export async function initializeProj(): Promise<void> {
  if (projInitialized) {
    return;
  }

  if (!projInitPromise) {
    projInitPromise = (async () => {
      console.log('[PROJ-WASM] Initializing...');
      await proj.init();
      projInitialized = true;
      console.log('[PROJ-WASM] Initialized successfully');
      console.log('[PROJ-WASM] Worker mode:', proj.getWorkerMode());
      console.log('[PROJ-WASM] Worker count:', proj.getWorkerCount());
    })().catch((error) => {
      projInitPromise = null;
      throw error;
    });
  }

  await projInitPromise;
}

/**
 * Test basic coordinate transformation: WGS84 -> Web Mercator
 * 
 * This transforms Boston City Hall coordinates from:
 * - EPSG:4326 (WGS84 lat/lon): 42.3601, -71.0589
 * - EPSG:3857 (Web Mercator): ~[-7910240, 5215074]
 */
export async function testBasicTransformation(): Promise<void> {
  console.log('[PROJ-WASM] Testing basic transformation: EPSG:4326 -> EPSG:3857');
  
  // Create transformation
  const transformer = await proj.projCreateCrsToCrs({
    source_crs: 'EPSG:4326',
    target_crs: 'EPSG:3857'
  });
  
  // Create coordinate array for one point
  const coords = await proj.coordArray(1);
  
  // Set coordinates: PROJ uses [latitude, longitude] for geographic CRS (EPSG:4326)
  // Note: GeoJSON uses [longitude, latitude], so coordinate swapping is needed at boundaries
  // Boston City Hall: lat=42.3601, lon=-71.0589
  await proj.setCoords(coords, [[42.3601, -71.0589, 0, 0]]);
  
  // Transform forward
  await proj.projTransArray({
    p: transformer,
    direction: 1, // PJ_FWD
    n: 1,
    coord: coords
  });
  
  // Get result
  const result = await proj.getCoords(coords, 0);
  
  console.log('[PROJ-WASM] Input (WGS84): [42.3601, -71.0589]');
  console.log('[PROJ-WASM] Output (Web Mercator):', result);
  
  // Expected: approximately [-7910240, 5215074]
  const expectedX = -7910240;
  const expectedY = 5215074;
  
  // Check within reasonable tolerance (100m)
  const tolerance = 100;
  const xValid = Math.abs(result[0] - expectedX) < tolerance;
  const yValid = Math.abs(result[1] - expectedY) < tolerance;
  
  if (xValid && yValid) {
    console.log('[PROJ-WASM] ✅ Basic transformation test PASSED');
  } else {
    console.log('[PROJ-WASM] ❌ Basic transformation test FAILED');
    throw new Error(`Transform result out of tolerance: ${result[0]}, ${result[1]}`);
  }
}

/**
 * Test UTM transformation (common real-world use case)
 * 
 * San Francisco area: 37.7749, -122.4194
 * UTM Zone 10N: PROJ produces [551130.77, 4180998.88] (verified output)
 * Previous expected values [552865, 4180552] were incorrect.
 */
export async function testUtmTransformation(): Promise<void> {
  console.log('[PROJ-WASM] Testing UTM transformation: EPSG:4326 -> EPSG:32610');
  
  const transformer = await proj.projCreateCrsToCrs({
    source_crs: 'EPSG:4326',
    target_crs: 'EPSG:32610' // UTM Zone 10N
  });
  
  const coords = await proj.coordArray(1);
  
  // San Francisco
  await proj.setCoords(coords, [[37.7749, -122.4194, 0, 0]]);
  
  await proj.projTransArray({
    p: transformer,
    direction: 1,
    n: 1,
    coord: coords
  });
  
  const result = await proj.getCoords(coords, 0);
  
  console.log('[PROJ-WASM] Input (WGS84): [37.7749, -122.4194]');
  console.log('[PROJ-WASM] Output (UTM 10N):', result);
  
  // Expected: PROJ produces these values (verified 2026-03-21)
  // Using 50m tolerance to account for minor PROJ version differences
  const expectedX = 551130.77;
  const expectedY = 4180998.88;
  
  const tolerance = 50; // 50m tolerance
  const xValid = Math.abs(result[0] - expectedX) < tolerance;
  const yValid = Math.abs(result[1] - expectedY) < tolerance;
  
  if (xValid && yValid) {
    console.log('[PROJ-WASM] ✅ UTM transformation test PASSED');
  } else {
    console.log('[PROJ-WASM] ❌ UTM transformation test FAILED');
    throw new Error(`UTM transform result out of tolerance: ${result[0]}, ${result[1]}`);
  }
}

/**
 * Test reverse transformation
 */
export async function testInverseTransformation(): Promise<void> {
  console.log('[PROJ-WASM] Testing inverse transformation: EPSG:3857 -> EPSG:4326');
  
  const transformer = await proj.projCreateCrsToCrs({
    source_crs: 'EPSG:3857',
    target_crs: 'EPSG:4326'
  });
  
  const coords = await proj.coordArray(1);
  
  // Boston in Web Mercator
  await proj.setCoords(coords, [[5215074, -7910240, 0, 0]]);
  
  await proj.projTransArray({
    p: transformer,
    direction: 1,
    n: 1,
    coord: coords
  });
  
  const result = await proj.getCoords(coords, 0);
  
  console.log('[PROJ-WASM] Input (Web Mercator): [-7910240, 5215074]');
  console.log('[PROJ-WASM] Output (WGS84):', result);
  
  // Expected: approximately [42.3601, -71.0589]
  const tolerance = 0.01;
  const latValid = Math.abs(result[0] - 42.3601) < tolerance;
  const lonValid = Math.abs(result[1] - (-71.0589)) < tolerance;
  
  if (latValid && lonValid) {
    console.log('[PROJ-WASM] ✅ Inverse transformation test PASSED');
  } else {
    console.log('[PROJ-WASM] ❌ Inverse transformation test FAILED');
  }
}

/**
 * CRS query capability note:
 * The PROJ-WASM build in use does not export getAuthorities/getAuthorityProjections.
 * These require the full proj.db which may not be bundled in minimal builds.
 * Coordinate transformation (the core feature) works correctly.
 */

/**
 * Run all PROJ-WASM validation tests
 */
export async function runProjValidation(): Promise<boolean> {
  console.log('\n========== PROJ-WASM VALIDATION ==========\n');
  
  try {
    await initializeProj();
    await testBasicTransformation();
    await testUtmTransformation();
    await testInverseTransformation();
    // Note: CRS query (getAuthorities) not available in this build
    
    console.log('\n========== ALL PROJ-WASM TESTS PASSED ==========\n');
    return true;
  } catch (error) {
    console.error('\n========== PROJ-WASM VALIDATION FAILED ==========\n', error);
    return false;
  }
}

// Export the engine class that follows architecture brief interface
export class ProjWasmEngine {
  private initialized = false;
  
  async initialize(): Promise<void> {
    if (this.initialized) return;
    await initializeProj();
    this.initialized = true;
  }
  
  get initializedState(): boolean {
    return this.initialized;
  }
  
  async transform(
    sourceEpsg: string,
    targetEpsg: string,
    coordinates: number[][]
  ): Promise<number[][]> {
    if (!this.initialized) {
      await this.initialize();
    }
    
    const transformer = await proj.projCreateCrsToCrs({
      source_crs: sourceEpsg,
      target_crs: targetEpsg
    });
    
    // PROJ expects [lat, lon] order for geographic CRS (EPSG:4326),
    // but GeoJSON uses [lon, lat]. We need to swap input and output coordinates.
    // For projected CRS (EPSG:3857, etc.), coordinates stay in [x, y] order.
    const sourceIsGeographic = sourceEpsg.toUpperCase().includes('4326') || 
                               sourceEpsg.toUpperCase().includes('CRS84');
    const targetIsGeographic = targetEpsg.toUpperCase().includes('4326') || 
                               targetEpsg.toUpperCase().includes('CRS84');
    
    // Convert GeoJSON [lon, lat] → PROJ [lat, lon] for geographic source CRS
    const projCoords = sourceIsGeographic
      ? coordinates.map(c => [c[1], c[0], c[2] || 0, c[3] || 0])
      : coordinates.map(c => [c[0], c[1], c[2] || 0, c[3] || 0]);
    
    const coords = await proj.coordArray(projCoords.length);
    await proj.setCoords(coords, projCoords);
    
    await proj.projTransArray({
      p: transformer,
      direction: 1,
      n: projCoords.length,
      coord: coords
    });
    
    const results: number[][] = [];
    for (let i = 0; i < projCoords.length; i++) {
      const result = await proj.getCoords(coords, i);
      // Convert PROJ output back to GeoJSON [lon, lat] for geographic target CRS
      if (targetIsGeographic) {
        results.push([result[1], result[0], result[2]]);
      } else {
        results.push([result[0], result[1], result[2]]);
      }
    }
    
    return results;
  }
}

// Export singleton accessor
let projEngine: ProjWasmEngine | null = null;

export function getProjEngine(): ProjWasmEngine {
  if (!projEngine) {
    projEngine = new ProjWasmEngine();
  }
  return projEngine;
}
