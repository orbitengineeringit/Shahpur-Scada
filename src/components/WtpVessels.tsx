import { memo, useId, type CSSProperties } from 'react';
import type { WtpFilterMode, WtpProcessActivity, WtpPumpState } from '@/lib/wtpProcessActivity';
import './WtpVessels.css';

function vesselMotion(flow: number | null, rpm?: number | null, slowDrive = false): CSSProperties {
  const period = rpm && rpm > 0 ? Math.min(slowDrive ? 48 : 3.8, Math.max(slowDrive ? 8 : 0.58, 60 / rpm)) : undefined;
  return {
    '--wtpv-flow-period': flow && flow > 0 ? `${Math.max(0.72, 2.2 / (1 + flow / 105))}s` : undefined,
    '--wtpv-drive-period': period === undefined ? undefined : `${period}s`,
  } as CSSProperties;
}

const liveDriveFill = {
  Run: '#38c395', Off: '#8c9ca4', Trip: '#ea5f56', Conflict: '#ea5f56', Fault: '#ea5f56', Stale: '#dfad59', 'No data': '#667883',
};

function Current({ d, color = 'var(--wv-water-glint)', width = 2.6 }: { d: string; color?: string; width?: number }) {
  return <g fill="none" stroke={color} strokeLinecap="round">
    <path d={d} strokeWidth={width + 2.6} opacity=".26"/>
    <path d={d} className="wtpv-directional-current" strokeDasharray="10 12 2 12" strokeWidth={width}/>
  </g>;
}

