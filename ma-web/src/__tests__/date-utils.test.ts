import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { formatJapaneseDate, formatRelativeDate, formatDuration, groupByDate } from '../date-utils'

describe('formatJapaneseDate', () => {
  it('formats UTC ISO string to Japanese date with JST offset', () => {
    // 2026-03-09T05:30:00Z = 2026-03-09T14:30:00+09:00 (JST)
    const result = formatJapaneseDate('2026-03-09T05:30:00Z')
    expect(result).toBe('3月9日（月）14:30')
  })

  it('formats date with single-digit day', () => {
    // 2026-03-01T00:00:00Z = 2026-03-01T09:00:00+09:00
    const result = formatJapaneseDate('2026-03-01T00:00:00Z')
    expect(result).toBe('3月1日（日）09:00')
  })

  it('formats minutes with leading zero', () => {
    // 2026-01-15T10:05:00Z = 2026-01-15T19:05:00+09:00
    const result = formatJapaneseDate('2026-01-15T10:05:00Z')
    expect(result).toBe('1月15日（木）19:05')
  })

  it('handles RFC3339 with timezone offset', () => {
    // Already in JST
    const result = formatJapaneseDate('2026-03-09T14:30:00+09:00')
    expect(result).toBe('3月9日（月）14:30')
  })

  it('includes correct day of week', () => {
    // 2026-03-07 = 土曜日 (Saturday) in JST
    const result = formatJapaneseDate('2026-03-07T00:00:00Z') // 09:00 JST
    expect(result).toContain('（土）')
  })
})

describe('formatRelativeDate', () => {
  beforeEach(() => {
    // Fix "now" to 2026-03-09T10:00:00Z (= 2026-03-09T19:00:00 JST)
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-09T10:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns 今日 for today', () => {
    const result = formatRelativeDate('2026-03-09T05:00:00Z') // same JST day
    expect(result).toBe('今日')
  })

  it('returns 昨日 for yesterday', () => {
    const result = formatRelativeDate('2026-03-08T05:00:00Z')
    expect(result).toBe('昨日')
  })

  it('returns N日前 for 2-6 days ago', () => {
    const result = formatRelativeDate('2026-03-06T05:00:00Z') // 3 days ago
    expect(result).toBe('3日前')
  })

  it('falls back to Japanese date for 7+ days ago', () => {
    const result = formatRelativeDate('2026-03-01T00:00:00Z') // 8+ days ago
    expect(result).toBe('3月1日（日）09:00')
  })

  it('handles same minute as now', () => {
    const result = formatRelativeDate('2026-03-09T10:00:00Z')
    expect(result).toBe('今日')
  })
})

describe('formatDuration', () => {
  it('formats seconds only when under 1 minute', () => {
    expect(formatDuration(45)).toBe('45秒')
  })

  it('formats exact minutes', () => {
    expect(formatDuration(120)).toBe('2分')
  })

  it('formats minutes and seconds', () => {
    expect(formatDuration(150)).toBe('2分30秒')
  })

  it('formats 0 seconds', () => {
    expect(formatDuration(0)).toBe('0秒')
  })

  it('formats 1 minute exactly', () => {
    expect(formatDuration(60)).toBe('1分')
  })

  it('formats 10 minutes 5 seconds', () => {
    expect(formatDuration(605)).toBe('10分5秒')
  })
})

describe('groupByDate', () => {
  it('groups items by JST calendar date', () => {
    const items = [
      { id: '1', timestamp: '2026-03-09T05:00:00Z' }, // 14:00 JST → 2026-03-09
      { id: '2', timestamp: '2026-03-09T08:00:00Z' }, // 17:00 JST → 2026-03-09
      { id: '3', timestamp: '2026-03-08T05:00:00Z' }, // 14:00 JST → 2026-03-08
    ]
    const result = groupByDate(items, (item) => item.timestamp)
    expect(result.size).toBe(2)
    expect(result.get('2026-03-09')?.length).toBe(2)
    expect(result.get('2026-03-08')?.length).toBe(1)
  })

  it('handles midnight boundary (JST = UTC+9)', () => {
    const items = [
      { id: '1', timestamp: '2026-03-08T14:59:00Z' }, // 23:59 JST → 2026-03-08
      { id: '2', timestamp: '2026-03-08T15:00:00Z' }, // 00:00 JST next day → 2026-03-09
    ]
    const result = groupByDate(items, (item) => item.timestamp)
    expect(result.get('2026-03-08')?.length).toBe(1)
    expect(result.get('2026-03-09')?.length).toBe(1)
  })

  it('returns empty map for empty input', () => {
    const result = groupByDate([], (item: { timestamp: string }) => item.timestamp)
    expect(result.size).toBe(0)
  })

  it('preserves insertion order (newest first)', () => {
    const items = [
      { id: '1', timestamp: '2026-03-09T05:00:00Z' },
      { id: '2', timestamp: '2026-03-07T05:00:00Z' },
      { id: '3', timestamp: '2026-03-08T05:00:00Z' },
    ]
    const result = groupByDate(items, (item) => item.timestamp)
    const keys = Array.from(result.keys())
    expect(keys[0]).toBe('2026-03-09')
    expect(keys[1]).toBe('2026-03-07')
    expect(keys[2]).toBe('2026-03-08')
  })
})
