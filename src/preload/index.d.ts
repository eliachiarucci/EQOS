import { ElectronAPI } from '@electron-toolkit/preload'
import type { EqProfile } from '../shared/types/eq'

interface BoardApi {
  getDeviceInfo(): Promise<{ activeProfileId: number }>
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
  onStatusChange(callback: (status: { connected: boolean; path?: string }) => void): () => void
}

interface Api {
  board: BoardApi
  usb: UsbApi
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: Api
  }
}
