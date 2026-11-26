import { memo, useId, type CSSProperties } from 'react';
import type { WtpProcessActivity, WtpPumpState } from '@/lib/wtpProcessActivity';
import './WtpMachinery.css';

const steel = 'url(#wtp-mach-steel)';
const blue = 'url(#wtp-mach-blue)';
const gold = 'url(#wtp-mach-gold)';
const slab = 'url(#wtp-mach-slab)';

function driveTiming(rpm: number | null, defaultPeriod: number): CSSProperties {
  const period = rpm !== null && rpm > 0 ? Math.max(.55, Math.min(4, 60 / rpm)) : defaultPeriod;
  return { '--wtp-motor-period': `${period}s` } as CSSProperties;
}

function Plinth({ x, y, width, height }: { x: number; y: number; width: number; height: number }) {
  return <g transform={`translate(${x} ${y})`}>
    <ellipse cx={width / 2 + 7} cy={height + 3} rx={width * .52} ry="7" fill="url(#wtp-mach-shadow)" />
    <path d={`M0 0 l10 -8 h${width} l-10 8 Z`} fill="var(--wm-slab-top)" stroke="var(--wm-slab-edge)" />
    <rect width={width} height={height} fill={slab} stroke="var(--wm-slab-edge)" />
    <path d={`M${width} 0 l10 -8 v${height} l-10 8 Z`} fill="var(--wm-slab-edge)" />
    <rect width={width} height={height} fill="url(#wtp-mach-aggregate)" />
    <path d={`M1 1 H${width - 1}`} stroke="var(--wm-glint)" strokeWidth="1.4" opacity=".7" />
    {Array.from({ length: Math.floor(width / 105) }, (_, i) => (
      <path key={i} d={`M${(i + 1) * 104} 1 v${height - 2}`} stroke="#93938d" strokeWidth=".9" />
    ))}
  </g>;
}

function Shed({ x, y, width, height }: { x: number; y: number; width: number; height: number }) {
  return <g transform={`translate(${x} ${y})`}>
    {[16, width - 25].map(post => <g key={post} fill={steel} stroke="#6f7980">
      <path d={`M${post} 13 h8 v${height} h-8 z`} />
      <path d={`M${post + 2} 14 l32 0 -32 30 Z`} fill="none" strokeWidth="3" />
    </g>)}
    <path d={`M0 15 L22 0 H${width - 18} L${width} 15 l-7 9 H9 Z`} fill="url(#wtp-mach-roof)" stroke="#17416a" />
    <path d={`M4 16 H${width - 2} L${width - 7} 23 H10 Z`} fill="#284451" />
    {Array.from({ length: Math.floor((width - 28) / 9) }, (_, i) => (
      <path key={i} d={`M${22 + i * 9} 2 l-13 12`} stroke="#8aceff" strokeOpacity=".65" strokeWidth="1.7" />
    ))}
    <path d={`M13 24 H${width - 12}`} stroke="#8297a0" strokeWidth="3" />
    {width > 350 && <g stroke="#71838b" fill="none">
      <path d={`M36 28 H${width - 36} M36 43 H${width - 36}`} strokeWidth="3" />
      {Array.from({ length: 12 }, (_, i) => <path key={i} d={`M${36 + i * 68} 28 l34 15 34 -15`} strokeWidth="2.2" />)}
    </g>}
  </g>;
}

function Guardrail({ x, y, width, height = 38 }: { x: number; y: number; width: number; height?: number }) {
  const bays = Math.ceil(width / 47);
  return <g transform={`translate(${x} ${y})`} fill="none" strokeLinecap="round">
    <path d={`M0 0 H${width} M0 ${height / 2} H${width}`} stroke="#956311" strokeWidth="4" />
    <path d={`M0 -1 H${width} M0 ${height / 2 - 1} H${width}`} stroke="#ffca35" strokeWidth="2.3" />
    {Array.from({ length: bays + 1 }, (_, i) => <path key={i} d={`M${width * i / bays} 0 v${height}`} stroke="#e7a518" strokeWidth="2.6" />)}
  </g>;
}

