import React from 'react';

interface LossOfHeadIndicatorProps {
  value: number;
  label: string;
}

/** Differential head-loss transmitter display, scaled directly from 0–100%. */
const LossOfHeadIndicator: React.FC<LossOfHeadIndicatorProps> = ({ value, label }) => {
  const percent = Math.min(100, Math.max(0, value));
  const color = percent >= 85
    ? 'hsl(var(--destructive))'
    : percent >= 70
      ? 'hsl(var(--warning))'
      : 'hsl(var(--primary))';
  const status = percent >= 85 ? 'BACKWASH REQUIRED' : percent >= 70 ? 'HEAD LOSS HIGH' : 'NORMAL';

  return (
    <div className="flex w-full max-w-[230px] flex-col items-center gap-2">
      <svg viewBox="0 0 220 150" className="h-auto w-full drop-shadow-sm" role="img" aria-label={`${label}: ${percent.toFixed(1)} percent`}>
        <defs>
          <linearGradient id={`loh-column-${label.replace(/\W/g, '')}`} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="hsl(199 89% 48%)" />
            <stop offset="100%" stopColor={color} />
          </linearGradient>
        </defs>

        <text x="110" y="13" textAnchor="middle" className="fill-muted-foreground" fontSize="9" fontWeight="800" letterSpacing="1.2">
          DIFFERENTIAL HEAD LOSS
        </text>

        {/* Upstream/downstream pressure legs make the measurement visually explicit. */}
        <rect x="28" y="30" width="38" height="94" rx="8" fill="hsl(var(--secondary))" stroke="hsl(var(--border))" strokeWidth="2" />
        <rect x="154" y="30" width="38" height="94" rx="8" fill="hsl(var(--secondary))" stroke="hsl(var(--border))" strokeWidth="2" />
        <rect x="34" y="38" width="26" height="78" rx="5" fill="hsl(199 89% 48% / 0.75)" />
        <rect x="160" y={116 - (percent / 100) * 78} width="26" height={(percent / 100) * 78} rx="5"
          fill={`url(#loh-column-${label.replace(/\W/g, '')})`} className="transition-all duration-700" />

        <path d="M66 78 H86 M134 78 H154" stroke="hsl(var(--muted-foreground))" strokeWidth="4" strokeLinecap="round" />
        <circle cx="110" cy="78" r="28" fill="hsl(var(--card))" stroke="hsl(var(--border))" strokeWidth="3" />
        <text x="110" y="75" textAnchor="middle" fill={color} fontSize="22" fontWeight="900" fontFamily="ui-monospace, monospace">
          {percent.toFixed(1)}
        </text>
        <text x="110" y="91" textAnchor="middle" className="fill-muted-foreground" fontSize="10" fontWeight="800">%</text>

        <text x="47" y="139" textAnchor="middle" className="fill-muted-foreground" fontSize="8" fontWeight="700">UPSTREAM</text>
        <text x="173" y="139" textAnchor="middle" className="fill-muted-foreground" fontSize="8" fontWeight="700">DOWNSTREAM</text>
      </svg>
      <span className="rounded-full px-2.5 py-1 text-[10px] font-bold tracking-wide" style={{ color, backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)` }}>
        {status}
      </span>
    </div>
  );
};

export default LossOfHeadIndicator;
