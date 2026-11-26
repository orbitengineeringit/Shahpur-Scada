import React, { useMemo } from 'react';

interface CombinedPtGaugeProps {
  value: number;
  pt1Value: number;
  pt2Value: number;
  pump1Running: boolean;
  pump2Running: boolean;
  min: number;
  max: number;
  unit: string;
  size?: number;
}

const CombinedPtGauge: React.FC<CombinedPtGaugeProps> = ({
  value, pt1Value, pt2Value, pump1Running, pump2Running, min, max, unit, size = 140,
}) => {
  const bothRunning = pump1Running && pump2Running;
  const singleRunning = (pump1Running || pump2Running) && !bothRunning;

  const pumpLabel = useMemo(() => {
    if (bothRunning) return 'Combined (P1 + P2)';
    if (pump1Running) return 'Pump 1 Only';
    if (pump2Running) return 'Pump 2 Only';
    return 'No Pump Active';
  }, [pump1Running, pump2Running, bothRunning]);

  const percentage = useMemo(() => {
    return Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
  }, [value, min, max]);

  const needleAngle = useMemo(() => {
    return -135 + (percentage / 100) * 270;
  }, [percentage]);

  const getColor = () => {
    if (percentage > 85) return 'hsl(var(--destructive))';
    if (percentage > 65) return 'hsl(var(--warning))';
    return 'hsl(var(--primary))';
  };

  const getAccentColor = () => {
    if (bothRunning) return 'hsl(180 70% 50%)';
    if (singleRunning) return 'hsl(var(--primary))';
    return 'hsl(var(--muted-foreground))';
  };

  const r = size / 2 - 10;
  const cx = size / 2;
  const cy = size / 2;
  const needleLen = r - 18;

  const createArc = (startDeg: number, endDeg: number) => {
    const startRad = (startDeg - 90) * Math.PI / 180;
    const endRad = (endDeg - 90) * Math.PI / 180;
    const x1 = cx + r * Math.cos(startRad);
    const y1 = cy + r * Math.sin(startRad);
    const x2 = cx + r * Math.cos(endRad);
    const y2 = cy + r * Math.sin(endRad);
    const largeArc = endDeg - startDeg > 180 ? 1 : 0;
    return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`;
  };

  const glowId = `combined-gauge-glow`;
  const gradId = `combined-gauge-grad`;
  const showActiveArc = percentage > 2;

  return (
    <div className="flex flex-col items-center w-full">
      <svg width="100%" viewBox={`0 0 ${size} ${size * 0.88}`} style={{ maxWidth: `${size + 80}px` }}>
        <defs>
          <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%" filterUnits="objectBoundingBox">
            <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
          <radialGradient id={`hub-${gradId}`}>
            <stop offset="0%" stopColor={getColor()} />
            <stop offset="100%" stopColor={getColor()} stopOpacity="0.5" />
          </radialGradient>
        </defs>

        {/* Outer decorative ring */}
        <circle
          cx={cx} cy={cy} r={r + 6}
          fill="none" stroke={getAccentColor()}
          strokeWidth={bothRunning ? 1.5 : 0.5}
          strokeDasharray={bothRunning ? 'none' : '3 5'}
          opacity={bothRunning ? 0.4 : 0.15}
        >
          {bothRunning && (
            <animate attributeName="opacity" values="0.25;0.5;0.25" dur="2s" repeatCount="indefinite" />
          )}
        </circle>

        {/* Background arc */}
        <path d={createArc(-135, 135)} fill="none" stroke="hsl(var(--border))" strokeWidth={8} strokeLinecap="round" />
        {/* Zone arcs */}
        <path d={createArc(-135, -135 + 270 * 0.65)} fill="none" stroke="hsl(var(--primary) / 0.35)" strokeWidth={8} strokeLinecap="round" />
        <path d={createArc(-135 + 270 * 0.65, -135 + 270 * 0.85)} fill="none" stroke="hsl(var(--warning) / 0.4)" strokeWidth={8} strokeLinecap="round" />
        <path d={createArc(-135 + 270 * 0.85, 135)} fill="none" stroke="hsl(var(--destructive) / 0.4)" strokeWidth={8} strokeLinecap="round" />

        {/* Active value arc */}
        {showActiveArc && (
          <path
            d={createArc(-135, -135 + 270 * (percentage / 100))}
            fill="none" stroke={getColor()} strokeWidth={9} strokeLinecap="round"
            filter={`url(#${glowId})`}
          />
        )}

        {/* Tick marks */}
        {Array.from({ length: 11 }, (_, i) => i).map(i => {
          const pct = (i / 10) * 100;
          const angle = (-135 + 270 * (pct / 100) - 90) * Math.PI / 180;
          const innerR = r - 12;
          const outerR = r - 5;
          const labelR = r - 22;
          const tickValue = min + (i / 10) * (max - min);
          const isMajor = i % 2 === 0;
          return (
            <g key={i}>
              <line
                x1={cx + (isMajor ? innerR : innerR + 4) * Math.cos(angle)}
                y1={cy + (isMajor ? innerR : innerR + 4) * Math.sin(angle)}
                x2={cx + outerR * Math.cos(angle)}
                y2={cy + outerR * Math.sin(angle)}
                stroke="hsl(var(--muted-foreground))"
                strokeWidth={isMajor ? 1.5 : 0.8}
              />
              {isMajor && (
                <text
                  x={cx + labelR * Math.cos(angle)}
                  y={cy + labelR * Math.sin(angle)}
                  textAnchor="middle" dominantBaseline="central"
                  className="fill-foreground"
                  style={{ fontSize: '9px', fontWeight: 700 }}
                >
                  {Number.isInteger(tickValue) ? tickValue : tickValue.toFixed(1)}
                </text>
              )}
            </g>
          );
        })}

        {/* Center hub */}
        <circle cx={cx} cy={cy} r={8} fill={`url(#hub-${gradId})`} />
        <circle cx={cx} cy={cy} r={4} fill={getColor()} opacity={0.85} />

        {/* Needle — smooth rotate transition */}
        <line
          x1={0} y1={0} x2={0} y2={-needleLen}
          stroke={getColor()} strokeWidth={3} strokeLinecap="round"
          style={{
            transform: `translate(${cx}px, ${cy}px) rotate(${needleAngle}deg)`,
            transition: 'transform 1s cubic-bezier(0.4, 0, 0.2, 1)',
            filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.35))',
          }}
        />

        {/* Needle tip dot */}
        {percentage > 1 && (
          <circle
            r={4} fill={getColor()} opacity={0.5}
            style={{
              transform: `translate(${cx}px, ${cy}px) rotate(${needleAngle}deg) translateY(${-needleLen}px)`,
              transition: 'transform 1s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          />
        )}

        {/* Value text */}
        <text x={cx} y={cy + 42} textAnchor="middle" className="fill-foreground font-mono font-bold" style={{ fontSize: '16px' }}>
          {value.toFixed(2)}
        </text>
        <text x={cx} y={cy + 56} textAnchor="middle" className="fill-muted-foreground" style={{ fontSize: '10px' }}>
          {unit}
        </text>
      </svg>

      {/* Pump status indicator */}
      <div className="flex flex-col items-center gap-1.5 mt-3">
        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold tracking-wide ${
          bothRunning
            ? 'bg-cyan-500/15 text-cyan-500 ring-1 ring-cyan-500/30'
            : singleRunning
              ? 'bg-primary/15 text-primary ring-1 ring-primary/20'
              : 'bg-muted text-muted-foreground ring-1 ring-border'
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${
            bothRunning ? 'bg-cyan-500 animate-pulse' : singleRunning ? 'bg-primary animate-pulse' : 'bg-muted-foreground'
          }`} />
          {pumpLabel}
        </div>

        {(singleRunning || bothRunning) && (
          <div className="flex items-center gap-3 text-[9px] text-muted-foreground">
            <span className={pump1Running ? 'text-foreground font-medium' : 'opacity-50'}>
              PT1: {pt1Value.toFixed(2)}
            </span>
            <span className="text-border">|</span>
            <span className={pump2Running ? 'text-foreground font-medium' : 'opacity-50'}>
              PT2: {pt2Value.toFixed(2)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default CombinedPtGauge;
