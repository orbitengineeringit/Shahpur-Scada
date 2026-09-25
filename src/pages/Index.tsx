import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useScada } from '@/contexts/ScadaContext';
import StatusBar from '@/components/StatusBar';
import { isTagLive } from '@/hooks/useTagConnection';
import MiniSparkline from '@/components/instruments/MiniSparkline';
import { ArrowRight, Building2, Droplet, Cpu, UserCheck } from 'lucide-react';

const Index = () => {
  const { intakeTags, ohtTags, wtpTags, getActiveTagCount, isLoading } = useScada();
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="w-14 h-14 border-4 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground animate-pulse">Loading SCADA...</p>
        </div>
      </div>
    );
  }

  // installedTags: active telemetry data sensors (excludes notInstalled and derived pumps)
  const installedTags = (tags: typeof intakeTags) => tags.filter(t => !t.notInstalled && t.instrumentType !== 'pump');

  const getDataActiveCount = (tags: typeof intakeTags) => {
    return installedTags(tags).filter(isTagLive).length;
  };

  const totalSensors = installedTags(intakeTags).length + installedTags(ohtTags).length + installedTags(wtpTags).length;
  const totalActive = getDataActiveCount(intakeTags) + getDataActiveCount(ohtTags) + getDataActiveCount(wtpTags);

  const cards = [
    {
      title: 'Intake Well',
      path: '/intake',
      color: 'primary',
      borderColor: 'border-blue-500/30 dark:border-blue-500/30',
      shadowColor: 'shadow-blue-500/20 dark:shadow-blue-500/20',
      gradient: 'from-blue-50 via-blue-50/30 to-white dark:from-blue-950/40 dark:via-slate-900/20 dark:to-transparent',
      tags: intakeTags,
      subtitle: 'Raw water intake system monitoring',
      renderIcon: (size: number) => (
        <svg width={size} height={size} viewBox="0 0 120 120" fill="none" className="drop-shadow-xl dark:drop-shadow-2xl">
          <defs>
            <linearGradient id="intakeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#3b82f6" />
              <stop offset="100%" stopColor="#1d4ed8" />
            </linearGradient>
            <linearGradient id="waterBlue" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#2563eb" stopOpacity="0.3" />
            </linearGradient>
            <linearGradient id="metalGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#94a3b8" />
              <stop offset="100%" stopColor="#475569" />
            </linearGradient>
            <filter id="glowPrimary" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="8" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
            <filter id="dropShadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="8" stdDeviation="6" floodColor="#000000" floodOpacity="0.3" />
            </filter>
          </defs>

          {/* Isometric Base */}
          <g filter="url(#dropShadow)">
            <path d="M10 80 L60 100 L110 80 L60 60 Z" fill="url(#metalGrad)" opacity="0.3" />
            <path d="M10 80 L60 100 L60 110 L10 90 Z" fill="#0f172a" opacity="0.6" />
            <path d="M110 80 L60 100 L60 110 L110 90 Z" fill="#1e293b" opacity="0.8" />
          </g>

          {/* Water Reservoir Section */}
          <path d="M20 75 L60 90 L90 78 L50 63 Z" fill="url(#waterBlue)">
            <animate attributeName="opacity" values="0.7;0.9;0.7" dur="3s" repeatCount="indefinite" />
          </path>
          <path d="M25 73 L55 84 L80 74 L50 63 Z" fill="#93c5fd" opacity="0.4">
            <animate attributeName="d" values="M25 73 L55 84 L80 74 L50 63 Z; M25 75 L55 82 L80 76 L50 65 Z; M25 73 L55 84 L80 74 L50 63 Z" dur="4s" repeatCount="indefinite" />
          </path>

          {/* Vertical Pump 1 */}
          <g transform="translate(35, 30)">
            <rect x="0" y="0" width="16" height="45" rx="4" fill="url(#intakeGrad)" />
            <rect x="-4" y="10" width="24" height="6" rx="2" fill="#1e3a8a" />
            <circle cx="8" cy="25" r="4" fill="#60a5fa">
              <animate attributeName="opacity" values="0.4;1;0.4" dur="2s" repeatCount="indefinite" />
            </circle>
          </g>

          {/* Vertical Pump 2 */}
          <g transform="translate(65, 20)">
            <rect x="0" y="0" width="16" height="50" rx="4" fill="url(#intakeGrad)" />
            <rect x="-4" y="12" width="24" height="6" rx="2" fill="#1e3a8a" />
            <circle cx="8" cy="28" r="4" fill="#60a5fa">
              <animate attributeName="opacity" values="0.4;1;0.4" dur="2s" repeatCount="indefinite" begin="1s" />
            </circle>
          </g>

          {/* Connecting Pipes */}
          <path d="M43 70 L43 85 L73 75 M73 65 L73 75" stroke="url(#metalGrad)" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" fill="none" />

          {/* Animated Water Flow in Pipes */}
          <path d="M43 70 L43 85 L73 75" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" strokeDasharray="6 6">
            <animate attributeName="stroke-dashoffset" from="24" to="0" dur="1s" repeatCount="indefinite" />
          </path>

          {/* Glowing Interface Panel */}
          <rect x="50" y="5" width="20" height="12" rx="3" fill="#0f172a" stroke="#3b82f6" strokeWidth="1" filter="url(#glowPrimary)" />
          <circle cx="55" cy="11" r="1.5" fill="#22c55e">
            <animate attributeName="opacity" values="0;1;0" dur="1s" repeatCount="indefinite" />
          </circle>
          <line x1="60" y1="11" x2="66" y2="11" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      ),
    },
    {
      title: 'WTP',
      path: '/wtp',
      color: 'accent',
      borderColor: 'border-amber-500/30 dark:border-amber-500/30',
      shadowColor: 'shadow-amber-500/20 dark:shadow-amber-500/20',
      gradient: 'from-amber-50 via-amber-50/30 to-white dark:from-amber-950/40 dark:via-slate-900/20 dark:to-transparent',
      tags: wtpTags,
      subtitle: 'Water Treatment Plant processes',
      renderIcon: (size: number) => (
        <svg width={size} height={size} viewBox="0 0 120 120" fill="none" className="drop-shadow-xl dark:drop-shadow-2xl">
          <defs>
            <linearGradient id="wtpGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#f59e0b" />
              <stop offset="100%" stopColor="#b45309" />
            </linearGradient>
            <linearGradient id="tankWater" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#34d399" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#059669" stopOpacity="0.4" />
            </linearGradient>
            <linearGradient id="tankBody" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#334155" />
              <stop offset="50%" stopColor="#64748b" />
              <stop offset="100%" stopColor="#1e293b" />
            </linearGradient>
            <filter id="glowAccent" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="6" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
            <filter id="dropShadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="8" stdDeviation="6" floodColor="#000000" floodOpacity="0.3" />
            </filter>
          </defs>

          {/* Isometric Base */}
          <g filter="url(#dropShadow)">
            <path d="M10 80 L60 100 L110 80 L60 60 Z" fill="#1e293b" opacity="0.4" />
            <path d="M10 80 L60 100 L60 110 L10 90 Z" fill="#0f172a" opacity="0.6" />
            <path d="M110 80 L60 100 L60 110 L110 90 Z" fill="#020617" opacity="0.7" />
          </g>

          {/* Settling Tank */}
          <g transform="translate(15, 30)">
            <ellipse cx="20" cy="15" rx="20" ry="10" fill="#475569" />
            <path d="M0 15 L0 45 A 20 10 0 0 0 40 45 L40 15 Z" fill="url(#tankBody)" />
            <ellipse cx="20" cy="45" rx="20" ry="10" fill="#1e293b" />
            {/* Water inside */}
            <ellipse cx="20" cy="20" rx="18" ry="8" fill="url(#tankWater)">
              <animate attributeName="cy" values="20;18;20" dur="4s" repeatCount="indefinite" />
            </ellipse>
            <text x="20" y="38" fontSize="8" fill="#fbbf24" textAnchor="middle" fontWeight="bold">SETTLE</text>
          </g>

          {/* Filter Tank */}
          <g transform="translate(65, 10)">
            <ellipse cx="20" cy="15" rx="20" ry="10" fill="#475569" />
            <path d="M0 15 L0 60 A 20 10 0 0 0 40 60 L40 15 Z" fill="url(#tankBody)" />
            <ellipse cx="20" cy="60" rx="20" ry="10" fill="#1e293b" />
            {/* Water inside */}
            <ellipse cx="20" cy="25" rx="18" ry="8" fill="#38bdf8" fillOpacity="0.8">
              <animate attributeName="cy" values="25;22;25" dur="3s" repeatCount="indefinite" />
            </ellipse>
            <text x="20" y="45" fontSize="8" fill="#fbbf24" textAnchor="middle" fontWeight="bold">FILTER</text>
            <rect x="15" y="48" width="10" height="4" fill="#f59e0b" rx="2" filter="url(#glowAccent)" />
          </g>

          {/* Connecting Pipes with Flow */}
          <path d="M55 55 L75 45" stroke="#94a3b8" strokeWidth="5" strokeLinecap="round" />
          <path d="M55 55 L75 45" stroke="#f59e0b" strokeWidth="2" strokeDasharray="4 4" strokeLinecap="round">
            <animate attributeName="stroke-dashoffset" from="16" to="0" dur="1s" repeatCount="indefinite" />
          </path>

          <path d="M85 80 L105 70" stroke="#94a3b8" strokeWidth="5" strokeLinecap="round" />
          <path d="M85 80 L105 70" stroke="#f59e0b" strokeWidth="2" strokeDasharray="4 4" strokeLinecap="round">
            <animate attributeName="stroke-dashoffset" from="16" to="0" dur="1s" repeatCount="indefinite" />
          </path>

          {/* Glowing Control node */}
          <circle cx="60" cy="85" r="5" fill="#f59e0b" filter="url(#glowAccent)">
            <animate attributeName="r" values="4;6;4" dur="2s" repeatCount="indefinite" />
          </circle>
          <circle cx="60" cy="85" r="2" fill="#fff" />
        </svg>
      ),
    },
    {
      title: 'OHT',
      path: '/oht',
      color: 'success',
      borderColor: 'border-emerald-500/30 dark:border-emerald-500/30',
      shadowColor: 'shadow-emerald-500/20 dark:shadow-emerald-500/20',
      gradient: 'from-emerald-50 via-emerald-50/30 to-white dark:from-emerald-950/40 dark:via-slate-900/20 dark:to-transparent',
      tags: ohtTags,
      subtitle: 'Overhead Tanks network control',
      renderIcon: (size: number) => (
        <svg width={size} height={size} viewBox="0 0 120 120" fill="none" className="drop-shadow-xl dark:drop-shadow-2xl">
          <defs>
            <linearGradient id="ohtGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#10b981" />
              <stop offset="100%" stopColor="#047857" />
            </linearGradient>
            <linearGradient id="concrete" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#cbd5e1" />
              <stop offset="50%" stopColor="#f8fafc" />
              <stop offset="100%" stopColor="#94a3b8" />
            </linearGradient>
            <filter id="glowSuccess" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="6" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
            <filter id="dropShadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="8" stdDeviation="6" floodColor="#000000" floodOpacity="0.3" />
            </filter>
          </defs>

          {/* Background tanks representation */}
          <g transform="translate(10, 20) scale(0.6)" opacity="0.4" filter="url(#dropShadow)">
            <path d="M40 90 L45 30 L55 30 L60 90 Z" fill="#64748b" />
            <ellipse cx="50" cy="20" rx="30" ry="10" fill="#94a3b8" />
            <path d="M20 20 L20 40 A 30 15 0 0 0 80 40 L80 20 Z" fill="url(#concrete)" />
            <ellipse cx="50" cy="40" rx="30" ry="15" fill="#64748b" />
          </g>

          <g transform="translate(60, 15) scale(0.7)" opacity="0.5" filter="url(#dropShadow)">
            <path d="M40 90 L45 30 L55 30 L60 90 Z" fill="#64748b" />
            <ellipse cx="50" cy="20" rx="30" ry="10" fill="#94a3b8" />
            <path d="M20 20 L20 40 A 30 15 0 0 0 80 40 L80 20 Z" fill="url(#concrete)" />
            <ellipse cx="50" cy="40" rx="30" ry="15" fill="#64748b" />
          </g>

          {/* Main Hero Tank */}
          <g transform="translate(30, 30)" filter="url(#dropShadow)">
            {/* Pillars */}
            <path d="M25 80 L30 30 L35 30 L35 80 Z" fill="#475569" />
            <path d="M65 80 L60 30 L55 30 L55 80 Z" fill="#475569" />
            <path d="M45 80 L45 30 L45 80 Z" stroke="#334155" strokeWidth="4" />

            {/* Cross bracing */}
            <path d="M32 50 L58 40 M32 60 L58 70" stroke="#64748b" strokeWidth="2" />

            {/* Tank Top */}
            <ellipse cx="45" cy="15" rx="35" ry="12" fill="#cbd5e1" />
            <path d="M10 15 L10 35 A 35 15 0 0 0 80 35 L80 15 Z" fill="url(#concrete)" />
            <ellipse cx="45" cy="35" rx="35" ry="15" fill="#94a3b8" />

            {/* Water Level Indicator */}
            <rect x="42" y="18" width="6" height="18" rx="3" fill="#0f172a" />
            <rect x="43" y="24" width="4" height="10" rx="2" fill="#10b981" filter="url(#glowSuccess)">
              <animate attributeName="height" values="10;6;12;10" dur="5s" repeatCount="indefinite" />
              <animate attributeName="y" values="24;28;22;24" dur="5s" repeatCount="indefinite" />
            </rect>

            {/* Glowing Accent */}
            <circle cx="45" cy="10" r="2" fill="#10b981" filter="url(#glowSuccess)">
              <animate attributeName="opacity" values="1;0;1" dur="2s" repeatCount="indefinite" />
            </circle>

            {/* Number indicator */}
            <text x="75" y="10" fontSize="12" fill="#10b981" fontWeight="900" filter="url(#glowSuccess)">x2</text>
          </g>
        </svg>
      ),
    },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-background grid-pattern relative overflow-hidden transition-colors duration-300">
      <div className="floating-orb w-96 h-96 bg-primary -top-40 -left-40 opacity-20 dark:opacity-40" />
      <div className="floating-orb w-80 h-80 bg-accent top-1/2 -right-32 opacity-15 dark:opacity-30" style={{ animationDelay: '7s' }} />
      <div className="floating-orb w-64 h-64 bg-success bottom-20 left-1/3 opacity-10 dark:opacity-25" style={{ animationDelay: '14s' }} />

      <main className="flex-1 container mx-auto px-4 py-8 md:py-12 relative z-10">
        <div className="max-w-6xl mx-auto mb-10 md:mb-14 p-6 sm:p-8 rounded-3xl border border-slate-200/80 dark:border-white/8 bg-white/50 dark:bg-slate-900/40 backdrop-blur-xl relative overflow-hidden shadow-xl shadow-slate-100/50 dark:shadow-none opacity-0 animate-fade-in">
          {/* Decorative Background Glows */}
          <div className="absolute -top-12 -left-12 w-64 h-64 bg-blue-500/10 rounded-full blur-[60px] -z-10" />
          <div className="absolute -bottom-12 -right-12 w-64 h-64 bg-indigo-500/10 rounded-full blur-[60px] -z-10" />
          
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            {/* Left Side: Main Title & SCADA Branding */}
            <div className="lg:col-span-7 text-left space-y-4">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 dark:bg-blue-500/20 border border-blue-500/20 dark:border-blue-500/30 text-blue-600 dark:text-blue-400 font-extrabold text-[10px] sm:text-xs uppercase tracking-widest">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                Package-6i · MPUDCL
              </div>
              
              <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-black text-slate-800 dark:text-white leading-tight tracking-tight">
                Improvement of Water Supply Scheme
              </h2>
              
              <div className="inline-block px-4 py-1.5 rounded-2xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200/50 dark:border-slate-700/50 text-slate-700 dark:text-slate-200 font-bold text-sm sm:text-base md:text-lg shadow-sm">
                Shahpur, Distt. <span className="bg-gradient-to-r from-blue-500 to-indigo-500 dark:from-cyan-400 dark:to-blue-400 bg-clip-text text-transparent font-black">Sagar</span>
              </div>
              
              <div className="flex items-center gap-3 pt-2">
                <h1 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 dark:from-cyan-400 dark:via-blue-400 dark:to-indigo-400 bg-clip-text text-transparent select-none">
                  SCADA
                </h1>
                <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/10 dark:bg-emerald-500/20 border border-emerald-500/20 text-emerald-500 text-[10px] font-extrabold uppercase tracking-wider">
                  Live System
                </span>
              </div>
              <p className="text-xs text-muted-foreground/80 font-medium">
                PLC, SCADA & Instruments — Real-time Telemetry & Process Monitoring
              </p>
            </div>

            {/* Right Side: Specifications & Statistics Grid */}
            <div className="lg:col-span-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Card 1: Client */}
              <div className="p-4 rounded-2xl bg-slate-50/50 dark:bg-slate-900/30 border border-slate-200/50 dark:border-slate-800/50 flex flex-col justify-between min-h-[96px] shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-extrabold text-muted-foreground uppercase tracking-wider">Client</span>
                  <Building2 className="w-4 h-4 text-blue-500" />
                </div>
                <div className="mt-2">
                  <p className="text-xs sm:text-sm font-bold text-foreground leading-snug">MPUDCL</p>
                  <p className="text-[10px] font-semibold text-muted-foreground/80 mt-0.5">Madhya Pradesh Urban Dev. Co.</p>
                </div>
              </div>

              {/* Card 2: Capacity */}
              <div className="p-4 rounded-2xl bg-slate-50/50 dark:bg-slate-900/30 border border-slate-200/50 dark:border-slate-800/50 flex flex-col justify-between min-h-[96px] shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-extrabold text-muted-foreground uppercase tracking-wider">Capacity</span>
                  <Droplet className="w-4 h-4 text-indigo-500" />
                </div>
                <div className="mt-2">
                  <p className="text-xs sm:text-sm font-bold text-foreground leading-snug">1.75 MLD</p>
                  <p className="text-[10px] font-semibold text-muted-foreground/80 mt-0.5">Million Litres / Day</p>
                </div>
              </div>

              {/* Card 3: Contract Agency */}
              <div className="p-4 rounded-2xl bg-slate-50/50 dark:bg-slate-900/30 border border-slate-200/50 dark:border-slate-800/50 flex flex-col justify-between min-h-[96px] shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-extrabold text-muted-foreground uppercase tracking-wider">Contractor</span>
                  <UserCheck className="w-4 h-4 text-violet-500" />
                </div>
                <div className="mt-2">
                  <p className="text-xs sm:text-sm font-bold text-foreground leading-snug">M/s. IEL & MCPPLJV</p>
                  <p className="text-[10px] font-semibold text-muted-foreground/80 mt-0.5">Pvt. Ltd.</p>
                </div>
              </div>

              {/* Card 4: System Integrator */}
              <div className="p-4 rounded-2xl bg-slate-50/50 dark:bg-slate-900/30 border border-slate-200/50 dark:border-slate-800/50 flex flex-col justify-between min-h-[96px] shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-extrabold text-muted-foreground uppercase tracking-wider">System Integrator</span>
                  <Cpu className="w-4 h-4 text-cyan-500" />
                </div>
                <div className="mt-2">
                  <p className="text-xs sm:text-sm font-bold text-foreground leading-snug">Orbit Engineering</p>
                  <p className="text-[10px] font-semibold text-muted-foreground/80 mt-0.5">Solutions</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8 max-w-6xl mx-auto items-stretch">
          {cards.map((card, index) => {
            const activeCount = getDataActiveCount(card.tags);
            const lastUpdate = card.tags.reduce((latest, t) => t.timestamp > latest ? t.timestamp : latest, new Date(0));
            const sparkData = card.tags.filter(t => t.sensorType === 'analog').slice(0, 3).map(t => t.value);

            return (
              <button
                key={card.title}
                onClick={() => navigate(card.path)}
                className={`nav-card w-full p-6 lg:p-8 rounded-3xl text-left group opacity-0 animate-fade-in hover:scale-[1.02] active:scale-[0.98] border border-slate-200/80 dark:border-white/8 bg-white/95 dark:bg-slate-900/60 backdrop-blur-xl bg-gradient-to-br ${card.gradient} shadow-lg hover:shadow-2xl transition-all duration-500 overflow-hidden relative flex flex-col`}
                style={{ animationDelay: `${index * 150}ms` }}
              >
                <div className={`absolute -top-24 -right-24 w-48 h-48 rounded-full blur-[60px] opacity-10 group-hover:opacity-30 dark:group-hover:opacity-40 transition-opacity duration-700 bg-${card.color}`} />
                <div className={`absolute bottom-0 left-0 w-full h-1.5 bg-${card.color} opacity-20 group-hover:opacity-100 transition-opacity duration-500 rounded-b-3xl`} />

                <div className="relative z-10 flex flex-col flex-1">
                  <div className={`w-24 h-24 sm:w-28 sm:h-28 rounded-2xl flex items-center justify-center mb-6 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:${card.borderColor} shadow-sm group-hover:bg-white dark:group-hover:bg-slate-800/90 transition-all duration-500 group-hover:scale-105 group-hover:-rotate-2`}>
                    {card.renderIcon(88)}
                  </div>

                  <h2 className={`text-2xl font-bold mb-1 text-foreground group-hover:text-${card.color} transition-colors duration-300`}>
                    {card.title}
                  </h2>
                  <p className="text-sm text-muted-foreground mb-8 font-medium line-clamp-2 h-10">{card.subtitle}</p>

                  <div className="mt-auto">
                    <div className="flex items-center justify-between mb-4 border-t border-slate-100 dark:border-white/10 pt-5">
                      <span className="text-xs font-medium text-muted-foreground">Last Telemetry</span>
                      <span className="text-[10px] font-mono text-slate-500 dark:text-muted-foreground bg-slate-100 dark:bg-black/30 px-2 py-1.5 rounded-md border border-slate-200 dark:border-white/5">
                        {lastUpdate.getTime() > 0 ? lastUpdate.toLocaleTimeString() : '--:--:--'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between bg-slate-50 dark:bg-black/20 p-3 rounded-xl border border-slate-200/80 dark:border-white/5">
                      <span className="text-xs font-bold text-foreground">View Station Dashboard</span>
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center bg-${card.color}/10 dark:bg-${card.color}/20 group-hover:bg-${card.color} group-hover:text-primary-foreground transition-all duration-300 group-hover:shadow-lg ${card.shadowColor}`}>
                        <ArrowRight className={`w-5 h-5 text-${card.color} group-hover:text-white transition-colors`} />
                      </div>
                    </div>
                  </div>

                  {sparkData.length > 1 ? (
                    <div className="mt-4 bg-slate-50 dark:bg-black/20 p-2 rounded-lg border border-slate-100 dark:border-white/5 overflow-hidden h-[40px] flex items-center justify-center transition-all duration-500 opacity-40 group-hover:opacity-100">
                      <MiniSparkline data={sparkData} width={120} height={20} />
                    </div>
                  ) : (
                    <div className="mt-4 h-[40px]" />
                  )}
                </div>
              </button>
            );
          })}
        </div>

        <div className="mt-10 sm:mt-14 grid grid-cols-3 gap-2 sm:gap-4 max-w-3xl mx-auto">
          {[
            { label: 'Design Capacity', value: '1.75 MLD', color: 'primary', icon: '💧' },
            { label: 'Monitored Stations', value: '3 Units', color: 'success', icon: '🏭' },
            { label: 'Contract Package', value: 'Pkg-61', color: 'accent', icon: '🏛️' },
          ].map((stat, i) => (
            <div key={stat.label}
              className="premium-card stat-shine rounded-xl p-3 sm:p-5 text-center opacity-0 animate-fade-in"
              style={{ animationDelay: `${500 + i * 100}ms` }}>
              <div className="text-xl sm:text-2xl mb-1">{stat.icon}</div>
              <p className={`text-xl sm:text-3xl font-bold font-mono text-${stat.color}`}>{stat.value}</p>
              <p className="text-[9px] sm:text-xs text-muted-foreground uppercase tracking-wider mt-1">{stat.label}</p>
            </div>
          ))}
        </div>
      </main>
      <StatusBar />
    </div>
  );
};

export default Index;
