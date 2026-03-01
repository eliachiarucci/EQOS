import { useState, useEffect, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Upload, FileUp, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import type { DfuState, DfuProgress } from '../../../../shared/types/dfu'

interface FirmwareUpdateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const ACTIVE_STATES: DfuState[] = ['entering-dfu', 'waiting-for-device', 'flashing']

export function FirmwareUpdateDialog({
  open,
  onOpenChange
}: FirmwareUpdateDialogProps): React.JSX.Element {
  const [state, setState] = useState<DfuState>('idle')
  const [percent, setPercent] = useState(0)
  const [message, setMessage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<string | null>(null)

  const isActive = ACTIVE_STATES.includes(state)

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setState('idle')
      setPercent(0)
      setMessage('')
      setError(null)
      setSelectedFile(null)
    }
  }, [open])

  // Subscribe to DFU progress events
  useEffect(() => {
    if (!open) return

    const cleanup = window.api.dfu.onProgress((progress: DfuProgress) => {
      setState(progress.state)
      setPercent(progress.percent)
      setMessage(progress.message)
      if (progress.error) setError(progress.error)
    })

    return cleanup
  }, [open])

  // Auto-close after successful flash
  useEffect(() => {
    if (state !== 'complete') return

    const timer = setTimeout(() => onOpenChange(false), 3000)
    return () => clearTimeout(timer)
  }, [state, onOpenChange])

  const handleSelectFile = useCallback(async () => {
    const path = await window.api.dfu.selectFile()
    if (path) setSelectedFile(path)
  }, [])

  const handleStartUpdate = useCallback(async () => {
    if (!selectedFile) return

    setState('entering-dfu')
    setMessage('Sending DFU command to device...')
    setError(null)

    try {
      await window.api.dfu.startUpdate(selectedFile)
    } catch (err) {
      setState('error')
      const errorMsg = err instanceof Error ? err.message : 'Firmware update failed'
      setError(errorMsg)
      setMessage(errorMsg)
    }
  }, [selectedFile])

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      // Prevent closing during active DFU
      if (!nextOpen && isActive) return
      onOpenChange(nextOpen)
    },
    [isActive, onOpenChange]
  )

  const fileName = selectedFile?.split('/').pop()?.split('\\').pop()

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton={!isActive}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Firmware Update
          </DialogTitle>
          <DialogDescription>
            Flash new firmware to your device via DFU
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {state === 'idle' && (
            <>
              <div className="flex items-center gap-3">
                <Button variant="outline" size="sm" onClick={handleSelectFile}>
                  <FileUp className="mr-2 h-4 w-4" />
                  Select Firmware File
                </Button>
                {fileName && (
                  <span className="text-sm text-muted-foreground truncate">{fileName}</span>
                )}
              </div>
              {!selectedFile && (
                <p className="text-xs text-muted-foreground">Accepted format: .bin</p>
              )}
            </>
          )}

          {(state === 'entering-dfu' || state === 'waiting-for-device') && (
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              <span className="text-sm">{message}</span>
            </div>
          )}

          {state === 'flashing' && (
            <div className="space-y-2">
              <Progress value={percent} />
              <p className="text-sm text-muted-foreground">{message}</p>
            </div>
          )}

          {state === 'complete' && (
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              <span className="text-sm">{message}</span>
            </div>
          )}

          {state === 'error' && (
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <span className="text-sm text-destructive">{error}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          {state === 'idle' && (
            <Button onClick={handleStartUpdate} disabled={!selectedFile}>
              Update Firmware
            </Button>
          )}
          {state === 'complete' && (
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          )}
          {state === 'error' && (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              <Button onClick={() => setState('idle')}>Try Again</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
