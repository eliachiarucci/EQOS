import { useEqStore } from '@/stores/eqStore'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Plus, Trash2, Power } from 'lucide-react'
import type { FilterType } from '../../../../shared/types/eq'
import { formatFrequency } from '@/lib/graphUtils'
import { useCallback, useMemo } from 'react'

const FILTER_TYPE_LABELS: Record<FilterType, string> = {
  lowshelf: 'Low Shelf',
  highshelf: 'High Shelf',
  lowpass: 'Low Pass',
  highpass: 'High Pass',
  peaking: 'Bell'
}

function qToSlider(q: number): number {
  return (Math.log(q / 0.1) / Math.log(200)) * 100
}

function sliderToQ(value: number): number {
  return 0.1 * Math.pow(200, value / 100)
}

export function EqControls(): React.JSX.Element {
  const currentProfile = useEqStore((s) => s.currentProfile)
  const selectedPointId = useEqStore((s) => s.selectedPointId)
  const addPoint = useEqStore((s) => s.addPoint)
  const updatePoint = useEqStore((s) => s.updatePoint)
  const removePoint = useEqStore((s) => s.removePoint)

  const selectedPoint = useMemo(
    () => currentProfile?.points.find((p) => p.id === selectedPointId) ?? null,
    [currentProfile, selectedPointId]
  )

  const canAddPoint = (currentProfile?.points.length ?? 0) < 10

  const handleFilterTypeChange = useCallback(
    (value: string) => {
      if (!selectedPointId || !selectedPoint) return
      const newType = value as FilterType
      const updates: Partial<{ filterType: FilterType; q: number }> = { filterType: newType }
      // Clamp Q when switching to a non-peaking filter type
      if (newType !== 'peaking' && selectedPoint.q > Math.SQRT1_2) {
        updates.q = Math.SQRT1_2
      }
      updatePoint(selectedPointId, updates)
    },
    [selectedPointId, selectedPoint, updatePoint]
  )

  const handleQChange = useCallback(
    (values: number[]) => {
      if (selectedPointId) {
        updatePoint(selectedPointId, { q: sliderToQ(values[0]) })
      }
    },
    [selectedPointId, updatePoint]
  )

  const handleToggleEnabled = useCallback(() => {
    if (selectedPoint) {
      updatePoint(selectedPoint.id, { enabled: !selectedPoint.enabled })
    }
  }, [selectedPoint, updatePoint])

  const handleDelete = useCallback(() => {
    if (selectedPointId) {
      removePoint(selectedPointId)
    }
  }, [selectedPointId, removePoint])

  return (
    <div className="flex items-center gap-4 rounded-lg border border-border bg-card p-3">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" disabled={!canAddPoint}>
            <Plus className="mr-1 h-4 w-4" /> Add Filter
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {(Object.entries(FILTER_TYPE_LABELS) as [FilterType, string][]).map(([type, label]) => (
            <DropdownMenuItem key={type} onClick={() => addPoint(type)}>
              {label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {selectedPoint && (
        <>
          <div className="h-6 w-px bg-border" />

          <div className="h-3 w-3 rounded-full" style={{ backgroundColor: selectedPoint.color }} />

          <Select value={selectedPoint.filterType} onValueChange={handleFilterTypeChange}>
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.entries(FILTER_TYPE_LABELS) as [FilterType, string][]).map(
                ([type, label]) => (
                  <SelectItem key={type} value={type}>
                    {label}
                  </SelectItem>
                )
              )}
            </SelectContent>
          </Select>

          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <span className="font-mono w-16 text-right">
              {formatFrequency(selectedPoint.frequency)} Hz
            </span>
          </div>

          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <span className="font-mono w-14 text-right">
              {selectedPoint.gain > 0 ? '+' : ''}
              {selectedPoint.gain.toFixed(1)} dB
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Q</span>
            <Slider
              value={[qToSlider(selectedPoint.q)]}
              onValueChange={handleQChange}
              min={0}
              max={selectedPoint.filterType === 'peaking' ? 100 : qToSlider(Math.SQRT1_2)}
              step={1}
              className="w-32"
            />
            <span className="font-mono text-xs text-muted-foreground w-10">
              {selectedPoint.q.toFixed(2)}
            </span>
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={handleToggleEnabled}
            className={selectedPoint.enabled ? '' : 'opacity-40'}
            title={selectedPoint.enabled ? 'Disable' : 'Enable'}
          >
            <Power className="h-4 w-4" />
          </Button>

          <Button variant="ghost" size="icon" onClick={handleDelete} title="Delete filter">
            <Trash2 className="h-4 w-4" />
          </Button>
        </>
      )}
    </div>
  )
}
