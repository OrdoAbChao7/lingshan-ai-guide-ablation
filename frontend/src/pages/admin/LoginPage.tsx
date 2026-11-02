/**
 * 管理后台登录页（品牌门面）。
 *
 * 设计要点：
 *  - 左侧品牌叙事区 / 右侧表单区，1280 以上分栏，小屏折叠为顶部品牌条；
 *  - 复用游客端的 --zen-* 品牌令牌（灵山朱 × 描金 × 宣纸），与游客端同源；
 *  - 品牌标记为几何 SVG，不用 emoji 充当结构化图标；
 *  - 仅做视觉层重写，登录逻辑与错误提示保持原行为（AdminFlows 测试依赖）。
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Form, Input, Button, Typography, message } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import axios from 'axios';
import { adminAPI } from '../../services/api';
import { LingMark } from '../../components/brand/LingMark';
import './LoginPage.css';

const { Title } = Typography;

export default function AdminLoginPage() {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const onFinish = async (values: { username: string; password: string }) => {
    setLoading(true);
    try {
      const res = await adminAPI.login(values.username, values.password);
      localStorage.setItem('admin_token', res.data.access_token);
      localStorage.setItem('admin_user', JSON.stringify(res.data));
      message.success('登录成功！');
      navigate('/admin/dashboard');
    } catch (err: unknown) {
      const errorMessage = axios.isAxiosError<{ error?: string }>(err) ? err.response?.data?.error : undefined;
      message.error(errorMessage || '登录失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="lp-root">
      <section className="lp-brand" aria-label="系统简介">
        <div className="lp-brand-inner">
          <div className="lp-lockup">
            <span className="lp-lockup-mark">
              <LingMark size={26} />
            </span>
            <span className="lp-lockup-text">
              <strong>灵小禅</strong>
              <em>Lingshan AI Guide</em>
            </span>
          </div>

          <h1 className="lp-headline">
            灵山胜境
            <span>可信文旅决策智能体</span>
          </h1>
          <p className="lp-lede">
            软硬解耦：大模型负责语义理解与温度，运筹引擎负责物理拓扑、演出时间窗与形式化守恒仲裁。
          </p>

          <ul className="lp-points">
            <li>
              <span className="lp-point-index">01</span>
              <span>
                <b>事实可信</b>三路并行检索 + RRF 融合 + 官方指南置顶，答案可追溯到条文。
              </span>
            </li>
            <li>
              <span className="lp-point-index">02</span>
              <span>
                <b>物理可走</b>23 节点路网与无障碍过滤，时间不足时诚实拒绝而非编造路线。
              </span>
            </li>
            <li>
              <span className="lp-point-index">03</span>
              <span>
                <b>安全可审</b>SkyGuard 独立校验器与四态状态机，方案不自证、历史不可改写。
              </span>
            </li>
          </ul>

          <p className="lp-brand-foot">
            管理后台用于知识库、数字人与安全域的运维；游客侧请使用
            <button type="button" className="lp-inline-link" onClick={() => navigate('/')}>
              游客端
            </button>
            。
          </p>
        </div>
        <div className="lp-brand-orbs" aria-hidden="true" />
      </section>

      <section className="lp-panel">
        <div className="lp-card">
          <header className="lp-card-head">
            <span className="lp-card-eyebrow">ADMIN CONSOLE</span>
            <Title level={3} className="lp-card-title">
              管理后台登录
            </Title>
            <p className="lp-card-sub">灵山胜境 AI 数字人导游系统</p>
          </header>

          <Form onFinish={onFinish} size="large" className="lp-form" requiredMark={false}>
            <Form.Item name="username" rules={[{ required: true, message: '请输入用户名' }]}>
              <Input prefix={<UserOutlined />} placeholder="用户名" autoComplete="username" />
            </Form.Item>
            <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
              <Input.Password prefix={<LockOutlined />} placeholder="密码" autoComplete="current-password" />
            </Form.Item>
            <Form.Item className="lp-form-submit">
              <Button
                type="primary"
                htmlType="submit"
                loading={loading}
                block
                style={{
                  background: 'linear-gradient(120deg, var(--zen-red-dark), var(--zen-red))',
                  border: 'none',
                  height: 46,
                  borderRadius: 10,
                  fontWeight: 600,
                  letterSpacing: '0.04em',
                  boxShadow: '0 8px 20px rgba(196, 29, 127, 0.22)',
                }}
              >
                登 录
              </Button>
            </Form.Item>
          </Form>

          <div className="lp-card-foot">
            <Button type="link" className="lp-back" onClick={() => navigate('/')}>
              ← 返回游客端
            </Button>
            <span className="lp-card-note">写操作需要管理员身份 · 审计留痕</span>
          </div>
        </div>

        <p className="lp-legal">本系统为参赛原型，账号与数据均未用于生产环境。</p>
      </section>
    </div>
  );
}
