import assert from 'node:assert/strict'

import { Scheduler } from '@vidbee/task-queue/scheduler'
import {
  EMPTY_PROGRESS,
  PRIORITY_USER,
  type Task,
  TRANSCRIPTION_GROUP_KEY
} from '@vidbee/task-queue/types'

const createTask = (id: string): Task => ({
  id,
  kind: 'transcription',
  parentId: 'download-test',
  input: {
    url: `vidbee://download/${id}`,
    kind: 'transcription'
  },
  priority: PRIORITY_USER,
  groupKey: TRANSCRIPTION_GROUP_KEY,
  status: 'queued',
  prevStatus: null,
  statusReason: null,
  enteredStatusAt: 0,
  attempt: 0,
  maxAttempts: 3,
  nextRetryAt: null,
  progress: { ...EMPTY_PROGRESS },
  output: null,
  lastError: null,
  pid: null,
  pidStartedAt: null,
  createdAt: 0,
  updatedAt: 0
})

const main = async (): Promise<void> => {
  const tasks = new Map<string, Task>()
  const dispatched: string[] = []
  const scheduler = new Scheduler({
    maxConcurrency: 2,
    dispatch: (taskId) => {
      dispatched.push(taskId)
      return true
    },
    demote: () => undefined,
    getTask: (taskId) => tasks.get(taskId)
  })

  await scheduler.setMaxPerGroup(TRANSCRIPTION_GROUP_KEY, 1)

  const first = createTask('transcription-deleted-while-running')
  tasks.set(first.id, first)
  await scheduler.enqueue(first.id, first.priority)
  assert.deepEqual(dispatched, [first.id])

  tasks.delete(first.id)
  await scheduler.releaseSlot(first.id)

  const second = createTask('transcription-after-delete')
  tasks.set(second.id, second)
  await scheduler.enqueue(second.id, second.priority)

  assert.deepEqual(
    dispatched,
    [first.id, second.id],
    'deleting a running transcription must release its per-group slot'
  )

  console.log('transcription queue slot release: ok')
}

void main()
