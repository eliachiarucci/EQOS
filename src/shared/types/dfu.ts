export type DfuState =
  | 'idle'
  | 'entering-dfu'
  | 'waiting-for-device'
  | 'flashing'
  | 'complete'
  | 'error'

export interface DfuProgress {
  state: DfuState
  percent: number
  message: string
  error?: string
}
