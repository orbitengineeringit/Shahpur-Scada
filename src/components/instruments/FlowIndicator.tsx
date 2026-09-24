import React, { useMemo } from 'react';

interface FlowIndicatorProps {
  value: number;
  unit: string;
  max: number;
  direction?: 'inlet' | 'outlet';
}

/**
 * Flow Meter - realistic electromagnetic flow meter design
 * Blue head with LCD display, flanged pipe body with flow arrow
 */
const FlowIndicator: React.FC<FlowIndicatorProps> = ({ value, unit, max, direction }) => {
  const isActive = Math.abs(value) > 0.01;
  const percentage = useMemo(() => Math.min(100, Math.max(0, (Math.abs(value) / max) * 100)), [value, max]);

  const isOutlet = direction === 'outlet';
  const headColor = isOutlet ? "hsl(38 92% 50%" : "hsl(199 89% 48%";
  const animHsl = isOutlet ? "38 92%" : "199 89%";

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="100%" height="auto" viewBox="0 0 100 120" className="drop-shadow-md max-w-[200px]">
        {/* Direction label above head */}
        {direction && (
          <text x="50" y="8" textAnchor="middle"
            fill={isOutlet ? "hsl(38 92% 50%)" : "hsl(199 89% 50%)"}
            style={{ fontSize: '7px', fontWeight: 700, letterSpacing: '1px' }}>
            {direction === 'inlet' ? '▶ INLET' : 'OUTLET ▶'}
          </text>
        )}

        {/* --- Transmitter Head (top) --- */}
        {/* Head housing */}
        <polygon points="32,20 68,20 72,28 28,28"
          fill={`${headColor} / 0.85)`} stroke="hsl(var(--border))" strokeWidth="1" />
        <rect x="28" y="28" width="44" height="28" rx="3"
          fill={`${headColor} / 0.9)`} stroke="hsl(var(--border))" strokeWidth="1.2" />
        {/* Side bolts */}
        <circle cx="30" cy="32" r="2" fill="hsl(var(--muted))" stroke="hsl(var(--border))" strokeWidth="0.5" />
        <circle cx="70" cy="32" r="2" fill="hsl(var(--muted))" stroke="hsl(var(--border))" strokeWidth="0.5" />

        {/* LCD Display */}
        <rect x="33" y="32" width="34" height="16" rx="2"
          fill="hsl(var(--secondary))" stroke="hsl(var(--border))" strokeWidth="0.6" />
        <rect x="35" y="34" width="30" height="12" rx="1"
          fill="hsl(142 71% 45% / 0.08)" />
        {/* Reading on LCD */}
        <text x="50" y="43" textAnchor="middle"
          className="fill-foreground"
          style={{ fontSize: '9px', fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace", fontWeight: 700 }}>
          {value.toFixed(2)}
        </text>

        {/* Neck/connector */}
        <rect x="42" y="56" width="16" height="16" rx="1"
          fill="hsl(var(--muted))" stroke="hsl(var(--border))" strokeWidth="0.8" />

        {/* --- Pipe Body --- */}
        {/* Left flange */}
        <ellipse cx="18" cy="85" rx="8" ry="16"
          fill="hsl(var(--muted))" stroke="hsl(var(--border))" strokeWidth="1" />
        {/* Flange bolts left */}
        {[73, 79, 85, 91, 97].map(y => (
          <circle key={y} cx="18" cy={y} r="1.5"
            fill="hsl(var(--muted-foreground) / 0.3)" stroke="hsl(var(--border))" strokeWidth="0.3" />
        ))}

        {/* Main pipe body */}
        <rect x="18" y="72" width="64" height="26" rx="3"
          fill="hsl(var(--muted))" stroke="hsl(var(--border))" strokeWidth="1.2" />
        {/* Pipe inner shading */}
        <rect x="20" y="74" width="60" height="22" rx="2"
          fill="hsl(var(--muted) / 0.5)" />

        {/* Right flange */}
        <ellipse cx="82" cy="85" rx="8" ry="16"
          fill="hsl(var(--muted))" stroke="hsl(var(--border))" strokeWidth="1" />
        {/* Flange bolts right */}
        {[73, 79, 85, 91, 97].map(y => (
          <circle key={y} cx="82" cy={y} r="1.5"
            fill="hsl(var(--muted-foreground) / 0.3)" stroke="hsl(var(--border))" strokeWidth="0.3" />
        ))}

        {/* === Water Flow Animation (only when active) === */}
        {isActive && (
          <g>
            <circle r="2" fill={`hsl(${animHsl} 55%)`} opacity="0.5">
              <animate attributeName="cx" values="18;40;62;82" dur="1.2s" repeatCount="indefinite" />
              <animate attributeName="cy" values="85;84;86;85" dur="1.2s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0;0.5;0.5;0" dur="1.2s" repeatCount="indefinite" />
            </circle>
            <circle r="1.5" fill={`hsl(${animHsl} 60%)`} opacity="0.4">
              <animate attributeName="cx" values="18;38;60;82" dur="1s" repeatCount="indefinite" begin="0.3s" />
              <animate attributeName="cy" values="83;85;83;84" dur="1s" repeatCount="indefinite" begin="0.3s" />
              <animate attributeName="opacity" values="0;0.4;0.4;0" dur="1s" repeatCount="indefinite" begin="0.3s" />
            </circle>
            <circle r="1" fill={`hsl(${animHsl} 65%)`} opacity="0.3">
              <animate attributeName="cx" values="18;42;65;82" dur="1.4s" repeatCount="indefinite" begin="0.6s" />
              <animate attributeName="cy" values="86;84;86;85" dur="1.4s" repeatCount="indefinite" begin="0.6s" />
              <animate attributeName="opacity" values="0;0.35;0.35;0" dur="1.4s" repeatCount="indefinite" begin="0.6s" />
            </circle>

            <rect x="20" y="75" width="60" height="20" rx="2" fill={`hsl(${animHsl} 50%)`} opacity="0.05">
              <animate attributeName="opacity" values="0.03;0.08;0.03" dur="2s" repeatCount="indefinite" />
            </rect>
          </g>
        )}

        {/* Flow status bar */}
        <rect x="20" y="102" width="60" height="4" rx="2" fill="hsl(var(--secondary))" />
        <rect x="20" y="102" width={60 * percentage / 100} height="4" rx="2"
          fill={isActive ? (isOutlet ? 'hsl(38 92% 50%)' : 'hsl(var(--primary))') : 'hsl(var(--muted))'}
          className="transition-all duration-500 ease-out" />

        {/* Unit label */}
        <text x="50" y="116" textAnchor="middle"
          className="fill-muted-foreground"
          style={{ fontSize: '7px' }}>
          {unit}
        </text>
      </svg>
    </div>
  );
};

export default FlowIndicator;
