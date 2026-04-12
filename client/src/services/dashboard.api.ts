import apiClient from './api'

export interface RoleInsight {
  id: string
  name: string
  nameHe: string
  icon: string
  profileMatch: number
  jobsFound: number
  avgJobScore: number
  topJob: { title: string; company: string; score: number } | null
}

export interface SalaryInsight {
  estimatedRange: { min: number; max: number; currency: string }
  experienceLevel: 'junior' | 'mid' | 'senior'
  basedOnRole: string
  basedOnRoleHe: string
  fromJobData: { count: number; min: number; max: number } | null
}

export interface ProfileStrength {
  score: number
  items: { label: string; done: boolean }[]
}

export interface DashboardInsights {
  topRoles: RoleInsight[]
  salaryInsight: SalaryInsight
  profileStrength: ProfileStrength
  scoreDistribution: { high: number; medium: number; low: number }
  topMatches: { jobId: string; title: string; company: string; score: number; skillMatch: number }[]
  totalScoredJobs: number
  experienceLevel: string
}

export const dashboardApi = {
  async getInsights(): Promise<DashboardInsights> {
    const { data } = await apiClient.get('/dashboard/insights')
    return data?.data || data
  },
}
