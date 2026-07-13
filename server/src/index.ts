import { createApp } from './app.ts'

const PORT = Number.parseInt(process.env.PORT ?? '3000', 10)
const HOST = process.env.HOST ?? '0.0.0.0'

if (!Number.isFinite(PORT) || PORT <= 0 || PORT > 65535) {
  throw new Error(`Invalid PORT: ${process.env.PORT ?? ''}`)
}

const app = createApp()

const server = app.listen(PORT, HOST, () => {
  console.log(`[server] listening on http://${HOST}:${PORT}`)
})

const shutdown = (signal: NodeJS.Signals) => {
  console.log(`[server] received ${signal}, shutting down`)
  server.close((err) => {
    if (err) {
      console.error('[server] error during shutdown:', err)
      process.exit(1)
    }
    process.exit(0)
  })
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
