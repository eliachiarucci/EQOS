import { execFile, type ChildProcess } from 'child_process'
import { existsSync, chmodSync } from 'fs'
import { join } from 'path'
import { BrowserWindow } from 'electron'
import type { DfuState, DfuProgress } from '../shared/types/dfu'

const FLASH_BASE_ADDRESS = '0x08000000'

export class DfuService {
  private mainWindow: BrowserWindow | null = null
  private state: DfuState = 'idle'
  private childProcess: ChildProcess | null = null

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window
  }

  getState(): DfuState {
    return this.state
  }

  private getDfuUtilPath(): string {
    // Check bundled binary first
    const platform = process.platform
    const binary = platform === 'win32' ? 'dfu-util.exe' : 'dfu-util'
    const bundledPath = join(process.resourcesPath, 'dfu-util', platform, binary)

    if (existsSync(bundledPath)) {
      // Ensure executable on unix
      if (platform !== 'win32') {
        try {
          chmodSync(bundledPath, 0o755)
        } catch {
          // May fail if read-only, that's fine if already executable
        }
      }
      return bundledPath
    }

    // Fall back to system PATH
    return binary
  }

  async waitForDfuDevice(timeout: number = 15000): Promise<void> {
    this.state = 'waiting-for-device'
    this.emitProgress({
      state: 'waiting-for-device',
      percent: 0,
      message: 'Waiting for DFU device...'
    })

    const start = Date.now()
    const dfuUtilPath = this.getDfuUtilPath()
    console.log('[DFU] Looking for DFU device with dfu-util at:', dfuUtilPath)

    while (Date.now() - start < timeout) {
      const found = await this.checkForDfuDevice(dfuUtilPath)
      if (found) {
        console.log('[DFU] DFU device found!')
        return
      }

      await new Promise((resolve) => setTimeout(resolve, 500))
    }

    this.state = 'error'
    const errorMsg =
      'Device did not enter DFU mode within 15 seconds. ' +
      'Try again, or manually enter DFU mode by holding BOOT during power-on.'
    this.emitProgress({
      state: 'error',
      percent: 0,
      message: errorMsg,
      error: errorMsg
    })
    throw new Error(errorMsg)
  }

  private checkForDfuDevice(dfuUtilPath: string): Promise<boolean> {
    return new Promise((resolve) => {
      execFile(dfuUtilPath, ['--list'], { timeout: 5000 }, (error, stdout, stderr) => {
        if (error) {
          console.log('[DFU] dfu-util --list error:', error.message)
          if (stderr) console.log('[DFU] dfu-util stderr:', stderr)
          resolve(false)
          return
        }
        console.log('[DFU] dfu-util --list output:', stdout)
        // "Found DFU:" = device in DFU mode (flashable)
        // "Found Runtime:" = device in normal mode (NOT flashable)
        // We need "Found DFU:", not just "Found Runtime:"
        const hasDfuMode = stdout.includes('Found DFU:')
        console.log('[DFU] Has DFU mode device:', hasDfuMode)
        resolve(hasDfuMode)
      })
    })
  }

  async flash(firmwarePath: string): Promise<void> {
    this.state = 'flashing'
    this.emitProgress({
      state: 'flashing',
      percent: 0,
      message: 'Starting firmware flash...'
    })

    const dfuUtilPath = this.getDfuUtilPath()

    return new Promise((resolve, reject) => {
      const args = [
        '-a', '0',
        '-s', `${FLASH_BASE_ADDRESS}:leave`,
        '-D', firmwarePath
      ]
      console.log('[DFU] Running:', dfuUtilPath, args.join(' '))

      this.childProcess = execFile(
        dfuUtilPath,
        args,
        { timeout: 120000 },
        (error, _stdout, stderr) => {
          this.childProcess = null

          if (error) {
            // STM32 DfuSe with :leave resets the device after flashing.
            // dfu-util can't read the final status because USB is already
            // gone, so it reports "Error during download get_status".
            // The flash actually succeeded — treat this as success.
            if (stderr?.includes('Error during download get_status')) {
              console.log('[DFU] Device reset after flash (expected with :leave)')
              this.state = 'complete'
              this.emitProgress({
                state: 'complete',
                percent: 100,
                message: 'Firmware updated successfully. Device is restarting...'
              })
              resolve()
              return
            }

            this.state = 'error'
            const errorMsg = `DFU flash failed: ${stderr || error.message}`
            this.emitProgress({
              state: 'error',
              percent: 0,
              message: errorMsg,
              error: errorMsg
            })
            reject(new Error(errorMsg))
            return
          }

          this.state = 'complete'
          this.emitProgress({
            state: 'complete',
            percent: 100,
            message: 'Firmware updated successfully. Device is restarting...'
          })
          resolve()
        }
      )

      // Parse stdout for progress
      this.childProcess.stdout?.on('data', (data: string) => {
        const text = data.toString()
        const match = text.match(/(\d+)%/)
        if (match) {
          const percent = parseInt(match[1], 10)
          this.emitProgress({
            state: 'flashing',
            percent,
            message: `Flashing firmware... ${percent}%`
          })
        }
      })

      this.childProcess.stderr?.on('data', (data: string) => {
        const text = data.toString()
        // dfu-util sometimes outputs progress to stderr too
        const match = text.match(/(\d+)%/)
        if (match) {
          const percent = parseInt(match[1], 10)
          this.emitProgress({
            state: 'flashing',
            percent,
            message: `Flashing firmware... ${percent}%`
          })
        }
      })
    })
  }

  reset(): void {
    this.state = 'idle'
    if (this.childProcess) {
      this.childProcess.kill('SIGTERM')
      this.childProcess = null
    }
  }

  private emitProgress(progress: DfuProgress): void {
    this.mainWindow?.webContents.send('dfu:progress', progress)
  }
}

export const dfuService = new DfuService()
