import { create } from 'zustand'
import { JobFilters } from '@/types'

export interface JobsStore {
  filters: JobFilters
  setFilters: (filters: JobFilters) => void
  updateFilter: (key: keyof JobFilters, value: any) => void

  selectedJobId: string | null
  setSelectedJobId: (id: string | null) => void

  viewMode: 'list' | 'grid' | 'map'
  setViewMode: (mode: 'list' | 'grid' | 'map') => void

  searchQuery: string
  setSearchQuery: (query: string) => void

  isLoading: boolean
  setIsLoading: (loading: boolean) => void
}

export const useJobsStore = create<JobsStore>((set) => ({
  filters: {
    page: 1,
    limit: 20,
  },
  setFilters: (filters) => set({ filters }),
  updateFilter: (key, value) =>
    set((state) => ({
      filters: {
        ...state.filters,
        [key]: value,
        page: 1,
      },
    })),

  selectedJobId: null,
  setSelectedJobId: (id) => set({ selectedJobId: id }),

  viewMode: 'list',
  setViewMode: (mode) => set({ viewMode: mode }),

  searchQuery: '',
  setSearchQuery: (query) => set({ searchQuery: query }),

  isLoading: false,
  setIsLoading: (loading) => set({ isLoading: loading }),
}))
