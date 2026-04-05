import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
} from 'recharts'

interface ScoreRadarProps {
  data: {
    name: string
    value: number
  }[]
  title?: string
}

export const ScoreRadar = ({ data, title }: ScoreRadarProps) => {
  return (
    <div className="w-full h-full">
      {title && (
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">{title}</h3>
      )}
      <ResponsiveContainer width="100%" height={400}>
        <RadarChart data={data} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
          <PolarGrid
            stroke="rgb(229, 231, 235)"
            style={{ strokeOpacity: 0.5 }}
          />
          <PolarAngleAxis
            dataKey="name"
            tick={{ fontSize: 12, fill: 'rgb(107, 114, 128)' }}
          />
          <PolarRadiusAxis
            angle={90}
            domain={[0, 100]}
            tick={{ fontSize: 12, fill: 'rgb(107, 114, 128)' }}
          />
          <Radar
            name="Score"
            dataKey="value"
            stroke="rgb(59, 130, 246)"
            fill="rgb(59, 130, 246)"
            fillOpacity={0.6}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  )
}
