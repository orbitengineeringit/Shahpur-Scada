import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { type TagData, useScada } from '@/contexts/ScadaContext';
import { normalizeTelemetryValue, TELEMETRY_LIVE_MS } from '@/lib/telemetryQuality';
import { logError } from '@/lib/errorLogger';

export interface TelemetryRow {
  tag_id: string;
  value: number | null;
  quality: string;
  received_at: string;
}

/** Never roll a newer MQTT/realtime reading back with an older cloud response. */
export function applyCloudReading(tag: TagData, row: TelemetryRow, now = Date.now()): TagData {
  const at = Date.parse(row.received_at);
  if (!Number.isFinite(at) || at > now + 10000) return tag;
  if (tag.lastDataTime && at <= new Date(tag.lastDataTime).getTime()) return tag;
  const value = row.value === null ? null : normalizeTelemetryValue(row.value, tag);
  const fresh = now - at <= TELEMETRY_LIVE_MS;
  const fault = row.quality !== 'good' || value === null;
  return {
    ...tag, value: fresh && !fault ? (value ?? 0) : 0, status: !fresh ? 'disconnected' : fault ? 'fault' : 'connected',
    source: 'mqtt', isActive: fresh && !fault,
    lastDataTime: new Date(at), timestamp: new Date(at),
  };
}

export const useCloudTelemetrySync = () => {
  const { setIntakeTags, setOhtTags, setWtpTags, setTelemetryHealth } = useScada();
  const syncing = useRef(false);
  const apply = useCallback((rows: TelemetryRow[]) => {
    const byId = new Map(rows.map(r => [r.tag_id, r]));
    const update = (tags: TagData[]) => tags.map(tag => {
      const row = byId.get(tag.id);
      return row ? applyCloudReading(tag, row) : tag;
    });
    setIntakeTags(update); setOhtTags(update); setWtpTags(update);
  }, [setIntakeTags, setOhtTags, setWtpTags]);

  useEffect(() => {
    let stopped = false;
    const sync = async () => {
      if (syncing.current) return;
      syncing.current = true;
      try {
        const signal = AbortSignal.timeout(12000);
        const [latest, runs] = await Promise.all([
          supabase.from('telemetry_latest').select('tag_id,value,quality,received_at').abortSignal(signal),
          supabase.from('telemetry_ingest_runs').select('status,connected_at,last_message_at,started_at,error_message')
            .order('started_at', {ascending:false}).limit(3).abortSignal(signal),
        ]);
        if (stopped) return;
        if (latest.error) throw latest.error;
        if (runs.error) throw runs.error;
        apply(latest.data || []);
        const healthy = (runs.data || []).some(r =>
          !!r.connected_at && ['connected','receiving','completed','no_data'].includes(r.status) &&
          Date.now() - Date.parse(r.started_at) < 120000);
        setTelemetryHealth({
          state: healthy ? 'connected' : 'error', checkedAt: new Date(),
          message: healthy ? null : 'Data collector unavailable; readings retain their last received time.',
        });
      } catch (err) {
        if (!stopped) {
          logError('CloudTelemetry',err);
          setTelemetryHealth({state:'error',checkedAt:new Date(),message:'Live data connection unavailable. Retrying automatically.'});
        }
      } finally { syncing.current = false; }
    };
    const channel = supabase.channel('telemetry-live')
      .on('postgres_changes',{event:'*',schema:'public',table:'telemetry_latest'}, event => {
        if (!stopped && 'tag_id' in event.new) apply([event.new as TelemetryRow]);
      }).subscribe(status => { if (status === 'SUBSCRIBED') void sync(); });
    void sync();
    const timer = setInterval(sync,10000);
    const wake = () => { if (document.visibilityState === 'visible') void sync(); };
    window.addEventListener('online',sync);
    document.addEventListener('visibilitychange',wake);
    return () => {
      stopped = true; clearInterval(timer);
      window.removeEventListener('online',sync);
      document.removeEventListener('visibilitychange',wake);
      void supabase.removeChannel(channel);
    };
  }, [apply,setTelemetryHealth]);
};
