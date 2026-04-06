import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  TrendingUp,
  Zap,
  CheckCircle,
  Calendar,
  Activity,
  CheckCheck,
  MessageSquare,
  Clock,
  ArrowUpRight,
  Sparkles,
} from 'lucide-react'
import { Card } from '@/components/common/Card'
import { EmptyState } from '@/components/common/EmptyState'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

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

const statCards = [
  {
    key: 'totalJobsFound',
    label: 'Total Jobs Found',
    sub: '+24 this week',
    icon: TrendingUp,
    gradient: 'from-blue-500 to-cyan-400',
    shadowColor: 'shadow-blue-500/20',
    bgLight: 'bg-blue-50',
    bgDark: 'dark:bg-blue-900/20',
  },
  {
    key: 'applicationsThisWeek',
    label: 'Applications This Week',
    sub: 'Goal: 20',
    icon: Zap,
    gradient: 'from-purple-500 to-pink-400',
    shadowColor: 'shadow-purple-500/20',
    bgLight: 'bg-purple-50',
    bgDark: 'dark:bg-purple-900/20',
  },
  {
    key: 'responseRate',
    label: 'Response Rate',
    sub: '+4% this week',
    icon: CheckCheck,
    gradient: 'from-emerald-500 to-teal-400',
    shadowColor: 'shadow-emerald-500/20',
    bgLight: 'bg-emerald-50',
    bgDark: 'dark:bg-emerald-900/20',
    suffix: '%',
  },
  {
    key: 'interviewsScheduled',
    label: 'Interviews Scheduled',
    sub: '2 this week',
    icon: Calendar,
    gradient: 'from-orange-500 to-amber-400',
    shadowColor: 'shadow-orange-500/20',
    bgLight: 'bg-orange-50',
    bgDark: 'dark:bg-orange-900/20',
  },
]

