/**
 * Tiny per-file watcher built on top of `node:fs.watch`.
 *
 * Bun and Node both implement `fs.watch`, which fires `'change'` and
 * `'rename'` events whenever a watched path is touched. The events
 * are debounced (a single editor save can fire several in quick
 * succession), and the watcher is exposed as a small `Disposable`
 * so the websocket server can tear it down on unsubscribe.
 *
 * `node:fs.watch` doesn't support `recursive: true` on Linux, and
 * we'd rather not depend on `chokidar` for what amounts to three
 * `fs.watch` calls — so we watch each file individually.
 */

import * as fs from 'node:fs'

export type WatchHandle = {
  /** Stops watching and releases the underlying fs.watch handle. */
  close(): void
}

export type WatchFactory = {
  /**
   * Begins watching `paths` for change events. Fires `onChange` once
   * after the debounce window with the list of paths that fired.
   */
  watch(paths: ReadonlyArray<string>, onChange: (changed: ReadonlyArray<string>) => void): WatchHandle
}

export type WatcherOptions = {
  /**
   * Debounce window in milliseconds. fs.watch fires multiple events
   * for one save; we coalesce them. Default: 50ms.
   */
  readonly debounceMs?: number
}

/**
 * Default factory: uses `node:fs.watch` with a debounce.
 *
 * ponytail: O(1) per file. Adequate for the 3-file `file1→file2→file3`
 * pattern; swap for `chokidar` if recursive watches or atomic rename
 * semantics become necessary.
 */
export function createFsWatchFactory(options: WatcherOptions = {}): WatchFactory {
  const debounceMs = options.debounceMs ?? 50

  return {
    watch(paths, onChange) {
      const watchers: fs.FSWatcher[] = []
      const pending = new Set<string>()
      let timer: ReturnType<typeof setTimeout> | null = null

      const flush = (): void => {
        timer = null
        if (pending.size === 0) return
        const changed = [...pending]
        pending.clear()
        onChange(changed)
      }

      const schedule = (changedPath: string): void => {
        pending.add(changedPath)
        if (timer !== null) clearTimeout(timer)
        timer = setTimeout(flush, debounceMs)
      }

      for (const p of paths) {
        try {
          const w = fs.watch(p, { persistent: false }, (_event, filename) => {
            // `filename` is relative to the watched path and may be null
            // on some platforms; the watcher was set on a concrete file
            // so we report the path we registered.
            void filename
            schedule(p)
          })
          w.on('error', () => {
            // The watcher errors out if the file is deleted or becomes
            // unwatchable. We silently drop the error — the next
            // rebuild attempt will re-establish watches if needed.
          })
          watchers.push(w)
        } catch {
          // Same rationale: missing files just don't get watched.
        }
      }

      return {
        close(): void {
          if (timer !== null) clearTimeout(timer)
          for (const w of watchers) {
            try {
              w.close()
            } catch {
              // Already closed; nothing to do.
            }
          }
          watchers.length = 0
        },
      }
    },
  }
}