function Aggregate({ id, sand = false }: { id: string; sand?: boolean }) {
  const pitch = sand ? 3.5 : 6.5;
  const colors = sand
    ? ['#b19361','#d6bd83','#997740','#d9cca7','#a8854a']
    : ['#76817d','#a6aca0','#66736d','#8b9693','#b7b5a4'];
  return <pattern id={id} patternUnits="userSpaceOnUse" width={11 * pitch} height={8 * pitch}>
    <rect width={11 * pitch} height={8 * pitch} fill={sand?'#856736':'#38454c'}/>
    {Array.from({length:88},(_,i) => {
      const x = (i % 11 + .5 + Math.sin(i * 7) * .19) * pitch;
      const y = (Math.floor(i/11) + .5 + Math.cos(i * 3) * .21) * pitch;
      const r = pitch * (.26 + (i * 17 % 11) / 50);
      return <g key={i} transform={`translate(${x} ${y}) rotate(${i * 73 % 180}) scale(${r})`}>
        <path d="M-1 -.16Q-.8 -.8 -.21 -.85L.64 -.68Q1 -.45 .95 .2L.46 .74Q-.18 1 -.69 .68Z"
          fill={colors[i * 7 % colors.length]}/>
        <path d="M-.76 -.25Q-.48 -.74 .12 -.68" fill="none" stroke="#fff7d8" strokeWidth=".19" opacity=".61"/>
      </g>;
    })}
  </pattern>;
}
function Materials({ id }: { id: string }) {
  return <defs>
    <linearGradient id={id + 'steel'}><stop stopColor="var(--wv-steel-edge)"/><stop offset=".14" stopColor="var(--wv-steel-mid)"/><stop offset=".34" stopColor="var(--wv-steel-light)"/><stop offset=".56" stopColor="#9aaab0"/><stop offset=".84" stopColor="#697a82"/><stop offset="1" stopColor="#dbe3e3"/></linearGradient>
    <linearGradient id={id + 'concrete'} x2=".35" y2="1"><stop stopColor="var(--wv-cement-top)"/><stop offset=".43" stopColor="var(--wv-cement-mid)"/><stop offset="1" stopColor="var(--wv-cement-shadow)"/></linearGradient>
    <linearGradient id={id + 'liquid'} x2="0" y2="1"><stop stopColor="var(--wv-water-light)"/><stop offset=".13" stopColor="var(--wv-water-mid)"/><stop offset=".78" stopColor="var(--wv-water-deep)"/><stop offset="1" stopColor="var(--wv-water-bottom)"/></linearGradient>
    <linearGradient id={id + 'surface'} x2=".8" y2="1"><stop stopColor="var(--wv-water-bottom)"/><stop offset=".5" stopColor="var(--wv-water-mid)"/><stop offset="1" stopColor="var(--wv-water-light)"/></linearGradient>
    <linearGradient id={id + 'blue'}><stop stopColor="#093561"/><stop offset=".27" stopColor="#067dc9"/><stop offset=".5" stopColor="#159fe1"/><stop offset=".8" stopColor="#08508e"/><stop offset="1" stopColor="#042b56"/></linearGradient>
    <linearGradient id={id + 'glass'}><stop stopColor="#ebffff" stopOpacity=".42"/><stop offset=".15" stopColor="#dcffff" stopOpacity=".05"/><stop offset=".75" stopColor="#dcffff" stopOpacity=".03"/><stop offset="1" stopColor="#1c6779" stopOpacity=".32"/></linearGradient>
    <filter id={id + 'stone-noise'} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
      <feTurbulence type="fractalNoise" baseFrequency=".42 .55" numOctaves="3" stitchTiles="stitch"/>
      <feColorMatrix type="saturate" values="0"/>
    </filter>
    <pattern id={id + 'stone'} patternUnits="userSpaceOnUse" width="96" height="75">
      <rect width="96" height="75" filter={`url(#${id}stone-noise)`} opacity=".31"/>
      <path d="M8 3l3 1m27 17 2 -1m30 8 3 1m-46 31h3m43 8 2 -1" stroke="#45473e" opacity=".4"/>
    </pattern>
    <pattern id={id + 'caustics'} width="67" height="22" patternUnits="userSpaceOnUse">
      <path d="M-5 10q9 -6 19 -2t16 1q9 -4 17 -2t24 -3M3 17q8 -2 14 1m12 -4q8 1 13 -2m10 6q8 -3 14 -2"
        fill="none" stroke="var(--wv-water-glint)" strokeWidth=".9" strokeLinecap="round"/>
      <path d="M2 7q6 -4 9 -2m22 3q4 -2 8 -2m13 -4h4" fill="none" stroke="#fff" strokeWidth="1.35" opacity=".7"/>
    </pattern>
    <radialGradient id={id + 'vignette'}>
      <stop offset=".48" stopColor="#082f38" stopOpacity="0"/><stop offset="1" stopColor="#001d28" stopOpacity=".38"/>
    </radialGradient>
    <linearGradient id={id + 'meniscus'} x2="0" y2="1"><stop stopColor="#e6ffff" stopOpacity=".85"/><stop offset=".38" stopColor="#8decdf" stopOpacity=".2"/><stop offset="1" stopColor="#296963" stopOpacity=".1"/></linearGradient>
    <Aggregate id={id + 'sand'} sand/>
    <Aggregate id={id + 'gravel'}/>
    <pattern id={id + 'unknown'} width="10" height="10" patternUnits="userSpaceOnUse"><rect width="10" height="10" fill="var(--wv-cement-mid)"/><path d="M0 10L10 0" stroke="var(--wv-cement-shadow)"/></pattern>
  </defs>;
}

function Rail({ x, y, width }: { x: number; y: number; width: number }) {
  const sections = Math.ceil(width / 49);
  return <g transform={`translate(${x} ${y})`} stroke="#dda009" strokeWidth="3" fill="none">
    <path d={`M0 22V4Q0 0 4 0H${width - 4}Q${width} 0 ${width} 4V22 M0 10H${width}`}/>
    {Array.from({ length: sections - 1 }, (_, i) => <path key={i} d={`M${(i + 1) * width / sections} 0v23`}/>)}
    <path d={`M3 1H${width - 4}`} stroke="#ffe374" strokeWidth="1"/>
  </g>;
}

