import { useNavigate } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { Typography, Card, Row, Col, Tag, Button } from 'antd';
import {
  MessageOutlined, CompassOutlined, SoundOutlined,
  SmileOutlined, EnvironmentOutlined, RobotOutlined,
  ThunderboltOutlined, StarFilled, SettingOutlined,
  AimOutlined, LoadingOutlined, RightOutlined,
  ColumnHeightOutlined, TagsOutlined, ClockCircleOutlined,
  StarOutlined, ReadOutlined, ManOutlined, ShopOutlined,
  HeartOutlined, LoginOutlined, InfoCircleOutlined,
  HomeOutlined, CoffeeOutlined, CarOutlined, WarningOutlined,
} from '@ant-design/icons';
import { LingMark } from '../../components/brand/LingMark';
import { openBaiduNavigation, type LatLng } from '../../utils/navigation';
import { getCapabilityRoute } from './home-capabilities';
import './HomePage.css';

const { Title, Paragraph, Text } = Typography;

interface NearbySpot {
  name: string;
  lat: number;
  lng: number;
  desc: string;
  distance: number;
}

interface Facility {
  uid?: string;
  name: string;
  lat?: number;
  lng?: number;
  distance: number;
}

const HERO_PARTICLES = Array.from({ length: 24 }, (_, id) => ({
  id,
  left: `${(id * 4.2 + 3) % 98}%`,
  animationDelay: `${(id * 0.28) % 4}s`,
  animationDuration: `${4 + (id % 5)}s`,
  size: `${2 + (id % 3)}px`,
}));

const SPOT_CARDS = [
  { name: '灵山大佛', desc: '88米世界最高青铜立佛', icon: <img src="/lingshan_dafo.jpg" alt="灵山大佛" style={{ width: '56px', height: '56px', objectFit: 'cover' }} />, color: '#c41d7f' },
  { name: '九龙灌浴', desc: '花开见佛的震撼演出', icon: <img src="/jiulong_guanyu.jpg" alt="九龙灌浴" style={{ width: '56px', height: '56px', objectFit: 'cover' }} />, color: '#1890ff' },
  { name: '灵山梵宫', desc: '东方卢浮宫艺术殿堂', icon: <img src="/lingshan_fangong.jpg" alt="灵山梵宫" style={{ width: '56px', height: '56px', objectFit: 'cover' }} />, color: '#d4a853' },
  { name: '五印坛城', desc: '藏传佛教文化瑰宝', icon: <img src="/wuyin_tancheng.jpg" alt="五印坛城" style={{ width: '56px', height: '56px', objectFit: 'cover' }} />, color: '#e91e63' },
  { name: '祥符禅寺', desc: '千年古刹历史遗存', icon: <img src="/xiangfu_temple.jpg" alt="祥符禅寺" style={{ width: '56px', height: '56px', objectFit: 'cover' }} />, color: '#722ed1' },
  { name: '拈花湾', desc: '禅意小镇慢生活', icon: <img src="/nianhua_wan.jpg" alt="拈花湾" style={{ width: '56px', height: '56px', objectFit: 'cover' }} />, color: '#eb2f96' },
];

const HOT_QUESTIONS = [
  { q: '灵山大佛有多高？', icon: <ColumnHeightOutlined /> },
  { q: '门票价格是多少？', icon: <TagsOutlined /> },
  { q: '九龙灌浴表演时间？', icon: <ClockCircleOutlined /> },
  { q: '游览路线推荐？', icon: <CompassOutlined /> },
  { q: '梵宫有什么好看的？', icon: <StarOutlined /> },
  { q: '灵山的历史渊源？', icon: <ReadOutlined /> },
];

