import React, { useState, useEffect } from 'react';
import { ShahpurSensor } from '@/config/shahpurSensors';
import { useScada } from '@/contexts/ScadaContext';

interface CircularGaugeProps {
  cx: number;
  cy: number;
  r: number;
  value: number;
  min: number;
  max: number;
  label: string;
  unit: string;
}

const CircularGauge: React.FC<CircularGaugeProps> = ({ cx, cy, r, value, min, max, label, unit }) => {
  const [val, setVal] = useState(value);
  useEffect(() => { setVal(value); }, [value]);

  const pNorm = Math.max(0, Math.min(1, (val - min) / (max - min)));
  const percentage = pNorm * 100;
  const nAngle = -120 + pNorm * 240;
  const nLen = r - 12;

  const getCol = () => {
    if (percentage > 85) return 'hsl(var(--destructive))';
    if (percentage > 65) return 'hsl(var(--warning))';
    return 'hsl(var(--success))';
  };

  const arc = (s: number, e: number, radius: number) => {
    const sr = (s - 90) * (Math.PI / 180), er = (e - 90) * (Math.PI / 180);
    const x1 = cx + radius * Math.cos(sr), y1 = cy + radius * Math.sin(sr);
    const x2 = cx + radius * Math.cos(er), y2 = cy + radius * Math.sin(er);
    return `M ${x1} ${y1} A ${radius} ${radius} 0 ${e - s > 180 ? 1 : 0} 1 ${x2} ${y2}`;
  };

  const arcR = r - 8;
  const arcStroke = 6;

  return (
    <g>
      {/* Outer Metallic Case */}
      <circle cx={cx} cy={cy} r={r + 8} fill="#475569" />
      <circle cx={cx} cy={cy} r={r + 6} fill="#64748b" />
      <circle cx={cx} cy={cy} r={r + 4} fill="#334155" />

      {/* Gauge Face */}
      <circle cx={cx} cy={cy} r={r} fill="hsl(var(--card))" stroke="hsl(var(--border))" strokeWidth="2" />

      {/* Zone Arcs */}
      <path d={arc(-120, 120, arcR)} fill="none" stroke="hsl(var(--border))" strokeWidth={arcStroke} strokeLinecap="round" />
      <path d={arc(-120, -120 + 240 * 0.65, arcR)} fill="none" stroke="hsl(var(--success) / 0.3)" strokeWidth={arcStroke} strokeLinecap="round" />
      <path d={arc(-120 + 240 * 0.65, -120 + 240 * 0.85, arcR)} fill="none" stroke="hsl(var(--warning) / 0.4)" strokeWidth={arcStroke} strokeLinecap="round" />
      <path d={arc(-120 + 240 * 0.85, 120, arcR)} fill="none" stroke="hsl(var(--destructive) / 0.4)" strokeWidth={arcStroke} strokeLinecap="round" />

      {/* Active Value Arc */}
      {percentage > 2 && (
        <path d={arc(-120, nAngle, arcR)} fill="none" stroke={getCol()} strokeWidth={arcStroke + 2} strokeLinecap="round" />
      )}

      {/* Ticks & Labels */}
      {Array.from({ length: 6 }).map((_, i) => {
        const tickVal = min + (i / 5) * (max - min);
        const tickAngle = -120 + (i / 5) * 240;
        const rad = (tickAngle - 90) * (Math.PI / 180);
        const x1 = cx + (r - 12) * Math.cos(rad);
        const y1 = cy + (r - 12) * Math.sin(rad);
        const x2 = cx + (r - 4) * Math.cos(rad);
        const y2 = cy + (r - 4) * Math.sin(rad);
        return (
          <g key={i}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="hsl(var(--muted-foreground))" strokeWidth={r > 45 ? "2" : "1.5"} />
            <text x={cx + (r - (r > 45 ? 25 : 20)) * Math.cos(rad)} y={cy + (r - (r > 45 ? 25 : 20)) * Math.sin(rad) + 5} fontSize={r > 45 ? "11" : "9"} textAnchor="middle" fill="hsl(var(--muted-foreground))" fontWeight="800">
              {tickVal.toFixed(0)}
            </text>
          </g>
        );
      })}

      {/* Needle */}
      <g transform={`rotate(${nAngle}, ${cx}, ${cy})`}>
        <line x1={cx} y1={cy} x2={cx} y2={cy - nLen} stroke={getCol()} strokeWidth="3" strokeLinecap="round" style={{ transition: 'all 1s ease-in-out' }} />
        <circle cx={cx} cy={cy} r="5" fill="#1e293b" />
        <circle cx={cx} cy={cy} r="2" fill={getCol()} />
      </g>

      {/* Label and Digital Display */}
      <rect x={cx - (r > 45 ? 40 : 30)} y={cy - r - (r > 45 ? 30 : 25)} width={r > 45 ? 80 : 60} height={r > 45 ? 22 : 18} rx="4" fill="hsl(var(--card))" stroke="hsl(var(--border))" strokeWidth="1" />
      <text x={cx} y={cy - r - (r > 45 ? 14 : 12)} textAnchor="middle" fontSize={r > 45 ? 12 : 10} fontWeight="900" fill="hsl(var(--foreground))" letterSpacing="0.5px text-transform uppercase">{label}</text>

      <rect x={cx - (r > 45 ? 36 : 28)} y={cy + r + 10} width={r > 45 ? 72 : 56} height={r > 45 ? 28 : 24} rx="5" fill="hsl(var(--secondary))" stroke="hsl(var(--border))" strokeWidth="1" />
      <text x={cx} y={cy + r + (r > 45 ? 30 : 27)} textAnchor="middle" fontSize={r > 45 ? 15 : 13} fontWeight="800" fill="hsl(var(--foreground))" fontFamily="ui-monospace, monospace">
        {val.toFixed(1)} <tspan fontSize={r > 45 ? 10 : 8} fill="hsl(var(--muted-foreground))">{unit}</tspan>
      </text>
    </g>
  );
};

