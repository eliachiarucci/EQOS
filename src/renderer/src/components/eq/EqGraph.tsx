import { useRef, useEffect, useCallback } from 'react'
import { useEqStore } from '@/stores/eqStore'
import { useAnalyzerStore } from '@/stores/analyzerStore'
import {
  freqToX,
  dbToY,
  xToFreq,
  yToDb,
  formatFrequency,
  FREQ_GRID_LINES,
  DB_GRID_LINES,
  DEFAULT_RANGE,
  DEFAULT_PADDING
} from '@/lib/graphUtils'
import { computeCoefficients, evaluateResponse, computeCombinedResponse } from '@/lib/biquad'
import {
  getSpectrumData,
  isAnalyzerRunning,
  ANALYZER_FFT_SIZE,
  ANALYZER_SAMPLE_RATE,
  ANALYZER_FLOOR_DB,
  ANALYZER_CEIL_DB
} from '@/lib/analyzerEngine'
import type { GraphDimensions, EqPoint } from '../../../../shared/types/eq'

const POINT_RADIUS = 8
const POINT_HIT_RADIUS = 16
const NUM_CURVE_POINTS = 400

const BG_GRADIENT_TOP = '#0f172a'
const BG_GRADIENT_BOTTOM = '#0c0e1a'
const GRID_COLOR = 'rgba(255, 255, 255, 0.06)'
const ZERO_LINE_COLOR = 'rgba(255, 255, 255, 0.15)'
const AXIS_LABEL_COLOR = 'rgba(255, 255, 255, 0.4)'
const COMBINED_CURVE_COLOR = '#e2e8f0'

const ANALYZER_GLOW_COLOR = 'rgba(100, 200, 255, 0.6)'
const ANALYZER_STROKE_COLOR = 'rgba(100, 200, 255, 0.5)'
const ANALYZER_LINE_WIDTH = 1.5
const ANALYZER_SHADOW_BLUR = 6

