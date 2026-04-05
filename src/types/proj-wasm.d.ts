/**
 * Type declarations for proj-wasm
 */

declare module 'proj-wasm' {
  // Core initialization
  export function init(): Promise<void>;
  
  // Context management
  export function contextCreate(options?: {
    network?: boolean;
    context?: unknown;
  }): Promise<unknown>;
  
  // CRS transformation creation
  export function projCreateCrsToCrs(options: {
    context?: unknown;
    source_crs: string;
    target_crs: string;
  }): Promise<unknown>;
  
  // Coordinate array management
  export function coordArray(n: number): Promise<unknown>;
  export function setCoords(coords: unknown, values: number[][]): Promise<void>;
  export function getCoords(coords: unknown, idx: number): Promise<number[]>;
  
  // Transformation execution
  export function projTransArray(options: {
    p: unknown;
    direction: number;
    n: number;
    coord: unknown;
  }): Promise<void>;
  
  // Worker info
  export function getWorkerMode(): string;
  export function getWorkerCount(): number;
  
  // Also export camelCase aliases (they're the same functions)
  export const init: typeof init;
  export const contextCreate: typeof contextCreate;
  export const projCreateCrsToCrs: typeof projCreateCrsToCrs;
  export const coordArray: typeof coordArray;
  export const setCoords: typeof setCoords;
  export const getCoords: typeof getCoords;
  export const projTransArray: typeof projTransArray;
  export const getWorkerMode: typeof getWorkerMode;
  export const getWorkerCount: typeof getWorkerCount;
  
  // Snake_case variants
  export function init(): Promise<void>;
  export function context_create(options?: { network?: boolean; context?: unknown }): Promise<unknown>;
  export function proj_create_crs_to_crs(options: {
    context?: unknown;
    source_crs: string;
    target_crs: string;
  }): Promise<unknown>;
  export function coord_array(n: number): Promise<unknown>;
  export function set_coords_BANG_(coords: unknown, values: number[][]): Promise<void>;
  export function get_coords(coords: unknown, idx: number): Promise<number[]>;
  export function proj_trans_array(options: {
    p: unknown;
    direction: number;
    n: number;
    coord: unknown;
  }): Promise<void>;
}
