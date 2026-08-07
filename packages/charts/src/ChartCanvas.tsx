/**
 * The only module in the package that touches Recharts.
 *
 * It is deliberately not re-exported from the package entry: `Chart` reaches it
 * through a dynamic `import()`, which is what keeps Recharts (and the D3 packages
 * underneath it) out of a consumer's main chunk until a chart is on screen.
 */

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

export interface ChartCanvasProps {
  type: 'line' | 'bar' | 'area';
  data: Array<Record<string, any>>;
  dataKey: string;
  nameKey: string;
  color: string;
}

export function ChartCanvas({ type, data, dataKey, nameKey, color }: ChartCanvasProps) {
  return (
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
  );
}
