import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  board: {
    getDeviceInfo: (): Promise<{ fwVersion: string; maxProfiles: number; maxFilters: number; activeProfileId: number }> =>
      ipcRenderer.invoke('board:getDeviceInfo'),
    getActiveProfile: (): Promise<number> => ipcRenderer.invoke('board:getActiveProfile'),
    listProfiles: (): Promise<{ id: string; name: string }[]> =>
      ipcRenderer.invoke('board:listProfiles'),
    loadProfile: (id: string): Promise<unknown> => ipcRenderer.invoke('board:loadProfile', id),
    saveProfile: (profile: unknown): Promise<boolean> =>
      ipcRenderer.invoke('board:saveProfile', profile),
    deleteProfile: (id: string): Promise<boolean> => ipcRenderer.invoke('board:deleteProfile', id),
    setActive: (id: string): Promise<boolean> => ipcRenderer.invoke('board:setActive', id),
    getManufacturer: (): Promise<string> => ipcRenderer.invoke('board:getManufacturer'),
    getProduct: (): Promise<string> => ipcRenderer.invoke('board:getProduct'),
    getAudioItf: (): Promise<string> => ipcRenderer.invoke('board:getAudioItf'),
    setManufacturer: (value: string): Promise<boolean> =>
      ipcRenderer.invoke('board:setManufacturer', value),
    setProduct: (value: string): Promise<boolean> =>
      ipcRenderer.invoke('board:setProduct', value),
    setAudioItf: (value: string): Promise<boolean> =>
      ipcRenderer.invoke('board:setAudioItf', value),
    reboot: (): Promise<boolean> => ipcRenderer.invoke('board:reboot'),
    getDac: (): Promise<boolean> => ipcRenderer.invoke('board:getDac'),
    getAmp: (): Promise<boolean> => ipcRenderer.invoke('board:getAmp'),
    setDac: (enable: boolean): Promise<boolean> => ipcRenderer.invoke('board:setDac', enable),
    setAmp: (enable: boolean): Promise<boolean> => ipcRenderer.invoke('board:setAmp', enable)
  },
  usb: {
    getStatus: (): Promise<{ connected: boolean; path?: string }> =>
      ipcRenderer.invoke('usb:getStatus'),
    listDevices: (): Promise<{ path: string; manufacturer?: string }[]> =>
      ipcRenderer.invoke('usb:listDevices'),
    connect: (path: string): Promise<void> => ipcRenderer.invoke('usb:connect', path),
    disconnect: (): Promise<void> => ipcRenderer.invoke('usb:disconnect'),
    onStatusChange: (
      callback: (status: { connected: boolean; path?: string; reason?: string }) => void
    ): (() => void) => {
      const handler = (
        _event: unknown,
        status: { connected: boolean; path?: string; reason?: string }
      ): void => callback(status)
      ipcRenderer.on('usb:statusChanged', handler)
      return () => {
        ipcRenderer.removeListener('usb:statusChanged', handler)
      }
    }
  },
  dfu: {
    selectFile: (): Promise<string | null> => ipcRenderer.invoke('dfu:selectFile'),
    startUpdate: (firmwarePath: string): Promise<void> =>
      ipcRenderer.invoke('dfu:startUpdate', firmwarePath),
    getState: (): Promise<string> => ipcRenderer.invoke('dfu:getState'),
    onProgress: (
      callback: (progress: {
        state: string
        percent: number
        message: string
        error?: string
      }) => void
    ): (() => void) => {
      const handler = (
        _event: unknown,
        progress: { state: string; percent: number; message: string; error?: string }
      ): void => callback(progress)
      ipcRenderer.on('dfu:progress', handler)
      return () => {
        ipcRenderer.removeListener('dfu:progress', handler)
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
