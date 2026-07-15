/**
 * Integration tests for the Mermaid WebSocket endpoint.
 *
 * The tests attach the endpoint to an ephemeral HTTP server and talk
 * to it over a real WebSocket client. The file-system watcher is
 * replaced with an in-memory stub so the rebuild-on-change behaviour
 * can be driven deterministically.
 */
import { describe, expect, it } from 'bun:test'
import * as path from 'node:path'
import { createServer } from 'node:http'
import { WebSocket } from 'ws'
import { attachMermaidWebSocket, type MermaidWsHandle } from '../src/routes/mermaid-ws.ts'
import type { WatchFactory, WatchHandle } from '../src/cfg/watcher.ts'

const FIXTURES = path.resolve(import.meta.dir, '..', '..', 'target', 'fixtures')

type CapturedWatcher = {
  factory: WatchFactory
  paths: ReadonlyArray<string>
  callback: ((changed: ReadonlyArray<string>) => void) | null
  closed: boolean
  /**
   * How many WatchHandle instances have been opened and not yet
   * closed. A rebuild closes the previous handle and opens a new
   * one, so the count strictly increases across rebuilds.
   */
  liveHandles: number
  closeCalls: number
}

function createCapturingWatchFactory(): CapturedWatcher {
  const captured: CapturedWatcher = {
    factory: {} as WatchFactory,
    paths: [],
    callback: null,
    closed: false,
    liveHandles: 0,
    closeCalls: 0,
  }
  captured.factory = {
    watch: (paths: ReadonlyArray<string>, onChange: (changed: ReadonlyArray<string>) => void) => {
      captured.paths = paths
      captured.callback = onChange
      captured.liveHandles += 1
      // A fresh handle implies a live watcher; reset the closed flag.
      captured.closed = false
      const handle: WatchHandle = {
        close: () => {
          captured.liveHandles -= 1
          captured.closeCalls += 1
          if (captured.liveHandles === 0) captured.closed = true
        },
      }
      return handle
    },
  }
  return captured
}

type TestRig = {
  readonly url: string
  readonly wsHandle: MermaidWsHandle
  readonly watcher: CapturedWatcher
  close(): void
}

async function startRig(): Promise<TestRig> {
  const watcher = createCapturingWatchFactory()
  const server = createServer()
  const wsHandle = attachMermaidWebSocket(server, {
    projectRoot: FIXTURES,
    watchFactory: watcher.factory,
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (address === null || typeof address === 'string') {
    throw new Error('expected a port from server.listen(0)')
  }
  return {
    url: `ws://127.0.0.1:${address.port}/api/mermaid`,
    wsHandle,
    watcher,
    close() {
      // The HTTP server's `close` callback waits for active sockets to
      // drain, which can hang if a WebSocket client lingers. Calling
      // `closeAllConnections` + `close` (without await) makes the
      // teardown observable inside the test without leaking the
      // process between tests.
      const s = server as unknown as {
        closeAllConnections?: () => void
        close: (cb?: (err?: Error) => void) => unknown
      }
      wsHandle.close()
      s.closeAllConnections?.()
      s.close()
    },
  }
}

function nextMessage(ws: WebSocket, timeoutMs = 2_000): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off('message', onMessage)
      reject(new Error('timed out waiting for ws message'))
    }, timeoutMs)
    const onMessage = (raw: WebSocket.RawData): void => {
      clearTimeout(timer)
      ws.off('message', onMessage)
      try {
        resolve(JSON.parse(raw.toString()) as Record<string, unknown>)
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)))
      }
    }
    ws.on('message', onMessage)
  })
}

