import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Zap, Briefcase, TrendingUp, FileText, Users, User, BarChart3, Settings, X } from 'lucide-react'
import { useCommandPalette } from '@/hooks/useCommandPalette'
import { useDebounce } from '@/hooks/useDebounce'

const commands = [
  { label: 'Dashboard', path: '/', icon: Zap },
  { label: 'Jobs', path: '/jobs', icon: Briefcase },
  { label: 'Pipeline', path: '/pipeline', icon: TrendingUp },
  { label: 'Review Queue', path: '/review', icon: FileText },
  { label: 'Personas', path: '/personas', icon: Users },
  { label: 'Profile', path: '/profile', icon: User },
  { label: 'Analytics', path: '/analytics', icon: BarChart3 },
  { label: 'Settings', path: '/settings', icon: Settings },
]

export const CommandPalette = () => {
  const { open, setOpen } = useCommandPalette()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)

  const debouncedSearch = useDebounce(search, 100)

  const filteredCommands = useMemo(() => {
    if (!debouncedSearch) return commands
    return commands.filter(
      (cmd) =>
        cmd.label.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        cmd.path.includes(debouncedSearch)
    )
  }, [debouncedSearch])

  const handleSelect = (path: string) => {
    navigate(path)
    setOpen(false)
    setSearch('')
    setSelectedIndex(0)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedIndex((prev) => (prev + 1) % filteredCommands.length)
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedIndex((prev) => (prev - 1 + filteredCommands.length) % filteredCommands.length)
        break
      case 'Enter':
        e.preventDefault()
        if (filteredCommands[selectedIndex]) {
          handleSelect(filteredCommands[selectedIndex].path)
        }
        break
    }
  }

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50"
        onClick={() => setOpen(false)}
      />

      {/* Modal */}
      <div className="fixed left-1/2 top-1/4 z-50 w-full max-w-2xl -translate-x-1/2">
        <div className="rounded-lg border border-gray-200 bg-white shadow-xl dark:border-gray-800 dark:bg-gray-900">
          {/* Input */}
          <div className="flex items-center gap-3 border-b border-gray-200 px-4 py-3 dark:border-gray-800">
            <Search size={20} className="text-gray-400" />
            <input
              autoFocus
              type="text"
              placeholder="Search commands... (Cmd+K)"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setSelectedIndex(0)
              }}
              onKeyDown={handleKeyDown}
              className="flex-1 bg-transparent outline-none text-gray-900 placeholder-gray-500 dark:text-white dark:placeholder-gray-400"
            />
            <button
              onClick={() => setOpen(false)}
              className="rounded-lg p-1 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <X size={20} />
            </button>
          </div>

          {/* Commands */}
          <div className="max-h-96 overflow-y-auto py-2">
            {filteredCommands.length === 0 ? (
              <div className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                No commands found
              </div>
            ) : (
              filteredCommands.map((cmd, index) => {
                const Icon = cmd.icon
                return (
                  <button
                    key={cmd.path}
                    onClick={() => handleSelect(cmd.path)}
                    className={`w-full px-4 py-2.5 flex items-center gap-3 text-left transition-colors ${
                      index === selectedIndex
                        ? 'bg-primary-100 dark:bg-primary-900'
                        : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                    }`}
                  >
                    <Icon size={18} className="text-gray-600 dark:text-gray-400" />
                    <span className="flex-1 text-gray-900 dark:text-white">{cmd.label}</span>
                    <span className="text-xs text-gray-400">Enter</span>
                  </button>
                )
              })
            )}
          </div>
        </div>
      </div>
    </>
  )
}
