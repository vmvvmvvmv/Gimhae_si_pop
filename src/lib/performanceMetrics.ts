const recordedMilestones = new Set<string>()

export function recordPerformanceMilestone(name: string): number | null {
  if (typeof performance === 'undefined' || recordedMilestones.has(name)) {
    return null
  }

  const durationMs = performance.now()
  recordedMilestones.add(name)
  performance.mark(`gimhae:${name}`)

  if (import.meta.env.DEV) {
    console.info(`[성능] ${name}: ${Math.round(durationMs)}ms`)
  }
  return durationMs
}
