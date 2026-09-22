import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  CloudUpload, RefreshCw, Copy, ChevronDown, CheckCircle2, XCircle,
  Database, Clock, Wifi, Code2, FileText, History, Satellite,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface SyncLog {
  id: string;
  endpoint: string;
  response_status: number | null;
  response_body: string | null;
  request_payload: unknown;
  success: boolean;
  error_message: string | null;
  duration_ms: number | null;
  triggered_at: string;
}

interface SyncProof {
  endpoint?: string;
  status?: number | null;
  response?: string;
  duration_ms?: number | null;
  freshness_minutes?: number;
  included_stations?: string[];
  skipped_stations?: string[];
  source_latest_at?: Record<string, string>;
}

type ParamRow = { param: string; value: string; unit?: string; sensorId: string };

const VENDOR_KEY = 'UADDORESREG022';

const DEVICES = [
  { key: 'intake', id: 'SHA_INTK_001', label: 'INTAKE WELL' },
  { key: 'wtp', id: 'SHA_WTP_001', label: 'WATER TREATMENT PLANT (WTP)' },
  { key: 'oht1', id: 'SHA_OHT_001', label: 'OHT - 1 Bus Station' },
  { key: 'oht2', id: 'SHA_OHT_002', label: 'OHT - 2 (Pending)' },
] as const;

const stationDeliveryFromPayload = (payload: unknown, key: string, deviceId: string) => {
  if (!payload || typeof payload !== 'object') return { included: undefined, sourceAt: undefined };
  const body = payload as Record<string, unknown>;
  if (key === 'intake') {
    const intake = body.intake as Record<string, unknown> | undefined;
    const sourceAt = typeof intake?.recordDateTime === 'string' ? intake.recordDateTime : undefined;
    const included = !!intake && ['intakeWellLevel_mtr', 'outletFlow_mld', 'headerActualPressure']
      .some(field => typeof intake[field] === 'number');
    return { included, sourceAt };
  }
  const unit = Array.isArray(body.wtpUnits) ? body.wtpUnits[0] as Record<string, unknown> | undefined : undefined;
  if (key === 'wtp') {
    const wtp = unit?.wtp as Record<string, unknown> | undefined;
    const sourceAt = typeof wtp?.recordDateTime === 'string' ? wtp.recordDateTime : undefined;
    const included = !!wtp && ['inletFlow_mld', 'outletFlow_mld', 'rawPh', 'treatedPh', 'cwrLevel', 'backwashLevel']
      .some(field => typeof wtp[field] === 'number');
    return { included, sourceAt };
  }
  const ohts = Array.isArray(unit?.ohts) ? unit.ohts as Record<string, unknown>[] : [];
  const oht = ohts.find((item) => item.ohT_Device_id === deviceId);
  return { included: !!oht, sourceAt: typeof oht?.recordDateTime === 'string' ? oht.recordDateTime : undefined };
};

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;

