/**
 * 数字人形象管理（/admin/digital-human）。
 * 左侧固定预览（可试听、切表情），右侧外观与声音两组选项。
 * 交互语义：外观卡片是 <button>，声音行是 radio + 独立试听按钮（不嵌套可交互元素）。
 */
import { useState, useRef, useEffect } from 'react';
import { Button, message } from 'antd';
import { SoundOutlined, PauseOutlined, CheckOutlined, AudioOutlined } from '@ant-design/icons';
import { adminAPI } from '../../services/api';
import AdminShell from '../../components/admin/AdminShell';
import DigitalHuman from '../../components/visitor/DigitalHuman';
import { ensureAudioContext } from '../../components/visitor/audio-context';
import './DigitalHumanPage.css';

const APPEARANCES = [
  { key: 'zen_red_gold', name: '禅意红金', desc: '红色汉服，金绣祥云，佛寺红墙背景', color: '#c41d7f', accent: '#e91e63' },
  { key: 'celadon_elegance', name: '青瓷雅韵', desc: '青色汉服，江南水乡，莲花点缀', color: '#2e7d5b', accent: '#4caf9e' },
  { key: 'tang_splendor', name: '唐风华韵', desc: '金色唐风宫廷装，富丽堂皇', color: '#b8860b', accent: '#d4a853' },
  { key: 'ink_wash', name: '水墨丹青', desc: '深蓝素雅汉服，水墨山竹意境', color: '#455a7b', accent: '#6b8db5' },
];

const VOICES = [
  { id: 'xiaoxiao', voiceId: 'zh-CN-XiaoxiaoNeural', name: '晓晓', style: '温柔知性', desc: '语调温婉，适合景区讲解和文化介绍', rate: '+0%', pitch: '+0Hz' },
  { id: 'xiaoyi', voiceId: 'zh-CN-XiaoyiNeural', name: '晓伊', style: '活泼灵动', desc: '语调轻快，富有朝气，适合互动问答', rate: '+10%', pitch: '+5Hz' },
  { id: 'xiaoxuan', voiceId: 'zh-CN-XiaoxuanNeural', name: '晓萱', style: '沉稳大气', desc: '语调沉稳，字正腔圆，适合历史文化讲解', rate: '-10%', pitch: '-5Hz' },
];

const BG_GRADIENTS: Record<string, string> = {
  zen_red_gold: 'linear-gradient(160deg, #fef5fb, #fff9f5, #fdf2f8)',
  celadon_elegance: 'linear-gradient(160deg, #f0faf5, #f5faf8, #f0f5f3)',
  tang_splendor: 'linear-gradient(160deg, #fffdf5, #fff8e8, #fef9ef)',
  ink_wash: 'linear-gradient(160deg, #f5f7fa, #f0f3f8, #f8f9fc)',
};

const EMOTIONS = ['greet', 'happy', 'explain', 'think'] as const;

