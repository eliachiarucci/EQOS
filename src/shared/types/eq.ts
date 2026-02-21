export type FilterType = 'lowshelf' | 'highshelf' | 'lowpass' | 'highpass' | 'peaking'

export interface EqPoint {
  id: string
  filterType: FilterType
  frequency: number
  gain: number
  q: number
  enabled: boolean
  color: string
}

export interface EqProfile {
  id: string
  name: string
  points: EqPoint[]
}

export interface GraphDimensions {
  width: number
  height: number
  paddingLeft: number
  paddingRight: number
  paddingTop: number
  paddingBottom: number
}

export interface GraphRange {
  minFreq: number
  maxFreq: number
  minDb: number
  maxDb: number
}
