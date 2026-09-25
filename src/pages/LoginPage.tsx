import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  Lock,
  User,
  AlertCircle,
  LogIn,
  Activity,
  Shield,
  Leaf,
  Users,
  Eye,
  EyeOff,
} from 'lucide-react';
import orbitSwirl from '@/assets/orbit-swirl.png';
import loginBg from '@/assets/sign-in-bg.png';
import { useLogoPreload } from '@/hooks/useLogoPreload';

const AscendingBarChart = ({ className = 'w-3.5 h-3.5' }: { className?: string }) => (
  <svg
    viewBox="0 0 20 20"
    fill="currentColor"
    className={className}
    aria-hidden="true"
  >
    <rect x="3" y="10.5" width="3" height="7.5" rx="1.5" />
    <rect x="8.5" y="6.5" width="3" height="11.5" rx="1.5" />
    <rect x="14" y="2.5" width="3" height="15.5" rx="1.5" />
  </svg>
);

const features = [
  {
    icon: AscendingBarChart,
    title: 'Real-time Monitoring',
    subtitle: 'Data-driven operations',
  },
  {
    icon: Shield,
    title: 'Reliable Infrastructure',
    subtitle: 'Safe & continuous supply',
  },
  {
    icon: Leaf,
    title: 'Sustainable Operations',
    subtitle: 'Cleaner communities',
  },
  {
    icon: Users,
    title: 'Engineering Excellence',
    subtitle: 'People. Process. Performance.',
  },
];