function Drive({ x, y, id, state, active }: { x: number; y: number; id: string; state: WtpPumpState; active: boolean }) {
  return <g transform={`translate(${x} ${y})`}>
    <path d="M-12 31h24v7h-24zM-19 37h38v5h-38z" fill={`url(#${id}steel)`} stroke="#4d616a"/>
    <rect x="-12" width="24" height="32" rx="4" fill={`url(#${id}blue)`} stroke="#063b69"/>
    <ellipse rx="12" ry="3.4" fill="#188bca" stroke="#074570"/>
    <path d="M-8 6v21m4-21v21m4-21v21m4-21v21m4-21v21" stroke="#064e88" strokeWidth="1.8"/>
    <rect x="-17" y="17" width="8" height="11" rx="1" fill="#1373ae" stroke="#144f75"/>
    <rect x="-8" y="30" width="16" height="18" rx="3" fill={`url(#${id}steel)`} stroke="#3b5963"/>
    <circle cx="10" cy="3" r="3.5" fill={liveDriveFill[state]} stroke="#243944" />
    <g transform="translate(0 39) scale(1 .36)">
      <g className={active ? 'wtpv-drive-coupling' : undefined}>
        {[0,90,180,270].map(angle => <circle key={angle} cx="0" cy="7" r="1.6" transform={`rotate(${angle})`} fill="#41636d"/>)}
      </g>
    </g>
  </g>;
}