export function EqGraph(): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const dimsRef = useRef<GraphDimensions>({
    width: 0,
    height: 0,
    ...DEFAULT_PADDING
  })
  const dragStateRef = useRef<{
    pointId: string | null
    active: boolean
  }>({ pointId: null, active: false })
  const animFrameRef = useRef<number>(0)

  const render = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dims = dimsRef.current
    const dpr = window.devicePixelRatio || 1

    canvas.width = dims.width * dpr
    canvas.height = dims.height * dpr
    ctx.scale(dpr, dpr)

    const state = useEqStore.getState()
    const points = state.currentProfile?.points ?? []
    const selectedPointId = state.selectedPointId

    drawBackground(ctx, dims)
    drawGrid(ctx, dims)
    drawAxisLabels(ctx, dims)
    drawAnalyzer(ctx, dims)
    drawIndividualCurves(ctx, dims, points, selectedPointId)
    drawCombinedCurve(ctx, dims, points)
    drawPoints(ctx, dims, points, selectedPointId)
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      const { width, height } = entry.contentRect
      dimsRef.current = { ...dimsRef.current, width, height }
      render()
    })

    observer.observe(container)
    return () => observer.disconnect()
  }, [render])

  useEffect(() => {
    const unsub = useEqStore.subscribe(() => {
      if (!isAnalyzerRunning()) {
        cancelAnimationFrame(animFrameRef.current)
        animFrameRef.current = requestAnimationFrame(render)
      }
    })

    const startLoop = (): void => {
      const loop = (): void => {
        render()
        if (isAnalyzerRunning()) {
          animFrameRef.current = requestAnimationFrame(loop)
        }
      }
      cancelAnimationFrame(animFrameRef.current)
      animFrameRef.current = requestAnimationFrame(loop)
    }

    const unsubAnalyzer = useAnalyzerStore.subscribe((state) => {
      if (state.isAnalyzerOn) {
        startLoop()
      } else {
        cancelAnimationFrame(animFrameRef.current)
        animFrameRef.current = requestAnimationFrame(render)
      }
    })

    if (useAnalyzerStore.getState().isAnalyzerOn) {
      startLoop()
    } else {
      useAnalyzerStore.getState().toggleAnalyzer()
    }

    return () => {
      unsub()
      unsubAnalyzer()
      cancelAnimationFrame(animFrameRef.current)
    }
  }, [render])

  const getCanvasPos = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } => {
      const canvas = canvasRef.current
      if (!canvas) return { x: 0, y: 0 }
      const rect = canvas.getBoundingClientRect()
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      }
    },
    []
  )

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const pos = getCanvasPos(e)
      const dims = dimsRef.current
      const state = useEqStore.getState()
      const points = state.currentProfile?.points ?? []

      let hitPoint: EqPoint | null = null
      let minDist = POINT_HIT_RADIUS

      for (const point of points) {
        const px = freqToX(point.frequency, dims)
        const py = dbToY(point.gain, dims)
        const dist = Math.sqrt((pos.x - px) ** 2 + (pos.y - py) ** 2)
        if (dist < minDist) {
          minDist = dist
          hitPoint = point
        }
      }

      if (hitPoint) {
        state.selectPoint(hitPoint.id)
        dragStateRef.current = { pointId: hitPoint.id, active: true }
        canvasRef.current?.setPointerCapture(e.pointerId)
      } else {
        state.selectPoint(null)
      }
    },
    [getCanvasPos]
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!dragStateRef.current.active || !dragStateRef.current.pointId) return

      const pos = getCanvasPos(e)
      const dims = dimsRef.current

      const freq = Math.max(
        DEFAULT_RANGE.minFreq,
        Math.min(DEFAULT_RANGE.maxFreq, xToFreq(pos.x, dims))
      )
      const gain = Math.max(DEFAULT_RANGE.minDb, Math.min(DEFAULT_RANGE.maxDb, yToDb(pos.y, dims)))

      useEqStore.getState().updatePoint(dragStateRef.current.pointId, {
        frequency: Math.round(freq),
        gain: Math.round(gain * 10) / 10
      })
      useEqStore.getState().setDragging(true)
    },
    [getCanvasPos]
  )

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (dragStateRef.current.active) {
      dragStateRef.current = { pointId: null, active: false }
      canvasRef.current?.releasePointerCapture(e.pointerId)
      useEqStore.getState().setDragging(false)
    }
  }, [])

  return (
    <div ref={containerRef} className="h-full w-full rounded-lg overflow-hidden">
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className="h-full w-full cursor-crosshair touch-none"
      />
    </div>
  )
}

function drawBackground(ctx: CanvasRenderingContext2D, dims: GraphDimensions): void {
  const gradient = ctx.createLinearGradient(0, 0, 0, dims.height)
  gradient.addColorStop(0, BG_GRADIENT_TOP)
  gradient.addColorStop(1, BG_GRADIENT_BOTTOM)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, dims.width, dims.height)
}

function drawGrid(ctx: CanvasRenderingContext2D, dims: GraphDimensions): void {
  ctx.strokeStyle = GRID_COLOR
  ctx.lineWidth = 1

  for (const freq of FREQ_GRID_LINES) {
    const x = Math.round(freqToX(freq, dims)) + 0.5
    ctx.beginPath()
    ctx.moveTo(x, dims.paddingTop)
    ctx.lineTo(x, dims.height - dims.paddingBottom)
    ctx.stroke()
  }

  for (const db of DB_GRID_LINES) {
    const y = Math.round(dbToY(db, dims)) + 0.5
    ctx.strokeStyle = db === 0 ? ZERO_LINE_COLOR : GRID_COLOR
    ctx.beginPath()
    ctx.moveTo(dims.paddingLeft, y)
    ctx.lineTo(dims.width - dims.paddingRight, y)
    ctx.stroke()
  }
}

function drawAxisLabels(ctx: CanvasRenderingContext2D, dims: GraphDimensions): void {
  ctx.fillStyle = AXIS_LABEL_COLOR
  ctx.font = '10px system-ui, -apple-system, sans-serif'
  ctx.textAlign = 'center'

  for (const freq of FREQ_GRID_LINES) {
    const x = freqToX(freq, dims)
    ctx.fillText(formatFrequency(freq), x, dims.height - dims.paddingBottom + 14)
  }

  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  for (const db of DB_GRID_LINES) {
    if (db === DEFAULT_RANGE.minDb || db === DEFAULT_RANGE.maxDb) continue
    const y = dbToY(db, dims)
    const label = db > 0 ? `+${db}` : `${db}`
    ctx.fillText(label, dims.paddingLeft - 8, y)
  }
}

