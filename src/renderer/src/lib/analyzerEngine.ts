let spectrumData: Float32Array<ArrayBuffer> | null = null
let running = false
let unsubSpectrum: (() => void) | null = null

export const ANALYZER_FFT_SIZE = 8192
export const ANALYZER_SAMPLE_RATE = 48000
export const ANALYZER_FLOOR_DB = -90
export const ANALYZER_CEIL_DB = -10

export async function startAnalyzer(): Promise<void> {
  if (running) return

  unsubSpectrum = window.api.analyzer.onSpectrum((data) => {
    if (!spectrumData || spectrumData.length !== data.length) {
      spectrumData = new Float32Array(data.length)
    }
    spectrumData.set(data)
  })

  try {
    await window.api.analyzer.start()
  } catch (err) {
    if (unsubSpectrum) {
      unsubSpectrum()
      unsubSpectrum = null
    }
    throw err
  }

  running = true
}

export function stopAnalyzer(): void {
  if (!running) return

  window.api.analyzer.stop()

  if (unsubSpectrum) {
    unsubSpectrum()
    unsubSpectrum = null
  }

  spectrumData = null
  running = false
}

export function getSpectrumData(): Float32Array<ArrayBuffer> | null {
  if (!running || !spectrumData) return null
  return spectrumData
}

export function isAnalyzerRunning(): boolean {
  return running
}
