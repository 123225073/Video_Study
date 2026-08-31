export type ActiveAiRunKind = 'image' | 'prompt'

export interface ActiveAiRunRegistration {
  finish: () => void
}

interface ActiveAiRun {
  cancel: () => void
  kind: ActiveAiRunKind
}

const activeRuns = new Map<symbol, ActiveAiRun>()

/** Register one interruptible AI transport with the process-wide quit guard. */
export const registerActiveAiRun = (
  kind: ActiveAiRunKind,
  cancel: () => void
): ActiveAiRunRegistration => {
  const token = Symbol(kind)
  activeRuns.set(token, { cancel, kind })
  return {
    finish: () => {
      activeRuns.delete(token)
    }
  }
}

/** Count all AI transports whose result is not terminal yet. */
export const countActiveAiRuns = (): number => activeRuns.size

/** Count active transports by kind for diagnostics and contract tests. */
export const countActiveAiRunsByKind = (kind: ActiveAiRunKind): number => {
  let count = 0
  for (const run of activeRuns.values()) {
    if (run.kind === kind) {
      count += 1
    }
  }
  return count
}

/**
 * Cancel every AI transport after the user has explicitly allowed quit.
 * Entries are detached first so a cancel callback cannot be counted twice.
 */
export const stopAllActiveAiRuns = (): number => {
  const pending = [...activeRuns.entries()]
  for (const [token, run] of pending) {
    activeRuns.delete(token)
    try {
      run.cancel()
    } catch {
      // One broken transport must not prevent the remaining runs from stopping.
    }
  }
  return pending.length
}
