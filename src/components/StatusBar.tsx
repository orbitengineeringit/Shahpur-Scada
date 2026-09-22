import React, { useState, useEffect, forwardRef, memo, useMemo } from 'react';
import { useScada } from '@/contexts/ScadaContext';
import { useMqtt } from '@/contexts/MqttContext';
import { Clock, Activity, Database, Wifi, WifiOff, Loader2 } from 'lucide-react';
import GisSyncStatus from './GisSyncStatus';

const StatusBar = memo(forwardRef<HTMLDivElement>((_, ref) => {
  const { telemetryHealth } = useScada();
  const { isConnected, isConnecting, config } = useMqtt();
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const cloudHealthy = telemetryHealth.state === 'connected' && !!telemetryHealth.checkedAt && currentTime.getTime() - telemetryHealth.checkedAt.getTime() < 30000;
  const isOnline = isConnected || cloudHealthy;
  const showConnecting = !isOnline && telemetryHealth.state === 'connecting';

  return (
    <div ref={ref} className="glass-strong statusbar-gradient-border py-2 sm:py-3 px-3 sm:px-4">
      <div className="container mx-auto flex items-center justify-between text-xs font-mono gap-2">
        {/* Left: Branding + MQTT Status */}
        <div className="flex items-center gap-1.5 sm:gap-3 min-w-0">
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
            <span className="text-gradient-primary font-semibold truncate hidden sm:block">Shahpur SCADA</span>
            <span className="text-gradient-primary font-semibold sm:hidden">SCADA</span>
          </div>
          {/* MQTT Status Pill */}
          <div className="w-px h-3.5 bg-border/40 shrink-0 hidden sm:block" />
          <div
            title={isOnline ? 'Live data connection available.' : telemetryHealth.message || 'Connecting to live data'}
            className={`flex items-center gap-1 sm:gap-1.5 px-1.5 py-0.5 sm:px-2 sm:py-1 rounded-lg text-[9px] sm:text-[10px] font-bold transition-all duration-300 border shrink-0 ${
            isOnline
              ? 'bg-success/10 text-success border-success/20'
              : showConnecting
                ? 'bg-warning/10 text-warning border-warning/20'
                : 'bg-destructive/10 text-destructive border-destructive/20'
          }`}>
            {showConnecting ? (
              <Loader2 className="h-2.5 w-2.5 sm:h-3 sm:w-3 animate-spin shrink-0" />
            ) : isOnline ? (
              <Wifi className="h-2.5 w-2.5 sm:h-3 sm:w-3 shrink-0" />
            ) : (
              <WifiOff className="h-2.5 w-2.5 sm:h-3 sm:w-3 shrink-0" />
            )}
            <span className="uppercase tracking-wider">
              {isOnline ? 'Online' : showConnecting ? 'Connecting' : 'Data link error'}
            </span>
          </div>
          <GisSyncStatus />
        </div>

        {/* Right: Time */}
        <div className="flex items-center gap-1 sm:gap-2 text-foreground">
          <Clock className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-muted-foreground shrink-0" />
          <span className="font-medium tabular-nums">{currentTime.toLocaleTimeString()}</span>
          <span className="hidden md:inline text-muted-foreground">{currentTime.toLocaleDateString()}</span>
        </div>
      </div>
    </div>
  );
}));

StatusBar.displayName = 'StatusBar';
export default StatusBar;
