import { app, shell, BrowserWindow, ipcMain, session, dialog } from 'electron'
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
  setActiveProfile,
  enterDfuMode
} from './protocol'
import { dfuService } from './dfuService'

if (process.platform === 'darwin') {
  app.commandLine.appendSwitch(
    'enable-features',
    'MacLoopbackAudioForScreenShare,MacSckSystemAudioLoopbackOverride'
  )
}

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
  dfuService.setMainWindow(mainWindow)

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

  ipcMain.handle('dfu:selectFile', async () => {
    const mainWindow = BrowserWindow.getFocusedWindow()
    if (!mainWindow) return null

    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Firmware File',
      filters: [{ name: 'Firmware', extensions: ['bin'] }],
      properties: ['openFile']
    })

    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle('dfu:startUpdate', async (_event, firmwarePath: string) => {
    console.log('[DFU] Starting firmware update with file:', firmwarePath)

    serialService.setEnteringDfu(true)

    // Send CMD 0x08 to reboot the board into DFU bootloader
    console.log('[DFU] Sending ENTER_DFU command...')
    await enterDfuMode()

    // Disconnect serial — port will drop when board reboots
    console.log('[DFU] Disconnecting serial port...')
    try {
      await serialService.disconnect()
    } catch {
      // Port may already be torn down by board reboot
    }

    // Wait for the board to re-enumerate in actual DFU mode (not Runtime)
    console.log('[DFU] Waiting for DFU device...')
    await dfuService.waitForDfuDevice()

    console.log('[DFU] Flashing firmware...')
    await dfuService.flash(firmwarePath)

    console.log('[DFU] Flash complete, clearing DFU flag')
    serialService.setEnteringDfu(false)
  })

  ipcMain.handle('dfu:getState', () => dfuService.getState())
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.eliachiarucci.eqos')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerIpcHandlers()

  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    callback({ audio: 'loopback' } as Electron.Streams)
  })

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
