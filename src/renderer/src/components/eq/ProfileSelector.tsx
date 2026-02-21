import { useState, useCallback } from 'react'
import { useEqStore } from '@/stores/eqStore'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Plus, ArrowUpToLine, Pencil, Trash2 } from 'lucide-react'

export function ProfileSelector(): React.JSX.Element {
  const currentProfile = useEqStore((s) => s.currentProfile)
  const boardProfiles = useEqStore((s) => s.boardProfiles)
  const isDirty = useEqStore((s) => s.isDirty)
  const isConnected = useEqStore((s) => s.isConnected)
  const createProfile = useEqStore((s) => s.createProfile)
  const markClean = useEqStore((s) => s.markClean)
  const loadProfileFromBoard = useEqStore((s) => s.loadProfileFromBoard)
  const setOff = useEqStore((s) => s.setOff)
  const renameProfile = useEqStore((s) => s.renameProfile)
  const deleteProfileFromBoard = useEqStore((s) => s.deleteProfileFromBoard)
  const refreshAfterSave = useEqStore((s) => s.refreshAfterSave)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [renameDialogOpen, setRenameDialogOpen] = useState(false)
  const [renameName, setRenameName] = useState('')

  const isBoardProfile = currentProfile
    ? boardProfiles.some((p) => p.id === currentProfile.id)
    : false

  const handleProfileChange = useCallback(
    async (profileId: string) => {
      if (loading) return
      setLoading(true)
      try {
        if (profileId === 'off') {
          await setOff()
        } else {
          await loadProfileFromBoard(profileId)
        }
      } catch (err) {
        console.error('Failed to load profile:', err)
      } finally {
        setLoading(false)
      }
    },
    [loading, loadProfileFromBoard, setOff]
  )

  const handleCreate = useCallback(() => {
    const name = newName.trim()
    if (!name) return
    createProfile(name)
    setNewName('')
    setDialogOpen(false)
  }, [newName, createProfile])

  const handleCreateKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        handleCreate()
      }
    },
    [handleCreate]
  )

  const handleSendToBoard = useCallback(async () => {
    if (!currentProfile || sending) return

    if (currentProfile.points.length === 0) {
      const confirmed = window.confirm(
        `Profile "${currentProfile.name}" has no filters. Sending it will save an empty profile to the board. Continue?`
      )
      if (!confirmed) return
    }

    setSending(true)
    try {
      const success = await window.api.board.saveProfile(currentProfile)
      if (success) {
        markClean()
        await refreshAfterSave()
      } else {
        console.error('Failed to save profile to board')
      }
    } catch (err) {
      console.error('Error sending profile to board:', err)
    } finally {
      setSending(false)
    }
  }, [currentProfile, sending, markClean, refreshAfterSave])

  const handleOpenRename = useCallback(() => {
    setRenameName(currentProfile?.name ?? '')
    setRenameDialogOpen(true)
  }, [currentProfile])

  const handleRename = useCallback(() => {
    const name = renameName.trim()
    if (!name) return
    renameProfile(name)
    setRenameDialogOpen(false)
  }, [renameName, renameProfile])

  const handleRenameKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        handleRename()
      }
    },
    [handleRename]
  )

  const handleDelete = useCallback(async () => {
    if (!currentProfile || deleting) return
    const confirmed = window.confirm(`Delete profile "${currentProfile.name}" from the board?`)
    if (!confirmed) return

    setDeleting(true)
    try {
      await deleteProfileFromBoard(currentProfile.id)
    } catch (err) {
      console.error('Error deleting profile:', err)
    } finally {
      setDeleting(false)
    }
  }, [currentProfile, deleting, deleteProfileFromBoard])

  return (
    <div className="flex items-center gap-2">
      <Select
        value={currentProfile?.id ?? ''}
        onValueChange={handleProfileChange}
        disabled={loading || (!isConnected && boardProfiles.length === 0)}
      >
        <SelectTrigger className="w-48">
          <SelectValue placeholder="Select profile" />
        </SelectTrigger>
        <SelectContent>
          {isConnected && <SelectItem value="off">OFF</SelectItem>}
          {boardProfiles.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.name}
            </SelectItem>
          ))}
          {currentProfile && !isBoardProfile && currentProfile.id !== 'off' && (
            <SelectItem value={currentProfile.id}>{currentProfile.name}</SelectItem>
          )}
        </SelectContent>
      </Select>

      {currentProfile && currentProfile.id !== 'off' && (
        <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="icon" title="Rename profile" onClick={handleOpenRename}>
              <Pencil className="h-4 w-4" />
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Rename Profile</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-3 pt-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="rename-profile">Profile name</Label>
                <Input
                  id="rename-profile"
                  value={renameName}
                  onChange={(e) => setRenameName(e.target.value)}
                  onKeyDown={handleRenameKeyDown}
                  maxLength={15}
                  placeholder="My EQ Profile"
                  autoFocus
                />
              </div>
              <Button onClick={handleRename} disabled={!renameName.trim()}>
                Rename
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogTrigger asChild>
          <Button variant="ghost" size="icon" title="New profile">
            <Plus className="h-4 w-4" />
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>New Profile</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 pt-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="profile-name">Profile name</Label>
              <Input
                id="profile-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={handleCreateKeyDown}
                maxLength={15}
                placeholder="My EQ Profile"
                autoFocus
              />
            </div>
            <Button onClick={handleCreate} disabled={!newName.trim()}>
              Create
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {currentProfile?.id !== 'off' && (
        <Button
          variant="ghost"
          size="icon"
          title="Send to board"
          disabled={!isConnected || sending || !isDirty}
          onClick={handleSendToBoard}
          className="relative"
        >
          <ArrowUpToLine className="h-4 w-4" />
          {isDirty && (
            <div className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-orange-500" />
          )}
        </Button>
      )}

      {currentProfile && isConnected && isBoardProfile && (
        <Button
          variant="ghost"
          size="icon"
          title="Delete profile from board"
          disabled={deleting}
          onClick={handleDelete}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      )}
    </div>
  )
}