const LoginPage = () => {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const imagesReady = useLogoPreload([orbitSwirl, loginBg]);

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
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="w-8 h-8 border-3 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div
      className="min-h-screen w-full relative flex items-center justify-center bg-cover bg-[center_35%] bg-no-repeat overflow-hidden select-none font-sans"
      style={{ backgroundImage: `url(${loginBg})` }}
    >
      {/* Top Left Company Brand Lockup */}
      <header className="absolute top-4 left-4 sm:top-6 sm:left-9 z-20 flex items-center">
        <img
          src={orbitSwirl}
          alt="Orbit Logo"
          className="h-[30px] sm:h-[34px] w-auto object-contain flex-shrink-0"
          loading="eager"
          decoding="sync"
        />
        <div className="ml-2.5 flex flex-col justify-center leading-none">
          <span className="text-[#0b2444] font-black text-[15px] sm:text-[17px] tracking-wide leading-none">
            ORBIT
          </span>
          <span className="text-[#152e4d] font-bold text-[7.5px] sm:text-[8.5px] tracking-[0.16em] uppercase leading-none mt-1">
            ENGINEERING SOLUTIONS
          </span>
        </div>
        <div className="hidden sm:block mx-3 sm:mx-3.5 w-[1.2px] h-7 bg-slate-400/50 self-center" />
        <div className="hidden sm:flex flex-col justify-center text-[10px] sm:text-[10.5px] font-medium text-[#152e4d] leading-[1.22]">
          <span>Engineering</span>
          <span>Sustainable</span>
          <span>Tomorrows</span>
        </div>
      </header>

      {/* Left Column: Smart Water Infrastructure Hero & Features */}
      <section
        aria-label="Features"
        className="hidden md:flex flex-col absolute left-7 sm:left-9 lg:left-10 bottom-[54px] z-10 max-w-[290px] lg:max-w-[310px]"
      >
        <div className="mb-3.5">
          <h2 className="text-[21px] sm:text-[23px] font-bold text-white tracking-tight leading-[1.14] drop-shadow-[0_2px_6px_rgba(0,0,0,0.5)]">
            Smart Water
            <br />
            Infrastructure
            <br />
            <span className="text-[#00a2ff] drop-shadow-[0_2px_8px_rgba(0,162,255,0.4)]">
              for a Better Tomorrow
            </span>
          </h2>
        </div>

        <div className="space-y-2.5">
          {features.map((item, idx) => (
            <div key={idx} className="flex items-center gap-2.5">
              <div className="w-[31px] h-[31px] sm:w-[33px] sm:h-[33px] rounded-xl bg-white/20 backdrop-blur-md border border-white/35 flex items-center justify-center text-white shadow-[0_2px_6px_rgba(0,0,0,0.12)] flex-shrink-0">
                <item.icon className="w-3.5 h-3.5 stroke-[2.2] drop-shadow-sm" />
              </div>
              <div className="flex flex-col leading-tight">
                <span className="text-white font-semibold text-[11.5px] sm:text-[12px] tracking-wide drop-shadow-[0_1px_3px_rgba(0,0,0,0.6)]">
                  {item.title}
                </span>
                <span className="text-white/85 font-normal text-[9.5px] sm:text-[10px] drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)] mt-0.5">
                  {item.subtitle}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Bottom Left Tagline */}
      <footer className="absolute bottom-4 left-7 sm:bottom-4.5 sm:left-9 z-20 hidden sm:flex items-center gap-2">
        <div className="w-4 h-[2px] bg-[#00a2ff] rounded-full drop-shadow-sm" />
        <span className="text-white/95 text-[9px] font-bold tracking-[0.22em] uppercase drop-shadow-[0_1px_4px_rgba(0,0,0,0.6)]">
          WATER &nbsp;|&nbsp; TECHNOLOGY &nbsp;|&nbsp; A BETTER TOMORROW
        </span>
      </footer>

      {/* Main Glass Login Card */}
      <main className="w-full max-w-[318px] mx-4 relative z-20 md:translate-x-[22px] -translate-y-0.5">
        <div className="rounded-[32px] bg-white/85 backdrop-blur-2xl border border-white/85 shadow-[0_20px_50px_rgba(0,0,0,0.12),0_1px_3px_rgba(0,0,0,0.05)] pt-6 sm:pt-6.5 pb-6 px-6 sm:px-7 text-slate-800 transition-all">
          {/* SCADA Portal Pill Badge */}
          <div className="flex justify-center mb-2.5">
            <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-[#e8f1fd] text-[#1d4ed8] text-[9.5px] font-bold tracking-wider uppercase shadow-xs">
              <Activity className="w-3 h-3 stroke-[2.5]" />
              <span>SCADA PORTAL</span>
            </div>
          </div>

          {/* Plant / Project Headings */}
          <div className="text-center mb-3">
            <h1 className="text-[14.5px] sm:text-[15px] font-extrabold text-[#0a1931] uppercase tracking-wide leading-tight">
              IEL & MCPPLJV PVT. LTD.
            </h1>
            <p className="text-[10.5px] sm:text-[11px] font-medium text-[#4b5563] mt-1 leading-snug">
              Improvement of Water Supply Scheme
            </p>
            <p className="text-[10px] sm:text-[10.5px] font-bold text-[#1d4ed8] uppercase tracking-wider mt-0.5">
              SHAHPUR, DISTT. SAGAR (M.P.)
            </p>
            <div className="w-full h-px bg-slate-200/80 mt-3.5 mb-3" />
          </div>

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-2.5">
            <div>
              <label className="block text-[11px] font-semibold text-[#1e293b] mb-1">
                Username
              </label>
              <div className="relative flex items-center">
                <User className="absolute left-3.5 h-3.5 w-3.5 text-[#475569] pointer-events-none" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Username"
                  className="w-full pl-9 pr-3.5 h-10 rounded-2xl bg-[#edf2f7] text-[12px] font-normal text-[#1e293b] placeholder:text-[#94a3b8] border border-transparent focus:border-blue-400 focus:bg-white focus:outline-none transition-all"
                  required
                  autoComplete="username"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-[#1e293b] mb-1">
                Password
              </label>
              <div className="relative flex items-center">
                <Lock className="absolute left-3.5 h-3.5 w-3.5 text-[#475569] pointer-events-none" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  className="w-full pl-9 pr-9 h-10 rounded-2xl bg-[#edf2f7] text-[12px] font-normal text-[#1e293b] placeholder:text-[#94a3b8] border border-transparent focus:border-blue-400 focus:bg-white focus:outline-none transition-all"
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 p-0.5 text-[#64748b] hover:text-[#1e293b] transition-colors focus:outline-none cursor-pointer"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <Eye className="h-3.5 w-3.5" />
                  ) : (
                    <EyeOff className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-1.5 text-rose-600 text-[10.5px] bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-1 mt-1">
                <AlertCircle className="h-3 w-3 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-3.5 h-10 rounded-2xl bg-gradient-to-r from-[#0066f6] to-[#0094ff] hover:from-[#0055d4] hover:to-[#0084eb] text-white font-bold text-[13px] tracking-wide shadow-[0_4px_14px_rgba(0,102,246,0.35)] active:scale-[0.99] transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Signing in...
                </span>
              ) : (
                <>
                  <LogIn className="h-3.5 w-3.5 stroke-[2.3]" />
                  <span>Sign In</span>
                </>
              )}
            </button>
          </form>

          {/* Card Footer */}
          <div className="text-center mt-4.5 sm:mt-5 space-y-0.5">
            <p className="text-[10px] text-[#475569]">
              Powered by{' '}
              <span className="font-bold text-[#0f172a]">
                Orbit Engineering Solutions
              </span>
            </p>
            <p className="text-[9.5px] text-[#64748b]">
              For a Smarter and Sustainable Water Future
            </p>
          </div>
        </div>
      </main>
    </div>
  );
};

export default LoginPage;
