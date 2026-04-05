import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  TrendingUp,
  Zap,
  CheckCircle,
  Calendar,
  RotateCcw,
  Activity,
  AlertCircle,
  CheckCheck,
  MessageSquare,
  Clock,
} from 'lucide-react'
import { Card } from '@/components/common/Card'
import { Badge } from '@/components/common/Badge'
import { EmptyState } from '@/components/common/EmptyState'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

interface StatsData {
  totalJobsFound: number
  applicationsThisWeek: number
  responseRate: number
  interviewsScheduled: number
}

interface ActivityEvent {
  id: string
  type: 'job_found' | 'cv_generated' | 'application_sent' | 'response_received'
  title: string
  description: string
  timestamp: Date
  jobTitle?: string
  company?: string
}

interface FollowUp {
  id: string
  jobTitle: string
  company: string
  dueDate: Date
  type: 'email' | 'call' | 'linkedin'
}

interface SourceHealth {
  name: string
  status: 'healthy' | 'degraded' | 'down'
  lastJobsFound: number
  lastCheckedAt: Date
}

const Dashboard = () => {
  const [timeRange, setTimeRange] = useState('week')

  // Fetch stats
  const { data: statsData } = useQuery<StatsData>({
    queryKey: ['dashboard-stats'],
    queryFn: async () => ({
      totalJobsFound: 1254,
      applicationsThisWeek: 12,
      responseRate: 28,
      interviewsScheduled: 3,
    }),
  })

  // Fetch activity timeline
  const { data: activityData } = useQuery<ActivityEvent[]>({
    queryKey: ['dashboard-activity'],
    queryFn: async () => [
      {
        id: '1',
        type: 'job_found',
        title: 'New Jobs Found',
        description: '8 new jobs matching your criteria',
        timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
        jobTitle: 'Senior Engineer',
      },
      {
        id: '2',
        type: 'cv_generated',
        title: 'CV Generated',
        description: 'Tailored CV created for Frontend Developer persona',
        timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000),
      },
      {
        id: '3',
        type: 'application_sent',
        title: 'Application Submitted',
        description: 'Applied to React Engineer position',
        timestamp: new Date(Date.now() - 6 * 60 * 60 * 1000),
        jobTitle: 'React Engineer',
        company: 'TechCorp Inc',
      },
      {
        id: '4',
        type: 'response_received',
        title: 'Response Received',
        description: 'Positive response from company',
        timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000),
        jobTitle: 'Full Stack Developer',
        company: 'StartupXYZ',
      },
    ],
  })

  // Fetch follow-ups
  const { data: followUpData } = useQuery<FollowUp[]>({
    queryKey: ['dashboard-followups'],
    queryFn: async () => [
      {
        id: '1',
        jobTitle: 'Senior React Developer',
        company: 'Tech Giants Inc',
        dueDate: new Date(Date.now() + 2 * 60 * 60 * 1000),
        type: 'email',
      },
      {
        id: '2',
        jobTitle: 'Full Stack Engineer',
        company: 'StartupXYZ',
        dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
        type: 'linkedin',
      },
    ],
  })

  // Fetch source health
  const { data: sourceHealthData } = useQuery<SourceHealth[]>({
    queryKey: ['source-health'],
    queryFn: async () => [
      { name: 'LinkedIn', status: 'healthy', lastJobsFound: 45, lastCheckedAt: new Date() },
      { name: 'Indeed', status: 'healthy', lastJobsFound: 32, lastCheckedAt: new Date() },
      { name: 'Glassdoor', status: 'degraded', lastJobsFound: 18, lastCheckedAt: new Date(Date.now() - 30 * 60 * 1000) },
      { name: 'Built In', status: 'healthy', lastJobsFound: 28, lastCheckedAt: new Date() },
      { name: 'TechCrunch', status: 'down', lastJobsFound: 0, lastCheckedAt: new Date(Date.now() - 2 * 60 * 60 * 1000) },
    ],
  })

  // Fetch trend data for chart
  const { data: trendData } = useQuery({
    queryKey: ['dashboard-trends', timeRange],
    queryFn: async () => [
      { date: 'Mon', found: 45, applied: 8, responses: 2 },
      { date: 'Tue', found: 52, applied: 12, responses: 3 },
      { date: 'Wed', found: 38, applied: 5, responses: 1 },
      { date: 'Thu', found: 61, applied: 15, responses: 4 },
      { date: 'Fri', found: 48, applied: 10, responses: 2 },
      { date: 'Sat', found: 32, applied: 6, responses: 1 },
      { date: 'Sun', found: 28, applied: 3, responses: 0 },
    ],
  })

  const getActivityIcon = (type: ActivityEvent['type']) => {
    switch (type) {
      case 'job_found':
        return <TrendingUp size={18} className="text-blue-600 dark:text-blue-400" />
      case 'cv_generated':
        return <CheckCircle size={18} className="text-green-600 dark:text-green-400" />
      case 'application_sent':
        return <Zap size={18} className="text-yellow-600 dark:text-yellow-400" />
      case 'response_received':
        return <MessageSquare size={18} className="text-purple-600 dark:text-purple-400" />
    }
  }

  const getStatusColor = (status: SourceHealth['status']) => {
    switch (status) {
      case 'healthy':
        return 'text-green-600 dark:text-green-400'
      case 'degraded':
        return 'text-yellow-600 dark:text-yellow-400'
      case 'down':
        return 'text-red-600 dark:text-red-400'
    }
  }

  const getStatusDot = (status: SourceHealth['status']) => {
    switch (status) {
      case 'healthy':
        return 'bg-green-500'
      case 'degraded':
        return 'bg-yellow-500'
      case 'down':
        return 'bg-red-500'
    }
  }

  const formatTime = (date: Date) => {
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const hours = Math.floor(diff / (1000 * 60 * 60))
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))

    if (hours < 1) return 'Just now'
    if (hours < 24) return `${hours}h ago`
    if (days < 7) return `${days}d ago`
    return date.toLocaleDateString()
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Jobs Found</p>
              <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">{statsData?.totalJobsFound || 0}</p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-500">+24 this week</p>
            </div>
            <div className="rounded-lg bg-blue-100 p-3 dark:bg-blue-900">
              <TrendingUp className="text-blue-600 dark:text-blue-400" size={24} />
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Applications This Week</p>
              <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">{statsData?.applicationsThisWeek || 0}</p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-500">Goal: 20</p>
            </div>
            <div className="rounded-lg bg-purple-100 p-3 dark:bg-purple-900">
              <Zap className="text-purple-600 dark:text-purple-400" size={24} />
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Response Rate</p>
              <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">{statsData?.responseRate || 0}%</p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-500">+4% this week</p>
            </div>
            <div className="rounded-lg bg-green-100 p-3 dark:bg-green-900">
              <CheckCheck className="text-green-600 dark:text-green-400" size={24} />
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Interviews Scheduled</p>
              <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">{statsData?.interviewsScheduled || 0}</p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-500">2 this week</p>
            </div>
            <div className="rounded-lg bg-orange-100 p-3 dark:bg-orange-900">
              <Calendar className="text-orange-600 dark:text-orange-400" size={24} />
            </div>
          </div>
        </Card>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Activity Timeline & Trends */}
        <div className="lg:col-span-2 space-y-6">
          {/* Activity Timeline */}
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Recent Activity</h2>
              <button className="text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400">View all</button>
            </div>

            {activityData && activityData.length > 0 ? (
              <div className="space-y-4">
                {activityData.map((event) => (
                  <div key={event.id} className="flex gap-4 pb-4 border-b border-gray-200 dark:border-gray-800 last:border-0 last:pb-0">
                    <div className="flex-shrink-0 pt-1">{getActivityIcon(event.type)}</div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 dark:text-white">{event.title}</p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">{event.description}</p>
                      {event.jobTitle && (
                        <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                          {event.jobTitle} {event.company && `at ${event.company}`}
                        </p>
                      )}
                      <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">{formatTime(event.timestamp)}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState icon={Activity} title="No activity yet" description="Your actions will appear here" />
            )}
          </Card>

          {/* Trends Chart */}
          <Card>
            <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">Weekly Trends</h2>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={trendData || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(229, 231, 235)" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip contentStyle={{ backgroundColor: 'rgb(31, 41, 55)', border: 'none', borderRadius: '8px', color: 'white' }} />
                <Legend />
                <Bar dataKey="found" fill="rgb(59, 130, 246)" name="Jobs Found" />
                <Bar dataKey="applied" fill="rgb(34, 197, 94)" name="Applications" />
                <Bar dataKey="responses" fill="rgb(168, 85, 247)" name="Responses" />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </div>

        {/* Right Sidebar */}
        <div className="space-y-6">
          {/* Quick Actions */}
          <Card>
            <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">Quick Actions</h2>
            <div className="space-y-2">
              <button className="w-full rounded-lg bg-primary-600 px-4 py-2 text-white hover:bg-primary-700 transition-colors font-medium">
                Trigger Scrape
              </button>
              <button className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 hover:bg-gray-50 transition-colors dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700 font-medium">
                Score Jobs
              </button>
              <button className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 hover:bg-gray-50 transition-colors dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700 font-medium">
                View Review Queue
              </button>
            </div>
          </Card>

          {/* Upcoming Actions */}
          <Card>
            <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">Follow-ups Due</h2>
            {followUpData && followUpData.length > 0 ? (
              <div className="space-y-3">
                {followUpData.map((followUp) => (
                  <div key={followUp.id} className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 dark:border-yellow-900 dark:bg-yellow-900/20">
                    <div className="flex items-start gap-2">
                      <Clock size={16} className="mt-1 text-yellow-600 dark:text-yellow-500 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="font-medium text-sm text-gray-900 dark:text-white">{followUp.jobTitle}</p>
                        <p className="text-xs text-gray-600 dark:text-gray-400">{followUp.company}</p>
                        <p className="text-xs text-yellow-700 dark:text-yellow-200 mt-1">{formatTime(followUp.dueDate)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-600 dark:text-gray-400">No follow-ups due today</p>
            )}
          </Card>

          {/* Source Health */}
          <Card>
            <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">Source Health</h2>
            <div className="space-y-3">
              {sourceHealthData &&
                sourceHealthData.map((source) => (
                  <div key={source.name} className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${getStatusDot(source.status)}`} />
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">{source.name}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-500">{source.lastJobsFound} jobs</p>
                      </div>
                    </div>
                    <span className={`text-xs font-medium ${getStatusColor(source.status)}`}>
                      {source.status === 'healthy' && 'OK'}
                      {source.status === 'degraded' && 'Slow'}
                      {source.status === 'down' && 'Down'}
                    </span>
                  </div>
                ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}

export default Dashboard
