import React, { useMemo } from 'react';

interface TurbidityAnalyzerProps {
  value: number | null;
  max: number;
  unit: string;
}

/**
 * Turbidity Analyzer — realistic WTP nephelometer panel-mount design
 * Modelled after Hach TU5300 / Endress+Hauser Turbimax style
 * Features: panel housing, LCD display, optical sample cell with
 * laser beam animation, NTU bar indicator, status LEDs, control buttons
 */
const TurbidityAnalyzer: React.FC<TurbidityAnalyzerProps> = ({ value, max, unit }) => {
  const percentage = useMemo(() => Math.min(100, Math.max(0, ((value ?? 0) / max) * 100)), [value, max]);
  const isGood = value !== null && value <= 5;
  const isWarning = value !== null && value > 5 && value <= 10;
  const isDanger = value !== null && value > 10;

  const getStatusColor = () => {
    if (value === null) return 'hsl(var(--muted-foreground))';
    if (isGood) return 'hsl(var(--success))';
    if (isWarning) return 'hsl(var(--warning))';
    return 'hsl(var(--destructive))';
  };

  const statusLabel = isGood ? 'CLEAR' : isWarning ? 'CAUTION' : 'TURBID';

  // Water clarity — more turbid = more opaque fill
  const waterOpacity = useMemo(() => {
    return Math.min(0.15 + ((value ?? 0) / max) * 0.6, 0.75);
  }, [value, max]);

  const waterColor = useMemo(() => {
    if (isGood) return 'hsl(200 60% 60%)';
    if (isWarning) return 'hsl(40 70% 55%)';
    return 'hsl(25 65% 45%)';
  }, [isGood, isWarning]);

  return (
    <div className="flex flex-col items-center gap-0.5">
      <svg width="100%" viewBox="0 0 100 130" className="drop-shadow-md max-w-[200px]">
        <defs>
          {/* Body gradient */}
          <linearGradient id="tb-body-grad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="hsl(var(--secondary))" />
            <stop offset="40%" stopColor="hsl(var(--card))" />
            <stop offset="100%" stopColor="hsl(var(--secondary))" />
          </linearGradient>
          {/* LCD backlight */}
          <linearGradient id="tb-lcd-bg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--background))" />
            <stop offset="100%" stopColor="hsl(var(--muted) / 0.5)" />
          </linearGradient>
          {/* LED glow */}
          <filter id="tb-led-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="1.5" result="glow" />
            <feMerge>
              <feMergeNode in="glow" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          {/* Laser beam glow */}
          <filter id="tb-beam-glow" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="1" result="glow" />
            <feMerge>
              <feMergeNode in="glow" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          {/* Water sample gradient */}
          <linearGradient id="tb-water" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={waterColor} stopOpacity={waterOpacity * 0.6} />
            <stop offset="100%" stopColor={waterColor} stopOpacity={waterOpacity} />
          </linearGradient>
        </defs>

        {/* ===== OUTER HOUSING ===== */}
        <rect x="8" y="2" width="84" height="126" rx="5"
          fill="url(#tb-body-grad)" stroke="hsl(var(--border))" strokeWidth="1.5" />
        {/* Inner panel */}
        <rect x="12" y="6" width="76" height="118" rx="3.5"
          fill="hsl(var(--card))" stroke="hsl(var(--border))" strokeWidth="0.8" />

        {/* Corner screws */}
        {[[15, 9], [83, 9], [15, 121], [83, 121]].map(([cx, cy], i) => (
          <g key={i}>
            <circle cx={cx} cy={cy} r="3" fill="hsl(var(--muted))" stroke="hsl(var(--border))" strokeWidth="0.5" />
            <line x1={cx - 1.5} y1={cy} x2={cx + 1.5} y2={cy}
              stroke="hsl(var(--muted-foreground))" strokeOpacity="0.4" strokeWidth="0.6" />
          </g>
        ))}

        {/* ===== MODEL LABEL ===== */}
        <text x="50" y="17" textAnchor="middle"
          className="fill-muted-foreground"
          style={{ fontSize: '5px', fontFamily: "'Inter', sans-serif", fontWeight: 600, letterSpacing: '1px' }}>
          TURBIDITY ANALYZER
        </text>

        {/* ===== LCD DISPLAY ===== */}
        <rect x="16" y="21" width="68" height="32" rx="3"
          fill="hsl(var(--secondary))" stroke="hsl(var(--border))" strokeWidth="0.8" />
        <rect x="18" y="23" width="64" height="28" rx="2"
          fill="url(#tb-lcd-bg)" />
        {/* LCD scan lines */}
        <line x1="18" y1="37" x2="82" y2="37" stroke="hsl(var(--foreground) / 0.05)" strokeWidth="0.5" />

        {/* Unit label */}
        <text x="50" y="29" textAnchor="middle"
          fill="hsl(var(--muted-foreground))"
          style={{ fontSize: '6px', fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>
          {unit}
        </text>
        {/* Main value */}
        <text x="50" y="45" textAnchor="middle"
          fill={getStatusColor()}
          style={{ fontSize: '16px', fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace", fontWeight: 700 }}>
          {value?.toFixed(2) ?? '—'}
        </text>

        {/* ===== NTU BAR INDICATOR ===== */}
        {/* Background */}
        <rect x="18" y="58" width="64" height="6" rx="2"
          fill="hsl(var(--secondary))" stroke="hsl(var(--border))" strokeWidth="0.5" />
        {/* Safe zone highlight (0-5 NTU = 0-5%) */}
        <rect x="18" y="58" width={64 * (5 / max)} height="6" rx="2"
          fill="hsl(var(--success) / 0.1)" />
        {/* Active bar */}
        <rect x="18" y="58"
          width={Math.max(0, 64 * percentage / 100)} height="6" rx="2"
          fill={getStatusColor()}
          className="transition-all duration-500 ease-out" />
        {/* Threshold markers */}
        <line x1={18 + 64 * (5 / max)} y1="57" x2={18 + 64 * (5 / max)} y2="65.5"
          stroke="hsl(var(--foreground))" strokeOpacity="0.4" strokeWidth="0.5" strokeDasharray="1 1" />
        <line x1={18 + 64 * (10 / max)} y1="57" x2={18 + 64 * (10 / max)} y2="65.5"
          stroke="hsl(var(--foreground))" strokeOpacity="0.4" strokeWidth="0.5" strokeDasharray="1 1" />
        {/* Scale */}
        <text x="18" y="71" textAnchor="start" className="fill-muted-foreground" style={{ fontSize: '4px' }}>0</text>
        <text x={18 + 64 * (5 / max)} y="71" textAnchor="middle" className="fill-muted-foreground" style={{ fontSize: '4px' }}>5</text>
        <text x={18 + 64 * (10 / max)} y="71" textAnchor="middle" className="fill-muted-foreground" style={{ fontSize: '4px' }}>10</text>
        <text x="82" y="71" textAnchor="end" className="fill-muted-foreground" style={{ fontSize: '4px' }}>{max}</text>

        {/* ===== OPTICAL SAMPLE CELL ===== */}
        {/* Cell housing */}
        <rect x="18" y="76" width="30" height="30" rx="4"
          fill="hsl(var(--secondary))" fillOpacity="0.5" stroke="hsl(var(--border))" strokeWidth="0.8" />
        {/* Glass vial / sample cell */}
        <rect x="23" y="79" width="20" height="24" rx="6"
          fill="hsl(var(--card))" stroke="hsl(var(--border))" strokeWidth="0.6" />
        {value !== null && <>
        {/* Water sample inside */}
        <rect x="25" y="81" width="16" height="20" rx="5"
          fill="url(#tb-water)">
          {/* Gentle shimmer animation */}
          <animate attributeName="opacity" values="0.8;1;0.8" dur="3s" repeatCount="indefinite" />
        </rect>

        {/* Infrared laser beam — horizontal through sample */}
        <line x1="18" y1="91" x2="23" y2="91"
          stroke="hsl(0 85% 55%)" strokeWidth="1" strokeLinecap="round"
          filter="url(#tb-beam-glow)" opacity="0.7">
          <animate attributeName="opacity" values="0.5;0.9;0.5" dur="1.5s" repeatCount="indefinite" />
        </line>
        <line x1="43" y1="91" x2="48" y2="91"
          stroke="hsl(0 85% 55%)" strokeOpacity="0.3" strokeWidth="0.8" strokeLinecap="round" />
        {/* Scattered light detector (90°) */}
        <line x1="33" y1="103" x2="33" y2="108"
          stroke="hsl(45 80% 55%)" strokeOpacity="0.5" strokeWidth="0.8" strokeLinecap="round">
          <animate attributeName="opacity" values="0.3;0.7;0.3" dur="2s" repeatCount="indefinite" />
        </line>
        {/* Laser emitter dot */}
        <circle cx="18" cy="91" r="1.5"
          fill="hsl(0 85% 55%)" opacity="0.8">
          <animate attributeName="opacity" values="0.6;1;0.6" dur="1.5s" repeatCount="indefinite" />
        </circle>
        </>}
        {/* Detector label */}
        <text x="33" y="112" textAnchor="middle" className="fill-muted-foreground"
          style={{ fontSize: '3.5px' }}>DET</text>
        {/* Emitter label */}
        <text x="18" y="87" textAnchor="middle" className="fill-muted-foreground"
          style={{ fontSize: '3.5px' }}>IR</text>

        {/* ===== STATUS LEDs ===== */}
        <g>
          {/* CLEAR LED */}
          <circle cx="55" cy="80" r="3"
            fill={isGood ? 'hsl(var(--success))' : 'hsl(var(--muted))'}
            stroke="hsl(var(--border))" strokeWidth="0.5"
            filter={isGood ? 'url(#tb-led-glow)' : undefined}
          >
            {isGood && (
              <animate attributeName="opacity" values="1;0.7;1" dur="2s" repeatCount="indefinite" />
            )}
          </circle>
          <text x="55" y="87" textAnchor="middle" className="fill-muted-foreground"
            style={{ fontSize: '3.5px' }}>CLR</text>

          {/* WARN LED */}
          <circle cx="68" cy="80" r="3"
            fill={isWarning ? 'hsl(var(--warning))' : 'hsl(var(--muted))'}
            stroke="hsl(var(--border))" strokeWidth="0.5"
            filter={isWarning ? 'url(#tb-led-glow)' : undefined}
          >
            {isWarning && (
              <animate attributeName="opacity" values="1;0.5;1" dur="1s" repeatCount="indefinite" />
            )}
          </circle>
          <text x="68" y="87" textAnchor="middle" className="fill-muted-foreground"
            style={{ fontSize: '3.5px' }}>WRN</text>

          {/* ALARM LED */}
          <circle cx="81" cy="80" r="3"
            fill={isDanger ? 'hsl(var(--destructive))' : 'hsl(var(--muted))'}
            stroke="hsl(var(--border))" strokeWidth="0.5"
            filter={isDanger ? 'url(#tb-led-glow)' : undefined}
          >
            {isDanger && (
              <animate attributeName="opacity" values="1;0.3;1" dur="0.6s" repeatCount="indefinite" />
            )}
          </circle>
          <text x="81" y="87" textAnchor="middle" className="fill-muted-foreground"
            style={{ fontSize: '3.5px' }}>ALM</text>
        </g>

        {/* ===== CONTROL BUTTONS ===== */}
        <rect x="54" y="92" width="30" height="14" rx="2"
          fill="hsl(var(--muted))" fillOpacity="0.3" stroke="hsl(var(--border))" strokeWidth="0.4" />
        {/* ZERO button */}
        <rect x="57" y="94" width="11" height="7" rx="1.5"
          fill="hsl(var(--muted))" stroke="hsl(var(--border))" strokeWidth="0.5" />
        <text x="62.5" y="99.5" textAnchor="middle" className="fill-muted-foreground"
          style={{ fontSize: '3.5px', fontWeight: 600 }}>ZERO</text>
        {/* SPAN button */}
        <rect x="70" y="94" width="11" height="7" rx="1.5"
          fill="hsl(var(--muted))" stroke="hsl(var(--border))" strokeWidth="0.5" />
        <text x="75.5" y="99.5" textAnchor="middle" className="fill-muted-foreground"
          style={{ fontSize: '3.5px', fontWeight: 600 }}>SPAN</text>

        {/* ===== STATUS TEXT ===== */}
        {value !== null && <><rect x="30" y="116" width="40" height="7" rx="2"
          fill={getStatusColor()} fillOpacity="0.12" />
        <text x="50" y="121.5" textAnchor="middle"
          fill={getStatusColor()}
          style={{ fontSize: '5.5px', fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace", fontWeight: 700, letterSpacing: '0.5px' }}>
          {statusLabel}
        </text></>}
      </svg>
    </div>
  );
};

export default TurbidityAnalyzer;