function Pump({ x, y, scale = 1, state, name, rpm, air = false, fluidMoving = false }: {
  x: number; y: number; scale?: number; state: WtpPumpState; name: string; rpm: number | null;
  air?: boolean; fluidMoving?: boolean;
}) {
  const active = state === 'Run' && rpm !== 0;
  const bladePath = air ? 'M0 -1 Q-3 -8 4 -7 Q8 -5 4 -2 L1 1Z' : 'M0 -1 Q1 -8 6 -6 Q3 -4 3 0 Z';
  return <g transform={`translate(${x} ${y}) scale(${scale})`} style={driveTiming(rpm, 1.05)}
    data-equipment={name} data-state={state}>
    <title>{`${name} · ${state}`}</title>
    <ellipse cx="4" cy="22" rx="43" ry="5" fill="url(#wtp-mach-shadow)" />
    <path d="M-35 16 h70 l3 5 h-76 z" fill={steel} stroke="#485765" />
    <path d="M-24 8 h7 v8 h-10 z M13 8 h7 l4 8 H12 z" fill="#153c68" />
    <rect x="-31" y="-12" width="38" height="26" rx="7" fill={blue} stroke="#174064" strokeWidth="1.8" />
    <ellipse cx="-27" cy="1" rx="6" ry="12" fill="url(#wtp-mach-endcap)" stroke="#204963" />
    <g transform="translate(-29 1) scale(.46 1)">
      <circle r="8.1" fill="#102b3d" stroke="#6a8c9e" />
      <g className={active ? 'wtp-machine-fan-turn' : undefined}>
        {[0,60,120,180,240,300].map(angle => <path key={angle} d="M0 -1Q0 -8 4 -6L2 0Z"
          transform={`rotate(${angle})`} fill={active && angle === 0 ? '#ebfbff' : '#99bbc9'}/>)}
      </g>
      <circle r="1.9" fill="#96aebc" />
    </g>
    {[-5,0,5].map(slot => <path key={slot} d={`M-32 ${slot} h6`} stroke="#132c3a" strokeWidth=".8" opacity=".76" />)}
    {[-21,-17,-13,-9,-5,-1].map(fin => <g key={fin}>
      <path d={`M${fin} -11 q-2 11 0 22 l2 -1 q-2 -11 0 -20Z`} fill="url(#wtp-mach-fin)" stroke="#254658" strokeWidth=".55"/>
    </g>)}
    <path d="M-18 -14 h10" stroke="var(--wm-glint)" strokeWidth=".8"/>
    <rect x="-20" y="-17" width="13" height="6" rx="1.5" fill={blue} stroke="#0b4979" />
    <rect x="3" y="-7" width="10" height="16" rx="2" fill={steel} />
    <path d="M3 -5H9M3 7H9" stroke="#465e6c" strokeWidth="1.5"/>
    <path className={active ? 'wtp-machine-coupling' : undefined} d="M4 1H9" stroke="#92def1" strokeWidth="4" strokeDasharray="2 2" />
    <path d="M7 1 Q5 -9 15 -13 V-27 H27 V-6 Q36 1 29 10 Q22 18 13 12 Q8 9 7 1Z" fill={blue} stroke="#143f65" strokeWidth="1.8" />
    <rect x="12" y="-30" width="18" height="5" rx="1.2" fill={steel} stroke="#354958" />
    <path d="M18 -17V-25h6v8" fill="#224154" stroke="#6b9db3" strokeWidth=".8"/>
    {active && fluidMoving && (
      <path className={air ? 'wtp-machine-air' : 'wtp-machine-liquid'}
        d="M21 2c5 3 9-1 7-7l-4-8v-12"
        fill="none" stroke={air ? '#e1f7e7' : '#8af5ff'} strokeWidth="1.6" strokeLinecap="round"/>
    )}
    <circle cx="19" cy="1" r="11" fill="#35566a" stroke={active ? '#8adce9' : '#a3bcc9'} strokeWidth="2.2" />
    {[0,60,120,180,240,300].map(angle => <use key={angle} href="#wtp-mach-bolt" transform={`translate(19 1) rotate(${angle}) translate(0 -11.5) scale(.65)`} />)}
    {[-29,30].map(dx => <use key={dx} href="#wtp-mach-bolt" transform={`translate(${dx} 17)`} />)}
    <path d="M14 -26 v-5 m12 5 v-5" stroke="#3b4d56" strokeWidth="2" />
    <circle cx="19" cy="1" r="8.6" fill="#102e46" />
    <g transform="translate(19 1)">
      <g className={active ? 'wtp-machine-rotor wtp-machine-rotor--running' : 'wtp-machine-rotor'}>
        {[0, 72, 144, 216, 288].map((angle, i) => <path key={angle} transform={`rotate(${angle}) scale(1.12)`} d={bladePath}
          fill={active && i === 0 ? '#ffffff' : '#98cee4'} />)}
        {active && <path d="M0 -8A8 8 0 0 1 8 0" fill="none" stroke="#b4f8fa" strokeWidth="1.45" />}
      </g>
      <circle r="2.4" fill="#e0eaf0" />
    </g>
    <circle cx="-25" cy="-12" r="3.5"
      fill={state === 'Trip' || state === 'Fault' || state === 'Conflict' ? '#ef524c' : state === 'Run' ? '#27c582' : state === 'Stale' ? '#dfa34e' : '#84949c'}
      stroke="#273e4b" />
  </g>;
}