function Basin({ x, y, width, height, id, name, level = null, showDesignSection = false, baffles = 0, sludge = false,
  inflow = false, outflow = false, rate = null, inletHeight = 24, outletHeight = 40 }: {
  x: number; y: number; width: number; height: number; id: string; level?: number | null;
  name: string; baffles?: number; sludge?: boolean; inflow?: boolean; outflow?: boolean;
  inletHeight?: number; outletHeight?: number; rate?: number | null; showDesignSection?: boolean;
}) {
  const innerWidth = width - 37;
  const innerHeight = height - 37;
  const fillHeight = level === null ? (showDesignSection ? innerHeight * .85 : 0)
    : innerHeight * Math.max(0, Math.min(100, level)) / 100;
  const surfaceY = innerHeight - fillHeight;
  const active = inflow || outflow;
  const chamberWidth = innerWidth / (baffles + 1);
  const contactCurrent = Array.from({ length: baffles + 2 }, (_, i) => {
    const position = Math.min(innerWidth, i * chamberWidth);
    const atPort = i === 0 || i === baffles + 1;
    const depth = atPort ? inletHeight : i % 2 === 0 ? surfaceY + 4 : innerHeight - 5;
    return `${i === 0 ? 'M' : 'L'}${position} ${depth}`;
  }).join('');
  return <g transform={`translate(${x} ${y})`} style={vesselMotion(rate)} data-vessel={name} data-vessel-level={level ?? 'unknown'}
      data-inflow={inflow} data-outflow={outflow}>
    <path d={`M0 16L13 0H${width - 12}L${width} 16V${height}H0Z`} fill={`url(#${id}concrete)`} stroke="#938f85" strokeWidth="1.7"/>
    <path d={`M0 16L13 0h${width - 25}l12 16H0Z`} fill="var(--wv-cement-top)"/>
    <rect y="17" width={width} height={height - 17} fill={`url(#${id}stone)`}/>
    <path d={`M1 ${height-1}H${width-1}V16`} fill="none" stroke="var(--wv-frame-edge)" strokeWidth="3"/>
    <path d={`M1 16H${width-1}M18 ${height-19}H${width-18}`} stroke="var(--wv-steel-light)" opacity=".65"/>
    <path d={`M15 17v${height-34}M${width-17} 17v${height-34}`} stroke="var(--wv-frame-edge)" strokeWidth="4"/>
    {[8,width-9].map(bx => <g key={bx} fill="var(--wv-steel-mid)" stroke="var(--wv-frame-edge)">{[24,height-9].map(by => <circle key={by} cx={bx} cy={by} r="2.4"/>)}</g>)}

    <svg x="18" y="16" width={innerWidth} height={innerHeight} viewBox={`0 0 ${innerWidth} ${innerHeight}`} overflow="hidden">
      <rect width={innerWidth} height={innerHeight} fill={level === null ? `url(#${id}unknown)` : 'var(--wv-basin-interior)'}/>
      {fillHeight > 0 && <g>
        <rect x="0" y={surfaceY} width={innerWidth} height={fillHeight} fill={sludge ? '#88643e' : `url(#${id}liquid)`}/>
        <path d={`M0 ${surfaceY}h${innerWidth}v${Math.min(11, fillHeight)}q-${innerWidth / 2} 4 -${innerWidth} 0z`} fill={sludge ? '#a68355' : `url(#${id}surface)`}/>
        <rect y={surfaceY} width={innerWidth} height={fillHeight} fill={`url(#${id}vignette)`}/>
        {!sludge && <svg y={surfaceY} width={innerWidth} height={fillHeight} overflow="hidden">
          <rect x="-67" width={innerWidth+134} height={Math.min(17,fillHeight)} fill={`url(#${id}caustics)`} opacity=".58" className={active ? 'wtpv-caustics' : undefined}/>
          <rect width={innerWidth} height={Math.min(3,fillHeight)} fill={`url(#${id}meniscus)`}/>
          {active && fillHeight > 8 && <WaterBubbles width={innerWidth} depth={fillHeight}/>}
        </svg>}
        <g className={active ? 'wtpv-current' : undefined} fill="none" stroke={sludge ? '#ddc599' : '#d9ffff'} strokeLinecap="round" opacity=".73">
          {Array.from({ length: Math.ceil(innerWidth / 33) + 1 }, (_, i) => <path key={i} d={`M${i * 32 - 15} ${surfaceY + 4 + i % 3 * 2}q5 -3 12 0t12 0`}/>)}
        </g>
        {baffles === 0 && inflow && (sludge ? (
          <g data-process="sludge-sump-inlet">
            {[53,118].map(cx => <Current key={cx} d={`M${cx} -4V${surfaceY + 5}q2 6 12 7`} color="#eac590" width={2.6}/>)}
          </g>
        ) : (
          <g data-process="inlet-jet">
            <Current d={`M0 ${inletHeight}Q18 ${inletHeight} 40 ${surfaceY + 9}t62 1`} width={3}/>
            <Current d={`M0 ${inletHeight+4}Q20 ${inletHeight+4} 42 ${surfaceY + 16}t52 4`} width={1.2}/>
          </g>
        ))}
        {baffles === 0 && outflow && outletHeight >= surfaceY && (
          <g data-process="outlet-draw">
            <Current d={`M${innerWidth - 99} ${Math.min(innerHeight - 4, surfaceY + 9)}Q${innerWidth - 61} ${surfaceY + 12} ${innerWidth - 38} ${outletHeight}T${innerWidth} ${outletHeight}`}
              color={sludge ? '#eac590' : undefined} width={2.5}/>
            <Current d={`M${innerWidth - 83} ${innerHeight - 5}Q${innerWidth - 55} ${innerHeight - 5} ${innerWidth - 33} ${outletHeight + 2}T${innerWidth} ${outletHeight + 1}`}
              color={sludge ? '#eac590' : undefined} width={1.4}/>
          </g>
        )}
      </g>}
      {inflow && level === 0 && (
        <g data-process="empty-basin-inlet">
          <Current d={`M0 ${inletHeight}q17 0 38 ${innerHeight - inletHeight - 4}h26`} width={2.5}/>
        </g>
      )}
      {Array.from({ length: baffles }, (_, i) => {
        const position = (i + 1) * chamberWidth;
        const top = i % 2 === 0 ? 0 : Math.max(0, surfaceY + 8);
        const bottom = i % 2 === 0 ? innerHeight - 9 : innerHeight;
        return <path key={i} d={`M${position} ${top}l-4 4V${bottom}h6V${top + 4}l4-4Z`} fill={`url(#${id}steel)`} stroke="#79898b"/>;
      })}
      {baffles > 0 && active && fillHeight > 15 && (
        <g data-process="baffled-contact-flow"><Current d={contactCurrent} width={2.3}/></g>
      )}
      <rect width={innerWidth} height={innerHeight} fill={`url(#${id}glass)`} stroke="#4e6668" strokeWidth="2"/>
    </svg>
  </g>;
}

