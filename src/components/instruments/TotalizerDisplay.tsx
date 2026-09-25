import React from 'react';

interface TotalizerDisplayProps {
  value: number;
  unit: string;
}

const TotalizerDisplay: React.FC<TotalizerDisplayProps> = ({ value, unit }) => {
  const safeVal = Math.max(0, Number.isFinite(value) ? value : 0);
  const digits = Math.floor(safeVal).toString().padStart(8, '0').split('');
  const decimal = (safeVal % 1).toFixed(2).substring(2);

  return (
    <div className="flex flex-col items-center gap-2 w-full overflow-hidden">
      {/* Meter housing */}
      <div className="bg-secondary/50 rounded-lg p-2 border border-border/50" style={{ boxShadow: 'inset 0 2px 4px hsl(222 47% 11% / 0.1)' }}>
        <div className="flex flex-wrap justify-center items-center gap-0.5 w-full max-w-full">
          <div className="flex gap-0.5 shrink-0">
            {digits.map((d, i) => (
              <div key={i} className="w-5 h-7 md:w-[22px] md:h-[32px] bg-card rounded border border-border flex items-center justify-center transition-all duration-300"
                style={{ boxShadow: 'inset 0 1px 3px hsl(222 47% 11% / 0.08)' }}>
                <span className="font-mono text-sm font-bold text-foreground leading-none">{d}</span>
              </div>
            ))}
          </div>
          <div className="w-1.5 flex items-end pb-1 shrink-0">
            <div className="w-1.5 h-1.5 rounded-full bg-primary" />
          </div>
          <div className="flex gap-0.5 shrink-0">
            {decimal.split('').map((d, i) => (
              <div key={`d${i}`} className="w-5 h-7 md:w-[22px] md:h-[32px] bg-destructive/10 rounded border border-destructive/20 flex items-center justify-center transition-all duration-300"
                style={{ boxShadow: 'inset 0 1px 3px hsl(0 84% 60% / 0.06)' }}>
                <span className="font-mono text-sm font-bold text-destructive leading-none">{d}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">{unit}</span>
    </div>
  );
};

export default TotalizerDisplay;
