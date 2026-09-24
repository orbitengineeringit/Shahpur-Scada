import React, { useMemo } from 'react';
import { useScada } from '@/contexts/ScadaContext';

/**
 * Intake Well - Process Simulation View
 */
const IntakeProcessSimulation: React.FC = () => {
  const { intakeTags } = useScada();

  const findTag = (id: string) => intakeTags.find(t => t.id === id);
  const liveValue = (id: string) => {
    const tag = findTag(id);
    return tag?.status === 'connected' ? tag.value : 0;
  };

  const pt1Tag = findTag('INT-PT1');
  const pt2Tag = findTag('INT-PT2');
  const ltTag = findTag('INT-LT');
  const flowInTag = findTag('INT-Flow-IN');
  const flowOutTag = findTag('INT-Flow-OUT') || findTag('INT-Flow');
  const totalizerInTag = findTag('INT-Totalizer-IN');
  const totalizerOutTag = findTag('INT-Totalizer-OUT') || findTag('INT-Totalizer');
  const pump1Tag = findTag('INT-Pump1');
  const pump2Tag = findTag('INT-Pump2');
  const combinedPtTag = findTag('INT-HeaderPT') || findTag('INT-CombinedPT');

  const pt1Val = liveValue('INT-PT1');
  const pt2Val = liveValue('INT-PT2');
  const combinedPtVal = combinedPtTag?.status === 'connected' ? combinedPtTag.value : 0;
  const ltVal = liveValue('INT-LT');
  const flowInVal = flowInTag?.status === 'connected' ? flowInTag.value : 0;
  const flowOutVal = flowOutTag?.status === 'connected' ? flowOutTag.value : 0;
  const totalizerInVal = totalizerInTag?.status === 'connected' ? totalizerInTag.value : 0;
  const totalizerOutVal = totalizerOutTag?.status === 'connected' ? totalizerOutTag.value : 0;

  const pump1Running = (pt1Tag?.status === 'connected' && pt1Val > 1.5) || (pump1Tag?.status === 'connected' && pump1Tag?.value === 1);
  const pump2Running = (pt2Tag?.status === 'connected' && pt2Val > 1.5) || (pump2Tag?.status === 'connected' && pump2Tag?.value === 1);
  const anyPumpRunning = pump1Running || pump2Running;

  const levelPercent = ltTag
    ? Math.min(100, Math.max(0, ((ltVal - ltTag.min) / (ltTag.max - ltTag.min)) * 100))
    : 0;

  const combinedPt = useMemo(() => {
    if (combinedPtTag && combinedPtTag.status === 'connected' && combinedPtVal > 0) {
      return combinedPtVal;
    }
    if (pump1Running && pump2Running) return (pt1Val + pt2Val) / 2;
    if (pump1Running) return pt1Val;
    if (pump2Running) return pt2Val;
    return combinedPtVal;
  }, [combinedPtTag, combinedPtVal, pump1Running, pump2Running, pt1Val, pt2Val]);

  // ═══ Colors from IntakePump.tsx ═══
  const pBody = 'hsl(220 60% 42%)';
  const pLight = 'hsl(220 55% 52%)';
  const pDark = 'hsl(220 65% 32%)';
  const pVDark = 'hsl(220 70% 22%)';

  // ═══ Layout — Maximally expanded fully utilizing free space ═══
  const W = 1350, H = 950;
  const groundY = 580;
  const headerY = 240, headerH = 36; // Massive common header

  // Sump - Aligned perfectly symmetrically between Pump 1 (380) and Pump 2 (740)
  const sL = 190, sR = 930, sW = sR - sL, sCx = (sL + sR) / 2;
  const sTop = groundY + 18, sH = 280, sBot = sTop + sH;
  const wH = (levelPercent / 100) * sH;
  const wY = sBot - wH;

  // Pumps - wide robust spacing
  const p1x = 380, p2x = 740;
  const mW = 60, mH = 54;
  const motorTop = 450;
  const coupTop = motorTop + mH;
  const pipeW = 22; // Individual pipes thickness

  const riser1X = p1x + 95;
  const riser2X = p2x + 95;
  const dischCenterY = coupTop + 8;

  // PT gauge positions
  const gaugeY = 380;
  const gaugeR = 50; // Larger child gauges
  const pt03R = 64;  // Significantly larger master gauge

  // Gauges explicitly shifted right of pipes so they are clearly visible
  const gauge1X = riser1X + 90;
  const gauge2X = riser2X + 90;

  // ═══════════════════════════════════════════════════════════
  // GAUGE RENDERER
  // ═══════════════════════════════════════════════════════════
  const renderGauge = (
    gcx: number, gcy: number, value: number,
    min: number, max: number, unit: string,
    label: string, gr: number = gaugeR
  ) => {
    const pct = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
    const nAngle = -135 + (pct / 100) * 270;
    const nLen = gr - 16;
    const uid = label.replace(/\s/g, '');

    const getCol = () => {
      if (pct > 85) return 'hsl(var(--destructive))';
      if (pct > 65) return 'hsl(var(--warning))';
      return 'hsl(var(--success))';
    };

    const arc = (s: number, e: number, r: number) => {
      const sr = (s - 90) * Math.PI / 180, er = (e - 90) * Math.PI / 180;
      const x1 = gcx + r * Math.cos(sr), y1 = gcy + r * Math.sin(sr);
      const x2 = gcx + r * Math.cos(er), y2 = gcy + r * Math.sin(er);
      return `M ${x1} ${y1} A ${r} ${r} 0 ${e - s > 180 ? 1 : 0} 1 ${x2} ${y2}`;
    };

    const arcR = gr - 10;
    const arcStroke = Math.max(8, gr * 0.2);
    const activeStroke = arcStroke + 2;

    return (
      <g>
        <defs>
          <filter id={`gg-${uid}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="b" />
            <feComposite in="SourceGraphic" in2="b" operator="over" />
          </filter>
          <radialGradient id={`hub-${uid}`}>
            <stop offset="0%" stopColor={getCol()} />
            <stop offset="100%" stopColor={getCol()} stopOpacity="0.6" />
          </radialGradient>
        </defs>

        {/* Outer metallic case */}
        <circle cx={gcx} cy={gcy} r={gr + 8} fill="#475569" />
        <circle cx={gcx} cy={gcy} r={gr + 6} fill="#64748b" />
        <circle cx={gcx} cy={gcy} r={gr + 4} fill="#334155" />

        {/* Inner gauge face */}
        <circle cx={gcx} cy={gcy} r={gr} fill="hsl(var(--card))" stroke="hsl(var(--border))" strokeWidth="3" />
        <circle cx={gcx} cy={gcy} r={gr - 2} fill="none" stroke="hsl(var(--muted))" strokeWidth="4" opacity="0.3" />

        {/* Zone arcs matching PtGauge.tsx */}
        <path d={arc(-135, 135, arcR)} fill="none" stroke="hsl(var(--border))" strokeWidth={arcStroke} strokeLinecap="round" />
        <path d={arc(-135, -135 + 270 * 0.65, arcR)} fill="none" stroke="hsl(var(--success) / 0.35)" strokeWidth={arcStroke} strokeLinecap="round" />
        <path d={arc(-135 + 270 * 0.65, -135 + 270 * 0.85, arcR)} fill="none" stroke="hsl(var(--warning) / 0.45)" strokeWidth={arcStroke} strokeLinecap="round" />
        <path d={arc(-135 + 270 * 0.85, 135, arcR)} fill="none" stroke="hsl(var(--destructive) / 0.45)" strokeWidth={arcStroke} strokeLinecap="round" />

        {/* Active value arc */}
        {pct > 2 && (
          <path d={arc(-135, -135 + 270 * (pct / 100), arcR)} fill="none"
            stroke={getCol()} strokeWidth={activeStroke} strokeLinecap="round" filter={`url(#gg-${uid})`} />
        )}

        {/* Scale ticks + labels (Dark Mode optimized) */}
        {Array.from({ length: 11 }, (_, i) => {
          const a = (-135 + 270 * (i / 10) - 90) * Math.PI / 180;
          const iR = arcR - 10, oR = arcR - 3, lR = arcR - 22;
          const tv = min + (i / 10) * (max - min);
          const maj = i % 2 === 0;
          return (
            <g key={i}>
              <line
                x1={gcx + (maj ? iR : iR + 5) * Math.cos(a)} y1={gcy + (maj ? iR : iR + 5) * Math.sin(a)}
                x2={gcx + oR * Math.cos(a)} y2={gcy + oR * Math.sin(a)}
                stroke="hsl(var(--muted-foreground))" strokeWidth={maj ? 2 : 1}
              />
              {maj && (
                <text x={gcx + lR * Math.cos(a)} y={gcy + lR * Math.sin(a)}
                  textAnchor="middle" dominantBaseline="central"
                  fill="hsl(var(--foreground))" style={{ fontSize: `${Math.max(9, gr * 0.2)}px`, fontWeight: 800 }}>
                  {Number.isInteger(tv) ? tv : tv.toFixed(1)}
                </text>
              )}
            </g>
          );
        })}

        {/* Center hub */}
        <circle cx={gcx} cy={gcy} r={Math.max(7, gr * 0.16)} fill={`url(#hub-${uid})`} />
        <circle cx={gcx} cy={gcy} r={Math.max(4, gr * 0.08)} fill={getCol()} opacity={0.9} />

        {/* Needle */}
        <line x1={0} y1={0} x2={0} y2={-nLen}
          stroke={getCol()} strokeWidth={3} strokeLinecap="round"
          style={{
            transform: `translate(${gcx}px, ${gcy}px) rotate(${nAngle}deg)`,
            transition: 'transform 1s cubic-bezier(0.4, 0, 0.2, 1)',
            filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.4))',
          }}
        />

        {pct > 1 && (
          <circle r={4.5} fill={getCol()} opacity={0.6}
            style={{
              transform: `translate(${gcx}px, ${gcy}px) rotate(${nAngle}deg) translateY(${-nLen}px)`,
              transition: 'transform 1s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          />
        )}

        {/* Label ABOVE gauge */}
        <text x={gcx} y={gcy - gr - 16} textAnchor="middle" fill="hsl(var(--foreground))"
          style={{ fontSize: `${Math.max(13, gr * 0.3)}px`, fontWeight: 800, letterSpacing: '0.6px' }}>
          {label}
        </text>

        {/* Value box BELOW gauge */}
        <rect x={gcx - 36} y={gcy + gr + 12} width={72} height={28} rx={5}
          fill="hsl(var(--card))" stroke="hsl(var(--border))" strokeWidth="1" />
        <text x={gcx} y={gcy + gr + 31} textAnchor="middle" fill="hsl(var(--foreground))"
          style={{ fontSize: '14px', fontWeight: 800, fontFamily: "ui-monospace, monospace" }}>
          {value.toFixed(1)} <tspan fontSize="9" fill="hsl(var(--muted-foreground))" fontWeight="600">{unit}</tspan>
        </text>
      </g>
    );
  };

  // ═══════════════════════════════════════════════════════════
  // VT PUMP RENDERER
  // ═══════════════════════════════════════════════════════════
  const renderPump = (px: number, isRunning: boolean, label: string, ptValue: number, alignText: 'left' | 'right') => {
    const mt = motorTop;
    const ct = coupTop;
    const ch = 12;
    const bt = ct + ch;
    const btW = 42; // Pipe down to sump
    const bmY = bt + 24;
    const bcEnd = sTop + 40;

    return (
      <g>
        {/* Motor Grill */}
        <rect x={px - mW / 2} y={mt - 6} width={mW} height={8} rx={2} fill={pDark} stroke={pVDark} strokeWidth={1} />
        {Array.from({ length: 9 }, (_, i) => (
          <line key={`g${i}`} x1={px - mW / 2 + 4 + i * 6.5} y1={mt - 5} x2={px - mW / 2 + 4 + i * 6.5} y2={mt}
            stroke={pVDark} strokeWidth={0.8} opacity={0.7} />
        ))}
        <line x1={px - mW / 2 + 2} y1={mt - 3} x2={px + mW / 2 - 2} y2={mt - 3} stroke={pVDark} strokeWidth={0.5} opacity={0.5} />

        {/* Motor Sub-housing */}
        <rect x={px - mW / 2} y={mt} width={mW} height={mH} rx={4} fill={pBody} stroke={pDark} strokeWidth={1.5} />
        {[0.2, 0.4, 0.6, 0.8].map((f, i) => (
          <line key={`v${i}`} x1={px - mW / 2 + 4} y1={mt + mH * f} x2={px + mW / 2 - 4} y2={mt + mH * f}
            stroke={pDark} strokeWidth={0.8} opacity={0.5} />
        ))}

        {/* LED */}
        <circle cx={px - mW / 2 + 10} cy={mt + 12} r={3.5}
          fill={isRunning ? '#22c55e' : '#ef4444'}>
          {isRunning && <animate attributeName="opacity" values="1;0.4;1" dur="1s" repeatCount="indefinite" />}
        </circle>

        {/* Terminal box */}
        <rect x={px + mW / 2 - 16} y={mt + 8} width={14} height={10} rx={2} fill={pDark} stroke={pVDark} strokeWidth={0.6} />

        {/* Coupling Block */}
        <rect x={px - 16} y={ct} width={32} height={ch} rx={2} fill={pBody} stroke={pDark} strokeWidth={1.2} />
        <rect x={px - 9} y={ct + 2.5} width={18} height={ch - 5} rx={1.5} fill={pLight} stroke={pDark} strokeWidth={0.6} opacity={0.6} />

        {/* Side outlet Flange (discharge pipe expander) matched to 22px pipe width */}
        <path d={`M ${px + 16} ${ct + 2} L ${px + 34} ${ct - 3} L ${px + 34} ${ct + 19} L ${px + 16} ${ct + 12} Z`} fill={pBody} stroke={pDark} strokeWidth={1} />
        <rect x={px + 34} y={ct - 4} width={4} height={24} rx="1" fill={pLight} stroke={pDark} strokeWidth="1" />

        {/* Upper Flange */}
        <rect x={px - 20} y={bt} width={40} height={6} rx={1.5} fill={pLight} stroke={pDark} strokeWidth={1} />
        {[-12, 0, 12].map(d => <circle key={d} cx={px + d} cy={bt + 3} r={1.8} fill={pVDark} />)}

        {/* Upper Column */}
        <rect x={px - btW / 2 + 3} y={bt + 6} width={btW - 6} height={bmY - bt - 6} rx={1.5} fill={pBody} stroke={pDark} strokeWidth={1.2} />

        {/* Middle Flange */}
        <rect x={px - 18} y={bmY} width={36} height={5} rx={1} fill={pLight} stroke={pDark} strokeWidth={0.8} />

        {/* Lower Column */}
        <rect x={px - btW / 2 + 3} y={bmY + 5} width={btW - 6} height={bcEnd - bmY - 5} rx={1.5} fill={pBody} stroke={pDark} strokeWidth={1.2} />

        {/* Lower Flange */}
        <rect x={px - 18} y={bcEnd} width={36} height={5} rx={1} fill={pLight} stroke={pDark} strokeWidth={0.8} />

        {/* Bowl */}
        <path d={`M${px - 18} ${bcEnd + 5} L${px - 18} ${bcEnd + 26} Q${px - 18} ${bcEnd + 34} ${px - 10} ${bcEnd + 38} L${px + 10} ${bcEnd + 38} Q${px + 18} ${bcEnd + 34} ${px + 18} ${bcEnd + 26} L${px + 18} ${bcEnd + 5} Z`}
          fill={pBody} stroke={pDark} strokeWidth={1.2} />

        {/* Bell Mouth */}
        <path d={`M${px - 10} ${bcEnd + 38} Q${px - 18} ${bcEnd + 44} ${px - 22} ${bcEnd + 50} L${px - 22} ${bcEnd + 58} Q${px - 22} ${bcEnd + 62} ${px - 16} ${bcEnd + 62} L${px + 16} ${bcEnd + 62} Q${px + 22} ${bcEnd + 62} ${px + 22} ${bcEnd + 58} L${px + 22} ${bcEnd + 50} Q${px + 18} ${bcEnd + 44} ${px + 10} ${bcEnd + 38}`}
          fill={pBody} stroke={pDark} strokeWidth={1.2} />

        {/* Real VT Pump Impeller Section / Cutaway */}
        <rect x={px - 14} y={bcEnd + 10} width="28" height="24" rx="2" fill="#0f172a" stroke={pVDark} strokeWidth="1" />

        <g transform={`translate(${px}, ${bcEnd + 22})`}>
          {/* Central Shaft inside window */}
          <rect x="-2" y="-12" width="4" height="24" fill="#94a3b8" />
          <rect x="0" y="-12" width="1.5" height="24" fill="#e2e8f0" />

          <g>
            {isRunning && <animateTransform attributeName="transform" type="scale" values="1 1; -1 1; 1 1" dur="0.5s" repeatCount="indefinite" />}

            {/* Main Conical Hub */}
            <path d="M -4 -8 L 4 -8 L 7 8 L -7 8 Z" fill="#64748b" stroke="#475569" strokeWidth="0.5" />
            <path d="M 0 -8 L 4 -8 L 7 8 L 0 8 Z" fill="#94a3b8" />

            {/* Swept Vanes (Mixed Flow) - these swing side to side realistically */}
            <path d="M -5 -2 Q -15 6 -11 10 Q -8 10 -6 6 Z" fill="#cbd5e1" stroke="#475569" strokeWidth="0.5" />
            <path d="M 5 -2 Q 15 6 11 10 Q 8 10 6 6 Z" fill="#748398" stroke="#334155" strokeWidth="0.5" />

            {/* Center Sweeping Vane */}
            <path d="M 0 -6 Q 4 2 1.5 10 Q -1.5 10 -1.5 2 Z" fill="#f8fafc" stroke="#94a3b8" strokeWidth="0.5" />
          </g>
        </g>

        {/* Strainer */}
        <rect x={px - 18} y={bcEnd + 62} width={36} height={16} rx={2.5} fill={pDark} stroke={pVDark} strokeWidth={1} />
        {[bcEnd + 65, bcEnd + 69, bcEnd + 73].map((sy, i) => (
          <line key={`sh${i}`} x1={px - 15} y1={sy} x2={px + 15} y2={sy} stroke={pVDark} strokeWidth={0.6} opacity={0.6} />
        ))}
        {[-10, -5, 0, 5, 10].map((dx, i) => (
          <line key={`sv${i}`} x1={px + dx} y1={bcEnd + 63} x2={px + dx} y2={bcEnd + 77} stroke={pVDark} strokeWidth={0.6} opacity={0.5} />
        ))}

        <text
          x={alignText === 'left' ? px - 40 : px + 40}
          y={mt + mH + ch + 32}
          textAnchor={alignText === 'left' ? 'end' : 'start'}
          fontSize="14"
          fontWeight="900"
          letterSpacing="0.5"
          fill={isRunning ? '#22c55e' : '#ef4444'}
        >
          {isRunning ? 'ON' : 'OFF'}
        </text>

        <rect x={px - 26} y={mt - 28} width={52} height={18} rx={4} fill="hsl(var(--card))" stroke="hsl(var(--border))" strokeWidth={1} />
        <text x={px} y={mt - 15} textAnchor="middle" fontSize="11" fontWeight="800" fill="hsl(var(--foreground))">{label}</text>
      </g>
    );
  };

  return (
    <div className="w-full premium-card rounded-xl p-3 md:p-5 animate-fade-in overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" style={{ maxHeight: '88vh', minWidth: '650px' }}>
        <defs>
          <linearGradient id="p-pipe-h" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={pDark} />
            <stop offset="35%" stopColor={pBody} />
            <stop offset="65%" stopColor={pBody} />
            <stop offset="100%" stopColor={pDark} />
          </linearGradient>
          <linearGradient id="p-pipe-v" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={pDark} />
            <stop offset="35%" stopColor={pBody} />
            <stop offset="65%" stopColor={pBody} />
            <stop offset="100%" stopColor={pDark} />
          </linearGradient>
          <linearGradient id="p-water" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(200 70% 88%)" stopOpacity="0.85" />
            <stop offset="100%" stopColor="hsl(200 60% 75%)" stopOpacity="0.9" />
          </linearGradient>
          <linearGradient id="p-ground" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#cbd5e1" />
            <stop offset="100%" stopColor="#94a3b8" />
          </linearGradient>
          <linearGradient id="p-sump" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#64748b" />   {/* Concrete Shade */}
            <stop offset="50%" stopColor="#e2e8f0" />  {/* Concrete Highlight */}
            <stop offset="100%" stopColor="#64748b" />
          </linearGradient>
          <linearGradient id="p-sump-base" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#94a3b8" />
            <stop offset="100%" stopColor="#475569" />
          </linearGradient>
          <clipPath id="p-sump-clip">
            <rect x={sL + 16} y={sTop} width={sW - 32} height={sH} />
          </clipPath>
          <linearGradient id="p-header-h" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={pVDark} />
            <stop offset="20%" stopColor={pDark} />
            <stop offset="40%" stopColor={pBody} />
            <stop offset="60%" stopColor={pBody} />
            <stop offset="80%" stopColor={pDark} />
            <stop offset="100%" stopColor={pVDark} />
          </linearGradient>
        </defs>



        {/* PIPES & FLUID ANIMATION */}
        {(() => {
          const drawWaterColumn = (d: string, w: number, opacity: number = 0.8) => {
            return (
              <path
                d={d}
                fill="none"
                stroke="#38bdf8" // Beautiful sky blue water column
                strokeWidth={w * 0.55} // Centered inside the pipe
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={opacity}
              />
            );
          };

          const drawWaterFlow = (d: string, running: boolean, w: number, pressure: number) => {
            if (!running) return null;

            // Map pressure to animation speed linearly
            const pNorm = Math.min(10, Math.max(1, pressure)) / 10;
            const durFast = (2.4 - pNorm * 1.6).toFixed(2) + 's';   // top highlight streaks
            const durSlow = (3.6 - pNorm * 2.0).toFixed(2) + 's';   // deeper ripple streaks

            // Long flowing streaks (looks like moving water, not dots)
            const dashA = 55, gapA = 22, cycleA = dashA + gapA;
            const dashB = 30, gapB = 60, cycleB = dashB + gapB;
            const sw = Math.max(3, w * 0.32);

            return (
              <g opacity="0.95">
                {/* Primary flowing highlight streaks */}
                <path
                  d={d}
                  fill="none"
                  stroke="#f0f9ff"
                  strokeWidth={sw}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray={`${dashA} ${gapA}`}
                  opacity="0.85"
                >
                  <animate attributeName="stroke-dashoffset" from={cycleA} to="0" dur={durFast} repeatCount="indefinite" calcMode="linear" />
                </path>
                {/* Secondary slower ripple for depth */}
                <path
                  d={d}
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth={sw * 0.45}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray={`${dashB} ${gapB}`}
                  opacity="0.55"
                >
                  <animate attributeName="stroke-dashoffset" from={cycleB} to="0" dur={durSlow} repeatCount="indefinite" calcMode="linear" />
                </path>
              </g>
            );
          };

          const pRd = 16; // smooth curve bend radius

          // Complete Header Pipe
          const headerPath = `M ${sL - 10} ${headerY + headerH / 2} L ${sR + 164} ${headerY + headerH / 2}`;

          // Header Segments for precise flow animation boundaries
          const headerSegAPath = `M ${sL - 10} ${headerY + headerH / 2} L ${riser1X} ${headerY + headerH / 2}`;
          const headerSegBPath = `M ${riser1X} ${headerY + headerH / 2} L ${riser2X} ${headerY + headerH / 2}`;
          const headerSegCPath = `M ${riser2X} ${headerY + headerH / 2} L ${sR + 164} ${headerY + headerH / 2}`;

          // Continuous Pump 1 and 2 Risers
          const p1Riser = `M ${p1x + 36} ${dischCenterY} L ${riser1X - pRd} ${dischCenterY} Q ${riser1X} ${dischCenterY} ${riser1X} ${dischCenterY - pRd} L ${riser1X} ${headerY + headerH / 2}`;
          const p2Riser = `M ${p2x + 36} ${dischCenterY} L ${riser2X - pRd} ${dischCenterY} Q ${riser2X} ${dischCenterY} ${riser2X} ${dischCenterY - pRd} L ${riser2X} ${headerY + headerH / 2}`;

          // Water trace paths — origin deep inside pump, up the riser, then SMOOTH BEND into the header rightward
          const headerCenterY = headerY + headerH / 2;
          // Full continuous flow path: pump → up riser → smooth bend into header → all the way to WTP outlet
          const w1Path = `M ${p1x} ${sTop + 70} L ${p1x} ${dischCenterY + pRd} Q ${p1x} ${dischCenterY} ${p1x + pRd} ${dischCenterY} L ${riser1X - pRd} ${dischCenterY} Q ${riser1X} ${dischCenterY} ${riser1X} ${dischCenterY - pRd} L ${riser1X} ${headerCenterY + pRd} Q ${riser1X} ${headerCenterY} ${riser1X + pRd} ${headerCenterY} L ${sR + 164} ${headerCenterY}`;
          const w2Path = `M ${p2x} ${sTop + 70} L ${p2x} ${dischCenterY + pRd} Q ${p2x} ${dischCenterY} ${p2x + pRd} ${dischCenterY} L ${riser2X - pRd} ${dischCenterY} Q ${riser2X} ${dischCenterY} ${riser2X} ${dischCenterY - pRd} L ${riser2X} ${headerCenterY + pRd} Q ${riser2X} ${headerCenterY} ${riser2X + pRd} ${headerCenterY} L ${sR + 164} ${headerCenterY}`;

          return (
            <g>
              {/* Seamless T-Joint Layering: Draw all pipe outlines FIRST, then all bodies/highlights */}
              {[
                { s: pVDark, wA: 3, wM: 1, op: 1 },
                { s: pDark, wA: 0, wM: 1, op: 1 },
                { s: pBody, wA: 0, wM: 0.65, op: 1 },
                { s: pLight, wA: 0, wM: 0.2, op: 0.5 }
              ].map((layer, idx) => (
                <g key={`pipe-layer-${idx}`} opacity={layer.op}>
                  <path d={p1Riser} fill="none" stroke={layer.s} strokeWidth={pipeW * layer.wM + layer.wA} strokeLinecap="round" strokeLinejoin="round" />
                  <path d={p2Riser} fill="none" stroke={layer.s} strokeWidth={pipeW * layer.wM + layer.wA} strokeLinecap="round" strokeLinejoin="round" />
                  <path d={headerPath} fill="none" stroke={layer.s} strokeWidth={headerH * layer.wM + layer.wA} strokeLinecap="round" strokeLinejoin="round" />
                </g>
              ))}

              {/* 1. SOLID WATER COLUMNS (BACKGROUND FILL) */}
              {/* Pipes always hold water — entire header & both risers stay filled */}
              {drawWaterColumn(headerSegAPath, headerH)}
              {drawWaterColumn(headerSegBPath, headerH)}
              {drawWaterColumn(headerSegCPath, headerH)}
              {drawWaterColumn(w1Path, pipeW)}
              {drawWaterColumn(w2Path, pipeW)}

              {/* 2. DYNAMIC WATER FLOW ALONG CENTERLINE */}
              {pump1Running && drawWaterFlow(w1Path, true, pipeW, pt1Val)}
              {pump2Running && drawWaterFlow(w2Path, true, pipeW, pt2Val)}

              {/* Final cap on the right end */}
              <ellipse cx={sR + 164} cy={headerY + headerH / 2} rx={headerH / 2} ry={headerH / 2 + 2} fill={pVDark} opacity={0.6} />

              <text x={sR + 189} y={headerY + headerH / 2 + 5} fontSize="16" fontWeight="800" fill="hsl(var(--foreground))">
                TO WTP →
              </text>
            </g>
          );
        })()}

        {/* HORIZONTAL STEMS TO CLEARLY SEPARATED GAUGES */}
        <g>
          <path d={`M ${riser1X} ${gaugeY + gaugeR + 38} L ${gauge1X} ${gaugeY + gaugeR + 38} L ${gauge1X} ${gaugeY + gaugeR + 30}`} fill="none" stroke={pDark} strokeWidth="6" strokeLinejoin="round" />
          <circle cx={riser1X} cy={gaugeY + gaugeR + 38} r="5" fill={pDark} />
        </g>
        <g>
          <path d={`M ${riser2X} ${gaugeY + gaugeR + 38} L ${gauge2X} ${gaugeY + gaugeR + 38} L ${gauge2X} ${gaugeY + gaugeR + 30}`} fill="none" stroke={pDark} strokeWidth="6" strokeLinejoin="round" />
          <circle cx={riser2X} cy={gaugeY + gaugeR + 38} r="5" fill={pDark} />
        </g>

        {renderGauge(gauge1X, gaugeY, pt1Val, 0, 10, 'Bar', 'PT 01', gaugeR)}
        {renderGauge(gauge2X, gaugeY, pt2Val, 0, 10, 'Bar', 'PT 02', gaugeR)}

        <g>
          <line x1={sCx + 80} y1={headerY} x2={sCx + 80} y2={140 + pt03R + 38} stroke={pDark} strokeWidth="5" />
          <circle cx={sCx + 80} cy={headerY} r="5" fill={pDark} stroke={pVDark} strokeWidth="1" />
          {renderGauge(sCx + 80, 140, combinedPt, 0, 10, 'Bar', 'PT 03', pt03R)}
        </g>

        {/* EFM 01 - FLAWLESS ATTACHMENT */}
        {/* EFM 01 - FLAWLESS ATTACHMENT */}
        {(() => {
          const efmSensorX = 1058; // Shifted an additional 2px right
          const efmCardX = 1058;   // Aligned parallel to the sensor
          const hTop = headerY - 80;
          const hW = 76, hH = 46, nW = 24;

          return (
            <g>
              <text x={efmSensorX} y={hTop - 12} textAnchor="middle" fontSize="16" fontWeight="800" fill="hsl(var(--foreground))">EFM OUT</text>

              <polygon points={`${efmSensorX - hW / 2 + 5},${hTop} ${efmSensorX + hW / 2 - 5},${hTop} ${efmSensorX + hW / 2},${hTop + 12} ${efmSensorX - hW / 2},${hTop + 12}`} fill="hsl(199 89% 48% / 0.85)" stroke="hsl(var(--border))" strokeWidth="1" />
              <rect x={efmSensorX - hW / 2} y={hTop + 12} width={hW} height={hH} rx={4} fill="hsl(199 89% 48% / 0.9)" stroke="hsl(var(--border))" strokeWidth="1.2" />
              <circle cx={efmSensorX - hW / 2 + 6} cy={hTop + 20} r="3" fill="hsl(var(--muted))" stroke="hsl(var(--border))" strokeWidth="0.6" />
              <circle cx={efmSensorX + hW / 2 - 6} cy={hTop + 20} r="3" fill="hsl(var(--muted))" stroke="hsl(var(--border))" strokeWidth="0.6" />

              <rect x={efmSensorX - 26} y={hTop + 18} width={52} height={24} rx={2} fill="hsl(var(--secondary))" stroke="hsl(var(--border))" strokeWidth="0.8" />
              <rect x={efmSensorX - 24} y={hTop + 20} width={48} height={20} rx={1} fill="hsl(142 71% 45% / 0.08)" />
              <text x={efmSensorX} y={hTop + 34} textAnchor="middle" fill="hsl(var(--foreground))" style={{ fontSize: '13px', fontFamily: "ui-monospace, monospace", fontWeight: 800 }}>{flowOutVal.toFixed(2)}</text>

              {/* Neck seamlessly touches the pipe and is dark metallic color */}
              <rect x={efmSensorX - nW / 2} y={hTop + 12 + hH} width={nW} height={headerY - (hTop + 12 + hH)} fill="#64748b" stroke="#475569" strokeWidth="1" />
              {/* Flange completely hugs the pipe with pipe's color outline */}
              <rect x={efmSensorX - nW / 2 - 6} y={headerY - 5} width={nW + 12} height={8} rx={2} fill={pDark} stroke={pVDark} strokeWidth="1" />

              <g>
                <rect x={efmCardX - 70} y={headerY + headerH + 24} width={140} height={46} rx={6} fill="hsl(var(--card))" stroke="hsl(var(--border))" strokeWidth="1" />
                <text x={efmCardX} y={headerY + headerH + 40} textAnchor="middle" fontSize="12" fontWeight="700" fill="hsl(var(--muted-foreground))">Flow Rate</text>
                <text x={efmCardX} y={headerY + headerH + 58} textAnchor="middle" fontSize="18" fontWeight="800" fill="hsl(var(--foreground))" fontFamily="ui-monospace, monospace">
                  {flowOutVal.toFixed(1)}<tspan fontSize="11" fontWeight="500"> m³/h</tspan>
                </text>
                <rect x={efmCardX - 60} y={headerY + headerH + 72} width={120} height={6} rx={3} fill="hsl(var(--secondary))" />
                <rect x={efmCardX - 60} y={headerY + headerH + 72} width={120 * Math.min(1, flowOutVal / 200)} height={6} rx={3} fill="hsl(var(--primary))" className="transition-all duration-500 ease-out" />
              </g>
            </g>
          );
        })()}

        {/* TOTALIZER */}
        {(() => {
          const tx = 1240, ty = headerY + headerH + 24;
          const digits = Math.floor(totalizerOutVal).toString().padStart(8, '0').split('');
          const dec = (totalizerOutVal % 1).toFixed(2).substring(2);
          const dW = 16, dH = 26, gp = 2.5;
          const totW = 10 * dW + 9 * gp + 4 + 22;

          return (
            <g>
              <text x={tx} y={ty - 10} textAnchor="middle" fontSize="13" fontWeight="800" fill="hsl(var(--foreground))">Totalizer (Outlet)</text>
              <rect x={tx - totW / 2} y={ty} width={totW} height={dH + 18} rx={6} fill="hsl(var(--secondary) / 0.5)" stroke="hsl(var(--border) / 0.5)" strokeWidth="1" />
              {digits.map((d, i) => (
                <g key={`td${i}`}>
                  <rect x={tx - totW / 2 + 12 + i * (dW + gp)} y={ty + 9} width={dW} height={dH} rx={3} fill="hsl(var(--card))" stroke="hsl(var(--border))" strokeWidth="1" style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.08))' }} />
                  <text x={tx - totW / 2 + 12 + i * (dW + gp) + dW / 2} y={ty + 9 + dH / 2 + 5} textAnchor="middle" fill="hsl(var(--foreground))" style={{ fontSize: '15px', fontFamily: 'ui-monospace, monospace', fontWeight: 800 }}>{d}</text>
                </g>
              ))}
              <circle cx={tx - totW / 2 + 12 + 8 * (dW + gp) + 2} cy={ty + 9 + dH - 3} r={3} fill="hsl(var(--primary))" />
              {dec.split('').map((d, i) => (
                <g key={`dd${i}`}>
                  <rect x={tx - totW / 2 + 12 + 8 * (dW + gp) + 5 + gp + i * (dW + gp)} y={ty + 9} width={dW} height={dH} rx={3} fill="hsl(var(--destructive) / 0.12)" stroke="hsl(var(--destructive) / 0.25)" strokeWidth="1" />
                  <text x={tx - totW / 2 + 12 + 8 * (dW + gp) + 5 + gp + i * (dW + gp) + dW / 2} y={ty + 9 + dH / 2 + 5} textAnchor="middle" fill="hsl(var(--destructive))" style={{ fontSize: '15px', fontFamily: 'ui-monospace, monospace', fontWeight: 800 }}>{d}</text>
                </g>
              ))}
            </g>
          );
        })()}

        {/* INLET EFM — mounted on the raw-water pipe entering the intake sump. */}
        <g>
          <path d={`M 12 ${sTop + 145} H ${sL + 16}`} fill="none" stroke={pVDark} strokeWidth="25" strokeLinecap="round" />
          <path d={`M 12 ${sTop + 145} H ${sL + 16}`} fill="none" stroke={pBody} strokeWidth="20" strokeLinecap="round" />
          <path d={`M 12 ${sTop + 145} H ${sL + 16}`} fill="none" stroke="#38bdf8" strokeWidth="11" strokeLinecap="round" opacity="0.8" />
          {flowInVal > 0 && (
            <path d={`M 12 ${sTop + 145} H ${sL + 16}`} fill="none" stroke="#f0f9ff" strokeWidth="5" strokeLinecap="round" strokeDasharray="28 18">
              <animate attributeName="stroke-dashoffset" from="46" to="0" dur="1.4s" repeatCount="indefinite" />
            </path>
          )}
          <polygon points={`${sL + 2},${sTop + 137} ${sL + 15},${sTop + 145} ${sL + 2},${sTop + 153}`} fill="#f0f9ff" opacity={flowInVal > 0 ? 0.9 : 0.35} />

          <text x="100" y={sTop + 45} textAnchor="middle" fontSize="14" fontWeight="900" fill="hsl(var(--foreground))">EFM IN</text>
          <rect x="61" y={sTop + 55} width="78" height="52" rx="6" fill="hsl(199 89% 48% / 0.9)" stroke="hsl(var(--border))" strokeWidth="1.5" />
          <rect x="72" y={sTop + 68} width="56" height="26" rx="3" fill="hsl(var(--secondary))" stroke="hsl(var(--border))" />
          <text x="100" y={sTop + 87} textAnchor="middle" fontSize="14" fontWeight="900" fill="hsl(var(--foreground))" fontFamily="ui-monospace, monospace">{flowInVal.toFixed(2)}</text>
          <rect x="91" y={sTop + 107} width="18" height="27" fill="#64748b" stroke="#475569" />
          <rect x="82" y={sTop + 132} width="36" height="7" rx="2" fill={pDark} />

          <rect x="25" y={sTop + 172} width="150" height="48" rx="7" fill="hsl(var(--card))" stroke="hsl(var(--border))" />
          <text x="100" y={sTop + 189} textAnchor="middle" fontSize="10" fontWeight="800" fill="hsl(var(--primary))">INLET FLOW</text>
          <text x="100" y={sTop + 210} textAnchor="middle" fontSize="18" fontWeight="900" fill="hsl(var(--foreground))" fontFamily="ui-monospace, monospace">
            {flowInVal.toFixed(1)} <tspan fontSize="10" fill="hsl(var(--muted-foreground))">m³/h</tspan>
          </text>

          <rect x="17" y={sTop + 231} width="166" height="58" rx="7" fill="hsl(var(--secondary) / 0.55)" stroke="hsl(var(--border))" />
          <text x="100" y={sTop + 249} textAnchor="middle" fontSize="10" fontWeight="800" fill="hsl(var(--muted-foreground))">INLET TOTALIZER</text>
          <text x="100" y={sTop + 274} textAnchor="middle" fontSize="18" fontWeight="900" fill="hsl(var(--foreground))" fontFamily="ui-monospace, monospace">
            {totalizerInVal.toFixed(2)} <tspan fontSize="10" fill="hsl(var(--muted-foreground))">m³</tspan>
          </text>
        </g>

        {/* Energy Meter removed — INT-KW not installed */}

        {/* Concrete Operations Deck (replaces the super long background line) */}
        <rect x={sL - 30} y={groundY} width={sR - sL + 60} height="18" rx="3" fill="url(#p-ground)" stroke="#64748b" strokeWidth="1" />
        <rect x={sL - 25} y={groundY + 18} width={sR - sL + 50} height="4" rx="2" fill="#64748b" opacity="0.6" />

        {/* Seamless Concrete Sump Walls (Perfectly continuous U-shape via layered thick strokes) */}
        <g strokeLinecap="butt" strokeLinejoin="round" fill="none">
          {/* Outer Border Layer */}
          <path d={`M ${sL + 8} ${sTop} L ${sL + 8} ${sBot + 8} L ${sR - 8} ${sBot + 8} L ${sR - 8} ${sTop}`} stroke="#334155" strokeWidth="18" />
          {/* Inner Base Layer */}
          <path d={`M ${sL + 8} ${sTop} L ${sL + 8} ${sBot + 8} L ${sR - 8} ${sBot + 8} L ${sR - 8} ${sTop}`} stroke="#475569" strokeWidth="16" />
          {/* Core Body with Lighting Gradient */}
          <path d={`M ${sL + 8} ${sTop} L ${sL + 8} ${sBot + 8} L ${sR - 8} ${sBot + 8} L ${sR - 8} ${sTop}`} stroke="url(#p-sump)" strokeWidth="14" />
        </g>

        {/* Sump Interior Depth/Shadow */}
        <rect x={sL + 16} y={sTop} width={sW - 32} height={sH} fill="#0f172a" opacity="0.6" />

        <g clipPath="url(#p-sump-clip)">
          <rect x={sL + 16} y={wY} width={sW - 32} height={sH} fill="url(#p-water)" />
          {/* Animated Water Surface Waves */}
          <path fill="hsl(200 80% 95%)" fillOpacity="0.5">
            <animate attributeName="d" values={`M ${sL + 16} ${wY} Q ${sCx - 70} ${wY - 6} ${sCx} ${wY} Q ${sCx + 70} ${wY + 6} ${sR - 16} ${wY} V ${wY + 10} H ${sL + 16} Z;M ${sL + 16} ${wY} Q ${sCx - 70} ${wY + 6} ${sCx} ${wY} Q ${sCx + 70} ${wY - 6} ${sR - 16} ${wY} V ${wY + 10} H ${sL + 16} Z;M ${sL + 16} ${wY} Q ${sCx - 70} ${wY - 6} ${sCx} ${wY} Q ${sCx + 70} ${wY + 6} ${sR - 16} ${wY} V ${wY + 10} H ${sL + 16} Z`} dur="3s" repeatCount="indefinite" />
          </path>
        </g>

        <rect x={sCx - 70} y={sBot + 24} width={140} height={28} rx="6" fill="#0f172a" stroke="#475569" strokeWidth="1.5" />
        <text x={sCx} y={sBot + 43} textAnchor="middle" fontSize="13" fontWeight="800" fill="#cbd5e1" letterSpacing="1.5">INTAKE WELL</text>

        {renderPump(p1x, pump1Running, 'VT 01', pt1Val, 'left')}
        {renderPump(p2x, pump2Running, 'VT 02', pt2Val, 'right')}

        {/* LT */}
        {(() => {
          // Shifted to right side and height precisely matched to tank visually (sTop to sBot)
          const lx = sR + 60, lt = sTop, lh = sH, fillH = (levelPercent / 100) * lh;
          const barW = 46, innerW = 42, center = lx + 23;

          return (
            <g>
              <text x={center} y={lt - 12} textAnchor="middle" fontSize="12" fontWeight="800" fill="hsl(var(--foreground))">LT</text>
              <rect x={lx} y={lt} width={barW} height={lh} rx={6} fill="hsl(var(--card))" stroke="hsl(var(--border))" strokeWidth="1.2" />
              <rect x={lx + 2} y={lt + lh - fillH} width={innerW} height={fillH} rx={4.5} fill="hsl(200 70% 82%)" opacity="0.85">
                <animate attributeName="opacity" values="0.8;0.9;0.8" dur="3s" repeatCount="indefinite" />
              </rect>
              {[0, 25, 50, 75, 100].map(p => {
                const my = lt + lh - (p / 100) * lh;
                return (
                  <g key={p}>
                    <line x1={lx + barW} y1={my} x2={lx + barW + 8} y2={my} stroke="hsl(var(--muted-foreground))" strokeWidth="1.2" />
                    <text x={lx + barW + 12} y={my + 3} textAnchor="start" fontSize="10" fill="hsl(var(--muted-foreground))" fontFamily="ui-monospace, monospace">{p}</text>
                  </g>
                );
              })}
              {fillH > 0 && <polygon points={`${lx - 4},${lt + lh - fillH} ${lx - 12},${lt + lh - fillH - 5} ${lx - 12},${lt + lh - fillH + 5}`} fill="hsl(var(--primary))" />}
              <text x={center} y={lt + lh + 24} textAnchor="middle" fontSize="18" fontWeight="800" fill="hsl(var(--foreground))" fontFamily="ui-monospace, monospace">{ltVal.toFixed(1)}</text>
              <text x={center} y={lt + lh + 40} textAnchor="middle" fontSize="12" fontWeight="700" fill="hsl(var(--muted-foreground))">{ltTag?.unit ?? '%'}</text>
              <text x={center} y={lt + lh + 58} textAnchor="middle" fontSize="13" fontWeight="800" fill="hsl(var(--muted-foreground))">Sump Level</text>
            </g>
          );
        })()}


      </svg>
    </div>
  );
};

export default IntakeProcessSimulation;
