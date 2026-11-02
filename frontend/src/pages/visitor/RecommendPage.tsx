/**
 * 个性化路线推荐（/recommend）。
 *
 * 结构：顶栏 → 左"条件输入"（自然语言 / 结构化偏好） → 右"路线结果"。
 * 结果区永远先给"结论 + 原因"，再给逐站时间线；不可行时明确拒绝并给替代，
 * 不把不可行走的路线画成绿色可执行路径。
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Input, Select } from 'antd';
import {
  ArrowLeftOutlined,
  ClockCircleOutlined,
  CompassOutlined,
  EnvironmentOutlined,
  HistoryOutlined,
  HomeOutlined,
  HeartOutlined,
  StarOutlined,
  BuildOutlined,
  InfoCircleOutlined,
  WarningOutlined,
  AimOutlined,
  CarryOutOutlined,
} from '@ant-design/icons';
import { visitorAPI, type AdvisoryProfile, type RoutePlanResponse, type RoutePlanningRequest } from '../../services/api';
import { openBaiduNavigation } from '../../utils/navigation';
import {
  getClarificationPrompt,
  getRouteOutcomeLabel,
  getRouteRejectionMessage,
  getRouteRequestLabel,
  getSceneExtractionNote,
  type RouteOutcome,
} from './route-outcome';
import './RecommendPage.css';

const SPOT_COORDS: Record<string, { lat: number; lng: number }> = {
  '景区南门': { lat: 31.4219, lng: 120.0972 }, '灵山大照壁': { lat: 31.4225, lng: 120.0974 }, '五明桥': { lat: 31.4224, lng: 120.0974 }, '佛足坛': { lat: 31.4233, lng: 120.097 }, '五智门': { lat: 31.4246, lng: 120.0963 }, '菩提大道': { lat: 31.424, lng: 120.0967 }, '九龙灌浴': { lat: 31.42662, lng: 120.09523 }, '降魔浮雕': { lat: 31.425, lng: 120.0961 }, '阿育王柱': { lat: 31.4253, lng: 120.0959 }, '百子戏弥勒': { lat: 31.4254, lng: 120.0976 }, '祥符禅寺': { lat: 31.42986, lng: 120.09309 }, '灵山大佛': { lat: 31.43205, lng: 120.09151 }, '佛教文化博览馆': { lat: 31.43205, lng: 120.09151 }, '灵山梵宫': { lat: 31.43065, lng: 120.09756 }, '五印坛城': { lat: 31.42664, lng: 120.09813 }, '曼飞龙塔': { lat: 31.428, lng: 120.099 }, '无尽意斋': { lat: 31.4305, lng: 120.0918 }, '拈花广场': { lat: 31.4178, lng: 120.0695 }, '梵天花海': { lat: 31.4196, lng: 120.0762 }, '香月花街': { lat: 31.4195, lng: 120.0708 }, '拈花堂': { lat: 31.4212, lng: 120.0722 }, '五灯湖': { lat: 31.42, lng: 120.0728 }, '鹿鸣谷': { lat: 31.4243, lng: 120.0763 },
};

const SPOT_IMAGES: Record<string, string> = {
  '景区南门': 'shengjing_gate.jpg', '灵山大照壁': 'lingshan_zhaobi.jpg', '五明桥': 'wuming_bridge.jpg', '佛足坛': 'fozu_altar.jpg', '五智门': 'wuzhi_gate.jpg', '菩提大道': 'puti_avenue.jpg', '九龙灌浴': 'jiulong_guanyu.jpg', '降魔浮雕': 'xiangmo_relief.jpg', '阿育王柱': 'ayuwang_pillar.jpg', '百子戏弥勒': 'baiziximile.jpg', '祥符禅寺': 'xiangfu_temple.jpg', '灵山大佛': 'lingshan_dafo.jpg', '佛教文化博览馆': 'fojiao_museum.jpg', '灵山梵宫': 'lingshan_fangong.jpg', '五印坛城': 'wuyin_tancheng.jpg', '曼飞龙塔': 'manfeilong_pagoda.jpg', '无尽意斋': 'https://www.xiangfusi.com/UploadImages/image/201805251612383590.jpg', '拈花广场': 'nianhua_square.jpg', '梵天花海': 'fantian_huahai.jpg', '香月花街': 'xiangyue_street.jpg', '拈花堂': 'nianhua_hall.jpg', '五灯湖': 'wuhu_lamp.jpg', '鹿鸣谷': 'luming_valley.jpg',
};

const INTERESTS = [
  { key: '历史', icon: <HistoryOutlined />, label: '历史文化', desc: '千年佛教传承' },
  { key: '文化', icon: <StarOutlined />, label: '佛教文化', desc: '深度文化体验' },
  { key: '自然', icon: <EnvironmentOutlined />, label: '自然风光', desc: '太湖山水美景' },
  { key: '建筑', icon: <BuildOutlined />, label: '建筑艺术', desc: '佛教建筑杰作' },
  { key: '祈福', icon: <HeartOutlined />, label: '祈福体验', desc: '吉祥平安之旅' },
];

const DURATIONS = [3, 4, 5, 6];
const defaultQuery = '我带腿脚不方便的妈妈，现在在景区入口，只有三小时，还想看两点的《吉祥颂》，应该怎么走？';

export default function RecommendPage() {
  const navigate = useNavigate();
  const [selected, setSelected] = useState<string[]>([]);
  const [duration, setDuration] = useState(4);
  const [travelType, setTravelType] = useState('朋友');
  const [ageGroup, setAgeGroup] = useState<AdvisoryProfile['ageGroup']>('青年');
  const [budget, setBudget] = useState<AdvisoryProfile['budget']>('舒适型');
  const currentLocation = 'south_gate';
  const currentTime = '09:00';
  const mobility = 'normal' as const;
  const pace = 'normal' as const;
  const [sceneQuery, setSceneQuery] = useState(defaultQuery);
  const [sceneRoute, setSceneRoute] = useState<RoutePlanResponse | null>(null);
  const [, setRouteOrigin] = useState<'natural' | 'interest'>('natural');
  const [loading, setLoading] = useState(false);
  const [clarificationInput, setClarificationInput] = useState('');

  const submitRoute = async (request: RoutePlanningRequest, origin: 'natural' | 'interest') => {
    setRouteOrigin(origin);
    setSceneRoute(null);
    setLoading(true);
    try {
      setSceneRoute((await visitorAPI.planRoute(request)).data);
    } catch (error) {
      console.error('Route planning error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRecommend = () =>
    submitRoute(
      {
        scene_state: {
          currentLocation,
          currentTime,
          remainingMinutes: duration * 60,
          partyType: travelType,
          mobility,
          pace,
          interests: [...selected],
          mustVisitSpotIds: [],
          preferredPerformanceIds: [],
          visitedSpotIds: [],
        },
        advisory_profile: { ageGroup, budget },
      },
      'interest',
    );

  const handleScenePlan = (query = sceneQuery) => {
    if (query.trim()) void submitRoute({ query }, 'natural');
  };

  const handleClarification = () => {
    const extra = clarificationInput.trim();
    if (!extra) return;
    const query = `${sceneQuery.trim()}，${extra}`;
    setSceneQuery(query);
    setClarificationInput('');
    handleScenePlan(query);
  };

  const toggleInterest = (key: string) =>
    setSelected(previous => (previous.includes(key) ? previous.filter(item => item !== key) : [...previous, key]));

  const steps = sceneRoute?.route?.steps ?? [];
  const names = steps.map((step, index) => sceneRoute?.evidence?.[index]?.name || step.spotId);
  const outcome = (sceneRoute?.outcome ?? (sceneRoute?.feasibility ? 'feasible' : 'infeasible')) as RouteOutcome;
  const adjusted = outcome === 'feasible_with_rejected_preferences' && steps.length > 0;
  const feasible = outcome === 'feasible' && steps.length > 0;
  const missing = Array.from(
    new Set([...(sceneRoute?.scene_state?.missingCriticalFields ?? []), ...(sceneRoute?.scene_extraction?.missingFields ?? [])]),
  );
  const clarificationPrompts = missing.map(getClarificationPrompt).filter(prompt => prompt !== '请补充相关游览信息。');
  const clarification =
    sceneRoute?.clarification ||
    sceneRoute?.explanation?.clarification ||
    (clarificationPrompts.length ? [...new Set(clarificationPrompts)].join(' ') : undefined);
  const rejected = sceneRoute?.route?.rejectedRequests ?? sceneRoute?.explanation?.rejected_requests ?? [];
  const inputEffects = sceneRoute?.explanation?.input_effects?.filter(effect => effect.applied) ?? [];
  const waiting = sceneRoute?.route?.waitingMinutes ?? 0;

  return (
    <div className="rec-page">
      <header className="rec-topbar">
        <button type="button" className="rec-back" onClick={() => navigate('/')}>
          <ArrowLeftOutlined />
          返回首页
        </button>
        <div className="rec-topbar-title">
          <h1>
            <CompassOutlined /> 个性化路线推荐
          </h1>
          <p>先确认时间是否来得及，再安排路线——算不出来会直接告诉你</p>
        </div>
      </header>

      <main className="rec-shell">
        {/* ---------------- 左：条件输入 ---------------- */}
        <div className="rec-col-form">
          <section className="rec-card">
            <div className="rec-card-head">
              <span className="rec-step">01</span>
              <div>
                <h2>按你的情况规划路线</h2>
                <p>告诉我你现在在哪里、还剩多久、和谁一起。</p>
              </div>
            </div>
            <Input.TextArea
              value={sceneQuery}
              onChange={event => setSceneQuery(event.target.value)}
              autoSize={{ minRows: 3, maxRows: 6 }}
              placeholder={defaultQuery}
              aria-label="描述你的游览情况"
            />
            <Button
              type="primary"
              block
              size="large"
              onClick={() => handleScenePlan()}
              loading={loading}
              disabled={!sceneQuery.trim()}
              className="rec-primary-btn"
            >
              帮我规划路线
            </Button>
            <p className="ui-note">
              支持口语描述：位置、剩余时长、同行人、行动能力、想看的演出都会被解析；缺关键信息会先追问。
            </p>
          </section>

          <section className="rec-card">
            <div className="rec-card-head">
              <span className="rec-step">02</span>
              <div>
                <h2>或按偏好生成</h2>
                <p>选兴趣、同行人与时长，生成一条可执行的路线。</p>
              </div>
            </div>

            <div className="rec-interest-grid">
              {INTERESTS.map(item => {
                const active = selected.includes(item.key);
                return (
                  <button
                    key={item.key}
                    type="button"
                    className={`rec-interest${active ? ' is-active' : ''}`}
                    aria-pressed={active}
                    onClick={() => toggleInterest(item.key)}
                  >
                    <span className="rec-interest-icon">{item.icon}</span>
                    <strong>{item.label}</strong>
                    <em>{item.desc}</em>
                  </button>
                );
              })}
            </div>

            <div className="rec-fields">
              <label className="rec-field">
                <span>出行类型</span>
                <Select
                  value={travelType}
                  onChange={setTravelType}
                  options={['朋友', '情侣', '亲子', '带长辈'].map(value => ({ value, label: value }))}
                />
              </label>
              <label className="rec-field">
                <span>年龄段</span>
                <Select
                  value={ageGroup}
                  onChange={setAgeGroup}
                  options={['青年', '中年', '老年'].map(value => ({ value, label: value }))}
                />
              </label>
              <label className="rec-field">
                <span>预算类型</span>
                <Select
                  value={budget}
                  onChange={setBudget}
                  options={['经济型', '舒适型', '豪华型'].map(value => ({ value, label: value }))}
                />
              </label>
            </div>

            <div className="rec-duration">
              <span className="rec-duration-label">
                <ClockCircleOutlined /> 预计游览时长
              </span>
              <div className="rec-duration-options">
                {DURATIONS.map(hours => (
                  <button
                    key={hours}
                    type="button"
                    className={`rec-duration-btn${duration === hours ? ' is-active' : ''}`}
                    aria-pressed={duration === hours}
                    onClick={() => setDuration(hours)}
                  >
                    {hours} 小时
                  </button>
                ))}
              </div>
            </div>

            <p className="ui-note">
              位置、时间、行动能力和节奏会参与路线计算；年龄与预算只影响个性化提示。
            </p>

            <Button
              type="primary"
              block
              size="large"
              onClick={() => handleRecommend()}
              loading={loading}
              disabled={selected.length === 0}
              className="rec-primary-btn"
            >
              生成推荐路线
            </Button>
          </section>
        </div>

        {/* ---------------- 右：结果 ---------------- */}
        <div className="rec-col-result">
          {!sceneRoute ? (
            <section className="rec-card rec-result-empty">
              <AimOutlined className="rec-empty-icon" />
              <h2>还没有路线</h2>
              <p>左侧输入你的情况，或选择兴趣偏好后生成。结果会给出逐站的到达、步行、等待与观看时间。</p>
              <ul className="rec-empty-points">
                <li>
                  <CarryOutOutlined /> 时间不够会明确拒绝，不生成走不完的路线
                </li>
                <li>
                  <ClockCircleOutlined /> 演出场次自动对齐，并预留入场与排队缓冲
                </li>
                <li>
                  <EnvironmentOutlined /> 每站可调起高德/百度实景导航
                </li>
              </ul>
            </section>
          ) : (
            <section className="rec-card rec-result">
              <div className="rec-card-head">
                <span className="rec-step">03</span>
                <div>
                  <h2>{feasible || adjusted ? '推荐路线' : '路线安排提示'}</h2>
                  <p>
                    {getSceneExtractionNote(sceneRoute.scene_extraction) || '基于你提供的时间与体力条件计算'}
                  </p>
                </div>
              </div>

              <div className="rec-summary">
                <span
                  className={`ui-tag ${feasible ? 'ui-tag--ok' : adjusted ? 'ui-tag--warn' : 'ui-tag--danger'}`}
                >
                  {getRouteOutcomeLabel(outcome, steps.length)}
                </span>
                <span className="ui-tag">总游览时长：{sceneRoute.route?.totalMinutes ?? 0} 分钟</span>
                <span className="ui-tag">步行 {sceneRoute.route?.walkingMinutes ?? 0} 分钟</span>
                <span className="ui-tag">游览 {sceneRoute.route?.visitingMinutes ?? 0} 分钟</span>
                {waiting > 0 ? <span className="ui-tag">等待 {waiting} 分钟</span> : null}
              </div>

              {inputEffects.length > 0 ? (
                <div className="rec-explain">
                  <span className="rec-explain-label">
                    <InfoCircleOutlined /> 这些输入如何影响结果
                  </span>
                  {inputEffects.map((effect, index) => (
                    <p key={index}>{effect.summary}</p>
                  ))}
                  {sceneRoute.explanation?.route_rationale?.length ? (
                    <p>{sceneRoute.explanation.route_rationale.join('；')}</p>
                  ) : null}
                </div>
              ) : null}

              {clarification ? (
                <div className="rec-clarify">
                  <div className="rec-clarify-head">
                    <WarningOutlined />
                    <strong>还需要补充一点信息</strong>
                  </div>
                  <p>{clarification}</p>
                  <div className="rec-clarify-input">
                    <Input
                      aria-label="路线补充信息"
                      value={clarificationInput}
                      onChange={event => setClarificationInput(event.target.value)}
                      onPressEnter={handleClarification}
                      placeholder="例如：现在上午10点"
                    />
                    <Button
                      type="primary"
                      onClick={handleClarification}
                      disabled={!clarificationInput.trim()}
                      loading={loading}
                    >
                      补充并重新规划
                    </Button>
                  </div>
                </div>
              ) : null}

              {rejected.length > 0 ? (
                <div className="rec-rejected">
                  <div className="rec-rejected-head">
                    <InfoCircleOutlined />
                    <strong>有一项安排暂时无法加入路线</strong>
                  </div>
                  <p>
                    {rejected
                      .map(item => `${getRouteRequestLabel(item.item)}：${getRouteRejectionMessage(item.reasonCode)}`)
                      .join('；')}
                  </p>
                </div>
              ) : null}

              {steps.length > 0 ? (
                <div className="rec-body">
                  <ol className="rec-timeline">
                    {steps.map((item, index) => {
                      const name = names[index] || '下一站';
                      const coords = SPOT_COORDS[name];
                      return (
                        <li key={`${name}-${index}`} className="rec-stop">
                          <span className="rec-stop-index">{index + 1}</span>
                          <div className="rec-stop-body">
                            <div className="rec-stop-head">
                              <strong>
                                {item.performanceId
                                  ? `${item.start}–${item.end} 观看${item.performanceName || '目标演出'}`
                                  : `${item.start}–${item.end} ${name}`}
                              </strong>
                              <span className="ui-tag">
                                <ClockCircleOutlined /> {item.visitMinutes} 分钟
                              </span>
                            </div>
                            <p className="rec-stop-desc">
                              {item.arrive} 到达{name}，步行 {item.walkMinutes} 分钟
                              {item.waitingMinutes
                                ? `，等待 ${item.waitingMinutes} 分钟后观看`
                                : `，停留 ${item.visitMinutes} 分钟`}
                            </p>
                            {coords ? (
                              <Button
                                size="small"
                                type="link"
                                className="rec-nav-btn"
                                onClick={() => openBaiduNavigation(coords, name)}
                              >
                                <EnvironmentOutlined /> 到这里
                              </Button>
                            ) : null}
                          </div>
                        </li>
                      );
                    })}
                  </ol>

                  <div className="rec-spots">
                    <span className="rec-spots-label">沿途景点</span>
                    <ul className="rec-spot-grid">
                      {names.map((name, index) => (
                        <li key={`${name}-img-${index}`} className="rec-spot-card">
                          <span className="rec-spot-tag">
                            <span className="rec-spot-index">{index + 1}</span>
                            {name}
                          </span>
                          {SPOT_IMAGES[name] ? (
                            <img src={`/${SPOT_IMAGES[name]}`} alt={name} loading="lazy" />
                          ) : (
                            <span className="rec-spot-noimg">暂无图片</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : null}

              <div className="rec-actions">
                <Button type="primary" onClick={() => navigate('/qa')} className="rec-primary-btn">
                  <HomeOutlined /> 去问答了解更多景点详情
                </Button>
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
