// Local Postgres-compatible server (PGlite over TCP) for integration testing.
// Data lives only in memory; nothing touches any real database.
import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'

const port = Number(process.argv[2] ?? 54329)
const db = await PGlite.create()
const server = new PGLiteSocketServer({ db, port, host: '127.0.0.1', maxConnections: 20 })
await server.start()
console.log(`PGLITE_READY ${server.getServerConn()}`)

const shutdown = async () => {
  await server.stop()
  await db.close()
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
