import React, { lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileSpreadsheet, ArrowLeft, Download, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

const DataExportSettings = lazy(() => import('@/components/DataExportSettings'));

const ExportsPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background grid-pattern">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="flex items-center gap-4 mb-8">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')} className="rounded-full">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <FileSpreadsheet className="h-6 w-6 text-primary" />
              Data Exports
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Automated reports &amp; database retention logs</p>
          </div>
        </div>

        {/* ── Excel / Manual Export Banner ───────────────────────── */}
        <div className="mb-6 rounded-xl border border-primary/30 bg-primary/5 p-4 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className="p-2 rounded-lg bg-primary/10 shrink-0">
              <Download className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">
                📊 Manual Excel / CSV Export
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Date range select karo, sensor filter lagao aur ek click mein Excel download karo.
                Sab instruments ka data — WTP, Intake, OHT — 5-min interval mein milega.
              </p>
              <div className="flex items-center gap-1.5 mt-1.5 text-[11px] text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span>7 columns: Timestamp · Section · Sensor Type · Label · Value · Unit · Received At</span>
              </div>
            </div>
          </div>
          <Button
            size="sm"
            className="shrink-0 gap-2"
            onClick={() => navigate('/history')}
          >
            <FileSpreadsheet className="h-4 w-4" />
            History Page → Download
          </Button>
        </div>
        {/* ──────────────────────────────────────────────────────── */}

        <div className="mb-4">
          <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground inline-block" />
            Automated DB Exports &amp; Retention Logs
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Yeh server-side scheduled exports hain jo automatically generate hote hain.
          </p>
        </div>

        <Suspense fallback={<Skeleton className="h-64 w-full rounded-lg" />}>
          <DataExportSettings />
        </Suspense>
      </div>
    </div>
  );
};

export default ExportsPage;