function DosingTank({ x, band, name, liquid, state, rpm, level }: {
  x: number; band: string; name: string; liquid: string; state: WtpPumpState; rpm: number | null; level: number | null;
}) {
  const active = state === 'Run' && rpm !== 0;
  const fillHeight = level === null ? 0 : .55 * Math.min(100, Math.max(0, level));
  const surfaceY = 243 - fillHeight;
  const cutaway = useId();
  return <g transform={`translate(${x} 0)`} style={driveTiming(rpm, 2.3)}
    data-equipment={name} data-state={state} data-water-level={level ?? undefined}>
    <title>{`${name} agitator · ${state}`}</title>
    <ellipse cy="272" rx="55" ry="6" fill="url(#wtp-mach-shadow)" />
    <path d="M-45 248 v23 h7 v-23 M38 248 v23 h7 v-23" fill={steel} />
    <path d="M-50 136 Q-50 116 0 114 Q50 116 50 136 V247 Q49 265 0 267 Q-48 265 -50 247 Z" fill={steel} stroke="#63737b" strokeWidth="1.6" />
    <path d="M-49 137 Q0 123 49 137 V246 Q0 268 -49 246Z" fill="url(#wtp-mach-brush)"/>
    <path d="M-43 153v88 M32 152v92" fill="none" stroke="var(--wm-glint)" opacity=".35" strokeWidth="1.3"/>
    <path d="M-45 247 Q0 260 45 247" fill="none" stroke="var(--wm-glint)" strokeWidth="2"/>
    <path d="M-50 140 Q0 128 50 140 V157 Q0 148 -50 157 Z" fill={band} />
    <path d="M-50 140 Q0 128 50 140 V157 Q0 148 -50 157 Z" fill="url(#wtp-mach-band-gloss)"/>
    <ellipse cx="-25" cy="127" rx="11" ry="3.6" fill={steel} stroke="#6c7e86" strokeWidth=".9"/>
    {[-39,-23,0,24,39].map(dx => <use key={dx} href="#wtp-mach-bolt" transform={`translate(${dx} ${133 + Math.abs(dx) / 12}) scale(.62)`} />)}
    <path d="M-48 199 Q0 192 48 199 M-48 244 Q0 253 48 244" fill="none" stroke="#707f87" strokeWidth="1.1" />
    <path d="M-47 134 Q0 116 47 134" fill="none" stroke="#d8e3e6" strokeWidth="4" />
    <rect x="-15" y="114" width="30" height="5" rx="2" fill={steel} stroke="#5b6973" />
    <ellipse cx="0" cy="114" rx="12" ry="3.7" fill={steel} stroke="#697e86" />
    <rect x="-8" y="96" width="16" height="19" rx="3" fill={blue} stroke="#24455a" />
    <ellipse cx="0" cy="96" rx="8" ry="2.2" fill="var(--wm-paint-lit)" stroke="var(--wm-paint-lo)" />
    <rect x="6" y="102" width="4" height="6" rx="1" fill="var(--wm-paint)" stroke="var(--wm-paint-lo)" strokeWidth=".7"/>
    <path d="M-6 96 h12 M-4 99 v12 M0 99 v12 M4 99 v12" fill="none" stroke="#67a8d0" />
    <path d="M14 119 v-13 q0 -5 5 -5 h24 q5 0 5 5 v16" fill="none" stroke="#717e82" strokeWidth="3" />
    <g data-cutaway="chemical mixer">
      <defs><clipPath id={cutaway}><rect x="-29" y="188" width="58" height="55" rx="6" /></clipPath></defs>
      <rect x="-32" y="185" width="64" height="61" rx="8" fill={steel} stroke="#5e747f" strokeWidth="1.4"/>
      <g clipPath={`url(#${cutaway})`}>
        <rect x="-29" y="188" width="58" height="55" fill={level === null ? 'url(#wtp-mach-level-unavailable)' : 'var(--wm-empty)'}/>
        {fillHeight > 0 && <>
          <rect x="-29" y={surfaceY} width="58" height={fillHeight} fill={liquid} opacity=".74"/>
          <path className={active ? 'wtp-machine-chemical-surface' : undefined}
            d={`M-60 ${surfaceY}q13 -4 26 0t26 0t26 0t26 0`} fill="none" stroke="#f7f2d3" strokeWidth="1.5" opacity=".85"/>
        </>}
        <path d="M0 187v39" stroke="#2a4959" strokeWidth="3.5"/>
        <path d="M-.7 187v39" stroke="#c4d9df" strokeWidth="1.2"/>
        <g transform="translate(0 227) scale(1 .4)">
          <g className={active ? 'wtp-machine-mixer-turn' : undefined}>
            {[0,120,240].map(angle => <path key={angle} d="M0 0Q12 -5 19 -2L19 4Q12 6 0 2Z" transform={`rotate(${angle})`} fill="#cae5e9" stroke="#46616b" />)}
          </g>
        </g>
        <path d="M-24 190h6l-8 50h-4z" fill="#fff" opacity=".21"/>
      </g>
    </g>
  </g>;
}

