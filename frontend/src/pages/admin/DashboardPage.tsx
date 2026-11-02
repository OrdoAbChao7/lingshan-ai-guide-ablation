/**
 * 运营概览（/admin/dashboard）。
 *
 * 版式：统一壳层 → 页签 → KPI 概要条 → 图表分栏 → 明细分栏。
 * 所有颜色取自设计令牌（不写死 antd/ECharts 默认色），保证与后台其它页一致。
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Table, Tag, Button, Tabs, Select, Input } from 'antd';
import {
  TeamOutlined,
  SmileOutlined,
  MessageOutlined,
  EnvironmentOutlined,
  BookOutlined,
  BarChartOutlined,
  DashboardOutlined,
  DownloadOutlined,
  SearchOutlined,
  ReloadOutlined,
  BulbOutlined,
  ExperimentOutlined,
} from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import { adminAPI } from '../../services/api';
import AdminShell from '../../components/admin/AdminShell';
import AgentArtsPanel from './AgentArtsPanel';
import './DashboardPage.css';

interface TrendPoint { date: string; score: number; }
interface HourlyPoint { hour: number; count: number; }
interface HotQuestion { question: string; count: number; }
interface Conversation { id: string; timestamp: string; session_id: string; category: string; query: string; answer: string; response_time_ms: number; feedback?: string; }
interface ConversationFilters {
  [key: string]: string | number | boolean | undefined;
  category?: string;
  keyword?: string;
}
interface LocationPoint { lat: number; lng: number; count: number; }
interface DashboardData {
  today_queries?: number;
  week_queries?: number;
  monthly_queries?: number;
  total_queries?: number;
  model?: string;
  avg_satisfaction?: number;
  total_knowledge_chunks?: number;
  total_spots?: number;
  sentiment_distribution?: { positive?: number; neutral?: number; negative?: number };
  satisfaction_trend?: TrendPoint[];
  hourly_distribution?: HourlyPoint[];
  top_hot_questions?: HotQuestion[];
}

const CATEGORY_LABEL: Record<string, string> = { ticket: '票价', route: '路线', history: '历史', facility: '设施', other: '其他' };

const CHART_TEXT = { color: '#6d6259', fontSize: 11, fontFamily: 'ui-monospace, Consolas, monospace' };
const AXIS_LINE = { lineStyle: { color: 'rgba(36,28,24,0.14)' } };
const SPLIT_LINE = { lineStyle: { color: 'rgba(36,28,24,0.07)' } };

export default function DashboardPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<DashboardData | null>(null);
  const [liveConnected, setLiveConnected] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const wsRef = useRef<WebSocket | null>(null);
  const liveCountRef = useRef(0);

  const [convList, setConvList] = useState<Conversation[]>([]);
  const [convTotal, setConvTotal] = useState(0);
  const [convPage, setConvPage] = useState(1);
  const [convFilters, setConvFilters] = useState<ConversationFilters>({});
  const convFiltersRef = useRef<ConversationFilters>({});
  const [convLoading, setConvLoading] = useState(false);

  useEffect(() => {
    convFiltersRef.current = convFilters;
  }, [convFilters]);

  const [locations, setLocations] = useState<LocationPoint[]>([]);
  const [categoryDist, setCategoryDist] = useState<Record<string, number>>({});

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'subscribe_admin' }));
    };

    ws.onmessage = event => {
      try {
        const msg = JSON.parse(event.data) as { type?: string };
        if (msg.type === 'connected') {
          setLiveConnected(true);
        } else if (msg.type === 'new_query') {
          liveCountRef.current += 1;
          setData(prev => (prev ? { ...prev, today_queries: (prev.today_queries || 0) + 1 } : prev));
        }
      } catch {
        // Ignore malformed WebSocket messages.
      }
    };

    ws.onclose = () => setLiveConnected(false);
    ws.onerror = () => setLiveConnected(false);

    return () => {
      ws.close();
    };
  }, []);

  useEffect(() => {
    adminAPI
      .getDashboard()
      .then(res => setData(res.data))
      .catch(err => console.error(err));
  }, []);

  const handleQuery = () => {
    void fetchConversations(1, { ...convFilters });
  };

  const fetchConversations = useCallback(async (page = 1, filters: ConversationFilters = {}) => {
    setConvLoading(true);
    try {
      const res = await adminAPI.getConversations({ page, pageSize: 20, ...filters });
      setConvList(res.data.items || []);
      setConvTotal(res.data.total || 0);
      setConvPage(page);
    } catch {
      // Keep the previous conversation list when the request fails.
    }
    setConvLoading(false);
  }, []);

  const fetchLocations = useCallback(async () => {
    try {
      const res = await adminAPI.getVisitorLocations();
      setLocations(res.data || []);
    } catch {
      // Location analytics are optional when the endpoint is unavailable.
    }
  }, []);

  const fetchCategoryDist = useCallback(async () => {
    try {
      const res = await adminAPI.getCategoryDistribution();
      setCategoryDist(res.data || {});
    } catch {
      // Category analytics are optional when the endpoint is unavailable.
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'detail') {
      queueMicrotask(() => {
        void fetchConversations(1, convFiltersRef.current);
      });
    }
    if (activeTab === 'satisfaction') {
      queueMicrotask(() => {
        void fetchLocations();
        void fetchCategoryDist();
      });
    }
  }, [activeTab, fetchCategoryDist, fetchConversations, fetchLocations]);

  const handleExportCSV = () => {
    adminAPI.exportConversations(convFilters);
  };

  const satisfactionOption = {
    tooltip: { trigger: 'item' },
    color: ['#1f7a52', '#d4a853', '#c0392b'],
    series: [
      {
        type: 'pie',
        radius: ['58%', '80%'],
        itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 3 },
        label: { show: false },
        data: [
          { value: data?.sentiment_distribution?.positive || 0, name: '正面' },
          { value: data?.sentiment_distribution?.neutral || 0, name: '中性' },
          { value: data?.sentiment_distribution?.negative || 0, name: '负面' },
        ],
      },
    ],
  };

  const trendOption = {
    tooltip: { trigger: 'axis' },
    grid: { top: 16, bottom: 24, left: 34, right: 12 },
    textStyle: CHART_TEXT,
    xAxis: {
      type: 'category',
      data: (data?.satisfaction_trend || []).map(d => d.date.slice(5)),
      axisLine: AXIS_LINE,
      axisTick: { show: false },
      axisLabel: CHART_TEXT,
    },
    yAxis: { type: 'value', min: 0, max: 5, splitLine: SPLIT_LINE, axisLabel: CHART_TEXT },
    series: [
      {
        data: (data?.satisfaction_trend || []).map(d => d.score),
        type: 'line',
        smooth: true,
        symbolSize: 5,
        lineStyle: { color: '#c41d7f', width: 2 },
        itemStyle: { color: '#c41d7f' },
        areaStyle: { color: 'rgba(196,29,127,0.08)' },
      },
    ],
  };

  const hourlyOption = {
    tooltip: { trigger: 'axis' },
    grid: { top: 16, bottom: 24, left: 34, right: 12 },
    textStyle: CHART_TEXT,
    xAxis: {
      type: 'category',
      data: (data?.hourly_distribution || []).map(d => `${d.hour}时`),
      axisLine: AXIS_LINE,
      axisTick: { show: false },
      axisLabel: CHART_TEXT,
    },
    yAxis: { type: 'value', splitLine: SPLIT_LINE, axisLabel: CHART_TEXT },
    series: [
      {
        data: (data?.hourly_distribution || []).map(d => d.count),
        type: 'bar',
        itemStyle: { color: '#3a6ea5', borderRadius: [3, 3, 0, 0] },
        barMaxWidth: 18,
      },
    ],
  };

  const categoryOption = {
    tooltip: { trigger: 'item' },
    color: ['#d4a853', '#3a6ea5', '#2e7d5b', '#c41d7f', '#6d6259'],
    series: [
      {
        type: 'pie',
        radius: ['46%', '70%'],
        itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 3 },
        label: { color: '#5b5148', fontSize: 11 },
        data: [
          { value: categoryDist?.ticket || 0, name: '票价' },
          { value: categoryDist?.route || 0, name: '路线' },
          { value: categoryDist?.history || 0, name: '历史' },
          { value: categoryDist?.facility || 0, name: '设施' },
          { value: categoryDist?.other || 0, name: '其他' },
        ],
      },
    ],
  };

  const convColumns = [
    {
      title: '时间',
      dataIndex: 'timestamp',
      key: 'time',
      width: 150,
      render: (v: string) => <span className="adm-mono-cell">{v?.replace('T', ' ').slice(0, 19)}</span>,
    },
    { title: '会话', dataIndex: 'session_id', key: 'sid', width: 92, render: (v: string) => <span className="adm-mono-cell u-muted">{v?.slice(0, 8)}</span> },
    {
      title: '分类',
      dataIndex: 'category',
      key: 'cat',
      width: 78,
      render: (v: string) => <span className="ui-tag ui-tag--brand">{CATEGORY_LABEL[v] || '其他'}</span>,
    },
    { title: '用户问题', dataIndex: 'query', key: 'query', ellipsis: true },
    { title: 'AI 回复', dataIndex: 'answer', key: 'answer', ellipsis: true, width: 300 },
    {
      title: '耗时',
      dataIndex: 'response_time_ms',
      key: 'rt',
      width: 88,
      align: 'right' as const,
      render: (v: number) => <span className="adm-mono-cell">{v} ms</span>,
    },
    {
      title: '评价',
      dataIndex: 'feedback',
      key: 'fb',
      width: 72,
      render: (v: string) =>
        v === 'helpful' ? (
          <span className="ui-tag ui-tag--ok">有用</span>
        ) : v === 'unhelpful' ? (
          <span className="ui-tag ui-tag--danger">无用</span>
        ) : (
          <span className="u-muted">—</span>
        ),
    },
  ];

  const topQuestions = data?.top_hot_questions || [];

  return (
    <AdminShell
      active="dashboard"
      title="运营概览"
      subtitle="问答量、情绪结构与对话明细 · 数据每 5 秒经 WebSocket 增量推送"
      actions={
        <>
          {data?.model ? <span className="ui-tag ui-tag--info">{data.model}</span> : null}
          <span className={`adm-live${liveConnected ? ' is-on' : ''}`}>
            <span className="adm-live-dot" aria-hidden="true" />
            {liveConnected ? '实时连接' : '未连接'}
          </span>
          <Button size="small" icon={<DownloadOutlined />} onClick={handleExportCSV}>
            导出 CSV
          </Button>
          <Button size="small" icon={<ExperimentOutlined />} onClick={() => navigate('/command-center')}>
            安全大屏
          </Button>
        </>
      }
    >
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          { label: <span><DashboardOutlined /> 概览</span>, key: 'overview' },
          { label: <span><SearchOutlined /> 问答明细</span>, key: 'detail' },
          { label: <span><SmileOutlined /> 满意度分析</span>, key: 'satisfaction' },
          { label: <span><BulbOutlined /> AgentArts 调试</span>, key: 'agentarts' },
        ]}
      />

      {activeTab === 'agentarts' ? <AgentArtsPanel /> : null}

      {activeTab === 'overview' ? (
        <div className="adm-section">
          <div className="ui-stat-row">
            <StatTile icon={<MessageOutlined />} label="今日问答" value={data?.today_queries ?? 0} hint="含实时增量" />
            <StatTile icon={<BarChartOutlined />} label="本周问答" value={data?.week_queries ?? 0} />
            <StatTile icon={<TeamOutlined />} label="累计问答" value={data?.total_queries ?? 0} hint="历史全量" />
            <StatTile icon={<SmileOutlined />} label="平均满意度" value={data?.avg_satisfaction ?? 0} suffix="%" />
            <StatTile icon={<BookOutlined />} label="知识分块" value={data?.total_knowledge_chunks ?? 0} />
            <StatTile icon={<EnvironmentOutlined />} label="登记景点" value={data?.total_spots ?? 0} />
          </div>

          <div className="adm-grid adm-grid--2">
            <section className="ui-panel">
              <PanelHead eyebrow="SENTIMENT" title="情感分布" sub="近 7 天问答的情绪占比" />
              <ReactECharts option={satisfactionOption} style={{ height: 250 }} />
            </section>
            <section className="ui-panel">
              <PanelHead eyebrow="TREND" title="满意度趋势" sub="每日平均分（0–5）" />
              <ReactECharts option={trendOption} style={{ height: 250 }} />
            </section>
          </div>

          <div className="adm-grid adm-grid--2">
            <section className="ui-panel">
              <PanelHead eyebrow="HOURLY" title="时段分布" sub="近 7 天各小时提问量" />
              <ReactECharts option={hourlyOption} style={{ height: 250 }} />
            </section>
            <section className="ui-panel">
              <PanelHead eyebrow="TOP 10" title="热点问题" sub="按提问次数排序" />
              {topQuestions.length === 0 ? (
                <p className="ui-empty">暂无热点数据</p>
              ) : (
                <ul className="ui-list">
                  {topQuestions.map((q, i) => (
                    <li key={q.question} className="ui-list-row">
                      <span className={`ui-rank${i < 3 ? ' is-top' : ''}`}>{i + 1}</span>
                      <span className="ui-list-main" title={q.question}>
                        {q.question}
                      </span>
                      <span className="ui-list-meta">{q.count} 次</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      ) : null}

      {activeTab === 'detail' ? (
        <div className="adm-section">
          <section className="ui-panel">
            <div className="adm-filterbar">
              <Select
                placeholder="问题分类"
                allowClear
                style={{ width: 132 }}
                onChange={v => setConvFilters(f => ({ ...f, category: v || undefined }))}
                options={[
                  { value: 'ticket', label: '票价' },
                  { value: 'route', label: '路线' },
                  { value: 'history', label: '历史' },
                  { value: 'facility', label: '设施' },
                  { value: 'other', label: '其他' },
                ]}
              />
              <Input
                placeholder="搜索关键词"
                prefix={<SearchOutlined />}
                style={{ width: 220 }}
                onPressEnter={e => {
                  const v = (e.target as HTMLInputElement).value;
                  setConvFilters(f => ({ ...f, keyword: v || undefined }));
                }}
              />
              <Button type="primary" icon={<SearchOutlined />} onClick={handleQuery}>
                查询
              </Button>
              <Button
                icon={<ReloadOutlined />}
                onClick={() => {
                  setConvFilters({});
                  void fetchConversations(1, {});
                }}
              >
                重置
              </Button>
              <Button icon={<DownloadOutlined />} onClick={handleExportCSV}>
                导出
              </Button>
              <span className="adm-filterbar-note">共 {convTotal} 条记录</span>
            </div>
          </section>

          <section className="ui-panel ui-panel--flush">
            <Table
              columns={convColumns}
              dataSource={convList}
              rowKey="id"
              loading={convLoading}
              size="small"
              pagination={{
                current: convPage,
                total: convTotal,
                pageSize: 20,
                showTotal: t => `共 ${t} 条`,
                onChange: p => void fetchConversations(p, convFilters),
              }}
              scroll={{ x: 1000 }}
            />
          </section>
        </div>
      ) : null}

      {activeTab === 'satisfaction' ? (
        <div className="adm-section">
          <section className="ui-panel">
            <PanelHead eyebrow="CATEGORY" title="问题分类分布" sub="按分类聚合的提问占比" />
            <ReactECharts option={categoryOption} style={{ height: 290 }} />
          </section>

          <section className="ui-panel">
            <PanelHead eyebrow="TREND 30D" title="满意度趋势（近 30 天）" sub="每日平均分" />
            <ReactECharts
              option={{
                ...trendOption,
                xAxis: {
                  ...trendOption.xAxis,
                  data: (data?.satisfaction_trend || []).slice(-30).map(d => d.date.slice(5)),
                },
                series: [
                  { ...trendOption.series[0], data: (data?.satisfaction_trend || []).slice(-30).map(d => d.score) },
                ],
              }}
              style={{ height: 250 }}
            />
          </section>

          {locations.length > 0 ? (
            <section className="ui-panel ui-panel--flush">
              <div className="adm-panel-inline-head">
                <PanelHead eyebrow="GEO" title="游客位置分布（脱敏）" sub="仅保留聚合坐标与访问次数" />
              </div>
              <Table
                dataSource={locations}
                columns={[
                  { title: '纬度', dataIndex: 'lat', key: 'lat', render: (v: number) => <span className="adm-mono-cell">{v.toFixed(4)}</span> },
                  { title: '经度', dataIndex: 'lng', key: 'lng', render: (v: number) => <span className="adm-mono-cell">{v.toFixed(4)}</span> },
                  {
                    title: '访问次数',
                    dataIndex: 'count',
                    key: 'count',
                    align: 'right' as const,
                    render: (v: number) => <Tag color="blue">{v}</Tag>,
                  },
                ]}
                rowKey={(r: LocationPoint) => `${r.lat},${r.lng}`}
                size="small"
                pagination={false}
              />
            </section>
          ) : null}
        </div>
      ) : null}
    </AdminShell>
  );
}

function PanelHead({ eyebrow, title, sub }: { eyebrow: string; title: string; sub: string }) {
  return (
    <div className="ui-panel-head">
      <div className="ui-panel-heading">
        <span className="ui-eyebrow">{eyebrow}</span>
        <h2 className="ui-panel-title">{title}</h2>
        <p className="ui-panel-sub">{sub}</p>
      </div>
    </div>
  );
}

function StatTile({
  icon,
  label,
  value,
  suffix,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  suffix?: string;
  hint?: string;
}) {
  return (
    <div className="ui-stat">
      <span className="ui-stat-head">
        {icon}
        {label}
      </span>
      <span className="ui-stat-value">
        {value.toLocaleString('zh-CN')}
        {suffix ? <small>{suffix}</small> : null}
      </span>
      {hint ? <span className="ui-stat-hint">{hint}</span> : null}
    </div>
  );
}
