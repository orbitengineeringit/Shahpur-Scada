import { memo, useId, type CSSProperties } from 'react';
import WtpVessels from './WtpVessels';
import WtpMachinery from './WtpMachinery';
import type { WtpProcessActivity } from '@/lib/wtpProcessActivity';

type PlantProps = {
  activity: WtpProcessActivity;
  clearLevel: number | null;
  backwashLevel: number | null;
  inletTurbidity: number | null;
  pressure1: number | null;
  pressure2: number | null;
  headerPressure: number | null;
};

const palette = {
  water: ['#093e62', '#167ead', '#36cfed', '#dbffff'],
  sludge: ['#603315', '#934d21', '#c58b50', '#eed3ae'],
  alum: ['#824517', '#cf5709', '#ff922e', '#ffe2a1'],
  lime: ['#8e6713', '#c8a10b', '#ffd943', '#fff2b6'],
  polymer: ['#1c621a', '#2a942b', '#74cf4d', '#deffac'],
};

function Pipe({ d, route, fluid = 'water', active, rate, width = 16, flowPath = d }: {
  d: string; route?: string; fluid?: keyof typeof palette; active?: boolean | null; rate?: number | null;
  width?: number; flowPath?: string;
}) {
  const [edge, shadow, body, gloss] = palette[fluid];
  const period = rate && rate > 0 ? `${Math.max(0.62, 2.35 / (1 + rate / 72))}s` : undefined;
  const tracerPeriod = rate && rate > 0 ? Math.max(2.2, 5.7 / (1 + rate / 65)) : 4.8;
  return (
    <g className="wtp-pipe" data-route={route} fill="none" strokeLinejoin="round" strokeLinecap="round">
      <path d={d} stroke="var(--wtp-pipe-shadow)" strokeWidth={width + 2} transform="translate(2 4)" />
      <path d={d} stroke={edge} strokeWidth={width} />
      <path d={d} stroke={shadow} strokeWidth={width * .85} />
      <path d={d} stroke={body} strokeWidth={width * .58} transform="translate(-1 -1)" />
      <path d={d} stroke={body} strokeOpacity=".45" strokeWidth={width * .12} transform="translate(2 3)" />
      <path d={d} stroke={gloss} strokeWidth={width * .15} transform="translate(-1.8 -2)" />
      {active && <g className="wtp-pipe-motion" data-fluid={fluid} style={{
        '--wtp-flow-period': period,
        '--wtp-tracer-period': `${tracerPeriod}s`,
      } as CSSProperties}>
        <path className="wtp-flow-glass" d={flowPath} strokeWidth={width * .42}/>
        <path className="wtp-flow-streak" d={flowPath} strokeWidth={Math.min(4, width * .28)}/>
        {[0, 1, 2].map(index => <g key={index} className="wtp-flow-tracer" style={{
          offsetPath: `path("${flowPath}")`,
          animationDelay: `-${index * tracerPeriod / 3}s`,
        }}>
          <path d="M-4 -3L1 0L-4 3M1 -3L6 0L1 3" strokeWidth="1.7"/>
        </g>)}
      </g>}
    </g>
  );
}

function Flange({ x, y, vertical = false, size = 1 }: { x: number; y: number; vertical?: boolean; size?: number }) {
  return <g transform={`translate(${x} ${y}) rotate(${vertical ? 90 : 0}) scale(${size})`}>
    <path d="M-5 -12Q0 -15 5 -12V12Q0 15 -5 12Z" fill="var(--wtp-steel)" stroke="#253c48" strokeWidth="1.3"/>
    <path d="M-3 -11V10M2 -11V10" stroke="var(--wtp-metal-glint)" strokeWidth="1.2"/>
    {[-11,10].map(dy=><g key={dy} transform={`translate(0 ${dy})`}>
      <path d="M-8 0H8" stroke="#354652" strokeWidth="2.6"/>
      <path d="M-6 -2V2M6 -2V2" stroke="var(--wtp-metal-glint)" strokeWidth="2"/>
    </g>)}
  </g>;
}

const clarifierOutlet = 'M1040 468H1090Q1110 468 1110 488V669Q1110 688 1130 688H1150';
const dischargePath = 'M1140 866H1246V827Q1246 807 1266 807H1474Q1496 807 1496 829V859H1550';
const backwashHeader = 'M1160 239H1174Q1195 239 1195 217V209Q1195 191 1215 191H1628Q1649 191 1649 212';
const dosePorts = [186,309,434,561,689,814];