function WaterBubbles({ width, depth }: { width: number; depth: number }) {
  return <g className="wtpv-bubbles" fill="none" stroke="var(--wv-water-glint)" strokeWidth=".8">
    {Array.from({length:Math.ceil(width/15)},(_,i) => {
      const radius = 0.8 + (i % 4) * .4;
      return <g key={i} className="wtpv-bubble" style={{animationDelay:`-${i*.47}s`}}>
        <circle cx={6+(i*37)%(width-8)} cy={5+(i*19)%Math.max(1,depth-8)} r={radius}/>
        <circle cx={6+(i*37)%(width-8)-radius*.3} cy={5+(i*19)%Math.max(1,depth-8)-radius*.4} r=".45" fill="#fff"/>
      </g>;
    })}
  </g>;
}

function Mixer({ id, state, rpm }: { id: string; state: WtpPumpState; rpm: number | null }) {
  const active = state === 'Run' && rpm !== 0;
  return <g data-vessel="Flash mixer" data-state={state} data-active={active} style={vesselMotion(null, rpm)}>
    <path d="M476 452Q524 434 577 452V586Q571 604 526 604Q479 602 476 585Z" fill={`url(#${id}steel)`} stroke="#536772" strokeWidth="2"/>
    <path d="M481 458Q525 470 571 458V575Q526 592 481 575Z" fill="#69878c"/>
    <path d="M481 495Q525 480 571 495V575Q525 589 481 575Z" fill={`url(#${id}liquid)`}/>
    <ellipse cx="526" cy="496" rx="45" ry="7" fill={`url(#${id}surface)`} stroke="#8edcde"/>
    <svg x="482" y="499" width="88" height="76" overflow="hidden">
      <rect x="-67" width="222" height="12" fill={`url(#${id}caustics)`} opacity=".57" className={active ? 'wtpv-caustics' : undefined}/>
      {active && <g data-process="mixer-recirculation" opacity=".84">
        <Current d="M0 19h12q8 1 9 13l2 12q2 14 16 15" width={3.4}/>
        <Current d="M44 54q31 4 36-17 5-18-11-24-10-4-24 4" width={3.2}/>
        <Current d="M43 48q-22 4-29-6-6-9 3-16" width={2.5}/>
        <WaterBubbles width={88} depth={76}/>
      </g>}
    </svg>
    <path d="M526 407v142" stroke="#435a63" strokeWidth="6"/><path d="M525 407v140" stroke="#cbd9d8" strokeWidth="2"/>
    <g transform="translate(526 509) scale(1 .25)">
      <g className={active ? 'wtpv-drive-coupling' : undefined} fill="#c9ffff" opacity=".78">
        {[11,20,31].map((radius, i) => <path key={radius} d={`M${-radius} 0A${radius} ${radius} 0 0 1 0 ${-radius}`}
          transform={`rotate(${i * 35})`} fill="none" stroke="currentColor" color="#b4f6ee" strokeWidth="1.6"/>)}
      </g>
    </g>
    <g transform="translate(526 548) scale(1 .38)"><g className={active ? 'wtpv-impeller' : undefined}>
      {[0,120,240].map(angle => <g key={angle} transform={`rotate(${angle})`}>
        <path d="M0 2L22 -6Q33 -3 29 6L3 9Z" fill="#385d67"/>
        <path d="M0 -3L22 -11Q33 -8 29 1L3 4Z" fill={active && angle === 0 ? '#d8f8fa' : `url(#${id}steel)`} stroke="#3c575e" strokeWidth="1.3"/>
        <path d="M6 -1L24 -8" stroke="#ecffff" strokeWidth="1.1" opacity=".72"/>
      </g>)}
      <circle r="6" fill={`url(#${id}steel)`} stroke="#4b6d75"/>
    </g></g>
    <path d="M481 458Q525 470 571 458V575Q525 590 481 575Z" fill={`url(#${id}glass)`}/>
    <ellipse cx="526" cy="452" rx="50" ry="11" fill="none" stroke="#a6b4b8" strokeWidth="6"/>
    <g fill="none" stroke="#e3a514" strokeWidth="2.7"><ellipse cx="526" cy="427" rx="49" ry="11"/><ellipse cx="526" cy="439" rx="49" ry="11"/>{[479,496,526,557,573].map((x,i)=><path key={x} d={`M${x} ${428 + (i%4 ? 7 : 0)}v22`}/>)}</g>
    <Drive x={526} y={373} id={id} state={state} active={active}/>
  </g>;
}

