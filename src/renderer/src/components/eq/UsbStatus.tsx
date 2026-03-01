import { useEffect, useState, useCallback, useRef } from 'react'
import { useEqStore } from '@/stores/eqStore'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Usb, Loader2, Upload } from 'lucide-react'
import { FirmwareUpdateDialog } from './FirmwareUpdateDialog'

interface DeviceInfo {
  path: string
  manufacturer?: string
}

export function UsbStatus(): React.JSX.Element {
  const isConnected = useEqStore((s) => s.isConnected)
  const setConnected = useEqStore((s) => s.setConnected)
  const fetchBoardProfiles = useEqStore((s) => s.fetchBoardProfiles)
  const setBoardProfiles = useEqStore((s) => s.setBoardProfiles)
  const setFwVersion = useEqStore((s) => s.setFwVersion)
  const [devices, setDevices] = useState<DeviceInfo[]>([])
  const [scanning, setScanning] = useState(false)
  const [dfuDialogOpen, setDfuDialogOpen] = useState(false)
  const dfuInProgress = useRef(false)
  const manuallyDisconnected = useRef(false)
  const knownDevicePaths = useRef<Set<string>>(new Set())

  const scanDevices = useCallback(async () => {
    setScanning(true)
    try {
      const found = await window.api.usb.listDevices()
      setDevices(found)
    } catch {
      setDevices([])
    } finally {
      setScanning(false)
    }
  }, [])

  const connectDevice = useCallback(
    async (path: string) => {
      try {
        await window.api.usb.connect(path)
        setConnected(true)
        fetchBoardProfiles()
      } catch (err) {
        console.error('Failed to connect:', err)
        setConnected(false)
      }
    },
    [setConnected, fetchBoardProfiles]
  )

  const disconnectDevice = useCallback(async () => {
    manuallyDisconnected.current = true
    try {
      await window.api.usb.disconnect()
    } catch {
      // ignore
    }
    setConnected(false)
    setFwVersion(null)
  }, [setConnected, setFwVersion])

  // On mount, check if main process already has a connection (survives hot reload)
  useEffect(() => {
    window.api.usb.getStatus().then((status) => {
      setConnected(status.connected)
      if (status.connected) {
        fetchBoardProfiles()
      }
    })
  }, [setConnected, fetchBoardProfiles])

  // Listen for status changes from main process
  useEffect(() => {
    const cleanup = window.api.usb.onStatusChange((status) => {
      setConnected(status.connected)
      if (status.connected) {
        fetchBoardProfiles()
      } else if (status.reason !== 'dfu') {
        setBoardProfiles([])
        setFwVersion(null)
      }
    })
    return cleanup
  }, [setConnected, fetchBoardProfiles, setBoardProfiles, setFwVersion])

  // Poll for devices every 3 seconds when not connected (suppress during DFU)
  useEffect(() => {
    if (isConnected) return

    const poll = (): void => {
      if (!dfuInProgress.current) scanDevices()
    }
    poll()
    const interval = setInterval(poll, 3000)
    return () => clearInterval(interval)
  }, [isConnected, scanDevices])

  // Auto-connect only for newly plugged-in devices (not after manual disconnect or during DFU)
  useEffect(() => {
    if (isConnected || dfuInProgress.current) {
      // Track connected device paths as known
      knownDevicePaths.current = new Set(devices.map((d) => d.path))
      return
    }

    // Find devices we haven't seen before
    const newDevices = devices.filter((d) => !knownDevicePaths.current.has(d.path))
    // Update known set
    knownDevicePaths.current = new Set(devices.map((d) => d.path))

    if (manuallyDisconnected.current) {
      // Don't auto-connect after manual disconnect unless a new device appears
      if (newDevices.length === 0) return
      manuallyDisconnected.current = false
    }

    if (devices.length === 1) {
      // Double-check main process isn't already connected before attempting
      window.api.usb.getStatus().then((status) => {
        if (dfuInProgress.current) return
        if (status.connected) {
          setConnected(true)
        } else {
          connectDevice(devices[0].path)
        }
      })
    }
  }, [devices, isConnected, connectDevice, setConnected])

  return (
    <DropdownMenu onOpenChange={(open) => open && scanDevices()}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="flex items-center gap-1.5 text-sm">
          {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Usb className="h-4 w-4" />}
          <div
            className={`h-2 w-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-muted-foreground/40'}`}
          />
          <span className="text-xs text-muted-foreground">
            {isConnected ? 'Connected' : 'Disconnected'}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {isConnected && (
          <>
            <DropdownMenuItem onClick={disconnectDevice}>Disconnect</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                dfuInProgress.current = true
                setDfuDialogOpen(true)
              }}
            >
              <Upload className="h-4 w-4" />
              Firmware Update...
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        {devices.length === 0 ? (
          <DropdownMenuItem disabled>
            {scanning ? 'Scanning...' : 'No devices found'}
          </DropdownMenuItem>
        ) : (
          devices.map((device) => (
            <DropdownMenuItem key={device.path} onClick={() => connectDevice(device.path)}>
              {device.manufacturer ?? 'STM32'} — {device.path}
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
      <FirmwareUpdateDialog
        open={dfuDialogOpen}
        onOpenChange={(open) => {
          setDfuDialogOpen(open)
          dfuInProgress.current = open
        }}
      />
    </DropdownMenu>
  )
}