describe('Mermaid WebSocket /api/mermaid', () => {
  it('sends a snapshot after subscribe, watching the entry subgraph', async () => {
    const rig = await startRig()
    try {
      const ws = new WebSocket(rig.url)
      const snapshotP = nextMessage(ws)
      await new Promise<void>((resolve) => ws.once('open', resolve))
      ws.send(JSON.stringify({ type: 'subscribe', entry: 'entry.ts' }))

      const snapshot = await snapshotP
      expect(snapshot.type).toBe('snapshot')
      expect(snapshot.entry).toBe('entry.ts')
      expect(typeof snapshot.mermaid).toBe('string')
      expect((snapshot.mermaid as string).startsWith('flowchart TD')).toBe(true)
      expect(snapshot.files).toEqual(['entry.ts', 'mid.ts', 'leaf.ts'])

      // Every CFG node from the visited subgraph has a corresponding
      // `nodes` entry so the visualizer can highlight a currently-
      // running statement in the rendered SVG.
      const nodes = snapshot.nodes as Array<Record<string, unknown>>
      expect(Array.isArray(nodes)).toBe(true)
      expect(nodes.length).toBeGreaterThan(0)
      for (const n of nodes) {
        expect(typeof n.nodeId).toBe('string')
        expect(typeof n.mermaidId).toBe('string')
        expect(typeof n.fn).toBe('string')
        expect(typeof n.file).toBe('string')
        expect(typeof n.label).toBe('string')
        expect(typeof n.kind).toBe('string')
        expect(typeof n.fileIdx).toBe('number')
      }

      // The watcher must be armed on every file in the imported subgraph.
      expect(rig.watcher.paths.length).toBe(3)
      expect(rig.watcher.paths.map((p) => path.basename(p)).sort()).toEqual([
        'entry.ts',
        'leaf.ts',
        'mid.ts',
      ])
      ws.close()
    } finally {
      rig.close()
    }
  })

  it('rebuilds and re-broadcasts when the watcher fires', async () => {
    const rig = await startRig()
    try {
      const ws = new WebSocket(rig.url)
      const firstP = nextMessage(ws)
      await new Promise<void>((resolve) => ws.once('open', resolve))
      ws.send(JSON.stringify({ type: 'subscribe', entry: 'entry.ts' }))
      const first = await firstP
      expect(first.type).toBe('snapshot')
      const firstMermaid = first.mermaid as string

      // Drive a "file changed" event and expect a fresh snapshot.
      const secondP = nextMessage(ws)
      rig.watcher.callback?.([rig.watcher.paths[0]!])
      const second = await secondP
      expect(second.type).toBe('snapshot')
      expect(second.entry).toBe('entry.ts')
      // Same source → identical output. The test only checks the
      // protocol wiring; see cfg.mermaid.test.ts for content checks.
      expect(typeof second.mermaid).toBe('string')
      expect((second.mermaid as string).length).toBe(firstMermaid.length)
      ws.close()
    } finally {
      rig.close()
    }
  })

  it('sends an error frame for an unknown entry', async () => {
    const rig = await startRig()
    try {
      const ws = new WebSocket(rig.url)
      const errP = nextMessage(ws)
      await new Promise<void>((resolve) => ws.once('open', resolve))
      ws.send(JSON.stringify({ type: 'subscribe', entry: 'no-such.ts' }))

      const err = await errP
      expect(err.type).toBe('error')
      expect(typeof err.message).toBe('string')
      expect((err.message as string).length).toBeGreaterThan(0)
      ws.close()
    } finally {
      rig.close()
    }
  })

  it('sends an error frame for invalid JSON', async () => {
    const rig = await startRig()
    try {
      const ws = new WebSocket(rig.url)
      const errP = nextMessage(ws)
      await new Promise<void>((resolve) => ws.once('open', resolve))
      ws.send('{not-json')

      const err = await errP
      expect(err.type).toBe('error')
      expect(typeof err.message).toBe('string')
      ws.close()
    } finally {
      rig.close()
    }
  })

  it('responds to ping with pong', async () => {
    const rig = await startRig()
    try {
      const ws = new WebSocket(rig.url)
      const pongP = nextMessage(ws)
      await new Promise<void>((resolve) => ws.once('open', resolve))
      ws.send(JSON.stringify({ type: 'ping' }))

      const pong = await pongP
      expect(pong.type).toBe('pong')
      ws.close()
    } finally {
      rig.close()
    }
  })

  it('rebuilds with the same injected watchFactory, not a fresh default', async () => {
    // Regression: rebuildAndBroadcast used to call
    // createFsWatchFactory() directly, silently discarding the
    // injected factory. After a rebuild the captured watcher would
    // never fire again — the live-handle counter would not tick up
    // when a second change event fired.
    const rig = await startRig()
    try {
      const ws = new WebSocket(rig.url)
      const firstP = nextMessage(ws)
      await new Promise<void>((resolve) => ws.once('open', resolve))
      ws.send(JSON.stringify({ type: 'subscribe', entry: 'entry.ts' }))
      await firstP
      const liveAfterArm = rig.watcher.liveHandles
      expect(liveAfterArm).toBe(1)

      // Each rebuild closes the previous handle and opens a new one
      // through the same captured factory.
      const secondP = nextMessage(ws)
      rig.watcher.callback?.([rig.watcher.paths[0]!])
      await secondP
      expect(rig.watcher.liveHandles).toBe(1)
      expect(rig.watcher.closeCalls).toBe(1)

      const thirdP = nextMessage(ws)
      rig.watcher.callback?.([rig.watcher.paths[0]!])
      await thirdP
      expect(rig.watcher.liveHandles).toBe(1)
      expect(rig.watcher.closeCalls).toBe(2)
      expect(rig.watcher.closed).toBe(false)
      ws.close()
    } finally {
      rig.close()
    }
  })

  it('tears down the watcher when the last subscriber disconnects', async () => {
    const rig = await startRig()
    try {
      const ws = new WebSocket(rig.url)
      await new Promise<void>((resolve) => ws.once('open', resolve))
      ws.send(JSON.stringify({ type: 'subscribe', entry: 'entry.ts' }))
      // Wait for the snapshot so the arm-watcher promise resolves.
      await nextMessage(ws)
      expect(rig.watcher.closed).toBe(false)

      const closeP = new Promise<void>((resolve) => ws.once('close', resolve))
      ws.close()
      await closeP
      // Give the close handler a tick to run.
      await new Promise((resolve) => setTimeout(resolve, 20))
      expect(rig.watcher.closed).toBe(true)
    } finally {
      rig.close()
    }
  })
})
