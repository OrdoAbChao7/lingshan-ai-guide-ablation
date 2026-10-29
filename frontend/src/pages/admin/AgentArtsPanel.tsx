import { useState } from 'react';
import { Alert, Button, Card, Descriptions, Input, Select, Space, Steps, Table, Tag, Typography } from 'antd';
import api from '../../services/api';
import { isAxiosError } from 'axios';

interface Call { tool: string; latency_ms: number; result: { status: string } }
interface Decision {
  trace_id: string; status: string; execution_origin: string; latency_ms: number; calls?: Call[];
  error?: { message?: string };
  data?: {
    answer?: string; clarification?: string; reason?: string; missing_fields?: string[];
    validation?: { valid: boolean }; original_requirements_met?: boolean;
    route?: { totalMinutes: number; walkingMinutes: number; visitingMinutes: number;
      steps: Array<{ spotId: string; start: string; end: string; walkMinutes: number }> };
    evidence?: Array<{ name?: string; source?: string; text?: string; id?: string; spot_id?: string }>;
  };
}
const labels: Record<string, string> = { success: '已完成', needs_clarification: '需要补充信息',
  infeasible: '当前要求不可行', no_evidence: '没有可靠资料', error: '执行失败' };
const tools: Record<string, string> = { extract_scene_state: '解析需求', search_knowledge: '检索证据',
  plan_route: '计算路线', validate_route: '独立校验', suggest_alternative: '尝试替代方案' };

export default function AgentArtsPanel() {
  const [query, setQuery] = useState('现在上午9点，从南门出发，带行动不便的家人，只有90分钟，必须去梵宫');
  const [intent, setIntent] = useState<'route' | 'knowledge'>('route');
  const [result, setResult] = useState<Decision>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [supplement, setSupplement] = useState('');
  const [records, setRecords] = useState<unknown>();
  const [traceBusy, setTraceBusy] = useState(false);
  const submit = async (text = query) => {
    if (!text.trim()) return;
    setBusy(true); setResult(undefined); setError(''); setRecords(undefined);
    try { const response = await api.post<Decision>('/admin/agentarts/decide', { intent, query: text });
      setResult(response.data);
    } catch (failure) {
      const body = isAxiosError<Decision>(failure) ? failure.response?.data : undefined;
      if (body?.trace_id && body.status === 'error') setResult(body);
      setError(body?.error?.message || '执行未完成，请检查服务后重试。此次没有发布可行路线。');
    }
    finally { setBusy(false); }
  };
  const readTrace = async () => {
    if (!result) return;
    setTraceBusy(true); setError('');
    try { setRecords((await api.get(`/admin/agentarts/traces/${result.trace_id}`)).data); }
    catch { setError('执行记录读取失败，请重试。'); }
    finally { setTraceBusy(false); }
  };
  const data = result?.data;
  return <Space orientation="vertical" size={16} style={{ width: '100%', marginTop: 16 }}>
    <Alert type="info" showIcon title="AgentArts 接入调试 · 本地参考编排"
      description="此入口验证工具闭环和执行记录。AgentArts 平台工作流尚待真实联调，当前结果不能作为平台评测成绩。" />
    <Card title="验证游客需求">
      <Space orientation="vertical" size={12} style={{ width: '100%' }}>
        <Select aria-label="任务类型" value={intent} onChange={setIntent} style={{ width: 160 }}
          options={[{ value: 'route', label: '路线规划' }, { value: 'knowledge', label: '事实问答' }]} />
        <Input.TextArea aria-label="游客需求" rows={3} value={query} onChange={event => setQuery(event.target.value)} maxLength={4000} />
        <Button type="primary" loading={busy} disabled={!query.trim()} onClick={() => void submit()}>运行并校验</Button>
      </Space>
    </Card>
    {error && <Alert type="error" showIcon title={error} />}
    {result && <Card title={<Space><span>执行结果</span><Tag color={result.status === 'success' ? 'green' : 'orange'}>{labels[result.status] || result.status}</Tag></Space>}>
      <Descriptions column={{ xs: 1, md: 2 }} items={[
        { key: 'trace', label: '执行编号', children: <Typography.Text copyable>{result.trace_id}</Typography.Text> },
        { key: 'latency', label: '耗时', children: `${result.latency_ms} ms` },
        { key: 'validation', label: '独立校验', children: data?.validation ? (data.validation.valid ? '通过' : '未通过') : '本次未生成路线' },
      ]} />
      {data?.clarification && <Space orientation="vertical" style={{ width: '100%', marginBlock: 16 }}>
        <Alert type="warning" title="补充条件后继续" description={data.clarification} />
        <Input aria-label="补充条件" value={supplement} onChange={event => setSupplement(event.target.value)} placeholder="例如：现在上午9点" maxLength={1000} />
        <Button loading={busy} disabled={!supplement.trim()} onClick={() => {
          const text = `${query}，${supplement}`; setQuery(text); setSupplement(''); void submit(text);
        }}>补充并重新运行</Button>
      </Space>}
      {data?.reason && <Alert type="warning" title={data.reason} style={{ marginBlock: 16 }} />}
      {data?.original_requirements_met === false && data?.route && <Alert type="warning" title="这是调整软偏好后的替代方案，请核对变更后使用。" />}
      {data?.answer && <Typography.Paragraph style={{ whiteSpace: 'pre-wrap', marginTop: 16 }}>{data.answer}</Typography.Paragraph>}
      {data?.route && data.validation?.valid && <>
        <Typography.Paragraph>总耗时 {data.route.totalMinutes} 分钟，步行 {data.route.walkingMinutes} 分钟。结果依据登记的静态路网。</Typography.Paragraph>
        <Table pagination={false} size="small" rowKey="spotId" dataSource={data.route.steps} scroll={{ x: 480 }} columns={[
          { title: '景点', dataIndex: 'spotId', render: (id: string) => data.evidence?.find(item => item.spot_id === id)?.name || id },
          { title: '开始', dataIndex: 'start' }, { title: '结束', dataIndex: 'end' }, { title: '步行（分钟）', dataIndex: 'walkMinutes' },
        ]} />
      </>}
      <Steps orientation="vertical" size="small" style={{ marginTop: 20 }} items={result.calls?.map(call => ({
        title: tools[call.tool] || call.tool, description: `${labels[call.result.status] || call.result.status} · ${call.latency_ms} ms`, status: 'finish',
      }))} />
      {!!data?.evidence?.length && <details style={{ marginBlock: 16 }}><summary>查看证据来源</summary>{data.evidence.map((item, i) =>
        <Typography.Paragraph key={i}>{item.name || item.id}：{item.source}{item.text ? ` — ${item.text}` : ''}</Typography.Paragraph>)}</details>}
      <Button onClick={() => void readTrace()} loading={traceBusy}>读取完整执行记录</Button>
      {records !== undefined && <pre style={{ overflow: 'auto', maxHeight: 400, marginTop: 16, fontSize: 12 }}>{JSON.stringify(records, null, 2)}</pre>}
    </Card>}
  </Space>;
}