function Clarifier({ id, state, rpm, inletFlow, flowRate }: {
  id: string; state: WtpPumpState; rpm: number | null; inletFlow: boolean; flowRate: number | null;
}) {
  const active = state === 'Run' && rpm !== 0;
  return <g data-vessel="Clariflocculator" data-state={state} data-active={active} style={vesselMotion(flowRate, rpm, true)}>
    {[651,703,930,1006].map(x=><path key={x} d={`M${x} 557h21v66l-9 7-12-3Z`} fill={`url(#${id}concrete)`} stroke="#8b887d"/>)}
    <path d="M633 447Q841 354 1045 447V552Q1040 589 907 604L862 632H820L769 605Q646 594 633 553Z" fill={`url(#${id}concrete)`} stroke="#838781" strokeWidth="2"/>
    <path d="M640 460Q835 516 1038 460V537Q990 572 899 574L861 615H822L783 574Q682 572 640 538Z" fill={`url(#${id}liquid)`} stroke="#608285"/>
    <path d="M662 529Q838 560 1010 529L862 614H822Z" fill="#608f73" opacity=".8"/>
    <path d="M685 541Q830 568 984 541L857 612H823Z" fill="#82794b" opacity=".76"/>
    <ellipse cx="839" cy="451" rx="203" ry="49" fill={`url(#${id}surface)`} stroke="#738b8b" strokeWidth="6"/>
    <clipPath id={id+'round-water'}><ellipse cx="839" cy="451" rx="200" ry="45"/></clipPath>
    <g clipPath={`url(#${id}round-water)`}>
      <rect x="565" y="402" width="540" height="98" fill={`url(#${id}caustics)`} opacity=".44" className={inletFlow ? 'wtpv-caustics' : undefined}/>
      <ellipse cx="839" cy="451" rx="202" ry="46" fill={`url(#${id}vignette)`}/>
      {inletFlow && <g data-process="clarifier-overflow">
        <Current d="M848 453q78-6 128-24t60 16" width={2.8}/>
        <Current d="M831 450q-76-14-129-3t-62-9" width={2.8}/>
      </g>}
    </g>
    {[78,123,169].map(r=><ellipse key={r} cx="839" cy="453" rx={r} ry={r*.215} fill="none" stroke="#94dedc" opacity=".64" strokeWidth="1.4"/>)}
    <ellipse cx="839" cy="454" rx="47" ry="12" fill="#225761" stroke="#a8c4c3" strokeWidth="2.7"/>
    <ellipse cx="839" cy="451" rx="42" ry="8" fill={`url(#${id}surface)`} stroke="#497b7c"/>
    <path d="M644 519H800q28 0 29-25v-29" stroke="#3d6871" strokeWidth="10" fill="none" opacity=".8"/>
    <path d="M644 517H798q28 0 28-24v-28" stroke="#8badae" strokeWidth="3" fill="none" opacity=".65"/>
    {inletFlow && <g data-process="clarifier-settling">
      <Current d="M646 519H798q31 0 31-28v-27" width={2.2}/>
      {Array.from({ length: 23 }, (_, index) => {
        const x = 704 + index * 12;
        const y = 487 + (index * 13 % 27);
        return <circle key={index} cx={x} cy={y} r={1.05 + index % 3 * .34} fill="#debc87"
          className="wtpv-floc" style={{ animationDelay: `-${index * .29}s` }}/>;
      })}
    </g>}
    <path d="M843 402v174" stroke={`url(#${id}steel)`} strokeWidth="14"/>
    <g transform="translate(843 547) scale(1 .21)"><g className={active ? 'wtpv-scraper' : undefined}>
      {[0,180].map(angle=><g key={angle} transform={`rotate(${angle})`} stroke="#b4cdbe" fill="none">
        <path d="M0 0h176L18 -41Z" strokeWidth="7"/><path d="M28 -36L47 0l21-28L85 0l20-19 19 19 14-11 14 11" strokeWidth="4"/>
        {active && angle === 0 && <circle cx="167" r="10" fill="#ffd05d" opacity=".82"/>}
        {[40,72,104,136,165].map(x=><path key={x} d={`M${x} 0l-10 28`} stroke="#63766b" strokeWidth="9"/>)}
      </g>)}
    </g></g>
    <path d="M648 487l38 12v54l-38-16Zm49 15 19 3v50l-19-2Zm276-5 13-4v55l-13 5Z" fill="#ddffff" opacity=".17"/>
    <path d="M642 463Q840 526 1037 464V537Q986 571 899 574L861 615H822L783 574Q674 571 642 538Z" fill={`url(#${id}glass)`}/>
    <path d="M636 452Q641 494 836 502Q1027 501 1041 455" fill="none" stroke={`url(#${id}steel)`} strokeWidth="9"/>
    <path d="M649 463Q715 499 840 498Q960 496 1027 462" fill="none" stroke="#cedcdb" strokeWidth="2.9" strokeDasharray="3 4" opacity=".82"/>
    <path d="M634 550Q697 594 781 595L821 629H862L903 596Q1005 590 1042 551V560Q1006 601 911 609L865 637H815L769 608Q667 600 634 567Z" fill={`url(#${id}stone)`}/>
    <g fill="none" stroke="#e3a00c" strokeWidth="3"><ellipse cx="840" cy="421" rx="204" ry="48"/><ellipse cx="840" cy="432" rx="204" ry="48"/>
      {Array.from({ length: 26 },(_,i)=>{const a=i*Math.PI/13;const x=840+204*Math.cos(a), y=421+48*Math.sin(a);return <path key={i} d={`M${x} ${y}v28`}/>;})}
    </g>
    <path d="M836 418l140 62-14 9-142-64Z" fill={`url(#${id}steel)`} stroke="#63747a"/>
    <path d="M838 419v-17l136 61v17m-102-62v17m34-2v17m35-2v17" fill="none" stroke="#e6aa12" strokeWidth="3"/>
    <Drive x={843} y={356} id={id} state={state} active={active}/>
  </g>;
}

