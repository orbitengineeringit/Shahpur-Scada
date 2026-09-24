import React, { useMemo } from 'react';
import { useScada } from '@/contexts/ScadaContext';


/**
 * WTP Process Simulation – Realistic Water Treatment Plant Mimic
 * 
 * Flow: Raw Water In → Flash Mixer → Flocculator → Settling Tank → 
 *       Filter Beds (Backwash Tank) → Clear Water Reservoir → HT Pumps → Out to OHTs
 * 
 * Cross-logic for process unit ON/OFF status:
 *  - Flash Mixer / Flocculator / Settling Tank / Filters: ON when Flow IN > 0.1
 *  - Chlorination: ON when Flow IN > 0.1 OR any pump running OR CW level > 5
 */

// ────────────────────────────────────────────────────────────
// CIRCULAR GAUGE (matching Intake/OHT quality)
// ────────────────────────────────────────────────────────────
interface GaugeProps { cx: number; cy: number; r: number; value: number; min: number; max: number; label: string; unit: string; }

const Gauge: React.FC<GaugeProps> = ({ cx, cy, r, value, min, max, label, unit }) => {
  const pNorm = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const pct = pNorm * 100;
  const nAngle = -135 + pNorm * 270;
  const nLen = r - 14;

  const getCol = () => {
    if (pct > 85) return 'hsl(var(--destructive))';
    if (pct > 65) return 'hsl(var(--warning))';
    return 'hsl(var(--success))';
  };

  const arc = (s: number, e: number, radius: number) => {
    const sr = (s - 90) * Math.PI / 180, er = (e - 90) * Math.PI / 180;
    const x1 = cx + radius * Math.cos(sr), y1 = cy + radius * Math.sin(sr);
    const x2 = cx + radius * Math.cos(er), y2 = cy + radius * Math.sin(er);
    return `M ${x1} ${y1} A ${radius} ${radius} 0 ${e - s > 180 ? 1 : 0} 1 ${x2} ${y2}`;
  };

  const arcR = r - 10;
  const arcStroke = Math.max(8, r * 0.2);
  const activeStroke = arcStroke + 2;
  const uid = label.replace(/[\s\/()#+]/g, '');

  return (
    <g>
      <defs>
        <filter id={`gg-w-${uid}`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="b" />
          <feComposite in="SourceGraphic" in2="b" operator="over" />
        </filter>
        <radialGradient id={`hub-w-${uid}`}>
          <stop offset="0%" stopColor={getCol()} />
          <stop offset="100%" stopColor={getCol()} stopOpacity="0.6" />
        </radialGradient>
      </defs>

      {/* Outer metallic case */}
      <circle cx={cx} cy={cy} r={r + 8} fill="#475569" />
      <circle cx={cx} cy={cy} r={r + 6} fill="#64748b" />
      <circle cx={cx} cy={cy} r={r + 4} fill="#334155" />

      {/* Inner gauge face */}
      <circle cx={cx} cy={cy} r={r} fill="hsl(var(--card))" stroke="hsl(var(--border))" strokeWidth="3" />
      <circle cx={cx} cy={cy} r={r - 2} fill="none" stroke="hsl(var(--muted))" strokeWidth="4" opacity="0.3" />

      {/* Zone arcs */}
      <path d={arc(-135, 135, arcR)} fill="none" stroke="hsl(var(--border))" strokeWidth={arcStroke} strokeLinecap="round" />
      <path d={arc(-135, -135 + 270 * 0.65, arcR)} fill="none" stroke="hsl(var(--success) / 0.35)" strokeWidth={arcStroke} strokeLinecap="round" />
      <path d={arc(-135 + 270 * 0.65, -135 + 270 * 0.85, arcR)} fill="none" stroke="hsl(var(--warning) / 0.45)" strokeWidth={arcStroke} strokeLinecap="round" />
      <path d={arc(-135 + 270 * 0.85, 135, arcR)} fill="none" stroke="hsl(var(--destructive) / 0.45)" strokeWidth={arcStroke} strokeLinecap="round" />

      {pct > 2 && (
        <path d={arc(-135, -135 + 270 * (pct / 100), arcR)} fill="none"
          stroke={getCol()} strokeWidth={activeStroke} strokeLinecap="round" filter={`url(#gg-w-${uid})`} />
      )}

      {/* Ticks */}
      {Array.from({ length: 11 }, (_, i) => {
        const a = (-135 + 270 * (i / 10) - 90) * Math.PI / 180;
        const iR = arcR - 10, oR = arcR - 3, lR = arcR - 22;
        const tv = min + (i / 10) * (max - min);
        const maj = i % 2 === 0;
        return (
          <g key={i}>
            <line
              x1={cx + (maj ? iR : iR + 5) * Math.cos(a)} y1={cy + (maj ? iR : iR + 5) * Math.sin(a)}
              x2={cx + oR * Math.cos(a)} y2={cy + oR * Math.sin(a)}
              stroke="hsl(var(--muted-foreground))" strokeWidth={maj ? 2 : 1}
            />
            {maj && (
              <text x={cx + lR * Math.cos(a)} y={cy + lR * Math.sin(a)}
                textAnchor="middle" dominantBaseline="central"
                fill="hsl(var(--foreground))" style={{ fontSize: `${Math.max(9, r * 0.2)}px`, fontWeight: 800 }}>
                {Number.isInteger(tv) ? tv : tv.toFixed(1)}
              </text>
            )}
          </g>
        );
      })}

      {/* Hub */}
      <circle cx={cx} cy={cy} r={Math.max(7, r * 0.16)} fill={`url(#hub-w-${uid})`} />
      <circle cx={cx} cy={cy} r={Math.max(4, r * 0.08)} fill={getCol()} opacity={0.9} />

      {/* Needle */}
      <line x1={0} y1={0} x2={0} y2={-nLen}
        stroke={getCol()} strokeWidth={3} strokeLinecap="round"
        style={{
          transform: `translate(${cx}px, ${cy}px) rotate(${nAngle}deg)`,
          transition: 'transform 1s cubic-bezier(0.4, 0, 0.2, 1)',
          filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.4))',
        }}
      />
      {pct > 1 && (
        <circle r={4.5} fill={getCol()} opacity={0.6}
          style={{
            transform: `translate(${cx}px, ${cy}px) rotate(${nAngle}deg) translateY(${-nLen}px)`,
            transition: 'transform 1s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        />
      )}

      {/* Label */}
      <text x={cx} y={cy - r - 16} textAnchor="middle" fill="hsl(var(--foreground))"
        style={{ fontSize: `${Math.max(13, r * 0.28)}px`, fontWeight: 800, letterSpacing: '0.6px' }}>
        {label}
      </text>

      {/* Value box */}
      <rect x={cx - 38} y={cy + r + 12} width={76} height={30} rx={5}
        fill="hsl(var(--card))" stroke="hsl(var(--border))" strokeWidth="1" />
      <text x={cx} y={cy + r + 32} textAnchor="middle" fill="hsl(var(--foreground))"
        style={{ fontSize: '15px', fontWeight: 800, fontFamily: "ui-monospace, monospace" }}>
        {value.toFixed(1)} <tspan fontSize="10" fill="hsl(var(--muted-foreground))" fontWeight="600">{unit}</tspan>
      </text>
    </g>
  );
};

// ────────────────────────────────────────────────────────────
// INLINE ANALYZER PANELS
// ────────────────────────────────────────────────────────────

// pH Analyzer
const InlinePhAnalyzer: React.FC<{ x: number; y: number; w: number; h: number; value: number; label: string }> = ({ x, y, w, h, value, label }) => {
  const isNormal = value >= 6.5 && value <= 8.5;
  const isAcidic = value < 6.5 && value > 0;
  const isAlkaline = value > 8.5;
  const getPhColor = () => {
    if (value <= 0) return 'hsl(var(--muted-foreground))';
    if (value < 3) return 'hsl(0 85% 50%)';
    if (value < 5) return 'hsl(25 90% 55%)';
    if (value < 6.5) return 'hsl(45 90% 55%)';
    if (value <= 8.5) return 'hsl(142 65% 45%)';
    if (value < 10) return 'hsl(200 75% 55%)';
    return 'hsl(240 70% 55%)';
  };
  const getStatusColor = () => isNormal ? 'hsl(var(--success))' : isAcidic ? 'hsl(0 80% 55%)' : isAlkaline ? 'hsl(240 70% 60%)' : 'hsl(var(--muted-foreground))';
  const statusLabel = isNormal ? 'NORMAL' : isAcidic ? 'ACIDIC' : isAlkaline ? 'ALKALINE' : '---';
  const pointerX = 18 + (value / 14) * 64;
  const uid = label.replace(/[\s\/()#+]/g, '');

  return (
    <svg x={x} y={y} width={w} height={h} viewBox="0 0 100 130" style={{ filter: 'drop-shadow(0 3px 8px rgba(0,0,0,0.2))' }}>
      <defs>
        <linearGradient id={`ph-body-${uid}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="hsl(var(--secondary))" />
          <stop offset="40%" stopColor="hsl(var(--card))" />
          <stop offset="100%" stopColor="hsl(var(--secondary))" />
        </linearGradient>
        <linearGradient id={`ph-spec-${uid}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="hsl(0 85% 50%)" />
          <stop offset="21%" stopColor="hsl(25 90% 55%)" />
          <stop offset="36%" stopColor="hsl(45 90% 55%)" />
          <stop offset="46%" stopColor="hsl(100 65% 50%)" />
          <stop offset="54%" stopColor="hsl(142 65% 45%)" />
          <stop offset="64%" stopColor="hsl(200 75% 55%)" />
          <stop offset="78%" stopColor="hsl(240 70% 55%)" />
          <stop offset="100%" stopColor="hsl(280 70% 50%)" />
        </linearGradient>
        <filter id={`ph-glow-${uid}`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="1.5" result="glow" />
          <feMerge><feMergeNode in="glow" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      {/* Housing */}
      <rect x="8" y="2" width="84" height="126" rx="5" fill={`url(#ph-body-${uid})`} stroke="hsl(var(--border))" strokeWidth="1.5" />
      <rect x="12" y="6" width="76" height="118" rx="3.5" fill="hsl(var(--card))" stroke="hsl(var(--border))" strokeWidth="0.8" />
      {/* Screws */}
      {[[15, 9], [83, 9], [15, 121], [83, 121]].map(([cx, cy], i) => (
        <g key={i}><circle cx={cx} cy={cy} r="3" fill="hsl(var(--muted))" stroke="hsl(var(--border))" strokeWidth="0.5" />
          <line x1={cx - 1} y1={cy - 1} x2={cx + 1} y2={cy + 1} stroke="hsl(var(--muted-foreground))" strokeOpacity="0.4" strokeWidth="0.6" />
          <line x1={cx + 1} y1={cy - 1} x2={cx - 1} y2={cy + 1} stroke="hsl(var(--muted-foreground))" strokeOpacity="0.4" strokeWidth="0.6" /></g>
      ))}
      {/* Label */}
      <text x="50" y="17" textAnchor="middle" fill="hsl(var(--muted-foreground))" style={{ fontSize: '5.5px', fontWeight: 600, letterSpacing: '1px' }}>● {label}</text>
      {/* LED */}
      <circle cx="14" cy="14.5" r="2.5" fill={value > 0 ? '#22c55e' : '#ef4444'}>
        {value > 0 && <animate attributeName="opacity" values="1;0.5;1" dur="2s" repeatCount="indefinite" />}
      </circle>
      {/* LCD */}
      <rect x="16" y="21" width="68" height="34" rx="3" fill="hsl(var(--secondary))" stroke="hsl(var(--border))" strokeWidth="0.8" />
      <rect x="18" y="23" width="64" height="30" rx="2" fill="hsl(var(--background))" />
      <text x="50" y="30" textAnchor="middle" fill="hsl(var(--muted-foreground))" style={{ fontSize: '6px', fontFamily: 'ui-monospace, monospace' }}>pH</text>
      <text x="50" y="47" textAnchor="middle" fill={getPhColor()} style={{ fontSize: '17px', fontFamily: 'ui-monospace, monospace', fontWeight: 700 }}>{value.toFixed(2)}</text>
      {/* pH Spectrum */}
      <rect x="18" y="60" width="64" height="6" rx="2" fill={`url(#ph-spec-${uid})`} opacity="0.6" />
      <rect x="18" y="60" width="64" height="6" rx="2" fill="none" stroke="hsl(var(--border))" strokeWidth="0.5" />
      <line x1={18 + 64 * (6.5 / 14)} y1="59" x2={18 + 64 * (6.5 / 14)} y2="67.5" stroke="hsl(var(--foreground))" strokeWidth="0.6" strokeDasharray="1 1" />
      <line x1={18 + 64 * (8.5 / 14)} y1="59" x2={18 + 64 * (8.5 / 14)} y2="67.5" stroke="hsl(var(--foreground))" strokeWidth="0.6" strokeDasharray="1 1" />
      {value > 0 && <polygon points={`${pointerX - 2.5},59 ${pointerX + 2.5},59 ${pointerX},61`} fill={getPhColor()}>
        <animate attributeName="opacity" values="1;0.6;1" dur="2s" repeatCount="indefinite" />
      </polygon>}
      {[0, 7, 14].map(v => <text key={v} x={18 + (v / 14) * 64} y="72" textAnchor="middle" fill="hsl(var(--muted-foreground))" style={{ fontSize: '4.5px' }}>{v}</text>)}
      {/* LEDs */}
      <circle cx="24" cy="79" r="3" fill={isAcidic ? 'hsl(0 80% 55%)' : 'hsl(var(--muted))'} stroke="hsl(var(--border))" strokeWidth="0.5" filter={isAcidic ? `url(#ph-glow-${uid})` : undefined} />
      <text x="24" y="86" textAnchor="middle" fill="hsl(var(--muted-foreground))" style={{ fontSize: '4px' }}>ACID</text>
      <circle cx="50" cy="79" r="3" fill={isNormal ? 'hsl(var(--success))' : 'hsl(var(--muted))'} stroke="hsl(var(--border))" strokeWidth="0.5" filter={isNormal ? `url(#ph-glow-${uid})` : undefined}>
        {isNormal && <animate attributeName="opacity" values="1;0.7;1" dur="2s" repeatCount="indefinite" />}
      </circle>
      <text x="50" y="86" textAnchor="middle" fill="hsl(var(--muted-foreground))" style={{ fontSize: '4px' }}>OK</text>
      <circle cx="76" cy="79" r="3" fill={isAlkaline ? 'hsl(240 70% 60%)' : 'hsl(var(--muted))'} stroke="hsl(var(--border))" strokeWidth="0.5" />
      <text x="76" y="86" textAnchor="middle" fill="hsl(var(--muted-foreground))" style={{ fontSize: '4px' }}>ALK</text>
      {/* Electrode */}
      <rect x="18" y="90" width="20" height="24" rx="3" fill="hsl(var(--card))" stroke="hsl(var(--border))" strokeWidth="0.8" />
      <rect x="23" y="92" width="10" height="18" rx="4" fill="hsl(200 20% 70% / 0.3)" stroke="hsl(var(--border))" strokeWidth="0.5" />
      <line x1="28" y1="94" x2="28" y2="107" stroke="hsl(var(--muted-foreground))" strokeOpacity="0.3" strokeWidth="1.5" strokeLinecap="round" />
      {/* Buttons */}
      <rect x="44" y="90" width="40" height="24" rx="2" fill="hsl(var(--muted))" fillOpacity="0.3" stroke="hsl(var(--border))" strokeWidth="0.4" />
      <rect x="48" y="93" width="14" height="7" rx="1.5" fill="hsl(var(--muted))" stroke="hsl(var(--border))" strokeWidth="0.5" />
      <text x="55" y="98.5" textAnchor="middle" fill="hsl(var(--muted-foreground))" style={{ fontSize: '4px', fontWeight: 600 }}>CAL</text>
      <rect x="66" y="93" width="14" height="7" rx="1.5" fill="hsl(var(--muted))" stroke="hsl(var(--border))" strokeWidth="0.5" />
      <text x="73" y="98.5" textAnchor="middle" fill="hsl(var(--muted-foreground))" style={{ fontSize: '4px', fontWeight: 600 }}>DIAG</text>
      {/* Status */}
      <rect x="30" y="116" width="40" height="7" rx="2" fill={getStatusColor()} fillOpacity="0.12" />
      <text x="50" y="121.5" textAnchor="middle" fill={getStatusColor()} style={{ fontSize: '5.5px', fontFamily: 'ui-monospace, monospace', fontWeight: 700, letterSpacing: '0.5px' }}>{statusLabel}</text>
    </svg>
  );
};

// Chlorine Analyzer
const InlineClAnalyzer: React.FC<{ x: number; y: number; w: number; h: number; value: number }> = ({ x, y, w, h, value }) => {
  const max = 5;
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const isNormal = value >= 0.2 && value <= 2.0;
  const isLow = value < 0.2;
  const isHigh = value > 2.0;
  const getCol = () => isNormal ? 'hsl(var(--success))' : isHigh ? 'hsl(var(--destructive))' : 'hsl(var(--warning))';
  const statusLabel = isNormal ? 'NORMAL' : isLow ? 'LOW' : 'HIGH';

  return (
    <svg x={x} y={y} width={w} height={h} viewBox="0 0 100 130" style={{ filter: 'drop-shadow(0 3px 8px rgba(0,0,0,0.2))' }}>
      <defs>
        <linearGradient id="cl-body-wtp" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="hsl(var(--secondary))" />
          <stop offset="40%" stopColor="hsl(var(--card))" />
          <stop offset="100%" stopColor="hsl(var(--secondary))" />
        </linearGradient>
        <linearGradient id="cl-reagent-wtp" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(50 90% 65% / 0.7)" />
          <stop offset="100%" stopColor="hsl(45 85% 50% / 0.5)" />
        </linearGradient>
        <filter id="cl-glow-wtp" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="1.5" result="glow" />
          <feMerge><feMergeNode in="glow" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      {/* Housing */}
      <rect x="8" y="2" width="84" height="126" rx="5" fill="url(#cl-body-wtp)" stroke="hsl(var(--border))" strokeWidth="1.5" />
      <rect x="12" y="6" width="76" height="118" rx="3.5" fill="hsl(var(--card))" stroke="hsl(var(--border))" strokeWidth="0.8" />
      {[[15, 9], [83, 9], [15, 121], [83, 121]].map(([cx, cy], i) => (
        <g key={i}><circle cx={cx} cy={cy} r="3" fill="hsl(var(--muted))" stroke="hsl(var(--border))" strokeWidth="0.5" />
          <line x1={cx - 1.5} y1={cy} x2={cx + 1.5} y2={cy} stroke="hsl(var(--muted-foreground))" strokeOpacity="0.4" strokeWidth="0.6" /></g>
      ))}
      <text x="50" y="17" textAnchor="middle" fill="hsl(var(--muted-foreground))" style={{ fontSize: '5.5px', fontWeight: 600, letterSpacing: '1px' }}>● CHLORINE</text>
      <circle cx="14" cy="14.5" r="2.5" fill={value > 0 ? '#22c55e' : '#ef4444'}>
        {value > 0 && <animate attributeName="opacity" values="1;0.5;1" dur="2s" repeatCount="indefinite" />}
      </circle>
      {/* LCD */}
      <rect x="16" y="21" width="68" height="32" rx="3" fill="hsl(var(--secondary))" stroke="hsl(var(--border))" strokeWidth="0.8" />
      <rect x="18" y="23" width="64" height="28" rx="2" fill="hsl(var(--background))" />
      <text x="50" y="29" textAnchor="middle" fill="hsl(var(--muted-foreground))" style={{ fontSize: '6px', fontFamily: 'ui-monospace, monospace' }}>mg/L</text>
      <text x="50" y="43" textAnchor="middle" fill={getCol()} style={{ fontSize: '16px', fontFamily: 'ui-monospace, monospace', fontWeight: 700 }}>{value.toFixed(2)}</text>
      {/* LEDs */}
      <circle cx="26" cy="60" r="3" fill={isLow ? 'hsl(var(--warning))' : 'hsl(var(--muted))'} stroke="hsl(var(--border))" strokeWidth="0.5" filter={isLow ? 'url(#cl-glow-wtp)' : undefined} />
      <text x="26" y="67" textAnchor="middle" fill="hsl(var(--muted-foreground))" style={{ fontSize: '4.5px' }}>LOW</text>
      <circle cx="50" cy="60" r="3" fill={isNormal ? 'hsl(var(--success))' : 'hsl(var(--muted))'} stroke="hsl(var(--border))" strokeWidth="0.5" filter={isNormal ? 'url(#cl-glow-wtp)' : undefined}>
        {isNormal && <animate attributeName="opacity" values="1;0.7;1" dur="2s" repeatCount="indefinite" />}
      </circle>
      <text x="50" y="67" textAnchor="middle" fill="hsl(var(--muted-foreground))" style={{ fontSize: '4.5px' }}>OK</text>
      <circle cx="74" cy="60" r="3" fill={isHigh ? 'hsl(var(--destructive))' : 'hsl(var(--muted))'} stroke="hsl(var(--border))" strokeWidth="0.5" filter={isHigh ? 'url(#cl-glow-wtp)' : undefined}>
        {isHigh && <animate attributeName="opacity" values="1;0.4;1" dur="0.8s" repeatCount="indefinite" />}
      </circle>
      <text x="74" y="67" textAnchor="middle" fill="hsl(var(--muted-foreground))" style={{ fontSize: '4.5px' }}>HIGH</text>
      {/* Bar */}
      <rect x="18" y="72" width="64" height="6" rx="2" fill="hsl(var(--secondary))" stroke="hsl(var(--border))" strokeWidth="0.5" />
      <rect x={18 + 64 * (0.2 / max)} y="72" width={64 * ((2.0 - 0.2) / max)} height="6" fill="hsl(var(--success))" fillOpacity="0.12" />
      <rect x="18" y="72" width={Math.max(0, 64 * pct / 100)} height="6" rx="2" fill={getCol()} />
      {/* Reagent chamber */}
      <rect x="20" y="89" width="16" height="22" rx="3" fill="hsl(var(--card))" stroke="hsl(var(--border))" strokeWidth="0.8" />
      <rect x="22" y={89 + 22 * (1 - Math.min(pct / 100 + 0.3, 1))} width="12" height={22 * Math.min(pct / 100 + 0.3, 1)} rx="2" fill="url(#cl-reagent-wtp)" opacity="0.8" />
      {/* Buttons */}
      <rect x="42" y="89" width="42" height="22" rx="2" fill="hsl(var(--muted))" fillOpacity="0.3" stroke="hsl(var(--border))" strokeWidth="0.4" />
      <rect x="46" y="92" width="14" height="7" rx="1.5" fill="hsl(var(--muted))" stroke="hsl(var(--border))" strokeWidth="0.5" />
      <text x="53" y="97.5" textAnchor="middle" fill="hsl(var(--muted-foreground))" style={{ fontSize: '4px', fontWeight: 600 }}>MENU</text>
      <rect x="64" y="92" width="14" height="7" rx="1.5" fill="hsl(var(--muted))" stroke="hsl(var(--border))" strokeWidth="0.5" />
      <text x="71" y="97.5" textAnchor="middle" fill="hsl(var(--muted-foreground))" style={{ fontSize: '4px', fontWeight: 600 }}>SET</text>
      {/* Status */}
      <rect x="32" y="114" width="36" height="8" rx="2" fill={getCol()} fillOpacity="0.12" />
      <text x="50" y="120" textAnchor="middle" fill={getCol()} style={{ fontSize: '5.5px', fontFamily: 'ui-monospace, monospace', fontWeight: 700, letterSpacing: '0.5px' }}>{statusLabel}</text>
    </svg>
  );
};

// Turbidity Analyzer
const InlineTaAnalyzer: React.FC<{ x: number; y: number; w: number; h: number; value: number; label: string }> = ({ x, y, w, h, value, label }) => {
  const max = 100;
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const isGood = value <= 5;
  const isWarning = value > 5 && value <= 10;
  const isDanger = value > 10;
  const getCol = () => isGood ? 'hsl(var(--success))' : isWarning ? 'hsl(var(--warning))' : 'hsl(var(--destructive))';
  const statusLabel = isGood ? 'CLEAR' : isWarning ? 'CAUTION' : 'TURBID';
  const waterOpacity = Math.min(0.15 + (value / max) * 0.6, 0.75);
  const waterColor = isGood ? 'hsl(200 60% 60%)' : isWarning ? 'hsl(40 70% 55%)' : 'hsl(25 65% 45%)';
  const uid = label.replace(/[\s\/()#+]/g, '');

  return (
    <svg x={x} y={y} width={w} height={h} viewBox="0 0 100 130" style={{ filter: 'drop-shadow(0 3px 8px rgba(0,0,0,0.2))' }}>
      <defs>
        <linearGradient id={`tb-body-${uid}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="hsl(var(--secondary))" />
          <stop offset="40%" stopColor="hsl(var(--card))" />
          <stop offset="100%" stopColor="hsl(var(--secondary))" />
        </linearGradient>
        <linearGradient id={`tb-water-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={waterColor} stopOpacity={waterOpacity * 0.6} />
          <stop offset="100%" stopColor={waterColor} stopOpacity={waterOpacity} />
        </linearGradient>
        <filter id={`tb-glow-${uid}`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="1.5" result="glow" />
          <feMerge><feMergeNode in="glow" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      {/* Housing */}
      <rect x="8" y="2" width="84" height="126" rx="5" fill={`url(#tb-body-${uid})`} stroke="hsl(var(--border))" strokeWidth="1.5" />
      <rect x="12" y="6" width="76" height="118" rx="3.5" fill="hsl(var(--card))" stroke="hsl(var(--border))" strokeWidth="0.8" />
      {[[15, 9], [83, 9], [15, 121], [83, 121]].map(([cx, cy], i) => (
        <g key={i}><circle cx={cx} cy={cy} r="3" fill="hsl(var(--muted))" stroke="hsl(var(--border))" strokeWidth="0.5" />
          <line x1={cx - 1.5} y1={cy} x2={cx + 1.5} y2={cy} stroke="hsl(var(--muted-foreground))" strokeOpacity="0.4" strokeWidth="0.6" /></g>
      ))}
      <text x="50" y="17" textAnchor="middle" fill="hsl(var(--muted-foreground))" style={{ fontSize: '5px', fontWeight: 600, letterSpacing: '1px' }}>●{label}</text>
      <circle cx="14" cy="14.5" r="2.5" fill={value > 0 ? '#22c55e' : '#ef4444'} />
      {/* LCD */}
      <rect x="16" y="21" width="68" height="32" rx="3" fill="hsl(var(--secondary))" stroke="hsl(var(--border))" strokeWidth="0.8" />
      <rect x="18" y="23" width="64" height="28" rx="2" fill="hsl(var(--background))" />
      <text x="50" y="29" textAnchor="middle" fill="hsl(var(--muted-foreground))" style={{ fontSize: '6px', fontFamily: 'ui-monospace, monospace' }}>NTU</text>
      <text x="50" y="45" textAnchor="middle" fill={getCol()} style={{ fontSize: '16px', fontFamily: 'ui-monospace, monospace', fontWeight: 700 }}>{value.toFixed(2)}</text>
      {/* Bar */}
      <rect x="18" y="58" width="64" height="6" rx="2" fill="hsl(var(--secondary))" stroke="hsl(var(--border))" strokeWidth="0.5" />
      <rect x="18" y="58" width={64 * (5 / max)} height="6" rx="2" fill="hsl(var(--success) / 0.1)" />
      <rect x="18" y="58" width={Math.max(0, 64 * pct / 100)} height="6" rx="2" fill={getCol()} />
      <line x1={18 + 64 * (5 / max)} y1="57" x2={18 + 64 * (5 / max)} y2="65.5" stroke="hsl(var(--foreground))" strokeOpacity="0.4" strokeWidth="0.5" strokeDasharray="1 1" />
      {/* LEDs */}
      <circle cx="55" cy="72" r="3" fill={isGood ? 'hsl(var(--success))' : 'hsl(var(--muted))'} stroke="hsl(var(--border))" strokeWidth="0.5" filter={isGood ? `url(#tb-glow-${uid})` : undefined}>
        {isGood && <animate attributeName="opacity" values="1;0.7;1" dur="2s" repeatCount="indefinite" />}
      </circle>
      <text x="55" y="79" textAnchor="middle" fill="hsl(var(--muted-foreground))" style={{ fontSize: '3.5px' }}>CLR</text>
      <circle cx="68" cy="72" r="3" fill={isWarning ? 'hsl(var(--warning))' : 'hsl(var(--muted))'} stroke="hsl(var(--border))" strokeWidth="0.5" />
      <text x="68" y="79" textAnchor="middle" fill="hsl(var(--muted-foreground))" style={{ fontSize: '3.5px' }}>WRN</text>
      <circle cx="81" cy="72" r="3" fill={isDanger ? 'hsl(var(--destructive))' : 'hsl(var(--muted))'} stroke="hsl(var(--border))" strokeWidth="0.5" />
      <text x="81" y="79" textAnchor="middle" fill="hsl(var(--muted-foreground))" style={{ fontSize: '3.5px' }}>ALM</text>
      {/* Optical cell */}
      <rect x="18" y="83" width="30" height="24" rx="4" fill="hsl(var(--secondary))" fillOpacity="0.5" stroke="hsl(var(--border))" strokeWidth="0.8" />
      <rect x="23" y="86" width="20" height="18" rx="6" fill="hsl(var(--card))" stroke="hsl(var(--border))" strokeWidth="0.6" />
      <rect x="25" y="88" width="16" height="14" rx="5" fill={`url(#tb-water-${uid})`} />
      <line x1="18" y1="95" x2="23" y2="95" stroke="hsl(0 85% 55%)" strokeWidth="1" strokeLinecap="round" opacity="0.7">
        <animate attributeName="opacity" values="0.5;0.9;0.5" dur="1.5s" repeatCount="indefinite" />
      </line>
      <circle cx="18" cy="95" r="1.5" fill="hsl(0 85% 55%)" opacity="0.8" />
      {/* Buttons */}
      <rect x="54" y="83" width="30" height="24" rx="2" fill="hsl(var(--muted))" fillOpacity="0.3" stroke="hsl(var(--border))" strokeWidth="0.4" />
      <rect x="57" y="86" width="11" height="7" rx="1.5" fill="hsl(var(--muted))" stroke="hsl(var(--border))" strokeWidth="0.5" />
      <text x="62.5" y="91.5" textAnchor="middle" fill="hsl(var(--muted-foreground))" style={{ fontSize: '3.5px', fontWeight: 600 }}>ZERO</text>
      <rect x="70" y="86" width="11" height="7" rx="1.5" fill="hsl(var(--muted))" stroke="hsl(var(--border))" strokeWidth="0.5" />
      <text x="75.5" y="91.5" textAnchor="middle" fill="hsl(var(--muted-foreground))" style={{ fontSize: '3.5px', fontWeight: 600 }}>SPAN</text>
      {/* Status */}
      <rect x="30" y="116" width="40" height="7" rx="2" fill={getCol()} fillOpacity="0.12" />
      <text x="50" y="121.5" textAnchor="middle" fill={getCol()} style={{ fontSize: '5.5px', fontFamily: 'ui-monospace, monospace', fontWeight: 700, letterSpacing: '0.5px' }}>{statusLabel}</text>
    </svg>
  );
};

// ────────────────────────────────────────────────────────────
// STATUS BADGE
// ────────────────────────────────────────────────────────────
interface StatusBadgeProps { x: number; y: number; isOn: boolean; }
const StatusBadge: React.FC<StatusBadgeProps> = ({ x, y, isOn }) => (
  <g>
    <rect x={x - 22} y={y} width={44} height={18} rx={9}
      fill={isOn ? 'hsl(var(--success) / 0.15)' : 'hsl(var(--destructive) / 0.15)'}
      stroke={isOn ? 'hsl(var(--success) / 0.5)' : 'hsl(var(--destructive) / 0.5)'} strokeWidth="1" />
    <circle cx={x - 12} cy={y + 9} r={3.5}
      fill={isOn ? '#22c55e' : '#ef4444'}>
      {isOn && <animate attributeName="opacity" values="1;0.4;1" dur="1.5s" repeatCount="indefinite" />}
    </circle>
    <text x={x + 5} y={y + 13} textAnchor="middle" fontSize="9" fontWeight="900"
      fill={isOn ? 'hsl(var(--success))' : 'hsl(var(--destructive))'}>
      {isOn ? 'ON' : 'OFF'}
    </text>
  </g>
);

// ────────────────────────────────────────────────────────────
// INLINE HT PUMP (matching WtpPump card design)
// ────────────────────────────────────────────────────────────
const InlineHTPump: React.FC<{ x: number; y: number; w: number; h: number; isRunning: boolean; label: string }> = ({ x, y, w, h, isRunning, label }) => {
  const body = 'hsl(210 70% 42%)';
  const light = 'hsl(210 60% 52%)';
  const dark = 'hsl(210 75% 30%)';
  const veryDark = 'hsl(210 80% 22%)';

  return (
    <svg x={x} y={y} width={w} height={h} viewBox="0 0 155 105" style={{ filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.25))' }}>
      {/* Outlet Pipe (top) */}
      <rect x="24" y="0" width="14" height="16" rx="2" fill={body} stroke={dark} strokeWidth="1" />
      <rect x="19" y="0" width="24" height="5" rx="1.5" fill={light} stroke={dark} strokeWidth="0.8" />
      <circle cx="23" cy="2.5" r="1.5" fill={veryDark} />
      <circle cx="39" cy="2.5" r="1.5" fill={veryDark} />

      {/* Volute Casing */}
      <path d="M8 50 C8 22 18 14 32 14 C50 14 58 26 58 50 C58 72 46 76 32 76 C14 76 8 68 8 50 Z"
        fill={body} stroke={dark} strokeWidth="1.5" />
      <circle cx="33" cy="46" r="18" fill={light} stroke={dark} strokeWidth="0.8" opacity="0.6" />
      <path d="M33 28 C45 28 51 36 51 46 C51 56 45 62 33 62" fill="none" stroke={dark} strokeWidth="0.5" opacity="0.4" />

      {/* Impeller */}
      <g style={isRunning ? { animation: 'spin 0.8s linear infinite', transformOrigin: '33px 46px' } : { transformOrigin: '33px 46px' }}>
        <path d="M33 46 C31 42 28 36 25 32" fill="none" stroke="hsl(0 0% 85%)" strokeWidth="3" strokeLinecap="round" />
        <path d="M33 46 C35 42 38 36 41 32" fill="none" stroke="hsl(0 0% 85%)" strokeWidth="3" strokeLinecap="round" />
        <path d="M33 46 C31 50 28 56 25 60" fill="none" stroke="hsl(0 0% 85%)" strokeWidth="3" strokeLinecap="round" />
        <path d="M33 46 C35 50 38 56 41 60" fill="none" stroke="hsl(0 0% 85%)" strokeWidth="3" strokeLinecap="round" />
        <path d="M33 46 C29 45 23 44 19 44" fill="none" stroke="hsl(0 0% 85%)" strokeWidth="3" strokeLinecap="round" />
        <path d="M33 46 C37 47 43 48 47 48" fill="none" stroke="hsl(0 0% 85%)" strokeWidth="3" strokeLinecap="round" />
        <circle cx="33" cy="46" r="5" fill="hsl(0 0% 82%)" stroke="hsl(0 0% 65%)" strokeWidth="1" />
        <circle cx="33" cy="46" r="2" fill="hsl(0 0% 70%)" />
      </g>

      {/* Inlet Pipe (left) */}
      <rect x="0" y="40" width="10" height="13" rx="2" fill={body} stroke={dark} strokeWidth="1" />
      <ellipse cx="2" cy="46.5" rx="3" ry="10" fill={light} stroke={dark} strokeWidth="0.8" />

      {/* Volute bolts */}
      {[0, 60, 120, 180, 240, 300].map(angle => {
        const bx = 33 + 21 * Math.cos((angle * Math.PI) / 180);
        const by = 46 + 21 * Math.sin((angle * Math.PI) / 180);
        return <circle key={angle} cx={bx} cy={by} r="1.5" fill={veryDark} />;
      })}

      {/* Shaft / Coupling Guard */}
      <rect x="58" y="41" width="14" height="11" rx="2" fill="hsl(220 10% 60%)" stroke={dark} strokeWidth="0.8" />
      <rect x="60" y="39" width="10" height="15" rx="3" fill="none" stroke={dark} strokeWidth="0.6" strokeDasharray="2 1.5" />

      {/* Motor Body */}
      <rect x="72" y="26" width="55" height="40" rx="4" fill={body} stroke={dark} strokeWidth="1.5" />
      {[30, 34, 38, 42, 46, 50, 54, 58, 62].map(my => (
        <line key={my} x1="76" y1={my} x2="123" y2={my} stroke={dark} strokeWidth="0.5" opacity="0.4" />
      ))}
      <rect x="82" y="32" width="22" height="11" rx="1" fill="hsl(220 10% 70%)" stroke={dark} strokeWidth="0.4" />
      <rect x="104" y="24" width="16" height="12" rx="2" fill={dark} stroke={veryDark} strokeWidth="0.8" />

      {/* Status LED */}
      <circle cx="118" cy="46" r="3.5" fill={isRunning ? '#22c55e' : '#ef4444'}>
        {isRunning && <animate attributeName="opacity" values="1;0.5;1" dur="1s" repeatCount="indefinite" />}
      </circle>

      {/* Motor end cap */}
      <rect x="127" y="30" width="7" height="32" rx="2" fill={light} stroke={dark} strokeWidth="0.8" />

      {/* Rear Fan Guard */}
      <rect x="134" y="28" width="8" height="36" rx="3" fill="none" stroke={dark} strokeWidth="1" />
      {[32, 36, 40, 44, 48, 52, 56, 60].map(fy => (
        <line key={fy} x1="135" y1={fy} x2="141" y2={fy} stroke={dark} strokeWidth="0.6" opacity="0.5" />
      ))}
      <circle cx="138" cy="46" r="12" fill="none" stroke={dark} strokeWidth="0.8" opacity="0.4" />

      {/* Fan blades */}
      <g style={isRunning ? { animation: 'spin 0.8s linear infinite', transformOrigin: '138px 46px' } : { transformOrigin: '138px 46px' }}>
        <line x1="138" y1="46" x2="138" y2="36" stroke={dark} strokeWidth="2" strokeLinecap="round" opacity="0.7" />
        <line x1="138" y1="46" x2="129" y2="51" stroke={dark} strokeWidth="2" strokeLinecap="round" opacity="0.7" />
        <line x1="138" y1="46" x2="147" y2="51" stroke={dark} strokeWidth="2" strokeLinecap="round" opacity="0.7" />
        <line x1="138" y1="46" x2="131" y2="39" stroke={dark} strokeWidth="2" strokeLinecap="round" opacity="0.7" />
        <line x1="138" y1="46" x2="145" y2="39" stroke={dark} strokeWidth="2" strokeLinecap="round" opacity="0.7" />
      </g>
      <circle cx="138" cy="46" r="2.5" fill={light} stroke={dark} strokeWidth="0.5" />

      {/* Water flow when ON */}
      {isRunning && (
        <g>
          <circle r="1.5" fill="hsl(199 89% 55%)" opacity="0.6">
            <animate attributeName="cx" values="-2;3;8" dur="0.8s" repeatCount="indefinite" />
            <animate attributeName="cy" values="46;46.5;46" dur="0.8s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.7;0.4;0" dur="0.8s" repeatCount="indefinite" />
          </circle>
          <circle r="1.2" fill="hsl(199 89% 55%)" opacity="0.3">
            <animate attributeName="cx" values="20;33;46;33;20" dur="1.5s" repeatCount="indefinite" />
            <animate attributeName="cy" values="46;32;46;60;46" dur="1.5s" repeatCount="indefinite" />
          </circle>
          <circle r="2" fill="hsl(199 89% 55%)" opacity="0.7">
            <animate attributeName="cx" values="31;30;32" dur="1s" repeatCount="indefinite" />
            <animate attributeName="cy" values="14;6;-4" dur="1s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.8;0.4;0" dur="1s" repeatCount="indefinite" />
          </circle>
          <circle cx="33" cy="46" r="16" fill="hsl(199 89% 50%)" opacity="0.06">
            <animate attributeName="opacity" values="0.04;0.1;0.04" dur="2s" repeatCount="indefinite" />
          </circle>
        </g>
      )}

      {/* Base */}
      <rect x="5" y="76" width="55" height="5" rx="1" fill={dark} stroke={veryDark} strokeWidth="0.5" />
      <rect x="70" y="66" width="58" height="5" rx="1" fill={dark} stroke={veryDark} strokeWidth="0.5" />
      <rect x="2" y="81" width="145" height="5" rx="1" fill="hsl(220 10% 50%)" stroke={dark} strokeWidth="0.5" />
      {[14, 44, 84, 126].map(bx => <circle key={bx} cx={bx} cy="83.5" r="2.2" fill={veryDark} />)}
      <line x1="0" y1="87" x2="155" y2="87" stroke="hsl(var(--border))" strokeWidth="1" />

      {/* Label */}
      <text x="77" y="100" textAnchor="middle" fontSize="9" fontWeight="800" fill="hsl(var(--foreground))">{label}</text>
    </svg>
  );
};

// ────────────────────────────────────────────────────────────
// MAIN WTP PROCESS SIMULATION
// ────────────────────────────────────────────────────────────
const WtpProcessSimulation: React.FC = () => {
  const { wtpTags } = useScada();
  const findTag = (id: string) => wtpTags.find(t => t.id === id);
  const liveValue = (id: string) => {
    const tag = findTag(id);
    return tag?.status === 'connected' ? tag.value : 0;
  };

  // Extract tag values
  const flowOutVal = liveValue('WTP-Flow-OUT');
  const ltBwVal = liveValue('WTP-LT-BW');
  const ltCwVal = liveValue('WTP-LT-CW');
  const taInVal = liveValue('WTP-TA-IN');
  const phOutVal = liveValue('WTP-PH');
  const clOutVal = liveValue('WTP-CL');
  const taOutVal = liveValue('WTP-TA');
  const totVal = liveValue('WTP-Totalizer-OUT');
  const kwTag = undefined; // WTP-KW not installed
  const kwVal = 0;
  const kwConnection = 'no-data' as const;

  // Filter Bed tags (new — real PLC data)
  const rofFb1Tag = findTag('WTP-ROF-FB1');
  const lohFb1Tag = findTag('WTP-LOH-FB1');
  const lohFb2Tag = findTag('WTP-LOH-FB2');
  const rofFb1Val = rofFb1Tag?.status === 'connected' ? rofFb1Tag.value : 0;
  const lohFb1Val = lohFb1Tag?.status === 'connected' ? lohFb1Tag.value : 0;
  const lohFb2Val = lohFb2Tag?.status === 'connected' ? lohFb2Tag.value : 0;

  // Trip indicators (new — real PLC data)
  const trip1Tag = findTag('WTP-Trip1');
  const trip2Tag = findTag('WTP-Trip2');
  const pump1Trip = trip1Tag?.status === 'connected' && trip1Tag.value >= 1;
  const pump2Trip = trip2Tag?.status === 'connected' && trip2Tag.value >= 1;

  const pt1Tag = findTag('WTP-PT1');
  const pt2Tag = findTag('WTP-PT2');
  const pump1Tag = findTag('WTP-Pump1');
  const pump2Tag = findTag('WTP-Pump2');
  const pt1Val = liveValue('WTP-PT1');
  const pt2Val = liveValue('WTP-PT2');
  const headerPtVal = liveValue('WTP-HeaderPT'); // PUMP_HOUSE_PT = Combined Header Pressure

  // WTP pumps: directly driven by MOTOR1_INDACTOR / MOTOR2_INDACTOR (0 = OFF, 1 = ON)
  // Fallback to PT threshold only if pump tag has no data yet
  const pump1On = pump1Tag?.status === 'connected'
    ? (pump1Tag.value ?? 0) >= 1
    : (pt1Tag?.status === 'connected' && pt1Val > 1.5);
  const pump2On = pump2Tag?.status === 'connected'
    ? (pump2Tag.value ?? 0) >= 1
    : (pt2Tag?.status === 'connected' && pt2Val > 1.5);
  const anyPumpOn = pump1On || pump2On;


  // Combined header pressure: use direct PLC reading (PT_3/WTP-HeaderPT) if available,
  // otherwise derive from individual pump PT readings
  const combinedPt = useMemo(() => {
    if (headerPtVal > 0.05) return headerPtVal;
    if (pump1On && pump2On) return (pt1Val + pt2Val) / 2;
    if (pump1On) return pt1Val;
    if (pump2On) return pt2Val;
    return 0;
  }, [headerPtVal, pump1On, pump2On, pt1Val, pt2Val]);

  // Cross-logic
  const waterFlowing = rofFb1Val > 0.1;
  const chlorinationOn = waterFlowing || anyPumpOn || ltCwVal > 5;

  // Visual Constants
  const pBody = 'hsl(220 60% 42%)';
  const pDark = 'hsl(220 65% 32%)';
  const pVDark = 'hsl(220 70% 22%)';
  const pLight = 'hsl(220 55% 52%)';
  const pipeW = 18;

  // ═══ LAYOUT POSITIONS ═══
  const SVG_W = 2200, SVG_H = 1570;

  const inletPipeY = 200;
  const inletAnalyzerX = -55;

  // Process tanks row - more compact, better connected
  const processY = 280;
  const mixerX = 340, mixerW = 90, mixerH = 150;
  const flocX = 480, flocW = 160, flocH = 150;
  const settleX = 700, settleW = 210, settleH = 150;
  const filterX = 980, filterW = 170, filterH = 150;

  // Backwash tank layout mathematically synced to Filter boundaries
  const bwTankX = 980, bwTankY = 85, bwTankW = 119, bwTankH = 135;

  // CWR - shifted right for more space
  const cwrX = 1280, cwrY = processY - 10, cwrW = 190, cwrH = 170;

  // Discharge headers
  const headerY = 850;

  // HT Pumps
  const pumpRowY = 1010;
  const pumpH = 95;
  const pumpW = 155;
  const pump1X = 350, pump2X = 850;
  const pumpOutletOffsetX = (31 / 155) * pumpW;
  const pumpInletCenterY = pumpRowY + (46.5 / 105) * pumpH;

  // Header 1 (Pump1+2)
  const p1OutX = pump1X + pumpOutletOffsetX;
  const p2OutX = pump2X + pumpOutletOffsetX;
  const headerStartX = p1OutX - 30;
  const headerEndX = p2OutX + 30;

  // Combined PT gauge ABOVE the header
  const comGaugeR = 48;
  const comGaugeX = 631;
  const comGaugeCenterY = headerY - 80; // well above header

  // Merge point where vertical riser joins the horizontal header
  const mergeY = headerY - 180; // 670

  // PT individual gauges - below pumps
  const ptGaugeY = pumpRowY + pumpH + 145;
  const ptGaugeR = 50;

  // Energy meter - left side
  const energyMeterX = 60;
  const energyMeterY = pumpRowY - 30;

  // Outlet EFM and Analyzers
  const outletEfmX = 1590;
  const outletAnalyzerX = 1700;
  const outletAnalyzerW = 130;
  const outletAnalyzerH = 168;

  // Totalizer
  const totalizerX = outletEfmX;
  const totalizerY = mergeY + 105;

  // Ground
  const groundY = 1490;

  // CWR drop pipe position
  const cwrDropPipeX = cwrX + 30;

  // CW Level
  const cwLevelPct = Math.min(100, Math.max(0, ltCwVal));
  const cwFillH = (cwLevelPct / 100) * cwrH;
  const cwWaterY = cwrY + cwrH - cwFillH;

  // BW Level
  const bwLevelPct = Math.min(100, Math.max(0, ltBwVal));
  const bwFillH = (bwLevelPct / 100) * bwTankH;

  // Pipe drawing helpers
  const drawPipe = (d: string, w: number = pipeW, round: boolean = true) => (
    <g>
      <path d={d} fill="none" stroke={pVDark} strokeWidth={w + 3} strokeLinecap={round ? "round" : "butt"} strokeLinejoin="round" />
      <path d={d} fill="none" stroke={pDark} strokeWidth={w} strokeLinecap={round ? "round" : "butt"} strokeLinejoin="round" />
      <path d={d} fill="none" stroke={pBody} strokeWidth={w * 0.65} strokeLinecap={round ? "round" : "butt"} strokeLinejoin="round" />
      <path d={d} fill="none" stroke={pLight} strokeWidth={w * 0.2} strokeLinecap={round ? "round" : "butt"} strokeLinejoin="round" opacity={0.5} />
    </g>
  );

  const drawWaterColumn = (d: string, w: number = pipeW, opacity: number = 0.8) => {
    return (
      <path
        d={d}
        fill="none"
        stroke="#38bdf8" // Beautiful sky blue water column background
        strokeWidth={w * 0.55} // Centered inside the pipe
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={opacity}
      />
    );
  };

  const drawWaterFlow = (d: string, flow: number, active: boolean = true) => {
    if (!active || flow <= 0.05) return null;
    const pNorm = Math.min(1, Math.max(0.1, flow / 100));
    const durFast = (2.4 - pNorm * 1.6).toFixed(2) + 's';
    const durSlow = (3.6 - pNorm * 2.0).toFixed(2) + 's';
    const dashA = 55, gapA = 22, cycleA = dashA + gapA;
    const dashB = 30, gapB = 60, cycleB = dashB + gapB;
    const sw = Math.max(3, pipeW * 0.32);
    return (
      <g opacity="0.95">
        <path d={d} fill="none" stroke="#f0f9ff" strokeWidth={sw}
          strokeLinecap="round" strokeLinejoin="round" strokeDasharray={`${dashA} ${gapA}`} opacity="0.85">
          <animate attributeName="stroke-dashoffset" from={cycleA} to="0" dur={durFast} repeatCount="indefinite" calcMode="linear" />
        </path>
        <path d={d} fill="none" stroke="#ffffff" strokeWidth={sw * 0.45}
          strokeLinecap="round" strokeLinejoin="round" strokeDasharray={`${dashB} ${gapB}`} opacity="0.55">
          <animate attributeName="stroke-dashoffset" from={cycleB} to="0" dur={durSlow} repeatCount="indefinite" calcMode="linear" />
        </path>
      </g>
    );
  };

  // Level bar helper
  const drawLevelBar = (lx: number, ly: number, lw: number, lh: number, level: number, lLabel: string, color: string) => {
    const fillH = (Math.min(100, Math.max(0, level)) / 100) * lh;
    const statusColor = level >= 70 ? 'hsl(var(--success))' : level >= 40 ? 'hsl(var(--warning))' : 'hsl(var(--destructive))';
    const statusText = level >= 70 ? 'GOOD' : level >= 40 ? 'MED' : level > 0 ? 'LOW' : 'EMPTY';
    return (
      <g>
        <text x={lx + lw / 2} y={ly - 10} textAnchor="middle" fontSize="12" fontWeight="800" fill="hsl(var(--foreground))">{lLabel}</text>
        <rect x={lx} y={ly} width={lw} height={lh} rx={5} fill="hsl(var(--card))" stroke="hsl(var(--border))" strokeWidth="1.5" />
        <rect x={lx + 2.5} y={ly + lh - fillH} width={lw - 5} height={fillH} rx={3.5} fill={color} opacity="0.8">
          <animate attributeName="opacity" values="0.75;0.9;0.75" dur="3s" repeatCount="indefinite" />
        </rect>
        {[70, 40].map((th, i) => {
          const my = ly + lh - (th / 100) * lh;
          return <line key={th} x1={lx - 2} y1={my} x2={lx + lw + 2} y2={my} stroke={i === 0 ? 'hsl(var(--success))' : 'hsl(var(--warning))'} strokeWidth="1" strokeDasharray="3 2" opacity="0.6" />;
        })}
        {[0, 25, 50, 75, 100].map(p => {
          const my = ly + lh - (p / 100) * lh;
          return (
            <g key={p}>
              <line x1={lx + lw} y1={my} x2={lx + lw + 6} y2={my} stroke="hsl(var(--muted-foreground))" strokeWidth="1" />
              <text x={lx + lw + 9} y={my + 3} textAnchor="start" fontSize="9" fill="hsl(var(--muted-foreground))" fontFamily="ui-monospace, monospace">{p}%</text>
            </g>
          );
        })}
        <rect x={lx - 6} y={ly + lh + 6} width={lw + 12} height={40} rx={5} fill="hsl(var(--card))" stroke="hsl(var(--border))" strokeWidth="1" />
        <text x={lx + lw / 2} y={ly + lh + 23} textAnchor="middle" fontSize="14" fontWeight="800" fill="hsl(var(--foreground))" fontFamily="ui-monospace, monospace">{level.toFixed(1)}%</text>
        <text x={lx + lw / 2} y={ly + lh + 38} textAnchor="middle" fontSize="10" fontWeight="900" fill={statusColor}>{statusText}</text>
      </g>
    );
  };

  // Chlorination pipe path - properly connected with smooth Q-curve bends
  const filterOutY = processY + filterH - 30; // 120
  const chlorinationTapX = cwrX + 60; // Dosing point on top of CWR
  const pipeRiserX = 1220; // Constant riser position for the blue inlet pipe
  const pipeR = 18; // bend radius
  const filterToCwrPath = `M ${filterX + filterW} ${filterOutY} L ${pipeRiserX - pipeR} ${filterOutY} Q ${pipeRiserX} ${filterOutY} ${pipeRiserX} ${filterOutY - pipeR} L ${pipeRiserX} ${processY - 10 + pipeR} Q ${pipeRiserX} ${processY - 10} ${pipeRiserX + pipeR} ${processY - 10} L ${cwrX + 8 - pipeR} ${processY - 10} Q ${cwrX + 8} ${processY - 10} ${cwrX + 8} ${processY - 10 + pipeR}`;

  // Pump riser paths
  const pumpCenters = [pump1X, pump2X];
  const pumpOns = [pump1On, pump2On];
  const ptVals = [pt1Val, pt2Val];
  const ptLabels = ['PT 01', 'PT 02'];

  // Suction header - centered on pump inlet
  const suctionY = pumpInletCenterY;

  // Outlet pipe from merge point to right end
  const outletPipeEndX = 2100;

  return (
    <div className="w-full premium-card rounded-xl p-3 md:p-5 animate-fade-in overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      <svg viewBox={`-450 0 ${SVG_W + 450} ${SVG_H}`} className="w-full h-auto" style={{ maxHeight: '90vh', minWidth: '700px' }}>
        <defs>
          <linearGradient id="wtp-water" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#38bdf8" />
            <stop offset="100%" stopColor="#0369a1" />
          </linearGradient>
          <linearGradient id="wtp-raw-water" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#a3e635" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#65a30d" stopOpacity="0.8" />
          </linearGradient>
          <linearGradient id="wtp-concrete" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#64748b" />
            <stop offset="30%" stopColor="#94a3b8" />
            <stop offset="70%" stopColor="#cbd5e1" />
            <stop offset="100%" stopColor="#64748b" />
          </linearGradient>
          <linearGradient id="wtp-ground" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#94a3b8" />
            <stop offset="100%" stopColor="#475569" />
          </linearGradient>
          <linearGradient id="wtp-header-pipe" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={pVDark} />
            <stop offset="25%" stopColor={pDark} />
            <stop offset="50%" stopColor={pBody} />
            <stop offset="75%" stopColor={pDark} />
            <stop offset="100%" stopColor={pVDark} />
          </linearGradient>
          <clipPath id="wtp-cwr-clip">
            <rect x={cwrX} y={cwrY} width={cwrW} height={cwrH} />
          </clipPath>
          <clipPath id="wtp-settle-clip">
            <rect x={settleX} y={processY} width={settleW} height={settleH} />
          </clipPath>
          {/* Sand media texture pattern */}
          <pattern id="wtp-sand-texture" x="0" y="0" width="6" height="6" patternUnits="userSpaceOnUse">
            <rect width="6" height="6" fill="#c49a6c" />
            <circle cx="3" cy="3" r="1.5" fill="#a0784e" opacity="0.85" />
          </pattern>
          {/* Gravel support texture pattern */}
          <pattern id="wtp-gravel-texture" x="0" y="0" width="10" height="10" patternUnits="userSpaceOnUse">
            <rect width="10" height="10" fill="#8d8580" />
            <circle cx="5" cy="5" r="3" fill="#6b6560" opacity="0.75" />
          </pattern>
        </defs>

        {/* ═══ TITLE ═══ */}
        <text x={850} y={30} textAnchor="middle" fontSize="32" fontWeight="900" fill="hsl(var(--foreground))" letterSpacing="2px">
          WATER TREATMENT PLANT — PROCESS FLOW
        </text>
        <text x={850} y={52} textAnchor="middle" fontSize="16" fontWeight="600" fill="hsl(var(--muted-foreground))">
          Shahpur WTP | Package-61 | Process Mimic
        </text>

        {/* ═══ GROUND ═══ */}
        <rect x={-430} y={groundY} width={SVG_W + 410} height={16} rx={3} fill="url(#wtp-ground)" stroke="#475569" strokeWidth="1" />

        {/* ═══ SECTION 1: RAW WATER INLET ═══ */}
        <g>
          <rect x={-390} y={inletPipeY - 45} width={130} height={28} rx={6} fill="hsl(var(--primary) / 0.1)" stroke="hsl(var(--primary) / 0.4)" strokeWidth="1" />
          <text x={-325} y={inletPipeY - 26} textAnchor="middle" fontSize="12" fontWeight="800" fill="hsl(var(--primary))">← FROM INTAKE</text>

          {/* Main inlet pipe - continuous from left edge (rounded for symmetry) */}
          {drawPipe(`M -430 ${inletPipeY} L ${mixerX - 50} ${inletPipeY} Q ${mixerX - 25} ${inletPipeY} ${mixerX - 25} ${inletPipeY + 25} L ${mixerX - 25} ${processY + 120 - 25} Q ${mixerX - 25} ${processY + 120} ${mixerX} ${processY + 120}`, pipeW, true)}
          {drawWaterFlow(`M -430 ${inletPipeY} L ${mixerX - 50} ${inletPipeY} Q ${mixerX - 25} ${inletPipeY} ${mixerX - 25} ${inletPipeY + 25} L ${mixerX - 25} ${processY + 120 - 25} Q ${mixerX - 25} ${processY + 120} ${mixerX} ${processY + 120}`, rofFb1Val, waterFlowing)}

          {/* The installed inlet instrument is turbidity only. */}
          <InlineTaAnalyzer x={inletAnalyzerX} y={inletPipeY - 155} w={100} h={130} value={taInVal} label="TURB.INLET" />
          <rect x={inletAnalyzerX + 48} y={inletPipeY - pipeW / 2 - 3} width={6} height={pipeW / 2 + 3} rx={1} fill={pDark} />


        </g>

        {/* ═══ SECTION 2: FLASH MIXER ═══ */}
        <g>
          {/* Tank body */}
          <rect x={mixerX} y={processY} width={mixerW} height={mixerH} rx={3}
            fill="url(#wtp-concrete)" stroke={waterFlowing ? '#22c55e' : '#475569'} strokeWidth={waterFlowing ? 2.5 : 2} />

          {/* Raw water fill inside tank */}
          <rect x={mixerX + 4} y={processY + 18} width={mixerW - 8} height={mixerH - 22} rx={2} fill="url(#wtp-raw-water)" opacity="0.45" />

          {/* 4 internal baffle strips (2 on left/right walls, reduce vortex) */}
          <rect x={mixerX + 2} y={processY + 10} width={5} height={mixerH * 0.55} rx={1} fill="#475569" opacity="0.9" />
          <rect x={mixerX + mixerW - 7} y={processY + 10} width={5} height={mixerH * 0.55} rx={1} fill="#475569" opacity="0.9" />

          {/* Mechanical seal / stuffing box at shaft entry */}
          <ellipse cx={mixerX + mixerW / 2} cy={processY + 5} rx={8} ry={4} fill="#64748b" stroke="#334155" strokeWidth="1.5" />

          {/* Vertical shaft */}
          <rect x={mixerX + mixerW / 2 - 2} y={processY + 4} width={4} height={mixerH * 0.68} fill="#475569" />
          <rect x={mixerX + mixerW / 2 - 1} y={processY + 4} width={2} height={mixerH * 0.68} fill="#64748b" />

          {/* 6-blade Rushton turbine impeller */}
          <g transform={`translate(${mixerX + mixerW / 2}, ${processY + mixerH * 0.68})`}>
            <g>
              {waterFlowing && (
                <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="1.5s" repeatCount="indefinite" />
              )}
              {[0, 60, 120, 180, 240, 300].map((angle, i) => {
                const rad = (angle * Math.PI) / 180;
                return <line key={i} x1={0} y1={0} x2={24 * Math.cos(rad)} y2={24 * Math.sin(rad)} stroke="#94a3b8" strokeWidth="5" strokeLinecap="square" />;
              })}
              <circle cx={0} cy={0} r={6} fill="#334155" stroke="#64748b" strokeWidth="2" />
            </g>
          </g>

          {/* I-beam platform spanning tank top (supports motor+gearbox) */}
          <rect x={mixerX - 10} y={processY - 14} width={mixerW + 20} height={9} rx={2} fill="#1e293b" stroke="#0f172a" strokeWidth="1" />
          <line x1={mixerX - 10} y1={processY - 14} x2={mixerX + mixerW + 10} y2={processY - 14} stroke="#334155" strokeWidth="2" />
          <circle cx={mixerX - 4} cy={processY - 10} r={3} fill="#0f172a" stroke="#334155" strokeWidth="0.5" />
          <circle cx={mixerX + mixerW + 4} cy={processY - 10} r={3} fill="#0f172a" stroke="#334155" strokeWidth="0.5" />

          {/* Gearbox (heavy square housing on platform) */}
          <rect x={mixerX + mixerW / 2 - 20} y={processY - 46} width={40} height={30} rx={3} fill="#374151" stroke="#1e293b" strokeWidth="1.5" />
          <rect x={mixerX + mixerW / 2 - 22} y={processY - 48} width={44} height={4} rx={1} fill="#4b5563" stroke="#374151" strokeWidth="0.5" />
          <rect x={mixerX + mixerW / 2 - 22} y={processY - 20} width={44} height={4} rx={1} fill="#4b5563" stroke="#374151" strokeWidth="0.5" />
          <text x={mixerX + mixerW / 2} y={processY - 27} textAnchor="middle" fontSize="7" fontWeight="800" fill="#94a3b8" letterSpacing="0.5px">GEAR</text>

          {/* Motor body (cylindrical, above gearbox) */}
          <rect x={mixerX + mixerW / 2 - 26} y={processY - 90} width={52} height={42} rx={4} fill="#1e3a5f" stroke="#172554" strokeWidth="1.5" />
          {/* Cooling fins (horizontal ribs on motor body) */}
          {[...Array(9)].map((_, i) => (
            <line key={i}
              x1={mixerX + mixerW / 2 - 23} y1={processY - 87 + i * 4}
              x2={mixerX + mixerW / 2 + 18} y2={processY - 87 + i * 4}
              stroke="#172554" strokeWidth="1" opacity="0.8" />
          ))}
          {/* Terminal box on right side */}
          <rect x={mixerX + mixerW / 2 + 20} y={processY - 78} width={12} height={16} rx={2} fill="#374151" stroke="#1e293b" strokeWidth="1" />
          <line x1={mixerX + mixerW / 2 + 22} y1={processY - 74} x2={mixerX + mixerW / 2 + 30} y2={processY - 74} stroke="#4b5563" strokeWidth="1" />
          <line x1={mixerX + mixerW / 2 + 22} y1={processY - 69} x2={mixerX + mixerW / 2 + 30} y2={processY - 69} stroke="#4b5563" strokeWidth="1" />
          {/* Motor nameplate */}
          <rect x={mixerX + mixerW / 2 - 20} y={processY - 83} width={28} height={13} rx={1} fill="#0f172a" stroke="#334155" strokeWidth="0.5" />
          <text x={mixerX + mixerW / 2 - 6} y={processY - 73} textAnchor="middle" fontSize="6" fontWeight="700" fill="#60a5fa">MOTOR</text>

          {/* Status LED (green=running, red=stopped) */}
          <circle cx={mixerX + mixerW / 2 - 18} cy={processY - 58} r={4.5} fill={waterFlowing ? '#22c55e' : '#ef4444'}>
            {waterFlowing && <animate attributeName="opacity" values="1;0.35;1" dur="1.2s" repeatCount="indefinite" />}
          </circle>
          <circle cx={mixerX + mixerW / 2 - 18} cy={processY - 58} r={2} fill={waterFlowing ? '#86efac' : '#fca5a5'} opacity="0.8" />

          {/* Rear fan guard (circle at top of motor with spinning blades) */}
          <circle cx={mixerX + mixerW / 2} cy={processY - 96} r={13} fill="none" stroke="#334155" strokeWidth="1.5" />
          <g transform={`translate(${mixerX + mixerW / 2}, ${processY - 96})`}>
            <g>
              {waterFlowing && (
                <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="0.5s" repeatCount="indefinite" />
              )}
              {[0, 72, 144, 216, 288].map((angle, i) => {
                const rad = (angle * Math.PI) / 180;
                return <line key={i} x1={0} y1={0} x2={10 * Math.cos(rad)} y2={10 * Math.sin(rad)} stroke="#475569" strokeWidth="1.5" strokeLinecap="round" />;
              })}
              <circle cx={0} cy={0} r={2.5} fill="#64748b" />
            </g>
          </g>

          {/* COAG dosing box (positioned to left of motor assembly) */}
          <rect x={mixerX - 74} y={processY - 60} width={54} height={32} rx={4} fill="hsl(280 60% 45%)" stroke="hsl(280 70% 30%)" strokeWidth="1.5" />
          <text x={mixerX - 47} y={processY - 40} textAnchor="middle" fontSize="9" fontWeight="700" fill="white" letterSpacing="0.5px">COAG</text>
          {/* Dashed dosing pipe from COAG to tank top */}
          <line x1={mixerX - 20} y1={processY - 44} x2={mixerX + 14} y2={processY + 6} stroke="hsl(280 60% 45%)" strokeWidth="2.5" strokeDasharray="4 3" />

          {/* Labels */}
          <text x={mixerX + mixerW / 2} y={processY + mixerH + 20} textAnchor="middle" fontSize="12" fontWeight="800" fill="hsl(var(--foreground))">FLASH</text>
          <text x={mixerX + mixerW / 2} y={processY + mixerH + 34} textAnchor="middle" fontSize="12" fontWeight="800" fill="hsl(var(--foreground))">MIXER</text>
          <StatusBadge x={mixerX + mixerW / 2} y={processY + mixerH + 40} isOn={waterFlowing} />

          {/* Pipe: Mixer → Flocculator (properly connected boundary to boundary) */}
          {drawPipe(`M ${mixerX + mixerW} ${processY + 120} L ${flocX} ${processY + 120}`, pipeW, false)}
          {drawWaterFlow(`M ${mixerX + mixerW} ${processY + 120} L ${flocX} ${processY + 120}`, rofFb1Val, waterFlowing)}
        </g>

        {/* ═══ SECTION 3: CLARIFLOCCULATOR ═══ */}
        <g>
          {/* Clip path for rotating paddles (limits rendering to inside the flocculation well) */}
          <defs>
            <clipPath id="wtp-floc-well-clip">
              <rect x={flocX + flocW / 2 - 32} y={processY} width={64} height={flocH * 0.58} />
            </clipPath>
          </defs>

          {/* Outer Tank Concrete Body */}
          <rect x={flocX} y={processY} width={flocW} height={flocH} rx={3}
            fill="url(#wtp-concrete)" stroke={waterFlowing ? '#22c55e' : '#475569'} strokeWidth={waterFlowing ? 2.5 : 2} />

          {/* Outer Zone Settling Water (Blue top layer, brown bottom layer) */}
          <rect x={flocX + 4} y={processY + 16} width={flocW - 8} height={flocH - 20} rx={2} fill="#38bdf8" opacity="0.18" />
          <rect x={flocX + 4} y={processY + flocH * 0.65} width={flocW - 8} height={flocH * 0.35 - 4} rx={1} fill="#92400e" opacity="0.25" />

          {/* Inner Flocculation Well Water (Denser, turbid raw water) */}
          <rect x={flocX + flocW / 2 - 32} y={processY + 12} width={64} height={flocH * 0.46} fill="url(#wtp-raw-water)" opacity="0.45" />

          {/* Inner Flocculation Well Baffle Walls */}
          <rect x={flocX + flocW / 2 - 34} y={processY + 4} width={3} height={flocH * 0.55} rx={0.5} fill="#475569" />
          <rect x={flocX + flocW / 2 + 31} y={processY + 4} width={3} height={flocH * 0.55} rx={0.5} fill="#475569" />

          {/* Effluent Launders (Left and Right) */}
          <rect x={flocX + 4} y={processY + 4} width={12} height={14} fill="#cbd5e1" stroke="#64748b" strokeWidth="0.8" />
          <rect x={flocX + flocW - 16} y={processY + 4} width={12} height={14} fill="#cbd5e1" stroke="#64748b" strokeWidth="0.8" />

          {/* Central Sludge Hopper (V-shaped bottom) */}
          <path d={`M ${flocX + 24} ${processY + flocH} L ${flocX + flocW / 2} ${processY + flocH + 34} L ${flocX + flocW - 24} ${processY + flocH}`}
            fill="url(#wtp-concrete)" stroke="#475569" strokeWidth="2" />
          <rect x={flocX + flocW / 2 - 4} y={processY + flocH + 32} width={8} height={16} fill="#475569" />

          {/* Walkway Bridge, Mast & Diagonal Structural Truss */}
          <rect x={flocX - 10} y={processY - 12} width={flocW / 2 + 10} height={6} fill="#334155" stroke="#1e293b" strokeWidth="1" />
          {/* Handrail posts & bars */}
          <line x1={flocX - 8} y1={processY - 12} x2={flocX - 8} y2={processY - 26} stroke="#475569" strokeWidth="1.5" />
          <line x1={flocX + flocW * 0.25} y1={processY - 12} x2={flocX + flocW * 0.25} y2={processY - 26} stroke="#475569" strokeWidth="1.5" />
          <line x1={flocX + flocW / 2 - 8} y1={processY - 12} x2={flocX + flocW / 2 - 8} y2={processY - 26} stroke="#475569" strokeWidth="1.5" />
          <line x1={flocX - 10} y1={processY - 24} x2={flocX + flocW / 2 - 6} y2={processY - 24} stroke="#475569" strokeWidth="1" />
          <line x1={flocX - 10} y1={processY - 18} x2={flocX + flocW / 2 - 6} y2={processY - 18} stroke="#475569" strokeWidth="1" />
          
          {/* Vertical Central Mast */}
          <rect x={flocX + flocW / 2 - 4} y={processY - 65} width={8} height={65} fill="#334155" stroke="#1e293b" strokeWidth="1" />
          
          {/* Diagonal structural guy-wire (Truss support) */}
          <line x1={flocX - 8} y1={processY - 26} x2={flocX + flocW / 2} y2={processY - 65} stroke="#475569" strokeWidth="2" strokeLinecap="round" />

          {/* Gearbox/Drive Unit */}
          <rect x={flocX + flocW / 2 - 12} y={processY - 24} width={24} height={16} rx={2} fill="#4b5563" stroke="#1f2937" strokeWidth="1" />
          <circle cx={flocX + flocW / 2} cy={processY - 16} r={3} fill={waterFlowing ? '#22c55e' : '#ef4444'} />

          {/* Central Shaft */}
          <line x1={flocX + flocW / 2} y1={processY - 8} x2={flocX + flocW / 2} y2={processY + flocH - 12} stroke="#334155" strokeWidth="4" />

          {/* Inner Flocculator Paddles (Clipped) */}
          <g clipPath="url(#wtp-floc-well-clip)">
            <g transform={`translate(${flocX + flocW / 2}, ${processY + flocH * 0.28})`}>
              {waterFlowing && (
                <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="4s" repeatCount="indefinite" additive="sum" />
              )}
              <line x1={-26} y1={0} x2={26} y2={0} stroke="#475569" strokeWidth="3" />
              <rect x={-31} y={-8} width={6} height={16} fill="#64748b" />
              <rect x={25} y={-8} width={6} height={16} fill="#64748b" />
            </g>
            <g transform={`translate(${flocX + flocW / 2}, ${processY + flocH * 0.48})`}>
              {waterFlowing && (
                <animateTransform attributeName="transform" type="rotate" from="360" to="0" dur="5.5s" repeatCount="indefinite" additive="sum" />
              )}
              <line x1={-26} y1={0} x2={26} y2={0} stroke="#475569" strokeWidth="3" />
              <rect x={-31} y={-8} width={6} height={16} fill="#64748b" />
              <rect x={25} y={-8} width={6} height={16} fill="#64748b" />
            </g>
          </g>

          {/* Bottom Rotating Scraper Assembly (with angled scrapers) */}
          <g>
            {/* Left Scraper Arm */}
            <line x1={flocX + flocW / 2} y1={processY + flocH - 10} x2={waterFlowing ? undefined : flocX + 16} y2={processY + flocH - 10} stroke="#334155" strokeWidth="3">
              {waterFlowing && (
                <animate attributeName="x2" values={`${flocX + 16};${flocX + flocW / 2};${flocX + 16}`} dur="8s" repeatCount="indefinite" />
              )}
            </line>
            {[0.2, 0.4, 0.6, 0.8].map((frac, i) => (
              <polygon key={i} points="0,0 4,-6 8,0" fill="#475569"
                transform={`translate(${flocX + 16 + (flocW / 2 - 16) * frac}, ${processY + flocH - 10})`}>
                {waterFlowing && (
                  <animateTransform attributeName="transform" type="translate"
                    values={`${flocX + 16 + (flocW / 2 - 16) * frac}, ${processY + flocH - 10}; ${flocX + flocW / 2}, ${processY + flocH - 10}; ${flocX + 16 + (flocW / 2 - 16) * frac}, ${processY + flocH - 10}`}
                    dur="8s" repeatCount="indefinite" />
                )}
              </polygon>
            ))}

            {/* Right Scraper Arm */}
            <line x1={flocX + flocW / 2} y1={processY + flocH - 10} x2={waterFlowing ? undefined : flocX + flocW - 16} y2={processY + flocH - 10} stroke="#334155" strokeWidth="3">
              {waterFlowing && (
                <animate attributeName="x2" values={`${flocX + flocW - 16};${flocX + flocW / 2};${flocX + flocW - 16}`} dur="8s" repeatCount="indefinite" />
              )}
            </line>
            {[0.2, 0.4, 0.6, 0.8].map((frac, i) => (
              <polygon key={i} points="0,0 4,-6 8,0" fill="#475569"
                transform={`translate(${flocX + flocW / 2 + (flocW / 2 - 16) * frac}, ${processY + flocH - 10})`}>
                {waterFlowing && (
                  <animateTransform attributeName="transform" type="translate"
                    values={`${flocX + flocW / 2 + (flocW / 2 - 16) * frac}, ${processY + flocH - 10}; ${flocX + flocW / 2}, ${processY + flocH - 10}; ${flocX + flocW / 2 + (flocW / 2 - 16) * frac}, ${processY + flocH - 10}`}
                    dur="8s" repeatCount="indefinite" />
                )}
              </polygon>
            ))}
          </g>

          {/* Labels */}
          <text x={flocX + flocW / 2} y={processY + flocH + 64} textAnchor="middle" fontSize="12" fontWeight="800" fill="hsl(var(--foreground))">CLARIFLOCCULATOR</text>
          <StatusBadge x={flocX + flocW / 2} y={processY + flocH + 78} isOn={waterFlowing} />
          {/* Pipe: Floc → Settling (properly connected boundary to boundary) */}
          {drawPipe(`M ${flocX + flocW} ${processY + 120} L ${settleX} ${processY + 120}`, pipeW, false)}
          {drawWaterFlow(`M ${flocX + flocW} ${processY + 120} L ${settleX} ${processY + 120}`, rofFb1Val, waterFlowing)}
        </g>

        {/* ═══ SECTION 4: SETTLING TANK ═══ */}
        <g>
          {/* Tank body */}
          <rect x={settleX} y={processY} width={settleW} height={settleH} rx={3}
            fill="url(#wtp-concrete)" stroke={waterFlowing ? '#22c55e' : '#475569'} strokeWidth={waterFlowing ? 2.5 : 2} />

          {/* Zone fills — clipped to tank boundary */}
          <g clipPath="url(#wtp-settle-clip)">
            {/* Settled sludge — dark brown, bottom 12% */}
            <rect x={settleX + 4} y={processY + settleH * 0.88} width={settleW - 8} height={settleH * 0.12} fill="#78350f" opacity="0.6" />
            {/* Sludge blanket — medium brown, lower 23% */}
            <rect x={settleX + 4} y={processY + settleH * 0.65} width={settleW - 8} height={settleH * 0.23} fill="#92400e" opacity="0.38" />
            {/* Floc / transition zone — light green, mid 32% */}
            <rect x={settleX + 4} y={processY + settleH * 0.33} width={settleW - 8} height={settleH * 0.32} fill="#a3e635" opacity="0.12" />
            {/* Clear water — sky blue, top 33% */}
            <rect x={settleX + 4} y={processY + 4} width={settleW - 8} height={settleH * 0.29} fill="#38bdf8" opacity="0.22" />
          </g>

          {/* Inlet diffuser baffle (near left wall, prevents turbulence at entry) */}
          <rect x={settleX + 18} y={processY + 8} width={4} height={settleH * 0.68} rx={1} fill="#64748b" stroke="#475569" strokeWidth="0.5" />

          {/* Scum baffle near right outlet (prevents floating scum escaping) */}
          <rect x={settleX + settleW - 28} y={processY + 5} width={4} height={settleH * 0.42} rx={1} fill="#64748b" stroke="#475569" strokeWidth="0.5" />

          {/* Animated scraper mechanism — only moves when plant is running */}
          <rect
            x={waterFlowing ? undefined : settleX + 22}
            y={processY + settleH - 11}
            height={5}
            width={settleW - 55}
            rx={2}
            fill="#475569"
            stroke="#334155"
            strokeWidth={1}
            opacity={0.9}
          >
            {waterFlowing && (
              <animate attributeName="x" values={`${settleX + 22};${settleX + settleW - 55};${settleX + 22}`} dur="9s" repeatCount="indefinite" calcMode="ease-in-out" />
            )}
          </rect>
          {/* Scraper blade */}
          <rect
            x={waterFlowing ? undefined : settleX + 22}
            y={processY + settleH - 14}
            height={12}
            width={6}
            rx={1}
            fill="#334155"
            stroke="#475569"
            strokeWidth={0.5}
          >
            {waterFlowing && (
              <animate attributeName="x" values={`${settleX + settleW - 33};${settleX + settleW - 55};${settleX + settleW - 33}`} dur="9s" repeatCount="indefinite" calcMode="ease-in-out" />
            )}
          </rect>

          {/* V-notch overflow weir on right wall */}
          <rect x={settleX + settleW - 24} y={processY + 2} width={18} height={32} rx={2} fill="#64748b" stroke="#475569" strokeWidth="1" />
          {/* V-notch cutouts */}
          {[8, 15, 22].map((dy, i) => (
            <polygon key={i}
              points={`${settleX + settleW - 22},${processY + dy} ${settleX + settleW - 10},${processY + dy} ${settleX + settleW - 16},${processY + dy + 6}`}
              fill="#1e293b" />
          ))}
          {/* Launder channel (effluent collection trough outside right wall) */}
          <rect x={settleX + settleW + 2} y={processY + 2} width={14} height={36} rx={2} fill="#38bdf8" opacity="0.25" stroke="#0ea5e9" strokeWidth="1" />

          {/* Sludge hopper (improved V-shape below tank) */}
          <path d={`M ${settleX + 30} ${processY + settleH} L ${settleX + settleW / 2} ${processY + settleH + 48} L ${settleX + settleW - 30} ${processY + settleH}`}
            fill="url(#wtp-concrete)" stroke="#475569" strokeWidth="2" />
          {/* Sludge outlet pipe stub at hopper apex */}
          <rect x={settleX + settleW / 2 - 4} y={processY + settleH + 46} width={8} height={20} fill="#475569" stroke="#334155" strokeWidth="1" rx={2} />
          <rect x={settleX + settleW / 2 - 7} y={processY + settleH + 62} width={14} height={5} fill="#334155" rx={1} />

          <text x={settleX + settleW / 2} y={processY + settleH + 82} textAnchor="middle" fontSize="12" fontWeight="800" fill="hsl(var(--foreground))">SLUDGE SETTLING TANK</text>
          <StatusBadge x={settleX + settleW / 2} y={processY + settleH + 96} isOn={waterFlowing} />
          {/* Pipe: Settling → Filters (properly connected boundary to boundary) */}
          {drawPipe(`M ${settleX + settleW} ${processY + 120} L ${filterX} ${processY + 120}`, pipeW, false)}
          {drawWaterFlow(`M ${settleX + settleW} ${processY + 120} L ${filterX} ${processY + 120}`, rofFb1Val, waterFlowing)}
        </g>

        {/* ═══ SECTION 5: RAPID SAND FILTERS + BACKWASH TANK ═══ */}
        <g>
          {/* Tank body */}
          <rect x={filterX} y={processY} width={filterW} height={filterH} rx={3}
            fill="url(#wtp-concrete)" stroke={waterFlowing ? '#22c55e' : '#475569'} strokeWidth={waterFlowing ? 2.5 : 2} />

          {/* 2 Washwater troughs (concrete troughs at top, collect backwash + distribute inlet) */}
          {(() => {
            const tw = (filterW - 28) / 2;
            const tx1 = filterX + 8;
            const tx2 = filterX + 8 + tw + 8;
            return (
              <>
                <rect x={tx1} y={processY + 5} width={tw} height={11} rx={2} fill="#94a3b8" stroke="#64748b" strokeWidth="1" />
                <rect x={tx1 + 2} y={processY + 5} width={tw - 4} height={5} rx={1} fill="#64748b" opacity="0.5" />
                <text x={tx1 + tw / 2} y={processY + 13} textAnchor="middle" fontSize="6" fill="#1e293b" fontWeight="700">TROUGH</text>
                <rect x={tx2} y={processY + 5} width={tw} height={11} rx={2} fill="#94a3b8" stroke="#64748b" strokeWidth="1" />
                <rect x={tx2 + 2} y={processY + 5} width={tw - 4} height={5} rx={1} fill="#64748b" opacity="0.5" />
                <text x={tx2 + tw / 2} y={processY + 13} textAnchor="middle" fontSize="6" fill="#1e293b" fontWeight="700">TROUGH</text>
              </>
            );
          })()}

          {/* Water layer (supernatant above sand) */}
          <rect x={filterX + 4} y={processY + 20} width={filterW - 8} height={filterH * 0.22} rx={1} fill="#38bdf8" opacity="0.25" />
          <text x={filterX + filterW / 2} y={processY + 20 + filterH * 0.11} textAnchor="middle" fontSize="9" fill="#0ea5e9" fontWeight="700">WATER</text>

          {/* Sand layer — with stipple texture pattern */}
          <rect x={filterX + 4} y={processY + 20 + filterH * 0.22} width={filterW - 8} height={filterH * 0.38}
            fill="url(#wtp-sand-texture)" rx={1} />
          <text x={filterX + filterW / 2} y={processY + 20 + filterH * 0.22 + filterH * 0.19} textAnchor="middle" fontSize="9" fill="#78350f" fontWeight="700">SAND</text>

          {/* Gravel support layer — with larger dot texture pattern */}
          <rect x={filterX + 4} y={processY + 20 + filterH * 0.60} width={filterW - 8} height={filterH * 0.24}
            fill="url(#wtp-gravel-texture)" rx={1} />
          <text x={filterX + filterW / 2} y={processY + 20 + filterH * 0.60 + filterH * 0.12} textAnchor="middle" fontSize="9" fill="#44403c" fontWeight="700">GRAVEL</text>

          {/* Underdrain manifold (main pipe + lateral branches at bottom) */}
          <rect x={filterX + 4} y={processY + filterH - 12} width={filterW - 8} height={8} rx={2} fill="#475569" stroke="#334155" strokeWidth="1" />
          {[0.1, 0.22, 0.34, 0.48, 0.62, 0.74, 0.86].map((frac, i) => (
            <line key={i}
              x1={filterX + 4 + (filterW - 8) * frac}
              y1={processY + filterH - 12}
              x2={filterX + 4 + (filterW - 8) * frac}
              y2={processY + filterH - 6}
              stroke="#334155" strokeWidth="2.5" />
          ))}
          <text x={filterX + filterW / 2} y={processY + filterH - 1} textAnchor="middle" fontSize="7" fill="#64748b" fontWeight="600">UNDERDRAIN</text>

          <text x={filterX + filterW / 2} y={processY + filterH + 18} textAnchor="middle" fontSize="12" fontWeight="800" fill="hsl(var(--foreground))">RAPID SAND FILTERS</text>
          <StatusBadge x={filterX + filterW / 2} y={processY + filterH + 26} isOn={waterFlowing} />

          {/* ─── DUAL FILTER BED TRANSMITTER STATION (ROF & LOH) ─── */}
          {(() => {
            const cW = 224;
            const cH = 122;
            const cX = filterX + filterW / 2 - cW / 2; // 953 (centered at 1065)
            const cY = processY + filterH + 54;        // 484

            // LOH is supplied directly as a 0–100% engineering value.
            const loh1Color = lohFb1Val >= 85 ? 'hsl(var(--destructive))' : lohFb1Val >= 70 ? 'hsl(var(--warning))' : 'hsl(199 89% 48%)';
            const loh2Color = lohFb2Val >= 85 ? 'hsl(var(--destructive))' : lohFb2Val >= 70 ? 'hsl(var(--warning))' : 'hsl(199 89% 48%)';
            const rofColor = rofFb1Val > 0.1 ? 'hsl(142 71% 45%)' : 'hsl(var(--muted-foreground))';

            // Bar percentages
            const loh1Pct = Math.min(100, Math.max(0, lohFb1Val));
            const loh2Pct = Math.min(100, Math.max(0, lohFb2Val));
            const rofPct = Math.min(100, Math.max(0, (rofFb1Val / 150) * 100));

            return (
              <g>
                {/* Stainless Sensor Impulse Conduits from Filter Underdrain down to Transmitter */}
                <line x1={cX + 42} y1={processY + filterH - 4} x2={cX + 42} y2={cY}
                  stroke="hsl(var(--muted-foreground))" strokeWidth="1.5" strokeDasharray="3 2" opacity="0.6" />
                <circle cx={cX + 42} cy={processY + filterH - 4} r="2" fill="hsl(var(--muted-foreground))" opacity="0.8" />
                <line x1={cX + cW - 42} y1={processY + filterH - 4} x2={cX + cW - 42} y2={cY}
                  stroke="hsl(var(--muted-foreground))" strokeWidth="1.5" strokeDasharray="3 2" opacity="0.6" />
                <circle cx={cX + cW - 42} cy={processY + filterH - 4} r="2" fill="hsl(var(--muted-foreground))" opacity="0.8" />

                {/* Main Transmitter Enclosure Box */}
                <rect x={cX} y={cY} width={cW} height={cH} rx={8}
                  fill="hsl(var(--card))" stroke="hsl(var(--border))" strokeWidth="1.5"
                  style={{ filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.12))' }} />

                {/* Header Bar */}
                <path d={`M ${cX} ${cY + 8} Q ${cX} ${cY} ${cX + 8} ${cY} L ${cX + cW - 8} ${cY} Q ${cX + cW} ${cY} ${cX + cW} ${cY + 8} L ${cX + cW} ${cY + 22} L ${cX} ${cY + 22} Z`}
                  fill="hsl(var(--secondary) / 0.7)" stroke="hsl(var(--border))" strokeWidth="0.8" />
                
                {/* Corner Hex Bolts */}
                {[[cX + 5, cY + 5], [cX + cW - 5, cY + 5], [cX + 5, cY + cH - 5], [cX + cW - 5, cY + cH - 5]].map(([bx, by], i) => (
                  <g key={i}>
                    <circle cx={bx} cy={by} r="2" fill="hsl(var(--muted))" stroke="hsl(var(--border))" strokeWidth="0.5" />
                    <line x1={bx - 1} y1={by - 1} x2={bx + 1} y2={by + 1} stroke="hsl(var(--muted-foreground))" strokeWidth="0.5" opacity="0.5" />
                  </g>
                ))}

                {/* Header Status & Tag */}
                <circle cx={cX + 16} cy={cY + 11} r="2.5" fill={waterFlowing ? '#10b981' : '#64748b'}>
                  {waterFlowing && <animate attributeName="opacity" values="1;0.3;1" dur="2s" repeatCount="indefinite" />}
                </circle>
                <text x={cX + 24} y={cY + 14.5} fontSize="7.5" fontWeight="800" fill="hsl(var(--foreground))" letterSpacing="0.8px">
                  FILTER BED TELEMETRY
                </text>
                <text x={cX + cW - 12} y={cY + 14.5} textAnchor="end" fontSize="6.5" fontWeight="700" fill="hsl(var(--muted-foreground))" fontFamily="ui-monospace, monospace" letterSpacing="0.5px">
                  FIT/PDIT • DUAL BED
                </text>

                {/* Vertical Divider between FB-01 and FB-02 */}
                <line x1={cX + cW / 2} y1={cY + 24} x2={cX + cW / 2} y2={cY + cH - 6}
                  stroke="hsl(var(--border))" strokeWidth="1" strokeDasharray="3 2" />

                {/* ─── LEFT BAY: FILTER BED 1 (ROF + LOH) ─── */}
                <g>
                  {/* Bed 1 Badge */}
                  <rect x={cX + 8} y={cY + 26} width={50} height={12} rx={3} fill="hsl(var(--primary) / 0.12)" stroke="hsl(var(--primary) / 0.3)" strokeWidth="0.6" />
                  <text x={cX + 33} y={cY + 34.5} textAnchor="middle" fontSize="6.5" fontWeight="800" fill="hsl(var(--primary))" letterSpacing="0.5px">
                    BED 01
                  </text>

                  {/* ROF Readout Display */}
                  <rect x={cX + 8} y={cY + 41} width={98} height={34} rx={4}
                    fill="hsl(var(--secondary) / 0.5)" stroke="hsl(var(--border) / 0.8)" strokeWidth="0.8" />
                  <rect x={cX + 10} y={cY + 43} width={94} height={30} rx={3} fill="hsl(var(--background))" />
                  
                  <text x={cX + 14} y={cY + 51} fontSize="6" fontWeight="700" fill="hsl(var(--muted-foreground))" letterSpacing="0.5px">
                    ROF (FLOW RATE)
                  </text>
                  {waterFlowing && (
                    <circle cx={cX + 96} cy={cY + 49} r="2" fill="#10b981">
                      <animate attributeName="opacity" values="1;0.2;1" dur="1s" repeatCount="indefinite" />
                    </circle>
                  )}
                  <text x={cX + 14} y={cY + 65} fontSize="12" fontWeight="900" fill={rofColor} fontFamily="ui-monospace, monospace">
                    {rofFb1Val.toFixed(2)}
                    <tspan fontSize="7" fontWeight="600" fill="hsl(var(--muted-foreground))"> m³</tspan>
                  </text>
                  {/* Micro Flow Meter Bar */}
                  <rect x={cX + 14} y={cY + 68} width={86} height={2.5} rx={1.2} fill="hsl(var(--muted) / 0.4)" />
                  <rect x={cX + 14} y={cY + 68} width={Math.max(3, (rofPct / 100) * 86)} height={2.5} rx={1.2} fill="#10b981" />

                  {/* LOH-FB1 Readout Display */}
                  <rect x={cX + 8} y={cY + 79} width={98} height={36} rx={4}
                    fill="hsl(var(--secondary) / 0.5)" stroke="hsl(var(--border) / 0.8)" strokeWidth="0.8" />
                  <rect x={cX + 10} y={cY + 81} width={94} height={32} rx={3} fill="hsl(var(--background))" />
                  
                  <text x={cX + 14} y={cY + 89} fontSize="6" fontWeight="700" fill="hsl(var(--muted-foreground))" letterSpacing="0.5px">
                    LOH (HEAD LOSS)
                  </text>
                  <text x={cX + 14} y={cY + 103} fontSize="12" fontWeight="900" fill={loh1Color} fontFamily="ui-monospace, monospace">
                    {lohFb1Val.toFixed(2)}
                    <tspan fontSize="7" fontWeight="600" fill="hsl(var(--muted-foreground))"> %</tspan>
                  </text>
                  {/* Micro Head Loss Bar (0 to 100%) */}
                  <rect x={cX + 14} y={cY + 106} width={86} height={3} rx={1.5} fill="hsl(var(--muted) / 0.4)" />
                  <rect x={cX + 14} y={cY + 106} width={Math.max(3, (loh1Pct / 100) * 86)} height={3} rx={1.5} fill={loh1Color} />
                </g>

                {/* ─── RIGHT BAY: FILTER BED 2 (LOH + STATUS) ─── */}
                <g>
                  {/* Bed 2 Badge */}
                  <rect x={cX + cW / 2 + 8} y={cY + 26} width={50} height={12} rx={3} fill="hsl(var(--primary) / 0.12)" stroke="hsl(var(--primary) / 0.3)" strokeWidth="0.6" />
                  <text x={cX + cW / 2 + 33} y={cY + 34.5} textAnchor="middle" fontSize="6.5" fontWeight="800" fill="hsl(var(--primary))" letterSpacing="0.5px">
                    BED 02
                  </text>

                  {/* LOH-FB2 Readout Display */}
                  <rect x={cX + cW / 2 + 8} y={cY + 41} width={98} height={36} rx={4}
                    fill="hsl(var(--secondary) / 0.5)" stroke="hsl(var(--border) / 0.8)" strokeWidth="0.8" />
                  <rect x={cX + cW / 2 + 10} y={cY + 43} width={94} height={32} rx={3} fill="hsl(var(--background))" />
                  
                  <text x={cX + cW / 2 + 14} y={cY + 51} fontSize="6" fontWeight="700" fill="hsl(var(--muted-foreground))" letterSpacing="0.5px">
                    LOH (HEAD LOSS)
                  </text>
                  <text x={cX + cW / 2 + 14} y={cY + 65} fontSize="12" fontWeight="900" fill={loh2Color} fontFamily="ui-monospace, monospace">
                    {lohFb2Val.toFixed(2)}
                    <tspan fontSize="7" fontWeight="600" fill="hsl(var(--muted-foreground))"> %</tspan>
                  </text>
                  {/* Micro Head Loss Bar (0 to 100%) */}
                  <rect x={cX + cW / 2 + 14} y={cY + 68} width={86} height={3} rx={1.5} fill="hsl(var(--muted) / 0.4)" />
                  <rect x={cX + cW / 2 + 14} y={cY + 68} width={Math.max(3, (loh2Pct / 100) * 86)} height={3} rx={1.5} fill={loh2Color} />

                  {/* FB2 Operating Status Card */}
                  <rect x={cX + cW / 2 + 8} y={cY + 81} width={98} height={34} rx={4}
                    fill="hsl(var(--secondary) / 0.5)" stroke="hsl(var(--border) / 0.8)" strokeWidth="0.8" />
                  <rect x={cX + cW / 2 + 10} y={cY + 83} width={94} height={30} rx={3} fill="hsl(var(--background))" />
                  
                  <text x={cX + cW / 2 + 14} y={cY + 92} fontSize="6" fontWeight="700" fill="hsl(var(--muted-foreground))" letterSpacing="0.5px">
                    BED 02 STATUS
                  </text>
                  <g transform={`translate(${cX + cW / 2 + 14}, ${cY + 96})`}>
                    <rect x={0} y={0} width={86} height={13} rx={3}
                      fill={lohFb2Val >= 85 ? 'hsl(var(--destructive) / 0.15)' : 'hsl(var(--success) / 0.15)'}
                      stroke={lohFb2Val >= 85 ? 'hsl(var(--destructive) / 0.4)' : 'hsl(var(--success) / 0.4)'} strokeWidth="0.6" />
                    <circle cx={6} cy={6.5} r="2" fill={lohFb2Val >= 85 ? '#ef4444' : '#10b981'} />
                    <text x={12} y={9.5} fontSize="6.5" fontWeight="800"
                      fill={lohFb2Val >= 85 ? 'hsl(var(--destructive))' : 'hsl(var(--success))'} letterSpacing="0.4px">
                      {lohFb2Val >= 85 ? 'WASH REQUIRED' : 'FILTERING ACTIVE'}
                    </text>
                  </g>
                </g>
              </g>
            );
          })()}

          {/* Backwash Tank — positioned above filter (unchanged) */}
          <rect x={bwTankX} y={bwTankY} width={bwTankW} height={bwTankH} rx={4}
            fill="url(#wtp-concrete)" stroke="#334155" strokeWidth="2" />
          <rect x={bwTankX + 4} y={bwTankY + bwTankH - bwFillH} width={bwTankW - 8} height={bwFillH} rx={3} fill="#f59e0b" opacity="0.5">
            <animate attributeName="opacity" values="0.4;0.6;0.4" dur="3s" repeatCount="indefinite" />
          </rect>
          <text x={bwTankX + bwTankW / 2} y={bwTankY - 10} textAnchor="middle" fontSize="10" fontWeight="800" fill="hsl(var(--foreground))">BACKWASH</text>
          {/* Connecting pipe: filter ↔ backwash tank */}
          {drawPipe(`M ${filterX + 12} ${processY} L ${filterX + 12} ${bwTankY + bwTankH}`, 10, false)}
          {drawLevelBar(bwTankX + bwTankW + 14, bwTankY, 32, bwTankH, ltBwVal, "LT-BW", "#f59e0b")}
        </g>

        {/* ═══ SECTION 6: CHLORINATION ═══ */}
        <g>
          <StatusBadge x={chlorinationTapX} y={processY - 132} isOn={chlorinationOn} />
          <text x={chlorinationTapX} y={processY - 96} textAnchor="middle" fontSize="11" fontWeight="800" fill="hsl(var(--foreground))">CHLORINATION</text>
          {/* Chlorination dosing unit */}
          <rect x={chlorinationTapX - 25} y={processY - 80} width={50} height={35} rx={4}
            fill={chlorinationOn ? "hsl(142 71% 45%)" : "hsl(142 71% 45% / 0.4)"} stroke="hsl(142 80% 30%)" strokeWidth="1.5" />
          <text x={chlorinationTapX} y={processY - 59} textAnchor="middle" fontSize="9" fontWeight="700" fill="white" letterSpacing="0.5px">Cl₂</text>
          {/* Dosing pipe connecting directly to CWR roof */}
          {chlorinationOn ? (
            <line x1={chlorinationTapX} y1={processY - 45} x2={chlorinationTapX} y2={cwrY - 2} stroke="hsl(142 71% 45%)" strokeWidth="3" strokeDasharray="4 3">
              <animate attributeName="strokeDashoffset" from="7" to="0" dur="0.8s" repeatCount="indefinite" />
            </line>
          ) : (
            <line x1={chlorinationTapX} y1={processY - 45} x2={chlorinationTapX} y2={cwrY - 2} stroke="hsl(142 71% 45% / 0.3)" strokeWidth="3" strokeDasharray="4 3" />
          )}
        </g>

        {/* ═══ SECTION 8: SUCTION PIPE (CWR → Pumps) ═══ */}
        <g>
          {/* Continuous suction pipe from CWR to all pumps with a smooth 90-degree corner */}
          {(() => {
            const bendR = 35;
            const fullSuctionPath = `M ${cwrDropPipeX} ${cwrY + cwrH - 15} L ${cwrDropPipeX} ${suctionY - bendR} Q ${cwrDropPipeX} ${suctionY} ${cwrDropPipeX - bendR} ${suctionY} L ${pump1X - 20} ${suctionY}`;
            return (
              <>
                {drawPipe(fullSuctionPath, pipeW)}
                {drawWaterColumn(fullSuctionPath, pipeW)}
                {anyPumpOn && drawWaterFlow(fullSuctionPath, 50, true)}
              </>
            );
          })()}

          {/* End cap on left side of suction header */}
          <ellipse cx={pump1X - 20} cy={suctionY} rx={3} ry={pipeW / 2 + 2} fill={pVDark} opacity="0.7" />

          {/* Suction stubs from header down to each pump inlet with smooth T-bends */}
          {pumpCenters.map((px, i) => {
            const inletX = px + 5;
            const stubW = pipeW * 0.7;
            return (
              <g key={`suction-stub-${i}`}>
                {drawPipe(`M ${inletX} ${suctionY} L ${inletX} ${pumpInletCenterY}`, stubW)}
                {drawWaterColumn(`M ${inletX} ${suctionY} L ${inletX} ${pumpInletCenterY}`, stubW)}
                {pumpOns[i] && drawWaterFlow(`M ${inletX} ${suctionY} L ${inletX} ${pumpInletCenterY}`, 50, true)}
              </g>
            );
          })}
        </g>

        {/* ═══ SECTION 7: CLEAR WATER RESERVOIR ═══ */}
        <g>
          {/* Inflow Pipe: Filter → Chlorination → CWR (Drawn with rounded end for consistency) */}
          {drawPipe(filterToCwrPath, pipeW, true)}
          {drawWaterColumn(filterToCwrPath, pipeW)}
          {drawWaterFlow(filterToCwrPath, rofFb1Val, waterFlowing)}

          <rect x={cwrX} y={cwrY} width={cwrW} height={cwrH} rx={4}
            fill="url(#wtp-concrete)" stroke="#334155" strokeWidth="2.5" />
          <g clipPath="url(#wtp-cwr-clip)">
            <rect x={cwrX} y={cwWaterY} width={cwrW} height={cwFillH} fill="url(#wtp-water)" opacity="0.85" className="transition-all duration-1000 ease-in-out" />
            {cwLevelPct > 0 && (
              <path fill="#38bdf8" opacity="0.5">
                <animate attributeName="d" dur="3s" repeatCount="indefinite"
                  values={`M ${cwrX} ${cwWaterY + 4} Q ${cwrX + cwrW * 0.25} ${cwWaterY - 4} ${cwrX + cwrW * 0.5} ${cwWaterY + 4} T ${cwrX + cwrW} ${cwWaterY + 4} L ${cwrX + cwrW} ${cwWaterY + 15} L ${cwrX} ${cwWaterY + 15} Z;M ${cwrX} ${cwWaterY + 4} Q ${cwrX + cwrW * 0.25} ${cwWaterY + 10} ${cwrX + cwrW * 0.5} ${cwWaterY + 4} T ${cwrX + cwrW} ${cwWaterY + 4} L ${cwrX + cwrW} ${cwWaterY + 15} L ${cwrX} ${cwWaterY + 15} Z;M ${cwrX} ${cwWaterY + 4} Q ${cwrX + cwrW * 0.25} ${cwWaterY - 4} ${cwrX + cwrW * 0.5} ${cwWaterY + 4} T ${cwrX + cwrW} ${cwWaterY + 4} L ${cwrX + cwrW} ${cwWaterY + 15} L ${cwrX} ${cwWaterY + 15} Z`} />
              </path>
            )}
          </g>
          <line x1={cwrX} y1={cwrY} x2={cwrX} y2={cwrY + cwrH} stroke="#475569" strokeWidth="2.5" />
          <line x1={cwrX + cwrW} y1={cwrY} x2={cwrX + cwrW} y2={cwrY + cwrH} stroke="#475569" strokeWidth="2.5" />

          {/* CWR LCD panel */}
          <rect x={cwrX + cwrW / 2 - 60} y={cwrY + 10} width={120} height={56} rx={5} fill="hsl(var(--card))" stroke="hsl(var(--border))" strokeWidth="1.5" opacity="0.92" />
          <rect x={cwrX + cwrW / 2 - 56} y={cwrY + 14} width={112} height={48} rx={3} fill="hsl(var(--background))" opacity="0.95" />
          <text x={cwrX + cwrW / 2} y={cwrY + 28} textAnchor="middle" fontSize="9" fontWeight="700" fill="hsl(var(--muted-foreground))" fontFamily="ui-monospace, monospace" letterSpacing="1.2px">CWR LEVEL</text>
          {(() => {
            const cwStatusColor = cwLevelPct >= 70 ? 'hsl(var(--success))' : cwLevelPct >= 40 ? 'hsl(var(--warning))' : 'hsl(var(--destructive))';
            const cwStatusText = cwLevelPct >= 70 ? 'GOOD' : cwLevelPct >= 40 ? 'MEDIUM' : cwLevelPct > 0 ? 'LOW' : 'EMPTY';
            return (
              <>
                <text x={cwrX + cwrW / 2} y={cwrY + 50} textAnchor="middle" fontSize="22" fontWeight="800" fill={cwStatusColor} fontFamily="ui-monospace, monospace">
                  {ltCwVal.toFixed(1)}<tspan fontSize="12" fill="hsl(var(--muted-foreground))"> %</tspan>
                </text>
                <text x={cwrX + cwrW / 2} y={cwrY + 62} textAnchor="middle" fontSize="9" fontWeight="900" fill={cwStatusColor}>{cwStatusText}</text>
              </>
            );
          })()}

          {/* CWR label rendered later (after pipes) to prevent overlap */}
          {drawLevelBar(cwrX + cwrW + 18, cwrY, 34, cwrH, ltCwVal, "LT-CW", "#0ea5e9")}

          {/* ═══ OUTLET TEMPERATURE SENSOR (Classic Glass Thermometer) ═══ */}
          {(() => {
            const temVal = findTag('WTP-TEM')?.value ?? 0;
            const pct = Math.max(0, Math.min(100, (temVal / 60) * 100));
            const temColor = pct > 80 ? '#ef4444' : pct > 60 ? '#f97316' : pct > 30 ? '#22c55e' : '#38bdf8';
            
            // Shifted well to the right (x = cwrX + cwrW + 155) so LT-CW 50% line is completely clear
            const tX = cwrX + cwrW + 155;
            const tY = cwrY + 10;
            const stemW = 14;
            const stemH = 100;
            const bulbR = 17;
            const stemX = tX - stemW / 2;
            const stemY = tY + 20;
            const bulbCy = stemY + stemH + bulbR - 2;
            const fillH = (pct / 100) * stemH;
            const fillY = stemY + stemH - fillH;

            return (
              <g>
                <defs>
                  <linearGradient id="wtp-therm-grad" x1="0" y1="1" x2="0" y2="0">
                    <stop offset="0%" stopColor={temColor} />
                    <stop offset="100%" stopColor={temColor} stopOpacity="0.8" />
                  </linearGradient>
                  <clipPath id="wtp-therm-stem-clip">
                    <rect x={stemX + 1} y={stemY} width={stemW - 2} height={stemH} rx={4} />
                  </clipPath>
                </defs>

                {/* Sensor Title Label */}
                <text x={tX} y={tY + 4} textAnchor="middle" fontSize="13" fontWeight="800" fill="hsl(var(--foreground))">
                  CWR TEMP
                </text>

                {/* Stem Outer Glass Body / Background Track */}
                <rect x={stemX} y={stemY} width={stemW} height={stemH} rx={stemW / 2}
                  fill="hsl(var(--card))" stroke="hsl(var(--border))" strokeWidth="1.5" />

                {/* Scale Tick Marks on Right */}
                {[0, 20, 40, 60].map((temp) => {
                  const p = temp / 60;
                  const tickY = stemY + stemH - p * stemH;
                  return (
                    <g key={temp}>
                      <line x1={stemX + stemW + 3} y1={tickY} x2={stemX + stemW + 10} y2={tickY}
                        stroke="hsl(var(--muted-foreground))" strokeWidth="1.5" />
                      <text x={stemX + stemW + 14} y={tickY + 3.5} textAnchor="start"
                        fill="hsl(var(--muted-foreground))"
                        style={{ fontSize: "9px", fontFamily: "ui-monospace, monospace", fontWeight: 700 }}>
                        {temp}
                      </text>
                    </g>
                  );
                })}

                {/* Minor Ticks */}
                {[10, 30, 50].map((temp) => {
                  const p = temp / 60;
                  const tickY = stemY + stemH - p * stemH;
                  return (
                    <line key={temp} x1={stemX + stemW + 3} y1={tickY} x2={stemX + stemW + 7} y2={tickY}
                      stroke="hsl(var(--muted-foreground))" strokeWidth="1" opacity="0.6" />
                  );
                })}

                {/* Mercury Liquid Stem Fill */}
                <g clipPath="url(#wtp-therm-stem-clip)">
                  <rect x={stemX + 1} y={fillY} width={stemW - 2} height={fillH + bulbR}
                    rx={3} fill="url(#wtp-therm-grad)" opacity="0.95">
                    <animate attributeName="opacity" values="0.88;0.98;0.88" dur="2.5s" repeatCount="indefinite" />
                  </rect>
                </g>

                {/* Stem Glass Outline */}
                <rect x={stemX} y={stemY} width={stemW} height={stemH} rx={stemW / 2}
                  fill="none" stroke="hsl(var(--border))" strokeWidth="1.5" />

                {/* Bulb at Bottom */}
                <circle cx={tX} cy={bulbCy} r={bulbR}
                  fill={temColor} opacity="0.95" />
                <circle cx={tX} cy={bulbCy} r={bulbR}
                  fill="none" stroke="hsl(var(--border))" strokeWidth="2" />
                {/* Bulb Glass Highlight */}
                <circle cx={tX - 4} cy={bulbCy - 4} r={4} fill="white" opacity="0.4" />

                {/* Digital Readout Box */}
                <rect x={tX - 36} y={bulbCy + bulbR + 8} width={72} height={36} rx={6}
                  fill="hsl(var(--card))" stroke="hsl(var(--border))" strokeWidth="1.5" />
                <text x={tX} y={bulbCy + bulbR + 26} textAnchor="middle"
                  className="font-mono" style={{ fontSize: "16px", fontWeight: 800, fill: temColor }}>
                  {temVal.toFixed(1)}
                  <tspan fontSize="11" fill="hsl(var(--muted-foreground))" fontWeight={600}> °C</tspan>
                </text>
                <text x={tX} y={bulbCy + bulbR + 38} textAnchor="middle"
                  fontSize="8" fontWeight={800} fill="hsl(var(--muted-foreground))" letterSpacing="0.8px">
                  OUTLET
                </text>
              </g>
            );
          })()}

        </g>



        {/* ═══ COMBINED PRESSURE GAUGES ABOVE Headers ═══ */}
        <g>
          <Gauge cx={comGaugeX} cy={comGaugeCenterY} r={comGaugeR} value={combinedPt} min={0} max={10} label="PT COM" unit="Bar" />
        </g>

        {/* ═══ SECTION 10: DISCHARGE HEADER + RISERS + MERGE ═══ */}
        <g>
          {(() => {
            const hCY = headerY;
            const hPW = 28;
            const bendR = 24;
            const riseTopY = mergeY;
            const headerPumpsOn = pump1On || pump2On;
            const cornerR = 24; // 90-degree corner radius

            // Main Thick Header Pipe (Visual): From headerStartX horizontally to headerEndX, then curving UP to mergeY, then curving RIGHT to outletPipeEndX
            const mainHeaderVis = `M ${headerStartX} ${hCY} L ${headerEndX - cornerR} ${hCY} Q ${headerEndX} ${hCY} ${headerEndX} ${hCY - cornerR} L ${headerEndX} ${riseTopY + bendR} Q ${headerEndX} ${riseTopY} ${headerEndX + bendR} ${riseTopY} L ${outletPipeEndX + 20} ${riseTopY}`;

            // --- Flow Path ---
            const mainFlow = `M ${headerStartX} ${hCY} L ${headerEndX - cornerR} ${hCY} Q ${headerEndX} ${hCY} ${headerEndX} ${hCY - cornerR} L ${headerEndX} ${riseTopY + bendR} Q ${headerEndX} ${riseTopY} ${headerEndX + bendR} ${riseTopY} L ${outletPipeEndX + 20} ${riseTopY}`;

            return (
              <g>
                {/* Risers from each pump outlet to header - buried behind header and behind pump for flush finish */}
                {pumpCenters.map((px, i) => {
                  const outletX = px + pumpOutletOffsetX + 4;
                  const pumpOutletTopY = pumpRowY;
                  const headerBottomEdge = hCY + hPW / 2;
                  // Start slightly inside pump body (+5px) to hide rounded cap behind pump component
                  const riserPath = `M ${outletX} ${pumpOutletTopY + 5} L ${outletX} ${headerBottomEdge}`;
                  return (
                    <g key={`riser-${i}`}>
                      {drawPipe(riserPath, pipeW)}
                      {pumpOns[i] && drawWaterColumn(riserPath, pipeW)}
                      {pumpOns[i] && drawWaterFlow(riserPath, 50, true)}
                    </g>
                  );
                })}

                {/* Draw header pipe AFTER risers so they overlap the rounded ends */}
                {drawPipe(mainHeaderVis, hPW)}
                {drawWaterColumn(mainHeaderVis, hPW)}

                {/* End caps on outer ends of the manifolds (corners don't need caps) */}
                <ellipse cx={headerStartX} cy={hCY} rx={3} ry={hPW / 2 + 2} fill={pVDark} opacity="0.7" />

                {/* Water flow segmented cleanly to avoid overlaps */}
                {headerPumpsOn && drawWaterFlow(mainFlow, flowOutVal || 50, true)}

                {/* Header label - below header */}
                <rect x={635 - 75} y={hCY + hPW / 2 + 8} width={150} height={18} rx={4} fill="hsl(var(--background))" opacity="0.9" />
                <text x={635} y={hCY + hPW / 2 + 21} textAnchor="middle" fontSize="10" fontWeight="800" fill="hsl(var(--muted-foreground))">DISCHARGE HEADER</text>

                {/* PTCOM connector - thin vertical impulse line from gauge to horizontal header */}
                <line x1={comGaugeX} y1={comGaugeCenterY + comGaugeR + 8} x2={comGaugeX} y2={hCY - hPW / 2}
                  stroke="hsl(var(--muted-foreground))" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.7" />
                <circle cx={comGaugeX} cy={comGaugeCenterY + comGaugeR + 8} r="2.5" fill="hsl(var(--muted-foreground))" opacity="0.8" />
                <circle cx={comGaugeX} cy={hCY - hPW / 2} r="2.5" fill="hsl(var(--muted-foreground))" opacity="0.8" />
              </g>
            );
          })()}

          {/* TO OHTs label */}
          <rect x={outletPipeEndX - 170} y={mergeY - 45} width={150} height={22} rx={6} fill="hsl(var(--success) / 0.1)" stroke="hsl(var(--success) / 0.4)" strokeWidth="1" />
          <text x={outletPipeEndX - 95} y={mergeY - 30} textAnchor="middle" fontSize="12" fontWeight="800" fill="hsl(var(--success))">TO OHTs →</text>
        </g>

        {/* ═══ CWR LABEL ═══ */}
        <g>
          <text x={cwrX + cwrW / 2 + 20} y={cwrY + cwrH + 18} textAnchor="middle" fontSize="12" fontWeight="800" fill="hsl(var(--foreground))">
            <tspan x={cwrX + cwrW / 2 + 20} dy="0">CLEAR WATER</tspan>
            <tspan x={cwrX + cwrW / 2 + 20} dy="16">RESERVOIR</tspan>
          </text>
        </g>

        {/* ═══ HT PUMPS × 2 ═══ */}
        <InlineHTPump x={pump1X} y={pumpRowY} w={pumpW} h={pumpH} isRunning={pump1On} label="HT PUMP 1" />
        <InlineHTPump x={pump2X} y={pumpRowY} w={pumpW} h={pumpH} isRunning={pump2On} label="HT PUMP 2" />

        {/* Pump ON/OFF labels */}
        {pumpCenters.map((px, i) => (
          <text key={i} x={px + pumpW / 2} y={pumpRowY + pumpH + 16} textAnchor="middle" fontSize="11" fontWeight="900"
            fill={pumpOns[i] ? '#22c55e' : '#ef4444'}>● {pumpOns[i] ? 'ON' : 'OFF'}</text>
        ))}

        {/* HT Pump Trip Indicator Badges */}
        {pump1Trip && (
          <g>
            <rect x={pump1X + pumpW / 2 - 32} y={pumpRowY - 32} width={64} height={20} rx={10}
              fill="hsl(0 85% 50% / 0.9)" stroke="hsl(0 90% 35%)" strokeWidth="1.5">
              <animate attributeName="opacity" values="1;0.4;1" dur="0.7s" repeatCount="indefinite" />
            </rect>
            <text x={pump1X + pumpW / 2} y={pumpRowY - 17} textAnchor="middle" fontSize="9" fontWeight="900"
              fill="white" letterSpacing="1px">⚠ TRIP</text>
          </g>
        )}
        {pump2Trip && (
          <g>
            <rect x={pump2X + pumpW / 2 - 32} y={pumpRowY - 32} width={64} height={20} rx={10}
              fill="hsl(0 85% 50% / 0.9)" stroke="hsl(0 90% 35%)" strokeWidth="1.5">
              <animate attributeName="opacity" values="1;0.4;1" dur="0.7s" repeatCount="indefinite" />
            </rect>
            <text x={pump2X + pumpW / 2} y={pumpRowY - 17} textAnchor="middle" fontSize="9" fontWeight="900"
              fill="white" letterSpacing="1px">⚠ TRIP</text>
          </g>
        )}


        {/* ═══ INDIVIDUAL PT GAUGES (below each pump) ═══ */}
        <g>
          {pumpCenters.map((px, i) => {
            const gaugeX = px + pumpOutletOffsetX;
            const outletX = px + pumpOutletOffsetX;
            const tapY = pumpRowY + pumpH + 4;
            const gaugeTopY = ptGaugeY - ptGaugeR - 8;
            return (
              <g key={`pt-${i}`}>
                {/* Thin impulse line from pump discharge down to PT gauge */}
                <line x1={outletX} y1={tapY} x2={outletX} y2={gaugeTopY}
                  stroke="hsl(var(--muted-foreground))" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.7" />
                <circle cx={outletX} cy={tapY} r="2.5" fill="hsl(var(--muted-foreground))" opacity="0.8" />
                <circle cx={outletX} cy={gaugeTopY} r="2.5" fill="hsl(var(--muted-foreground))" opacity="0.8" />
                <Gauge cx={gaugeX} cy={ptGaugeY} r={ptGaugeR} value={ptVals[i]} min={0} max={10} label={ptLabels[i]} unit="Bar" />
              </g>
            );
          })}
        </g>

        {/* ═══ SECTION 12: OUTLET INSTRUMENTS ═══ */}
        <g>
          {/* EFM OUT */}
          {(() => {
            const efmX = outletEfmX;
            const efmTopY = mergeY - 101; // Perfectly matched to EFM IN's exact neck height (19px)
            const hW = 90, hH = 55, nW = 24;
            return (
              <g>
                <text x={efmX} y={efmTopY - 14} textAnchor="middle" fontSize="15" fontWeight="800" fill="hsl(var(--foreground))">EFM OUT</text>
                <polygon points={`${efmX - hW / 2 + 5},${efmTopY} ${efmX + hW / 2 - 5},${efmTopY} ${efmX + hW / 2},${efmTopY + 12} ${efmX - hW / 2},${efmTopY + 12}`}
                  fill="hsl(38 92% 50% / 0.85)" stroke="hsl(var(--border))" strokeWidth="1" />
                <rect x={efmX - hW / 2} y={efmTopY + 12} width={hW} height={hH} rx={5} fill="hsl(38 92% 50% / 0.9)" stroke="hsl(var(--border))" strokeWidth="1.2" />
                <rect x={efmX - 32} y={efmTopY + 22} width={64} height={30} rx={3} fill="hsl(var(--secondary))" stroke="hsl(var(--border))" strokeWidth="0.8" />
                <text x={efmX} y={efmTopY + 43} textAnchor="middle" fill="hsl(var(--foreground))" style={{ fontSize: '16px', fontFamily: 'ui-monospace, monospace', fontWeight: 800 }}>
                  {flowOutVal.toFixed(2)}
                </text>
                {/* Neck connects to merged outlet pipe */}
                <rect x={efmX - nW / 2} y={efmTopY + 12 + hH} width={nW} height={(mergeY - 15) - (efmTopY + 12 + hH)} fill="#64748b" stroke="#475569" strokeWidth="1" />
                {/* Flange sticks up slightly above the thick pipe */}
                <rect x={efmX - nW / 2 - 5} y={mergeY - 17} width={nW + 10} height={7} rx={2} fill={pVDark} />

                <rect x={efmX - 80} y={mergeY + 24} width={160} height={44} rx={8} fill="hsl(38 92% 50% / 0.06)" stroke="hsl(38 92% 50% / 0.4)" strokeWidth="1" />
                <text x={efmX} y={mergeY + 39} textAnchor="middle" fontSize="11" fontWeight="700" fill="hsl(38 92% 55%)" letterSpacing="0.8px">FLOW RATE</text>
                <text x={efmX} y={mergeY + 58} textAnchor="middle" fontSize="20" fontWeight="900" fill="hsl(var(--foreground))" fontFamily="ui-monospace">
                  {flowOutVal.toFixed(1)} <tspan fontSize="11" fill="hsl(var(--muted-foreground))" fontWeight="600">m³/h</tspan>
                </text>
              </g>
            );
          })()}

          {/* Outlet Quality Analyzers - larger with proper stubs */}
          {(() => {
            const analyzerBaseY = mergeY + 32; // Moved UP to match exactly 32px from the center dot 
            const startX = outletAnalyzerX;
            return (
              <g>
                {[0, 1, 2].map((i) => {
                  const xCenter = startX + i * (outletAnalyzerW + 10) + outletAnalyzerW / 2;
                  return (
                    <g key={`out-stub-${i}`}>
                      <line x1={xCenter} y1={mergeY + 9} x2={xCenter} y2={analyzerBaseY} stroke="#64748b" strokeWidth="4" />
                      <circle cx={xCenter} cy={mergeY} r="5" fill="#64748b" />
                    </g>
                  );
                })}
                <InlinePhAnalyzer x={startX} y={analyzerBaseY} w={outletAnalyzerW} h={outletAnalyzerH} value={phOutVal} label="pH (TREATED)" />
                <InlineClAnalyzer x={startX + outletAnalyzerW + 10} y={analyzerBaseY} w={outletAnalyzerW} h={outletAnalyzerH} value={clOutVal} />
                <InlineTaAnalyzer x={startX + (outletAnalyzerW + 10) * 2} y={analyzerBaseY} w={outletAnalyzerW} h={outletAnalyzerH} value={taOutVal} label="TURB (OUT)" />
              </g>
            );
          })()}
        </g>

        {/* ═══ SECTION 13: TOTALIZER ═══ */}
        <g>
          {(() => {
            const tx = totalizerX, ty = totalizerY;
            const digits = Math.floor(totVal).toString().padStart(8, '0').split('');
            const dec = (totVal % 1).toFixed(2).substring(2);
            const dW = 15, dH = 24, gp = 2;
            const totW = 10 * dW + 9 * gp + 4 + 20;
            return (
              <g>
                <text x={tx} y={ty - 10} textAnchor="middle" fontSize="13" fontWeight="800" fill="hsl(var(--foreground))">Totalizer (Outlet)</text>
                <rect x={tx - totW / 2} y={ty} width={totW} height={dH + 16} rx={5} fill="hsl(var(--secondary) / 0.5)" stroke="hsl(var(--border) / 0.5)" strokeWidth="1" />
                {digits.map((d, i) => (
                  <g key={`td${i}`}>
                    <rect x={tx - totW / 2 + 10 + i * (dW + gp)} y={ty + 8} width={dW} height={dH} rx={3} fill="hsl(var(--card))" stroke="hsl(var(--border))" strokeWidth="1" />
                    <text x={tx - totW / 2 + 10 + i * (dW + gp) + dW / 2} y={ty + 8 + dH / 2 + 5} textAnchor="middle" fill="hsl(var(--foreground))" style={{ fontSize: '14px', fontFamily: 'ui-monospace, monospace', fontWeight: 800 }}>{d}</text>
                  </g>
                ))}
                <circle cx={tx - totW / 2 + 10 + 8 * (dW + gp) + 1} cy={ty + 8 + dH - 2} r={2.5} fill="hsl(var(--primary))" />
                {dec.split('').map((d, i) => (
                  <g key={`dd${i}`}>
                    <rect x={tx - totW / 2 + 10 + 8 * (dW + gp) + 4 + gp + i * (dW + gp)} y={ty + 8} width={dW} height={dH} rx={3} fill="hsl(var(--destructive) / 0.12)" stroke="hsl(var(--destructive) / 0.25)" strokeWidth="1" />
                    <text x={tx - totW / 2 + 10 + 8 * (dW + gp) + 4 + gp + i * (dW + gp) + dW / 2} y={ty + 8 + dH / 2 + 5} textAnchor="middle" fill="hsl(var(--destructive))" style={{ fontSize: '14px', fontFamily: 'ui-monospace, monospace', fontWeight: 800 }}>{d}</text>
                  </g>
                ))}
                <text x={tx} y={ty + dH + 28} textAnchor="middle" fontSize="10" fontWeight="700" fill="hsl(var(--muted-foreground))">m³</text>
              </g>
            );
          })()}
        </g>

        {/* Energy Meter removed — WTP-KW not installed */}

        {/* ═══ FLOW DIRECTION ARROWS ═══ */}
        <g opacity="0.5">
          {[
            { ax: 160, ay: inletPipeY, rot: 0 },
            { ax: mixerX - 22, ay: processY + 114, rot: 10 },
            { ax: mixerX + mixerW + 20, ay: processY + 120, rot: 0 },
            { ax: flocX + flocW + 20, ay: processY + 120, rot: 0 },
            { ax: settleX + settleW + 20, ay: processY + 120, rot: 0 },
            { ax: filterX + filterW + 20, ay: filterOutY, rot: 0 },
          ].map((arrow, i) => (
            <g key={`arrow-${i}`} transform={`translate(${arrow.ax}, ${arrow.ay}) rotate(${arrow.rot})`}>
              <polygon points="0,-7 14,0 0,7" fill="hsl(var(--primary))" />
            </g>
          ))}
        </g>

        {/* ═══ STAGE LABELS ═══ */}
        <g>
          {[
            { sx: inletAnalyzerX + 50, sy: inletPipeY + 90, text: 'STAGE 1: RAW WATER', color: 'hsl(var(--primary))' },
            { sx: mixerX + mixerW / 2, sy: processY + mixerH + 78, text: 'STAGE 2: MIXING', color: 'hsl(280 65% 55%)' },
            { sx: flocX + flocW / 2, sy: processY + flocH + 122, text: 'STAGE 3: CLARIFLOCCULATION', color: 'hsl(35 90% 50%)' },
            { sx: settleX + settleW / 2, sy: processY + settleH + 128, text: 'STAGE 4: SEDIMENTATION', color: 'hsl(38 70% 45%)' },
            { sx: filterX + filterW / 2, sy: processY + filterH + 192, text: 'STAGE 5: FILTRATION', color: 'hsl(200 70% 45%)' },
            { sx: cwrX + cwrW / 2 + 20, sy: cwrY + cwrH + 56, text: 'STAGE 6: STORAGE', color: 'hsl(199 89% 48%)' },
            { sx: (pump1X + pump2X) / 2 + pumpW / 2, sy: pumpRowY + pumpH + 6, text: 'STAGE 7: PUMPING', color: 'hsl(var(--warning))' },
            { sx: totalizerX, sy: mergeY + 185, text: 'STAGE 8: DISTRIBUTION', color: 'hsl(142 71% 45%)' },
          ].map((stage, i) => {
            const boxWidth = stage.text.length * 6 + 36;
            return (
              <g key={`stage-${i}`}>
                <rect x={stage.sx - boxWidth / 2} y={stage.sy - 12} width={boxWidth} height={20} rx={10} fill={stage.color} />
                <text x={stage.sx} y={stage.sy + 2} textAnchor="middle" fontSize="9" fontWeight="900"
                  fill="white" letterSpacing="1px">
                  {stage.text}
                </text>
              </g>
            );
          })}
        </g>

      </svg>
    </div>
  );
};

export default WtpProcessSimulation;