function BackwashTank({ level, draining }: { level: number | null; draining?: boolean }) {
  const height = level === null ? 0 : Math.max(0, Math.min(100, level)) * 1.37;
  const wet = useId();
  return <g data-equipment="Backwash water tank" data-state={draining && height > 1 ? 'Delivering wash water' : undefined}>
    <title>{`Backwash water tank · ${level === null ? 'Level unavailable' : `${level}%`}`}</title>
    {[1002, 1042, 1104, 1142].map(x => <g key={x} fill={steel} stroke="#748087">
      <path d={`M${x} 255 h12 v72 h-12 Z`} /><ellipse cx={x + 6} cy="327" rx="9" ry="2" />
    </g>)}
    <path d="M1007 311l36 -46m66 45l36 -44m-101 42l-37 -42" fill="none" stroke="var(--wm-metal-edge)" strokeWidth="3"/>
    <path d="M1007 310l36 -46m66 45l36 -44" fill="none" stroke="var(--wm-metal-bright)" strokeWidth=".9"/>
    <path d="M991 248 Q999 283 1066 296 H1087 Q1154 280 1166 248 Z" fill={steel} stroke="#708089" />
    <path d="M991 103 Q992 82 1076 78 Q1157 82 1166 103 V254 Q1078 276 991 254 Z" fill={steel} stroke="#657681" strokeWidth="2" />
    <path d="M992 106 Q1078 120 1165 106 V253 Q1078 274 992 253Z" fill="url(#wtp-mach-brush)"/>
    {[1000,1013,1147,1159].map(dx => <g key={dx}>
      <path d={`M${dx} 112v139`} stroke="var(--wm-glint)" strokeOpacity=".38" />
      {[125,173,219,248].map(y => <use key={y} href="#wtp-mach-bolt" transform={`translate(${dx} ${y}) scale(.64)`} />)}
    </g>)}
    <path d="M991 104 Q1078 118 1166 104 M992 207 Q1076 218 1164 207 M992 253 Q1078 270 1165 253" fill="none" stroke="#809098" />
    <rect x="1021" y="112" width="112" height="140" rx="6" fill={steel} stroke="#506a75" strokeWidth="4" />
    <rect x="1023" y="114" width="108" height="137" rx="3"
      fill={level === null ? 'url(#wtp-mach-level-unavailable)' : 'var(--wm-empty)'} />
    {level !== null && <g data-water-level={level}>
      <rect x="1023" y={251 - height} width="108" height={height} fill="url(#wtp-mach-water)" />
      {height > 1 && <path d={`M1023 ${251 - height} q13 -2 27 0 t27 0 t27 0 t27 0`} fill="none" stroke="#a5f7f5" strokeWidth="2" />}
      {draining && height > 1 && <>
        <defs><clipPath id={wet}><rect x="1023" y={251 - height} width="108" height={height}/></clipPath></defs>
        <g clipPath={`url(#${wet})`}>
          {[0, 1, 2, 3].map(i => (
            <path key={i} className="wtp-machine-wash-current" style={{ animationDelay: `-${i * .27}s` }}
              d={`M1021 ${251 - height * (.32 + i * .17)} C1057 ${251 - height * (.2 + i * .15)} 1095 ${233 - i * 3} 1131 239`}
              fill="none" stroke="#b5fbff" strokeWidth="1.8"/>
          ))}
          <ellipse cx="1126" cy="239" rx="13" ry="7" fill="#187b8b" stroke="#86f6ff" strokeWidth="1.6"/>
        </g>
      </>}
    </g>}
    <path d="M1036 115h14l-13 133h-7z M1103 115h6l-13 134h-6z" fill="var(--wm-glint)" opacity=".13"/>
    {Array.from({length: 11}, (_, i) => <path key={i} d={`M1129 ${115 + i * 13.4} h${i % 5 === 0 ? -10 : -5}`} stroke="var(--wm-tick)" strokeWidth="1.25"/>)}
    <path d="M1025 115 h7 v133 h-7 z M1124 115 h4 v133 h-4 z" fill="#fff" opacity=".29" />
    <Guardrail x={990} y={53} width={177} height={42} />
    <ellipse cx="1078" cy="52" rx="88" ry="14" fill="none" stroke="#efae17" strokeWidth="3.5" />
    <rect x="1066" y="37" width="18" height="24" rx="3" fill={blue} stroke="#164f76" />
    <path d="M1075 60 v24" stroke="#31576b" strokeWidth="5" />
    <path d="M966 314 V92 Q966 74 978 74 H990 M982 315 V94 Q982 85 993 84" fill="none" stroke="#e4a813" strokeWidth="4" />
    {[112,168,224,280].map(y => <path key={y} d={`M966 ${y}q-12 5 -13 -4q-1 -6 9 -8`} fill="none" stroke={gold} strokeWidth="2.2"/>)}
    <path d="M953 106v168" stroke={gold} strokeWidth="2.2"/>
    {Array.from({ length: 14 }, (_, i) => <path key={i} d={`M967 ${100 + i * 16} h15`} stroke="#d59a12" strokeWidth="2.7" />)}
  </g>;
}

