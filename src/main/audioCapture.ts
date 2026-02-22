import type { BrowserWindow } from 'electron'

const FFT_SIZE = 8192
const BIN_COUNT = FFT_SIZE / 2
const SAMPLE_RATE = 48000
const CHUNK_DURATION_MS = 20
const SMOOTHING = 0.8
const SPECTRUM_INTERVAL_MS = 16

let audioteeInstance: InstanceType<typeof import('audiotee').AudioTee> | null = null
let mainWindow: BrowserWindow | null = null
let ringBuffer: Float32Array
let writePos = 0
let samplesWritten = 0
let hannWindow: Float32Array
let smoothedSpectrum: Float32Array
let spectrumInterval: ReturnType<typeof setInterval> | null = null

function createHannWindow(): Float32Array {
  const w = new Float32Array(FFT_SIZE)
  for (let i = 0; i < FFT_SIZE; i++) {
    w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / FFT_SIZE))
  }
  return w
}

function fft(real: Float32Array, imag: Float32Array): void {
  const n = real.length

  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    while (j & bit) {
      j ^= bit
      bit >>= 1
    }
    j ^= bit
    if (i < j) {
      ;[real[i], real[j]] = [real[j], real[i]]
      ;[imag[i], imag[j]] = [imag[j], imag[i]]
    }
  }

  for (let size = 2; size <= n; size *= 2) {
    const halfSize = size / 2
    const angle = (-2 * Math.PI) / size
    const wReal = Math.cos(angle)
    const wImag = Math.sin(angle)

    for (let i = 0; i < n; i += size) {
      let uReal = 1
      let uImag = 0

      for (let j = 0; j < halfSize; j++) {
        const evenIdx = i + j
        const oddIdx = i + j + halfSize

        const tReal = uReal * real[oddIdx] - uImag * imag[oddIdx]
        const tImag = uReal * imag[oddIdx] + uImag * real[oddIdx]

        real[oddIdx] = real[evenIdx] - tReal
        imag[oddIdx] = imag[evenIdx] - tImag
        real[evenIdx] += tReal
        imag[evenIdx] += tImag

        const newUReal = uReal * wReal - uImag * wImag
        uImag = uReal * wImag + uImag * wReal
        uReal = newUReal
      }
    }
  }
}

function processAndSendSpectrum(): void {
  if (samplesWritten < FFT_SIZE || !mainWindow || mainWindow.isDestroyed()) return

  const real = new Float32Array(FFT_SIZE)
  const imag = new Float32Array(FFT_SIZE)

  for (let i = 0; i < FFT_SIZE; i++) {
    const idx = (writePos - FFT_SIZE + i + ringBuffer.length) % ringBuffer.length
    real[i] = ringBuffer[idx] * hannWindow[i]
  }

  fft(real, imag)

  for (let i = 0; i < BIN_COUNT; i++) {
    const mag = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]) / FFT_SIZE
    const db = mag > 0 ? 20 * Math.log10(mag) : -200

    if (smoothedSpectrum[i] <= -200) {
      smoothedSpectrum[i] = db
    } else {
      smoothedSpectrum[i] = SMOOTHING * smoothedSpectrum[i] + (1 - SMOOTHING) * db
    }
  }

  mainWindow.webContents.send('analyzer:spectrum', Array.from(smoothedSpectrum))
}

export async function startCapture(window: BrowserWindow): Promise<void> {
  if (audioteeInstance) return

  const { AudioTee } = await import('audiotee')

  mainWindow = window
  ringBuffer = new Float32Array(FFT_SIZE * 2)
  smoothedSpectrum = new Float32Array(BIN_COUNT).fill(-200)
  hannWindow = createHannWindow()
  writePos = 0
  samplesWritten = 0

  const tee = new AudioTee({
    sampleRate: SAMPLE_RATE,
    chunkDurationMs: CHUNK_DURATION_MS
  })

  tee.on('data', (chunk) => {
    const buffer = chunk.data
    const sampleCount = buffer.length / 2

    for (let i = 0; i < sampleCount; i++) {
      ringBuffer[writePos] = buffer.readInt16LE(i * 2) / 32768
      writePos = (writePos + 1) % ringBuffer.length
    }

    samplesWritten += sampleCount
  })

  tee.on('error', (err) => {
    console.error('[AudioCapture] Error:', err.message)
  })

  audioteeInstance = tee

  await tee.start()

  spectrumInterval = setInterval(processAndSendSpectrum, SPECTRUM_INTERVAL_MS)
}

export async function stopCapture(): Promise<void> {
  if (spectrumInterval) {
    clearInterval(spectrumInterval)
    spectrumInterval = null
  }

  if (audioteeInstance) {
    await audioteeInstance.stop()
    audioteeInstance = null
  }

  mainWindow = null
}

export function isCapturing(): boolean {
  return audioteeInstance !== null
}
