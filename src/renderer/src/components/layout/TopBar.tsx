import { ProfileSelector } from '@/components/eq/ProfileSelector'
import { UsbStatus } from '@/components/eq/UsbStatus'

export function TopBar(): React.JSX.Element {
  return (
    <div className="flex h-14 items-center justify-between border-b border-border px-4">
      <div className="flex items-center gap-2">
        <h1 className="text-lg font-bold tracking-tight">eqos</h1>
      </div>
      <ProfileSelector />
      <UsbStatus />
    </div>
  )
}
