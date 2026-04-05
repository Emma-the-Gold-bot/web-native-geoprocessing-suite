import * as duckdb from '@duckdb/duckdb-wasm'

export type DuckDbQueryResultLike = {
  toArray: () => Array<{ toJSON: () => Record<string, unknown> }>
  schema: {
    fields: Array<{ name: string }>
  }
}

export type DuckDbConnectionLike = {
  query: (sql: string) => Promise<DuckDbQueryResultLike>
  getTableNames: (sql: string) => Promise<string[]>
  insertJSONFromPath: (path: string, options: { name: string }) => unknown
  close: () => Promise<void> | void
}

export type DuckDbLike = {
  connect: () => Promise<DuckDbConnectionLike>
  registerFileText: (name: string, text: string) => Promise<void> | void
  registerFileBuffer: (name: string, buffer: Uint8Array) => Promise<void> | void
}

let dbPromise: Promise<DuckDbLike> | null = null

async function createBrowserDuckDb(): Promise<DuckDbLike> {
  const bundles = duckdb.getJsDelivrBundles()
  const bundle = await duckdb.selectBundle(bundles)
  const workerUrl = URL.createObjectURL(
    new Blob([`importScripts("${bundle.mainWorker}");`], { type: 'text/javascript' }),
  )
  const worker = new Worker(workerUrl)
  const logger = new duckdb.ConsoleLogger()
  const db = new duckdb.AsyncDuckDB(logger, worker)
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker)
  URL.revokeObjectURL(workerUrl)
  return db as DuckDbLike
}

async function createNodeDuckDb(): Promise<DuckDbLike> {
  const [{ createRequire }] = await Promise.all([
    import('node:module'),
  ])

  const require = createRequire(import.meta.url)
  const nodeDuckDb = require('@duckdb/duckdb-wasm/dist/duckdb-node-blocking.cjs') as {
    createDuckDB: (
      bundles: {
        mvp: { mainModule: string; mainWorker: null }
        eh: { mainModule: string; mainWorker: null }
      },
      logger: unknown,
      runtime: unknown,
    ) => Promise<{
      instantiate: () => Promise<void>
      open: (config: Record<string, never>) => void
    } & DuckDbLike>
    NODE_RUNTIME: unknown
  }
  const logger = new duckdb.ConsoleLogger()
  const bundles = {
    mvp: {
      mainModule: require.resolve('@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm'),
      mainWorker: null,
    },
    eh: {
      mainModule: require.resolve('@duckdb/duckdb-wasm/dist/duckdb-eh.wasm'),
      mainWorker: null,
    },
  }

  const db = await nodeDuckDb.createDuckDB(bundles, logger, nodeDuckDb.NODE_RUNTIME)
  await db.instantiate()
  db.open({})
  return db as DuckDbLike
}

export const getDuckDb = async (): Promise<DuckDbLike> => {
  if (dbPromise) return dbPromise

  dbPromise = (async () => {
    if (typeof Worker === 'undefined') {
      return createNodeDuckDb()
    }

    return createBrowserDuckDb()
  })()

  return dbPromise
}
