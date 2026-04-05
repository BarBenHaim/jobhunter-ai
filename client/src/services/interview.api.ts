import apiClient from './api'

export const interviewApi = {
  async generatePrep(
    jobId: string,
    personaId: string
  ): Promise<{
    company: string
    role: string
    keyTopics: string[]
    sampleQuestions: string[]
    researchPoints: string[]
  }> {
    const { data } = await apiClient.post('/interviews/generate-prep', {
      jobId,
      personaId,
    })
    return data
  },

  async getPrep(prepId: string): Promise<any> {
    const { data } = await apiClient.get(`/interviews/prep/${prepId}`)
    return data
  },

  async saveNotes(jobId: string, notes: string, rating?: number): Promise<void> {
    await apiClient.post('/interviews/notes', {
      jobId,
      notes,
      rating,
    })
  },

  async getInterviewSchedule(): Promise<
    Array<{
      jobId: string
      company: string
      role: string
      scheduledAt: Date
      type: string
    }>
  > {
    const { data } = await apiClient.get('/interviews/schedule')
    return data
  },
}
