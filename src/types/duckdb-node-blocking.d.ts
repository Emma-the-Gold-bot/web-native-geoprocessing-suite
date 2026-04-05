declare module '@duckdb/duckdb-wasm/blocking' {
  export * from '@duckdb/duckdb-wasm/dist/duckdb-node-blocking.cjs'
}

declare module '@duckdb/duckdb-wasm/dist/duckdb-node-blocking.cjs' {
  export * from '@duckdb/duckdb-wasm/blocking'
}
