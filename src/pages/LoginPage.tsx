import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Lock, User, AlertCircle, Sun, Moon } from 'lucide-react';
import orbitLogo from '@/assets/orbit-logo-optimized.png';
import loginBg from '@/assets/sign-in-bg.jpg';
import { useLogoPreload } from '@/hooks/useLogoPreload';

const LoginPage = () => {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const imagesReady = useLogoPreload([orbitLogo, loginBg]);

  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('theme');
      if (saved) return saved === 'dark';
      const hour = new Date().getHours();
      const isDaytime = hour >= 6 && hour < 18;
      return !isDaytime;
    }
    return true;
  });

  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('theme', next ? 'dark' : 'light');
  };

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const success = await login(username.trim(), password);
      if (!success) {
        setError('Invalid username or password');
      }
    } catch {
      setError('Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!imagesReady) {
    return (
      <div className="min-h-screen bg-background grid-pattern relative overflow-hidden" aria-hidden="true">
        <div className="floating-orb w-96 h-96 bg-primary -top-40 -left-40" />
        <div className="floating-orb w-80 h-80 bg-accent top-1/2 -right-32" style={{ animationDelay: '7s' }} />
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center bg-cover bg-center bg-no-repeat relative overflow-hidden px-4"
      style={{ backgroundImage: `url(${loginBg})` }}
    >
      {/* Background Overlay */}
      <div className="absolute inset-0 bg-background/20 dark:bg-background/50 grid-pattern pointer-events-none" />

      <div className="floating-orb w-96 h-96 bg-primary -top-40 -left-40 z-0" />
      <div className="floating-orb w-80 h-80 bg-accent top-1/2 -right-32 z-0" style={{ animationDelay: '7s' }} />

      <button onClick={toggleTheme}
        className="absolute top-4 right-4 sm:top-8 sm:right-8 p-2.5 rounded-xl bg-secondary/80 hover:bg-secondary transition-all duration-200 border border-border/50 hover:scale-105 active:scale-95 z-50 shadow-sm"
        title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}>
        {isDark ? <Sun className="h-5 w-5 text-warning" /> : <Moon className="h-5 w-5 text-foreground" />}
      </button>

      <div className="w-full max-w-md relative z-10">
        <div className="glass-strong rounded-3xl p-8 sm:p-10 shadow-2xl border border-border/50">
          <div className="flex items-center justify-center gap-4 mb-6">
            <div className="flex items-center gap-2 select-none">
              <div className="flex flex-col items-start leading-none gap-1">
                <span className="text-[8px] sm:text-[10px] font-black tracking-[0.2em] text-cyan-600 dark:text-cyan-400 uppercase px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/20 dark:bg-cyan-400/10 dark:border-cyan-400/20">M/S</span>
                <span className="text-xs sm:text-sm md:text-base font-black tracking-wider bg-gradient-to-r from-cyan-600 via-teal-600 to-emerald-600 dark:from-cyan-400 dark:via-teal-400 dark:to-emerald-400 bg-clip-text text-transparent drop-shadow-sm uppercase font-sans">
                  CMPV Engineering Pvt. Ltd.
                </span>
              </div>
            </div>
            <div className="w-px h-10 bg-border/50" />
            <img src={orbitLogo} alt="Orbit" className="h-8 sm:h-10 w-auto" loading="eager" decoding="sync" fetchPriority="high" />
          </div>

          <div className="text-center mb-6">
            <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-blue-500/10 dark:bg-blue-500/20 border border-blue-500/15 text-blue-600 dark:text-cyan-400 font-extrabold text-[9px] uppercase tracking-wider mb-3">
              <span className="w-1 h-1 rounded-full bg-blue-500 animate-pulse" />
              Package-61 · MPUDCL
            </div>
            
            <h1 className="text-base sm:text-lg font-black text-foreground leading-snug tracking-tight mb-1">
              Improvement of Water Supply Scheme
            </h1>
            
            <p className="text-xs sm:text-sm font-extrabold bg-gradient-to-r from-blue-600 to-indigo-500 dark:from-cyan-400 dark:to-blue-400 bg-clip-text text-transparent mb-4 uppercase">
              Shahpur, Distt. Sagar (M.P.)
            </p>

            <div className="flex items-center justify-center gap-2 text-[10px] text-muted-foreground font-semibold px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200/40 dark:border-slate-800/40 mb-4 max-w-sm mx-auto">
              <span>Client: <span className="text-foreground">MPUDCL</span></span>
              <span className="w-1 h-1 rounded-full bg-border" />
              <span>Capacity: <span className="text-foreground">1.75 MLD</span></span>
            </div>

            <div className="flex items-center justify-center gap-2">
              <p className="text-xl sm:text-2xl font-black tracking-tight bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 dark:from-cyan-400 dark:via-blue-400 dark:to-indigo-400 bg-clip-text text-transparent">
                SCADA
              </p>
              <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-emerald-500/10 dark:bg-emerald-500/20 border border-emerald-500/20 text-emerald-500 text-[8px] font-black uppercase tracking-wider">
                LIVE
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1.5">Sign in to access the real-time monitoring dashboard</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Username</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Enter username"
                  className="w-full pl-10 pr-4 py-3 rounded-xl bg-secondary/80 border border-border/50 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                  required autoComplete="username" autoFocus />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter password"
                  className="w-full pl-10 pr-4 py-3 rounded-xl bg-secondary/80 border border-border/50 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                  required autoComplete="current-password" />
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 rounded-xl px-4 py-3">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                {error}
              </div>
            )}

            <button type="submit" disabled={loading}
              className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-[0.98]">
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                  Signing in...
                </span>
              ) : 'Sign In'}
            </button>
          </form>

          <p className="text-center text-[11px] text-muted-foreground mt-6">
            Powered by M/s. CMPV Engineering × Orbit Engineering Solutions
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