function PressureGauge({ x, caption, value }: { x: number; caption: string; value: number | null }) {
  const angle = value === null ? null : -120 + 240 * Math.max(0, Math.min(10, value)) / 10;
  return <g transform={`translate(${x} 718)`} aria-hidden="true">
    <circle r="24" fill="#8099a2" stroke="#3c535e" strokeWidth="2" />
    <circle r="20.5" fill="var(--wtp-dial)" stroke="#c8d7d9" strokeWidth="2" />
    {[-120,-96,-72,-48,-24,0,24,48,72,96,120].map(tick =>
      <path key={tick} d="M0 -15V-19" transform={`rotate(${tick})`} stroke="var(--wtp-dial-ink)" />
    )}
    {angle !== null && <path className="wtp-gauge-needle" d="M-2 3L0 -16L2 3Z" fill="var(--wtp-needle)"
      style={{ transform: `rotate(${angle}deg)` }}/>}
    <circle r="2.5" fill="#3d535d"/>
    <text y="13" textAnchor="middle" fontSize="8" fill="var(--wtp-dial-ink)">{value === null ? '—' : 'bar'}</text>
    <text y="34" textAnchor="middle" fontSize="10" fontWeight="700" fill="var(--wtp-caption)">{caption}</text>
  </g>;
}

