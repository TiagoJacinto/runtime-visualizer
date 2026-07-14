import { createApp } from './app.ts'
import { attachMermaidWebSocket } from './routes/mermaid-ws.ts'

const PORT = Number.parseInt(process.env.PORT ?? '3000', 10)
const HOST = process.env.HOST ?? '0.0.0.0'
const CFG_PROJECT_ROOT = process.env.CFG_PROJECT_ROOT

if (!Number.isFinite(PORT) || PORT <= 0 || PORT > 65535) {
  throw new Error(`Invalid PORT: ${process.env.PORT ?? ''}`)
}

const app = createApp(
  CFG_PROJECT_ROOT !== undefined ? { cfgProjectRoot: CFG_PROJECT_ROOT } : {},
)

const server = app.listen(PORT, HOST, () => {
  console.log(`[server] listening on http://${HOST}:${PORT}`)
})

const wsHandle = attachMermaidWebSocket(
  server,
  CFG_PROJECT_ROOT !== undefined ? { projectRoot: CFG_PROJECT_ROOT } : {},
)
console.log('[server] mermaid websocket on ws://' + HOST + ':' + PORT + '/api/mermaid')

const shutdown = (signal: NodeJS.Signals) => {
  console.log(`[server] received ${signal}, shutting down`)
  wsHandle.close()
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
