let audioContext: AudioContext | null = null
let analyserNode: AnalyserNode | null = null
let sourceNode: MediaStreamAudioSourceNode | null = null
let mediaStream: MediaStream | null = null
let frequencyData: Float32Array<ArrayBuffer> | null = null
let running = false

export const ANALYZER_FFT_SIZE = 8192
export const ANALYZER_SAMPLE_RATE = 48000
export const ANALYZER_FLOOR_DB = -90
export const ANALYZER_CEIL_DB = -10

const SMOOTHING = 0.8

export async function startAnalyzer(): Promise<void> {
  if (running) return

  const stream = await navigator.mediaDevices.getDisplayMedia({
    audio: true,
    video: false
  })

  if (stream.getAudioTracks().length === 0) {
    for (const track of stream.getTracks()) {
      track.stop()
    }
    throw new Error('No audio track available')
  }

  const ctx = new AudioContext({ sampleRate: ANALYZER_SAMPLE_RATE })
  if (ctx.state === 'suspended') {
    await ctx.resume()
  }

  const analyser = ctx.createAnalyser()
  analyser.fftSize = ANALYZER_FFT_SIZE
  analyser.smoothingTimeConstant = SMOOTHING

  const source = ctx.createMediaStreamSource(stream)
  source.connect(analyser)

  audioContext = ctx
  analyserNode = analyser
  sourceNode = source
  mediaStream = stream
  frequencyData = new Float32Array(analyser.frequencyBinCount)
  running = true
}

export function stopAnalyzer(): void {
  if (!running) return

  if (mediaStream) {
    for (const track of mediaStream.getTracks()) {
      track.stop()
    }
  }

  sourceNode?.disconnect()
  audioContext?.close()

  audioContext = null
  analyserNode = null
  sourceNode = null
  mediaStream = null
  frequencyData = null
  running = false
}

export function getSpectrumData(): Float32Array<ArrayBuffer> | null {
  if (!running || !analyserNode || !frequencyData) return null
  analyserNode.getFloatFrequencyData(frequencyData)
  return frequencyData
}

export function isAnalyzerRunning(): boolean {
  return running
}
