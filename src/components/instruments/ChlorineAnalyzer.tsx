import React, { useMemo } from 'react';

interface ChlorineAnalyzerProps {
  value: number | null;
  max: number;
  unit: string;
}

/**
 * Chlorine Analyzer - realistic WTP panel-mount design
 * Modelled after real Hach CL17 / ProMinent / ABB style analyzers
 * Features: panel housing, LCD display, status LEDs, reagent chamber,
 * sample tubing, and bar indicator
 */
const ChlorineAnalyzer: React.FC<ChlorineAnalyzerProps> = ({ value, max, unit }) => {
  const percentage = useMemo(() => Math.min(100, Math.max(0, ((value ?? 0) / max) * 100)), [value, max]);
  const isNormal = value !== null && value >= 0.2 && value <= 2.0;
  const isLow = value !== null && value < 0.2;
  const isHigh = value !== null && value > 2.0;

  const getStatusColor = () => {
    if (value === null) return 'hsl(var(--muted-foreground))';
    if (isNormal) return 'hsl(var(--success))';
    if (isHigh) return 'hsl(var(--destructive))';
    return 'hsl(var(--warning))';
  };

  const statusLabel = isNormal ? 'NORMAL' : isLow ? 'LOW' : 'HIGH';

  return (
    <div className="flex flex-col items-center gap-0.5">
      <svg width="100%" viewBox="0 0 100 130" className="drop-shadow-md max-w-[200px]">
        <defs>
          {/* Metallic body gradient */}
          <linearGradient id="cl-body-grad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="hsl(var(--secondary))" />
            <stop offset="40%" stopColor="hsl(var(--card))" />
            <stop offset="100%" stopColor="hsl(var(--secondary))" />
          </linearGradient>
          {/* LCD backlight */}
          <linearGradient id="cl-lcd-bg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--background))" />
            <stop offset="100%" stopColor="hsl(var(--muted) / 0.5)" />
          </linearGradient>
          {/* Reagent liquid */}
          <linearGradient id="cl-reagent" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(50 90% 65% / 0.7)" />
            <stop offset="100%" stopColor="hsl(45 85% 50% / 0.5)" />
          </linearGradient>
          {/* Glow filter for active LED */}
          <filter id="cl-led-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="1.5" result="glow" />
            <feMerge>
              <feMergeNode in="glow" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* ===== OUTER BODY — Panel mount housing ===== */}
        <rect x="8" y="2" width="84" height="126" rx="5"
          fill="url(#cl-body-grad)" stroke="hsl(var(--border))" strokeWidth="1.5" />
        {/* Inner panel inset */}
        <rect x="12" y="6" width="76" height="118" rx="3.5"
          fill="hsl(var(--card))" stroke="hsl(var(--border))" strokeWidth="0.8" />

        {/* Corner mounting screws */}
        {[[15, 9], [83, 9], [15, 121], [83, 121]].map(([cx, cy], i) => (
          <g key={i}>
            <circle cx={cx} cy={cy} r="3" fill="hsl(var(--muted))" stroke="hsl(var(--border))" strokeWidth="0.5" />
            <line x1={cx - 1.5} y1={cy} x2={cx + 1.5} y2={cy}
              stroke="hsl(var(--muted-foreground))" strokeOpacity="0.4" strokeWidth="0.6" />
          </g>
        ))}

        {/* ===== BRAND / MODEL LABEL ===== */}
        <text x="50" y="17" textAnchor="middle"
          className="fill-muted-foreground"
          style={{ fontSize: '5.5px', fontFamily: "'Inter', sans-serif", fontWeight: 600, letterSpacing: '1px' }}>
          CL ANALYZER
        </text>

        {/* ===== LCD DISPLAY SECTION ===== */}
        {/* LCD bezel */}
        <rect x="16" y="21" width="68" height="32" rx="3"
          fill="hsl(var(--secondary))" stroke="hsl(var(--border))" strokeWidth="0.8" />
        {/* LCD screen */}
        <rect x="18" y="23" width="64" height="28" rx="2"
          fill="url(#cl-lcd-bg)" />
        {/* LCD scan line effect */}
        <line x1="18" y1="37" x2="82" y2="37" stroke="hsl(var(--foreground) / 0.06)" strokeWidth="0.5" />
        <line x1="18" y1="41" x2="82" y2="41" stroke="hsl(var(--foreground) / 0.04)" strokeWidth="0.5" />

        {/* Main value display */}
        <text x="50" y="43" textAnchor="middle"
          fill={getStatusColor()}
          style={{ fontSize: '16px', fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace", fontWeight: 700 }}>
          {value?.toFixed(3) ?? '—'}
        </text>
        {/* Unit label on LCD */}
        <text x="50" y="29" textAnchor="middle"
          fill="hsl(var(--muted-foreground))"
          style={{ fontSize: '6px', fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>
          {unit}
        </text>

        {/* ===== STATUS LED ROW ===== */}
        <g>
          {/* LOW LED */}
          <circle cx="26" cy="60" r="3"
            fill={isLow ? 'hsl(var(--warning))' : 'hsl(var(--muted))'}
            stroke="hsl(var(--border))" strokeWidth="0.5"
            filter={isLow ? 'url(#cl-led-glow)' : undefined}
          />
          <text x="26" y="67" textAnchor="middle"
            className="fill-muted-foreground"
            style={{ fontSize: '4.5px' }}>LOW</text>

          {/* NORMAL LED */}
          <circle cx="50" cy="60" r="3"
            fill={isNormal ? 'hsl(var(--success))' : 'hsl(var(--muted))'}
            stroke="hsl(var(--border))" strokeWidth="0.5"
            filter={isNormal ? 'url(#cl-led-glow)' : undefined}
          >
            {isNormal && (
              <animate attributeName="opacity" values="1;0.7;1" dur="2s" repeatCount="indefinite" />
            )}
          </circle>
          <text x="50" y="67" textAnchor="middle"
            className="fill-muted-foreground"
            style={{ fontSize: '4.5px' }}>OK</text>

          {/* HIGH LED */}
          <circle cx="74" cy="60" r="3"
            fill={isHigh ? 'hsl(var(--destructive))' : 'hsl(var(--muted))'}
            stroke="hsl(var(--border))" strokeWidth="0.5"
            filter={isHigh ? 'url(#cl-led-glow)' : undefined}
          >
            {isHigh && (
              <animate attributeName="opacity" values="1;0.4;1" dur="0.8s" repeatCount="indefinite" />
            )}
          </circle>
          <text x="74" y="67" textAnchor="middle"
            className="fill-muted-foreground"
            style={{ fontSize: '4.5px' }}>HIGH</text>
        </g>

        {/* ===== BAR GRAPH INDICATOR ===== */}
        {/* Bar background */}
        <rect x="18" y="72" width="64" height="6" rx="2"
          fill="hsl(var(--secondary))" stroke="hsl(var(--border))" strokeWidth="0.5" />
        {/* Safe zone indicator (0.2 to 2.0 out of 0-5 = 4% to 40%) */}
        <rect x={18 + 64 * (0.2 / max)} y="72"
          width={64 * ((2.0 - 0.2) / max)} height="6" rx="0"
          fill="hsl(var(--success))" fillOpacity="0.12" />
        {/* Active bar */}
        <rect x="18" y="72"
          width={Math.max(0, 64 * percentage / 100)} height="6" rx="2"
          fill={getStatusColor()}
          className="transition-all duration-500 ease-out" />
        {/* Scale marks */}
        {[0, 1, 2, 3, 4, 5].map(v => (
          <line key={v} x1={18 + (v / max) * 64} y1="79" x2={18 + (v / max) * 64} y2="81"
            stroke="hsl(var(--muted-foreground))" strokeOpacity="0.4" strokeWidth="0.5" />
        ))}
        <text x="18" y="85" textAnchor="start"
          className="fill-muted-foreground" style={{ fontSize: '4px' }}>0</text>
        <text x={18 + 64 * 0.5} y="85" textAnchor="middle"
          className="fill-muted-foreground" style={{ fontSize: '4px' }}>2.5</text>
        <text x="82" y="85" textAnchor="end"
          className="fill-muted-foreground" style={{ fontSize: '4px' }}>5</text>

        {/* ===== REAGENT CHAMBER / SAMPLE CELL ===== */}
        {/* Glass chamber */}
        <rect x="20" y="89" width="16" height="22" rx="3"
          fill="hsl(var(--card))" stroke="hsl(var(--border))" strokeWidth="0.8" />
        {/* Reagent liquid inside */}
        {value !== null && <rect x="22" y={89 + 22 * (1 - Math.min(percentage / 100 + 0.3, 1))}
          width="12" height={22 * Math.min(percentage / 100 + 0.3, 1)} rx="2"
          fill="url(#cl-reagent)" opacity="0.8">
          <animate attributeName="opacity" values="0.7;0.9;0.7" dur="3s" repeatCount="indefinite" />
        </rect>}
        {/* Chamber cap */}
        <rect x="22" y="87" width="12" height="3" rx="1"
          fill="hsl(var(--muted))" stroke="hsl(var(--border))" strokeWidth="0.4" />

        {/* Sample inlet tube */}
        <line x1="28" y1="111" x2="28" y2="118"
          stroke="hsl(var(--muted-foreground))" strokeOpacity="0.4" strokeWidth="2" strokeLinecap="round" />
        <circle cx="28" cy="119" r="2"
          fill="hsl(var(--muted))" stroke="hsl(var(--border))" strokeWidth="0.4" />

        {/* ===== CONTROL BUTTONS ===== */}
        {/* Button panel area */}
        <rect x="42" y="89" width="42" height="22" rx="2"
          fill="hsl(var(--muted))" fillOpacity="0.3" stroke="hsl(var(--border))" strokeWidth="0.4" />

        {/* Menu button */}
        <rect x="46" y="92" width="14" height="7" rx="1.5"
          fill="hsl(var(--muted))" stroke="hsl(var(--border))" strokeWidth="0.5" />
        <text x="53" y="97.5" textAnchor="middle"
          className="fill-muted-foreground"
          style={{ fontSize: '4px', fontWeight: 600 }}>MENU</text>

        {/* Enter button */}
        <rect x="64" y="92" width="14" height="7" rx="1.5"
          fill="hsl(var(--muted))" stroke="hsl(var(--border))" strokeWidth="0.5" />
        <text x="71" y="97.5" textAnchor="middle"
          className="fill-muted-foreground"
          style={{ fontSize: '4px', fontWeight: 600 }}>SET</text>

        {/* Nav arrows */}
        <polygon points="53,103 49,108 57,108"
          fill="hsl(var(--muted))" stroke="hsl(var(--border))" strokeWidth="0.4" />
        <polygon points="71,108 67,103 75,103"
          fill="hsl(var(--muted))" stroke="hsl(var(--border))" strokeWidth="0.4" />

        {/* ===== STATUS TEXT ===== */}
        {value !== null && <><rect x="32" y="114" width="36" height="8" rx="2"
          fill={getStatusColor()} fillOpacity="0.12" />
        <text x="50" y="120" textAnchor="middle"
          fill={getStatusColor()}
          style={{ fontSize: '5.5px', fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace", fontWeight: 700, letterSpacing: '0.5px' }}>
          {statusLabel}
        </text></>}
      </svg>
    </div>
  );
};

export default ChlorineAnalyzer;
