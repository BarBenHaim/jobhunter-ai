import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus,
  Loader2,
  Trash2,
  Edit,
  Play,
  ToggleLeft,
  ToggleRight,
  Calendar,
  MapPin,
  Target,
  Bell,
  Zap,
  Search,
} from 'lucide-react'
import { Card } from '@/components/common/Card'
import { Badge } from '@/components/common/Badge'
import { Modal } from '@/components/common/Modal'
import { EmptyState } from '@/components/common/EmptyState'
import { savedSearchesApi, SavedSearch, SavedSearchInput } from '@/services/saved-searches.api'

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const EXPERIENCE_LEVELS = [
  { value: '', label: 'כל הרמות' },
  { value: 'ENTRY', label: 'כניסה' },
  { value: 'JUNIOR', label: 'ג׳וניור' },
  { value: 'MID', label: 'בינוני' },
  { value: 'SENIOR', label: 'סניור' },
  { value: 'LEAD', label: 'מנהל טכני' },
]

const NOTIFY_FREQUENCIES = [
  { value: 'realtime', label: 'בזמן אמת' },
  { value: 'hourly', label: 'כל שעה' },
  { value: 'daily', label: 'יומי' },
  { value: 'weekly', label: 'שבועי' },
]

const SOURCES = [
  { value: 'LINKEDIN', label: 'LinkedIn' },
  { value: 'INDEED', label: 'Indeed' },
  { value: 'ALLJOBS', label: 'AllJobs' },
  { value: 'DRUSHIM', label: 'Drushim' },
  { value: 'GOOGLE_JOBS', label: 'Google Jobs' },
  { value: 'GLASSDOOR', label: 'Glassdoor' },
  { value: 'WELLFOUND', label: 'WellFound' },
]

const SOURCE_COLORS: Record<string, 'primary' | 'success' | 'warning' | 'error' | 'gray'> = {
  LINKEDIN: 'primary',
  INDEED: 'success',
  ALLJOBS: 'error',
  DRUSHIM: 'warning',
  GOOGLE_JOBS: 'primary',
  GLASSDOOR: 'gray',
  WELLFOUND: 'gray',
}

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface EditingSearch extends SavedSearchInput {
  id?: string
}

// ─────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────

const formatRelativeTime = (dateStr?: string): string => {
  if (!dateStr) return 'לא הופעל עדיין'
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - date.getTime()

  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return 'הרגע'
  if (minutes < 60) return `לפני ${minutes} דקות`
  if (hours < 24) return `לפני ${hours} שעות`
  if (days < 7) return `לפני ${days} ימים`
  return date.toLocaleDateString('he-IL')
}

const getFrequencyLabel = (frequency: string): string => {
  const freq = NOTIFY_FREQUENCIES.find((f) => f.value === frequency)
  return freq?.label || frequency
}

// ─────────────────────────────────────────────────────────────
// Modal Form Component
// ─────────────────────────────────────────────────────────────

interface SearchFormModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: SavedSearchInput) => Promise<void>
  isLoading: boolean
  initialData?: SavedSearch
}

