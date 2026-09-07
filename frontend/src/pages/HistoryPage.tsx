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
import { ChevronDownIcon } from "../components/icons";
import { useLog } from "../context/LogContext";
import { useGoals } from "../context/GoalsContext";
import {
  getDailyLogSummaries,
  getDailyTotals,
  getWeeklyTotals,
  METRIC_OPTIONS,
  thinLabels,
  type HistoryMetric,
} from "../utils/history";

type ChartType = "line" | "bar";
type LineRange = 7 | 30;
type BarRange = 4 | 8;

const CHART_TYPE_OPTIONS: { value: ChartType; label: string }[] = [
  { value: "line", label: "Line" },
  { value: "bar", label: "Bar" },
];

function ChartTooltip({ active, payload, label, unit }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-label">{label}</div>
      <div>
        {Math.round(payload[0].value)} {unit}
      </div>
    </div>
  );
}

export function HistoryPage() {
  const { logByDate, loggedDates } = useLog();
  const { goals } = useGoals();
  const [chartType, setChartType] = useState<ChartType>("line");
  const [lineRange, setLineRange] = useState<LineRange>(7);
  const [barRange, setBarRange] = useState<BarRange>(4);
  const [metric, setMetric] = useState<HistoryMetric>("calories");
  const [metricMenuOpen, setMetricMenuOpen] = useState(false);

  const hasEnoughHistory = loggedDates.length >= 3;
  const metricMeta = METRIC_OPTIONS.find((m) => m.value === metric)!;
  const goalForMetric = { calories: goals.calories, protein_g: goals.protein_g, carbs_g: goals.carbs_g, fat_g: goals.fat_g }[metric];

  const dailyData = useMemo(() => {
    const points = getDailyTotals(logByDate, lineRange);
    return lineRange === 30 ? thinLabels(points, 6) : points;
  }, [logByDate, lineRange]);

  const weeklyData = useMemo(() => getWeeklyTotals(logByDate, barRange), [logByDate, barRange]);

  const dailySummaries = useMemo(() => getDailyLogSummaries(logByDate, loggedDates), [logByDate, loggedDates]);

  const lineAverage = useMemo(() => {
    const raw = getDailyTotals(logByDate, lineRange);
    return raw.reduce((sum, p) => sum + p[metric], 0) / raw.length;
  }, [logByDate, lineRange, metric]);

  const highestWeek = useMemo(() => {
    if (!weeklyData.length) return null;
    return weeklyData.reduce((max, w) => (w[metric] > max[metric] ? w : max), weeklyData[0]);
  }, [weeklyData, metric]);

  return (
    <div className="history-page">
      <h1 className="page-title">History</h1>
      <p className="page-subtitle history-subtitle">Trends and insights</p>

      <div className="hist-controls">
        <SegmentedControl options={CHART_TYPE_OPTIONS} value={chartType} onChange={setChartType} ariaLabel="Chart type" />
        <div className="chip-row">
          {chartType === "line" ? (
            <>
              <button className={`chip${lineRange === 7 ? " active" : ""}`} onClick={() => setLineRange(7)}>
                7 Days
              </button>
              <button className={`chip${lineRange === 30 ? " active" : ""}`} onClick={() => setLineRange(30)}>
                30 Days
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

        <div className="metric-select">
          <button className="metric-select-btn" onClick={() => setMetricMenuOpen((v) => !v)}>
            Metric: {metricMeta.label}
            <ChevronDownIcon className={metricMenuOpen ? "open" : ""} />
          </button>
          {metricMenuOpen && (
            <div className="metric-dropdown">
              {METRIC_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  className={`metric-dropdown-item${opt.value === metric ? " selected" : ""}`}
                  onClick={() => {
                    setMetric(opt.value);
                    setMetricMenuOpen(false);
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
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
        <>
          <div className="hist-stats">
            <div>
              <div className="hist-stat-label">Average {metricMeta.label}</div>
              <div className="hist-stat-value">
                {Math.round(lineAverage).toLocaleString()} <span className="of">/ day</span>
              </div>
            </div>
          </div>

          <div className="chart-card">
            <ResponsiveContainer width="100%" height={220}>
              {chartType === "line" ? (
                <LineChart data={dailyData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--text-secondary)" }} axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <Tooltip content={<ChartTooltip unit={metricMeta.unit} />} />
                  <Line
                    type="monotone"
                    dataKey={metric}
                    stroke="var(--accent)"
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: "var(--accent)", strokeWidth: 0 }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              ) : (
                <BarChart data={weeklyData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--text-secondary)" }} axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <Tooltip content={<ChartTooltip unit={metricMeta.unit} />} />
                  <Bar dataKey={metric} radius={[4, 4, 0, 0]}>
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
                  {lineRange}-day average <b>{Math.round(lineAverage).toLocaleString()} {metricMeta.unit}</b>
                  {goalForMetric > 0 && <> · goal {goalForMetric.toLocaleString()} {metricMeta.unit}</>}
                </>
              ) : (
                highestWeek && (
                  <>
                    Highest week {highestWeek.label} — <b>{Math.round(highestWeek[metric]).toLocaleString()} {metricMeta.unit}</b>
                  </>
                )
              )}
            </div>
          </div>

          <div className="group-label">Daily Logs</div>
          <div className="daily-logs-grid">
            {dailySummaries.map((day) => (
              <div className="daily-log-row" key={day.date}>
                <div className="daily-log-heading">{day.heading}</div>
                <div className="daily-log-meta">
                  {Math.round(day.calories)} cal · {Math.round(day.protein_g)}g protein · {Math.round(day.carbs_g)}g carbs
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
