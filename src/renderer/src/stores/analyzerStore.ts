import { create } from 'zustand'
import { startAnalyzer, stopAnalyzer } from '@/lib/analyzerEngine'

interface AnalyzerState {
  isAnalyzerOn: boolean
  isStarting: boolean
  error: string | null
  toggleAnalyzer: () => Promise<void>
}

export const useAnalyzerStore = create<AnalyzerState>((set, get) => ({
  isAnalyzerOn: false,
  isStarting: false,
  error: null,

  toggleAnalyzer: async () => {
    const { isAnalyzerOn, isStarting } = get()
    if (isStarting) return

    if (isAnalyzerOn) {
      stopAnalyzer()
      set({ isAnalyzerOn: false, error: null })
    } else {
      set({ isStarting: true, error: null })
      try {
        await startAnalyzer()
        set({ isAnalyzerOn: true, isStarting: false })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to start analyzer'
        console.error('[Analyzer]', message)
        set({
          isAnalyzerOn: false,
          isStarting: false,
          error: message
        })
      }
    }
  }
}))
