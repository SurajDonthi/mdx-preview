import { useEffect, useState } from 'react';
import type { ComponentType } from 'react';

import type { ChartCanvasProps } from './ChartCanvas';

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

/**
 * Recharts plus its D3 dependencies is ~500 kB - far more than a document that
 * happens to register `chartsPlugin` should have to download. It is pulled in on
 * mount instead of at module scope; the wrapper below renders the same box at
 * the same height either way, so the only visible difference is that the plot
 * area paints a beat later, the same way `ResponsiveContainer` already waits for
 * its first measurement.
 */
let canvasModule: Promise<ComponentType<ChartCanvasProps>> | null = null;

function loadChartCanvas(): Promise<ComponentType<ChartCanvasProps>> {
  canvasModule ??= import('./ChartCanvas').then((module) => module.ChartCanvas);
  return canvasModule;
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
  const [Canvas, setCanvas] = useState<ComponentType<ChartCanvasProps> | null>(null);

  useEffect(() => {
    let isActive = true;
    loadChartCanvas().then(
      (component) => {
        // Stored behind a thunk: `setState` calls a bare function argument as an
        // updater, and a component *is* a function.
        if (isActive) setCanvas(() => component);
      },
      (cause: unknown) => {
        console.warn('Chart failed to load Recharts:', cause);
      }
    );
    return () => {
      isActive = false;
    };
  }, []);

  return (
    <div className="mdxstudio-chart">
      {title && <h5 className="mdxstudio-chart__title">{title}</h5>}
      <div style={{ width: '100%', height }}>
        {Canvas ? (
          <Canvas type={type} data={data} dataKey={dataKey} nameKey={nameKey} color={color} />
        ) : null}
      </div>
    </div>
  );
}
