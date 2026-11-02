/**
 * SkyGuard 指挥大屏图标集。
 *
 * 统一规格（不做例外）：
 *  - 24×24 viewBox，stroke-width 1.6，round join/cap，仅用 currentColor；
 *  - 默认 aria-hidden，装饰性图标不进入无障碍树；
 *  - 不使用 emoji 充当结构性图标（字体依赖、无法着色、跨平台不一致）。
 */
import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 16, ...rest }: IconProps) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    focusable: 'false' as const,
    ...rest,
  };
}

/** 品牌标记：盾形 + 内部折线（几何图形，非字体图标）。 */
export function ShieldMark({ size = 24, ...rest }: IconProps) {
  return (
    <svg {...base({ size, ...rest })} strokeWidth={1.4}>
      <path d="M12 2.5 4.5 5.6v6.1c0 4.6 3.1 8.4 7.5 9.8 4.4-1.4 7.5-5.2 7.5-9.8V5.6L12 2.5Z" />
      <path d="M8.4 12.1 10.9 14.6 15.8 9.4" />
    </svg>
  );
}

export function AlertTriangle({ size = 16, ...rest }: IconProps) {
  return (
    <svg {...base({ size, ...rest })}>
      <path d="M12 4.2 2.9 19.4h18.2L12 4.2Z" />
      <path d="M12 9.6v4.1" />
      <path d="M12 16.7v.1" />
    </svg>
  );
}

export function CheckCircle({ size = 16, ...rest }: IconProps) {
  return (
    <svg {...base({ size, ...rest })}>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M8.2 12.2 10.9 14.9 15.9 9.4" />
    </svg>
  );
}

export function XCircle({ size = 16, ...rest }: IconProps) {
  return (
    <svg {...base({ size, ...rest })}>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M9.2 9.2 14.8 14.8" />
      <path d="M14.8 9.2 9.2 14.8" />
    </svg>
  );
}

export function ShieldCheck({ size = 16, ...rest }: IconProps) {
  return (
    <svg {...base({ size, ...rest })}>
      <path d="M12 3.1 5.4 5.8v5.5c0 4.1 2.7 7.5 6.6 8.7 3.9-1.2 6.6-4.6 6.6-8.7V5.8L12 3.1Z" />
      <path d="M9.2 12.2 11.3 14.3 15 10.3" />
    </svg>
  );
}

export function Users({ size = 16, ...rest }: IconProps) {
  return (
    <svg {...base({ size, ...rest })}>
      <circle cx="9.2" cy="8.6" r="3.1" />
      <path d="M3.4 19.4c0-3.2 2.6-5.4 5.8-5.4s5.8 2.2 5.8 5.4" />
      <path d="M16.1 6.2a3 3 0 0 1 0 5.6" />
      <path d="M17.6 14.4c1.9.5 3.2 2.1 3.2 4.3" />
    </svg>
  );
}

export function DoorExit({ size = 16, ...rest }: IconProps) {
  return (
    <svg {...base({ size, ...rest })}>
      <path d="M13.6 3.6H5.9v16.8h7.7" />
      <path d="M10.6 12h9.1" />
      <path d="M17.1 8.9 20.3 12l-3.2 3.1" />
    </svg>
  );
}

export function Timer({ size = 16, ...rest }: IconProps) {
  return (
    <svg {...base({ size, ...rest })}>
      <circle cx="12" cy="13.2" r="7.4" />
      <path d="M12 9.4v3.9l2.6 1.6" />
      <path d="M9.4 2.9h5.2" />
    </svg>
  );
}

export function Activity({ size = 16, ...rest }: IconProps) {
  return (
    <svg {...base({ size, ...rest })}>
      <path d="M2.8 12.4h4l2.3-6.1 3.5 11.4 2.2-5.3h6.4" />
    </svg>
  );
}

export function RefreshCw({ size = 16, ...rest }: IconProps) {
  return (
    <svg {...base({ size, ...rest })}>
      <path d="M20 11.4a8 8 0 0 0-13.7-5.2L3.4 9" />
      <path d="M3.4 4.6V9h4.4" />
      <path d="M4 12.6a8 8 0 0 0 13.7 5.2l2.9-2.8" />
      <path d="M20.6 19.4V15h-4.4" />
    </svg>
  );
}

export function Play({ size = 16, ...rest }: IconProps) {
  return (
    <svg {...base({ size, ...rest })}>
      <path d="M8.6 5.4 18.4 12l-9.8 6.6V5.4Z" />
    </svg>
  );
}

export function ArrowUpRight({ size = 16, ...rest }: IconProps) {
  return (
    <svg {...base({ size, ...rest })}>
      <path d="M7.2 16.8 16.8 7.2" />
      <path d="M9.4 7.2h7.4v7.4" />
    </svg>
  );
}

export function Lock({ size = 16, ...rest }: IconProps) {
  return (
    <svg {...base({ size, ...rest })}>
      <rect x="4.6" y="10.4" width="14.8" height="9.6" rx="2.2" />
      <path d="M8.2 10.4V7.8a3.8 3.8 0 0 1 7.6 0v2.6" />
    </svg>
  );
}

export function WarningOctagon({ size = 16, ...rest }: IconProps) {
  return (
    <svg {...base({ size, ...rest })}>
      <path d="M8.5 2.9h7L21.1 8.5v7l-5.6 5.6h-7L2.9 15.5v-7l5.6-5.6Z" />
      <path d="M12 7.9v4.6" />
      <path d="M12 15.7v.1" />
    </svg>
  );
}

export function ChevronDown({ size = 16, ...rest }: IconProps) {
  return (
    <svg {...base({ size, ...rest })}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

export function Compass({ size = 16, ...rest }: IconProps) {
  return (
    <svg {...base({ size, ...rest })}>
      <circle cx="12" cy="12" r="8.8" />
      <polygon points="12,6.5 15.5,12 12,17.5 8.5,12" strokeWidth={1.4} fill="currentColor" fillOpacity={0.2} />
      <path d="M12 3.2v2M12 18.8v2M3.2 12h2M18.8 12h2" />
    </svg>
  );
}

export function Crosshair({ size = 16, ...rest }: IconProps) {
  return (
    <svg {...base({ size, ...rest })}>
      <circle cx="12" cy="12" r="7.5" />
      <circle cx="12" cy="12" r="2.2" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3" />
    </svg>
  );
}

export function Radio({ size = 16, ...rest }: IconProps) {
  return (
    <svg {...base({ size, ...rest })}>
      <circle cx="12" cy="12" r="2.2" />
      <path d="M8.2 8.2a5.4 5.4 0 0 0 0 7.6M15.8 8.2a5.4 5.4 0 0 1 0 7.6" />
      <path d="M5.4 5.4a9.3 9.3 0 0 0 0 13.2M18.6 5.4a9.3 9.3 0 0 1 0 13.2" />
    </svg>
  );
}

export function Layers({ size = 16, ...rest }: IconProps) {
  return (
    <svg {...base({ size, ...rest })}>
      <polygon points="12,3.5 20.5,8 12,12.5 3.5,8" />
      <path d="M3.5 12.5 12 17l8.5-4.5" />
      <path d="M3.5 16.5 12 21l8.5-4.5" />
    </svg>
  );
}