function drawAnalyzer(ctx: CanvasRenderingContext2D, dims: GraphDimensions): void {
  const data = getSpectrumData()
  if (!data) return

  const plotLeft = dims.paddingLeft
  const plotRight = dims.width - dims.paddingRight
  const plotTop = dims.paddingTop
  const plotBottom = dims.height - dims.paddingBottom
  const plotHeight = plotBottom - plotTop
  const binCount = ANALYZER_FFT_SIZE / 2
  const dbRange = ANALYZER_CEIL_DB - ANALYZER_FLOOR_DB

  ctx.save()
  ctx.shadowBlur = ANALYZER_SHADOW_BLUR
  ctx.shadowColor = ANALYZER_GLOW_COLOR
  ctx.strokeStyle = ANALYZER_STROKE_COLOR
  ctx.lineWidth = ANALYZER_LINE_WIDTH
  ctx.lineJoin = 'round'
  ctx.beginPath()

  let started = false

  for (let x = plotLeft; x <= plotRight; x += 1) {
    const freqLow = xToFreq(x - 0.5, dims)
    const freqHigh = xToFreq(x + 0.5, dims)
    const freqCenter = xToFreq(x, dims)

    const binLow = (freqLow * ANALYZER_FFT_SIZE) / ANALYZER_SAMPLE_RATE
    const binHigh = (freqHigh * ANALYZER_FFT_SIZE) / ANALYZER_SAMPLE_RATE
    const binCenter = (freqCenter * ANALYZER_FFT_SIZE) / ANALYZER_SAMPLE_RATE

    let magnitude: number

    if (binHigh - binLow < 1) {
      const lowIdx = Math.max(0, Math.floor(binCenter))
      const highIdx = Math.min(lowIdx + 1, binCount - 1)
      const fraction = binCenter - lowIdx
      magnitude = data[lowIdx] * (1 - fraction) + data[highIdx] * fraction
    } else {
      const startBin = Math.max(0, Math.floor(binLow))
      const endBin = Math.min(binCount - 1, Math.ceil(binHigh))
      let sum = 0
      let count = 0
      for (let b = startBin; b <= endBin; b++) {
        sum += data[b]
        count++
      }
      magnitude = count > 0 ? sum / count : ANALYZER_FLOOR_DB
    }

    magnitude = Math.max(ANALYZER_FLOOR_DB, Math.min(ANALYZER_CEIL_DB, magnitude))
    const y = plotTop + ((ANALYZER_CEIL_DB - magnitude) / dbRange) * plotHeight

    if (!started) {
      ctx.moveTo(x, y)
      started = true
    } else {
      ctx.lineTo(x, y)
    }
  }

  ctx.stroke()
  ctx.restore()
}

