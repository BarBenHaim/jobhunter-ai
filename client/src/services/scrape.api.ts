import apiClient from './api'
import { ScrapeSource, ScrapeStatus, ScrapeTriggerResult } from '@/types'

export interface SearchConfig {
  sources?: string[]
  minScore?: number
  location?: string
  keywords?: string[]
  experienceLevel?: string
  freeTextQuery?: string  // Natural language search, e.g. "משרת פיתוח מוצר בסטרטאפים"
}

export interface SearchIntent {
  originalQuery: string
  intentSummary: string
  keywords: string[]
  hebrewKeywords: string[]
  scoringBoosts: {
    titlePatterns: string[]
    companyTypes: string[]
    domains: string[]
    mustHaveSkills: string[]
    preferRemote: boolean
    preferHybrid: boolean
  }
}

export const scrapeApi = {
  /**
   * Smart scrape — AI analyzes user profile, generates smart keywords,
   * scrapes with expanded terms, and scores every job locally.
   * Requires authentication.
   * Accepts optional SearchConfig to control sources, min score, location, keywords.
   */
  async smartTriggerScrape(
    config?: SearchConfig
  ): Promise<{ success: boolean; message: string; data: any }> {
    const { data } = await apiClient.post('/scrape/smart-trigger', config || {})
    return data
  },

  async triggerScrape(
    keywords: string[] = ['React', 'Full Stack', 'Node.js', 'TypeScript', 'פיתוח', 'הייטק'],
    location: string = 'Israel'
  ): Promise<{ success: boolean; message: string; data: ScrapeTriggerResult }> {
    const { data } = await apiClient.post('/scrape/trigger', { keywords, location })
    return data
  },

  async scrapeSingle(
    source: string,
    keywords: string[] = ['React', 'Full Stack', 'Node.js', 'TypeScript'],
    location: string = 'Israel'
  ): Promise<{ success: boolean; data: any }> {
    const { data } = await apiClient.post('/scrape/single', { source, keywords, location })
    return data
  },

  async getStatus(): Promise<{ success: boolean; data: ScrapeStatus }> {
    const { data } = await apiClient.get('/scrape/status')
    return data
  },

  async getSources(): Promise<{ success: boolean; data: { sources: ScrapeSource[] } }> {
    const { data } = await apiClient.get('/scrape/sources')
    return data
  },

  async testSource(
    source: string,
    keywords: string = 'software engineer',
    location: string = 'Israel'
  ): Promise<{ success: boolean; data: any }> {
    const { data } = await apiClient.get(`/scrape/test/${source}`, {
      params: { keywords, location },
    })
    return data
  },

  async getSearchHistory(): Promise<{ success: boolean; data: SearchHistoryEntry[] }> {
    const { data } = await apiClient.get('/scrape/search-history')
    return data
  },

  /**
   * Interpret a free-text search query without searching.
   * Returns the parsed intent — useful for showing a preview in the UI.
   */
  async interpretSearch(query: string): Promise<{ success: boolean; data: SearchIntent }> {
    const { data } = await apiClient.post('/scrape/interpret-search', { query })
    return data
  },
}

export interface SearchHistoryEntry {
  id: string
  timestamp: string
  config: {
    sources?: string[]
    minScore?: number
    location?: string
    keywords?: string[]
    experienceLevel?: string
  }
  results: {
    totalScraped: number
    totalSaved: number
    totalFiltered: number
    duplicates: number
    avgScore: number
    jobIds: string[]
  }
}

