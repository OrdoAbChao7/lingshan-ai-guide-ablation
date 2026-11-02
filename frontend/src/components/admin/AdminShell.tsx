/**
 * 管理后台统一壳层：墨色侧栏 + 白色顶栏 + 内容区。
 *
 * 四个后台页面（概览/知识库/数字人/感受度报告）都套这一层，
 * 保证导航位置、标题层级、留白节奏完全一致——这是"风格统一"的落点，
 * 而不是每个页面各自复制一份顶栏。
 */
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChartOutlined,
  BookOutlined,
  DashboardOutlined,
  LogoutOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
  HomeOutlined,
} from '@ant-design/icons';
import { LingMark } from '../brand/LingMark';

export type AdminSection = 'dashboard' | 'knowledge' | 'digital-human' | 'reports';

const PRIMARY_NAV: Array<{ key: AdminSection; label: string; path: string; icon: ReactNode }> = [
  { key: 'dashboard', label: '运营概览', path: '/admin/dashboard', icon: <DashboardOutlined /> },
  { key: 'knowledge', label: '知识库', path: '/admin/knowledge', icon: <BookOutlined /> },
  { key: 'digital-human', label: '数字人形象', path: '/admin/digital-human', icon: <SettingOutlined /> },
  { key: 'reports', label: '游客感受度', path: '/admin/reports', icon: <BarChartOutlined /> },
];

interface AdminShellProps {
  active: AdminSection;
  title: string;
  subtitle: string;
  actions?: ReactNode;
  children: ReactNode;
}

export default function AdminShell({ active, title, subtitle, actions, children }: AdminShellProps) {
  const navigate = useNavigate();

  const logout = () => {
    localStorage.clear();
    navigate('/admin/login');
  };

  return (
    <div className="adm-shell">
      <aside className="adm-sidebar" aria-label="后台导航">
        <div className="adm-brand">
          <span className="adm-brand-mark">
            <LingMark size={24} />
          </span>
          <span className="adm-brand-text">
            <strong>灵小禅</strong>
            <em>ADMIN CONSOLE</em>
          </span>
        </div>

        <nav className="adm-nav-group" aria-label="主导航">
          <span className="adm-nav-label">运营</span>
          {PRIMARY_NAV.map(item => (
            <button
              key={item.key}
              type="button"
              className={`adm-nav-item${active === item.key ? ' is-active' : ''}`}
              aria-current={active === item.key ? 'page' : undefined}
              onClick={() => navigate(item.path)}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>

        <nav className="adm-nav-group" aria-label="安全域">
          <span className="adm-nav-label">安全</span>
          <button type="button" className="adm-nav-item" onClick={() => navigate('/command-center')}>
            <SafetyCertificateOutlined />
            SkyGuard 指挥大屏
          </button>
        </nav>

        <div className="adm-sidebar-foot">
          <button type="button" className="adm-nav-item" onClick={() => navigate('/')}>
            <HomeOutlined />
            返回游客端
          </button>
          <button type="button" className="adm-nav-item" onClick={logout}>
            <LogoutOutlined />
            退出登录
          </button>
        </div>
      </aside>

      <main className="adm-main">
        <header className="adm-topbar">
          <div className="adm-topbar-title">
            <h1>{title}</h1>
            <p>{subtitle}</p>
          </div>
          {actions ? <div className="adm-topbar-actions">{actions}</div> : null}
        </header>
        <div className="adm-content">{children}</div>
      </main>
    </div>
  );
}