const rowsFromPayload = (payload: unknown, key: string, deviceId: string): ParamRow[] => {
  const body = asRecord(payload);
  if (!body) return [];
  const unit = Array.isArray(body.wtpUnits) ? asRecord(body.wtpUnits[0]) : undefined;
  let station: Record<string, unknown> | undefined;
  if (key === 'intake') station = asRecord(body.intake);
  else if (key === 'wtp') station = asRecord(unit?.wtp);
  else {
    const ohts = Array.isArray(unit?.ohts) ? unit.ohts.map(asRecord).filter(Boolean) as Record<string, unknown>[] : [];
    station = ohts.find(item => item.ohT_Device_id === deviceId);
  }
  if (!station) return [];

  const value = (field: string, digits = 2): string | undefined => {
    const raw = station?.[field];
    const numeric = typeof raw === 'number' ? raw : Number(raw);
    return Number.isFinite(numeric) ? numeric.toFixed(digits) : undefined;
  };
  const row = (param: string, field: string, unitLabel: string, sensorId: string, digits = 2): ParamRow | null => {
    const formatted = value(field, digits);
    return formatted === undefined ? null : { param, value: formatted, unit: unitLabel, sensorId };
  };

  const rows = key === 'intake'
    ? [
        row('River Level', 'intakeWellLevel_mtr', '%', 'INT-LT'),
        row('Inlet Flow', 'inletFlow_mld', 'MLD', 'INT-Flow-IN', 4),
        row('Outlet Flow', 'outletFlow_mld', 'MLD', 'INT-Flow-OUT', 4),
        row('Header Pressure', 'headerActualPressure', 'Bar', 'INT-HeaderPT', 3),
      ]
    : key === 'wtp'
      ? [
          row('Inlet Flow', 'inletFlow_mld', 'MLD', 'WTP-Flow-IN', 4),
          row('Outlet Flow', 'outletFlow_mld', 'MLD', 'WTP-Flow-OUT', 4),
          row('Raw pH', 'rawPh', 'pH', 'WTP-PH-IN'),
          row('Raw Turbidity', 'rawTurbidity', 'NTU', 'WTP-TA-IN'),
          row('Treated pH', 'treatedPh', 'pH', 'WTP-PH'),
          row('Treated Turbidity', 'treatedTurbidity', 'NTU', 'WTP-TA'),
          row('Chlorine', 'chlorine', 'ppm', 'WTP-CL', 3),
          row('CWR Level', 'cwrLevel', '%', 'WTP-LT-CW'),
          row('Backwash Level', 'backwashLevel', '%', 'WTP-LT-BW'),
          row('Header Pressure', 'headerActualPressure', 'Bar', 'WTP-HeaderPT', 3),
        ]
      : [
          row('Level', 'waterLevel_mld', '%', `${key.toUpperCase()}-LT`),
          row('Outlet Flow', 'outletFlow_mld', 'MLD', `${key.toUpperCase()}-Flow`, 4),
          row('Inlet Pressure', 'inletPressure', 'Bar', `${key.toUpperCase()}-PT`, 3),
        ];
  return rows.filter((item): item is ParamRow => item !== null);
};

