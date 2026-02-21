import type { FilterType, EqPoint } from '../../../shared/types/eq'

export const DEFAULT_SAMPLE_RATE = 48000

export interface BiquadCoefficients {
  b0: number
  b1: number
  b2: number
  a0: number
  a1: number
  a2: number
}

export function computeCoefficients(
  filterType: FilterType,
  frequency: number,
  gain: number,
  q: number,
  sampleRate: number = DEFAULT_SAMPLE_RATE
): BiquadCoefficients {
  // Clamp Q for non-peaking filters to avoid resonance/overshoot
  // Q > 0.707 (Butterworth) causes amplitude peaks in pass/shelf filters
  const MAX_Q_NON_PEAKING = Math.SQRT1_2 // 0.707
  const effectiveQ = filterType !== 'peaking' ? Math.min(q, MAX_Q_NON_PEAKING) : q

  const w0 = (2 * Math.PI * frequency) / sampleRate
  const cosw0 = Math.cos(w0)
  const sinw0 = Math.sin(w0)
  const alpha = sinw0 / (2 * effectiveQ)
  const A = Math.pow(10, gain / 40)

  let b0: number, b1: number, b2: number
  let a0: number, a1: number, a2: number

  switch (filterType) {
    case 'peaking':
      b0 = 1 + alpha * A
      b1 = -2 * cosw0
      b2 = 1 - alpha * A
      a0 = 1 + alpha / A
      a1 = -2 * cosw0
      a2 = 1 - alpha / A
      break

    case 'lowshelf': {
      const sqrtA = Math.sqrt(A)
      b0 = A * (A + 1 - (A - 1) * cosw0 + 2 * sqrtA * alpha)
      b1 = 2 * A * (A - 1 - (A + 1) * cosw0)
      b2 = A * (A + 1 - (A - 1) * cosw0 - 2 * sqrtA * alpha)
      a0 = A + 1 + (A - 1) * cosw0 + 2 * sqrtA * alpha
      a1 = -2 * (A - 1 + (A + 1) * cosw0)
      a2 = A + 1 + (A - 1) * cosw0 - 2 * sqrtA * alpha
      break
    }

    case 'highshelf': {
      const sqrtA = Math.sqrt(A)
      b0 = A * (A + 1 + (A - 1) * cosw0 + 2 * sqrtA * alpha)
      b1 = -2 * A * (A - 1 + (A + 1) * cosw0)
      b2 = A * (A + 1 + (A - 1) * cosw0 - 2 * sqrtA * alpha)
      a0 = A + 1 - (A - 1) * cosw0 + 2 * sqrtA * alpha
      a1 = 2 * (A - 1 - (A + 1) * cosw0)
      a2 = A + 1 - (A - 1) * cosw0 - 2 * sqrtA * alpha
      break
    }

    case 'lowpass':
      b0 = (1 - cosw0) / 2
      b1 = 1 - cosw0
      b2 = (1 - cosw0) / 2
      a0 = 1 + alpha
      a1 = -2 * cosw0
      a2 = 1 - alpha
      break

    case 'highpass':
      b0 = (1 + cosw0) / 2
      b1 = -(1 + cosw0)
      b2 = (1 + cosw0) / 2
      a0 = 1 + alpha
      a1 = -2 * cosw0
      a2 = 1 - alpha
      break
  }

  return { b0, b1, b2, a0, a1, a2 }
}

export function evaluateResponse(
  coeffs: BiquadCoefficients,
  frequency: number,
  sampleRate: number = DEFAULT_SAMPLE_RATE
): number {
  const w = (2 * Math.PI * frequency) / sampleRate
  const cosw = Math.cos(w)
  const cos2w = Math.cos(2 * w)
  const sinw = Math.sin(w)
  const sin2w = Math.sin(2 * w)

  const numReal = coeffs.b0 + coeffs.b1 * cosw + coeffs.b2 * cos2w
  const numImag = -(coeffs.b1 * sinw + coeffs.b2 * sin2w)

  const denReal = coeffs.a0 + coeffs.a1 * cosw + coeffs.a2 * cos2w
  const denImag = -(coeffs.a1 * sinw + coeffs.a2 * sin2w)

  const numMagSq = numReal * numReal + numImag * numImag
  const denMagSq = denReal * denReal + denImag * denImag

  if (denMagSq === 0) return 0
  return 10 * Math.log10(numMagSq / denMagSq)
}

export function computeCombinedResponse(
  points: EqPoint[],
  frequency: number,
  sampleRate: number = DEFAULT_SAMPLE_RATE
): number {
  let totalDb = 0
  for (const point of points) {
    if (!point.enabled) continue
    const coeffs = computeCoefficients(
      point.filterType,
      point.frequency,
      point.gain,
      point.q,
      sampleRate
    )
    totalDb += evaluateResponse(coeffs, frequency, sampleRate)
  }
  return totalDb
}
