import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { SegmentedControl } from "../components/SegmentedControl";
import { EmptyState } from "../components/StatusBanner";
import { useLog } from "../context/LogContext";
import { useGoals } from "../context/GoalsContext";
import { getDailyTotals, getWeeklyTotals, thinLabels } from "../utils/history";

type ChartType = "line" | "bar";
type LineRange = 7 | 30;
type BarRange = 4 | 8;

const CHART_TYPE_OPTIONS: { value: ChartType; label: string }[] = [
  { value: "line", label: "Line" },
  { value: "bar", label: "Bar" },
];

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        padding: "6px 10px",
        fontSize: 12,
        boxShadow: "0 4px 12px var(--shadow)",
      }}
    >
      <div style={{ fontWeight: 700 }}>{label}</div>
      <div>{Math.round(payload[0].value)} cal</div>
    </div>
  );
}

export function HistoryPage() {
  const { logByDate, loggedDates } = useLog();
  const { goals } = useGoals();
  const [chartType, setChartType] = useState<ChartType>("line");
  const [lineRange, setLineRange] = useState<LineRange>(7);
  const [barRange, setBarRange] = useState<BarRange>(4);

  const hasEnoughHistory = loggedDates.length >= 3;

  const dailyData = useMemo(() => {
    const points = getDailyTotals(logByDate, lineRange);
    return lineRange === 30 ? thinLabels(points, 6) : points;
  }, [logByDate, lineRange]);

  const weeklyData = useMemo(() => getWeeklyTotals(logByDate, barRange), [logByDate, barRange]);

  const lineAverage = useMemo(() => {
    const raw = getDailyTotals(logByDate, lineRange);
    return raw.reduce((sum, p) => sum + p.calories, 0) / raw.length;
  }, [logByDate, lineRange]);

  const highestWeek = useMemo(() => {
    if (!weeklyData.length) return null;
    return weeklyData.reduce((max, w) => (w.calories > max.calories ? w : max), weeklyData[0]);
  }, [weeklyData]);

  return (
    <div>
      <div className="hist-controls">
        <SegmentedControl options={CHART_TYPE_OPTIONS} value={chartType} onChange={setChartType} ariaLabel="Chart type" />
        <div className="chip-row">
          {chartType === "line" ? (
            <>
              <button className={`chip${lineRange === 7 ? " active" : ""}`} onClick={() => setLineRange(7)}>
                7 days
              </button>
              <button className={`chip${lineRange === 30 ? " active" : ""}`} onClick={() => setLineRange(30)}>
                30 days
              </button>
            </>
          ) : (
            <>
              <button className={`chip${barRange === 4 ? " active" : ""}`} onClick={() => setBarRange(4)}>
                4 weeks
              </button>
              <button className={`chip${barRange === 8 ? " active" : ""}`} onClick={() => setBarRange(8)}>
                8 weeks
              </button>
            </>
          )}
        </div>
      </div>

      {!hasEnoughHistory ? (
        <EmptyState
          emoji="📈"
          title="Keep logging to see your trends"
          sub="History needs at least a few days of logged food before there's anything meaningful to chart."
        />
      ) : (
        <div className="chart-card">
          <ResponsiveContainer width="100%" height={220}>
            {chartType === "line" ? (
              <LineChart data={dailyData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="var(--border-soft)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--text-secondary)" }} axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip content={<ChartTooltip />} />
                <Line
                  type="monotone"
                  dataKey="calories"
                  stroke="var(--accent)"
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: "var(--accent)", strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            ) : (
              <BarChart data={weeklyData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="var(--border-soft)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--text-secondary)" }} axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="calories" radius={[4, 4, 0, 0]}>
                  {weeklyData.map((entry) => (
                    <Cell key={entry.weekStart} fill={entry.isCurrent ? "var(--bar-current)" : "var(--bar-past)"} />
                  ))}
                </Bar>
              </BarChart>
            )}
          </ResponsiveContainer>

          <div className="chart-summary">
            {chartType === "line" ? (
              <>
                {lineRange}-day average <b>{Math.round(lineAverage).toLocaleString()} cal</b> · goal{" "}
                {goals.calories.toLocaleString()} cal
              </>
            ) : (
              highestWeek && (
                <>
                  Highest week {highestWeek.label} — <b>{Math.round(highestWeek.calories).toLocaleString()} cal</b>
                </>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}
