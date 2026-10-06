import { describe, expect, it } from 'vitest'
import { parseRange } from '../src/audio-route.ts'

describe('parseRange', () => {
  it('returns null when no range is present or the header is unparsable', () => {
    expect(parseRange(undefined, 1000)).toBeNull()
    expect(parseRange('', 1000)).toBeNull()
    expect(parseRange('items=0-10', 1000)).toBeNull()
    expect(parseRange('bytes=', 1000)).toBeNull()
    expect(parseRange('bytes=abc', 1000)).toBeNull()
    expect(parseRange('bytes=10-5', 1000)).toBe('unsatisfiable')
  })

  it('parses a closed range', () => {
    expect(parseRange('bytes=0-99', 1000)).toEqual({ start: 0, end: 99 })
    expect(parseRange('bytes=500-999', 1000)).toEqual({ start: 500, end: 999 })
  })

  it('parses an open-ended range to the last byte', () => {
    expect(parseRange('bytes=900-', 1000)).toEqual({ start: 900, end: 999 })
    expect(parseRange('bytes=0-', 1000)).toEqual({ start: 0, end: 999 })
  })

  it('parses a suffix range', () => {
    expect(parseRange('bytes=-100', 1000)).toEqual({ start: 900, end: 999 })
    expect(parseRange('bytes=-1', 1000)).toEqual({ start: 999, end: 999 })
    // A suffix longer than the file is the whole file.
    expect(parseRange('bytes=-5000', 1000)).toEqual({ start: 0, end: 999 })
  })

  it('clamps an end past the last byte', () => {
    expect(parseRange('bytes=900-5000', 1000)).toEqual({ start: 900, end: 999 })
  })

  it('reports unsatisfiable ranges', () => {
    expect(parseRange('bytes=1000-', 1000)).toBe('unsatisfiable')
    expect(parseRange('bytes=2000-3000', 1000)).toBe('unsatisfiable')
    expect(parseRange('bytes=-1', 0)).toBe('unsatisfiable')
  })

  it('answers a multi-range request with the first range', () => {
    expect(parseRange('bytes=0-9,20-29', 1000)).toEqual({ start: 0, end: 9 })
  })
})