const tankStations = [
  { x: 175, band: '#155ab6', liquid: '#ae713a', name: 'Alum 1' },
  { x: 302, band: '#155ab6', liquid: '#ae713a', name: 'Alum 2' },
  { x: 430, band: '#eab31c', liquid: '#e4d5a3', name: 'Lime 1' },
  { x: 555, band: '#eab31c', liquid: '#e4d5a3', name: 'Lime 2' },
  { x: 685, band: '#7826a6', liquid: '#7fa657', name: 'PE 1' },
  { x: 813, band: '#7826a6', liquid: '#7fa657', name: 'PE 2' },
];

const dosingPorts = [186, 309, 434, 561, 689, 814];

export default memo(function WtpMachinery({ backwashLevel, activity }: {
  backwashLevel: number | null;
  activity: WtpProcessActivity;
}) {
  const { driveStates, pumpStates, rpm } = activity;
  const chlorineFeeding = activity.chlorineFeeding === true;
  return <g className="wtp-machinery">
    <defs>
      <radialGradient id="wtp-mach-shadow"><stop stopColor="var(--wm-shadow)" stopOpacity=".54"/><stop offset=".72" stopColor="var(--wm-shadow)" stopOpacity=".22"/><stop offset="1" stopColor="var(--wm-shadow)" stopOpacity="0"/></radialGradient>
      <radialGradient id="wtp-mach-endcap" cx=".3" cy=".25" r=".85"><stop stopColor="var(--wm-paint-hi)"/><stop offset=".48" stopColor="var(--wm-paint)"/><stop offset="1" stopColor="var(--wm-paint-lo)"/></radialGradient>
      <linearGradient id="wtp-mach-steel">
        <stop stopColor="var(--wm-metal-edge)"/><stop offset=".07" stopColor="var(--wm-metal-mid)"/><stop offset=".2" stopColor="var(--wm-metal-bright)"/>
        <stop offset=".26" stopColor="var(--wm-glint)"/><stop offset=".38" stopColor="var(--wm-metal-bright)"/><stop offset=".53" stopColor="var(--wm-metal-mid)"/>
        <stop offset=".7" stopColor="var(--wm-metal-edge)"/><stop offset=".84" stopColor="var(--wm-metal-mid)"/><stop offset=".93" stopColor="var(--wm-metal-bright)"/><stop offset="1" stopColor="var(--wm-metal-edge)"/>
      </linearGradient>
      <linearGradient id="wtp-mach-blue" x2=".12" y2="1"><stop stopColor="var(--wm-paint-hi)"/><stop offset=".16" stopColor="var(--wm-paint-lit)"/><stop offset=".44" stopColor="var(--wm-paint)"/><stop offset=".8" stopColor="var(--wm-paint-lo)"/><stop offset="1" stopColor="var(--wm-paint)"/></linearGradient>
      <linearGradient id="wtp-mach-fin"><stop stopColor="var(--wm-paint-hi)"/><stop offset=".3" stopColor="var(--wm-paint-lit)"/><stop offset="1" stopColor="var(--wm-paint-lo)"/></linearGradient>
      <linearGradient id="wtp-mach-roof" x2=".05" y2="1"><stop stopColor="var(--wm-paint-hi)"/><stop offset=".43" stopColor="var(--wm-paint-lit)"/><stop offset="1" stopColor="var(--wm-paint-lo)"/></linearGradient>
      <linearGradient id="wtp-mach-band-gloss"><stop stopColor="#101e2e" stopOpacity=".42"/><stop offset=".24" stopColor="#fff" stopOpacity=".33"/><stop offset=".55" stopColor="#fff" stopOpacity="0"/><stop offset="1" stopColor="#183447" stopOpacity=".47"/></linearGradient>
      <pattern id="wtp-mach-brush" width="31" height="5" patternUnits="userSpaceOnUse">
        <path d="M0 .6h13m4 0h14M4 2.7h21" stroke="var(--wm-glint)" strokeOpacity=".21" strokeWidth=".47"/>
        <path d="M0 4h8m6 0h17" stroke="var(--wm-metal-edge)" strokeOpacity=".29" strokeWidth=".4"/>
      </pattern>
      <pattern id="wtp-mach-level-unavailable" width="7" height="7" patternUnits="userSpaceOnUse">
        <rect width="7" height="7" fill="var(--wm-empty)"/>
        <path d="M0 7L7 0" stroke="var(--wm-tick)" strokeOpacity=".4"/>
      </pattern>
      <pattern id="wtp-mach-aggregate" width="31" height="23" patternUnits="userSpaceOnUse">
        <path d="M2 3l2 1m7 9l1.3 .3m4 -8l1 1m7 12l2 .7m-21 2l1 -1" stroke="var(--wm-slab-edge)" strokeWidth="1.2" opacity=".66"/>
        <path d="M7 7l2 1m10 7l1 1m8 -13l1 2" stroke="var(--wm-glint)" opacity=".56" strokeWidth="1"/>
      </pattern>
      <g id="wtp-mach-bolt"><path d="M-1.7 -1.2l1.5 -.9 1.8 .8 .2 1.7 -1.5 1 -1.9 -.7z" fill={steel} stroke="#425765" strokeWidth=".6"/><path d="M-1.1 -.9l1.2 -.5" stroke="var(--wm-glint)" strokeWidth=".6"/></g>      <linearGradient id="wtp-mach-gold"><stop stopColor="#96630e" /><stop offset=".35" stopColor="#ffcf37" /><stop offset="1" stopColor="#b97b0a" /></linearGradient>
      <linearGradient id="wtp-mach-slab" x2=".2" y2="1"><stop stopColor="var(--wm-slab-top)" /><stop offset=".45" stopColor="var(--wm-slab-mid)" /><stop offset="1" stopColor="var(--wm-slab-edge)" /></linearGradient>
      <linearGradient id="wtp-mach-water" x2=".1" y2="1"><stop stopColor="var(--wm-water-lit)" /><stop offset=".25" stopColor="var(--wm-water-mid)" /><stop offset="1" stopColor="var(--wm-water-deep)" /></linearGradient>
    </defs>
    <Shed x={36} y={35} width={895} height={226} />
    <Plinth x={35} y={280} width={885} height={49} />
    {tankStations.map((tank, i) => (
      <DosingTank key={tank.name} {...tank} state={driveStates.dosingMixers[i]}
        rpm={rpm.dosingMixers[i]} level={activity.dosingLevels[i]} />
    ))}
    <Guardrail x={36} y={233} width={893} height={45} />
    {tankStations.map(({ name, liquid }, index) => {
      const state = driveStates.dosing[index];
      if (state === 'No data') return null;
      const running = state === 'Run' && rpm.dosing[index] !== 0;
      return <g key={name} transform={`translate(${dosingPorts[index]} 277)`}
        style={driveTiming(rpm.dosing[index], 1.2)} data-equipment={`${name} dosing pump`} data-state={state}>
        <path d="M0 -22 V22" stroke="#65747c" strokeWidth="12" />
        <rect x="-8" y="14" width="16" height="5" rx="1" fill={steel} stroke="#455e67" />
        <rect x="-9" y="-32" width="18" height="18" rx="3" fill={blue} stroke="#1d4967" />
        <circle r="12" fill={steel} stroke="#50616d" strokeWidth="2" />
        <circle r="7" fill={running ? liquid : blue} stroke="#204d66" />
        <g className={running ? 'wtp-machine-metering-stroke' : undefined}>
          <path d="M-5 0Q0 -3 5 0Q0 3 -5 0Z" fill="#c1d4dd" stroke="#466773" strokeWidth="1" />
          <path d="M0 -4V-7M0 4V7" stroke="#79b9d3" strokeWidth="1.8" />
        </g>
        {[45,135,225,315].map(angle=><use key={angle} href="#wtp-mach-bolt" transform={`rotate(${angle}) translate(0 -9) scale(.65)`}/>)}
        <rect x="-12" y="-34" width="24" height="5" rx="1" fill={steel} stroke="var(--wm-metal-edge)" strokeWidth=".8"/>
        <path d="M-4 -28v10m4 -10v10m4 -10v10" stroke="var(--wm-paint-hi)" strokeWidth="1"/>
        <title>{`${name} dosing pump · ${state}`}</title>
      </g>;
    })}
    <BackwashTank level={backwashLevel} draining={activity.backwashTankOutflow === true} />
    {[1275, 1424].map((x, i) => driveStates.backwashPumps[i] !== 'No data' && <g key={x}>
      <Plinth x={x - 57} y={230} width={110} height={43} />
      <Pump x={x} y={197} scale={1.45} name={`Backwash pump ${i + 1}`}
        state={driveStates.backwashPumps[i]} rpm={rpm.backwashPumps[i]} />
    </g>)}
    <Shed x={46} y={617} width={307} height={104} />
    <Plinth x={46} y={738} width={297} height={20} />
    <Pump x={200} y={701} scale={1.2} name="Air blower" state={activity.fieldDrives.find(d => d.name === 'Air blower')!.state} rpm={null} air />
    <Plinth x={827} y={750} width={143} height={15} />
    <Pump x={900} y={729} scale={1} name="Sludge pump" state={activity.fieldDrives.find(d => d.name === 'Sludge pump')!.state} rpm={null} />
    <path d="M918 729 h27" stroke="#5a6667" strokeWidth="8" />
    <path d="M918 727 h27" stroke="#c9d4d0" strokeWidth="2" />
    <rect x="932" y="722" width="4" height="13" fill={steel} stroke="#4b5960" />
    <Plinth x={85} y={916} width={129} height={13} />
    <g data-equipment="Chlorine cylinder" data-state={driveStates.chlorine}>
      <path d="M104 804 Q106 793 148 791 Q193 792 196 804 V894 Q188 911 149 910 Q109 910 104 896 Z" fill={steel} stroke="#78848a" strokeWidth="2" />
      <ellipse cx="150" cy="804" rx="46" ry="9" fill={steel} stroke="#84949a" />
      <path d="M105 806 Q150 820 195 806 V894 Q150 914 105 895Z" fill="url(#wtp-mach-brush)"/>
      <path d="M108 822q42 12 85 -1m-84 68q40 12 83 0" fill="none" stroke="var(--wm-metal-edge)" strokeWidth="1.3"/>
      <path d="M106 891 Q151 904 194 891" fill="none" stroke="#818e93" />
      <rect x="141" y="783" width="15" height="14" rx="2" fill={gold} />
      <ellipse cx="149" cy="781" rx="13" ry="4" fill={gold} stroke="#8f6611" /><path d="M139 781h20m-10 -3v6" stroke="#926b22" strokeWidth="1.4" />
      <path d="M157 790H172Q177 790 177 796H198" fill="none" stroke="#896116" strokeWidth="4.5"/>
      <path d="M157 789H172Q178 789 178 795H198" fill="none" stroke="#e9b33d" strokeWidth="1.4"/>
      <g transform="translate(175 791)">
        <circle r="8" fill={steel} stroke="#58666b" strokeWidth="1.4"/>
        <circle r="5" fill="var(--wm-empty)"/>
        <path className={chlorineFeeding ? 'wtp-machine-metering-stroke' : undefined} d="M-3 2Q0 -2 3 2" fill="none" stroke={chlorineFeeding ? '#de9e29' : '#648089'} strokeWidth="1.4" />
      </g>
      {chlorineFeeding && <path className="wtp-machine-gas" d="M183 796H200" fill="none" stroke="#fff2a2" strokeWidth="2.4" strokeLinecap="round"/>}
    </g>
    <Plinth x={1230} y={901} width={269} height={25} />
    <Pump x={1294} y={873} state={pumpStates[0]} rpm={rpm.transferPumps[0]} name="CWR pump 01" />
    <Pump x={1430} y={873} state={pumpStates[1]} rpm={rpm.transferPumps[1]} name="CWR pump 02" />
  </g>;
});
