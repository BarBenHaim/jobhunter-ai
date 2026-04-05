import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  TrendingUp,
  BarChart3,
  PieChart as PieChartIcon,
  Calendar,
  Users,
  Target,
} from 'lucide-react'
import { Card } from '@/components/common/Card'
import {
  FunnelChart,
  Funnel,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
} from 'recharts'

interface FunnelData {
  stage: string
  count: number
  percentage: number
}

interface SourcePerformanceData {
  source: string
  found: number
  applied: number
  responses: number
  interviews: number
  offers: number
  conversionRate: number
}

interface KeywordData {
  keyword: string
  used: number
  responseRate: number
}

interface PersonaROIData {
  persona: string
  applications: number
  interviews: number
  offers: number
}

const Analytics = () => {
  const [dateRange, setDateRange] = useState('month')

  // Fetch funnel data
  const { data: funnelData } = useQuery<FunnelData[]>({
    queryKey: ['analytics-funnel'],
    queryFn: async () => [
      { stage: 'Found', count: 524, percentage: 100 },
      { stage: 'Scored', count: 412, percentage: 79 },
      { stage: 'Applied', count: 126, percentage: 24 },
      { stage: 'Responded', count: 34, percentage: 6.5 },
      { stage: 'Interviewed', count: 8, percentage: 1.5 },
      { stage: 'Offered', count: 2, percentage: 0.4 },
    ],
  })

  // Fetch score distribution
  const { data: scoreDistribution } = useQuery({
    queryKey: ['analytics-score-distribution'],
    queryFn: async () => [
      { range: '0-20', count: 8 },
      { range: '20-40', count: 24 },
      { range: '40-60', count: 68 },
      { range: '60-80', count: 156 },
      { range: '80-100', count: 156 },
    ],
  })

  // Fetch response time analysis
  const { data: responseTimeData } = useQuery({
    queryKey: ['analytics-response-time', dateRange],
    queryFn: async () => [
      { source: 'LinkedIn', avgDays: 2.4, count: 28 },
      { source: 'Indeed', avgDays: 4.1, count: 18 },
      { source: 'Built In', avgDays: 3.2, count: 12 },
      { source: 'Glassdoor', avgDays: 5.8, count: 8 },
      { source: 'AngelList', avgDays: 3.5, count: 6 },
    ],
  })

  // Fetch keyword analysis
  const { data: keywordData } = useQuery({
    queryKey: ['analytics-keywords'],
    queryFn: async () => [
      { keyword: 'React', used: 24, responseRate: 35 },
      { keyword: 'TypeScript', used: 18, responseRate: 42 },
      { keyword: 'Node.js', used: 16, responseRate: 28 },
      { keyword: 'AWS', used: 12, responseRate: 25 },
      { keyword: 'Docker', used: 10, responseRate: 32 },
      { keyword: 'PostgreSQL', used: 9, responseRate: 22 },
      { keyword: 'GraphQL', used: 7, responseRate: 38 },
      { keyword: 'Next.js', used: 8, responseRate: 45 },
    ],
  })

  // Fetch trending skills
  const { data: trendingSkills } = useQuery({
    queryKey: ['analytics-trends', dateRange],
    queryFn: async () => [
      { skill: 'AI/LLM', demand: 45 },
      { skill: 'React', demand: 82 },
      { skill: 'TypeScript', demand: 71 },
      { skill: 'AWS', demand: 68 },
      { skill: 'Kubernetes', demand: 52 },
      { skill: 'GraphQL', demand: 38 },
      { skill: 'Rust', demand: 25 },
      { skill: 'Go', demand: 42 },
    ],
  })

  // Fetch persona ROI
  const { data: personaROI } = useQuery({
    queryKey: ['analytics-persona-roi'],
    queryFn: async () => [
      { persona: 'Frontend Pro', applications: 34, interviews: 6, offers: 1 },
      { persona: 'Full Stack', applications: 28, interviews: 4, offers: 1 },
      { persona: 'Backend Spec', applications: 22, interviews: 5, offers: 0 },
      { persona: 'DevOps', applications: 12, interviews: 1, offers: 0 },
      { persona: 'Product', applications: 8, interviews: 0, offers: 0 },
    ],
  })

  // Fetch source performance
  const { data: sourcePerformance } = useQuery<SourcePerformanceData[]>({
    queryKey: ['analytics-source-performance'],
    queryFn: async () => [
      { source: 'LinkedIn', found: 145, applied: 38, responses: 12, interviews: 3, offers: 1, conversionRate: 8.3 },
      { source: 'Indeed', found: 128, applied: 35, responses: 8, interviews: 2, offers: 1, conversionRate: 6.3 },
      { source: 'Built In', found: 92, applied: 28, responses: 9, interviews: 2, offers: 0, conversionRate: 9.8 },
      { source: 'Glassdoor', found: 78, applied: 15, responses: 3, interviews: 1, offers: 0, conversionRate: 3.8 },
      { source: 'AngelList', found: 56, applied: 10, responses: 2, interviews: 0, offers: 0, conversionRate: 3.6 },
    ],
  })

  const COLORS = ['rgb(59, 130, 246)', 'rgb(34, 197, 94)', 'rgb(249, 115, 22)', 'rgb(168, 85, 247)', 'rgb(239, 68, 68)', 'rgb(14, 165, 233)']

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Analytics Dashboard</h1>
        <select
          value={dateRange}
          onChange={(e) => setDateRange(e.target.value)}
          className="px-4 py-2 rounded-lg border border-gray-300 bg-white dark:border-gray-700 dark:bg-gray-800"
        >
          <option value="week">Last 7 days</option>
          <option value="month">Last 30 days</option>
          <option value="quarter">Last 3 months</option>
          <option value="year">Last year</option>
        </select>
      </div>

      {/* Conversion Funnel */}
      <Card>
        <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">Conversion Funnel</h2>
        {funnelData && funnelData.length > 0 && (
          <ResponsiveContainer width="100%" height={300}>
            <FunnelChart
              data={funnelData}
              margin={{ top: 20, right: 160, bottom: 20, left: 160 }}
            >
              <Tooltip
                contentStyle={{ backgroundColor: 'rgb(31, 41, 55)', border: 'none', borderRadius: '8px', color: 'white' }}
                formatter={(value) => `${value}`}
              />
              <Funnel
                dataKey="count"
                data={funnelData}
                isAnimationActive
              >
                {funnelData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Funnel>
            </FunnelChart>
          </ResponsiveContainer>
        )}

        {/* Funnel Stats */}
        <div className="mt-6 grid grid-cols-2 md:grid-cols-6 gap-2">
          {funnelData &&
            funnelData.map((stage) => (
              <div key={stage.stage} className="text-center p-2 rounded-lg bg-gray-50 dark:bg-gray-800">
                <p className="text-xs text-gray-600 dark:text-gray-400">{stage.stage}</p>
                <p className="text-lg font-bold text-gray-900 dark:text-white">{stage.count}</p>
                <p className="text-xs text-gray-500">{stage.percentage.toFixed(1)}%</p>
              </div>
            ))}
        </div>
      </Card>

      {/* Score Distribution & Response Time */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Score Distribution */}
        <Card>
          <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">Score Distribution</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={scoreDistribution || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgb(229, 231, 235)" />
              <XAxis dataKey="range" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip contentStyle={{ backgroundColor: 'rgb(31, 41, 55)', border: 'none', borderRadius: '8px', color: 'white' }} />
              <Bar dataKey="count" fill="rgb(59, 130, 246)" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {/* Response Time Analysis */}
        <Card>
          <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">Response Time by Source</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={responseTimeData || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgb(229, 231, 235)" />
              <XAxis dataKey="source" tick={{ fontSize: 12 }} />
              <YAxis yAxisId="left" tick={{ fontSize: 12 }} label={{ value: 'Days', angle: -90, position: 'insideLeft' }} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} label={{ value: 'Count', angle: 90, position: 'insideRight' }} />
              <Tooltip contentStyle={{ backgroundColor: 'rgb(31, 41, 55)', border: 'none', borderRadius: '8px', color: 'white' }} />
              <Legend />
              <Bar yAxisId="left" dataKey="avgDays" fill="rgb(34, 197, 94)" name="Avg Days to Response" />
              <Bar yAxisId="right" dataKey="count" fill="rgb(249, 115, 22)" name="Applications" />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Keyword Effectiveness */}
      <Card>
        <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">Keyword Effectiveness</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 dark:border-gray-800">
              <tr>
                <th className="text-left py-2 px-4 font-semibold text-gray-900 dark:text-white">Keyword</th>
                <th className="text-left py-2 px-4 font-semibold text-gray-900 dark:text-white">Times Used</th>
                <th className="text-left py-2 px-4 font-semibold text-gray-900 dark:text-white">Response Rate</th>
                <th className="text-left py-2 px-4 font-semibold text-gray-900 dark:text-white">Trend</th>
              </tr>
            </thead>
            <tbody>
              {keywordData &&
                keywordData.map((item) => (
                  <tr key={item.keyword} className="border-b border-gray-200 dark:border-gray-800">
                    <td className="py-3 px-4 text-gray-900 dark:text-white font-medium">{item.keyword}</td>
                    <td className="py-3 px-4 text-gray-600 dark:text-gray-400">{item.used}</td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary-600"
                            style={{ width: `${item.responseRate}%` }}
                          />
                        </div>
                        <span className="text-gray-900 dark:text-white font-medium">{item.responseRate}%</span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      {item.responseRate > 35 ? (
                        <span className="text-green-600 dark:text-green-400">↑ Hot</span>
                      ) : item.responseRate > 25 ? (
                        <span className="text-yellow-600 dark:text-yellow-400">→ Stable</span>
                      ) : (
                        <span className="text-red-600 dark:text-red-400">↓ Cold</span>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Market Trends & Persona ROI */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Market Trends */}
        <Card>
          <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">Most Demanded Skills</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart
              data={trendingSkills || []}
              layout="vertical"
              margin={{ top: 5, right: 30, left: 100, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="rgb(229, 231, 235)" />
              <XAxis type="number" tick={{ fontSize: 12 }} />
              <YAxis dataKey="skill" type="category" tick={{ fontSize: 12 }} width={90} />
              <Tooltip contentStyle={{ backgroundColor: 'rgb(31, 41, 55)', border: 'none', borderRadius: '8px', color: 'white' }} />
              <Bar dataKey="demand" fill="rgb(168, 85, 247)" radius={[0, 8, 8, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {/* Persona ROI */}
        <Card>
          <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">Persona ROI Comparison</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={personaROI || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgb(229, 231, 235)" />
              <XAxis dataKey="persona" tick={{ fontSize: 12 }} angle={-45} textAnchor="end" height={80} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip contentStyle={{ backgroundColor: 'rgb(31, 41, 55)', border: 'none', borderRadius: '8px', color: 'white' }} />
              <Legend />
              <Bar dataKey="interviews" fill="rgb(34, 197, 94)" name="Interviews" />
              <Bar dataKey="offers" fill="rgb(34, 197, 94)" name="Offers" />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Source Performance Table */}
      <Card>
        <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">Source Performance</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 dark:border-gray-800">
              <tr>
                <th className="text-left py-2 px-4 font-semibold text-gray-900 dark:text-white">Source</th>
                <th className="text-left py-2 px-4 font-semibold text-gray-900 dark:text-white">Found</th>
                <th className="text-left py-2 px-4 font-semibold text-gray-900 dark:text-white">Applied</th>
                <th className="text-left py-2 px-4 font-semibold text-gray-900 dark:text-white">Responses</th>
                <th className="text-left py-2 px-4 font-semibold text-gray-900 dark:text-white">Interviews</th>
                <th className="text-left py-2 px-4 font-semibold text-gray-900 dark:text-white">Offers</th>
                <th className="text-left py-2 px-4 font-semibold text-gray-900 dark:text-white">Conversion</th>
              </tr>
            </thead>
            <tbody>
              {sourcePerformance &&
                sourcePerformance.map((source) => (
                  <tr key={source.source} className="border-b border-gray-200 dark:border-gray-800">
                    <td className="py-3 px-4 text-gray-900 dark:text-white font-medium">{source.source}</td>
                    <td className="py-3 px-4 text-gray-600 dark:text-gray-400">{source.found}</td>
                    <td className="py-3 px-4 text-gray-600 dark:text-gray-400">{source.applied}</td>
                    <td className="py-3 px-4 text-gray-600 dark:text-gray-400">{source.responses}</td>
                    <td className="py-3 px-4 text-gray-600 dark:text-gray-400">{source.interviews}</td>
                    <td className="py-3 px-4 text-gray-600 dark:text-gray-400">{source.offers}</td>
                    <td className="py-3 px-4">
                      <span className="inline-block px-2 py-1 rounded-lg bg-primary-100 text-primary-800 dark:bg-primary-900 dark:text-primary-200 font-medium">
                        {source.conversionRate.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

export default Analytics
