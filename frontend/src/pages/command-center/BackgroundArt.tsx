/**
 * SkyGuard 指挥大屏 — 赛博国风美学背景图层（BackgroundArt）。
 *
 * 融合「灵山胜境真实风貌 · 水墨青峦 · 三阶塔檐 · 浑天星宿 · 极坐标数字孪生」：
 *  - 底层融入项目现存高精真实背景「灵山大佛 · 碧峰太湖」（/background.jpg），
 *    以暖墨暗色滤镜与光晕柔和沉底，营造深邃壮阔的文旅时空场域；
 *  - 纯矢量 SVG 叠加层渲染浑天罗盘、八卦天元方位、星宿经纬、如意卷云与朱砂印章；
 *  - 全局 pointer-events: none，无障碍树通过 aria-hidden 屏蔽；
 *  - 严格保持暖墨基底（#14100E）、描金发丝线（rgba(217, 179, 106, ...)）与灵山朱微光，
 *    杜绝刺眼电光蓝与高对比噪点。
 */

export function BackgroundArt() {
  return (
    <div className="cc-bg-container" aria-hidden="true">
      {/* 1. 灵山大佛与太湖碧波真实自然风光底纹（暗墨混合沉浸层） */}
      <div className="cc-bg-photo" />

      {/* 2. 暖墨水墨流光与漫反射层：灵山朱（左上）+ 佛光金（顶中偏右） */}
      <div className="cc-bg-glow cc-bg-glow-vermilion" />
      <div className="cc-bg-glow cc-bg-glow-gold" />
      <div className="cc-bg-glow cc-bg-glow-center" />

      {/* 3. 赛博国风综合矢量底纹 */}
      <svg
        className="cc-bg-svg"
        viewBox="0 0 1920 1080"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          {/* 金色渐变发丝线 */}
          <linearGradient id="sg-gold-line" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgba(217, 179, 106, 0)" />
            <stop offset="50%" stopColor="rgba(217, 179, 106, 0.45)" />
            <stop offset="100%" stopColor="rgba(217, 179, 106, 0)" />
          </linearGradient>

          {/* 远山水墨渐变（后景） */}
          <linearGradient id="sg-mountain-far" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(42, 33, 27, 0.65)" />
            <stop offset="50%" stopColor="rgba(28, 22, 18, 0.82)" />
            <stop offset="100%" stopColor="rgba(20, 16, 14, 0.96)" />
          </linearGradient>

          {/* 近山水墨渐变（前景） */}
          <linearGradient id="sg-mountain-near" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(34, 26, 22, 0.78)" />
            <stop offset="60%" stopColor="rgba(23, 18, 15, 0.92)" />
            <stop offset="100%" stopColor="rgba(16, 12, 10, 0.99)" />
          </linearGradient>

          {/* 金色高光山脊线渐变 */}
          <linearGradient id="sg-ridge-gold" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgba(217, 179, 106, 0.05)" />
            <stop offset="25%" stopColor="rgba(217, 179, 106, 0.35)" />
            <stop offset="55%" stopColor="rgba(217, 179, 106, 0.55)" />
            <stop offset="85%" stopColor="rgba(217, 179, 106, 0.25)" />
            <stop offset="100%" stopColor="rgba(217, 179, 106, 0.05)" />
          </linearGradient>

          {/* 微网格节点 */}
          <pattern id="sg-grid-dots" width="48" height="48" patternUnits="userSpaceOnUse">
            <circle cx="24" cy="24" r="1" fill="rgba(217, 179, 106, 0.12)" />
            <line x1="21" y1="24" x2="27" y2="24" stroke="rgba(217, 179, 106, 0.1)" strokeWidth="0.8" />
            <line x1="24" y1="21" x2="24" y2="27" stroke="rgba(217, 179, 106, 0.1)" strokeWidth="0.8" />
          </pattern>
        </defs>

        {/* 1. 微网格底层 */}
        <rect width="1920" height="1080" fill="url(#sg-grid-dots)" opacity="0.9" />

        {/* 2. 浑天仪 / 极坐标经纬罗盘（右上背景） */}
        <g transform="translate(1560, 240)" opacity="0.55">
          {/* 同心天元规轨 */}
          <circle cx="0" cy="0" r="140" stroke="rgba(217, 179, 106, 0.22)" strokeWidth="1" strokeDasharray="2 4" />
          <circle cx="0" cy="0" r="220" stroke="rgba(217, 179, 106, 0.28)" strokeWidth="1.2" />
          <circle cx="0" cy="0" r="320" stroke="rgba(217, 179, 106, 0.18)" strokeWidth="0.9" strokeDasharray="6 8" />
          <circle cx="0" cy="0" r="440" stroke="rgba(217, 179, 106, 0.14)" strokeWidth="0.8" strokeDasharray="12 16" />
          <circle cx="0" cy="0" r="560" stroke="rgba(217, 179, 106, 0.08)" strokeWidth="0.6" strokeDasharray="3 12" />

          {/* 辐射经线与刻度 */}
          <line x1="-580" y1="0" x2="580" y2="0" stroke="rgba(217, 179, 106, 0.16)" strokeWidth="0.9" />
          <line x1="0" y1="-580" x2="0" y2="580" stroke="rgba(217, 179, 106, 0.16)" strokeWidth="0.9" />
          <line x1="-400" y1="-400" x2="400" y2="400" stroke="rgba(217, 179, 106, 0.1)" strokeWidth="0.8" strokeDasharray="4 8" />
          <line x1="-400" y1="400" x2="400" y2="-400" stroke="rgba(217, 179, 106, 0.1)" strokeWidth="0.8" strokeDasharray="4 8" />

          {/* 八卦与天干地支四正位 */}
          <text x="0" y="-232" fill="rgba(217, 179, 106, 0.65)" fontSize="11" fontFamily="'PingFang SC', monospace" fontWeight="600" textAnchor="middle">
            NORTH · 坎 ☵
          </text>
          <text x="236" y="4" fill="rgba(217, 179, 106, 0.6)" fontSize="11" fontFamily="'PingFang SC', monospace" fontWeight="600">
            EAST · 震 ☳
          </text>
          <text x="0" y="246" fill="rgba(217, 179, 106, 0.6)" fontSize="11" fontFamily="'PingFang SC', monospace" fontWeight="600" textAnchor="middle">
            SOUTH · 离 ☲
          </text>
          <text x="-295" y="4" fill="rgba(217, 179, 106, 0.6)" fontSize="11" fontFamily="'PingFang SC', monospace" fontWeight="600">
            WEST · 兑 ☱
          </text>

          {/* 四维偏位标记 */}
          <text x="240" y="-240" fill="rgba(217, 179, 106, 0.4)" fontSize="9" fontFamily="'PingFang SC', monospace">艮 ☶</text>
          <text x="240" y="250" fill="rgba(217, 179, 106, 0.4)" fontSize="9" fontFamily="'PingFang SC', monospace">巽 ☴</text>
          <text x="-260" y="250" fill="rgba(217, 179, 106, 0.4)" fontSize="9" fontFamily="'PingFang SC', monospace">坤 ☷</text>
          <text x="-260" y="-240" fill="rgba(217, 179, 106, 0.4)" fontSize="9" fontFamily="'PingFang SC', monospace">乾 ☰</text>

          {/* 天元坐标准度微刻 */}
          <text x="140" y="-150" fill="rgba(217, 179, 106, 0.45)" fontSize="10" fontFamily="monospace">
            E 120°09′15″ N 31°25′42″
          </text>
          <text x="140" y="-132" fill="rgba(217, 179, 106, 0.35)" fontSize="9" fontFamily="monospace">
            ALT 88.0m · 灵山天元坐标
          </text>

          {/* 星宿测度点 */}
          <circle cx="156" cy="-88" r="2" fill="rgba(217, 179, 106, 0.6)" />
          <circle cx="-120" cy="-140" r="1.8" fill="rgba(217, 179, 106, 0.5)" />
          <circle cx="95" cy="180" r="1.6" fill="rgba(217, 179, 106, 0.5)" />
          <line x1="156" y1="-88" x2="190" y2="-60" stroke="rgba(217, 179, 106, 0.25)" strokeWidth="0.8" strokeDasharray="2 3" />
        </g>

        {/* 3. 左上国风祥云如意纹饰 */}
        <g transform="translate(60, 75)" opacity="0.45" stroke="rgba(217, 179, 106, 0.55)" fill="none" strokeWidth="1.2">
          {/* 祥云如意卷 */}
          <path d="M20 70 A18 18 0 0 1 45 42 A24 24 0 0 1 85 40 A20 20 0 0 1 115 62 A16 16 0 0 1 138 72 A12 12 0 0 1 128 92 L20 92 A12 12 0 0 1 20 70 Z" />
          <path d="M42 62 A10 10 0 0 1 58 48 A14 14 0 0 1 82 50" />
          <path d="M128 82 Q160 82 176 74 T200 60" strokeDasharray="3 3" />
          <path d="M10 76 Q-8 76 -18 68 T-28 54" strokeDasharray="2 3" />
          <circle cx="210" cy="56" r="2" fill="rgba(217, 179, 106, 0.7)" />
          <circle cx="-34" cy="50" r="1.5" fill="rgba(217, 179, 106, 0.5)" />
        </g>

        {/* 4. 右上朱砂金石印章水印（文旅安全信标） */}
        <g transform="translate(1780, 50)" opacity="0.55">
          {/* 双线金边朱砂印框 */}
          <rect x="0" y="0" width="86" height="32" rx="4" stroke="rgba(240, 98, 146, 0.7)" strokeWidth="1.2" fill="rgba(196, 29, 127, 0.15)" />
          <rect x="3" y="3" width="80" height="26" rx="2" stroke="rgba(217, 179, 106, 0.45)" strokeWidth="0.8" fill="none" />
          <text x="43" y="20" fill="rgba(245, 239, 233, 0.85)" fontSize="11" fontFamily="'PingFang SC', 'Microsoft YaHei', sans-serif" fontWeight="700" letterSpacing="2" textAnchor="middle">
            时空可信
          </text>
        </g>

        {/* 5. 灵山大佛与梵宫三阶塔檐几何水墨剪影（宏观结构水印） */}
        <g transform="translate(960, 480)" opacity="0.12">
          {/* 三阶塔檐须弥座宏观轮廓 */}
          <path
            d="M-240 280 L-190 200 L-150 200 L-120 140 L-80 140 L-45 80 L0 10 L45 80 L80 140 L120 140 L150 200 L190 200 L240 280 Z"
            stroke="rgba(217, 179, 106, 0.7)"
            strokeWidth="1.5"
            fill="none"
          />
          <line x1="-360" y1="280" x2="360" y2="280" stroke="rgba(217, 179, 106, 0.65)" strokeWidth="1" />
          <line x1="-300" y1="200" x2="300" y2="200" stroke="rgba(217, 179, 106, 0.5)" strokeWidth="1" />
          <line x1="-220" y1="140" x2="220" y2="140" stroke="rgba(217, 179, 106, 0.5)" strokeWidth="1" />
          <circle cx="0" cy="-10" r="18" stroke="rgba(217, 179, 106, 0.6)" strokeWidth="1.2" strokeDasharray="3 3" />
        </g>

        {/* 6. 底部太湖之滨水墨远峦与青黛起伏山脊 */}
        {/* 远山层 */}
        <path
          d="M0 820 Q 260 720, 520 780 T 1040 730 T 1520 790 T 1920 710 L 1920 1080 L 0 1080 Z"
          fill="url(#sg-mountain-far)"
          stroke="url(#sg-ridge-gold)"
          strokeWidth="1.4"
        />
        {/* 近山层 */}
        <path
          d="M0 890 Q 340 810, 720 860 T 1400 830 T 1920 860 L 1920 1080 L 0 1080 Z"
          fill="url(#sg-mountain-near)"
          stroke="rgba(217, 179, 106, 0.22)"
          strokeWidth="1.2"
        />

        {/* 湖畔微波发丝金线 */}
        <path
          d="M120 960 C 380 950, 540 970, 800 955 S 1260 965, 1580 952 S 1820 960, 1920 955"
          stroke="url(#sg-gold-line)"
          strokeWidth="1.2"
          opacity="0.75"
        />
        <path
          d="M0 1000 C 280 995, 500 1010, 860 995 S 1340 1005, 1700 992 S 1860 1000, 1920 996"
          stroke="url(#sg-gold-line)"
          strokeWidth="0.9"
          opacity="0.55"
        />

        {/* 7. 顶栏上方科技感光纤导轨 */}
        <line x1="80" y1="14" x2="1840" y2="14" stroke="url(#sg-gold-line)" strokeWidth="1.2" opacity="0.55" />
        <circle cx="960" cy="14" r="3" fill="rgba(217, 179, 106, 0.65)" />
        <circle cx="950" cy="14" r="1.5" fill="rgba(240, 98, 146, 0.75)" />
        <circle cx="970" cy="14" r="1.5" fill="rgba(240, 98, 146, 0.75)" />
      </svg>
    </div>
  );
}

export default BackgroundArt;
