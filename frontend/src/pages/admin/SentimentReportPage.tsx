/**
 * 游客感受度报告（/admin/reports）。
 * 版式：周期切换（顶栏） → 情感分布 + 数据概览 → 热门话题 + 景点关注度 → AI 总结。
 */
import { useState, useEffect } from 'react';
import { Button, Radio, Progress } from 'antd';
import { ReloadOutlined, SmileOutlined, MehOutlined, FrownOutlined, WarningOutlined } from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import { adminAPI } from '../../services/api';
import AdminShell from '../../components/admin/AdminShell';
import './SentimentReportPage.css';

/** 轻量 Markdown → HTML（保留转义，样式交给 CSS 类，不写内联色值） */
function renderMarkdown(md: string): string {
  if (!md) return '<p class="rp-empty">暂无分析数据</p>';
  let html = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/^#### (.+)$/gm, '<h5 class="rp-h5">$1</h5>')
    .replace(/^### (.+)$/gm, '<h4 class="rp-h4">$1</h4>')
    .replace(/^## (.+)$/gm, '<h3 class="rp-h3">$1</h3>')
    .replace(/^# (.+)$/gm, '<h2 class="rp-h2">$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^- (.+)$/gm, '<li class="rp-li">$1</li>')
    .replace(/^ {2}- (.+)$/gm, '<li class="rp-li rp-li-2">$1</li>')
    .replace(/^\d+\. (.+)$/gm, '<li class="rp-li">$1</li>')
    .replace(/^---$/gm, '<hr class="rp-hr">')
    .replace(/^> (.+)$/gm, '<blockquote class="rp-quote">$1</blockquote>')
    .replace(/`([^`]+)`/g, '<code class="rp-code">$1</code>')
    .replace(/\n\n/g, '</p><p class="rp-p">')
    .replace(/\n/g, '<br>');

  html = html.replace(/((?:<li[^>]*>.*?<\/li><br>?)+)/g, match => '<ul class="rp-ul">' + match.replace(/<br>/g, '') + '</ul>');

  return '<p class="rp-p">' + html + '</p>';
}

interface SentimentDistribution { positive: number; neutral: number; negative: number; }
interface HotQuestion { question: string; count: number; }
interface TopSpot { name: string; mention_count: number; }
interface SentimentReport {
  sentiment_distribution: SentimentDistribution;
  total_queries: number;
  avg_sentiment: number;
  hot_questions: HotQuestion[];
  top_spots: TopSpot[];
  summary?: string;
}

const PERIODS = [
  { value: 'day', label: '今日' },
  { value: 'week', label: '本周' },
  { value: 'month', label: '本月' },
];

export default function SentimentReportPage() {
  const [period, setPeriod] = useState('week');
  const [data, setData] = useState<SentimentReport | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const loadReport = async (selectedPeriod: string) => {
    setError('');
    setData(null);
    setLoading(true);
    try {
      const res = await adminAPI.getSentimentReport(selectedPeriod);
      setData(res.data as SentimentReport);
    } catch (err: unknown) {
      console.error(err);
      const error_ = err as { response?: { data?: { error?: string } }; message?: string };
      setError(error_.response?.data?.error || error_.message || '加载失败，请刷新重试');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    queueMicrotask(() => {
      void loadReport(period);
    });
  }, [period]);

  const emotionOption = data
    ? {
        tooltip: { trigger: 'item' },
        color: ['#1f7a52', '#d4a853', '#c0392b'],
        series: [
          {
            type: 'pie',
            radius: ['52%', '74%'],
            center: ['50%', '50%'],
            itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 3 },
            label: {
              show: true,
              formatter: '{b}\n{d}%',
              color: '#5b5148',
              fontSize: 11,
              lineHeight: 16,
            },
            labelLine: { lineStyle: { color: 'rgba(36,28,24,0.2)' } },
            data: [
              { value: data.sentiment_distribution.positive, name: '正面' },
              { value: data.sentiment_distribution.neutral, name: '中性' },
              { value: data.sentiment_distribution.negative, name: '负面' },
            ],
          },
        ],
      }
    : {};

  return (
    <AdminShell
      active="reports"
      title="游客感受度"
      subtitle="情绪结构、热门话题与景点关注度 · 由真实问答日志聚合"
      actions={
        <>
          <Radio.Group
            value={period}
            onChange={e => setPeriod(e.target.value)}
            optionType="button"
            buttonStyle="solid"
            options={PERIODS}
            size="small"
          />
          <Button size="small" icon={<ReloadOutlined />} loading={loading} onClick={() => void loadReport(period)}>
            刷新
          </Button>
        </>
      }
    >
      {error ? (
        <section className="ui-panel">
          <div className="rp-error">
            <WarningOutlined className="rp-error-icon" />
            <h2>报告加载失败</h2>
            <p>{error}</p>
            <Button type="primary" onClick={() => void loadReport(period)}>
              重新加载
            </Button>
          </div>
        </section>
      ) : null}

      {!error && !data ? (
        <section className="ui-panel">
          <p className="ui-empty">正在聚合 {PERIODS.find(p => p.value === period)?.label}数据…</p>
        </section>
      ) : null}

      {!error && data ? (
        <>
          <div className="adm-grid adm-grid--2">
            <section className="ui-panel">
              <div className="ui-panel-head">
                <div className="ui-panel-heading">
                  <span className="ui-eyebrow">SENTIMENT</span>
                  <h2 className="ui-panel-title">情感分布</h2>
                  <p className="ui-panel-sub">按 {PERIODS.find(p => p.value === period)?.label} 的问答情绪占比</p>
                </div>
              </div>
              <ReactECharts option={emotionOption} style={{ height: 320 }} />
            </section>

            <section className="ui-panel">
              <div className="ui-panel-head">
                <div className="ui-panel-heading">
                  <span className="ui-eyebrow">OVERVIEW</span>
                  <h2 className="ui-panel-title">数据概览</h2>
                  <p className="ui-panel-sub">总咨询量与平均情感指数</p>
                </div>
              </div>

              <div className="rp-kpi-row">
                <div className="ui-stat">
                  <span className="ui-stat-head">总咨询量</span>
                  <span className="ui-stat-value">{data.total_queries.toLocaleString('zh-CN')}</span>
                </div>
                <div className="ui-stat">
                  <span className="ui-stat-head">平均情感指数</span>
                  <span className="ui-stat-value">
                    {data.avg_sentiment.toFixed(1)}
                    <small>%</small>
                  </span>
                </div>
              </div>

              <div className="rp-bars">
                <SentimentBar
                  icon={<SmileOutlined />}
                  label="正面"
                  value={data.sentiment_distribution.positive}
                  tone="ok"
                />
                <SentimentBar
                  icon={<MehOutlined />}
                  label="中性"
                  value={data.sentiment_distribution.neutral}
                  tone="warn"
                />
                <SentimentBar
                  icon={<FrownOutlined />}
                  label="负面"
                  value={data.sentiment_distribution.negative}
                  tone="danger"
                />
              </div>
            </section>
          </div>

          <div className="adm-grid adm-grid--2">
            <section className="ui-panel">
              <div className="ui-panel-head">
                <div className="ui-panel-heading">
                  <span className="ui-eyebrow">TOPICS</span>
                  <h2 className="ui-panel-title">热门话题</h2>
                </div>
              </div>
              {data.hot_questions.length === 0 ? (
                <p className="ui-empty">暂无话题数据</p>
              ) : (
                <ul className="ui-list">
                  {data.hot_questions.map((q, i) => (
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

            <section className="ui-panel">
              <div className="ui-panel-head">
                <div className="ui-panel-heading">
                  <span className="ui-eyebrow">SPOTS</span>
                  <h2 className="ui-panel-title">景点关注度</h2>
                </div>
              </div>
              {data.top_spots.length === 0 ? (
                <p className="ui-empty">暂无景点提及数据</p>
              ) : (
                <ul className="ui-list">
                  {data.top_spots.map((spot, i) => (
                    <li key={spot.name} className="ui-list-row">
                      <span className={`ui-rank${i < 3 ? ' is-top' : ''}`}>{i + 1}</span>
                      <span className="ui-list-main">{spot.name}</span>
                      <span className="ui-list-meta">提及 {spot.mention_count} 次</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <section className="ui-panel">
            <div className="ui-panel-head">
              <div className="ui-panel-heading">
                <span className="ui-eyebrow">AI SUMMARY</span>
                <h2 className="ui-panel-title">分析总结</h2>
                <p className="ui-panel-sub">由后端基于聚合指标生成，仅作为运营参考，不替代人工判断。</p>
              </div>
            </div>
            <div className="rp-prose" dangerouslySetInnerHTML={{ __html: renderMarkdown(data.summary || '') }} />
          </section>
        </>
      ) : null}
    </AdminShell>
  );
}

function SentimentBar({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: 'ok' | 'warn' | 'danger';
}) {
  return (
    <div className={`rp-bar rp-bar--${tone}`}>
      <span className="rp-bar-head">
        <span className="rp-bar-label">
          {icon}
          {label}
        </span>
        <span className="rp-bar-value">{value}%</span>
      </span>
      <Progress percent={value} showInfo={false} strokeColor="currentColor" railColor="rgba(36,28,24,0.08)" />
    </div>
  );
}
