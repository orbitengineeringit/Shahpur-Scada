import React, { useState, useEffect, forwardRef, memo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, History, BellRing, FileSpreadsheet, Sun, Moon } from 'lucide-react';
import { useAlarm } from '@/contexts/AlarmContext';
import orbitLogo from '@/assets/orbit-logo-optimized.png';
import { useAuth } from '@/contexts/AuthContext';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

const Header = memo(forwardRef<HTMLElement>((_, ref) => {
  const { unreadCount } = useAlarm();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isHome = location.pathname === '/';

  const [isDark, setIsDark] = useState(() => {
    return document.documentElement.classList.contains('dark');
  });

  const toggleTheme = () => {
    const nextDark = !isDark;
    setIsDark(nextDark);
    if (nextDark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  };

  useEffect(() => {
    const observer = new MutationObserver(() => {
      const isCurrentlyDark = document.documentElement.classList.contains('dark');
      if (isCurrentlyDark !== isDark) {
        setIsDark(isCurrentlyDark);
      }
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    });

    return () => observer.disconnect();
  }, [isDark]);

  return (
    <header ref={ref} className="glass-strong header-gradient-border sticky top-0 z-50">
      <div className="container mx-auto px-2 sm:px-4 py-2 sm:py-3">
        <div className="flex items-center justify-between gap-1 sm:gap-4 overflow-hidden">
          <div className="flex items-center gap-1 sm:gap-2 md:gap-3 min-w-0 flex-1">
            {!isHome && (
              <button onClick={() => navigate('/')}
                className="p-1 sm:p-1.5 md:p-2 rounded-lg sm:rounded-xl bg-secondary/80 hover:bg-secondary transition-all duration-200 hover:scale-105 active:scale-95 flex-shrink-0">
                <ArrowLeft className="h-3.5 w-3.5 sm:h-4 sm:w-4 md:h-5 md:w-5 text-foreground" />
              </button>
            )}
            
            <div className="flex items-center gap-1 sm:gap-1.5 flex-shrink-0 select-none">
              <div className="flex flex-col items-start leading-none gap-0.5 sm:gap-1">
                <span className="text-[6px] sm:text-[8px] font-black tracking-[0.2em] text-cyan-600 dark:text-cyan-400 uppercase px-1.5 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/20 dark:bg-cyan-400/10 dark:border-cyan-400/20">M/S</span>
                <span className="text-[9px] sm:text-xs md:text-sm font-black tracking-wider bg-gradient-to-r from-cyan-600 via-teal-600 to-emerald-600 dark:from-cyan-400 dark:via-teal-400 dark:to-emerald-400 bg-clip-text text-transparent drop-shadow-sm uppercase font-sans">
                  CMPV Engineering
                </span>
              </div>
            </div>

            <div className="w-px h-4 sm:h-5 md:h-6 bg-border/40 flex-shrink-0 hidden sm:block" />
            <div className="relative flex-shrink-0">
              <img src={orbitLogo} alt="Orbit" className="h-5 sm:h-6 md:h-8 w-auto" loading="eager" />
              <div className="absolute inset-0 blur-lg bg-primary/20 rounded-full -z-10" />
            </div>
            <h1 className="text-[11px] sm:text-sm md:text-lg lg:text-2xl font-bold text-foreground tracking-tight whitespace-nowrap truncate min-w-0">
              Shahpur <span className="text-gradient-primary">SCADA</span>
              <span className="hidden md:inline text-[10px] lg:text-xs font-normal text-muted-foreground ml-2">Package-61</span>
            </h1>
          </div>

          <div className="flex items-center justify-end gap-0.5 sm:gap-1 md:gap-2 flex-shrink-0 ml-1 sm:ml-auto">
            <Tooltip>
              <TooltipTrigger asChild>
                <button onClick={toggleTheme}
                  className="p-1 sm:p-1.5 md:p-2.5 rounded-lg sm:rounded-xl bg-secondary/80 hover:bg-secondary transition-all duration-200 hover:scale-105 active:scale-95 text-foreground"
                  aria-label={isDark ? 'Light Mode' : 'Dark Mode'}>
                  {isDark ? <Sun className="h-3.5 w-3.5 sm:h-4 sm:w-4 md:h-[18px] md:w-[18px] text-warning" /> : <Moon className="h-3.5 w-3.5 sm:h-4 sm:w-4 md:h-[18px] md:w-[18px] text-foreground" />}
                </button>
              </TooltipTrigger>
              <TooltipContent><p>{isDark ? 'Light Mode' : 'Dark Mode'}</p></TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button onClick={() => navigate('/history')}
                  className="p-1 sm:p-1.5 md:p-2.5 rounded-lg sm:rounded-xl bg-secondary/80 hover:bg-secondary text-foreground transition-all duration-200 hover:scale-105 active:scale-95">
                  <History className="h-3.5 w-3.5 sm:h-4 sm:w-4 md:h-[18px] md:w-[18px]" />
                </button>
              </TooltipTrigger>
              <TooltipContent><p>History</p></TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button onClick={() => navigate('/alarms')}
                  className="relative p-1 sm:p-1.5 md:p-2.5 rounded-lg sm:rounded-xl bg-secondary/80 hover:bg-secondary text-foreground transition-all duration-200 hover:scale-105 active:scale-95">
                  <BellRing className={`h-3.5 w-3.5 sm:h-4 sm:w-4 md:h-[18px] md:w-[18px] ${unreadCount > 0 ? 'text-destructive animate-pulse' : ''}`} />
                  {unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 h-3 w-3 sm:h-3.5 sm:w-3.5 md:h-5 md:w-5 flex items-center justify-center bg-destructive text-white text-[7px] sm:text-[8px] md:text-xs font-bold rounded-full border-2 border-background animate-scale-in">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent><p>Alarms</p></TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button onClick={() => navigate('/exports')}
                  className="p-1 sm:p-1.5 md:p-2.5 rounded-lg sm:rounded-xl bg-secondary/80 hover:bg-secondary text-foreground transition-all duration-200 hover:scale-105 active:scale-95">
                  <FileSpreadsheet className="h-3.5 w-3.5 sm:h-4 sm:w-4 md:h-[18px] md:w-[18px]" />
                </button>
              </TooltipTrigger>
              <TooltipContent><p>Data Exports</p></TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button onClick={logout}
                  className="p-1 sm:p-1.5 md:p-2.5 rounded-lg sm:rounded-xl bg-destructive/10 hover:bg-destructive/20 text-destructive transition-all duration-200 hover:scale-105 active:scale-95"
                  aria-label="Logout">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 sm:h-4 sm:w-4 md:h-[18px] md:w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
                </button>
              </TooltipTrigger>
              <TooltipContent><p>Logout</p></TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>
    </header>
  );
}));

Header.displayName = 'Header';
export default Header;