export default function HomePage() {
  const navigate = useNavigate();
  const heroVisible = true;
  const [scrollY, setScrollY] = useState(0);
  const [activeSection, setActiveSection] = useState('top');
  const [showDhBubble, setShowDhBubble] = useState(false);
  const [dhBubbleText, setDhBubbleText] = useState('您好！我是灵山专属 AI 导游小灵，滑累了吗？随时点我为您指路解惑哦~');

  const [locating, setLocating] = useState(false);
  const [nearbySpots, setNearbySpots] = useState<NearbySpot[] | null>(null);
  const [geoError, setGeoError] = useState('');
  const [activeCategory, setActiveCategory] = useState('spots');
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [facilitiesLoading, setFacilitiesLoading] = useState(false);
  const lastFixRef = useRef<LatLng | null>(null);

  const scrollToId = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  // Scroll detection for sticky topbar & scroll-spy
  useEffect(() => {
    const handleScroll = () => {
      const y = window.scrollY;
      setScrollY(y);

      const sections = ['top', 'capabilities', 'spots', 'questions', 'nearby'];
      for (let i = sections.length - 1; i >= 0; i--) {
        const el = document.getElementById(sections[i]);
        if (el) {
          const rect = el.getBoundingClientRect();
          if (rect.top <= 180) {
            setActiveSection(sections[i]);
            break;
          }
        }
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    const bubbleTimer = setTimeout(() => setShowDhBubble(true), 2400);

    return () => {
      window.removeEventListener('scroll', handleScroll);
      clearTimeout(bubbleTimer);
    };
  }, []);

  // WGS84 坐标（与浏览器 GPS 同一坐标系）。灵山大佛/祥符禅寺/九龙灌浴/梵宫/五印坛城/拈花湾取自 OSM 实测，
  // 其余按景区中轴线与拈花湾路网布局推算，精度约 ±100m
  const ALL_SPOTS_WITH_COORDS: Array<Omit<NearbySpot, 'distance'>> = [
    { name: '灵山大佛', lat: 31.43205, lng: 120.09151, desc: '88米世界最高青铜立佛，登顶抱佛脚俯瞰太湖' },
    { name: '九龙灌浴', lat: 31.42662, lng: 120.09523, desc: '大型音乐群雕，花开见佛九龙吐水' },
    { name: '灵山梵宫', lat: 31.43065, lng: 120.09756, desc: '东方卢浮宫，佛教艺术殿堂' },
    { name: '五印坛城', lat: 31.42664, lng: 120.09813, desc: '藏传佛教风格，有小布达拉宫之称' },
    { name: '祥符禅寺', lat: 31.42986, lng: 120.09309, desc: '唐代千年古刹，灵山佛教文化发源地' },
    { name: '拈花湾', lat: 31.42112, lng: 120.07161, desc: '禅意小镇，慢生活体验' },
    { name: '灵山大照壁', lat: 31.42250, lng: 120.09740, desc: '华夏第一壁，赵朴初题字' },
    { name: '菩提大道', lat: 31.42400, lng: 120.09670, desc: '250米印度菩提树拱廊，禅意漫步' },
    { name: '百子戏弥勒', lat: 31.42540, lng: 120.09760, desc: '青铜群雕，摸弥勒肚皮享福气' },
    { name: '曼飞龙塔', lat: 31.42800, lng: 120.09900, desc: '复刻西双版纳白塔，异域风情' },
    { name: '无尽意斋', lat: 31.43050, lng: 120.09180, desc: '赵朴初先生纪念馆，禅茶品鉴' },
    { name: '佛足坛', lat: 31.42330, lng: 120.09700, desc: '青铜巨型佛足印，触摸祈福' },
    { name: '五智门', lat: 31.42460, lng: 120.09630, desc: '汉白玉牌坊，五门象征五方五佛' },
    { name: '降魔浮雕', lat: 31.42500, lng: 120.09610, desc: '巨型石雕，再现佛陀降魔成道' },
    { name: '阿育王柱', lat: 31.42530, lng: 120.09590, desc: '整块花岗岩雕刻，重180吨' },
    { name: '梵天花海', lat: 31.41960, lng: 120.07620, desc: '30000㎡四季花海，拍照圣地' },
    { name: '香月花街', lat: 31.41950, lng: 120.07080, desc: '800米禅意商业街，非遗手作' },
    { name: '五灯湖', lat: 31.42000, lng: 120.07280, desc: '小镇最大水景，夜间灯光秀' },
    { name: '鹿鸣谷', lat: 31.42430, lng: 120.07630, desc: '山林幽静区，听鹿鸣山涧' },
    { name: '佛教文化博览馆', lat: 31.43205, lng: 120.09151, desc: '大佛座基内万佛殿，免费讲解' },
    { name: '拈花广场', lat: 31.41780, lng: 120.06950, desc: '拈花湾入口，禅意开园仪式' },
  ];

  function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  const handleLocate = () => {
    setLocating(true);
    setGeoError('');
    setNearbySpots(null);

    if (!navigator.geolocation) {
      setGeoError('您的浏览器不支持定位，请手动选择景点。');
      setLocating(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        lastFixRef.current = { lat: latitude, lng: longitude };
        const sorted = ALL_SPOTS_WITH_COORDS
          .map(s => ({ ...s, distance: Math.round(haversineM(latitude, longitude, s.lat, s.lng)) }))
          .sort((a, b) => a.distance - b.distance);
        setNearbySpots(sorted);
        setLocating(false);
      },
      (err) => {
        setGeoError(err.code === 1 ? '定位被拒绝，请允许浏览器访问位置。' : '定位失败，请检查网络后重试。');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  };

  const fetchFacilities = async (type: string) => {
    setActiveCategory(type);
    if (type === 'spots') return;
    setFacilitiesLoading(true);
    try {
      let url = `/api/v1/visitor/nearby-facilities?type=${type}`;
      if (lastFixRef.current) {
        url += `&lat=${lastFixRef.current.lat}&lng=${lastFixRef.current.lng}`;
      }
      const res = await fetch(url);
      const data = await res.json();
      console.log('设施数据:', data);
      setFacilities(data.facilities || []);
    } catch {
      setFacilities([]);
    } finally {
      setFacilitiesLoading(false);
    }
  };

  const CATEGORIES = [
    { key: 'spots', label: '景点', icon: <EnvironmentOutlined /> },
    { key: 'toilet', label: '厕所', icon: <ManOutlined /> },
    { key: 'shop', label: '商店', icon: <ShopOutlined /> },
    { key: 'nursery', label: '母婴室', icon: <HeartOutlined /> },
    { key: 'entrance', label: '出入口', icon: <LoginOutlined /> },
    { key: 'visitor_center', label: '游客中心', icon: <InfoCircleOutlined /> },
    { key: 'ticket', label: '售票处', icon: <TagsOutlined /> },
    { key: 'hotel', label: '住宿', icon: <HomeOutlined /> },
    { key: 'rest', label: '休息区', icon: <CoffeeOutlined /> },
    { key: 'sightseeing', label: '观光车站', icon: <CarOutlined /> },
  ];

  // Parallax calculations
  const heroTranslateY = Math.min(160, scrollY * 0.28);
  const heroOpacity = Math.max(0, 1 - scrollY / 460);
  const heroScale = Math.max(0.94, 1 - scrollY / 1800);

  return (
    <div className="home-page">
      {/* ==================== Sticky Frosted Glass Topbar ==================== */}
      <header
        className={`sticky-nav ${scrollY > 80 ? 'visible' : ''}`}
        data-testid="sticky-nav"
      >
        <div className="sticky-nav__inner">
          <div className="sticky-nav__brand" onClick={() => scrollToId('top')}>
            <span className="sticky-nav__logo"><LingMark size={26} /></span>
            <div>
              <div className="sticky-nav__title">灵山胜境</div>
              <div className="sticky-nav__subtitle">AI 数字人导游</div>
            </div>
          </div>

          <nav className="sticky-nav__links">
            {[
              { id: 'capabilities', label: '核心能力' },
              { id: 'spots', label: '核心景点' },
              { id: 'questions', label: '大家都在问' },
              { id: 'nearby', label: '附近景点' },
            ].map(item => (
              <button
                key={item.id}
                className={`sticky-nav__link ${activeSection === item.id ? 'active' : ''}`}
                onClick={() => scrollToId(item.id)}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="sticky-nav__actions">
            <button
              className="sticky-nav__cta"
              onClick={() => navigate('/qa')}
              aria-label="即刻与数字人对话"
            >
              <MessageOutlined /> 与数字人对话
            </button>
          </div>
        </div>
      </header>

      {/* ==================== Desktop Side Quick Dock ==================== */}
      <nav className="side-nav">
        {[
          { id: 'top', label: '顶部' },
          { id: 'capabilities', label: '核心能力' },
          { id: 'spots', label: '核心景点' },
          { id: 'questions', label: '大家都在问' },
          { id: 'nearby', label: '附近景点' },
        ].map(item => (
          <button
            key={item.id}
            className={`side-nav__item ${activeSection === item.id ? 'active' : ''}`}
            onClick={() => scrollToId(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {/* ==================== Hero Section with Zen Parallax ==================== */}
      <section id="top" className="home-hero">
        <div className="hero-particles">
          {HERO_PARTICLES.map((particle) => (
            <div
              key={particle.id}
              className="hero-particle"
              style={{
                left: particle.left,
                width: particle.size,
                height: particle.size,
                animationDelay: particle.animationDelay,
                animationDuration: particle.animationDuration,
              }}
            />
          ))}
        </div>

        <div
          className={`hero-content ${heroVisible ? 'visible' : ''}`}
          style={{
            transform: `translateY(${heroTranslateY}px) scale(${heroScale})`,
            opacity: heroOpacity,
          }}
        >
          <div className="hero-badge">
            <StarFilled style={{ color: '#FFD700', marginRight: 6 }} />
            国家 5A 级旅游景区 · 东方禅意智慧行
          </div>
          <div className="hero-icon"><LingMark size={54} strokeWidth={1.1} /></div>
          <Title level={1} className="hero-title">
            灵山胜境
          </Title>
          <Title level={2} className="hero-subtitle">
            AI 数字人导游
          </Title>
          <Paragraph className="hero-desc">
            7×24 小时在线 · 智能问答 · 语音交互 · 情感陪伴<br/>
            为您带来前所未有的沉浸式灵山之旅
          </Paragraph>
          <div className="hero-actions">
            <Button
              size="large"
              className="hero-btn primary"
              onClick={() => navigate('/qa')}
            >
              <MessageOutlined /> 开始对话
            </Button>
            <Button
              size="large"
              className="hero-btn secondary"
              onClick={() => navigate('/recommend')}
            >
              <CompassOutlined /> 智能推荐
            </Button>
          </div>
        </div>

        {/* Seamless Zen Wave Divider without conflicting gradient */}
        <div className="hero-transition-wrapper">
          <svg className="hero-wave-divider" viewBox="0 0 1200 120" preserveAspectRatio="none">
            <path d="M0,0 C150,90 350,-40 500,50 C650,140 900,10 1200,40 L1200,120 L0,120 Z" fill="currentColor" />
          </svg>
          <div
            className="scroll-hint"
            onClick={() => scrollToId('capabilities')}
            role="button"
            tabIndex={0}
            aria-label="向下滑动探索核心能力"
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                scrollToId('capabilities');
              }
            }}
          >
            <span className="scroll-hint__text">向下探索</span>
            <div className="scroll-arrow" />
          </div>
        </div>
      </section>

      {/* ==================== Section: Core Capabilities ==================== */}
      <section id="capabilities" className="home-section">
        <div className="section-header">
          <div className="section-pill">AI MULTI-MODAL</div>
          <RobotOutlined className="section-icon" />
          <Title level={3} style={{ marginTop: 4, marginBottom: 4 }}>核心能力</Title>
          <Paragraph type="secondary">多模态 AI 数字人，让游览更智能</Paragraph>
        </div>
        <Row gutter={[20, 20]}>
          {[
            { icon: <MessageOutlined />, title: '智能问答', desc: '基于景区知识库的精准回答，覆盖历史、文化、实用信息等各类问题', color: '#c41d7f', bg: 'rgba(196,29,127,0.1)' },
            { icon: <SoundOutlined />, title: '多模态交互', desc: '支持语音与文本输入，数字人以语音方式进行回答', color: '#1890ff', bg: 'rgba(24,144,255,0.1)' },
            { icon: <CompassOutlined />, title: '个性化推荐', desc: '根据兴趣偏好智能推荐最佳游览路线和讲解重点', color: '#2e7d5b', bg: 'rgba(46,125,91,0.1)' },
            { icon: <SmileOutlined />, title: '情感互动', desc: 'AI导游具有丰富的情感表达，提供亲切温暖的陪伴体验', color: '#d4a853', bg: 'rgba(212,168,83,0.12)' },
          ].map((f, i) => (
            <Col xs={24} sm={12} md={6} key={i}>
              <Card
                className="feature-card"
                hoverable
                role="button"
                tabIndex={0}
                aria-label={`${f.title}，点击进入`}
                onClick={() => navigate(getCapabilityRoute(f.title))}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    navigate(getCapabilityRoute(f.title));
                  }
                }}
              >
                <div className="feature-icon-wrapper" style={{ color: f.color, background: f.bg }}>
                  {f.icon}
                </div>
                <Title level={5} style={{ marginBottom: 8 }}>{f.title}</Title>
                <Paragraph type="secondary" style={{ fontSize: 13, lineHeight: 1.6, margin: 0 }}>
                  {f.desc}
                </Paragraph>
                <div className="feature-card-action">
                  <span>体验功能</span>
                  <RightOutlined style={{ fontSize: 10 }} />
                </div>
              </Card>
            </Col>
          ))}
        </Row>
      </section>

      {/* ==================== Section: Core Spots ==================== */}
      <section id="spots" className="home-section">
        <div className="section-header">
          <div className="section-pill">SCENIC HIGHLIGHTS</div>
          <EnvironmentOutlined className="section-icon" />
          <Title level={3} style={{ marginTop: 4, marginBottom: 4 }}>核心景点</Title>
          <Paragraph type="secondary">22 个精品景点，等您来探索</Paragraph>
        </div>
        <Row gutter={[16, 16]}>
          {SPOT_CARDS.map((spot, i) => (
            <Col xs={12} sm={8} md={4} key={i}>
              <Card
                className="spot-card"
                hoverable
                onClick={() => navigate(`/qa?q=${encodeURIComponent(spot.name)}`)}
              >
                <div className="spot-image-wrap">
                  {spot.icon}
                </div>
                <div className="spot-name">{spot.name}</div>
                <div className="spot-desc">{spot.desc}</div>
              </Card>
            </Col>
          ))}
        </Row>
      </section>

      {/* ==================== Section: Popular Questions ==================== */}
      <section id="questions" className="home-section">
        <div className="section-header">
          <div className="section-pill">FREQUENT INQUIRIES</div>
          <ThunderboltOutlined className="section-icon" />
          <Title level={3} style={{ marginTop: 4, marginBottom: 4 }}>大家都在问</Title>
          <Paragraph type="secondary">点击热门疑问，AI 导游即刻为您语音解答</Paragraph>
        </div>
        <div className="hot-questions-grid">
          {HOT_QUESTIONS.map((item, i) => (
            <Tag
              key={i}
              className="hot-q-tag"
              onClick={() => navigate(`/qa?q=${encodeURIComponent(item.q)}`)}
            >
              <span className="hot-q-icon">{item.icon}</span>
              <span>{item.q}</span>
            </Tag>
          ))}
        </div>
      </section>

      {/* ==================== Section: Nearby Spots & Facilities ==================== */}
      <section id="nearby" className="home-section">
        <div className="section-header">
          <div className="section-pill">SMART NAVIGATION</div>
          <AimOutlined className="section-icon" />
          <Title level={3} style={{ marginTop: 4, marginBottom: 4 }}><EnvironmentOutlined /> 附近景点与设施</Title>
          <Paragraph type="secondary">开启定位，发现您身边的灵山美景与便民设施</Paragraph>
        </div>

        {!nearbySpots && !geoError && (
          <div style={{ textAlign: 'center' }}>
            <Button
              size="large"
              icon={locating ? <LoadingOutlined /> : <AimOutlined />}
              onClick={handleLocate}
              loading={locating}
              style={{
                height: 48, borderRadius: 24, paddingInline: 32,
                background: 'linear-gradient(135deg, var(--brand-red-dark), var(--brand-red))',
                border: 'none', color: '#fff', fontSize: 15,
                boxShadow: '0 4px 16px rgba(196,29,127,0.3)',
              }}
            >
              {locating ? '正在定位...' : '查找附近景点'}
            </Button>
          </div>
        )}

        {geoError && (
          <div style={{ textAlign: 'center' }}>
            <Paragraph type="secondary" style={{ fontSize: 13 }}><WarningOutlined /> {geoError}</Paragraph>
            <Button icon={<AimOutlined />} onClick={handleLocate} loading={locating} style={{ borderRadius: 16, marginTop: 8 }}>
              重试定位
            </Button>
          </div>
        )}

        {nearbySpots && (
          <div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', justifyContent: 'center' }}>
              {CATEGORIES.map(cat => (
                <Tag
                  key={cat.key}
                  style={{
                    cursor: 'pointer', padding: '6px 18px', borderRadius: 20,
                    fontSize: 13, border: activeCategory === cat.key ? '1.5px solid #c41d7f' : '1px solid #d9d9d9',
                    background: activeCategory === cat.key ? '#fdf2f8' : '#fff',
                    color: activeCategory === cat.key ? '#c41d7f' : '#444',
                    fontWeight: activeCategory === cat.key ? 600 : 400,
                    transition: 'all 0.25s ease',
                  }}
                  onClick={() => { setActiveCategory(cat.key); if (cat.key !== 'spots') fetchFacilities(cat.key); }}
                >
                  {cat.icon} {cat.label}
                </Tag>
              ))}
            </div>
            {activeCategory === 'spots' ? (
              <div>
                {nearbySpots.slice(0, 5).map((spot, i) => {
                  const distKm = spot.distance / 1000;
                  const distText = spot.distance < 1000
                    ? `约${spot.distance}m`
                    : `约${distKm.toFixed(1)}km`;
                  return (
                    <Card
                      key={spot.name}
                      hoverable
                      size="small"
                      style={{
                        borderRadius: 14, marginBottom: 10,
                        border: i === 0 ? '2px solid #c41d7f' : '1px solid #eee',
                        background: i === 0 ? 'linear-gradient(135deg, #fdf2f8, #fff9f5)' : '#fff',
                        boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span className="poi-icon"><EnvironmentOutlined /></span>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Text strong style={{ fontSize: 14 }}>{spot.name}</Text>
                            <Tag color={i === 0 ? 'magenta' : 'default'} style={{ borderRadius: 10, fontSize: 11 }}>
                              {distText}
                            </Tag>
                            {i === 0 && <Tag color="green" style={{ borderRadius: 10, fontSize: 11 }}>最近</Tag>}
                          </div>
                          <Paragraph type="secondary" style={{ margin: '2px 0 0', fontSize: 12 }}>
                            {spot.desc}
                          </Paragraph>
                        </div>
                        <a
                          style={{ fontSize: 12, color: '#c41d7f', fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap', cursor: 'pointer' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            openBaiduNavigation(
                              { lat: spot.lat, lng: spot.lng },
                              spot.name,
                              lastFixRef.current,
                            );
                          }}
                        >
                          <CompassOutlined /> 去这里
                        </a>
                      </div>
                    </Card>
                  );
                })}
              </div>
            ) : (
              <div>
                {facilitiesLoading && <div style={{ textAlign: 'center', padding: 20 }}><LoadingOutlined /> 搜索中...</div>}
                {!facilitiesLoading && facilities.length === 0 && (
                  <div style={{ textAlign: 'center', padding: 20, color: '#999' }}>附近未找到相关设施</div>
                )}
                {facilities.map((f, i) => {
                  const distText = f.distance < 1000 ? `约${f.distance}m` : `约${(f.distance / 1000).toFixed(1)}km`;
                  const navUrl = f.uid
                    ? `https://api.map.baidu.com/place/detail?uid=${f.uid}&output=html`
                    : `https://uri.amap.com/marker?position=${f.lng},${f.lat}&name=${encodeURIComponent(f.name)}`;
                  return (
                    <Card key={i} hoverable size="small" style={{ borderRadius: 14, marginBottom: 10, border: '1px solid #eee' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span className="poi-icon">{CATEGORIES.find(c => c.key === activeCategory)?.icon}</span>
                        <div style={{ flex: 1 }}>
                          <Text strong style={{ fontSize: 14 }}>{f.name}</Text>
                          <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>{distText}</Text>
                        </div>
                        <Tag style={{ borderRadius: 10, fontSize: 11 }}>{distText}</Tag>
                        <a
                           style={{ fontSize: 12, color: '#c41d7f', fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap', cursor: 'pointer' }}
                           onClick={(e) => {
                             e.stopPropagation();
                             if (f.lat && f.lng) {
                               openBaiduNavigation(
                                 { lat: f.lat, lng: f.lng },
                                 f.name,
                                 lastFixRef.current,
                                 'bd09ll',
                               );
                             } else {
                               window.open(navUrl, '_blank', 'noopener,noreferrer');
                             }
                           }}
                        >
                          <CompassOutlined /> 去这里
                        </a>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
            <div style={{ textAlign: 'center', marginTop: 12 }}>
              <Button type="text" icon={<AimOutlined />} onClick={handleLocate} loading={locating} size="small">
                重新定位
              </Button>
            </div>
          </div>
        )}
      </section>

      {/* ==================== Floating Digital Human Companion ==================== */}
      <aside className="dh-floating-widget" data-testid="dh-floating-widget">
        <div className={`dh-bubble ${showDhBubble ? 'visible' : ''}`} role="status">
          <div className="dh-bubble__title">
            <span className="dh-bubble__pulse" />
            <span>AI 导游小灵</span>
          </div>
          <p style={{ margin: 0, lineHeight: 1.5 }}>{dhBubbleText}</p>
          <div className="dh-bubble__arrow" />
        </div>

        <button
          className="dh-trigger-btn"
          aria-label="召唤 AI 数字人导游"
          onClick={() => navigate('/qa')}
          onMouseEnter={() => {
            setDhBubbleText('点击即可向我提问，灵山导游 7×24 小时为您守候！');
            setShowDhBubble(true);
          }}
        >
          <div className="dh-trigger-avatar"><LingMark size={22} /></div>
          <div className="dh-trigger-text">
            <div className="dh-trigger-status">
              <span>AI 导游</span>
              <span className="dh-trigger-tag">在线</span>
            </div>
            <div className="dh-trigger-sub">点击开始对话</div>
          </div>
        </button>
      </aside>

      {/* ==================== Footer ==================== */}
      <footer className="home-footer">
        <div className="footer-brand"><LingMark size={20} /> 灵山胜境 AI 数字人导游</div>
        <div className="footer-links">
          <span onClick={() => window.open('/admin/login', '_blank')}><SettingOutlined /> 管理后台</span>
        </div>
        <div className="footer-copy">© 2024-2026 Ling Shan Sacred Land · AI Tour Guide</div>
      </footer>
    </div>
  );
}