function Filter({ y, id, number, mode, flow, washFlow }: {
  y: number; id: string; number: number; mode: WtpFilterMode | null; flow: number | null; washFlow: number | null;
}) {
  const backwashing = mode === 'backwash' && washFlow !== 0;
  const downflow = (mode === 'filter' || mode === 'rinse') && flow !== 0;
  const active = backwashing || downflow || mode === 'air-scour';
  const sandTop = backwashing ? 29 : 39;
  return <g transform={`translate(1249 ${y})`} style={vesselMotion(backwashing ? washFlow : flow)}
    data-vessel={`Filter ${number}`} data-operation={mode ?? 'unavailable'}>
    <path d="M0 10L12 0h284l14 10v123H0Z" fill={`url(#${id}concrete)`} stroke="#938e82" strokeWidth="2"/>
    <rect width="308" y="11" height="122" fill={`url(#${id}stone)`}/>
    {[16,169].map(x => <g key={x} transform={`translate(${x} 18)`}>
      <rect width="139" height="98" fill="#627979"/>
      <rect y="7" width="139" height="91" fill={`url(#${id}liquid)`}/>
      <svg y="7" width="139" height={sandTop - 7} overflow="hidden">
        <rect x="-67" width="273" height="12" fill={`url(#${id}caustics)`} opacity=".6"
          className={active ? 'wtpv-caustics' : undefined}/>
      </svg>
      <path className={active ? 'wtpv-filter-flow' : undefined} d="M1 12q13 -4 27 0t28 0t28 0t28 0t26 0"
        fill="none" stroke="#cafffc" strokeDasharray="14 5"/>
      <rect y={sandTop} width="139" height={66 - sandTop} fill={`url(#${id}sand)`} opacity={backwashing ? '.7' : '1'}/>
      <rect y="66" width="139" height="20" fill={`url(#${id}gravel)`}/>
      <path d="M2 86H137V96H2Z" fill="#325964" stroke="#779095" strokeWidth="1.5"/>
      <path d="M7 91H132" stroke="#adc5c6" strokeWidth="1.4"/>
      {[15,42,69,96,123].map(cx => <path key={cx} d={`M${cx - 3} 87h6l-1 3h-4z`} fill="#b0c6c4"/>)}
      {downflow && (
        <g data-process={mode === 'rinse' ? 'rinse-downflow' : 'downflow-and-underdrain'}>
          {[15,42,69,96,123].map(cx => <Current key={cx} d={`M${cx - 6} 19q9 11 6 25t0 20v24`} width={2.7}/>)}
          <Current d="M8 92H135" width={2.45}/>
        </g>
      )}
      {backwashing && (
        <g data-process="backwash-upflow">
          <Current d="M135 92H9" width={2.45}/>
          {[15,42,69,96,123].map(cx => <Current key={cx} d={`M${cx} 89v-26q-3-9 0-19t${cx % 2 ? 6 : -6} -21`} width={2.85}/>)}
          {Array.from({ length: 18 }, (_, i) => <circle key={i} className="wtpv-lifted-solids"
            cx={8 + (i * 29) % 122} cy={44 + (i * 11) % 8} r={1 + i % 3 * .45} fill="#ecd19b"
            style={{ animationDelay: `-${i * .31}s` }}/>)}
          <path d="M4 15l9 6h109l13-6v6l-13 6H13l-9-6z" fill="#a58b61" stroke="#d2bf97"/>
          <Current d="M7 17l8 5h108l12-5" color="#f1d1a0" width={2.3}/>
        </g>
      )}
      {mode === 'air-scour' && (
        <g data-process="air-scour-bubbles" fill="none" stroke="#e1f9ff" strokeWidth="1.25">
          {Array.from({ length: 20 }, (_, i) => <circle key={i} className="wtpv-scour-bubble"
            cx={9 + (i * 19) % 121} cy={75 + (i * 7) % 9} r={1.25 + i % 3 * .45}
            style={{ animationDelay: `-${i * .21}s` }}/>)}
        </g>
      )}
      <rect width="139" height="98" fill={`url(#${id}glass)`} stroke="#667879" strokeWidth="2"/>
    </g>)}
    <Rail x={10} y={-24} width={288}/>
  </g>;
}

