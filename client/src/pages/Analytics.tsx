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
    queryFn: async () => [],
  })

  // Fetch score distribution
  const { data: scoreDistribution } = useQuery({
    queryKey: ['analytics-score-distribution'],
    queryFn: async () => [],
  })

  // Fetch response time analysis
  const { data: responseTimeData } = useQuery({
    queryKey: ['analytics-response-time', dateRange],
    queryFn: async () => [],
  })

  // Fetch keyword analysis
  const { data: keywordData } = useQuery({
    queryKey: ['analytics-keywords'],
    queryFn: async () => [],
  })

  // Fetch trending skills
  const { data: trendingSkills } = useQuery({
    queryKey: ['analytics-trends', dateRange],
    queryFn: async () => [],
  })

  // Fetch persona ROI
  const { data: personaROI } = useQuery({
    queryKey: ['analytics-persona-roi'],
    queryFn: async () => [],
  })

  // Fetch source performance
  const { data: sourcePerformance } = useQuery<SourcePerformanceData[]>({
    queryKey: ['analytics-source-performance'],
    queryFn: async () => [],
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
        {funnelData && funnelData.length > 0 ? (
          <>
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

            {/* Funnel Stats */}
            <div className="mt-6 grid grid-cols-2 md:grid-cols-6 gap-2">
              {funnelData.map((stage) => (
                <div key={stage.stage} className="text-center p-2 rounded-lg bg-gray-50 dark:bg-gray-800">
                  <p className="text-xs text-gray-600 dark:text-gray-400">{stage.stage}</p>
                  <p className="text-lg font-bold text-gray-900 dark:text-white">{stage.count}</p>
                  <p className="text-xs text-gray-500">{stage.percentage.toFixed(1)}%</p>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            <p className="text-sm">אין נתוני פאנל זמינים</p>
          </div>
        )}
      </Card>

      {/* Score Distribution & Response Time */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Score Distribution */}
        <Card>
          <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">Score Distribution</h2>
          {scoreDistribution && scoreDistribution.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={scoreDistribution}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(229, 231, 235)" />
                <XAxis dataKey="range" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip contentStyle={{ backgroundColor: 'rgb(31, 41, 55)', border: 'none', borderRadius: '8px', color: 'white' }} />
                <Bar dataKey="count" fill="rgb(59, 130, 246)" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              <p className="text-sm">אין נתוני התפלגות זמינים</p>
            </div>
          )}
        </Card>

        {/* Response Time Analysis */}
        <Card>
          <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">Response Time by Source</h2>
          {responseTimeData && responseTimeData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={responseTimeData}>
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
          ) : (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              <p className="text-sm">אין נתוני זמן תגובה זמינים</p>
            </div>
          )}
        </Card>
      </div>

      {/* Keyword Effectiveness */}
      <Card>
        <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">Keyword Effectiveness</h2>
        {keywordData && keywordData.length > 0 ? (
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
                {keywordData.map((item) => (
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
        ) : (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            <p className="text-sm">אין נתוני מילים מפתח זמינים</p>
          </div>
        )}
      </Card>

      {/* Market Trends & Persona ROI */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Market Trends */}
        <Card>
          <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">Most Demanded Skills</h2>
          {trendingSkills && trendingSkills.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={trendingSkills}
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
          ) : (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              <p className="text-sm">אין נתוני כישורים זמינים</p>
            </div>
          )}
        </Card>

        {/* Persona ROI */}
        <Card>
          <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">Persona ROI Comparison</h2>
          {personaROI && personaROI.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={personaROI}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(229, 231, 235)" />
                <XAxis dataKey="persona" tick={{ fontSize: 12 }} angle={-45} textAnchor="end" height={80} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip contentStyle={{ backgroundColor: 'rgb(31, 41, 55)', border: 'none', borderRadius: '8px', color: 'white' }} />
                <Legend />
                <Bar dataKey="interviews" fill="rgb(34, 197, 94)" name="Interviews" />
                <Bar dataKey="offers" fill="rgb(34, 197, 94)" name="Offers" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              <p className="text-sm">אין נתוני ROI של פרסונה זמינים</p>
            </div>
          )}
        </Card>
      </div>

      {/* Source Performance Table */}
      <Card>
        <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">Source Performance</h2>
        {sourcePerformance && sourcePerformance.length > 0 ? (
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
                {sourcePerformance.map((source) => (
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
        ) : (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            <p className="text-sm">אין נתוני ביצועי מקור זמינים</p>
          </div>
        )}
      </Card>
    </div>
  )
}

export default Analytics