const GisSyncStatus = () => {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [logsLoaded, setLogsLoaded] = useState(false);
  const [lastPayload, setLastPayload] = useState<unknown>(null);
  const [lastResponse, setLastResponse] = useState<SyncProof | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [showJson, setShowJson] = useState(false);

  const readLocal = () => {
    try {
      setLastPayload(JSON.parse(localStorage.getItem('gov_last_payload') || 'null'));
      setLastResponse(JSON.parse(localStorage.getItem('gov_last_response') || 'null') as SyncProof | null);
      setLastSyncAt(localStorage.getItem('gov_last_sync_at'));
    } catch { /* ignore */ }
  };

  const fetchLogs = async () => {
    const { data } = await supabase
      .from('gis_sync_logs')
      .select('*')
      .order('triggered_at', { ascending: false })
      .limit(10);
    if (data) setLogs(data as SyncLog[]);
    setLogsLoaded(true);
  };

  useEffect(() => {
    if (!open) return;
    readLocal();
    fetchLogs();
    const onUpd = () => { readLocal(); fetchLogs(); };
    window.addEventListener('gis-sync-updated', onUpd);
    const id = setInterval(fetchLogs, 10_000);
    return () => { window.removeEventListener('gis-sync-updated', onUpd); clearInterval(id); };
  }, [open]);

  const triggerSync = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('gis-sync');
      if (error) throw error;
      const result = data as { proof?: SyncProof; success?: boolean; request_payload?: unknown } | null;
      const proof = result?.proof;
      const ok = result?.success;
      if (ok) toast.success(`GIS sync OK (HTTP ${proof?.status})`);
      else toast.error(`GIS sync failed: HTTP ${proof?.status ?? 'n/a'}`);
      localStorage.setItem('gov_last_payload', JSON.stringify(result?.request_payload ?? null));
      localStorage.setItem('gov_last_response', JSON.stringify(proof ?? null));
      localStorage.setItem('gov_last_sync_at', new Date().toISOString());
      readLocal();
      fetchLogs();
    } catch (e: unknown) {
      toast.error(`Sync error: ${e?.message || e}`);
    } finally { setBusy(false); }
  };

  const copyProof = (log: SyncLog) => {
    const text = [
      '════════════════════════════════════',
      'MPGARUD SCADA-to-GIS Proof of Delivery',
      '════════════════════════════════════',
      `Timestamp (IST): ${new Date(log.triggered_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`,
      `Endpoint: ${log.endpoint}`,
      `HTTP Status: ${log.response_status ?? 'n/a'}`,
      `Success: ${log.success}`,
      `Duration: ${log.duration_ms ?? '?'} ms`,
      `Response Body: ${log.response_body ?? ''}`,
      'Request Payload (JSON):',
      JSON.stringify(log.request_payload, null, 2),
      '════════════════════════════════════',
    ].join('\n');
    navigator.clipboard.writeText(text);
    toast.success('Proof copied to clipboard');
  };

  const lastLog = logs[0];
  const successCount = logs.filter(l => l.success).length;
  const batchTotal = logs.length;
  const gatewayOk = lastLog ? lastLog.success : !!lastResponse && lastResponse.status != null && lastResponse.status >= 200 && lastResponse.status < 300;
  const gatewayUnknown = logsLoaded ? !lastLog && !lastResponse : !lastResponse;
  const lastDuration = lastLog?.duration_ms ?? lastResponse?.duration_ms;
  const lastStatus = lastLog?.response_status ?? lastResponse?.status;
  const latestLogTime = lastLog?.triggered_at || lastSyncAt;
  const lastTimeStr = latestLogTime
    ? new Date(latestLogTime).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '—';
  const activePayload = lastLog?.request_payload ?? lastPayload;
  // A DB audit log is authoritative. Browser-local proof is used only until
  // the corresponding audit row becomes visible, avoiding mixed attempts.
  const activeProof = lastLog ? null : lastResponse;
  const includedStations = activeProof?.included_stations;
  const skippedStations = activeProof?.skipped_stations;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          title="MP GIS Sensor Sync"
          className="flex items-center gap-1 px-1.5 py-0.5 sm:px-2 sm:py-1 rounded-lg text-[9px] sm:text-[10px] font-bold border bg-primary/10 text-primary border-primary/20 hover:bg-primary/20 transition"
        >
          <Satellite className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
          <span className="uppercase tracking-wider hidden sm:inline">GIS</span>
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-6xl w-[calc(100vw-1rem)] sm:w-[calc(100vw-2rem)] max-h-[92vh] overflow-y-auto p-0 gap-0">
        {/* Header */}
        <DialogHeader className="px-4 sm:px-6 pt-5 sm:pt-6 pb-4 border-b bg-gradient-to-r from-primary/5 via-transparent to-primary/5">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
            <div className="flex items-start gap-2.5 sm:gap-3 min-w-0 pr-6 sm:pr-0">
              <div className="p-2 rounded-xl bg-primary/10 border border-primary/20 shrink-0">
                <CloudUpload className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
              </div>
              <div className="min-w-0">
                <DialogTitle className="text-sm sm:text-lg font-bold tracking-tight leading-tight text-left">
                  Shahpur MPGARUD GIS Lab API · Sensor Sync Details
                </DialogTitle>
                <p className="text-[10px] sm:text-xs text-muted-foreground mt-1 text-left">
                  Real-time integration data pipeline for Directorate of Urban Administration & Development, Bhopal.
                </p>
              </div>
            </div>
            <div className="flex sm:flex-col items-center sm:items-end gap-2 sm:gap-1 text-[10px] sm:text-[11px] sm:mr-8 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Vendor Key:</span>
                <span className="font-mono font-bold tracking-wider">{VENDOR_KEY}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Status:</span>
                <Badge className="bg-success/15 text-success border-success/30 hover:bg-success/15 text-[10px] font-bold">ENABLED</Badge>
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="p-3 sm:p-6 space-y-4 sm:space-y-5">
          {/* Top stat row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
            <StatCard
              label="LAST TRANSMISSION"
              icon={<Wifi className="h-4 w-4" />}
              value={
                gatewayUnknown ? (
                  <span className="flex items-center gap-1.5 font-bold text-muted-foreground">
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    CHECKING…
                  </span>
                ) : (
                  <span className={`flex items-center gap-1.5 font-bold ${gatewayOk ? 'text-success' : 'text-destructive'}`}>
                    {gatewayOk ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                    {gatewayOk ? 'SUCCESS' : 'FAILED'}
                  </span>
                )
              }
              accent={
                <Badge className={`text-[10px] font-bold ${gatewayUnknown ? 'bg-muted text-muted-foreground border-border' : gatewayOk ? 'bg-success/15 text-success border-success/30' : 'bg-destructive/15 text-destructive border-destructive/30'}`}>
                  {gatewayUnknown ? '…' : gatewayOk ? 'OK' : 'ERR'}
                </Badge>
              }
            />
            <StatCard
              label="RECENT TRANSMISSIONS"
              icon={<Database className="h-4 w-4" />}
              value={
                <span className="text-base font-bold">
                  {successCount} / {batchTotal || 0} <span className="text-xs font-medium text-muted-foreground">Successful</span>
                </span>
              }
            />
            <StatCard
              label="LAST ATTEMPT TIME"
              icon={<Clock className="h-4 w-4 text-primary" />}
              value={<span className="text-base font-bold font-mono">{lastTimeStr}</span>}
              accent={<span className="text-[10px] text-muted-foreground">automatic every 1 hour</span>}
            />
            <div className="rounded-xl border bg-card p-3 flex flex-col gap-2">
              <div className="text-[10px] font-bold tracking-wider text-muted-foreground">MANUAL SYNC OVERRIDE</div>
              <div className="flex gap-2">
                <Button onClick={triggerSync} disabled={busy} size="sm" className="flex-1 h-8 text-xs">
                  <RefreshCw className={`h-3 w-3 mr-1 ${busy ? 'animate-spin' : ''}`} />
                  {busy ? 'Syncing…' : 'Trigger Sync Now'}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setShowJson(s => !s)} className="h-8 text-xs">
                  <Code2 className="h-3 w-3 mr-1" /> JSON
                </Button>
              </div>
            </div>
          </div>

          {/* Sensor Sync Board */}
          <div>
            <div className="flex flex-col sm:flex-row sm:items-baseline gap-0.5 sm:gap-2 mb-2">
              <h3 className="text-xs font-bold tracking-wider text-foreground">SENSOR SYNC BOARD</h3>
              <span className="text-[10px] sm:text-[11px] text-muted-foreground">(swipe / scroll horizontally to view all 4 stations)</span>
            </div>
            <div className="overflow-x-auto pb-2 -mx-1 px-1">
              <div className="flex gap-3 min-w-min">
                {DEVICES.map(d => {
                  const delivery = stationDeliveryFromPayload(activePayload, d.key, d.id);
                  const included = includedStations ? includedStations.includes(d.key) : delivery.included;
                  const skipped = skippedStations ? skippedStations.includes(d.key) : included === false;
                  return (
                    <StationCard
                      key={d.key}
                      label={d.label}
                      deviceId={d.id}
                      success={gatewayOk}
                      unknown={gatewayUnknown}
                      status={lastStatus}
                      duration={lastDuration}
                      timeStr={lastTimeStr}
                      rows={rowsFromPayload(activePayload, d.key, d.id)}
                      payload={activePayload}
                      responseText={lastLog?.response_body || lastResponse?.response}
                      included={included}
                      skipped={skipped}
                      sourceAt={activeProof?.source_latest_at?.[d.key] || delivery.sourceAt}
                    />
                  );
                })}
              </div>
            </div>
          </div>

          {/* Full JSON collapsible */}
          {showJson && (
            <div className="rounded-xl border bg-card">
              <div className="flex items-center justify-between px-4 py-2 border-b">
                <div className="flex items-center gap-2 text-xs font-bold">
                  <Code2 className="h-4 w-4 text-primary" /> Full Outgoing Pipeline JSON
                </div>
                <Button
                  variant="ghost" size="sm"
                  onClick={() => { navigator.clipboard.writeText(JSON.stringify(activePayload ?? {}, null, 2)); toast.success('JSON copied'); }}
                >
                  <Copy className="h-3 w-3 mr-1" /> Copy
                </Button>
              </div>
              <pre className="p-3 text-[10px] overflow-auto max-h-[40vh] whitespace-pre-wrap break-all font-mono">
                {activePayload ? JSON.stringify(activePayload, null, 2) : 'No payload yet — trigger a sync.'}
              </pre>
            </div>
          )}

          {/* Recent sync logs */}
          <details className="rounded-xl border bg-card" open>
            <summary className="cursor-pointer flex items-center justify-between px-4 py-3 select-none">
              <div className="flex items-center gap-2 text-xs font-bold">
                <History className="h-4 w-4 text-primary" />
                Recent Sync Logs · Pipeline History (Last {logs.length})
              </div>
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </summary>
            <div className="divide-y border-t">
              {logs.length === 0 && (
                <div className="text-xs text-muted-foreground p-4 text-center">No sync logs yet.</div>
              )}
              {logs.map(log => (
                <div key={log.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-3 sm:px-4 py-2.5 text-xs hover:bg-muted/30 transition">
                  <div className="flex items-center gap-2 min-w-0">
                    {log.success
                      ? <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
                      : <XCircle className="h-4 w-4 text-destructive shrink-0" />}
                    <div className="min-w-0">
                      <div className="font-semibold truncate">
                        {log.success ? 'Transmission Successful' : 'Transmission Failed'}
                      </div>
                      <div className="font-mono text-[10px] text-muted-foreground truncate">
                        {new Date(log.triggered_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false })} IST · {log.duration_ms ?? '?'}ms
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-6 sm:ml-0">
                    <Badge variant="outline" className={`text-[10px] font-mono font-bold ${log.success ? 'text-success border-success/40 bg-success/10' : 'text-destructive border-destructive/40 bg-destructive/10'}`}>
                      HTTP {log.response_status ?? 'ERR'}
                    </Badge>
                    <Button variant="ghost" size="sm" className="h-7 text-[10px]" onClick={() => copyProof(log)}>
                      <Copy className="h-3 w-3 mr-1" /> Copy Proof
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </details>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default GisSyncStatus;

/* ---------- Subcomponents ---------- */

const StatCard = ({ label, icon, value, accent }: {
  label: string; icon: React.ReactNode; value: React.ReactNode; accent?: React.ReactNode;
}) => (
  <div className="rounded-xl border bg-card p-3 flex flex-col gap-1.5">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-1.5 text-[10px] font-bold tracking-wider text-muted-foreground">
        <span className="text-muted-foreground">{icon}</span>
        {label}
      </div>
      {accent}
    </div>
    <div className="text-sm">{value}</div>
  </div>
);

const StationCard = ({ label, deviceId, success, unknown: unknownProp, status, duration, timeStr, rows, payload, responseText, included, skipped, sourceAt }: {
  label: string; deviceId: string; success: boolean; unknown?: boolean;
  status?: number | null; duration?: number | null; timeStr: string;
  rows: ParamRow[]; payload: unknown; responseText?: string | null;
  included?: boolean; skipped?: boolean; sourceAt?: string;
}) => {
  const [showJson, setShowJson] = useState(false);
  const [showResp, setShowResp] = useState(false);
  return (
    <div className="w-[260px] sm:w-[300px] shrink-0 rounded-xl border bg-card overflow-hidden flex flex-col">
      <div className="px-3 py-2 border-b flex items-center justify-between bg-muted/30">
        <div className="min-w-0">
          <div className="text-[11px] font-bold tracking-wide truncate">{label}</div>
          <div className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground">
            <span>{deviceId}</span>
            <button
              className="hover:text-foreground"
              onClick={() => { navigator.clipboard.writeText(deviceId); toast.success('Device ID copied'); }}
            >
              <Copy className="h-2.5 w-2.5" />
            </button>
          </div>
        </div>
        <Badge className={`text-[9px] font-bold ${unknownProp ? 'bg-muted text-muted-foreground border-border' : skipped ? 'bg-muted text-muted-foreground border-border' : success && included !== false ? 'bg-success/15 text-success border-success/30' : 'bg-destructive/15 text-destructive border-destructive/30'}`}>
          {unknownProp ? '…' : skipped ? 'NOT SENT' : success && included !== false ? 'SENT' : 'FAILED'}
        </Badge>
      </div>

      <div className="px-3 py-2 border-b text-[10px] font-mono flex items-center justify-between gap-2 bg-background">
        <span><span className="text-muted-foreground">Code:</span> <b className={skipped ? 'text-muted-foreground' : success ? 'text-success' : 'text-destructive'}>{skipped ? '—' : status ?? '—'}</b></span>
        <span><span className="text-muted-foreground">Duration:</span> <b>{skipped ? '—' : duration != null ? `${duration}ms` : '—'}</b></span>
        <span><span className="text-muted-foreground">{skipped ? 'Last seen:' : 'Data:'}</span> <b>{sourceAt ? new Date(sourceAt).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' }) : skipped ? '—' : timeStr}</b></span>
      </div>

      <div className="px-3 py-2">
        <div className="text-[10px] font-bold tracking-wider text-muted-foreground mb-1.5">PARAMETERS SENT IN THIS ATTEMPT</div>
        {rows.length > 0 ? (
          <div className="text-[10px]">
            <div className="grid grid-cols-[1fr_auto_auto] gap-x-2 gap-y-1 font-mono items-center">
              <div className="text-muted-foreground font-semibold">Param</div>
              <div className="text-muted-foreground font-semibold text-right">Value</div>
              <div className="text-muted-foreground font-semibold text-right">Sensor ID</div>
              {rows.map(r => (
                <FragmentRow key={r.sensorId} row={r} />
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-lg bg-muted/50 px-2.5 py-3 text-[10px] text-muted-foreground text-center">
            {skipped ? 'No fresh telemetry was sent for this station.' : 'No station payload is available for this attempt.'}
          </div>
        )}
      </div>

      <div className="mt-auto px-3 py-2 border-t flex gap-1.5 bg-muted/20">
        <Button variant="outline" size="sm" className="h-7 text-[10px] flex-1" onClick={() => setShowJson(s => !s)}>
          <Code2 className="h-3 w-3 mr-1" /> Outgoing JSON
        </Button>
        <Button variant="outline" size="sm" className="h-7 text-[10px] flex-1" onClick={() => setShowResp(s => !s)}>
          <FileText className="h-3 w-3 mr-1" /> Response
        </Button>
      </div>
      {showJson && (
        <pre className="px-3 py-2 text-[9px] bg-muted/40 max-h-40 overflow-auto whitespace-pre-wrap break-all font-mono border-t">
          {payload ? JSON.stringify(payload, null, 2) : 'No payload yet.'}
        </pre>
      )}
      {showResp && (
        <pre className="px-3 py-2 text-[9px] bg-muted/40 max-h-40 overflow-auto whitespace-pre-wrap break-all font-mono border-t">
          {responseText || 'No response captured.'}
        </pre>
      )}
    </div>
  );
};

const FragmentRow = ({ row }: { row: ParamRow }) => (
  <>
    <div className="font-semibold">{row.param}</div>
    <div className="text-right">
      <span className="inline-block px-1.5 py-0.5 rounded bg-primary/10 text-primary font-bold">
        {row.value}{row.unit ? <span className="text-muted-foreground font-normal ml-1">{row.unit}</span> : null}
      </span>
    </div>
    <div className="text-right text-muted-foreground font-mono truncate max-w-[110px]">{row.sensorId}</div>
  </>
);
