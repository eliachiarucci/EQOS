import { create } from 'zustand'
import type { EqPoint, EqProfile, FilterType } from '../../../shared/types/eq'
import { getNextAvailableColor } from '@/lib/colors'

const MAX_BANDS = 10

function assignColorsToPoints(points: EqPoint[]): void {
  const usedColors: string[] = []
  for (const point of points) {
    if (!point.color) {
      point.color = getNextAvailableColor(usedColors)
    }
    usedColors.push(point.color)
  }
}

interface EqState {
  currentProfile: EqProfile | null
  boardProfiles: { id: string; name: string }[]
  selectedPointId: string | null
  isDragging: boolean
  isConnected: boolean
  isDirty: boolean
  fwVersion: string | null

  setCurrentProfile: (profile: EqProfile | null) => void
  setBoardProfiles: (profiles: { id: string; name: string }[]) => void
  setConnected: (connected: boolean) => void
  setFwVersion: (version: string | null) => void

  createProfile: (name: string) => void
  addPoint: (filterType: FilterType) => void
  removePoint: (id: string) => void
  updatePoint: (id: string, updates: Partial<EqPoint>) => void
  selectPoint: (id: string | null) => void
  setDragging: (isDragging: boolean) => void
  markClean: () => void

  fetchBoardProfiles: () => Promise<void>
  loadProfileFromBoard: (id: string) => Promise<void>
  setOff: () => Promise<void>
  renameProfile: (name: string) => void
  deleteProfileFromBoard: (id: string) => Promise<boolean>
  refreshAfterSave: () => Promise<void>
}

export const useEqStore = create<EqState>((set, get) => ({
  currentProfile: {
    id: 'default',
    name: 'New Profile',
    points: []
  },
  boardProfiles: [],
  selectedPointId: null,
  isDragging: false,
  isConnected: false,
  isDirty: false,
  fwVersion: null,

  setCurrentProfile: (profile) =>
    set({ currentProfile: profile, isDirty: false, selectedPointId: null }),
  setBoardProfiles: (profiles) => set({ boardProfiles: profiles }),
  setConnected: (connected) => set(connected ? { isConnected: true } : { isConnected: false, fwVersion: null }),
  setFwVersion: (version) => set({ fwVersion: version }),

  createProfile: (name) => {
    const newProfile: EqProfile = {
      id: crypto.randomUUID(),
      name,
      points: []
    }
    set({
      currentProfile: newProfile,
      selectedPointId: null,
      isDirty: true
    })
  },

  addPoint: (filterType) => {
    const { currentProfile } = get()
    if (!currentProfile) return
    if (currentProfile.points.length >= MAX_BANDS) return

    const usedColors = currentProfile.points.map((p) => p.color)
    const newPoint: EqPoint = {
      id: crypto.randomUUID(),
      filterType,
      frequency: 1000,
      gain: 0,
      q: 1.0,
      enabled: true,
      color: getNextAvailableColor(usedColors)
    }

    set({
      currentProfile: {
        ...currentProfile,
        points: [...currentProfile.points, newPoint]
      },
      selectedPointId: newPoint.id,
      isDirty: true
    })
  },

  removePoint: (id) => {
    const { currentProfile, selectedPointId } = get()
    if (!currentProfile) return

    set({
      currentProfile: {
        ...currentProfile,
        points: currentProfile.points.filter((p) => p.id !== id)
      },
      selectedPointId: selectedPointId === id ? null : selectedPointId,
      isDirty: true
    })
  },

  updatePoint: (id, updates) => {
    const { currentProfile } = get()
    if (!currentProfile) return

    set({
      currentProfile: {
        ...currentProfile,
        points: currentProfile.points.map((p) => (p.id === id ? { ...p, ...updates } : p))
      },
      isDirty: true
    })
  },

  selectPoint: (id) => set({ selectedPointId: id }),
  setDragging: (isDragging) => set({ isDragging }),
  markClean: () => set({ isDirty: false }),

  fetchBoardProfiles: async () => {
    try {
      const profiles = await window.api.board.listProfiles()
      set({ boardProfiles: profiles })

      const deviceInfo = await window.api.board.getDeviceInfo()
      set({ fwVersion: deviceInfo.fwVersion })

      // Auto-load the active board profile if we're still on the local placeholder
      const { currentProfile } = get()
      if (currentProfile?.id === 'default') {
        const activeId = deviceInfo.activeProfileId
        if (activeId === 0xff || profiles.length === 0) {
          set({
            currentProfile: { id: 'off', name: 'OFF', points: [] },
            selectedPointId: null,
            isDirty: false
          })
        } else {
          const targetId = activeId.toString()
          const matchedId = profiles.find((p) => p.id === targetId) ? targetId : profiles[0].id
          const profile = await window.api.board.loadProfile(matchedId)
          if (profile) {
            assignColorsToPoints(profile.points)
            set({ currentProfile: profile, selectedPointId: null, isDirty: false })
          }
        }
      }
    } catch {
      // ignore — board may not respond
    }
  },

  setOff: async () => {
    await window.api.board.setActive('255')
    set({
      currentProfile: { id: 'off', name: 'OFF', points: [] },
      selectedPointId: null,
      isDirty: false
    })
  },

  loadProfileFromBoard: async (id) => {
    const profile = await window.api.board.loadProfile(id)
    if (!profile) return

    assignColorsToPoints(profile.points)
    set({ currentProfile: profile, selectedPointId: null, isDirty: false })

    // Tell the board to switch to this profile
    await window.api.board.setActive(id)
  },

  renameProfile: (name) => {
    const { currentProfile } = get()
    if (!currentProfile) return
    set({
      currentProfile: { ...currentProfile, name },
      isDirty: true
    })
  },

  deleteProfileFromBoard: async (id) => {
    const success = await window.api.board.deleteProfile(id)
    if (!success) return false

    const profiles = await window.api.board.listProfiles()
    set({ boardProfiles: profiles })

    const { currentProfile } = get()
    if (currentProfile?.id === id) {
      if (profiles.length > 0) {
        const profile = await window.api.board.loadProfile(profiles[0].id)
        if (profile) {
          assignColorsToPoints(profile.points)
          set({ currentProfile: profile, selectedPointId: null, isDirty: false })
        }
      } else {
        set({
          currentProfile: { id: 'off', name: 'OFF', points: [] },
          selectedPointId: null,
          isDirty: false
        })
      }
    }
    return true
  },

  refreshAfterSave: async () => {
    const { currentProfile } = get()
    if (!currentProfile) return

    const profiles = await window.api.board.listProfiles()
    set({ boardProfiles: profiles })

    // If current profile had a UUID id, find its board slot
    const slotId = parseInt(currentProfile.id, 10)
    if (isNaN(slotId) || slotId < 0 || slotId >= 10) {
      const match = profiles.find((p) => p.name === currentProfile.name)
      if (match) {
        set({ currentProfile: { ...currentProfile, id: match.id } })
      }
    }
  }
}))
