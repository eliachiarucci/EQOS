import { ProfileSelector } from '@/components/eq/ProfileSelector'
import { UsbStatus } from '@/components/eq/UsbStatus'
import { useEqStore } from '@/stores/eqStore'

export function TopBar(): React.JSX.Element {
  const fwVersion = useEqStore((s) => s.fwVersion)

  return (
    <div className="flex h-14 items-center justify-between border-b border-border px-4">
      <div className="flex items-center gap-2">
        <h1 className="text-lg font-bold tracking-tight">EQOS</h1>
      </div>
      <ProfileSelector />
      <div className="flex items-center gap-3">
        {fwVersion && (
          <span className="text-xs text-muted-foreground">v{fwVersion}</span>
        )}
        <UsbStatus />
      </div>
    </div>
  )
}
