/**
 * 灵山品牌标记 —— 三阶塔檐 + 须弥座的纯几何 SVG。
 * 登录页与管理后台侧栏共用，保证同一品牌符号在不同色底下自适应（currentColor）。
 */
export function LingMark({ size = 32, strokeWidth = 1.4 }: { size?: number; strokeWidth?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M24 5.5 27.2 13.4H20.8L24 5.5Z" />
      <path d="M14.6 20.2h18.8l-2.3-6.8H16.9l-2.3 6.8Z" />
      <path d="M10.8 30.4h26.4l-2.6-7.6H13.4l-2.6 7.6Z" />
      <path d="M17 30.4v7.2M24 30.4v7.2M31 30.4v7.2" />
      <path d="M12.4 41.4h23.2" />
      <path d="M8 37.6h32" opacity="0.45" />
    </svg>
  );
}

export default LingMark;
