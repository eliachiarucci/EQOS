import { EqGraph } from '@/components/eq/EqGraph'
import { EqControls } from '@/components/eq/EqControls'

export function EqPage(): React.JSX.Element {
  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex-1 min-h-0">
        <EqGraph />
      </div>
      <EqControls />
    </div>
  )
}