export default function DigitalHumanPage() {
  const [appearance, setAppearance] = useState('zen_red_gold');
  const [voice, setVoice] = useState('xiaoxiao');
  const [previewSpeaking, setPreviewSpeaking] = useState(false);
  const [previewEmotion, setPreviewEmotion] = useState<string>('greet');
  const [voiceLoading, setVoiceLoading] = useState(false);
  const currentAudio = useRef<HTMLAudioElement | null>(null);
  const ctxWarmed = useRef(false);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);

  useEffect(() => {
    const warmUp = async () => {
      if (ctxWarmed.current) return;
      ctxWarmed.current = true;
      try {
        await ensureAudioContext();
      } catch {
        /* 静默失败，试听时再重试 */
      }
    };
    const events = ['click', 'touchstart', 'keydown'] as const;
    const handler = () => {
      void warmUp();
      events.forEach(e => document.removeEventListener(e, handler));
    };
    events.forEach(e => document.addEventListener(e, handler, { once: false }));
    return () => events.forEach(e => document.removeEventListener(e, handler));
  }, []);

  const save = (a: string, vId: string) => {
    const vObj = VOICES.find(x => x.id === vId) || VOICES[0];
    localStorage.setItem('selectedVoice', vObj.voiceId);
    adminAPI
      .updateDigitalHuman({
        name: '灵小禅',
        style_preset: a,
        voice_id: vObj.voiceId,
        voice_speed: 1.0,
        voice_pitch: 1.0,
      })
      .catch(() => {});
  };

  const activeAppearance = APPEARANCES.find(a => a.key === appearance) ?? APPEARANCES[0];
  const activeVoice = VOICES.find(v => v.id === voice) ?? VOICES[0];

  const stopVoice = () => {
    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.stop();
      } catch {
        /* already stopped */
      }
      try {
        sourceNodeRef.current.disconnect();
      } catch {
        /* already disconnected */
      }
      sourceNodeRef.current = null;
    }
    if (currentAudio.current) {
      currentAudio.current.pause();
      currentAudio.current = null;
    }
    setPreviewSpeaking(false);
    setPreviewEmotion('greet');
  };

  const handlePreview = async (v?: (typeof VOICES)[number]) => {
    setVoiceLoading(true);
    stopVoice();
    const voiceObj = v || activeVoice;
    try {
      await new Promise(r => setTimeout(r, 300));

      const res = await fetch('/api/v1/visitor/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: '你好我是灵小禅，欢迎来到灵山胜境',
          voice: voiceObj.voiceId,
          rate: voiceObj.rate,
          pitch: voiceObj.pitch,
        }),
      });
      const data = await res.json();
      if (!data.audio_base64) {
        setVoiceLoading(false);
        return;
      }

      const { ctx, analyser } = await ensureAudioContext();

      const binary = atob(data.audio_base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const rawBuffer = await ctx.decodeAudioData(bytes.buffer);

      const SILENCE_SEC = 0.8;
      const silenceFrames = Math.ceil(SILENCE_SEC * rawBuffer.sampleRate);
      const totalFrames = silenceFrames + rawBuffer.length;
      const padded = ctx.createBuffer(rawBuffer.numberOfChannels, totalFrames, rawBuffer.sampleRate);
      for (let ch = 0; ch < rawBuffer.numberOfChannels; ch++) {
        padded.getChannelData(ch).set(rawBuffer.getChannelData(ch), silenceFrames);
      }

      const sourceNode = ctx.createBufferSource();
      sourceNode.buffer = padded;
      sourceNode.connect(analyser);
      sourceNodeRef.current = sourceNode;

      sourceNode.onended = () => {
        setPreviewSpeaking(false);
        setPreviewEmotion('greet');
        if (sourceNodeRef.current === sourceNode) sourceNodeRef.current = null;
      };

      setPreviewSpeaking(true);
      setPreviewEmotion('explain');
      sourceNode.start(0);
    } catch {
      /* ignore */
    } finally {
      setVoiceLoading(false);
    }
  };

  return (
    <AdminShell
      active="digital-human"
      title="数字人形象"
      subtitle="外观与声音独立配置，任一组合都会即时写入游客端配置"
      actions={
        <span className="ui-tag ui-tag--brand">
          当前：{activeAppearance.name} + {activeVoice.name}·{activeVoice.style}
        </span>
      }
    >
      <div className="adm-grid adm-grid--sidebar">
        <section className="ui-panel dh-preview">
          <div className="ui-panel-head">
            <div className="ui-panel-heading">
              <span className="ui-eyebrow">PREVIEW</span>
              <h2 className="ui-panel-title">实时预览</h2>
            </div>
            <span className={`ui-tag ${previewSpeaking ? 'ui-tag--ok' : ''}`}>
              {previewSpeaking ? '讲解中' : '待机'}
            </span>
          </div>

          <div className="dh-stage" style={{ background: BG_GRADIENTS[appearance] }}>
            <DigitalHuman emotion={previewEmotion} isSpeaking={previewSpeaking} size="large" stylePreset={appearance} />
          </div>

          <div className="dh-preview-actions">
            {previewSpeaking ? (
              <Button icon={<PauseOutlined />} onClick={stopVoice} danger>
                停止播放
              </Button>
            ) : (
              <Button icon={<SoundOutlined />} onClick={() => void handlePreview()} loading={voiceLoading}>
                试听「{activeVoice.name}·{activeVoice.style}」
              </Button>
            )}
            <Button
              onClick={() =>
                setPreviewEmotion(prev => EMOTIONS[(EMOTIONS.indexOf(prev as (typeof EMOTIONS)[number]) + 1) % EMOTIONS.length])
              }
            >
              切换表情
            </Button>
          </div>
          <p className="ui-note dh-preview-note">
            试听会真实调用 <span className="dh-mono">/api/v1/visitor/tts</span> 并用 WebAudio 播放；无可播音频时按钮不做假动画。
          </p>
        </section>

        <div className="adm-section">
          <section className="ui-panel">
            <div className="ui-panel-head">
              <div className="ui-panel-heading">
                <span className="ui-eyebrow">APPEARANCE</span>
                <h2 className="ui-panel-title">外观风格</h2>
                <p className="ui-panel-sub">选择角色形象；每套形象独立生成，可随时切换。</p>
              </div>
            </div>
            <div className="dh-appearance-grid">
              {APPEARANCES.map(a => {
                const selected = appearance === a.key;
                return (
                  <button
                    key={a.key}
                    type="button"
                    className={`dh-appearance${selected ? ' is-selected' : ''}`}
                    aria-pressed={selected}
                    onClick={() => {
                      setAppearance(a.key);
                      save(a.key, voice);
                      message.success(`外观：${a.name}`);
                    }}
                  >
                    <span
                      className="dh-swatch"
                      style={{ background: `linear-gradient(135deg, ${a.color}, ${a.accent})` }}
                      aria-hidden="true"
                    />
                    <span className="dh-appearance-text">
                      <strong>{a.name}</strong>
                      <em>{a.desc}</em>
                    </span>
                    {selected ? <CheckOutlined className="dh-check" aria-hidden="true" /> : null}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="ui-panel">
            <div className="ui-panel-head">
              <div className="ui-panel-heading">
                <span className="ui-eyebrow">VOICE</span>
                <h2 className="ui-panel-title">声音风格</h2>
                <p className="ui-panel-sub">与外观任意搭配；试听使用对应语速与音高参数。</p>
              </div>
            </div>
            <ul className="dh-voice-list">
              {VOICES.map(v => {
                const selected = voice === v.id;
                return (
                  <li key={v.id} className={`dh-voice${selected ? ' is-selected' : ''}`}>
                    <label className="dh-voice-main">
                      <input
                        type="radio"
                        name="dh-voice"
                        value={v.id}
                        checked={selected}
                        onChange={() => {
                          setVoice(v.id);
                          save(appearance, v.id);
                          message.success(`声音：${v.name}·${v.style}`);
                        }}
                      />
                      <span className="dh-voice-text">
                        <strong>
                          {v.name}
                          <em>· {v.style}</em>
                        </strong>
                        <span>{v.desc}</span>
                      </span>
                    </label>
                    <span className="dh-voice-meta">
                      <span className="ui-tag">
                        <AudioOutlined /> {v.rate} / {v.pitch}
                      </span>
                      <Button
                        size="small"
                        icon={<SoundOutlined />}
                        onClick={() => {
                          setVoice(v.id);
                          save(appearance, v.id);
                          void handlePreview(v);
                        }}
                      >
                        试听
                      </Button>
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      </div>
    </AdminShell>
  );
}