const SearchFormModal = ({ isOpen, onClose, onSubmit, isLoading, initialData }: SearchFormModalProps) => {
  const [formData, setFormData] = useState<EditingSearch>(
    initialData
      ? {
          id: initialData.id,
          name: initialData.name,
          freeTextQuery: initialData.freeTextQuery,
          keywords: initialData.keywords,
          location: initialData.location,
          minScore: initialData.minScore,
          experienceLevel: initialData.experienceLevel,
          notifyEmail: initialData.notifyEmail,
          notifyFrequency: initialData.notifyFrequency,
          sources: initialData.sources,
        }
      : {
          name: '',
          freeTextQuery: '',
          keywords: [],
          location: '',
          minScore: 0,
          experienceLevel: '',
          notifyEmail: false,
          notifyFrequency: 'daily',
          sources: [],
        }
  )

  const handleReset = () => {
    setFormData(
      initialData
        ? {
            id: initialData.id,
            name: initialData.name,
            freeTextQuery: initialData.freeTextQuery,
            keywords: initialData.keywords,
            location: initialData.location,
            minScore: initialData.minScore,
            experienceLevel: initialData.experienceLevel,
            notifyEmail: initialData.notifyEmail,
            notifyFrequency: initialData.notifyFrequency,
            sources: initialData.sources,
          }
        : {
            name: '',
            freeTextQuery: '',
            keywords: [],
            location: '',
            minScore: 0,
            experienceLevel: '',
            notifyEmail: false,
            notifyFrequency: 'daily',
            sources: [],
          }
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name.trim()) return

    // Convert comma-separated keywords to array
    const keywordsArray = Array.isArray(formData.keywords)
      ? formData.keywords
      : formData.keywords
          ?.split(',')
          .map((k) => k.trim())
          .filter((k) => k) || []

    try {
      await onSubmit({
        ...formData,
        keywords: keywordsArray,
        minScore: formData.minScore || 0,
      })
      handleReset()
      onClose()
    } catch (error) {
      // Error handled by mutation
    }
  }

  const handleSourceToggle = (source: string) => {
    setFormData((prev) => ({
      ...prev,
      sources: Array.isArray(prev.sources)
        ? prev.sources.includes(source)
          ? prev.sources.filter((s) => s !== source)
          : [...prev.sources, source]
        : [source],
    }))
  }

  const sourcesArray = Array.isArray(formData.sources) ? formData.sources : []
  const keywordsValue = Array.isArray(formData.keywords)
    ? formData.keywords.join(', ')
    : formData.keywords || ''

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        handleReset()
        onClose()
      }}
      title={initialData ? 'עריכת חיפוש' : 'חיפוש חדש'}
      size="lg"
      footer={
        <div className="flex gap-3">
          <button
            onClick={handleSubmit}
            disabled={!formData.name.trim() || isLoading}
            className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-primary-600 px-4 py-2 font-semibold text-white hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading && <Loader2 size={16} className="animate-spin" />}
            {initialData ? 'עדכן' : 'צור'}
          </button>
          <button
            onClick={() => {
              handleReset()
              onClose()
            }}
            className="flex-1 rounded-lg border border-gray-300 px-4 py-2 font-semibold text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            ביטול
          </button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Name */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
            שם החיפוש *
          </label>
          <input
            type="text"
            required
            value={formData.name}
            onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
            className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 placeholder-gray-400 focus:border-primary-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500"
            placeholder="לדוגמה: React Developer"
            dir="rtl"
          />
        </div>

        {/* Free Text Query */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
            תיאור חופשי
          </label>
          <textarea
            value={formData.freeTextQuery || ''}
            onChange={(e) => setFormData((prev) => ({ ...prev, freeTextQuery: e.target.value }))}
            className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 placeholder-gray-400 focus:border-primary-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500"
            placeholder="תיאור נוסף של המשרה שאתה מחפש"
            rows={3}
            dir="rtl"
          />
        </div>

        {/* Keywords */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
            מילות חיפוש (מופרדות בפסיקים)
          </label>
          <input
            type="text"
            value={keywordsValue}
            onChange={(e) => setFormData((prev) => ({ ...prev, keywords: e.target.value }))}
            className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 placeholder-gray-400 focus:border-primary-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500"
            placeholder="React, TypeScript, Node.js"
            dir="rtl"
          />
        </div>

        {/* Location */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
            מיקום
          </label>
          <input
            type="text"
            value={formData.location || ''}
            onChange={(e) => setFormData((prev) => ({ ...prev, location: e.target.value }))}
            className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 placeholder-gray-400 focus:border-primary-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500"
            placeholder="ת״א, קריות, remote"
            dir="rtl"
          />
        </div>

        {/* Min Score */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
            ניקוד מינימום ({formData.minScore || 0})
          </label>
          <input
            type="range"
            min="0"
            max="100"
            value={formData.minScore || 0}
            onChange={(e) => setFormData((prev) => ({ ...prev, minScore: parseInt(e.target.value) }))}
            className="mt-2 w-full"
          />
        </div>

        {/* Experience Level */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
            רמת ניסיון
          </label>
          <select
            value={formData.experienceLevel || ''}
            onChange={(e) => setFormData((prev) => ({ ...prev, experienceLevel: e.target.value }))}
            className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:border-primary-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-white"
            dir="rtl"
          >
            {EXPERIENCE_LEVELS.map((level) => (
              <option key={level.value} value={level.value}>
                {level.label}
              </option>
            ))}
          </select>
        </div>

        {/* Sources */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
            מקורות
          </label>
          <div className="grid grid-cols-2 gap-3">
            {SOURCES.map((source) => (
              <label key={source.value} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sourcesArray.includes(source.value)}
                  onChange={() => handleSourceToggle(source.value)}
                  className="w-4 h-4 rounded"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">{source.label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Notifications */}
        <div className="space-y-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.notifyEmail || false}
              onChange={(e) => setFormData((prev) => ({ ...prev, notifyEmail: e.target.checked }))}
              className="w-4 h-4 rounded"
            />
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              התראות לאימייל
            </span>
          </label>

          {(formData.notifyEmail || false) && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
                תדירות הודעות
              </label>
              <select
                value={formData.notifyFrequency || 'daily'}
                onChange={(e) => setFormData((prev) => ({ ...prev, notifyFrequency: e.target.value }))}
                className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:border-primary-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                dir="rtl"
              >
                {NOTIFY_FREQUENCIES.map((freq) => (
                  <option key={freq.value} value={freq.value}>
                    {freq.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </form>
    </Modal>
  )
}

// ─────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────

export const SavedSearches = () => {
  const queryClient = useQueryClient()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingSearch, setEditingSearch] = useState<SavedSearch | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)

  // Fetch saved searches
  const { data: listResponse, isLoading } = useQuery({
    queryKey: ['saved-searches'],
    queryFn: () => savedSearchesApi.list(),
  })

  const searches = listResponse?.data || []

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (input: SavedSearchInput) => savedSearchesApi.create(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-searches'] })
      setError(null)
    },
    onError: (err: any) => {
      setError(err?.message || 'שגיאה ביצירת החיפוש')
    },
  })

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: (data: { id: string; input: Partial<SavedSearchInput> }) =>
      savedSearchesApi.update(data.id, data.input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-searches'] })
      setError(null)
      setEditingSearch(undefined)
    },
    onError: (err: any) => {
      setError(err?.message || 'שגיאה בעדכון החיפוש')
    },
  })

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => savedSearchesApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-searches'] })
      setError(null)
    },
    onError: (err: any) => {
      setError(err?.message || 'שגיאה במחיקת החיפוש')
    },
  })

  // Toggle mutation
  const toggleMutation = useMutation({
    mutationFn: (id: string) => savedSearchesApi.toggle(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-searches'] })
      setError(null)
    },
    onError: (err: any) => {
      setError(err?.message || 'שגיאה בשינוי סטטוס החיפוש')
    },
  })

  // Run mutation
  const runMutation = useMutation({
    mutationFn: (id: string) => savedSearchesApi.run(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-searches'] })
      setError(null)
    },
    onError: (err: any) => {
      setError(err?.message || 'שגיאה בהפעלת החיפוש')
    },
  })

  const handleSubmitForm = async (data: SavedSearchInput) => {
    if (editingSearch) {
      await updateMutation.mutateAsync({ id: editingSearch.id, input: data })
    } else {
      await createMutation.mutateAsync(data)
    }
  }

  const handleOpenCreate = () => {
    setEditingSearch(undefined)
    setIsModalOpen(true)
  }

  const handleOpenEdit = (search: SavedSearch) => {
    setEditingSearch(search)
    setIsModalOpen(true)
  }

  const isSubmitting = createMutation.isPending || updateMutation.isPending

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={32} className="animate-spin text-primary-600" />
      </div>
    )
  }

  return (
    <div dir="rtl" className="space-y-6 py-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">חיפושים שמורים</h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            {searches.length === 0 ? 'אין עדיין חיפושים שמורים' : `${searches.length} חיפושים שמורים`}
          </p>
        </div>
        <button
          onClick={handleOpenCreate}
          className="flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 font-semibold text-white hover:bg-primary-700"
        >
          <Plus size={20} />
          חיפוש חדש +
        </button>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="rounded-lg border border-error-300 bg-error-50 p-4 text-error-800 dark:border-error-700/30 dark:bg-error-900/20 dark:text-error-300">
          {error}
        </div>
      )}

      {/* Empty State */}
      {searches.length === 0 ? (
        <Card>
          <EmptyState
            icon={Search}
            title="אין חיפושים שמורים"
            description="צור חיפוש שמור כדי לקבל עדכונים על משרות חדשות"
            action={{
              label: 'צור חיפוש ראשון',
              onClick: handleOpenCreate,
            }}
          />
        </Card>
      ) : (
        /* Searches Grid */
        <div className="grid gap-5 sm:grid-cols-1 lg:grid-cols-2">
          {searches.map((search) => (
            <Card key={search.id} hover glass>
              <div className="space-y-4">
                {/* Header */}
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate text-lg font-semibold text-gray-900 dark:text-white">
                        {search.name}
                      </h3>
                      <Badge
                        variant={search.isActive ? 'success' : 'gray'}
                        size="sm"
                      >
                        {search.isActive ? 'פעיל' : 'מושהה'}
                      </Badge>
                    </div>
                  </div>
                </div>

                {/* Keywords */}
                {search.keywords && search.keywords.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {search.keywords.map((keyword, idx) => (
                      <Badge key={idx} variant="primary" size="sm">
                        {keyword}
                      </Badge>
                    ))}
                  </div>
                )}

                {/* Metadata Row 1: Location & Score */}
                <div className="flex flex-wrap gap-4 text-sm text-gray-600 dark:text-gray-400">
                  {search.location && (
                    <div className="flex items-center gap-1">
                      <MapPin size={16} />
                      <span>{search.location}</span>
                    </div>
                  )}
                  {search.minScore > 0 && (
                    <div className="flex items-center gap-1">
                      <Target size={16} />
                      <span>ניקוד מינימום: {search.minScore}</span>
                    </div>
                  )}
                </div>

                {/* Metadata Row 2: Notification & Frequency */}
                {search.notifyEmail && (
                  <div className="flex items-center gap-2 text-sm">
                    <Bell size={16} className="text-warning-600 dark:text-warning-400" />
                    <span className="text-gray-700 dark:text-gray-300">
                      התראות: {getFrequencyLabel(search.notifyFrequency)}
                    </span>
                  </div>
                )}

                {/* Sources */}
                {search.sources && search.sources.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {search.sources.map((source, idx) => {
                      const sourceLabel = SOURCES.find((s) => s.value === source)?.label || source
                      const color = SOURCE_COLORS[source] || 'gray'
                      return (
                        <Badge key={idx} variant={color} size="sm">
                          {sourceLabel}
                        </Badge>
                      )
                    })}
                  </div>
                )}

                {/* Stats */}
                <div className="grid grid-cols-2 gap-3 rounded-lg bg-gray-50/50 p-3 dark:bg-gray-800/50">
                  <div>
                    <div className="text-xs font-semibold text-gray-600 dark:text-gray-400">
                      משרות נמצאו
                    </div>
                    <div className="text-lg font-bold text-gray-900 dark:text-white">
                      {search.totalJobsFound}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-gray-600 dark:text-gray-400">
                      חדשות
                    </div>
                    <div className="text-lg font-bold text-success-600 dark:text-success-400">
                      {search.newJobsSinceNotify}
                    </div>
                  </div>
                </div>

                {/* Last Run */}
                {search.lastRunAt && (
                  <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-500">
                    <Calendar size={14} />
                    <span>הופעל {formatRelativeTime(search.lastRunAt)}</span>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2 pt-2">
                  {/* Toggle Active */}
                  <button
                    onClick={() => toggleMutation.mutate(search.id)}
                    disabled={toggleMutation.isPending}
                    className="flex-1 flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                    title={search.isActive ? 'השהה חיפוש' : 'הפעל חיפוש'}
                  >
                    {toggleMutation.isPending ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : search.isActive ? (
                      <ToggleRight size={16} />
                    ) : (
                      <ToggleLeft size={16} />
                    )}
                  </button>

                  {/* Run Now */}
                  <button
                    onClick={() => runMutation.mutate(search.id)}
                    disabled={runMutation.isPending}
                    className="flex-1 flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                    title="הפעל חיפוש עכשיו"
                  >
                    {runMutation.isPending ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Play size={16} />
                    )}
                  </button>

                  {/* Edit */}
                  <button
                    onClick={() => handleOpenEdit(search)}
                    className="flex-1 flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                    title="ערוך חיפוש"
                  >
                    <Edit size={16} />
                  </button>

                  {/* Delete */}
                  <button
                    onClick={() => {
                      if (window.confirm('אתה בטוח שברצונך למחוק חיפוש זה?')) {
                        deleteMutation.mutate(search.id)
                      }
                    }}
                    disabled={deleteMutation.isPending}
                    className="flex-1 flex items-center justify-center gap-2 rounded-lg border border-error-300 bg-error-50 px-3 py-2 text-sm font-semibold text-error-700 hover:bg-error-100 disabled:opacity-50 dark:border-error-700/30 dark:bg-error-900/20 dark:text-error-300 dark:hover:bg-error-900/40"
                    title="מחק חיפוש"
                  >
                    {deleteMutation.isPending ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Trash2 size={16} />
                    )}
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Modal */}
      <SearchFormModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false)
          setEditingSearch(undefined)
        }}
        onSubmit={handleSubmitForm}
        isLoading={isSubmitting}
        initialData={editingSearch}
      />
    </div>
  )
}

export default SavedSearches
