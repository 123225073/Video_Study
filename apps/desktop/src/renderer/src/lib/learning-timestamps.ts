const clockSeconds = (clock: string): number => {
  const values = clock.split(':').map(Number)
  if (values.some((value) => !Number.isFinite(value))) {
    return 0
  }
  if (values.length === 3) {
    return values[0] * 3600 + values[1] * 60 + values[2]
  }
  return values[0] * 60 + values[1]
}

/** Turn source clocks into seek links without touching fenced code blocks. */
export const linkifyLearningTimestamps = (markdown: string): string => {
  let fenced = false
  return markdown
    .split('\n')
    .map((line) => {
      if (line.trimStart().startsWith('```')) {
        fenced = !fenced
        return line
      }
      if (fenced) {
        return line
      }
      return line.replace(/(?<!\[)\[((?:\d{1,2}:)?\d{2}:\d{2})\](?!\()/gu, (match, clock) => {
        return `[${match}](#t=${clockSeconds(clock)})`
      })
    })
    .join('\n')
}

/** Read a generated timestamp link from an AI result click target. */
export const learningTimestampFromTarget = (target: HTMLElement): number | null => {
  const anchor = target.closest('a')
  const href = anchor?.getAttribute('href') ?? ''
  const seekMatch = href.match(/^#t=(\d+)$/u)
  if (seekMatch) {
    return Number(seekMatch[1])
  }
  const clock = target
    .closest('a, button, g, foreignObject')
    ?.textContent?.match(/\[((?:\d{1,2}:)?\d{2}:\d{2})\]/u)
  return clock ? clockSeconds(clock[1]) : null
}