function drawIndividualCurves(
  ctx: CanvasRenderingContext2D,
  dims: GraphDimensions,
  points: EqPoint[],
  selectedPointId: string | null
): void {
  const plotLeft = dims.paddingLeft
  const plotRight = dims.width - dims.paddingRight
  const zeroY = dbToY(0, dims)

  for (const point of points) {
    if (!point.enabled) continue
    const coeffs = computeCoefficients(point.filterType, point.frequency, point.gain, point.q)
    const isSelected = point.id === selectedPointId
    const fillAlpha = isSelected ? 0.35 : 0.15

    ctx.beginPath()
    ctx.moveTo(plotLeft, zeroY)

    for (let i = 0; i <= NUM_CURVE_POINTS; i++) {
      const t = i / NUM_CURVE_POINTS
      const x = plotLeft + t * (plotRight - plotLeft)
      const freq = xToFreq(x, dims)
      const db = evaluateResponse(coeffs, freq)
      const clampedDb = Math.max(DEFAULT_RANGE.minDb, Math.min(DEFAULT_RANGE.maxDb, db))
      const y = dbToY(clampedDb, dims)
      if (i === 0) ctx.lineTo(x, y)
      else ctx.lineTo(x, y)
    }

    ctx.lineTo(plotRight, zeroY)
    ctx.closePath()

    ctx.fillStyle = hexToRgba(point.color, fillAlpha)
    ctx.fill()

    ctx.beginPath()
    for (let i = 0; i <= NUM_CURVE_POINTS; i++) {
      const t = i / NUM_CURVE_POINTS
      const x = plotLeft + t * (plotRight - plotLeft)
      const freq = xToFreq(x, dims)
      const db = evaluateResponse(coeffs, freq)
      const clampedDb = Math.max(DEFAULT_RANGE.minDb, Math.min(DEFAULT_RANGE.maxDb, db))
      const y = dbToY(clampedDb, dims)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.strokeStyle = hexToRgba(point.color, isSelected ? 0.8 : 0.4)
    ctx.lineWidth = isSelected ? 2 : 1
    ctx.stroke()
  }
}

function drawCombinedCurve(
  ctx: CanvasRenderingContext2D,
  dims: GraphDimensions,
  points: EqPoint[]
): void {
  const activePoints = points.filter((p) => p.enabled)
  if (activePoints.length === 0) return

  const plotLeft = dims.paddingLeft
  const plotRight = dims.width - dims.paddingRight
  const zeroY = dbToY(0, dims)

  ctx.beginPath()
  ctx.moveTo(plotLeft, zeroY)

  for (let i = 0; i <= NUM_CURVE_POINTS; i++) {
    const t = i / NUM_CURVE_POINTS
    const x = plotLeft + t * (plotRight - plotLeft)
    const freq = xToFreq(x, dims)
    const db = computeCombinedResponse(activePoints, freq)
    const clampedDb = Math.max(DEFAULT_RANGE.minDb, Math.min(DEFAULT_RANGE.maxDb, db))
    const y = dbToY(clampedDb, dims)
    ctx.lineTo(x, y)
  }

  ctx.lineTo(plotRight, zeroY)
  ctx.closePath()

  const gradient = ctx.createLinearGradient(0, dims.paddingTop, 0, dims.height - dims.paddingBottom)
  gradient.addColorStop(0, 'rgba(226, 232, 240, 0.08)')
  gradient.addColorStop(0.5, 'rgba(226, 232, 240, 0.02)')
  gradient.addColorStop(1, 'rgba(226, 232, 240, 0.08)')
  ctx.fillStyle = gradient
  ctx.fill()

  ctx.beginPath()
  for (let i = 0; i <= NUM_CURVE_POINTS; i++) {
    const t = i / NUM_CURVE_POINTS
    const x = plotLeft + t * (plotRight - plotLeft)
    const freq = xToFreq(x, dims)
    const db = computeCombinedResponse(activePoints, freq)
    const clampedDb = Math.max(DEFAULT_RANGE.minDb, Math.min(DEFAULT_RANGE.maxDb, db))
    const y = dbToY(clampedDb, dims)
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.strokeStyle = COMBINED_CURVE_COLOR
  ctx.lineWidth = 2
  ctx.stroke()
}

function drawPoints(
  ctx: CanvasRenderingContext2D,
  dims: GraphDimensions,
  points: EqPoint[],
  selectedPointId: string | null
): void {
  for (const point of points) {
    const x = freqToX(point.frequency, dims)
    const y = dbToY(point.gain, dims)
    const isSelected = point.id === selectedPointId

    if (isSelected) {
      ctx.beginPath()
      ctx.arc(x, y, POINT_RADIUS + 6, 0, Math.PI * 2)
      ctx.fillStyle = hexToRgba(point.color, 0.2)
      ctx.fill()
    }

    ctx.beginPath()
    ctx.arc(x, y, POINT_RADIUS, 0, Math.PI * 2)
    ctx.fillStyle = point.enabled ? point.color : hexToRgba(point.color, 0.3)
    ctx.fill()
    ctx.strokeStyle = isSelected ? '#ffffff' : 'rgba(255, 255, 255, 0.6)'
    ctx.lineWidth = isSelected ? 2.5 : 1.5
    ctx.stroke()
  }
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