export default memo(function WtpVessels({ activity, clearLevel }: {
  activity: WtpProcessActivity; clearLevel: number | null;
}) {
  const { driveStates, rates, rpm } = activity;
  const inletFlow = activity.inletFlow === true;
  const sludgeFlow = activity.sludgeFlow === true;
  const contactFlow = activity.contactFlow === true;
  const clearInflow = activity.clearInflow === true;
  const clearOutflow = activity.outletFlow === true;
  const id = useId() + '-v-';
  return <g aria-hidden="true" className="wtpv-materials">
    <Materials id={id}/>
    <Basin id={id} name="Raw water channel" x={82} y={484} width={315} height={113} showDesignSection
      inflow={inletFlow} outflow={inletFlow} rate={rates.inlet} inletHeight={22} outletHeight={18}/>
    <Mixer id={id} state={driveStates.mixer} rpm={rpm.mixer}/>
    <Clarifier id={id} state={driveStates.clarifier} rpm={rpm.clarifier} inletFlow={inletFlow} flowRate={rates.inlet}/>
    {activity.filters.map((mode, i) => (
      <Filter key={i} id={id} y={i === 0 ? 353 : 524} number={i + 1} mode={mode}
        flow={rates.filterBed[i]} washFlow={rates.backwash[i]}/>
    ))}
    <Basin id={id} name="Sludge recirculation sump" x={614} y={697} width={212} height={88} sludge showDesignSection
      outflow={sludgeFlow} rate={rates.sludge} outletHeight={34}/>
    <Basin id={id} name="Chlorine contact chamber" x={288} y={841} width={274} height={87} baffles={5} showDesignSection
      inflow={contactFlow} outflow={contactFlow} rate={rates.contact} inletHeight={19}/>
    <Basin id={id} name="Clear water storage" x={680} y={808} width={465} height={121} level={clearLevel}
      inflow={clearInflow} outflow={clearOutflow} rate={rates.clearInflow ?? rates.outlet} inletHeight={51} outletHeight={42}/>
    <Rail x={826} y={787} width={254}/>
  </g>;
});
