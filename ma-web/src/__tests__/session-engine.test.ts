import { describe, expect, it } from 'vitest'

import {
  buildSessionPlan,
  buildShorterCloseCue,
  extendSessionPlan,
  isInteractiveLegacyMode,
  isTimedSessionMode,
} from '../session-engine'

describe('session engine', () => {
  it('uses requested recommendation duration when available', () => {
    const plan = buildSessionPlan('breathing_space', 4)
    expect(plan.totalDurationSeconds).toBe(240)
    expect(plan.protocolId).toBe('breathing_space')
    expect(plan.cueSchedule.map(cue => cue.type)).toContain('widen')
  })

  it('falls back to the default timed plan for manual starts', () => {
    const plan = buildSessionPlan('yasashii')
    expect(plan.totalDurationSeconds).toBe(120)
    expect(plan.protocolId).toBe('breath_foundation')
  })

  it('extends using the next protocol-aware duration step', () => {
    const original = buildSessionPlan('body_scan', 3)
    const extended = extendSessionPlan(original, 185)
    expect(extended.totalDurationSeconds).toBe(600)
    expect(extended.cueSchedule.length).toBeGreaterThan(original.cueSchedule.length)
  })

  it('builds a shorter close safety cue without changing protocol identity', () => {
    const plan = buildSessionPlan('stress_reset', 3)
    const cue = buildShorterCloseCue(plan)
    expect(cue.type).toBe('safety')
    expect(cue.ttsText).toContain('短く切り上げて')
    expect(plan.protocolId).toBe('stress_reset')
  })

  it('keeps legacy input modes out of the timed engine', () => {
    expect(isInteractiveLegacyMode('emotion_mapping')).toBe(true)
    expect(isInteractiveLegacyMode('gratitude')).toBe(true)
    expect(isTimedSessionMode('yasashii')).toBe(true)
    expect(isTimedSessionMode('stress_reset')).toBe(true)
  })
})