export interface OhtProcessSimulationProps {
  sensors: ShahpurSensor[];
  tags: any[];
  config: any;
}

const OhtProcessSimulation: React.FC<OhtProcessSimulationProps> = ({ sensors, tags, config }) => {
  const { setOhtTags } = useScada();

  const ltSensor = sensors.find(s => s.instrumentType === 'lt');
  const ltTag = ltSensor ? tags.find(t => t.id === ltSensor.id) : null;
  const ltVal = ltTag?.value || 0;

  const ptSensor = sensors.find(s => s.instrumentType === 'pt');
  const ptTag = ptSensor ? tags.find(t => t.id === ptSensor.id) : null;
  const ptVal = ptTag?.value || 0;

  const flowSensor = sensors.find(s => s.instrumentType === 'flow');
  const flowTag = flowSensor ? tags.find(t => t.id === flowSensor.id) : null;
  const flowVal = flowTag?.value || 0;

  const totalizerSensor = sensors.find(s => s.instrumentType === 'totalizer');
  const totTag = totalizerSensor ? tags.find(t => t.id === totalizerSensor.id) : null;
  const totVal = totTag?.value || 0;

  const fcvTag = tags.find(t => t.id?.toLowerCase().includes('fcv'));
  const hasFcvSensor = sensors.some(s => s.instrumentType === 'fcv' && !s.notInstalled);
  const fcvVal = fcvTag?.value || 0;
  const fcvOpen = fcvVal > 0;

  const fInVal = flowVal;
  const fOutTag = tags.find(t => t.id?.toLowerCase().includes('flow_out') || t.id?.toLowerCase().includes('out'));

  const handleFcvToggle = () => {
    const fcvSensor = sensors.find(s => s.instrumentType === 'fcv');
    if (!fcvSensor) return;
    setOhtTags(prev => prev.map(t => {
      if (t.id === fcvSensor.id) {
        const newValue = t.value > 0 ? 0 : 100;
        return { ...t, value: newValue, timestamp: new Date() };
      }
      return t;
    }));
  };

  // Visual constants matching IntakeProcessSimulation
  const pBody = "hsl(220 60% 42%)";
  const pLight = "hsl(220 55% 52%)";
  const pDark = "hsl(220 65% 32%)";
  const pVDark = "hsl(220 70% 22%)";
  const pipeW = 18;

  const drawWaterFlow = (d: string, flow: number, forceShow: boolean = false) => {
    const absFlow = Math.abs(flow);
    if (!forceShow && absFlow <= 0.1) return null;
    // Normalize flow: assume 100 m3/h is max speed. Map 0-100 to 0-1 range.
    const pNorm = Math.min(1, Math.max(0.1, absFlow / 100));
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

  const drawPipe = (d: string, w: number = pipeW, round: boolean = true) => (
    <g>
      <path d={d} fill="none" stroke={pVDark} strokeWidth={w + 3} strokeLinecap={round ? "round" : "butt"} strokeLinejoin="round" />
      <path d={d} fill="none" stroke={pDark} strokeWidth={w} strokeLinecap={round ? "round" : "butt"} strokeLinejoin="round" />
      <path d={d} fill="none" stroke={pBody} strokeWidth={w * 0.65} strokeLinecap={round ? "round" : "butt"} strokeLinejoin="round" />
      <path d={d} fill="none" stroke={pLight} strokeWidth={w * 0.2} strokeLinecap={round ? "round" : "butt"} strokeLinejoin="round" opacity={0.5} />
    </g>
  );

  // SVG Coordinates - compact layout to fit viewport
  const svgW = 1600;
  const svgH = 620;

  const tcx = 920; // Shifted left to balance packed instrument spacing
  const ty = 45;
  const tw = 340;
  const th = 190;

  const pillarY = ty + th;
  const pillarH = 200;

  // Center column (shaft)
  const shaftW = 80;

  // Inlet Pipe (comes from extreme left ground, travels up to top of tank)
  const inPipeX = tcx - shaftW / 2 + 15;
  const inPipeBeforeFcv = `M 10 ${pillarY + pillarH} L 660 ${pillarY + pillarH}`;
  const inPipeAfterFcv = `M 660 ${pillarY + pillarH} L ${inPipeX} ${pillarY + pillarH} L ${inPipeX} ${ty}`;
  const outPipeX = tcx + shaftW / 2 - 15;
  const outPipePath = `M ${outPipeX} ${ty + th} L ${outPipeX} ${pillarY + pillarH} L ${svgW - 10} ${pillarY + pillarH}`;

  const waterHeight = th * Math.max(0, Math.min(1, ltVal / 100));
  const waterY = ty + th - waterHeight;

  // Color-coded status (matching OHT card logic)
  const levelPct = Math.min(100, Math.max(0, ltVal));
  const statusColor = levelPct >= 70 ? 'hsl(var(--success))' : levelPct >= 40 ? 'hsl(var(--warning))' : 'hsl(var(--destructive))';
  const statusText = levelPct >= 70 ? 'GOOD' : levelPct >= 40 ? 'MEDIUM' : levelPct > 0 ? 'LOW' : 'EMPTY';

  // Side gauge bar dimensions
  const gaugeX = tcx + tw / 2 + 30;
  const gaugeTop = ty + 5;
  const gaugeBottom = ty + th - 55;
  const gaugeH = gaugeBottom - gaugeTop;
  const gaugeFillH = (levelPct / 100) * gaugeH;

  return (
    <div className="w-full relative overflow-hidden bg-background border border-border/50 rounded-2xl p-1 md:p-3">
      {/* Blueprint Grid Background Pattern */}
      <div
        className="w-full h-full min-h-[350px]"
        style={{
          backgroundImage: 'linear-gradient(to right, hsl(var(--border)) 1px, transparent 1px), linear-gradient(to bottom, hsl(var(--border)) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
          opacity: 0.3,
          position: 'absolute',
          top: 0, left: 0, right: 0, bottom: 0,
          pointerEvents: 'none',
          zIndex: 0
        }}
      />

      <div className="w-full overflow-x-auto relative z-10 pb-8 -webkit-overflow-scrolling-touch" style={{ WebkitOverflowScrolling: 'touch' }}>
        <svg width="100%" height="auto" viewBox={`0 0 ${svgW} ${svgH}`} style={{ minWidth: '600px', maxWidth: '100%' }} preserveAspectRatio="xMidYMid meet">

          <defs>
            <linearGradient id="tank-body" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#475569" />
              <stop offset="15%" stopColor="#94a3b8" />
              <stop offset="50%" stopColor="#f8fafc" />
              <stop offset="85%" stopColor="#94a3b8" />
              <stop offset="100%" stopColor="#334155" />
            </linearGradient>
            <linearGradient id="tank-water" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#38bdf8" />
              <stop offset="50%" stopColor="#0284c7" />
              <stop offset="100%" stopColor="#0369a1" />
            </linearGradient>
            <linearGradient id="concrete-pillar" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#cbd5e1" />
              <stop offset="100%" stopColor="#64748b" />
            </linearGradient>

            <clipPath id="tank-clip">
              {/* Contains main cylinder + bottom cone for water fill clipping */}
              <rect x={tcx - tw / 2} y={ty} width={tw} height={th - 50} />
              <path d={`M ${tcx - tw / 2} ${ty + th - 50} L ${tcx - shaftW / 2 - 10} ${ty + th} L ${tcx + shaftW / 2 + 10} ${ty + th} L ${tcx + tw / 2} ${ty + th - 50} Z`} />
            </clipPath>
          </defs>

          {/* BACKGROUND PILLARS AND CENTER SHAFT */}
          {/* Main Central Shaft */}
          <rect x={tcx - shaftW / 2} y={pillarY} width={shaftW} height={pillarH} fill="url(#concrete-pillar)" stroke="#475569" strokeWidth="2" />

          {/* Outer supporting pillars (Fixed y connection so they connect to cylinder base) */}
          <rect x={tcx - tw / 2 + 30} y={ty + th - 50} width="20" height={pillarH + 50} fill="url(#concrete-pillar)" stroke="#475569" strokeWidth="2" />
          <rect x={tcx + tw / 2 - 50} y={ty + th - 50} width="20" height={pillarH + 50} fill="url(#concrete-pillar)" stroke="#475569" strokeWidth="2" />

          {/* BRACING / CROSSBEAMS */}
          <line x1={tcx - tw / 2 + 50} y1={pillarY + pillarH * 0.3} x2={tcx - shaftW / 2} y2={pillarY + pillarH * 0.3} stroke="#475569" strokeWidth="10" />
          <line x1={tcx + shaftW / 2} y1={pillarY + pillarH * 0.3} x2={tcx + tw / 2 - 50} y2={pillarY + pillarH * 0.3} stroke="#475569" strokeWidth="10" />

          <line x1={tcx - tw / 2 + 50} y1={pillarY + pillarH * 0.7} x2={tcx - shaftW / 2} y2={pillarY + pillarH * 0.7} stroke="#475569" strokeWidth="10" />
          <line x1={tcx + shaftW / 2} y1={pillarY + pillarH * 0.7} x2={tcx + tw / 2 - 50} y2={pillarY + pillarH * 0.7} stroke="#475569" strokeWidth="10" />

          {/* GROUND */}
          <rect x={50} y={pillarY + pillarH} width={svgW - 100} height="18" fill="#334155" rx="4" />
          <rect x={70} y={pillarY + pillarH + 18} width={svgW - 140} height="8" fill="#1e293b" rx="2" opacity="0.5" />

          {/* PIPES */}
          {/* Inlet Pipe before FCV */}
          <g>
            {drawPipe(inPipeBeforeFcv, pipeW)}
            {drawWaterFlow(inPipeBeforeFcv, ptVal > 0.2 ? 20 : 0, ptVal > 0.2)}
          </g>

          {/* Inlet Pipe after FCV */}
          <g>
            {drawPipe(inPipeAfterFcv, pipeW)}
            {drawWaterFlow(inPipeAfterFcv, ptVal > 0.2 ? 20 : 0, ptVal > 0.2)}
          </g>

          {/* Outlet Pipe */}
          <g>
            {drawPipe(outPipePath, pipeW)}
            {drawWaterFlow(outPipePath, flowVal, flowVal > 0)}
          </g>

          <g>
            <rect x={20} y={pillarY + pillarH - 45} width="160" height="30" rx="4" fill="hsl(var(--card))" stroke="hsl(var(--border))" strokeWidth="1" opacity="0.8" />
            <text x={35} y={pillarY + pillarH - 25} textAnchor="start" fontSize="13" fontWeight="800" fill="hsl(var(--primary))">INLET (From WTP) →</text>
          </g>

          <g>
            <rect x={svgW - 180} y={pillarY + pillarH - 45} width="160" height="30" rx="4" fill="hsl(var(--card))" stroke="hsl(var(--border))" strokeWidth="1" opacity="0.8" />
            <text x={svgW - 35} y={pillarY + pillarH - 25} textAnchor="end" fontSize="13" fontWeight="800" fill="hsl(var(--accent))">OUTLET (To City) →</text>
          </g>

          {/* TANK STRUCTURE (Realistic OHT Intze Tank shape) */}
          <g>
            {/* Lower Conical Dome (Back/Base) */}
            <path d={`M ${tcx - tw / 2} ${ty + th - 50} L ${tcx - shaftW / 2 - 10} ${ty + th} L ${tcx + shaftW / 2 + 10} ${ty + th} L ${tcx + tw / 2} ${ty + th - 50} Z`} fill="url(#tank-body)" stroke="#334155" strokeWidth="2" />

            {/* Main Cylindrical Body */}
            <rect x={tcx - tw / 2} y={ty} width={tw} height={th - 50} fill="url(#tank-body)" stroke="#334155" strokeWidth="2" />

            {/* FULL WATER FILL USING CLIP-PATH */}
            {ltVal > 0 && (
              <g clipPath="url(#tank-clip)">
                <rect
                  x={tcx - tw / 2 - 10}
                  y={waterY}
                  width={tw + 20}
                  height={waterHeight}
                  fill="url(#tank-water)"
                  className="transition-all duration-1000 ease-in-out"
                />
                {/* Surface Wave Effect */}
                <path
                  d={`M ${tcx - tw / 2 - 10} ${waterY + 5} Q ${tcx - tw / 4} ${waterY - 5} ${tcx} ${waterY + 5} T ${tcx + tw / 2 + 10} ${waterY + 5} L ${tcx + tw / 2 + 10} ${waterY + 20} L ${tcx - tw / 2 - 10} ${waterY + 20} Z`}
                  fill="hsl(199 85% 65%)" opacity="0.6"
                  className="transition-all duration-1000 ease-in-out"
                >
                  <animate attributeName="d" dur="3s" repeatCount="indefinite"
                    values={`
                      M ${tcx - tw / 2 - 10} ${waterY + 5} Q ${tcx - tw / 4} ${waterY - 5} ${tcx} ${waterY + 5} T ${tcx + tw / 2 + 10} ${waterY + 5} L ${tcx + tw / 2 + 10} ${waterY + 20} L ${tcx - tw / 2 - 10} ${waterY + 20} Z;
                      M ${tcx - tw / 2 - 10} ${waterY + 5} Q ${tcx - tw / 4} ${waterY + 15} ${tcx} ${waterY + 5} T ${tcx + tw / 2 + 10} ${waterY + 5} L ${tcx + tw / 2 + 10} ${waterY + 20} L ${tcx - tw / 2 - 10} ${waterY + 20} Z;
                      M ${tcx - tw / 2 - 10} ${waterY + 5} Q ${tcx - tw / 4} ${waterY - 5} ${tcx} ${waterY + 5} T ${tcx + tw / 2 + 10} ${waterY + 5} L ${tcx + tw / 2 + 10} ${waterY + 20} L ${tcx - tw / 2 - 10} ${waterY + 20} Z
                    `}
                  />
                </path>

                {/* Shimmer reflection */}
                <rect x={tcx - tw / 4} y={ty} width={tw / 2} height={th} fill="#ffffff" opacity="0.1" />
              </g>
            )}

            {/* Tank structural lines on top of water */}
            <line x1={tcx - tw / 2} y1={ty} x2={tcx - tw / 2} y2={ty + th - 50} stroke="#475569" strokeWidth="2" />
            <line x1={tcx + tw / 2} y1={ty} x2={tcx + tw / 2} y2={ty + th - 50} stroke="#475569" strokeWidth="2" />

            {/* Top Dome */}
            <path d={`M ${tcx - tw / 2} ${ty} Q ${tcx} ${ty - 80} ${tcx + tw / 2} ${ty} Z`} fill="url(#tank-body)" stroke="#334155" strokeWidth="2" />

            {/* Walkway / Catwalk Ring Beam around the tank */}
            <rect x={tcx - tw / 2 - 16} y={ty + th - 50} width={tw + 32} height="12" rx="4" fill="#cbd5e1" stroke="#334155" strokeWidth="2" />

            {/* Railing on catwalk */}
            <line x1={tcx - tw / 2 - 12} y1={ty + th - 65} x2={tcx + tw / 2 + 12} y2={ty + th - 65} stroke="#334155" strokeWidth="2" />
            <line x1={tcx - tw / 2 - 12} y1={ty + th - 50} x2={tcx - tw / 2 - 12} y2={ty + th - 65} stroke="#334155" strokeWidth="2" />
            <line x1={tcx - tw / 4} y1={ty + th - 50} x2={tcx - tw / 4} y2={ty + th - 65} stroke="#334155" strokeWidth="2" />
            <line x1={tcx} y1={ty + th - 50} x2={tcx} y2={ty + th - 65} stroke="#334155" strokeWidth="2" />
            <line x1={tcx + tw / 4} y1={ty + th - 50} x2={tcx + tw / 4} y2={ty + th - 65} stroke="#334155" strokeWidth="2" />
            <line x1={tcx + tw / 2 + 12} y1={ty + th - 50} x2={tcx + tw / 2 + 12} y2={ty + th - 65} stroke="#334155" strokeWidth="2" />
          </g>

          {/* ===== SIDE LEVEL GAUGE BAR (Right of Tank) ===== */}
          <g>
            {/* Connection lines from tank to gauge */}
            <line x1={tcx + tw / 2} y1={gaugeTop + 5} x2={gaugeX - 4} y2={gaugeTop + 5} stroke="#64748b" strokeWidth="3" />
            <line x1={tcx + tw / 2} y1={gaugeBottom - 5} x2={gaugeX - 4} y2={gaugeBottom - 5} stroke="#64748b" strokeWidth="3" />

            {/* Gauge tube background */}
            <rect x={gaugeX} y={gaugeTop} width="18" height={gaugeH} rx="5" fill="hsl(var(--card))" stroke="hsl(var(--border))" strokeWidth="2" />

            {/* Gauge water fill */}
            {levelPct > 0 && (
              <rect
                x={gaugeX + 3}
                y={gaugeBottom - gaugeFillH}
                width="12"
                height={gaugeFillH}
                rx="3"
                fill={statusColor}
                opacity="0.85"
                className="transition-all duration-700 ease-out"
              />
            )}

            {/* Scale marks */}
            {[0, 25, 50, 75, 100].map(pct => {
              const y = gaugeBottom - (pct / 100) * gaugeH;
              return (
                <g key={pct}>
                  <line x1={gaugeX + 18} y1={y} x2={gaugeX + 26} y2={y} stroke="#64748b" strokeWidth="1.5" />
                  <text x={gaugeX + 30} y={y + 4} fontSize="11" fontWeight="700" fill="hsl(var(--muted-foreground))" fontFamily="ui-monospace, monospace">{pct}%</text>
                </g>
              );
            })}

          </g>

          {/* OHT Level Display — Embedded inside tank body as LCD panel */}
          <g>
            {/* Panel background with border */}
            <rect x={tcx - 58} y={ty + 8} width="116" height="55" rx="6" fill="hsl(var(--card))" stroke="hsl(var(--border))" strokeWidth="1.5" opacity="0.92" />
            {/* Inner LCD screen */}
            <rect x={tcx - 52} y={ty + 12} width="104" height="47" rx="4" fill="hsl(var(--background))" opacity="0.95" />

            {/* Label */}
            <text x={tcx} y={ty + 25} textAnchor="middle" fontSize="10" fontWeight="700" fill="hsl(var(--muted-foreground))" fontFamily="ui-monospace, monospace" letterSpacing="1.5px">TANK LEVEL</text>

            {/* Value */}
            <text x={tcx} y={ty + 48} textAnchor="middle" fontSize="24" fontWeight="800" fill={statusColor} fontFamily="ui-monospace, monospace">
              {ltVal.toFixed(1)}<tspan fontSize="13" fill="hsl(var(--muted-foreground))"> %</tspan>
            </text>

            {/* OHT name watermark — moved up */}
            <text x={tcx} y={ty + th / 2 + 10} textAnchor="middle" fontSize="42" fontWeight="900" fill="#0f172a" opacity="0.15">{`OHT-${config.label.replace('#', '')}`}</text>
          </g>

          {/* INSTRUMENTS */}

          {/* Pressure Meter on Inlet (PT) - Left side on inlet pipe */}
          <g>
            <path d={`M 400 ${pillarY + pillarH} L 400 ${pillarY + pillarH - 40}`} fill="none" stroke="#475569" strokeWidth="6" />
            <circle cx={400} cy={pillarY + pillarH} r="6" fill="#475569" />
            <CircularGauge cx={400} cy={pillarY + pillarH - 100} r={55} value={ptVal} min={0} max={ptTag?.max ?? 10} label="PT Inlet" unit="Bar" />
          </g>

          {/* Outlet Flow Meter & Totalizer (On outlet pipe - right side) */}
          {(() => {
            const efmX = 1350;
            const efmY = pillarY + pillarH;
            const hTop = efmY - 120;
            const hW = 110, hH = 65, nW = 28;

            return (
              <g>
                <text x={efmX} y={hTop - 18} textAnchor="middle" fontSize="18" fontWeight="900" fill="hsl(var(--foreground))" letterSpacing="0.5px">Outlet Flow</text>

                <polygon points={`${efmX - hW / 2 + 8},${hTop} ${efmX + hW / 2 - 8},${hTop} ${efmX + hW / 2},${hTop + 16} ${efmX - hW / 2},${hTop + 16}`} fill="hsl(199 89% 48% / 0.85)" stroke="hsl(var(--border))" strokeWidth="1.5" />
                <rect x={efmX - hW / 2} y={hTop + 16} width={hW} height={hH} rx={8} fill="hsl(199 89% 48% / 0.9)" stroke="hsl(var(--border))" strokeWidth="1.5" />

                <rect x={efmX - 45} y={hTop + 30} width={90} height={40} rx="4" fill="hsl(var(--secondary))" stroke="hsl(var(--border))" strokeWidth="1" />
                <rect x={efmX - 42} y={hTop + 33} width={84} height={34} rx="3" fill="hsl(142 71% 45% / 0.1)" />
                <text x={efmX} y={hTop + 57} textAnchor="middle" fill="hsl(var(--foreground))" style={{ fontSize: '18px', fontFamily: "ui-monospace, monospace", fontWeight: 800 }}>{flowVal.toFixed(2)}</text>

                <rect x={efmX - nW / 2} y={hTop + 16 + hH} width={nW} height={efmY - (hTop + 16 + hH) - 10} fill="#64748b" stroke="#475569" strokeWidth="1" />
                <rect x={efmX - nW / 2 - 6} y={efmY - 16} width={nW + 12} height={10} rx={3} fill={pVDark} stroke={pVDark} strokeWidth="1.5" />

                <g>
                  <rect x={efmX - 95} y={efmY + 40} width={190} height={95} rx={12} fill="hsl(199 89% 48% / 0.06)" stroke="hsl(199 89% 48% / 0.5)" strokeWidth="1.5" style={{ filter: 'drop-shadow(0 6px 10px rgba(0,0,0,0.12))' }} />
                  <text x={efmX} y={efmY + 61} textAnchor="middle" fontSize="13" fontWeight="800" fill="hsl(199 89% 55%)" letterSpacing="1px">OUTLET FLOW</text>
                  <text x={efmX} y={efmY + 87} textAnchor="middle" fontSize="26" fontWeight="900" fill="hsl(var(--foreground))" fontFamily="ui-monospace">{flowVal.toFixed(1)} <tspan fontSize="13" fill="hsl(var(--muted-foreground))" fontWeight="600">m³/h</tspan></text>

                  <rect x={efmX - 75} y={efmY + 99} width={150} height="7" rx="3" fill="hsl(199 89% 48% / 0.2)" />
                  <rect x={efmX - 75} y={efmY + 99} width={150 * Math.max(0, Math.min(1, Math.abs(flowVal) / 50))} height="7" rx="3" fill="hsl(199 89% 48%)" className="transition-all duration-500" />

                  <text x={efmX} y={efmY + 123} textAnchor="middle" fontSize="12" fontWeight="800" fill="hsl(199 89% 55% / 0.8)">TOTALIZER: {totVal.toLocaleString()} m³</text>
                </g>
              </g>
            );
          })()}

          {/* Flow Control Valve (FCV) on Inlet Pipe - Right side of PT Inlet */}
          {hasFcvSensor && <g cursor="pointer" onClick={handleFcvToggle} className="select-none">
            {/* Label */}
            <text x={660} y={305} textAnchor="middle" className="fill-foreground font-bold text-sm" letterSpacing="0.5px">FCV</text>
            <text x={660} y={320} textAnchor="middle" className="fill-muted-foreground font-medium text-[11px]">Flow Control Valve</text>

            {/* Stem and Handwheel group with spin rotation transition */}
            <g style={{
              transform: fcvOpen ? "rotate(180deg)" : "rotate(0deg)",
              transformOrigin: "660px 360px",
              transition: "transform 0.8s cubic-bezier(0.4, 0, 0.2, 1)"
            }}>
              {/* Handwheel outer wheel */}
              <circle cx={660} cy={360} r="18" fill="none" stroke="hsl(var(--muted-foreground))" strokeWidth="3" />
              {/* Inner details / spokes of wheel */}
              <circle cx={660} cy={360} r="10" fill="none" stroke="hsl(var(--muted-foreground))" strokeWidth="1" strokeDasharray="3 3" />
              <line x1={660} y1={342} x2={660} y2={378} stroke="hsl(var(--muted-foreground))" strokeWidth="2.5" />
              <line x1={642} y1={360} x2={678} y2={360} stroke="hsl(var(--muted-foreground))" strokeWidth="2.5" />
              <circle cx={660} cy={360} r="4" fill="hsl(var(--muted-foreground))" />
            </g>

            {/* Non-rotating stem (actuator shaft) */}
            <line x1={660} y1={360} x2={660} y2={417} stroke="hsl(var(--muted-foreground))" strokeWidth="4.5" strokeLinecap="round" />

            {/* Valve Bonnet / Flange */}
            <path d="M 648 417 L 672 417" stroke="hsl(var(--muted-foreground))" strokeWidth="3.5" />

            {/* Valve Gate Chamber / Body Background (Enlarged) */}
            <rect x="636" y="417" width="48" height="36" fill="hsl(var(--card))" stroke="hsl(var(--border))" strokeWidth="2" rx="4" />

            {/* Slide Passage (indicates open pipe flow passage in background) */}
            <rect x="644" y="425" width="32" height="20" fill="hsl(199, 89%, 48%, 0.15)" stroke="hsl(199, 89%, 48%, 0.3)" strokeWidth="1" rx="2" />

            {/* Sliding Wedge/Gate Indicator (Visibly opens and closes) */}
            <rect 
              x="644" 
              y={fcvOpen ? "398" : "423"} 
              width="32" 
              height="24" 
              rx="2"
              fill={fcvOpen ? "hsl(var(--success) / 0.1)" : "hsl(var(--destructive) / 0.15)"} 
              stroke={fcvOpen ? "hsl(var(--success))" : "hsl(var(--destructive))"} 
              strokeWidth="2" 
              style={{ transition: "y 0.8s cubic-bezier(0.4, 0, 0.2, 1), fill 0.8s, stroke 0.8s", opacity: fcvOpen ? 0 : 0.95 }} 
            />

            {/* Realistic Gate Valve Triangles (overlay flanges) */}
            <path d="M 636 417 L 636 453 L 660 435 Z" fill="none" stroke="hsl(var(--muted-foreground))" strokeWidth="2.5" strokeLinejoin="round" />
            <path d="M 684 417 L 684 453 L 660 435 Z" fill="none" stroke="hsl(var(--muted-foreground))" strokeWidth="2.5" strokeLinejoin="round" />
            <circle cx={660} cy={435} r="5" fill="hsl(var(--muted-foreground))" />

            {/* Status Badge below pipe (larger & glowing) */}
            <g className="transition-all duration-300">
              <rect x={660 - 50} y={464} width="100" height="28" rx="8"
                fill={fcvOpen ? "hsl(142, 71%, 45%, 0.1)" : "hsl(0, 84%, 60%, 0.1)"}
                stroke={fcvOpen ? "hsl(var(--success))" : "hsl(var(--destructive))"}
                strokeWidth="1.5"
              />
              <circle cx={660 - 32} cy={478} r="5" fill={fcvOpen ? "hsl(var(--success))" : "hsl(var(--destructive))"} className={fcvOpen ? "animate-pulse" : ""} />
              <text x={660 + 10} y={483} textAnchor="middle" fontSize="12" fontWeight="900" fill={fcvOpen ? "hsl(var(--success))" : "hsl(var(--destructive))"} fontFamily="ui-monospace, monospace" letterSpacing="0.5px">
                {fcvOpen ? 'OPEN' : 'CLOSED'}
              </text>
            </g>

            {/* Tap to Toggle Text */}
            <text x={660} y={510} textAnchor="middle" fontSize="10" fill="hsl(var(--muted-foreground))" fontWeight="600" className="animate-pulse">Tap to toggle</text>
          </g>}

        </svg>
      </div>

    </div>
  );
};

export default OhtProcessSimulation;
