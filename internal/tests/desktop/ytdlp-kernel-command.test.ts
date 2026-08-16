import { runKernelCommand } from '@main/lib/ytdlp-kernel-command'
import { describe, expect, it } from 'vitest'

describe('runKernelCommand', () => {
  it('captures stdout and stderr without invoking a shell', async () => {
    const result = await runKernelCommand(
      process.execPath,
      ['-e', 'process.stdout.write("ready"); process.stderr.write("note")'],
      { timeoutMs: 5000 }
    )

    expect(result).toEqual({ stderr: 'note', stdout: 'ready' })
  })

  it('terminates commands that exceed their timeout', async () => {
    await expect(
      runKernelCommand(process.execPath, ['-e', 'setTimeout(() => undefined, 10_000)'], {
        timeoutMs: 20
      })
    ).rejects.toThrow('timed out')
  })

  it('terminates commands when the owning service aborts', async () => {
    const controller = new AbortController()
    const command = runKernelCommand(
      process.execPath,
      ['-e', 'setTimeout(() => undefined, 10_000)'],
      { signal: controller.signal, timeoutMs: 5000 }
    )
    controller.abort()

    await expect(command).rejects.toThrow('aborted')
  })
})
