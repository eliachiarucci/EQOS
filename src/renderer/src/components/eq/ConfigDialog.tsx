import { useState, useCallback, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { AlertCircle, Loader2, RotateCcw } from 'lucide-react'

interface ConfigDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type HardwareState = boolean | null // null = unknown

export function ConfigDialog({ open, onOpenChange }: ConfigDialogProps): React.JSX.Element {
  const [manufacturer, setManufacturer] = useState('')
  const [product, setProduct] = useState('')
  const [audioItf, setAudioItf] = useState('')
  const [dac, setDac] = useState<HardwareState>(null)
  const [amp, setAmp] = useState<HardwareState>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch current strings from device whenever the dialog opens
  useEffect(() => {
    if (!open) return
    setError(null)
    setBusy(true)
    ;(async () => {
      try {
        const mfr = await window.api.board.getManufacturer()
        const prod = await window.api.board.getProduct()
        const itf = await window.api.board.getAudioItf()
        const dacState = await window.api.board.getDac()
        const ampState = await window.api.board.getAmp()
        setManufacturer(mfr)
        setProduct(prod)
        setAudioItf(itf)
        setDac(dacState)
        setAmp(ampState)
      } catch {
        setManufacturer('')
        setProduct('')
        setAudioItf('')
      } finally {
        setBusy(false)
      }
    })()
  }, [open])

  const handleApplyAndReboot = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const delay = () => new Promise((resolve) => setTimeout(resolve, 200))
      if (manufacturer.trim()) {
        const ok = await window.api.board.setManufacturer(manufacturer.trim())
        if (!ok) throw new Error('SET_MANUFACTURER failed')
        await delay()
      }
      if (product.trim()) {
        const ok = await window.api.board.setProduct(product.trim())
        if (!ok) throw new Error('SET_PRODUCT failed')
        await delay()
      }
      if (audioItf.trim()) {
        const ok = await window.api.board.setAudioItf(audioItf.trim())
        if (!ok) throw new Error('SET_AUDIO_ITF failed')
        await delay()
      }
      await window.api.board.reboot()
      onOpenChange(false)
    } catch (err) {
      setBusy(false)
      setError(err instanceof Error ? err.message : 'Command failed')
    }
  }, [manufacturer, product, audioItf, onOpenChange])

  const handleSetDac = useCallback(async (enable: boolean) => {
    setBusy(true)
    setError(null)
    try {
      const ok = await window.api.board.setDac(enable)
      if (!ok) throw new Error('SET_DAC failed')
      setDac(enable)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Command failed')
    } finally {
      setBusy(false)
    }
  }, [])

  const handleSetAmp = useCallback(async (enable: boolean) => {
    setBusy(true)
    setError(null)
    try {
      const ok = await window.api.board.setAmp(enable)
      if (!ok) throw new Error('SET_AMP failed')
      setAmp(enable)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Command failed')
    } finally {
      setBusy(false)
    }
  }, [])

  const handleReboot = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      await window.api.board.reboot()
    } catch {
      // device reboots — serial drops, that's expected
    } finally {
      setBusy(false)
      onOpenChange(false)
    }
  }, [onOpenChange])

  const canApplyStrings =
    manufacturer.trim().length > 0 || product.trim().length > 0 || audioItf.trim().length > 0

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) onOpenChange(next)
      }}
    >
      <DialogContent showCloseButton={!busy}>
        <DialogHeader>
          <DialogTitle>Device Config</DialogTitle>
          <DialogDescription>Advanced device configuration</DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-1">
          {/* USB Strings */}
          <div className="space-y-3">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              USB Strings
            </p>
            <div className="grid grid-cols-[180px_1fr] items-center gap-2">
              <Label className="text-sm">Manufacturer</Label>
              <Input
                value={manufacturer}
                onChange={(e) => setManufacturer(e.target.value.slice(0, 32))}
                placeholder="e.g. Acme Corp"
                maxLength={32}
                disabled={busy}
                className="h-8 text-sm"
              />
              <Label className="text-sm">Product</Label>
              <Input
                value={product}
                onChange={(e) => setProduct(e.target.value.slice(0, 32))}
                placeholder="e.g. DA15 Audio"
                maxLength={32}
                disabled={busy}
                className="h-8 text-sm"
              />
              <Label className="text-sm">Audio Interface Name</Label>
              <Input
                value={audioItf}
                onChange={(e) => setAudioItf(e.target.value.slice(0, 32))}
                placeholder="e.g. DA15 Speakers"
                maxLength={32}
                disabled={busy}
                className="h-8 text-sm"
              />
            </div>
            <Button
              size="sm"
              onClick={handleApplyAndReboot}
              disabled={busy || !canApplyStrings}
              className="gap-1.5"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Apply & Reboot
            </Button>
          </div>

          <Separator />

          {/* Hardware */}
          <div className="space-y-3">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Hardware
            </p>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm">DAC</Label>
                <div className="flex gap-1.5">
                  <Button
                    size="sm"
                    variant={dac === true ? 'default' : 'outline'}
                    className="h-7 px-3 text-xs"
                    onClick={() => handleSetDac(true)}
                    disabled={busy}
                  >
                    On
                  </Button>
                  <Button
                    size="sm"
                    variant={dac === false ? 'default' : 'outline'}
                    className="h-7 px-3 text-xs"
                    onClick={() => handleSetDac(false)}
                    disabled={busy}
                  >
                    Off
                  </Button>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-sm">Amplifier</Label>
                <div className="flex gap-1.5">
                  <Button
                    size="sm"
                    variant={amp === true ? 'default' : 'outline'}
                    className="h-7 px-3 text-xs"
                    onClick={() => handleSetAmp(true)}
                    disabled={busy}
                  >
                    On
                  </Button>
                  <Button
                    size="sm"
                    variant={amp === false ? 'default' : 'outline'}
                    className="h-7 px-3 text-xs"
                    onClick={() => handleSetAmp(false)}
                    disabled={busy}
                  >
                    Off
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <Separator />

          {/* System */}
          <div className="space-y-3">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              System
            </p>
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Perform a clean device reset</p>
              <Button
                size="sm"
                variant="outline"
                onClick={handleReboot}
                disabled={busy}
                className="gap-1.5"
              >
                {busy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RotateCcw className="h-3.5 w-3.5" />
                )}
                Reboot
              </Button>
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="text-sm">{error}</span>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
