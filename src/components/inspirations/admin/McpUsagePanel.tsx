'use client';

import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { cleanToolName } from '@/lib/mcp/connections';
import { getMcpUsage, type McpUsageReport } from '@/lib/mcp/usage';
import { AreaChart, CardHead, HUE, Kpi, Sparkline } from './AnalyticsPanel';

/**
 * How Motvin MCP is used: tool calls and active people per day, the tools the
 * AI calls, which AI tools people connect from, and what they search for. Read
 * from /api/mcp/usage (admin only); people are counted, never listed.
 */

type Range = 7 | 30 | 90;
const RANGES: Range[] = [7, 30, 90];

const TOOL_LABEL: Record<string, string> = {
  search_screens: 'Search screens',
  search_flows: 'Search flows',
  search_screen_text: 'Text on screens',
  get_screen: 'Open a screen',
  find_similar_screens: 'Similar screens',
  get_flow: 'Open a flow',
  list_apps: 'List apps',
  get_app: 'Open an app',
  list_patterns: 'List patterns',
  get_pattern: 'Open a pattern',
  get_taxonomy: 'Filter values',
};

const dayLabel = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const plural = (n: number, word: string) => `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`;

function TopList({ rows, color, unit }: { rows: { label: string; count: number }[]; color: string; unit: string }) {
  if (!rows.length) return <p className="ins-analytics-empty">Nothing yet.</p>;
  const max = Math.max(1, ...rows.map((row) => row.count));
  return (
    <ul className="ins-progress-grid" style={{ '--hue': color } as CSSProperties}>
      {rows.map((row) => (
        <li key={row.label} data-tip={plural(row.count, unit)}>
          <span className="ins-progress-row">
            <span className="ins-progress-label">{row.label}</span>
            <span className="ins-progress-pct">{row.count.toLocaleString()}</span>
          </span>
          <span className="ins-progress-track">
            <span style={{ width: `${(row.count / max) * 100}%` }} />
          </span>
        </li>
      ))}
    </ul>
  );
}

export function McpUsagePanel() {
  const [range, setRange] = useState<Range>(30);
  const [report, setReport] = useState<McpUsageReport | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async (days: Range) => {
    try {
      setReport(await getMcpUsage(days));
      setError('');
    } catch (failure) {
      setError((failure as Error).message || 'Could not load MCP usage.');
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount and on range change
    void load(range);
  }, [load, range]);

  if (error && !report) return <p className="ins-muted ins-admin-status" role="alert">{error}</p>;
  if (!report) return <p className="ins-muted ins-admin-status">Loading MCP usage…</p>;

  const { totals, days } = report;
  const peak = days.reduce((best, day) => (day.calls > best.calls ? day : best), days[0]);

  return (
    <div className="ins-admin-panel ins-analytics">
      <div className="ins-reqlist-bar">
        <div className="ins-segmented" role="radiogroup" aria-label="Date range">
          {RANGES.map((days) => (
            <button key={days} type="button" role="radio" aria-checked={range === days} className={`ins-segmented-item ${range === days ? 'is-active' : ''}`} onClick={() => setRange(days)}>
              {days} days
            </button>
          ))}
        </div>
      </div>

      <div className="ins-kpis">
        <Kpi color={HUE.blue} value={totals.calls.toLocaleString()} label="Tool calls" note={`Last ${range} days`}>
          <Sparkline values={days.map((day) => day.calls)} color={HUE.blue} />
        </Kpi>
        <Kpi color={HUE.violet} value={totals.people.toLocaleString()} label="Active people" note="Used MCP at least once">
          <Sparkline values={days.map((day) => day.people)} color={HUE.violet} />
        </Kpi>
        <Kpi color={HUE.aqua} value={totals.connections.toLocaleString()} label="Connected tools" note={`${plural(days.reduce((sum, day) => sum + day.connections, 0), 'new connection')} in range`} />
        <Kpi
          color={totals.rateLimited ? HUE.orange : HUE.green}
          value={totals.rateLimited.toLocaleString()}
          label="Rate-limited"
          note={totals.errors ? `${plural(totals.errors, 'tool error')} too` : 'No tool errors'}
        />
      </div>

      <section className="ins-analytics-card">
        <CardHead
          title="Tool calls per day"
          desc={totals.calls ? `Busiest day: ${dayLabel(peak.date)} with ${plural(peak.calls, 'call')}.` : 'No calls in this range yet.'}
        />
        <AreaChart points={days.map((day) => ({ label: dayLabel(day.date), short: String(Number(day.date.slice(8))), value: day.calls }))} color={HUE.blue} unit="call" />
      </section>

      <div className="ins-analytics-pair">
        <section className="ins-analytics-card">
          <CardHead title="Tools the AI uses" desc="Which Motvin tools get called." />
          <TopList rows={report.tools.map((tool) => ({ label: TOOL_LABEL[tool.name] ?? tool.name, count: tool.count }))} color={HUE.blue} unit="call" />
        </section>
        <section className="ins-analytics-card">
          <CardHead title="AI tools people use" desc="Where the calls come from." />
          <TopList rows={report.clients.map((client) => ({ label: cleanToolName(client.name), count: client.count }))} color={HUE.violet} unit="call" />
        </section>
      </div>

      <section className="ins-analytics-card">
        <CardHead title="Top searches" desc="What people asked Motvin to find, most common first." />
        <TopList rows={report.queries.map((query) => ({ label: query.text, count: query.count }))} color={HUE.aqua} unit="search" />
      </section>
    </div>
  );
}
