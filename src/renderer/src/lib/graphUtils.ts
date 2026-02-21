import type { GraphDimensions, GraphRange } from '../../../shared/types/eq'

export const DEFAULT_RANGE: GraphRange = {
  minFreq: 20,
  maxFreq: 20000,
  minDb: -12,
  maxDb: 12
}

export const DEFAULT_PADDING = {
  paddingLeft: 50,
  paddingRight: 20,
  paddingTop: 20,
  paddingBottom: 35
}

export function freqToX(
  freq: number,
  dims: GraphDimensions,
  range: GraphRange = DEFAULT_RANGE
): number {
  const plotWidth = dims.width - dims.paddingLeft - dims.paddingRight
  const logMin = Math.log10(range.minFreq)
  const logMax = Math.log10(range.maxFreq)
  const logFreq = Math.log10(Math.max(freq, range.minFreq))
  return dims.paddingLeft + ((logFreq - logMin) / (logMax - logMin)) * plotWidth
}

export function xToFreq(
  x: number,
  dims: GraphDimensions,
  range: GraphRange = DEFAULT_RANGE
): number {
  const plotWidth = dims.width - dims.paddingLeft - dims.paddingRight
  const logMin = Math.log10(range.minFreq)
  const logMax = Math.log10(range.maxFreq)
  const logFreq = logMin + ((x - dims.paddingLeft) / plotWidth) * (logMax - logMin)
  return Math.pow(10, logFreq)
}

export function dbToY(
  db: number,
  dims: GraphDimensions,
  range: GraphRange = DEFAULT_RANGE
): number {
  const plotHeight = dims.height - dims.paddingTop - dims.paddingBottom
  return dims.paddingTop + ((range.maxDb - db) / (range.maxDb - range.minDb)) * plotHeight
}

export function yToDb(y: number, dims: GraphDimensions, range: GraphRange = DEFAULT_RANGE): number {
  const plotHeight = dims.height - dims.paddingTop - dims.paddingBottom
  return range.maxDb - ((y - dims.paddingTop) / plotHeight) * (range.maxDb - range.minDb)
}

export function formatFrequency(freq: number): string {
  if (freq >= 1000) {
    const k = freq / 1000
    return k % 1 === 0 ? `${k}k` : `${k.toFixed(1)}k`
  }
  return freq % 1 === 0 ? `${freq}` : `${freq.toFixed(0)}`
}

export const FREQ_GRID_LINES = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000]
export const DB_GRID_LINES = [-12, -9, -6, -3, 0, 3, 6, 9, 12]