const Dashboard = () => {
  const [timeRange, setTimeRange] = useState('week')

  const { data: statsData } = useQuery<StatsData>({
    queryKey: ['dashboard-stats'],
    queryFn: async () => ({
      totalJobsFound: 1254,
      applicationsThisWeek: 12,
      responseRate: 28,
      interviewsScheduled: 3,
    }),
  })

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
        return <div className="rounded-xl bg-blue-100 p-2 dark:bg-blue-900/30"><TrendingUp size={16} className="text-blue-600 dark:text-blue-400" /></div>
      case 'cv_generated':
        return <div className="rounded-xl bg-emerald-100 p-2 dark:bg-emerald-900/30"><CheckCircle size={16} className="text-emerald-600 dark:text-emerald-400" /></div>
      case 'application_sent':
        return <div className="rounded-xl bg-amber-100 p-2 dark:bg-amber-900/30"><Zap size={16} className="text-amber-600 dark:text-amber-400" /></div>
      case 'response_received':
        return <div className="rounded-xl bg-purple-100 p-2 dark:bg-purple-900/30"><MessageSquare size={16} className="text-purple-600 dark:text-purple-400" /></div>
    }
  }

  const getStatusColor = (status: SourceHealth['status']) => {
    switch (status) {
      case 'healthy': return 'text-emerald-600 dark:text-emerald-400'
      case 'degraded': return 'text-amber-600 dark:text-amber-400'
      case 'down': return 'text-red-500 dark:text-red-400'
    }
  }

  const getStatusDot = (status: SourceHealth['status']) => {
    switch (status) {
      case 'healthy': return 'bg-emerald-500'
      case 'degraded': return 'bg-amber-500'
      case 'down': return 'bg-red-500'
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
      {/* Welcome header */}
      <div className="animate-slide-up">
        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-1">
          <Sparkles size={14} className="text-primary-500" />
          <span>AI-powered job hunting</span>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card, index) => {
          const Icon = card.icon
          const value = statsData?.[card.key as keyof StatsData] || 0
          return (
            <Card key={card.key} hover className={`animate-slide-up stagger-${index + 1}`}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{card.label}</p>
                  <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-white tracking-tight">
                    {value}{card.suffix || ''}
                  </p>
                  <div className="mt-1.5 flex items-center gap-1">
                    <ArrowUpRight size={12} className="text-emerald-500" />
                    <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">{card.sub}</p>
                  </div>
                </div>
                <div className={`rounded-2xl bg-gradient-to-br ${card.gradient} p-3 shadow-lg ${card.shadowColor}`}>
                  <Icon className="text-white" size={22} />
                </div>
              </div>
            </Card>
          )
        })}
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Activity Timeline & Trends */}
        <div className="lg:col-span-2 space-y-6">
          {/* Activity Timeline */}
          <Card className="animate-slide-up stagger-5">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Recent Activity</h2>
              <button className="text-sm font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 transition-colors">
                View all
              </button>
            </div>

            {activityData && activityData.length > 0 ? (
              <div className="space-y-4">
                {activityData.map((event, i) => (
                  <div
                    key={event.id}
                    className={`flex gap-4 pb-4 border-b border-gray-100 dark:border-gray-800/50 last:border-0 last:pb-0 group`}
                  >
                    <div className="flex-shrink-0 transition-transform duration-200 group-hover:scale-110">
                      {getActivityIcon(event.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 dark:text-white text-sm">{event.title}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{event.description}</p>
                      {event.jobTitle && (
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                          {event.jobTitle} {event.company && `at ${event.company}`}
                        </p>
                      )}
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{formatTime(event.timestamp)}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState icon={Activity} title="No activity yet" description="Your actions will appear here" />
            )}
          </Card>

          {/* Trends Chart */}
          <Card className="animate-slide-up stagger-6">
            <h2 className="mb-5 text-lg font-semibold text-gray-900 dark:text-white">Weekly Trends</h2>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={trendData || []} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(156, 163, 175, 0.15)" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'rgba(17, 24, 39, 0.95)',
                    border: 'none',
                    borderRadius: '12px',
                    color: 'white',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
                    backdropFilter: 'blur(8px)',
                    padding: '12px 16px',
                  }}
                />
                <Legend
                  wrapperStyle={{ fontSize: '12px', paddingTop: '16px' }}
                />
                <Bar dataKey="found" fill="url(#blueGradient)" name="Jobs Found" radius={[6, 6, 0, 0]} />
                <Bar dataKey="applied" fill="url(#greenGradient)" name="Applications" radius={[6, 6, 0, 0]} />
                <Bar dataKey="responses" fill="url(#purpleGradient)" name="Responses" radius={[6, 6, 0, 0]} />
                <defs>
                  <linearGradient id="blueGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366f1" />
                    <stop offset="100%" stopColor="#818cf8" />
                  </linearGradient>
                  <linearGradient id="greenGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" />
                    <stop offset="100%" stopColor="#34d399" />
                  </linearGradient>
                  <linearGradient id="purpleGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#8b5cf6" />
                    <stop offset="100%" stopColor="#a78bfa" />
                  </linearGradient>
                </defs>
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </div>

        {/* Right Sidebar */}
        <div className="space-y-6">
          {/* Quick Actions */}
          <Card className="animate-slide-up stagger-3">
            <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">Quick Actions</h2>
            <div className="space-y-2.5">
              <button className="w-full rounded-xl bg-gradient-to-r from-primary-600 to-primary-500 px-4 py-3 text-white font-semibold shadow-md shadow-primary-500/20 hover:shadow-lg hover:shadow-primary-500/30 hover:from-primary-500 hover:to-primary-400 transition-all duration-200 active:scale-[0.98]">
                Trigger Scrape
              </button>
              <button className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 font-semibold text-gray-700 shadow-sm hover:bg-gray-50 hover:border-gray-300 hover:shadow transition-all duration-200 active:scale-[0.98] dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-200 dark:hover:bg-gray-800 dark:hover:border-gray-600">
                Score Jobs
              </button>
              <button className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 font-semibold text-gray-700 shadow-sm hover:bg-gray-50 hover:border-gray-300 hover:shadow transition-all duration-200 active:scale-[0.98] dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-200 dark:hover:bg-gray-800 dark:hover:border-gray-600">
                View Review Queue
              </button>
            </div>
          </Card>

          {/* Upcoming Actions */}
          <Card className="animate-slide-up stagger-4">
            <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">Follow-ups Due</h2>
            {followUpData && followUpData.length > 0 ? (
              <div className="space-y-3">
                {followUpData.map((followUp) => (
                  <div key={followUp.id} className="group rounded-xl border border-amber-200/60 bg-gradient-to-r from-amber-50 to-orange-50 p-3.5 transition-all duration-200 hover:shadow-sm hover:border-amber-300/60 dark:border-amber-800/30 dark:from-amber-900/10 dark:to-orange-900/10 dark:hover:border-amber-700/40">
                    <div className="flex items-start gap-2.5">
                      <div className="rounded-lg bg-amber-100 p-1.5 dark:bg-amber-900/30">
                        <Clock size={14} className="text-amber-600 dark:text-amber-400" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-sm text-gray-900 dark:text-white">{followUp.jobTitle}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{followUp.company}</p>
                        <p className="text-xs font-medium text-amber-600 dark:text-amber-300 mt-1">{formatTime(followUp.dueDate)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">No follow-ups due today</p>
            )}
          </Card>

          {/* Source Health */}
          <Card className="animate-slide-up stagger-5">
            <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">Source Health</h2>
            <div className="space-y-2">
              {sourceHealthData &&
                sourceHealthData.map((source) => (
                  <div key={source.name} className="flex items-center justify-between p-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors duration-200 group">
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <div className={`w-2.5 h-2.5 rounded-full ${getStatusDot(source.status)}`} />
                        {source.status === 'healthy' && (
                          <div className={`absolute inset-0 w-2.5 h-2.5 rounded-full ${getStatusDot(source.status)} animate-ping opacity-30`} />
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">{source.name}</p>
                        <p className="text-xs text-gray-400 dark:text-gray-500">{source.lastJobsFound} jobs</p>
                      </div>
                    </div>
                    <span className={`text-xs font-semibold ${getStatusColor(source.status)}`}>
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
