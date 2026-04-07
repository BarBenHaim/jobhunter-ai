import apiClient from './api'
import { CV, CVTemplate } from '@/types'

export const cvApi = {
  async generate(personaId: string, templateId?: string): Promise<CV> {
    const { data } = await apiClient.post('/cv/generate', {
      personaId,
      templateId,
    })
    return data
  },

  async get(cvId: string): Promise<CV> {
    const { data } = await apiClient.get(`/cv/${cvId}`)
    return data
  },

  async preview(cvId: string): Promise<{ html: string }> {
    const { data } = await apiClient.get(`/cv/${cvId}/preview`)
    return data
  },

  async edit(cvId: string, content: string): Promise<CV> {
    const { data } = await apiClient.put(`/cv/${cvId}`, { content })
    return data
  },

  async atsCheck(cvId: string): Promise<{ score: number; issues: string[] }> {
    const { data } = await apiClient.post(`/cv/${cvId}/ats-check`)
    return data
  },

  async getTemplates(): Promise<CVTemplate[]> {
    const { data } = await apiClient.get('/cv/templates')
    return data
  },

  async saveTemplate(name: string, content: string, category: string): Promise<CVTemplate> {
    const { data } = await apiClient.post('/cv/templates', {
      name,
      content,
      category,
    })
    return data
  },

  async generateStandalone(format: string, variant: string, targetRole?: string): Promise<any> {
    const { data } = await apiClient.post('/cv/generate-standalone', {
      format,
      variant,
      targetRole,
    })
    return data
  },

  async generateATSVersions(): Promise<any> {
    const { data } = await apiClient.post('/cv/generate-ats-versions')
    return data
  },

  async generateForJob(jobId: string): Promise<any> {
    const { data } = await apiClient.post('/cv/generate-for-job', { jobId })
    return data
  },
}
