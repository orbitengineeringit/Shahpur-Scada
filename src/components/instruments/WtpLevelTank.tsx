import React, { useMemo } from 'react';

interface WtpLevelTankProps {
  value: number;
  min: number;
  max: number;
  unit: string;
  variant: 'backwash' | 'clearwater';
}

/**
 * WTP Level Tank — realistic rectangular water storage tank
 * Two variants:
 *   - backwash:   slightly murky/yellowish water
 *   - clearwater: crystal-clear transparent blue water (treated)
 *
 * Features: rectangular concrete/steel tank body, water level with
 * wave animation, side level gauge, inlet/outlet pipes, LCD readout
 */
const WtpLevelTank: React.FC<WtpLevelTankProps> = ({ value, min, max, unit, variant }) => {
  const percentage = useMemo(() => {
    return Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
  }, [value, min, max]);

  const isClearWater = variant === 'clearwater';

  // Water colors per variant
  const waterColors = useMemo(() => {
    if (isClearWater) {
      return {
        body: 'hsl(200 75% 70% / 0.35)',
        bodyDeep: 'hsl(200 80% 55% / 0.55)',
        surface: 'hsl(195 90% 80% / 0.45)',
        shimmer: 'hsl(200 90% 90% / 0.25)',
        accent: 'hsl(200 80% 60%)',
      };
    }
    // Backwash — clean water but slightly less clear than treated clear water
    // Light blue-green tones with a touch of sediment
    return {
      body: 'hsl(180 45% 60% / 0.3)',
      bodyDeep: 'hsl(175 40% 48% / 0.5)',
      surface: 'hsl(185 50% 70% / 0.4)',
      shimmer: 'hsl(180 45% 75% / 0.2)',
      accent: 'hsl(180 45% 55%)',
    };
  }, [isClearWater]);

  const statusText = percentage >= 70 ? 'GOOD' : percentage >= 40 ? 'MEDIUM' : percentage > 0 ? 'LOW' : 'EMPTY';
  const statusColor = percentage >= 70 ? 'hsl(var(--success))' : percentage >= 40 ? 'hsl(var(--warning))' : 'hsl(var(--destructive))';

  // Tank geometry — CWT is bigger than Backwash in real WTP
  const tankLeft = isClearWater ? 6 : 10;
  const tankRight = isClearWater ? 78 : 72;
  const tankTop = isClearWater ? 16 : 18;
  const tankBottom = isClearWater ? 96 : 92;
  const tankWidth = tankRight - tankLeft;
  const tankHeight = tankBottom - tankTop;
  const waterHeight = (percentage / 100) * tankHeight;
  const waterTop = tankBottom - waterHeight;

  // Side gauge
  const gaugeX = isClearWater ? 84 : 78;

  return (
    <div className="flex flex-col items-center gap-0.5">
      <svg width="100%" viewBox={isClearWater ? '0 0 115 130' : '0 0 105 125'} className={`drop-shadow-md ${isClearWater ? 'max-w-[260px]' : 'max-w-[220px]'}`}>
        <defs>
          {/* Tank wall gradient — concrete/steel look */}
          <linearGradient id={`wtp-tank-wall-${variant}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="hsl(var(--muted-foreground))" stopOpacity="0.18" />
            <stop offset="15%" stopColor="hsl(var(--muted-foreground))" stopOpacity="0.06" />
            <stop offset="85%" stopColor="hsl(var(--muted-foreground))" stopOpacity="0.06" />
            <stop offset="100%" stopColor="hsl(var(--muted-foreground))" stopOpacity="0.18" />
          </linearGradient>
          {/* Water gradient */}
          <linearGradient id={`wtp-water-${variant}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={waterColors.body} />
            <stop offset="100%" stopColor={waterColors.bodyDeep} />
          </linearGradient>
          {/* Clear water — extra transparency layer */}
          {isClearWater && (
            <linearGradient id="wtp-cw-glass" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(200 90% 90%)" stopOpacity="0.08" />
              <stop offset="50%" stopColor="hsl(200 85% 80%)" stopOpacity="0.12" />
              <stop offset="100%" stopColor="hsl(200 80% 70%)" stopOpacity="0.06" />
            </linearGradient>
          )}
          {/* Gauge tube */}
          <linearGradient id={`wtp-gauge-${variant}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="hsl(var(--border))" />
            <stop offset="50%" stopColor="hsl(var(--card))" />
            <stop offset="100%" stopColor="hsl(var(--border))" />
          </linearGradient>
        </defs>

        {/* ===== TANK LABEL ===== */}
        <text x="41" y="11" textAnchor="middle"
          className="fill-muted-foreground"
          style={{ fontSize: '5px', fontFamily: "'Inter', sans-serif", fontWeight: 600, letterSpacing: '0.8px' }}>
          {isClearWater ? 'CLEAR WATER TANK' : 'BACKWASH TANK'}
        </text>

        {/* ===== RECTANGULAR TANK BODY ===== */}
        {/* Tank walls */}
        <rect x={tankLeft} y={tankTop} width={tankWidth} height={tankHeight}
          fill={`url(#wtp-tank-wall-${variant})`}
          stroke="hsl(var(--border))" strokeWidth="1.5" rx="2" />

        {/* Inner wall shading */}
        <rect x={tankLeft + 1.5} y={tankTop + 1.5}
          width={tankWidth - 3} height={tankHeight - 3}
          fill="none" stroke="hsl(var(--muted-foreground))" strokeOpacity="0.06" strokeWidth="0.5" rx="1" />

        {/* Wall texture — horizontal concrete lines */}
        {[0.2, 0.4, 0.6, 0.8].map(frac => {
          const y = tankTop + frac * tankHeight;
          return (
            <line key={frac} x1={tankLeft + 2} y1={y} x2={tankRight - 2} y2={y}
              stroke="hsl(var(--muted-foreground))" strokeOpacity="0.06" strokeWidth="0.4" />
          );
        })}

        {/* Corner bolts */}
        {[
          [tankLeft + 4, tankTop + 4],
          [tankRight - 4, tankTop + 4],
          [tankLeft + 4, tankBottom - 4],
          [tankRight - 4, tankBottom - 4],
        ].map(([cx, cy], i) => (
          <circle key={i} cx={cx} cy={cy} r="2"
            fill="hsl(var(--muted))" stroke="hsl(var(--border))" strokeWidth="0.4" />
        ))}

        {/* ===== WATER INSIDE TANK ===== */}
        {percentage > 0 && (
          <g>
            {/* Water body */}
            <rect x={tankLeft + 2} y={waterTop}
              width={tankWidth - 4} height={waterHeight - 2}
              fill={`url(#wtp-water-${variant})`} rx="1" />

            {/* Clear water: extra glass/transparency effect */}
            {isClearWater && (
              <rect x={tankLeft + 2} y={waterTop}
                width={tankWidth - 4} height={waterHeight - 2}
                fill="url(#wtp-cw-glass)" rx="1" />
            )}

            {/* Water surface wave */}
            <svg x={tankLeft + 2} y={waterTop - 3}
              width={tankWidth - 4} height="6"
              viewBox={`0 0 ${tankWidth - 4} 6`} preserveAspectRatio="none">
              <path
                d={`M0 3 Q${(tankWidth - 4) * 0.125} 0.8 ${(tankWidth - 4) * 0.25} 3 Q${(tankWidth - 4) * 0.375} 5.2 ${(tankWidth - 4) * 0.5} 3 Q${(tankWidth - 4) * 0.625} 0.8 ${(tankWidth - 4) * 0.75} 3 Q${(tankWidth - 4) * 0.875} 5.2 ${tankWidth - 4} 3 L${tankWidth - 4} 6 L0 6 Z`}
                fill={waterColors.surface}
              >
                <animate attributeName="opacity" values="0.6;1;0.6" dur="2.5s" repeatCount="indefinite" />
              </path>
            </svg>

            {/* Shimmer / light reflection */}
            <rect x={tankLeft + 8} y={waterTop + 4}
              width="14" height={Math.max(waterHeight - 8, 2)} rx="2"
              fill={waterColors.shimmer} opacity="0.5">
              <animate attributeName="x" values={`${tankLeft + 6};${tankRight - 22};${tankLeft + 6}`}
                dur="5s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.3;0.6;0.3" dur="5s" repeatCount="indefinite" />
            </rect>

            {/* Clear water sparkle dots */}
            {isClearWater && percentage > 20 && (
              <g>
                {[
                  [tankLeft + 18, waterTop + waterHeight * 0.3],
                  [tankLeft + 35, waterTop + waterHeight * 0.5],
                  [tankLeft + 50, waterTop + waterHeight * 0.25],
                  [tankLeft + 28, waterTop + waterHeight * 0.7],
                ].map(([sx, sy], i) => (
                  <circle key={i} cx={sx} cy={sy} r="1" fill="white" opacity="0.3">
                    <animate attributeName="opacity" values="0.1;0.4;0.1"
                      dur={`${1.5 + i * 0.4}s`} begin={`${i * 0.3}s`} repeatCount="indefinite" />
                  </circle>
                ))}
              </g>
            )}
          </g>
        )}

        {/* ===== INLET PIPE (top-left) — flat edge, boundary to boundary ===== */}
        <rect x={tankLeft - 14} y={tankTop + 6} width="14" height="4" rx="0"
          fill="hsl(var(--muted))" stroke="hsl(var(--border))" strokeWidth="0.6" />

        {/* ===== OUTLET PIPE (bottom-right) — flat edge, boundary to boundary ===== */}
        <rect x={tankRight} y={tankBottom - 10} width="14" height="4" rx="0"
          fill="hsl(var(--muted))" stroke="hsl(var(--border))" strokeWidth="0.6" />

        {/* ===== TANK BASE / FOUNDATION ===== */}
        <rect x={tankLeft - 3} y={tankBottom} width={tankWidth + 6} height="5" rx="1.5"
          fill="hsl(var(--muted))" fillOpacity="0.6" stroke="hsl(var(--border))" strokeWidth="0.8" />
        {/* Base pads */}
        <rect x={tankLeft - 5} y={tankBottom + 4} width={tankWidth + 10} height="3" rx="1"
          fill="hsl(var(--muted))" fillOpacity="0.4" stroke="hsl(var(--border))" strokeWidth="0.5" />

        {/* ===== LCD READOUT PANEL ===== */}
        <rect x="22" y="40" width="38" height="28" rx="3"
          fill="hsl(var(--secondary))" stroke="hsl(var(--border))" strokeWidth="0.8" />
        <rect x="24" y="42" width="34" height="24" rx="2"
          fill="hsl(var(--background))" />
        {/* Unit */}
        <text x="41" y="48" textAnchor="middle"
          fill="hsl(var(--muted-foreground))"
          style={{ fontSize: '5px', fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>
          {unit}
        </text>
        {/* Value */}
        <text x="41" y="60" textAnchor="middle"
          fill={statusColor}
          style={{ fontSize: '13px', fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace", fontWeight: 700 }}>
          {value.toFixed(2)}
        </text>

        {/* ===== SIDE LEVEL GAUGE ===== */}
        {/* Top connection */}
        <rect x={gaugeX - 1} y={tankTop - 1} width="8" height="4" rx="1.5"
          fill="hsl(var(--muted))" stroke="hsl(var(--border))" strokeWidth="0.5" />
        <line x1={tankRight} y1={tankTop + 1} x2={gaugeX - 1} y2={tankTop + 1}
          stroke="hsl(var(--muted-foreground))" strokeOpacity="0.35" strokeWidth="1.5" />

        {/* Bottom connection */}
        <rect x={gaugeX - 1} y={tankBottom - 3} width="8" height="4" rx="1.5"
          fill="hsl(var(--muted))" stroke="hsl(var(--border))" strokeWidth="0.5" />
        <line x1={tankRight} y1={tankBottom - 1} x2={gaugeX - 1} y2={tankBottom - 1}
          stroke="hsl(var(--muted-foreground))" strokeOpacity="0.35" strokeWidth="1.5" />

        {/* Glass gauge tube */}
        <rect x={gaugeX} y={tankTop + 3} width="6" height={tankHeight - 6} rx="2"
          fill={`url(#wtp-gauge-${variant})`} stroke="hsl(var(--border))" strokeWidth="0.5" />

        {/* Water in gauge */}
        {percentage > 0 && (
          <rect x={gaugeX + 1}
            y={tankBottom - 4 - (percentage / 100) * (tankHeight - 8)}
            width="4"
            height={(percentage / 100) * (tankHeight - 8)}
            rx="1.5"
            fill={waterColors.accent} opacity="0.7"
            className="transition-all duration-700 ease-out"
          />
        )}

        {/* Scale marks */}
        {[0, 25, 50, 75, 100].map(pct => {
          const y = tankBottom - 4 - (pct / 100) * (tankHeight - 8);
          const scaleVal = min + (pct / 100) * (max - min);
          return (
            <g key={pct}>
              <line x1={gaugeX + 6} y1={y} x2={gaugeX + 9} y2={y}
                stroke="hsl(var(--muted-foreground))" strokeOpacity="0.5" strokeWidth="0.5" />
              <text x={gaugeX + 11} y={y + 1.5} textAnchor="start"
                className="fill-muted-foreground"
                style={{ fontSize: '5px', fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>
                {Number.isInteger(scaleVal) ? scaleVal : scaleVal.toFixed(1)}
              </text>
            </g>
          );
        })}

        {/* ===== STATUS + PERCENTAGE ===== */}
        <rect x="18" y="115" width="46" height="8" rx="2.5"
          fill={statusColor} fillOpacity="0.12" />
        <text x="41" y="121" textAnchor="middle"
          fill={statusColor}
          style={{ fontSize: '5.5px', fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace", fontWeight: 700 }}>
          {statusText} • {percentage.toFixed(0)}%
        </text>
      </svg>
    </div>
  );
};

export default WtpLevelTank;
