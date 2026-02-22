import { SerialPort } from 'serialport'
import { BrowserWindow } from 'electron'

const STM32_VENDOR_ID = '1209'

export interface SerialDeviceInfo {
  path: string
  manufacturer?: string
  productId?: string
  vendorId?: string
}

export class SerialService {
  private port: SerialPort | null = null
  private mainWindow: BrowserWindow | null = null
  private enteringDfu = false

  setEnteringDfu(entering: boolean): void {
    this.enteringDfu = entering
  }

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window
  }

  async listDevices(): Promise<SerialDeviceInfo[]> {
    const ports = await SerialPort.list()
    return ports
      .filter((p) => p.vendorId?.toLowerCase() === STM32_VENDOR_ID)
      .map((p) => ({
        path: p.path,
        manufacturer: p.manufacturer,
        productId: p.productId,
        vendorId: p.vendorId
      }))
  }

  async connect(path: string, baudRate: number = 115200): Promise<void> {
    // Already connected to this device — no-op
    if (this.port?.isOpen && this.port.path === path) {
      return
    }

    if (this.port?.isOpen) {
      await this.disconnect()
    }

    return new Promise((resolve, reject) => {
      this.port = new SerialPort({ path, baudRate }, (err) => {
        if (err) {
          this.port = null
          reject(err)
          return
        }

        this.emitStatus(true)

        this.port!.on('close', () => {
          this.port = null
          this.emitStatus(false)
        })

        this.port!.on('error', () => {
          this.port = null
          this.emitStatus(false)
        })

        resolve()
      })
    })
  }

  async disconnect(): Promise<void> {
    if (!this.port?.isOpen) return

    return new Promise((resolve) => {
      this.port!.close(() => {
        this.port = null
        this.emitStatus(false)
        resolve()
      })
    })
  }

  async send(data: Buffer): Promise<void> {
    if (!this.port?.isOpen) throw new Error('Not connected')

    return new Promise((resolve, reject) => {
      this.port!.write(data, (err) => {
        if (err) reject(err)
        else {
          this.port!.drain((drainErr) => {
            if (drainErr) reject(drainErr)
            else resolve()
          })
        }
      })
    })
  }

  async read(timeout: number = 2000): Promise<Buffer> {
    if (!this.port?.isOpen) throw new Error('Not connected')

    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = []
      const timer = setTimeout(() => {
        this.port?.removeListener('data', onData)
        if (chunks.length > 0) {
          resolve(Buffer.concat(chunks))
        } else {
          reject(new Error('Read timeout'))
        }
      }, timeout)

      const onData = (data: Buffer): void => {
        chunks.push(data)
        clearTimeout(timer)
        setTimeout(() => {
          this.port?.removeListener('data', onData)
          resolve(Buffer.concat(chunks))
        }, 50)
      }

      this.port!.on('data', onData)
    })
  }

  getStatus(): { connected: boolean; path?: string } {
    return {
      connected: this.port?.isOpen ?? false,
      path: this.port?.path
    }
  }

  private emitStatus(connected: boolean): void {
    this.mainWindow?.webContents.send('usb:statusChanged', {
      connected,
      path: connected ? this.port?.path : undefined,
      reason: !connected && this.enteringDfu ? 'dfu' : undefined
    })
  }
}

export const serialService = new SerialService()
