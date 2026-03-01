import { execFile, type ChildProcess } from 'child_process'
import { existsSync, chmodSync } from 'fs'
import { join } from 'path'
import { BrowserWindow } from 'electron'
import type { DfuState, DfuProgress } from '../shared/types/dfu'

const FLASH_BASE_ADDRESS = '0x08000000'
const STM32_DFU_VID_PID = '0483:df11'

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

  async flash(firmwarePath: string, serial?: string): Promise<void> {
    this.state = 'flashing'
    this.emitProgress({
      state: 'flashing',
      percent: 0,
      message: 'Starting firmware flash...'
    })

    const dfuUtilPath = this.getDfuUtilPath()

    return new Promise((resolve, reject) => {
      const args = [
        '-d', STM32_DFU_VID_PID,
        '-a', '0',
        ...(serial ? ['-S', serial] : []),
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
