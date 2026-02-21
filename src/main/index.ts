import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { serialService } from './serialService'
import {
  getDeviceInfo,
  listBoardProfiles,
  loadBoardProfile,
  saveBoardProfile,
  deleteBoardProfile,
  setActiveProfile
} from './protocol'

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  serialService.setMainWindow(mainWindow)

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerIpcHandlers(): void {
  ipcMain.handle('usb:listDevices', () => serialService.listDevices())
  ipcMain.handle('usb:connect', (_event, path: string) => serialService.connect(path))
  ipcMain.handle('usb:disconnect', () => serialService.disconnect())
  ipcMain.handle('usb:getStatus', () => serialService.getStatus())

  ipcMain.handle('board:getDeviceInfo', () => getDeviceInfo())
  ipcMain.handle('board:listProfiles', () => listBoardProfiles())
  ipcMain.handle('board:loadProfile', (_event, id: string) => loadBoardProfile(id))
  ipcMain.handle('board:saveProfile', (_event, profile) => saveBoardProfile(profile))
  ipcMain.handle('board:deleteProfile', (_event, id: string) => deleteBoardProfile(id))
  ipcMain.handle('board:setActive', (_event, id: string) => setActiveProfile(id))
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.eqos')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerIpcHandlers()
  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
