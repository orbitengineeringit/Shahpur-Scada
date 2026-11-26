import React, { useMemo } from 'react';

interface OhtLevelTankProps {
  value: number;
  min: number;
  max: number;
  unit: string;
}

/**
 * OHT Level Tank — realistic elevated Intze overhead water tank
 * Features: dome top, cylindrical body, conical bottom, balcony/walkway,
 * slanted trestle columns, cross-bracings, side level gauge,
 * water wave animation, and robust theme-compatible SVGs.
 */
const OhtLevelTank: React.FC<OhtLevelTankProps> = ({ value, min, max, unit }) => {
  const percentage = useMemo(() => {
    return Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
  }, [value, min, max]);

  // Water is ALWAYS water-colored (blue), status color only for gauge/badge
  const waterColor = { main: 'hsl(199 85% 48%)', light: 'hsl(199 85% 60%)', surface: 'hsl(199 85% 65%)' };

  // Status color for side gauge bar only
  const statusColor = useMemo(() => {
    if (percentage >= 70) return 'hsl(var(--success))';
    if (percentage >= 40) return 'hsl(var(--warning))';
    return 'hsl(var(--destructive))';
  }, [percentage]);

  const statusText = percentage >= 70 ? 'GOOD' : percentage >= 40 ? 'MEDIUM' : percentage > 0 ? 'LOW' : 'EMPTY';

  // Tank geometric params
  const tankTop = 24;
  const tankBottom = 76;
  const tankHeight = tankBottom - tankTop;
  const waterHeight = (percentage / 100) * tankHeight;
  const waterTop = tankBottom - waterHeight;
  
  const tankLeft = 10;
  const tankRight = 70;
  const tankWidth = tankRight - tankLeft;
  const cx = (tankLeft + tankRight) / 2;

  // Side gauge dimensions
  const gaugeX = 84;
  const gaugeTop = tankTop + 4;
  const gaugeBottom = tankBottom - 10;

  return (
    <div className="flex flex-col items-center gap-0.5">
      <svg width="100%" viewBox="0 0 110 135" className="drop-shadow-md max-w-[260px]">
        <defs>
          {/* Tank body metallic gradient */}
          <linearGradient id="oht-tank-body" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="hsl(var(--muted-foreground))" stopOpacity="0.25" />
            <stop offset="20%" stopColor="hsl(var(--muted-foreground))" stopOpacity="0.08" />
            <stop offset="60%" stopColor="hsl(var(--muted-foreground))" stopOpacity="0.05" />
            <stop offset="90%" stopColor="hsl(var(--muted-foreground))" stopOpacity="0.15" />
            <stop offset="100%" stopColor="hsl(var(--muted-foreground))" stopOpacity="0.3" />
          </linearGradient>
          {/* Water gradient */}
          <linearGradient id="oht-water-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={waterColor.light} stopOpacity="0.75" />
            <stop offset="100%" stopColor={waterColor.main} stopOpacity="0.95" />
          </linearGradient>
          {/* Dome gradient */}
          <radialGradient id="oht-dome-grad" cx="0.5" cy="1" r="0.8">
            <stop offset="0%" stopColor="hsl(var(--muted-foreground))" stopOpacity="0.05" />
            <stop offset="100%" stopColor="hsl(var(--muted-foreground))" stopOpacity="0.2" />
          </radialGradient>
          {/* Water shimmer */}
          <linearGradient id="oht-shimmer" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="white" stopOpacity="0" />
            <stop offset="50%" stopColor="white" stopOpacity="0.15" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </linearGradient>
          {/* Gauge tube gradient */}
          <linearGradient id="oht-gauge-tube" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="hsl(var(--border))" />
            <stop offset="30%" stopColor="hsl(var(--card))" />
            <stop offset="70%" stopColor="hsl(var(--card))" />
            <stop offset="100%" stopColor="hsl(var(--border))" />
          </linearGradient>
        </defs>

        {/* ===== INTZE OHT DESIGN ===== */}
        
        {/* === TOP DOME === */}
        <ellipse cx={cx} cy={tankTop} rx={tankWidth / 2} ry="8"
          fill="url(#oht-dome-grad)" stroke="hsl(var(--border))" strokeWidth="1" />
        {/* Vent / Lightning Arrestor */}
        <rect x={cx - 1.5} y={tankTop - 14} width="3" height="10" rx="1" fill="hsl(var(--muted))" stroke="hsl(var(--border))" strokeWidth="0.8" />
        <circle cx={cx} cy={tankTop - 15} r="2" fill="hsl(var(--muted-foreground))" />

        {/* === CYLINDRICAL BODY === */}
        {/* Back of water if transparent */}
        <rect x={tankLeft} y={tankTop} width={tankWidth} height={tankHeight} fill="url(#oht-tank-body)" />
        
        {/* === WATER INSIDE === */}
        {percentage > 0 && (
          <g>
            {/* Water body in cylinder */}
            <rect x={tankLeft + 1} y={waterTop} width={tankWidth - 2} height={waterHeight} fill="url(#oht-water-grad)" />

            {/* Surface wave animation */}
            <svg x={tankLeft + 1} y={waterTop - 2} width={tankWidth - 2} height="5" viewBox={`0 0 ${tankWidth - 2} 5`} preserveAspectRatio="none">
              <path
                d={`M0 2.5 Q${(tankWidth-2)*0.125} 0.5 ${(tankWidth-2)*0.25} 2.5 T${(tankWidth-2)*0.5} 2.5 T${(tankWidth-2)*0.75} 2.5 T${tankWidth-2} 2.5 L${tankWidth-2} 5 L0 5 Z`}
                fill={waterColor.surface} opacity="0.6"
              >
                <animate attributeName="d" dur="3s" repeatCount="indefinite"
                  values={`M0 2.5 Q${(tankWidth-2)*0.125} 0.5 ${(tankWidth-2)*0.25} 2.5 T${(tankWidth-2)*0.5} 2.5 T${(tankWidth-2)*0.75} 2.5 T${tankWidth-2} 2.5 L${tankWidth-2} 5 L0 5 Z;
                           M0 2.5 Q${(tankWidth-2)*0.125} 4.5 ${(tankWidth-2)*0.25} 2.5 T${(tankWidth-2)*0.5} 2.5 T${(tankWidth-2)*0.75} 2.5 T${tankWidth-2} 2.5 L${tankWidth-2} 5 L0 5 Z;
                           M0 2.5 Q${(tankWidth-2)*0.125} 0.5 ${(tankWidth-2)*0.25} 2.5 T${(tankWidth-2)*0.5} 2.5 T${(tankWidth-2)*0.75} 2.5 T${tankWidth-2} 2.5 L${tankWidth-2} 5 L0 5 Z`}
                />
              </path>
            </svg>

            {/* Shimmer reflection */}
            <rect x={tankLeft + tankWidth * 0.15} y={waterTop + 2} width={tankWidth * 0.3} height={Math.max(waterHeight - 2, 1)} rx="2"
              fill="url(#oht-shimmer)" opacity="0.4">
              <animate attributeName="x" values={`${tankLeft+tankWidth*0.1};${tankLeft+tankWidth*0.5};${tankLeft+tankWidth*0.1}`} dur="5s" repeatCount="indefinite" />
            </rect>
          </g>
        )}

        {/* Left/Right Cylinder Outlines */}
        <line x1={tankLeft} y1={tankTop} x2={tankLeft} y2={tankBottom} stroke="hsl(var(--border))" strokeWidth="1.2" />
        <line x1={tankRight} y1={tankTop} x2={tankRight} y2={tankBottom} stroke="hsl(var(--border))" strokeWidth="1.2" />

        {/* Panel lines / Ribs */}
        {[0.25, 0.5, 0.75].map(frac => {
           const y = tankTop + frac * tankHeight;
           return <line key={frac} x1={tankLeft} y1={y} x2={tankRight} y2={y} stroke="hsl(var(--muted-foreground))" strokeOpacity="0.1" strokeWidth="0.8" />;
        })}

        {/* === CONICAL BOTTOM === */}
        {/* Draw the Intze conical skirt mapping from tank dia to shaft/leg dia */}
        <path d={`M ${tankLeft} ${tankBottom} L ${cx - 16} ${tankBottom + 12} L ${cx + 16} ${tankBottom + 12} L ${tankRight} ${tankBottom} Z`}
          fill="url(#oht-tank-body)" stroke="hsl(var(--border))" strokeWidth="1.2" />
        {/* Water inside bottom cone (drawn statically full if water is > 0) */}
        {percentage > 0 && (
          <path d={`M ${tankLeft+1.5} ${tankBottom} L ${cx - 15} ${tankBottom + 11} L ${cx + 15} ${tankBottom + 11} L ${tankRight-1.5} ${tankBottom} Z`}
            fill="url(#oht-water-grad)" opacity="0.9" />
        )}
        
        {/* === LOWER DOME / RING BEAM === */}
        <ellipse cx={cx} cy={tankBottom + 12} rx="16" ry="4" fill="hsl(var(--card))" stroke="hsl(var(--border))" strokeWidth="1.2" />
        <rect x={cx - 16} y={tankBottom + 12} width="32" height="2" fill="hsl(var(--muted))" />

        {/* === WALKWAY / BALCONY AROUND CYLINDER BASE === */}
        <rect x={tankLeft - 4} y={tankBottom - 1.5} width={tankWidth + 8} height="3" rx="1.5"
          fill="hsl(var(--muted))" stroke="hsl(var(--border))" strokeWidth="1" />
        {/* Railing Handrail */}
        <line x1={tankLeft - 4} y1={tankBottom - 6} x2={tankRight + 4} y2={tankBottom - 6} stroke="hsl(var(--border))" strokeWidth="0.8" />
        <line x1={tankLeft - 4} y1={tankBottom - 4.5} x2={tankRight + 4} y2={tankBottom - 4.5} stroke="hsl(var(--muted-foreground))" strokeOpacity="0.5" strokeWidth="0.4" />
        {/* Railing Posts */}
        {[
          tankLeft - 3, tankLeft + 5, tankLeft + 15, tankLeft + 25, 
          cx, tankRight - 25, tankRight - 15, tankRight - 5, tankRight + 3
        ].map(px => (
          <line key={px} x1={px} y1={tankBottom - 6} x2={px} y2={tankBottom - 1.5} stroke="hsl(var(--border))" strokeWidth="0.8" />
        ))}

        {/* === TRESTLE COLUMNS (LEGS) === */}
        {/* Central Shaft / Outlet Pipe (Wider) */}
        <rect x={cx - 7} y={tankBottom + 14} width="14" height="34" fill="hsl(var(--card))" stroke="hsl(var(--border))" strokeWidth="1" />
        <rect x={cx - 6} y={tankBottom + 14} width="3" height="34" fill="hsl(var(--muted-foreground))" fillOpacity="0.1" />

        {/* Rear slanted legs (slightly darker/thinner for depth) */}
        <line x1={cx - 9} y1={tankBottom + 14} x2={cx - 13} y2="122" stroke="hsl(var(--muted-foreground))" strokeOpacity="0.25" strokeWidth="2.5" strokeLinecap="round" />
        <line x1={cx + 9} y1={tankBottom + 14} x2={cx + 13} y2="122" stroke="hsl(var(--muted-foreground))" strokeOpacity="0.25" strokeWidth="2.5" strokeLinecap="round" />

        {/* Outer slanted legs (front left) */}
        <line x1={cx - 15} y1={tankBottom + 14} x2={cx - 22} y2="124" stroke="hsl(var(--muted-foreground))" strokeOpacity="0.6" strokeWidth="3.5" strokeLinecap="round" />
        <line x1={cx - 15} y1={tankBottom + 14} x2={cx - 22} y2="124" stroke="hsl(var(--muted))" strokeWidth="1.5" strokeLinecap="round" />
        
        {/* Outer slanted legs (front right) */}
        <line x1={cx + 15} y1={tankBottom + 14} x2={cx + 22} y2="124" stroke="hsl(var(--muted-foreground))" strokeOpacity="0.6" strokeWidth="3.5" strokeLinecap="round" />
        <line x1={cx + 15} y1={tankBottom + 14} x2={cx + 22} y2="124" stroke="hsl(var(--muted))" strokeWidth="1.5" strokeLinecap="round" />



        {/* Cross bracings (Ties) */}
        {[tankBottom + 22, tankBottom + 32, tankBottom + 42].map((y, i) => {
          const widthAtY = 28 + i * 5;
          return (
            <g key={y}>
              <line x1={cx - widthAtY/2} y1={y} x2={cx + widthAtY/2} y2={y} stroke="hsl(var(--muted-foreground))" strokeOpacity="0.4" strokeWidth="2" strokeLinecap="round" />
            </g>
          );
        })}

        {/* Ladder going up center pipe exterior */}
        <g stroke="hsl(var(--muted-foreground))" strokeOpacity="0.6" strokeWidth="0.8">
          <line x1={cx + 4} y1={tankBottom + 15} x2={cx + 4} y2="124" />
          <line x1={cx + 7} y1={tankBottom + 15} x2={cx + 7} y2="124" />
          {[16, 20, 24, 28, 32, 36, 40, 44, 48].map(offset => (
             <line key={offset} x1={cx + 4} y1={tankBottom + offset} x2={cx + 7} y2={tankBottom + offset} />
          ))}
        </g>

        {/* Foundation */}
        <rect x={cx - 22} y="124" width="44" height="4" rx="1.5" fill="hsl(var(--muted))" stroke="hsl(var(--border))" strokeWidth="1" />
        <path d={`M ${cx - 20} 124 L ${cx - 15} 120 L ${cx + 15} 120 L ${cx + 20} 124 Z`} fill="hsl(var(--muted))" stroke="hsl(var(--border))" strokeWidth="1" />

        {/* ===== SIDE LEVEL GAUGE ===== */}
        {/* Bottom connection attached to tank body */}
        <rect x={gaugeX - 2} y={gaugeBottom - 2} width="8" height="5" rx="1"
          fill="hsl(var(--muted))" stroke="hsl(var(--border))" strokeWidth="0.6" />
        <line x1={tankRight} y1={gaugeBottom} x2={gaugeX - 2} y2={gaugeBottom}
          stroke="hsl(var(--muted-foreground))" strokeOpacity="0.4" strokeWidth="1.5" />

        {/* Top connection */}
        <rect x={gaugeX - 2} y={gaugeTop - 2} width="8" height="5" rx="1"
          fill="hsl(var(--muted))" stroke="hsl(var(--border))" strokeWidth="0.6" />
        <line x1={tankRight} y1={gaugeTop + 1} x2={gaugeX - 2} y2={gaugeTop + 1}
          stroke="hsl(var(--muted-foreground))" strokeOpacity="0.4" strokeWidth="1.5" />

        {/* Gauge tube glass */}
        <rect x={gaugeX} y={gaugeTop + 3} width="6" height={gaugeBottom - gaugeTop - 5} rx="2"
          fill="url(#oht-gauge-tube)" stroke="hsl(var(--border))" strokeWidth="0.6" />

        {/* Water inside gauge */}
        {percentage > 0 && (
          <rect x={gaugeX + 1} y={gaugeBottom - 3 - (percentage / 100) * (gaugeBottom - gaugeTop - 6)}
            width="4"
            height={(percentage / 100) * (gaugeBottom - gaugeTop - 6)}
            rx="1.5"
            fill={statusColor} opacity="0.85"
            className="transition-all duration-700 ease-out"
          />
        )}

        {/* Scale marks */}
        {[0, 25, 50, 75, 100].map(pct => {
          const y = gaugeBottom - 3 - (pct / 100) * (gaugeBottom - gaugeTop - 6);
          return (
            <g key={pct}>
              <line x1={gaugeX + 6} y1={y} x2={gaugeX + 9} y2={y}
                stroke="hsl(var(--muted-foreground))" strokeOpacity="0.5" strokeWidth="0.6" />
              <text x={gaugeX + 11} y={y + 1.5} textAnchor="start"
                className="fill-muted-foreground"
                style={{ fontSize: '5px', fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>
                {pct}%
              </text>
            </g>
          );
        })}

        {/* ===== DIGITAL VALUE DISPLAY BOX ===== */}
        {/* Floating panel attached to cylinder */}
        <rect x={cx - 19} y={tankTop + 18} width="38" height="22" rx="3"
          fill="hsl(var(--secondary))" stroke="hsl(var(--border))" strokeWidth="0.8" />
        <rect x={cx - 17} y={tankTop + 20} width="34" height="18" rx="2"
          fill="hsl(var(--background))" />
        
        {/* Label */}
        <text x={cx} y={tankTop + 26} textAnchor="middle"
          fill="hsl(var(--muted-foreground))"
          style={{ fontSize: '4.5px', fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace", letterSpacing: '0.5px' }}>
          {unit}
        </text>

        {/* LCD Value */}
        <text x={cx} y={tankTop + 36} textAnchor="middle"
          fill={statusColor}
          style={{ fontSize: '13px', fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace", fontWeight: 700 }}>
          {value.toFixed(2)}
        </text>

        {/* ===== STATUS PILL AT BOTTOM ===== */}
        <rect x={cx - 18} y="128" width="36" height="7" rx="2"
          fill={statusColor} fillOpacity="0.1" />
        <text x={cx} y="133.5" textAnchor="middle"
          fill={statusColor}
          style={{ fontSize: '5px', fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace", fontWeight: 700 }}>
          {statusText} • {percentage.toFixed(0)}%
        </text>

      </svg>
    </div>
  );
};

export default OhtLevelTank;

