import { useEffect } from 'react'
import { useAppStore } from '@/stores/app.store'

export const useCommandPalette = () => {
  const { commandPaletteOpen, setCommandPaletteOpen } = useAppStore()

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setCommandPaletteOpen(!commandPaletteOpen)
      }

      if (e.key === 'Escape') {
        setCommandPaletteOpen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [commandPaletteOpen, setCommandPaletteOpen])

  return { open: commandPaletteOpen, setOpen: setCommandPaletteOpen }
}
