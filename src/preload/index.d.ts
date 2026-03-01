import { ElectronAPI } from '@electron-toolkit/preload'
import type { EqProfile } from '../shared/types/eq'
import type { DfuState, DfuProgress } from '../shared/types/dfu'

interface BoardApi {
  getDeviceInfo(): Promise<{ fwVersion: string; maxProfiles: number; maxFilters: number; activeProfileId: number }>
  listProfiles(): Promise<{ id: string; name: string }[]>
  loadProfile(id: string): Promise<EqProfile | null>
  saveProfile(profile: EqProfile): Promise<boolean>
  deleteProfile(id: string): Promise<boolean>
  setActive(id: string): Promise<boolean>
}

interface UsbApi {
  getStatus(): Promise<{ connected: boolean; path?: string }>
  listDevices(): Promise<{ path: string; manufacturer?: string }[]>
  connect(path: string): Promise<void>
  disconnect(): Promise<void>
  onStatusChange(
    callback: (status: { connected: boolean; path?: string; reason?: string }) => void
  ): () => void
}

interface DfuApi {
  selectFile(): Promise<string | null>
  startUpdate(firmwarePath: string): Promise<void>
  getState(): Promise<DfuState>
  onProgress(callback: (progress: DfuProgress) => void): () => void
}

interface Api {
  board: BoardApi
  usb: UsbApi
  dfu: DfuApi
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: Api
  }
}
