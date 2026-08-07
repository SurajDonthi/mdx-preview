import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  CartesianGrid,
} from 'recharts';

// Recharts Chart Component
export interface ChartProps {
  type?: 'line' | 'bar' | 'area';
  data?: Array<Record<string, any>>;
  dataKey?: string;
  nameKey?: string;
  title?: string;
  height?: number;
  color?: string;
}

export function Chart({
  type = 'line',
  data = [
    { name: 'Jan', value: 400 },
    { name: 'Feb', value: 650 },
    { name: 'Mar', value: 900 },
    { name: 'Apr', value: 850 },
    { name: 'May', value: 1200 },
    { name: 'Jun', value: 1600 },
  ],
  dataKey = 'value',
  nameKey = 'name',
  title,
  height = 240,
  color = '#6366f1',
}: ChartProps) {
  return (
    <div className="mdxkit-chart">
      {title && <h5 className="mdxkit-chart__title">{title}</h5>}
      <div style={{ width: '100%', height }}>
        <ResponsiveContainer>
          {type === 'bar' ? (
            <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
              <XAxis dataKey={nameKey} tick={{ fontSize: 12 }} stroke="#888888" />
              <YAxis tick={{ fontSize: 12 }} stroke="#888888" />
              <RechartsTooltip
                contentStyle={{
                  backgroundColor: '#1e293b',
                  borderColor: '#334155',
                  borderRadius: '8px',
                  color: '#fff',
                }}
              />
              <Bar dataKey={dataKey} fill={color} radius={[6, 6, 0, 0]} />
            </BarChart>
          ) : type === 'area' ? (
            <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={color} stopOpacity={0.8} />
                  <stop offset="95%" stopColor={color} stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
              <XAxis dataKey={nameKey} tick={{ fontSize: 12 }} stroke="#888888" />
              <YAxis tick={{ fontSize: 12 }} stroke="#888888" />
              <RechartsTooltip
                contentStyle={{
                  backgroundColor: '#1e293b',
                  borderColor: '#334155',
                  borderRadius: '8px',
                  color: '#fff',
                }}
              />
              <Area
                type="monotone"
                dataKey={dataKey}
                stroke={color}
                fillOpacity={1}
                fill="url(#chartGrad)"
                strokeWidth={2}
              />
            </AreaChart>
          ) : (
            <LineChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
              <XAxis dataKey={nameKey} tick={{ fontSize: 12 }} stroke="#888888" />
              <YAxis tick={{ fontSize: 12 }} stroke="#888888" />
              <RechartsTooltip
                contentStyle={{
                  backgroundColor: '#1e293b',
                  borderColor: '#334155',
                  borderRadius: '8px',
                  color: '#fff',
                }}
              />
              <Line
                type="monotone"
                dataKey={dataKey}
                stroke={color}
                strokeWidth={3}
                dot={{ r: 4, fill: color }}
              />
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
