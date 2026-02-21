import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  board: {
    getDeviceInfo: (): Promise<{ activeProfileId: number }> =>
      ipcRenderer.invoke('board:getDeviceInfo'),
    listProfiles: (): Promise<{ id: string; name: string }[]> =>
      ipcRenderer.invoke('board:listProfiles'),
    loadProfile: (id: string): Promise<unknown> => ipcRenderer.invoke('board:loadProfile', id),
    saveProfile: (profile: unknown): Promise<boolean> =>
      ipcRenderer.invoke('board:saveProfile', profile),
    deleteProfile: (id: string): Promise<boolean> => ipcRenderer.invoke('board:deleteProfile', id),
    setActive: (id: string): Promise<boolean> => ipcRenderer.invoke('board:setActive', id)
  },
  usb: {
    getStatus: (): Promise<{ connected: boolean; path?: string }> =>
      ipcRenderer.invoke('usb:getStatus'),
    listDevices: (): Promise<{ path: string; manufacturer?: string }[]> =>
      ipcRenderer.invoke('usb:listDevices'),
    connect: (path: string): Promise<void> => ipcRenderer.invoke('usb:connect', path),
    disconnect: (): Promise<void> => ipcRenderer.invoke('usb:disconnect'),
    onStatusChange: (
      callback: (status: { connected: boolean; path?: string }) => void
    ): (() => void) => {
      const handler = (_event: unknown, status: { connected: boolean; path?: string }): void =>
        callback(status)
      ipcRenderer.on('usb:statusChanged', handler)
      return () => {
        ipcRenderer.removeListener('usb:statusChanged', handler)
      }
    }
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
