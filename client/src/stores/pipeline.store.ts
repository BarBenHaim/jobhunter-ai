import { create } from 'zustand'
import { AppStatus } from '@/types'

export interface PipelineStore {
  selectedStatuses: AppStatus[]
  toggleStatus: (status: AppStatus) => void
  setSelectedStatuses: (statuses: AppStatus[]) => void

  draggedApplicationId: string | null
  setDraggedApplicationId: (id: string | null) => void

  selectedPersonaId: string | null
  setSelectedPersonaId: (id: string | null) => void

  viewMode: 'kanban' | 'timeline' | 'table'
  setViewMode: (mode: 'kanban' | 'timeline' | 'table') => void

  sortBy: 'newest' | 'oldest' | 'status'
  setSortBy: (sort: 'newest' | 'oldest' | 'status') => void
}

export const usePipelineStore = create<PipelineStore>((set) => ({
  selectedStatuses: Object.values(AppStatus),
  toggleStatus: (status) =>
    set((state) => ({
      selectedStatuses: state.selectedStatuses.includes(status)
        ? state.selectedStatuses.filter((s) => s !== status)
        : [...state.selectedStatuses, status],
    })),
  setSelectedStatuses: (statuses) => set({ selectedStatuses: statuses }),

  draggedApplicationId: null,
  setDraggedApplicationId: (id) => set({ draggedApplicationId: id }),

  selectedPersonaId: null,
  setSelectedPersonaId: (id) => set({ selectedPersonaId: id }),

  viewMode: 'kanban',
  setViewMode: (mode) => set({ viewMode: mode }),

  sortBy: 'newest',
  setSortBy: (sort) => set({ sortBy: sort }),
}))
