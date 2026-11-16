import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { EmptyState } from './ui';

export const STATUS_COLORS = { TODO: '#94A3B8', IN_PROGRESS: '#F59E0B', DONE: '#16A34A' };
export const PRIORITY_COLORS = { LOW: '#94A3B8', MEDIUM: '#0E7490', HIGH: '#DB7706', URGENT: '#DC2626' };

const axis = { fontSize: 12, fill: '#64748B' };

export function DonutChart({ data, height = 220 }: { data: { name: string; value: number; color: string }[]; height?: number }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (!total) return <EmptyState title="No data yet" message="Nothing to show for this selection." />;
  return (
    <div style={{ height }} role="img" aria-label={data.map((d) => `${d.name}: ${d.value}`).join(', ')}>
      <ResponsiveContainer>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="85%" paddingAngle={2} isAnimationActive={false}>
            {data.map((d) => (
              <Cell key={d.name} fill={d.color} />
            ))}
          </Pie>
          <Tooltip />
          <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export function SimpleBarChart({
  data,
  bars,
  xKey,
  height = 240,
  stacked,
  layout = 'horizontal',
}: {
  data: Record<string, unknown>[];
  bars: { key: string; name: string; color: string }[];
  xKey: string;
  height?: number;
  stacked?: boolean;
  layout?: 'horizontal' | 'vertical';
}) {
  const total = data.reduce((s, d) => s + bars.reduce((x, b) => x + Number(d[b.key] ?? 0), 0), 0);
  if (!data.length || !total) return <EmptyState title="No data yet" message="Nothing to show for this selection." />;
  return (
    <div style={{ height }} role="img" aria-label="Bar chart">
      <ResponsiveContainer>
        <BarChart data={data} layout={layout} margin={{ left: layout === 'vertical' ? 20 : 0, right: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={layout !== 'vertical'} horizontal={layout === 'horizontal'} />
          {layout === 'vertical' ? (
            <>
              <XAxis type="number" allowDecimals={false} tick={axis} />
              <YAxis type="category" dataKey={xKey} tick={axis} width={110} />
            </>
          ) : (
            <>
              <XAxis dataKey={xKey} tick={axis} />
              <YAxis allowDecimals={false} tick={axis} width={30} />
            </>
          )}
          <Tooltip cursor={{ fill: '#F1F5F9' }} />
          {bars.length > 1 && <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />}
          {bars.map((b) => (
            <Bar key={b.key} dataKey={b.key} name={b.name} fill={b.color} stackId={stacked ? 's' : undefined} radius={stacked ? 0 : [4, 4, 0, 0]} isAnimationActive={false} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function TrendChart({ data, lines, height = 240 }: { data: Record<string, unknown>[]; lines: { key: string; name: string; color: string }[]; height?: number }) {
  const total = data.reduce((s, d) => s + lines.reduce((x, l) => x + Number(d[l.key] ?? 0), 0), 0);
  if (!total) return <EmptyState title="No activity in this range" message="Try a wider date range." />;
  return (
    <div style={{ height }} role="img" aria-label="Trend chart">
      <ResponsiveContainer>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
          <XAxis dataKey="date" tick={axis} tickFormatter={(d: string) => d.slice(5)} minTickGap={20} />
          <YAxis allowDecimals={false} tick={axis} width={30} />
          <Tooltip />
          {lines.length > 1 && <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />}
          {lines.map((l) => (
            <Line key={l.key} type="monotone" dataKey={l.key} name={l.name} stroke={l.color} strokeWidth={2} dot={false} isAnimationActive={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
