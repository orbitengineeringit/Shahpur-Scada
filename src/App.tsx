import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ScadaProvider } from "@/contexts/ScadaContext";
import { MqttProvider } from "@/contexts/MqttContext";
import { AlarmProvider } from "@/contexts/AlarmContext";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { useMqttTagSync } from "@/hooks/useMqttTagSync";
import { useScada } from "@/contexts/ScadaContext";
import { useAutoExportDownload } from "@/hooks/useAutoExportDownload";
import { lazy, Suspense, useEffect } from "react";
import PageSkeleton from "@/components/PageSkeleton";
import Header from "@/components/Header";
import LoginPage from "@/pages/LoginPage";

// Eagerly load core pages for instant navigation
import Index from "./pages/Index";
import IntakePage from "./pages/IntakePage";
import OhtPage from "./pages/OhtPage";
import WtpPage from "./pages/WtpPage";

// Lazy-load secondary pages
const HistoryPage = lazy(() => import("./pages/HistoryPage"));
const AlarmsPage = lazy(() => import("./pages/AlarmsPage"));
// MqttSettingsPage removed from client access for security
const ExportsPage = lazy(() => import("./pages/ExportsPage"));
const NotFound = lazy(() => import("./pages/NotFound"));

// Eagerly load analytics pages for instant navigation
import IntakeAnalyticsPage from "./pages/IntakeAnalyticsPage";
import WtpAnalyticsPage from "./pages/WtpAnalyticsPage";
import OhtAnalyticsPage from "./pages/OhtAnalyticsPage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});

import { useCloudTelemetrySync } from "@/hooks/useCloudTelemetrySync";
import { useMqtt } from "@/contexts/MqttContext";

/** Cloud sync fallback worker when direct MQTT is unavailable */
const CloudSyncWorker = () => {
  useCloudTelemetrySync();
  const { telemetryHealth } = useScada();
  return telemetryHealth.state === 'error' ? (
    <div role="status" className="border-b border-warning/30 bg-warning/10 px-4 py-2 text-sm text-center">
      {telemetryHealth.message}
    </div>
  ) : null;
};

/** Bridge component connecting MQTT messages to SCADA state */
const MqttScadaBridge: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { intakeTags, ohtTags, wtpTags, setIntakeTags, setOhtTags, setWtpTags, setMqttEnabled } = useScada();
  const { processMqttMessage, startBatchWriter } = useMqttTagSync(
    intakeTags, ohtTags, wtpTags, setIntakeTags, setOhtTags, setWtpTags
  );

  useEffect(() => {
    const cleanup = startBatchWriter();
    return cleanup;
  }, [startBatchWriter]);

  const handleMqttMessage = (message: any) => {
    setMqttEnabled(true);
    processMqttMessage(message);
  };

  return (
    <MqttProvider onMessage={handleMqttMessage}>
      <CloudSyncWorker />
      {children}
    </MqttProvider>
  );
};

const AutoExportChecker = () => {
  useAutoExportDownload();
  return null;
};

const AuthenticatedApp = () => (
  <ScadaProvider>
    <AlarmProvider>
      <MqttScadaBridge>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <AutoExportChecker />
          <BrowserRouter>
            <Header />
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/intake" element={<IntakePage />} />
              <Route path="/oht" element={<OhtPage />} />
              <Route path="/wtp" element={<WtpPage />} />
              <Route path="/history" element={<Suspense fallback={<PageSkeleton />}><HistoryPage /></Suspense>} />
              <Route path="/alarms" element={<Suspense fallback={<PageSkeleton />}><AlarmsPage /></Suspense>} />
              <Route path="/exports" element={<Suspense fallback={<PageSkeleton />}><ExportsPage /></Suspense>} />
              
              {/* Analytics Routes */}
              <Route path="/analytics/intake" element={<IntakeAnalyticsPage />} />
              <Route path="/analytics/wtp" element={<WtpAnalyticsPage />} />
              <Route path="/analytics/oht" element={<OhtAnalyticsPage />} />
              <Route path="*" element={<Suspense fallback={<PageSkeleton />}><NotFound /></Suspense>} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </MqttScadaBridge>
    </AlarmProvider>
  </ScadaProvider>
);

const AppGate = () => {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return (
    <div className="min-h-screen bg-background grid-pattern flex items-center justify-center">
      <div className="w-8 h-8 border-3 border-primary/30 border-t-primary rounded-full animate-spin" />
    </div>
  );
  if (!isAuthenticated) return <LoginPage />;
  return <AuthenticatedApp />;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <AppGate />
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
