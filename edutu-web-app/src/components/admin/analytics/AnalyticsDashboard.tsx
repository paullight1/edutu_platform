import React from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { Download, Loader2, RefreshCw } from 'lucide-react';
import Card from '../../ui/Card';
import { useAnalyticsData, type AnalyticsTimeframe } from '../../../hooks/useAnalyticsData';

const timeframeLabels: Record<AnalyticsTimeframe, string> = {
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  all: 'All time'
};

const pieColours = ['#6366F1', '#14B8A6', '#F97316', '#8B5CF6', '#22D3EE', '#FACC15'];

const AnalyticsDashboard: React.FC = () => {
  const { data, loading, error, refresh, timeframe, setTimeframe, toCsv } = useAnalyticsData();

  const handleExport = () => {
    try {
      const csv = toCsv();
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `edutu-analytics-${timeframe}.csv`;
      anchor.style.display = 'none';
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export analytics CSV', err);
    }
  };

  const userChartData = [
    { name: 'Total users', value: data.users.totalUsers },
    { name: 'Active users', value: data.users.activeUsers },
    { name: 'Avg goals', value: Number(data.users.averageGoalsCompleted.toFixed(2)) }
  ];

  const opportunityClicks = data.opportunities.clicksPerOpportunity.slice(0, 5);
  const aiQueryData = data.ai.topQueries.slice(0, 5).map((query) => ({
    name: query.label,
    value: query.count
  }));

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Platform analytics</h1>
          <p className="text-sm text-gray-500">
            Track learner momentum, opportunity performance, and AI assistant adoption across Edutu.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={timeframe}
            onChange={(event) => setTimeframe(event.target.value as AnalyticsTimeframe)}
            className="rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 transition hover:border-gray-300 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            {Object.entries(timeframeLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void refresh()}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={loading}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refresh
          </button>
          <button
            type="button"
            onClick={handleExport}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-white transition hover:bg-primary/90"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          {error}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="h-full">
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-700">Total users</h3>
              <p className="text-3xl font-semibold text-gray-900">{data.users.totalUsers.toLocaleString()}</p>
              <p className="text-xs text-gray-500">Unique accounts across all cohorts.</p>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-700">Active this week</h3>
              <p className="text-2xl font-semibold text-primary">{data.users.activeUsers.toLocaleString()}</p>
              <p className="text-xs text-gray-500">Learners who completed at least one action.</p>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-700">Avg. goals completed</h3>
              <p className="text-2xl font-semibold text-emerald-600">
                {data.users.averageGoalsCompleted.toFixed(2)}
              </p>
              <p className="text-xs text-gray-500">Goal completions per active learner.</p>
            </div>
          </div>
        </Card>

        <Card className="h-full">
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-700">Opportunity catalogue</h3>
              <p className="text-3xl font-semibold text-gray-900">
                {data.opportunities.totalOpportunities.toLocaleString()}
              </p>
              <p className="text-xs text-gray-500">Live opportunities available right now.</p>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-700">Popular categories</h3>
              <ul className="mt-2 space-y-1 text-sm text-gray-600">
                {data.opportunities.topCategories.slice(0, 4).map((category) => (
                  <li key={category.name} className="flex items-center justify-between gap-3">
                    <span>{category.name}</span>
                    <span className="text-xs text-gray-400">{category.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Card>

        <Card className="h-full">
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-700">AI conversations</h3>
              <p className="text-3xl font-semibold text-gray-900">
                {data.ai.totalInteractions.toLocaleString()}
              </p>
              <p className="text-xs text-gray-500">Sessions logged with the Edutu AI coach.</p>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-700">Avg. sessions per user</h3>
              <p className="text-2xl font-semibold text-indigo-600">
                {data.ai.averageSessionsPerUser.toFixed(2)}
              </p>
              <p className="text-xs text-gray-500">Engagement of learners using AI guidance.</p>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="space-y-4">
            <header className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-gray-700">User momentum</h3>
                <p className="text-xs text-gray-500">Comparative view of total vs active learners.</p>
              </div>
              {data.users.updatedAt && (
                <span className="text-xs text-gray-400">
                  Updated {data.users.updatedAt.toLocaleString()}
                </span>
              )}
            </header>
            <div className="h-64 w-full">
              <ResponsiveContainer>
                <BarChart data={userChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="name" stroke="#9CA3AF" />
                  <YAxis stroke="#9CA3AF" />
                  <Tooltip
                    contentStyle={{ borderRadius: 12, borderColor: '#E5E7EB', fontSize: 12 }}
                  />
                  <Bar dataKey="value" radius={[12, 12, 0, 0]} fill="#6366F1" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </Card>

        <Card>
          <div className="space-y-4">
            <header>
              <h3 className="text-sm font-semibold text-gray-700">Top categories</h3>
              <p className="text-xs text-gray-500">Share of opportunity views per category.</p>
            </header>
            <div className="h-64 w-full">
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={data.opportunities.topCategories.slice(0, 6).map((category) => ({
                      name: category.name,
                      value: category.count
                    }))}
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {data.opportunities.topCategories.slice(0, 6).map((_, index) => (
                      <Cell key={`slice-${index}`} fill={pieColours[index % pieColours.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ borderRadius: 12, borderColor: '#E5E7EB', fontSize: 12 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <div className="space-y-4">
            <header className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-gray-700">Opportunity clicks</h3>
                <p className="text-xs text-gray-500">Most engaged opportunities this period.</p>
              </div>
              {data.opportunities.updatedAt && (
                <span className="text-xs text-gray-400">
                  Updated {data.opportunities.updatedAt.toLocaleString()}
                </span>
              )}
            </header>
            <div className="h-64 w-full">
              <ResponsiveContainer>
                <BarChart data={opportunityClicks}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="name" stroke="#9CA3AF" tick={{ fontSize: 11 }} />
                  <YAxis stroke="#9CA3AF" />
                  <Tooltip
                    contentStyle={{ borderRadius: 12, borderColor: '#E5E7EB', fontSize: 12 }}
                  />
                  <Bar dataKey="value" radius={[12, 12, 0, 0]} fill="#14B8A6" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </Card>

        <Card>
          <div className="space-y-4">
            <header className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-gray-700">AI query themes</h3>
                <p className="text-xs text-gray-500">Common prompts surfaced by learners.</p>
              </div>
              {data.ai.updatedAt && (
                <span className="text-xs text-gray-400">
                  Updated {data.ai.updatedAt.toLocaleString()}
                </span>
              )}
            </header>
            <div className="h-64 w-full">
              <ResponsiveContainer>
                <BarChart data={aiQueryData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="name" stroke="#9CA3AF" tick={{ fontSize: 11 }} />
                  <YAxis stroke="#9CA3AF" />
                  <Tooltip
                    contentStyle={{ borderRadius: 12, borderColor: '#E5E7EB', fontSize: 12 }}
                  />
                  <Bar dataKey="value" radius={[12, 12, 0, 0]} fill="#F97316" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </Card>
      </div>

      {loading && (
        <div className="flex items-center justify-center rounded-2xl border border-gray-200 bg-white py-6 text-sm text-gray-600">
          <Loader2 className="mr-3 h-4 w-4 animate-spin" />
          Loading analytics insights…
        </div>
      )}
    </div>
  );
};

export default AnalyticsDashboard;
