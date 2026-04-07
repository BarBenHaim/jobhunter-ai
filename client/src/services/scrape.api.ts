import apiClient from './api'
import { ScrapeSource, ScrapeStatus, ScrapeTriggerResult } from '@/types'

export const scrapeApi = {
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
}

