import React, { useMemo } from 'react';

interface PhAnalyzerProps {
  value: number | null;
  unit: string;
}

/**
 * pH Analyzer — realistic WTP panel-mount design
 * Modelled after Hach PHD sc / Endress+Hauser Liquiline style
 * Features: panel housing, LCD display, pH spectrum bar,
 * electrode probe visualization, status LEDs, control buttons
 */
const PhAnalyzer: React.FC<PhAnalyzerProps> = ({ value, unit }) => {
  const isNormal = value !== null && value >= 6.5 && value <= 8.5;
  const isAcidic = value !== null && value < 6.5 && value > 0;
  const isAlkaline = value !== null && value > 8.5;

  const getStatusColor = () => {
    if (isNormal) return 'hsl(var(--success))';
    if (isAcidic) return 'hsl(0 80% 55%)';
    if (isAlkaline) return 'hsl(240 70% 60%)';
    return 'hsl(var(--muted-foreground))';
  };

  // pH to color mapping — realistic pH color spectrum
  const getPhColor = useMemo(() => {
    if (value === null || value <= 0) return 'hsl(var(--muted-foreground))';
    if (value < 3) return 'hsl(0 85% 50%)';       // Strong acid — red
    if (value < 5) return 'hsl(25 90% 55%)';       // Acid — orange
    if (value < 6.5) return 'hsl(45 90% 55%)';     // Weak acid — yellow
    if (value <= 8.5) return 'hsl(142 65% 45%)';    // Neutral — green
    if (value < 10) return 'hsl(200 75% 55%)';      // Weak base — blue
    if (value < 12) return 'hsl(240 70% 55%)';      // Base — indigo
    return 'hsl(280 70% 50%)';                       // Strong base — purple
  }, [value]);

  const statusLabel = isNormal ? 'NORMAL' : isAcidic ? 'ACIDIC' : isAlkaline ? 'ALKALINE' : '---';
  const pointerX = 18 + ((value ?? 0) / 14) * 64;

  return (
    <div className="flex flex-col items-center gap-0.5">
      <svg width="100%" viewBox="0 0 100 130" className="drop-shadow-md max-w-[200px]">
        <defs>
          {/* Body gradient */}
          <linearGradient id="ph-body-grad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="hsl(var(--secondary))" />
            <stop offset="40%" stopColor="hsl(var(--card))" />
            <stop offset="100%" stopColor="hsl(var(--secondary))" />
          </linearGradient>
          {/* LCD backlight */}
          <linearGradient id="ph-lcd-bg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--background))" />
            <stop offset="100%" stopColor="hsl(var(--muted) / 0.5)" />
          </linearGradient>
          {/* pH color spectrum gradient for bar */}
          <linearGradient id="ph-spectrum" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="hsl(0 85% 50%)" />
            <stop offset="21%" stopColor="hsl(25 90% 55%)" />
            <stop offset="36%" stopColor="hsl(45 90% 55%)" />
            <stop offset="46%" stopColor="hsl(100 65% 50%)" />
            <stop offset="54%" stopColor="hsl(142 65% 45%)" />
            <stop offset="64%" stopColor="hsl(200 75% 55%)" />
            <stop offset="78%" stopColor="hsl(240 70% 55%)" />
            <stop offset="100%" stopColor="hsl(280 70% 50%)" />
          </linearGradient>
          {/* LED glow */}
          <filter id="ph-led-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="1.5" result="glow" />
            <feMerge>
              <feMergeNode in="glow" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          {/* Electrode glass gradient */}
          <linearGradient id="ph-electrode" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(200 20% 70%)" stopOpacity="0.4" />
            <stop offset="50%" stopColor="hsl(200 20% 60%)" stopOpacity="0.25" />
            <stop offset="100%" stopColor="hsl(200 20% 50%)" stopOpacity="0.35" />
          </linearGradient>
        </defs>

        {/* ===== OUTER HOUSING ===== */}
        <rect x="8" y="2" width="84" height="126" rx="5"
          fill="url(#ph-body-grad)" stroke="hsl(var(--border))" strokeWidth="1.5" />
        {/* Inner panel */}
        <rect x="12" y="6" width="76" height="118" rx="3.5"
          fill="hsl(var(--card))" stroke="hsl(var(--border))" strokeWidth="0.8" />

        {/* Corner screws */}
        {[[15, 9], [83, 9], [15, 121], [83, 121]].map(([cx, cy], i) => (
          <g key={i}>
            <circle cx={cx} cy={cy} r="3" fill="hsl(var(--muted))" stroke="hsl(var(--border))" strokeWidth="0.5" />
            <line x1={cx - 1} y1={cy - 1} x2={cx + 1} y2={cy + 1}
              stroke="hsl(var(--muted-foreground))" strokeOpacity="0.4" strokeWidth="0.6" />
            <line x1={cx + 1} y1={cy - 1} x2={cx - 1} y2={cy + 1}
              stroke="hsl(var(--muted-foreground))" strokeOpacity="0.4" strokeWidth="0.6" />
          </g>
        ))}

        {/* ===== MODEL LABEL ===== */}
        <text x="50" y="17" textAnchor="middle"
          className="fill-muted-foreground"
          style={{ fontSize: '5.5px', fontFamily: "'Inter', sans-serif", fontWeight: 600, letterSpacing: '1px' }}>
          pH ANALYZER
        </text>

        {/* ===== LCD DISPLAY ===== */}
        <rect x="16" y="21" width="68" height="34" rx="3"
          fill="hsl(var(--secondary))" stroke="hsl(var(--border))" strokeWidth="0.8" />
        <rect x="18" y="23" width="64" height="30" rx="2"
          fill="url(#ph-lcd-bg)" />
        {/* LCD scan lines */}
        <line x1="18" y1="38" x2="82" y2="38" stroke="hsl(var(--foreground) / 0.05)" strokeWidth="0.5" />
        <line x1="18" y1="43" x2="82" y2="43" stroke="hsl(var(--foreground) / 0.04)" strokeWidth="0.5" />

        {/* pH unit label */}
        <text x="50" y="30" textAnchor="middle"
          fill="hsl(var(--muted-foreground))"
          style={{ fontSize: '6px', fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>
          {unit}
        </text>
        {/* Main value */}
        <text x="50" y="47" textAnchor="middle"
          fill={getPhColor}
          style={{ fontSize: '17px', fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace", fontWeight: 700 }}>
          {value?.toFixed(2) ?? '—'}
        </text>

        {/* ===== pH SPECTRUM BAR ===== */}
        {/* Spectrum background */}
        <rect x="18" y="60" width="64" height="6" rx="2"
          fill="url(#ph-spectrum)" opacity="0.6" />
        {/* Border */}
        <rect x="18" y="60" width="64" height="6" rx="2"
          fill="none" stroke="hsl(var(--border))" strokeWidth="0.5" />
        {/* Safe zone markers (6.5-8.5): 6.5/14 ≈ 46.4%  8.5/14 ≈ 60.7% */}
        <line x1={18 + 64 * (6.5 / 14)} y1="59" x2={18 + 64 * (6.5 / 14)} y2="67.5"
          stroke="hsl(var(--foreground))" strokeWidth="0.6" strokeDasharray="1 1" />
        <line x1={18 + 64 * (8.5 / 14)} y1="59" x2={18 + 64 * (8.5 / 14)} y2="67.5"
          stroke="hsl(var(--foreground))" strokeWidth="0.6" strokeDasharray="1 1" />
        {/* Value pointer triangle */}
        {value !== null && value > 0 && (
          <polygon
            points={`${pointerX - 2.5},59 ${pointerX + 2.5},59 ${pointerX},61`}
            fill={getPhColor}
          >
            <animate attributeName="opacity" values="1;0.6;1" dur="2s" repeatCount="indefinite" />
          </polygon>
        )}
        {/* Scale labels */}
        {[0, 7, 14].map(v => (
          <text key={v} x={18 + (v / 14) * 64} y="72"
            textAnchor="middle" className="fill-muted-foreground"
            style={{ fontSize: '4.5px' }}>
            {v}
          </text>
        ))}

        {/* ===== STATUS LEDs ===== */}
        {/* ACIDIC LED */}
        <circle cx="24" cy="79" r="3"
          fill={isAcidic ? 'hsl(0 80% 55%)' : 'hsl(var(--muted))'}
          stroke="hsl(var(--border))" strokeWidth="0.5"
          filter={isAcidic ? 'url(#ph-led-glow)' : undefined}
        />
        <text x="24" y="86" textAnchor="middle" className="fill-muted-foreground"
          style={{ fontSize: '4px' }}>ACID</text>

        {/* NORMAL LED */}
        <circle cx="50" cy="79" r="3"
          fill={isNormal ? 'hsl(var(--success))' : 'hsl(var(--muted))'}
          stroke="hsl(var(--border))" strokeWidth="0.5"
          filter={isNormal ? 'url(#ph-led-glow)' : undefined}
        >
          {isNormal && (
            <animate attributeName="opacity" values="1;0.7;1" dur="2s" repeatCount="indefinite" />
          )}
        </circle>
        <text x="50" y="86" textAnchor="middle" className="fill-muted-foreground"
          style={{ fontSize: '4px' }}>OK</text>

        {/* ALKALINE LED */}
        <circle cx="76" cy="79" r="3"
          fill={isAlkaline ? 'hsl(240 70% 60%)' : 'hsl(var(--muted))'}
          stroke="hsl(var(--border))" strokeWidth="0.5"
          filter={isAlkaline ? 'url(#ph-led-glow)' : undefined}
        />
        <text x="76" y="86" textAnchor="middle" className="fill-muted-foreground"
          style={{ fontSize: '4px' }}>ALK</text>

        {/* ===== ELECTRODE PROBE VISUALIZATION ===== */}
        {/* Probe holder/socket */}
        <rect x="18" y="90" width="20" height="24" rx="3"
          fill="hsl(var(--card))" stroke="hsl(var(--border))" strokeWidth="0.8" />
        {/* Glass electrode tube */}
        <rect x="23" y="92" width="10" height="18" rx="4"
          fill="url(#ph-electrode)" stroke="hsl(var(--border))" strokeWidth="0.5" />
        {/* Electrode inner element */}
        <line x1="28" y1="94" x2="28" y2="107"
          stroke="hsl(var(--muted-foreground))" strokeOpacity="0.3" strokeWidth="1.5" strokeLinecap="round" />
        {/* Electrode tip — bulb */}
        <ellipse cx="28" cy="108" rx="4" ry="2.5"
          fill="hsl(var(--muted-foreground))" fillOpacity="0.15" stroke="hsl(var(--border))" strokeWidth="0.4" />
        {/* Connection cable */}
        <line x1="28" y1="90" x2="28" y2="87"
          stroke="hsl(var(--muted-foreground))" strokeOpacity="0.3" strokeWidth="2" strokeLinecap="round" />

        {/* ===== CONTROL BUTTONS ===== */}
        <rect x="44" y="90" width="40" height="24" rx="2"
          fill="hsl(var(--muted))" fillOpacity="0.3" stroke="hsl(var(--border))" strokeWidth="0.4" />

        {/* CAL button */}
        <rect x="48" y="93" width="14" height="7" rx="1.5"
          fill="hsl(var(--muted))" stroke="hsl(var(--border))" strokeWidth="0.5" />
        <text x="55" y="98.5" textAnchor="middle" className="fill-muted-foreground"
          style={{ fontSize: '4px', fontWeight: 600 }}>CAL</text>

        {/* DIAG button */}
        <rect x="66" y="93" width="14" height="7" rx="1.5"
          fill="hsl(var(--muted))" stroke="hsl(var(--border))" strokeWidth="0.5" />
        <text x="73" y="98.5" textAnchor="middle" className="fill-muted-foreground"
          style={{ fontSize: '4px', fontWeight: 600 }}>DIAG</text>

        {/* Arrow UP/DOWN */}
        <polygon points="55,104.5 52,109 58,109"
          fill="hsl(var(--muted))" stroke="hsl(var(--border))" strokeWidth="0.4" />
        <polygon points="73,109 70,104.5 76,104.5"
          fill="hsl(var(--muted))" stroke="hsl(var(--border))" strokeWidth="0.4" />

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

export default PhAnalyzer;
