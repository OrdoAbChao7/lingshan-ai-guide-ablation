/**
 * 知识库管理（/admin/knowledge）。
 * 版式：KPI 概要 → 文档管理（表格） → RAG 检索自测。
 */
import { useState, useEffect } from 'react';
import { Upload, Button, Table, Input, message, Popconfirm, Result, Typography } from 'antd';
import {
  UploadOutlined,
  ReloadOutlined,
  DeleteOutlined,
  FileTextOutlined,
  SearchOutlined,
  DatabaseOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import { adminAPI } from '../../services/api';
import AdminShell from '../../components/admin/AdminShell';
import './KnowledgeBasePage.css';

interface DocItem {
  id: string;
  name: string;
  size: number;
  date: string;
  status: string;
}

interface RetrievalResult {
  spot: string;
  field: string;
  score: number;
  text: string;
}

interface TestResult {
  retrieved_chunks?: number;
  results?: RetrievalResult[];
  error?: string;
}

const STATUS_META: Record<string, { label: string; className: string }> = {
  indexed: { label: '已索引', className: 'ui-tag--ok' },
  uploaded: { label: '已上传', className: 'ui-tag--info' },
  pending: { label: '待处理', className: 'ui-tag--warn' },
};

export default function KnowledgeBasePage() {
  const [uploading, setUploading] = useState(false);
  const [documents, setDocuments] = useState<DocItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [testLoading, setTestLoading] = useState(false);

  const loadDocuments = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/admin/knowledge/documents', {
        headers: { Authorization: `Bearer ${localStorage.getItem('admin_token')}` },
      });
      const data = await res.json();
      setDocuments(Array.isArray(data) ? data : []);
    } catch (_err) {
      console.error('Failed to load documents:', _err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    queueMicrotask(() => {
      void loadDocuments();
    });
  }, []);

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      await adminAPI.uploadDocument(file);
      message.success(`${file.name} 上传成功！正在处理中...`);
      void loadDocuments();
    } catch {
      message.error('上传失败');
    } finally {
      setUploading(false);
    }
    return false;
  };

  const handleRefreshIndex = async () => {
    try {
      await adminAPI.refreshIndex();
      message.success('索引刷新已提交');
      void loadDocuments();
    } catch {
      message.error('索引刷新失败');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await fetch(`/api/v1/admin/knowledge/documents/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${localStorage.getItem('admin_token')}` },
      });
      message.success('文档已删除');
      void loadDocuments();
    } catch {
      message.error('删除失败');
    }
  };

  const indexedCount = documents.filter(doc => doc.status === 'indexed').length;
  const pendingCount = documents.length - indexedCount;
  const totalSizeKb = documents.reduce((sum, doc) => sum + (doc.size || 0), 0) / 1024;

  return (
    <AdminShell
      active="knowledge"
      title="知识库管理"
      subtitle="上传官方资料、重建索引，并用真实问题验证检索命中"
      actions={
        <>
          <Upload beforeUpload={handleUpload} showUploadList={false}>
            <Button size="small" type="primary" icon={<UploadOutlined />} loading={uploading}>
              上传文档
            </Button>
          </Upload>
          <Button size="small" icon={<ReloadOutlined />} onClick={handleRefreshIndex}>
            重建索引
          </Button>
        </>
      }
    >
      <div className="ui-stat-row">
        <div className="ui-stat">
          <span className="ui-stat-head">
            <FileTextOutlined /> 文档总数
          </span>
          <span className="ui-stat-value">{documents.length}</span>
          <span className="ui-stat-hint">含上传与索引全流程</span>
        </div>
        <div className="ui-stat">
          <span className="ui-stat-head">
            <CheckCircleOutlined /> 已索引
          </span>
          <span className="ui-stat-value">{indexedCount}</span>
          <span className="ui-stat-hint">可被检索命中</span>
        </div>
        <div className="ui-stat">
          <span className="ui-stat-head">
            <ClockCircleOutlined /> 待处理
          </span>
          <span className="ui-stat-value">{pendingCount}</span>
          <span className="ui-stat-hint">上传后尚未建索引</span>
        </div>
        <div className="ui-stat">
          <span className="ui-stat-head">
            <DatabaseOutlined /> 语料体量
          </span>
          <span className="ui-stat-value">
            {totalSizeKb.toFixed(1)}
            <small>KB</small>
          </span>
          <span className="ui-stat-hint">原始文件大小合计</span>
        </div>
      </div>

      <section className="ui-panel ui-panel--flush">
        <div className="kb-panel-head">
          <div className="ui-panel-heading">
            <span className="ui-eyebrow">CORPUS</span>
            <h2 className="ui-panel-title">知识文档</h2>
            <p className="ui-panel-sub">删除或重建索引会立即影响检索结果，请谨慎操作。</p>
          </div>
        </div>
        <Table
          dataSource={documents}
          loading={loading}
          columns={[
            {
              title: '文档名称',
              dataIndex: 'name',
              key: 'name',
              render: (t: string) => (
                <span className="kb-doc-name">
                  <FileTextOutlined />
                  {t}
                </span>
              ),
            },
            {
              title: '大小',
              dataIndex: 'size',
              key: 'size',
              width: 100,
              align: 'right' as const,
              render: (s: number) => <span className="kb-mono">{s ? `${(s / 1024).toFixed(1)} KB` : '—'}</span>,
            },
            {
              title: '状态',
              dataIndex: 'status',
              key: 'status',
              width: 100,
              render: (s: string) => (
                <span className={`ui-tag ${STATUS_META[s]?.className ?? 'ui-tag--warn'}`}>
                  {STATUS_META[s]?.label ?? '待处理'}
                </span>
              ),
            },
            {
              title: '上传日期',
              dataIndex: 'date',
              key: 'date',
              width: 130,
              render: (d: string) => <span className="kb-mono u-muted">{d}</span>,
            },
            {
              title: '操作',
              key: 'action',
              width: 80,
              align: 'right' as const,
              render: (_value: unknown, record: DocItem) => (
                <Popconfirm title="确定删除此文档？" onConfirm={() => void handleDelete(record.id)}>
                  <Button type="text" size="small" danger icon={<DeleteOutlined />} aria-label={`删除 ${record.name}`} />
                </Popconfirm>
              ),
            },
          ]}
          rowKey="id"
          pagination={false}
          locale={{ emptyText: <span className="ui-empty">暂无文档，请上传知识文档</span> }}
        />
      </section>

      <section className="ui-panel">
        <div className="ui-panel-head">
          <div className="ui-panel-heading">
            <span className="ui-eyebrow">RETRIEVAL CHECK</span>
            <h2 className="ui-panel-title">RAG 检索自测</h2>
            <p className="ui-panel-sub">输入真实游客问题，检查知识库是否命中正确景点与字段。</p>
          </div>
        </div>

        <Input.Search
          placeholder="例如：灵山大佛有多高？"
          enterButton={
            <>
              <SearchOutlined /> 测试
            </>
          }
          size="large"
          loading={testLoading}
          onSearch={async v => {
            setTestLoading(true);
            setTestResult(null);
            try {
              const token = localStorage.getItem('admin_token');
              const res = await fetch(`/api/v1/admin/knowledge/test-qa?query=${encodeURIComponent(v)}`, {
                headers: { Authorization: `Bearer ${token}` },
              });
              setTestResult((await res.json()) as TestResult);
            } catch {
              setTestResult({ error: '测试请求失败' });
            } finally {
              setTestLoading(false);
            }
          }}
        />

        {testResult && !testResult.error ? (
          <div className="kb-results">
            <div className="kb-results-head">
              <span>命中结果</span>
              <span className={`ui-tag ${(testResult.retrieved_chunks ?? 0) > 0 ? 'ui-tag--ok' : 'ui-tag--danger'}`}>
                {testResult.retrieved_chunks ?? 0} 条
              </span>
            </div>
            {(testResult.results?.length ?? 0) === 0 ? (
              <p className="ui-empty">未找到匹配的景点数据</p>
            ) : (
              <ul className="kb-result-list">
                {testResult.results?.map((r, i) => (
                  <li key={i} className="kb-result">
                    <div className="kb-result-tags">
                      <span className="ui-tag ui-tag--brand">{r.spot}</span>
                      <span className="ui-tag ui-tag--info">{r.field}</span>
                      <span className="ui-tag">相关度 {r.score}</span>
                    </div>
                    <p className="kb-result-text">{r.text}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}

        {testResult?.error ? <Result status="error" title="测试失败" subTitle={testResult.error} /> : null}

        <p className="ui-note">
          检索链路：<span className="kb-mono">Promise.all</span> 三路并行（向量 / 结构化 / 关键词）→ RRF 融合(
          <span className="kb-mono">k=60</span>) → Cross-Encoder 重排 → 官方指南置顶兜底。
        </p>
      </section>

      <Typography.Paragraph className="ui-note kb-footnote">
        文档上传由后端 <span className="kb-mono">multer</span> 接收并写入{' '}
        <span className="kb-mono">data/kb_docs/</span>；矢量库不可用时检索会降级为关键词匹配，页面不隐藏该降级。
      </Typography.Paragraph>
    </AdminShell>
  );
}