export default memo(function WtpPlantDrawing(props: PlantProps) {
  const { activity, clearLevel, backwashLevel, inletTurbidity } = props;
  const { filters, rates, valves } = activity;
  const filterFeeds = filters.map((phase, index) => (phase === 'filter' || phase === 'rinse') &&
    valves.filterInlet[index] !== false && (rates.filterBed[index] ?? 0) > 0);
  const filterFeedRate = filterFeeds.reduce((rate, moving, index) => moving ? rate + (rates.filterBed[index] ?? 0) : rate, 0);
  const id = useId();
  return (
    <svg className="wtp-plant-svg" viewBox="0 0 1672 941" role="img" aria-label="Shahpur water treatment process. Instrument readings are shown on each monitored stage.">
      <defs>
        <linearGradient id={id} x2=".45" y2="1">
          <stop stopColor="var(--wtp-floor-light)"/><stop offset=".5" stopColor="var(--wtp-floor)"/><stop offset="1" stopColor="var(--wtp-floor-far)"/>
        </linearGradient>
        <linearGradient id={`${id}-steel`} x2=".12" y2="1">
          <stop stopColor="var(--wtp-steel-edge)"/><stop offset=".18" stopColor="var(--wtp-metal-glint)"/>
          <stop offset=".4" stopColor="var(--wtp-steel)"/><stop offset=".7" stopColor="var(--wtp-steel-edge)"/>
          <stop offset="1" stopColor="var(--wtp-steel)"/>
        </linearGradient>
        <radialGradient id={`${id}-shadow`}>
          <stop stopColor="var(--wtp-ground-shadow)" stopOpacity=".65"/><stop offset=".62" stopColor="var(--wtp-ground-shadow)" stopOpacity=".32"/>
          <stop offset="1" stopColor="var(--wtp-ground-shadow)" stopOpacity="0"/>
        </radialGradient>
        <pattern id={`${id}-slab`} width="260" height="90" patternUnits="userSpaceOnUse" patternTransform="matrix(1 0 -.55 1 0 0)">
          <path d="M0 90V0H260" stroke="var(--wtp-floor-joint)" opacity=".3" fill="none"/>
          <path d="M2 90V2H260" stroke="var(--wtp-floor-light)" opacity=".55" fill="none"/>
        </pattern>
      </defs>
      <rect width="1672" height="941" fill={`url(#${id})`}/>
      <rect width="1672" height="941" fill={`url(#${id}-slab)`}/>
      {[[484,325,471,24],[1087,329,117,14],[1350,272,154,13],[240,598,180,16],[530,597,66,12],
        [849,622,226,28],[1408,487,171,14],[1408,657,171,14],[197,756,165,14],[730,784,126,12],
        [911,928,245,14],[425,925,152,12],[1365,927,156,12]].map(([cx,cy,rx,ry])=>
        <ellipse key={cx+'-'+cy} cx={cx+8} cy={cy+3} rx={rx} ry={ry} fill={`url(#${id}-shadow)`}/>)}
      <Pipe route="raw-inlet" d="M-12 522H98" active={activity.inletFlow} rate={rates.inlet}/>
      <Pipe route="inlet-to-mixer" d="M386 518H480" active={activity.inletFlow} rate={rates.inlet}/>
      <Pipe route="mixer-to-clarifier" d="M570 518H644" active={activity.inletFlow} rate={rates.inlet}/>
      <Pipe route="clarifier-outlet" d={clarifierOutlet}/>
      <Pipe route="filter-feed-header" d="M1150 688V558" active={filterFeedRate > 0} rate={filterFeedRate}/>
      <Pipe route="filter-1-feed" d="M1150 558V410Q1150 390 1170 390H1260" active={filterFeeds[0]} rate={rates.filterBed[0]}/>
      <Pipe route="filter-2-feed" d="M1150 558H1260" active={filterFeeds[1]} rate={rates.filterBed[1]}/>
      <Pipe route="bypass" d="M1150 688H1581" active={activity.bypassFlow && valves.bypass !== false} rate={rates.bypass}/>
      <Pipe d={backwashHeader + 'V646'} flowPath="M1160 239H1174Q1195 239 1195 217V209Q1195 191 1215 191H1243"
        route="backwash-header" active={activity.backwashTankOutflow} rate={rates.backwashTankOutflow}/>
      <Pipe d="M1357 191V304M1502 191V304M1286 379V324Q1286 304 1306 304H1512Q1534 304 1534 324V379"/>
      <Pipe d="M1286 550V507Q1286 490 1305 490H1504Q1524 490 1524 508V550"/>
      <Pipe d="M1550 390H1611Q1631 390 1631 410V643M1550 558H1631M1199 688V866"/>
      <Pipe route="sludge-withdrawal" d="M684 570V637Q684 655 665 655H446Q424 655 424 678V733H595Q609 733 609 718V699Q609 683 626 683H686V746"
        fluid="sludge" width={12}/>
      <Pipe route="sludge-recirculation" d="M751 746V683H890Q911 683 911 702V722H947"
        fluid="sludge" width={10} active={activity.sludgeFlow && valves.sludge !== false} rate={rates.sludge}/>
      <Pipe route="chlorine-feed" d="M198 797H232Q242 797 242 808V831Q242 839 252 839H339"
        fluid="lime" width={6} active={activity.chlorineFeeding} rate={rates.chlorine}/>
      <Pipe route="contact-inlet" d="M209 901V891Q209 877 227 877H310" active={activity.contactFlow} rate={rates.contact}/>
      <Pipe route="contact-to-clearwell" d="M550 875H687" active={activity.clearInflow} rate={rates.clearInflow}/>
      <Pipe route="treated-water-outlet" d={dischargePath} flowPath="M1450 807H1474Q1496 807 1496 829V859H1550"
        active={activity.outletFlow} rate={rates.outlet}/>
      {[1314, 1450].map((x, index) => <Pipe key={x} route={`transfer-pump-${index + 1}`}
        d={`M${x} 857V807`}/>)}
      <path d="M1548 844H1615L1633 860L1615 876H1548L1555 860Z" fill="var(--wtp-panel)" stroke="var(--wtp-actuator)" strokeWidth="3"/>
      <path d="M1574 638L1585 631H1650L1664 640V739H1574Z" fill="var(--wtp-bypass)" stroke="#797e78" strokeWidth="2"/>
      <path d="M1584 636H1653L1644 644H1580Z" fill="var(--wtp-steel-edge)"/>
      {activity.bypassFlow && valves.bypass !== false && <g data-equipment="Bypass drain chamber">
        <path d="M1584 651H1653V730H1584Z" fill="#1286a0" opacity=".88"/>
        <path className="wtp-bypass-current" d="M1585 655q8-5 17 0t17 0t17 0t17 0" fill="none"
          stroke="#c4f4f9" strokeWidth="2.5" strokeDasharray="11 6"/>
      </g>}
      {[[74,522],[441,518],[621,518],[1063,468],[1176,239],[1567,688],[1156,866],[1530,859],[656,875],[274,877]]
        .map(([x,y])=><Flange x={x} y={y} key={x}/>)}
      {[[1110,621],[1150,653],[1199,844],[1649,620],[1631,607],[1357,274],[1502,274],[1246,843],[1496,844]]
        .map(([x,y])=><Flange x={x} y={y} vertical key={x}/>)}
      <WtpVessels activity={activity} clearLevel={clearLevel}/>
      <WtpMachinery activity={activity} backwashLevel={backwashLevel}/>
      {dosePorts.map((x,i) => {
        const elbow = [423,423,447,447,463,463][i];
        const y = 325 + Math.floor(i/2)*8;
        return <Pipe key={x} d={`M${x} 288V${y-13}Q${x} ${y} ${x < elbow ? x+13 : x-13} ${y}H${elbow}V${459-i}H491`}
          route={`dosing-${i + 1}`} active={(rates.dosing[i] ?? 0) > 0} rate={rates.dosing[i]}
          fluid={i<2?'alum':i<4?'lime':'polymer'} width={8}/>;
      })}
      <PressureGauge x={1282} caption="Pump 1" value={props.pressure1}/>
      {props.headerPressure !== null && <PressureGauge x={1368} caption="Header" value={props.headerPressure}/>}
      <PressureGauge x={1454} caption="Pump 2" value={props.pressure2}/>
      {[160,240].map(x=><g key={x} transform={`translate(${x} 438)`}>
        <path d="M0 11V71" stroke="#405963" strokeWidth="4"/><circle r="12" fill="var(--wtp-dial)" stroke="#376181" strokeWidth="4"/>
        {x===240 && inletTurbidity!==null && <path d="M0 2V-8" stroke="var(--wtp-needle)" strokeWidth="2.5" transform={`rotate(${-105+210*Math.max(0,Math.min(100,inletTurbidity))/100})`}/>}
      </g>)}
    </svg>
  );
});
