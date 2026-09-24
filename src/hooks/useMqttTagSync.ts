import { useCallback, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { MqttMessage } from '@/contexts/MqttContext';
import { type TagData, getDefaultSetpoints } from '@/contexts/ScadaContext';
import { toast } from 'sonner';
import { useAlarm } from '@/contexts/AlarmContext';
import { logError, logDebug, logWarn, logInfo } from '@/lib/errorLogger';
import {
  ALL_OHT_SENSORS, INTAKE_SENSORS, WTP_SENSORS, ALL_SENSORS,
  VALID_OHT_KEYS, VALID_INTAKE_KEYS, VALID_WTP_KEYS,
  ShahpurSensor, PT_TO_PUMP_MAP,
} from '@/config/shahpurSensors';
import { normalizeTelemetryValue, sanitizeRtuValue, TELEMETRY_OFFLINE_MS } from '@/lib/telemetryQuality';

interface TagUpdate {
  tagId: string;
  value: number | null;
  section: 'oht' | 'intake' | 'wtp';
  topic: string;
  reason?: 'interval' | 'abnormal' | 'alarm' | 'state_change';
  alignedTimestamp?: string;
}

const DISCONNECT_TIMEOUT_MS = 3000;
const ABNORMAL_DELTA_PCT = 0.12;        // 12% of sensor range
const FLUSH_INTERVAL_MS = 30 * 1000;    // batch-write queue to DB every 30s
// NOTE: Periodic 5-minute snapshots are handled exclusively by the server-side
// pg_cron → scada-ingest Edge Function. Browser-side periodic snapshots were
// removed to fix irregular save intervals caused by browser timer throttling
// in background tabs. Only event-driven writes (alarm, abnormal, state_change)
// are sent from the browser.

const isAbnormalReading = (sensor: ShahpurSensor, value: number): boolean => {
  switch (sensor.instrumentType) {
    case 'pt':
    case 'combined_pt':
      return value < 0.3 || value > sensor.max * 0.85;
    case 'lt':
      return value < 8 || value > 95;
    case 'flow':
      return value > sensor.max * 0.95;
    case 'ph':
      return value < 6.5 || value > 8.5;
    case 'chlorine':
      return value < 0.2 || value > 1.5;
    case 'turbidity': {
      const isRawIntake = sensor.section === 'wtp' && sensor.id.includes('TA-IN');
      return isRawIntake ? value > 50 : value > 5;
    }
    case 'kw':
      return value > sensor.max * 0.9;
    default:
      return false;
  }
};

export const useMqttTagSync = (
  intakeTags: TagData[],
  ohtTags: TagData[],
  wtpTags: TagData[],
  setIntakeTags: React.Dispatch<React.SetStateAction<TagData[]>>,
  setOhtTags: React.Dispatch<React.SetStateAction<TagData[]>>,
  setWtpTags: React.Dispatch<React.SetStateAction<TagData[]>>
) => {
  const pendingLogs = useRef<TagUpdate[]>([]);
  const flushInterval = useRef<NodeJS.Timeout | null>(null);

  const disconnectCheckInterval = useRef<NodeJS.Timeout | null>(null);
  const { addAlarm } = useAlarm();
  const tagConfigCache = useRef<Map<string, string>>(new Map());
  const lastCacheRefresh = useRef<number>(0);
  const CACHE_TTL = 30000;
  
  const tagsRef = useRef({ intakeTags, ohtTags, wtpTags });
  tagsRef.current = { intakeTags, ohtTags, wtpTags };

  // Per-tag last-saved tracker for deadband + interval logic
  const lastSaved = useRef<Map<string, { value: number | null; at: number; inAlarm: boolean }>>(new Map());

  // Alarm tracking state
  const alarmActiveSince = useRef<Map<string, number>>(new Map());
  // Sensor frozen tracking: tagId -> { value: number; timestamp: number }
  const lastValueTracker = useRef<Map<string, { value: number; timestamp: number }>>(new Map());
  // Rolling pressure history for cavitation checks: tagId -> { value: number; timestamp: number }[]
  const pressureHistory = useRef<Map<string, { value: number; timestamp: number }[]>>(new Map());
  // Rolling level history for turbulence check: tagId -> { value: number; timestamp: number }[]
  const levelHistory = useRef<Map<string, { value: number; timestamp: number }[]>>(new Map());
  // Level trend tracker for Mass Balance check: tagId -> { startLevel: number; timestamp: number }
  const massBalanceTracker = useRef<Map<string, { startLevel: number; timestamp: number }>>(new Map());
  // Pump start times tracker for short cycling watchdog: pumpId -> startTimestamps[]
  const pumpStartHistory = useRef<Map<string, number[]>>(new Map());
  // Timestamp tracker for the last received message per section (TDM Case E Gateway check)
  const lastMessageTime = useRef<Map<string, number>>(new Map());

  // 32-bit totalizer registers for Intake (H * 65536 + L)
  const inTotHRef = useRef<number | null>(null);
  const inTotLRef = useRef<number | null>(null);
  const outTotHRef = useRef<number | null>(null);
  const outTotLRef = useRef<number | null>(null);

  // Helper to determine if pressure alarm should be suppressed due to no flow
  const isPressureSuppressed = (sensorId: string, currentTags: TagData[]): boolean => {
    const getSectionFlowValue = (sec: 'intake' | 'wtp', flowTagId: string): number => {
      const localTags = sec === 'intake' ? intakeTags : wtpTags;
      const localFlow = localTags.find(t => t.id === flowTagId);
      
      // If local flow sensor is online and valid, use it
      if (localFlow && localFlow.status === 'connected' && localFlow.value !== null) {
        return localFlow.value;
      }
      
      // Fallback to cross-section redundancy (Intake outflow matches WTP raw water inflow)
      const crossTags = sec === 'intake' ? wtpTags : intakeTags;
      const crossFlowId = sec === 'intake' ? 'WTP-Flow-IN' : 'INT-Flow-OUT';
      const crossFlow = crossTags.find(t => t.id === crossFlowId || t.id === 'INT-Flow');
      if (crossFlow && crossFlow.status === 'connected' && crossFlow.value !== null) {
        return crossFlow.value;
      }
      
      return 999.0; // If both are offline, disable suppression (safety fallback)
    };

    if (sensorId.startsWith('INT-PT') || sensorId === 'INT-HeaderPT' || sensorId === 'INT-CombinedPT') {
      const flowVal = getSectionFlowValue('intake', 'INT-Flow-OUT');
      return flowVal < 5.0;
    }
    if (sensorId.startsWith('WTP-PT') || sensorId.startsWith('WTP-CombinedPT') || sensorId === 'WTP-HeaderPT') {
      const flowVal = getSectionFlowValue('wtp', 'WTP-Flow-IN');
      return flowVal < 5.0;
    }
    if (sensorId.startsWith('OHT') && sensorId.includes('-PT')) {
      const ohtNum = sensorId.match(/OHT(\d+)/)?.[1];
      if (ohtNum) {
        const flowTag = currentTags.find(t => t.id === `OHT${ohtNum}-Flow` || t.id === `OHT${ohtNum}-Flow-IN`);
        if (!flowTag || flowTag.status !== 'connected' || flowTag.value === null) {
          return false; // local flow sensor offline, disable suppression
        }
        return flowTag.value < 1.0;
      }
    }
    return false;
  };

  useEffect(() => {
    disconnectCheckInterval.current = setInterval(() => {
      const now = new Date();
      const nowTime = now.getTime();
      
      // Check for Central Gateway Offline isolation (TDM Layer 2)
      // Cellular links can pause for several minutes and then deliver a burst.
      // Declare the gateway offline only after the shared hard timeout.
      const intakeLast = lastMessageTime.current.get('intake') || 0;
      const wtpLast = lastMessageTime.current.get('wtp') || 0;
      const ohtLast = lastMessageTime.current.get('oht') || 0;

      const isGatewayOffline = (intakeLast > 0 && nowTime - intakeLast > TELEMETRY_OFFLINE_MS) &&
                               (wtpLast > 0 && nowTime - wtpLast > TELEMETRY_OFFLINE_MS) &&
                               (ohtLast > 0 && nowTime - ohtLast > TELEMETRY_OFFLINE_MS);

      if (isGatewayOffline) {
        const gwKey = 'SCADA-Gateway-Offline';
        const gwStart = alarmActiveSince.current.get(gwKey);
        if (!gwStart) {
          alarmActiveSince.current.set(gwKey, nowTime);
          addAlarm({
            tagId: 'GATEWAY',
            label: 'SCADA Server Gateway',
            value: 0,
            unit: '',
            type: 'Disconnect',
            message: 'SCADA Server Gateway Offline: Complete cellular sensor/internet connection loss suspected at WTP Server',
            section: 'wtp',
          });
        }

        // Mark all tags as disconnected silently to prevent individual alarm storms
        const silenceDisconnectTags = (setter: React.Dispatch<React.SetStateAction<TagData[]>>) => {
          setter(prev => prev.map(tag => {
            if (tag.source === 'mqtt' && tag.status !== 'disconnected') {
              return { ...tag, status: 'disconnected' as const };
            }
            return tag;
          }));
        };
        silenceDisconnectTags(setIntakeTags);
        silenceDisconnectTags(setOhtTags);
        silenceDisconnectTags(setWtpTags);
        return;
      }

      // Clear gateway offline once network is restored
      alarmActiveSince.current.delete('SCADA-Gateway-Offline');

      // The UI shows an amber delayed state after 2 minutes. Only this hard
      // timeout changes the tag to offline and raises a disconnect alarm.
      const checkTags = (setter: React.Dispatch<React.SetStateAction<TagData[]>>) => {
        setter(prev => prev.map(tag => {
          if (tag.source === 'mqtt' && tag.lastDataTime) {
            const elapsed = nowTime - tag.lastDataTime.getTime();
            if (elapsed > TELEMETRY_OFFLINE_MS && tag.status !== 'disconnected') {
              const msg = `Communication Loss: ${tag.label} (${tag.id}) is offline (No cellular GPRS data for ${Math.round(elapsed / 1000)}s)`;
              addAlarm({
                tagId: tag.id,
                tagConfigId: tag.dbId,
                label: tag.label,
                value: 0,
                unit: '',
                type: 'Disconnect',
                message: msg,
                section: tag.section,
              });
              return { ...tag, status: 'disconnected' as const };
            }
          }
          return tag;
        }));
      };
      checkTags(setIntakeTags);
      checkTags(setOhtTags);
      checkTags(setWtpTags);
    }, 1000);
    return () => { if (disconnectCheckInterval.current) clearInterval(disconnectCheckInterval.current); };
  }, [addAlarm, setIntakeTags, setOhtTags, setWtpTags]);

  const ensureTagConfigExists = useCallback(async (section: 'oht' | 'intake' | 'wtp', tagId: string) => {
    const key = `${section}-${tagId}`;
    if (tagConfigCache.current.has(key)) return;
    try {
      const { data: existing } = await supabase.from('tag_config').select('id')
        .eq('section', section).eq('tag_id', tagId).limit(1).maybeSingle();
      if (existing?.id) { tagConfigCache.current.set(key, existing.id); return; }
      const sensor = ALL_SENSORS.find(s => s.id === tagId && s.section === section);
      const { data: created } = await supabase.from('tag_config').insert({
        section, tag_id: tagId, label: sensor?.label || '', unit: sensor?.unit || '',
        is_active: true, activated_at: new Date().toISOString(),
        high_setpoint: null, low_setpoint: null, alarm_enabled: true,
      }).select('id').single();
      if (created?.id) tagConfigCache.current.set(key, created.id);
    } catch (error) { logError('TagSync.ensureTagConfigExists', error); }
  }, []);

  const refreshTagConfigCache = useCallback(async () => {
    try {
      const { data: tagConfigs } = await supabase.from('tag_config').select('id, tag_id, section');
      if (tagConfigs) {
        tagConfigCache.current.clear();
        tagConfigs.forEach(tc => tagConfigCache.current.set(`${tc.section}-${tc.tag_id}`, tc.id));
        lastCacheRefresh.current = Date.now();
      }
    } catch (error) { logError('TagSync.refreshCache', error); }
  }, []);

  // NOTE: Browser-side 5-minute periodic snapshots have been intentionally removed.
  // Periodic historian writes are handled exclusively by the server-side
  // pg_cron → scada-ingest Edge Function to prevent duplicate DB rows.
  // Only event-driven writes (alarm, abnormal, state_change) are sent from the browser.

  const startBatchWriter = useCallback(() => {
    if (flushInterval.current) return () => {};
    refreshTagConfigCache();

    flushInterval.current = setInterval(async () => {
      if (pendingLogs.current.length === 0) return;
      if (Date.now() - lastCacheRefresh.current > CACHE_TTL) await refreshTagConfigCache();
      const logsToWrite = [...pendingLogs.current];
      pendingLogs.current = [];
      try {
        const uncached = logsToWrite.filter(l => !tagConfigCache.current.has(`${l.section}-${l.tagId}`));
        if (uncached.length > 0) {
          await Promise.all(uncached.map(l => ensureTagConfigExists(l.section as any, l.tagId)));
        }
        const logsToInsert = logsToWrite
          .filter(log => tagConfigCache.current.has(`${log.section}-${log.tagId}`))
          .map(log => ({
            tag_config_id: tagConfigCache.current.get(`${log.section}-${log.tagId}`)!,
            tag_id: log.tagId, section: log.section, value: log.value,
            timestamp: log.alignedTimestamp ?? new Date().toISOString(),
            source: log.reason ? `mqtt:${log.reason}` : 'mqtt',
            mqtt_topic: log.topic,
          }));
        if (logsToInsert.length > 0) {
          const { error } = await supabase.from('historian_logs').insert(logsToInsert);
          if (error) { logError('TagSync.batchWrite', error); pendingLogs.current.push(...logsToWrite); }
        }
      } catch (error) { logError('TagSync.batchWrite', error); pendingLogs.current.push(...logsToWrite); }
    }, FLUSH_INTERVAL_MS);

    return () => {
      if (flushInterval.current) { clearInterval(flushInterval.current); flushInterval.current = null; }
    };
  }, [ensureTagConfigExists, refreshTagConfigCache]);

  const processMqttMessage = useCallback(async (message: MqttMessage) => {
    const { payload, section, subsection, topic } = message;
    if (section === 'unknown') return;

    let sensors: ShahpurSensor[];
    let setter: React.Dispatch<React.SetStateAction<TagData[]>>;
    let tags: TagData[];
    let validKeys: string[];

    if (section === 'oht') {
      sensors = ALL_OHT_SENSORS.filter(s => !subsection || s.subsection === subsection);
      setter = setOhtTags;
      tags = ohtTags;
      validKeys = VALID_OHT_KEYS;
    } else if (section === 'intake') {
      sensors = INTAKE_SENSORS;
      setter = setIntakeTags;
      tags = intakeTags;
      validKeys = VALID_INTAKE_KEYS;
    } else if (section === 'wtp') {
      sensors = WTP_SENSORS;
      setter = setWtpTags;
      tags = wtpTags;
      validKeys = VALID_WTP_KEYS;
    } else return;

    // Track the message timestamp per section to isolate global connection loss (Layer 2 watchdog)
    const nowTime = Date.now();
    lastMessageTime.current.set(section, nowTime);

    // Intake 32-bit totalizer word pre-combination: H × 65536 + L
    const effectivePayload: Record<string, string | number> = { ...payload };
    if (section === 'intake') {
      if (payload['INTotalizer1H'] !== undefined) {
        inTotHRef.current = Math.max(0, sanitizeRtuValue(payload['INTotalizer1H']));
      }
      if (payload['INTotalizer1L'] !== undefined) {
        inTotLRef.current = Math.max(0, sanitizeRtuValue(payload['INTotalizer1L']));
      }
      if (inTotHRef.current !== null && inTotLRef.current !== null) {
        effectivePayload['INT_TOTALIZER_IN_COMBINED'] = inTotHRef.current * 65536 + inTotLRef.current;
      }

      const outLRaw = payload['OUTToalizer1L'] !== undefined ? payload['OUTToalizer1L'] : payload['OUTTotalizer1L'];
      if (payload['OUTTotalizer1H'] !== undefined) {
        outTotHRef.current = Math.max(0, sanitizeRtuValue(payload['OUTTotalizer1H']));
      }
      if (outLRaw !== undefined) {
        outTotLRef.current = Math.max(0, sanitizeRtuValue(outLRaw));
      }
      if (outTotHRef.current !== null && outTotLRef.current !== null) {
        effectivePayload['INT_TOTALIZER_OUT_COMBINED'] = outTotHRef.current * 65536 + outTotLRef.current;
      }
    }

    // Build map of latest values in this message cycle to support MIV cross-checks
    const latestValues = new Map<string, number>();
    tags.forEach(t => latestValues.set(t.id, t.value));

    for (const [mqttKey, rawValue] of Object.entries(effectivePayload)) {
      if (
        !validKeys.includes(mqttKey) &&
        !validKeys.map(k => k.toUpperCase()).includes(mqttKey.toUpperCase()) &&
        mqttKey !== 'INT_TOTALIZER_IN_COMBINED' &&
        mqttKey !== 'INT_TOTALIZER_OUT_COMBINED'
      ) {
        continue;
      }

      // Skip raw totalizer 16-bit register parts so they do NOT directly update INT-Totalizer-IN/OUT
      if (
        mqttKey === 'INTotalizer1H' || mqttKey === 'INTotalizer1L' ||
        mqttKey === 'OUTTotalizer1H' || mqttKey === 'OUTToalizer1L' || mqttKey === 'OUTTotalizer1L'
      ) {
        continue;
      }

      // Universal sanitize ensures all incoming PLC values (even garbage/near-zero noise)
      // are converted to clean non-negative numbers (e.g. -2.24e+15 -> 0.00, -2.47e-19 -> 0.00)
      const value = sanitizeRtuValue(rawValue);
      
      const sensor = sensors.find(s => 
        // Exact match (canonical mqttKey)
        s.mqttKey === mqttKey ||
        s.mqttKey.toUpperCase() === mqttKey.toUpperCase() ||
        // Shahpur Intake sensors
        (mqttKey === 'PUMP1_PT1_ACT' && s.id === 'INT-PT1') ||
        (mqttKey === 'PUMP2_PT2_ACT' && s.id === 'INT-PT2') ||
        (mqttKey === 'COMMON_HEADER_PT_ACT' && (s.id === 'INT-HeaderPT' || s.id === 'INT-CombinedPT')) ||
        (mqttKey === 'RLT_ACT' && s.id === 'INT-LT') ||
        (mqttKey === 'MOTOR1_ON' && s.id === 'INT-Pump1') ||
        (mqttKey === 'MOTOR2_ON' && s.id === 'INT-Pump2') ||
        (mqttKey === 'INTAKEPT1' && s.id === 'INT-PT1') ||
        (mqttKey === 'INTAKEPT2' && s.id === 'INT-PT2') ||
        (mqttKey === 'INTAKEHDPT1' && (s.id === 'INT-HeaderPT' || s.id === 'INT-CombinedPT')) ||
        (mqttKey === 'INTAKERLT' && s.id === 'INT-LT') ||
        (mqttKey === 'INFLOW1' && (s.id === 'INT-Flow-IN' || s.id === 'INT-Flow')) ||
        (mqttKey === 'INT_TOTALIZER_IN_COMBINED' && (s.id === 'INT-Totalizer-IN' || s.id === 'INT-Totalizer')) ||
        (mqttKey === 'OUTFLOW2' && (s.id === 'INT-Flow-OUT' || s.id === 'INT-Flow')) ||
        (mqttKey === 'INT_TOTALIZER_OUT_COMBINED' && (s.id === 'INT-Totalizer-OUT' || s.id === 'INT-Totalizer')) ||
        // Shahpur OHT sensors
        (mqttKey === 'OHT_PT_1' && s.id.endsWith('-PT')) ||
        (mqttKey === 'OHT_PT_2' && s.id.endsWith('-PT2')) ||
        (mqttKey === 'OHT_LT' && s.id.endsWith('-LT')) ||
        (mqttKey === 'OHT_FLOW' && (s.id.endsWith('-Flow') || s.id.endsWith('-Flow-IN'))) ||
        (mqttKey === 'OHT_POSICUMVALUE' && s.id.endsWith('-Totalizer')) ||
        (mqttKey === 'OHT_DECPOSICUMVALUE' && s.id.endsWith('-DecrTotalizer')) ||
        // Shahpur WTP aliases
        ((mqttKey === 'BACKWASH_TANK' || mqttKey === 'BW_LT' || mqttKey === 'BW_LEVEL') && s.id === 'WTP-LT-BW') ||
        ((mqttKey === 'CWT' || mqttKey === 'CWR_LT' || mqttKey === 'CWR_LEVEL') && s.id === 'WTP-LT-CW') ||
        ((mqttKey === 'PUMP_HOUSE_PT' || mqttKey === 'PT_3') && s.id === 'WTP-HeaderPT') ||
        ((mqttKey === 'PUMP_TURBIDITY' || mqttKey === 'CWR_TB') && s.id === 'WTP-TA') ||
        ((mqttKey === 'PUMP_PH' || mqttKey === 'CWR_PH') && s.id === 'WTP-PH') ||
        ((mqttKey === 'PUMP_CHLORINE' || mqttKey === 'CWR_CL') && s.id === 'WTP-CL') ||
        ((mqttKey === 'PUMP1_PT' || mqttKey === 'PT_1') && (s.id === 'INT-PT1' || s.id === 'WTP-PT1')) ||
        ((mqttKey === 'PUMP2_PT' || mqttKey === 'PT_2') && (s.id === 'INT-PT2' || s.id === 'WTP-PT2')) ||
        ((mqttKey === 'OUTLET_FLOW' || mqttKey === 'CLR_EFM_FLOW') && s.id === 'WTP-Flow-OUT') ||
        ((mqttKey === 'TOTALIZER' || mqttKey === 'CLR_EFM') && s.id === 'WTP-Totalizer-OUT') ||
        ((mqttKey === 'RAW_EFM_FLOW' || mqttKey === 'FLOWMETER') && s.id === 'WTP-Flow-IN') ||
        ((mqttKey === 'RAW_EFM' || mqttKey === 'TOTALIZER_IN') && s.id === 'WTP-Totalizer-IN') ||
        ((mqttKey === 'RW_PH' || mqttKey === 'RAW_PH') && s.id === 'WTP-PH-IN') ||
        // Fallback / legacy aliases
        (mqttKey === 'RLT' && s.id === 'INT-LT')
      );
      if (!sensor) continue;

      const sensorId = sensor.id;
      const existingTag = tags.find(t => t.id === sensorId);

      // Signal Validation: normalizeTelemetryValue returns sanitized value clamped to valid bounds
      let processedValue = value;
      const normalizedValue = normalizeTelemetryValue(processedValue, sensor);
      const validatedValue = normalizedValue ?? processedValue;

      const isNaNOrInfinite = !Number.isFinite(validatedValue);
      if (isNaNOrInfinite) {
        const faultKey = `${sensorId}-SignalFault`;
        const faultStart = alarmActiveSince.current.get(faultKey);
        if (!faultStart) {
          alarmActiveSince.current.set(faultKey, nowTime);
        } else if (nowTime - faultStart > 30000) {
          const msg = `Sensor Fault: ${sensor.label} (${sensorId}) is reading corrupt value: ${value}.`;
          addAlarm({
            tagId: sensorId, tagConfigId: existingTag?.dbId, label: sensor.label,
            value: 0, unit: sensor.unit, type: 'Low', message: msg,
            section: section as 'intake' | 'oht' | 'wtp',
          });
        }
        const receivedAt = message.timestamp instanceof Date ? message.timestamp : new Date();
        setter(prev => prev.map(t => t.id === sensorId
          ? { ...t, status: 'fault' as const, lastDataTime: receivedAt, mqttTopic: topic, source: 'mqtt' as const }
          : t));
        continue;
      }

      alarmActiveSince.current.delete(`${sensorId}-SignalFault`);

      // --- MLTCV Layer 1: Rate-of-Change (ROC) Sensor Limiter ---
      const prevVal = existingTag ? existingTag.value : null;
      let rawValueAdjusted = validatedValue;
      if (prevVal !== null && existingTag.status === 'connected') {
        const delta = Math.abs(validatedValue - prevVal);
        if (sensor.instrumentType === 'pt' || sensor.instrumentType === 'combined_pt') {
          if (delta > 3.0) { // Clamping instantaneous spikes > 3.0 Bar
            rawValueAdjusted = validatedValue > prevVal ? prevVal + 0.5 : prevVal - 0.5;
            const noiseKey = `${sensorId}-ROCNoise`;
            const noiseStart = alarmActiveSince.current.get(noiseKey);
            if (!noiseStart) {
              alarmActiveSince.current.set(noiseKey, nowTime);
              const msg = `Sensor Warning: Pressure Sensor Noise detected on ${sensor.label} (Raw change of ${delta.toFixed(2)} Bar clamped to 0.5 Bar)`;
              addAlarm({
                tagId: sensorId, tagConfigId: existingTag?.dbId, label: sensor.label,
                value: value, unit: sensor.unit, type: 'Low', message: msg,
                section: section as 'intake' | 'oht' | 'wtp',
              });
            }
          } else {
            alarmActiveSince.current.delete(`${sensorId}-ROCNoise`);
          }
        } else if (sensor.instrumentType === 'lt') {
          const isMetres = sensor.unit === 'm';
          const threshold = isMetres ? 1.5 : 20.0;
          if (delta > threshold) { // Clamping level spikes > 1.5m or > 20%
            rawValueAdjusted = validatedValue > prevVal ? prevVal + (isMetres ? 0.14 : 2.0) : prevVal - (isMetres ? 0.14 : 2.0);
            const noiseKey = `${sensorId}-ROCNoise`;
            const noiseStart = alarmActiveSince.current.get(noiseKey);
            if (!noiseStart) {
              alarmActiveSince.current.set(noiseKey, nowTime);
              const msg = `Sensor Warning: Level Sensor Noise detected on ${sensor.label} (Raw change of ${delta.toFixed(2)} ${sensor.unit} clamped)`;
              addAlarm({
                tagId: sensorId, tagConfigId: existingTag?.dbId, label: sensor.label,
                value: value, unit: sensor.unit, type: 'Low', message: msg,
                section: section as 'intake' | 'oht' | 'wtp',
              });
            }
          } else {
            alarmActiveSince.current.delete(`${sensorId}-ROCNoise`);
          }
        }
      }

      // --- MLTCV Layer 1: Numeric Precision (Rounding) ---
      let roundedValue = rawValueAdjusted;
      if (sensor.instrumentType === 'pt' || sensor.instrumentType === 'combined_pt' || sensor.instrumentType === 'lt' || sensor.instrumentType === 'ph' || sensor.instrumentType === 'chlorine' || sensor.instrumentType === 'temperature') {
        roundedValue = Math.round(rawValueAdjusted * 100) / 100;
      } else if (sensor.instrumentType === 'flow' || sensor.instrumentType === 'kw' || sensor.instrumentType === 'turbidity') {
        roundedValue = Math.round(rawValueAdjusted * 10) / 10;
      }

      const displayValue = roundedValue;
      latestValues.set(sensorId, displayValue);

      // --- MLTCV Layer 3: Level vs Flow Validation (Echo Jitter Protection) ---
      if (sensor.instrumentType === 'lt' && prevVal !== null && existingTag.status === 'connected') {
        const levelDelta = displayValue - prevVal;
        if (levelDelta > 1.0) { // level rose by > 1.0%
          let isFlowActive = false;
          if (sensorId === 'WTP-LT-CW') {
            const flowIn = latestValues.get('WTP-Flow-IN') || 0;
            isFlowActive = flowIn > 2.0;
          } else if (sensorId.startsWith('OHT') && sensorId.endsWith('-LT')) {
            const ohtNum = sensorId.match(/OHT(\d+)/)?.[1];
            if (ohtNum) {
              const flowIn = latestValues.get(`OHT${ohtNum}-Flow`) ?? latestValues.get(`OHT${ohtNum}-Flow-IN`) ?? 0;
              isFlowActive = flowIn > 2.0;
            }
          }
          
          if (!isFlowActive) {
            // Level rose, but inflow is 0 -> physically impossible! Ultrasonic Echo Jitter.
            const jitterKey = `${sensorId}-EchoJitter`;
            const jitterStart = alarmActiveSince.current.get(jitterKey);
            if (!jitterStart) {
              alarmActiveSince.current.set(jitterKey, nowTime);
              const msg = `Sensor Fault: Level Sensor Echo Jitter detected on ${sensor.label} (Level increased by ${levelDelta.toFixed(2)}% while inlet flow is zero)`;
              addAlarm({
                tagId: sensorId, tagConfigId: existingTag?.dbId, label: sensor.label,
                value: displayValue, unit: sensor.unit, type: 'Low', message: msg,
                section: section as 'intake' | 'oht' | 'wtp',
              });
            }
            // Suppress standard High Level alarms during echo jitter!
            alarmActiveSince.current.delete(`${sensorId}-High`);
          } else {
            alarmActiveSince.current.delete(`${sensorId}-EchoJitter`);
          }
        }
      }

      // --- TDM Case C: Sensor Frozen Check ---
      const lastValEntry = lastValueTracker.current.get(sensorId);
      let sectionFlowActive = false;
      if (section === 'intake') {
        const flowTag = intakeTags.find(t => t.id === 'INT-Flow-OUT' || t.id === 'INT-Flow');
        sectionFlowActive = flowTag ? flowTag.value > 10.0 : false;
      } else if (section === 'wtp') {
        const flowTag = wtpTags.find(t => t.id === 'WTP-Flow-IN');
        sectionFlowActive = flowTag ? flowTag.value > 10.0 : false;
      }
      
      if (sensor.type === 'analog' && sectionFlowActive) {
        if (!lastValEntry || lastValEntry.value !== value) {
          lastValueTracker.current.set(sensorId, { value, timestamp: nowTime });
          alarmActiveSince.current.delete(`${sensorId}-Frozen`);
        } else if (nowTime - lastValEntry.timestamp > 30 * 60 * 1000) {
          const frozenKey = `${sensorId}-Frozen`;
          const frozenStart = alarmActiveSince.current.get(frozenKey);
          if (!frozenStart) {
            alarmActiveSince.current.set(frozenKey, nowTime);
            const msg = `Sensor Fault: ${sensor.label} (${sensorId}) is frozen at exactly ${displayValue.toFixed(2)} ${sensor.unit} (No signal jitter for 30 min)`;
            addAlarm({
              tagId: sensorId, tagConfigId: existingTag?.dbId, label: sensor.label,
              value: displayValue, unit: sensor.unit, type: 'Low', message: msg,
              section: section as 'intake' | 'oht' | 'wtp',
            });
          }
        }
      } else {
        lastValueTracker.current.set(sensorId, { value, timestamp: nowTime });
        alarmActiveSince.current.delete(`${sensorId}-Frozen`);
      }

      // --- Standard Alarm validation (with 15s Debounce, Suppression & Watchdog blocks) ---
      const isTagConnected = existingTag ? existingTag.status === 'connected' : true;
      if (existingTag && sensor.type === 'analog' && isTagConnected) {
        const defaults = getDefaultSetpoints(sensor);
        const highThreshold = existingTag.highSetpoint ?? defaults.high ?? existingTag.max;
        const lowThreshold = existingTag.lowSetpoint ?? defaults.low ?? existingTag.min;
        const alarmEnabled = existingTag.alarmEnabled !== false;

        const isLowAlarm = lowThreshold !== null && displayValue < lowThreshold;
        const isHighAlarm = highThreshold !== null && displayValue > highThreshold;

        // Suppress alarms if pressure is low but pump is stopped (Condition 2)
        let suppressed = false;
        if (isLowAlarm && (sensor.instrumentType === 'pt' || sensor.instrumentType === 'combined_pt')) {
          suppressed = isPressureSuppressed(sensorId, tags);
        }

        // MLTCV Layer 3: Low Pressure Consensus check
        if (isLowAlarm && (sensor.instrumentType === 'pt' || sensor.instrumentType === 'combined_pt')) {
          let hasFlow = false;
          if (section === 'intake') {
            hasFlow = ((latestValues.get('INT-Flow-OUT') ?? latestValues.get('INT-Flow') ?? 0) > 5.0);
          } else if (section === 'wtp') {
            hasFlow = (latestValues.get('WTP-Flow-IN') || 0) > 5.0;
          }
          if (!hasFlow) suppressed = true; // Block low pressure alarm if pump is not pumping
        }

        const activeAlarmType = !suppressed && isHighAlarm ? 'High' : (!suppressed && isLowAlarm ? 'Low' : null);

        if (alarmEnabled && activeAlarmType) {
          const alarmKey = `${sensorId}-${activeAlarmType}`;
          const activeTime = alarmActiveSince.current.get(alarmKey);
          
          if (!activeTime) {
            alarmActiveSince.current.set(alarmKey, nowTime); // Start 15s debounce
          } else if (nowTime - activeTime > 15000) {
            const threshold = activeAlarmType === 'High' ? highThreshold : lowThreshold;
            const msg = `Alarm: ${existingTag.label} ${activeAlarmType} (${displayValue.toFixed(2)} ${existingTag.unit}) - Threshold: ${threshold}`;
            addAlarm({
              tagId: sensorId, tagConfigId: existingTag.dbId, label: existingTag.label,
              value: displayValue, unit: existingTag.unit, type: activeAlarmType, message: msg,
              section: section as 'intake' | 'oht' | 'wtp',
              highSetpoint: existingTag.highSetpoint ?? (defaults.high !== null ? defaults.high : undefined),
              lowSetpoint: existingTag.lowSetpoint ?? (defaults.low !== null ? defaults.low : undefined),
            });
          }
        } else {
          alarmActiveSince.current.delete(`${sensorId}-High`);
          alarmActiveSince.current.delete(`${sensorId}-Low`);
        }
      }

      // --- Pump State Derivation ---
      // For sensors with instrumentType==='pump' and a real mqttKey (WTP pumps): value IS the pump state (0 or 1)
      // For PT sensors: derive pump state via PT_TO_PUMP_MAP (Intake VT pumps)
      let pumpValue: number | null = null;
      if (sensor.instrumentType === 'pump' && sensor.mqttKey) {
        // Direct digital indicator — WTP-Pump1 / WTP-Pump2 (MOTOR1_INDACTOR / MOTOR2_INDACTOR)
        pumpValue = Math.round(displayValue); // 0 or 1
      } else if (sensor.instrumentType === 'pt') {
        pumpValue = displayValue > 1.5 ? 1 : 0;
      }

      // --- Trip Alarm Logic (WTP-Trip1 / WTP-Trip2, no debounce) ---
      if (sensor.id === 'WTP-Trip1' || sensor.id === 'WTP-Trip2') {
        const tripKey = `${sensorId}-TripAlarm`;
        if (displayValue >= 1) {
          if (!alarmActiveSince.current.get(tripKey)) {
            alarmActiveSince.current.set(tripKey, nowTime);
            addAlarm({
              tagId: sensorId,
              tagConfigId: existingTag?.dbId,
              label: sensor.label,
              value: 1,
              unit: '',
              type: 'High',
              message: `CRITICAL: ${sensor.label} — MOTOR TRIPPED`,
              section: 'wtp',
            });
          }
        } else {
          alarmActiveSince.current.delete(tripKey);
        }
      }

      // --- Pump Motor Short Cycling Watchdog (MCC Rule 2) ---
      const pumpId = PT_TO_PUMP_MAP[sensorId];
      if (pumpId && pumpValue !== null) {
        const prevPumpTag = tags.find(t => t.id === pumpId);
        const prevPumpValue = prevPumpTag ? prevPumpTag.value : 0;

        if (prevPumpValue === 0 && pumpValue === 1) {
          let starts = pumpStartHistory.current.get(pumpId) || [];
          starts.push(nowTime);
          starts = starts.filter(t => nowTime - t <= 10 * 60 * 1000);
          pumpStartHistory.current.set(pumpId, starts);
          
          if (starts.length > 5) {
            const cycleKey = `${pumpId}-ShortCycling`;
            const cycleStart = alarmActiveSince.current.get(cycleKey);
            if (!cycleStart) {
              alarmActiveSince.current.set(cycleKey, nowTime);
              const msg = `Mechanical Fault: Pump Short Cycling detected on ${pumpId} (Pump started ${starts.length} times in 10 minutes. Check valve leakage or level setpoint overlap suspected)`;
              addAlarm({
                tagId: pumpId, tagConfigId: prevPumpTag?.dbId, label: pumpId,
                value: starts.length, unit: 'starts', type: 'High', message: msg,
                section: section as 'intake' | 'wtp',
              });
            }
          }
        } else if (pumpValue === 0) {
          alarmActiveSince.current.delete(`${pumpId}-ShortCycling`);
        }
      }

      // Update local state atomically for live UI rendering
      const receivedAt = message.timestamp instanceof Date ? message.timestamp : new Date();
      setter(prev => {
        return prev.map(t => {
          if (t.id === sensorId) {
            // For pump sensors with real mqttKey (WTP-Pump1/2), value IS the pump state
            const tagValue = sensor.instrumentType === 'pump' && sensor.mqttKey
              ? (pumpValue ?? displayValue)
              : displayValue;
            return {
              ...t, value: tagValue, timestamp: receivedAt, source: 'mqtt' as const,
              mqttTopic: topic, isActive: true, lastDataTime: receivedAt, status: 'connected' as const
            };
          }
          // PT_TO_PUMP_MAP: Intake VT pumps derived from PT sensor reading (only if no direct motor tag in payload)
          const pumpSensor = sensors.find(s => s.id === pumpId);
          const hasDirectPumpTag = pumpSensor?.mqttKey && (
            effectivePayload[pumpSensor.mqttKey] !== undefined ||
            effectivePayload[pumpSensor.mqttKey.toUpperCase()] !== undefined
          );
          if (pumpId && t.id === pumpId && pumpValue !== null && sensor.instrumentType === 'pt' && !hasDirectPumpTag) {
            return {
              ...t, value: pumpValue, timestamp: receivedAt, source: 'mqtt' as const,
              mqttTopic: topic, isActive: true, lastDataTime: receivedAt, status: 'connected' as const
            };
          }
          return t;
        });
      });
    }


    // ==========================================
    // --- 9. Multi-Sensor Cross-Validation (MIV & Ultra-MIV) ---
    // ==========================================

    // -- MCC Watchdog Rule 1: Pump Duty-Standby Overload Alert --
    const checkDutyStandbyOverload = (p1Id: string, p2Id: string, secName: 'intake' | 'wtp') => {
      let p1Val = latestValues.get(p1Id);
      let p2Val = latestValues.get(p2Id);
      if (p1Val === undefined) p1Val = tags.find(t => t.id === p1Id)?.value || 0;
      if (p2Val === undefined) p2Val = tags.find(t => t.id === p2Id)?.value || 0;
      
      const isP1On = p1Val === 1;
      const isP2On = p2Val === 1;

      if (isP1On && isP2On) {
        const overloadKey = `${secName}-PumpOverload`;
        const overloadStart = alarmActiveSince.current.get(overloadKey);
        if (!overloadStart) {
          alarmActiveSince.current.set(overloadKey, nowTime);
        } else if (nowTime - overloadStart > 300000) {
          const t1 = tags.find(t => t.id === p1Id);
          const msg = `Process Warning: Pump Duty-Standby Overload (Both ${p1Id} and ${p2Id} are running simultaneously in ${secName}. Stuck MCC contactor or manual override suspected)`;
          addAlarm({
            tagId: p1Id, tagConfigId: t1?.dbId, label: 'Pump Overload',
            value: 2, unit: 'pumps', type: 'High', message: msg,
            section: secName,
          });
        }
      } else {
        alarmActiveSince.current.delete(`${secName}-PumpOverload`);
      }
    };

    if (section === 'intake') {
      checkDutyStandbyOverload('INT-Pump1', 'INT-Pump2', 'intake');
    } else if (section === 'wtp') {
      checkDutyStandbyOverload('WTP-Pump1', 'WTP-Pump2', 'wtp');
    }

    // -- Ultra-MIV Rule 1: Pump Cavitation / Air Lock Check --
    const checkCavitation = (ptId: string) => {
      const ptVal = latestValues.get(ptId);
      if (ptVal === undefined || ptVal <= 1.2) {
        pressureHistory.current.delete(ptId);
        alarmActiveSince.current.delete(`${ptId}-Cavitation`);
        return;
      }
      let history = pressureHistory.current.get(ptId) || [];
      history.push({ value: ptVal, timestamp: nowTime });
      history = history.filter(h => nowTime - h.timestamp <= 15000);
      pressureHistory.current.set(ptId, history);

      if (history.length >= 5) {
        const values = history.map(h => h.value);
        const maxP = Math.max(...values);
        const minP = Math.min(...values);
        if (maxP - minP > 1.0) {
          const cavKey = `${ptId}-Cavitation`;
          const cavStart = alarmActiveSince.current.get(cavKey);
          if (!cavStart) {
            alarmActiveSince.current.set(cavKey, nowTime);
            const tag = tags.find(t => t.id === ptId);
            const msg = `Mechanical Fault: Pump Cavitation / Air Lock suspected on ${tag?.label || ptId} (Pressure fluctuates between ${minP.toFixed(2)} and ${maxP.toFixed(2)} Bar)`;
            addAlarm({
              tagId: ptId, tagConfigId: tag?.dbId, label: tag?.label || ptId,
              value: ptVal, unit: 'Bar', type: 'High', message: msg,
              section: section as 'intake' | 'wtp',
            });
          }
        }
      }
    };

    if (section === 'intake') {
      checkCavitation('INT-PT1');
      checkCavitation('INT-PT2');
    } else if (section === 'wtp') {
      checkCavitation('WTP-PT1');
      checkCavitation('WTP-PT2');
    }

    // -- Ultra-MIV Rule 2: Pipeline Burst Check --
    if (section === 'wtp') {
      const flowIn = latestValues.get('WTP-Flow-IN') || 0;
      const combinedPT = latestValues.get('WTP-HeaderPT') || 0;
      const flowTag = tags.find(t => t.id === 'WTP-Flow-IN');
      const ptTag = tags.find(t => t.id === 'WTP-HeaderPT');
      
      const isFlowActive = flowTag && flowTag.status === 'connected' && flowIn > 120.0;
      const isPressureLow = ptTag && ptTag.status === 'connected' && combinedPT < 0.6;

      if (isFlowActive && isPressureLow) {
        const burstKey = 'WTP-PipelineBurst';
        const burstStart = alarmActiveSince.current.get(burstKey);
        if (!burstStart) {
          alarmActiveSince.current.set(burstKey, nowTime);
        } else if (nowTime - burstStart > 45000) {
          const msg = `Critical Process Alert: Major Pipeline Burst / Leakage suspected (Flow: ${flowIn.toFixed(1)} m³/hr, pressure: ${combinedPT.toFixed(2)} Bar)`;
          addAlarm({
            tagId: 'WTP-HeaderPT', tagConfigId: ptTag.dbId, label: 'Combined Header Pressure',
            value: combinedPT, unit: 'Bar', type: 'Low', message: msg,
            section: 'wtp',
          });
        }
      } else {
        alarmActiveSince.current.delete('WTP-PipelineBurst');
      }
    }

    // -- Ultra-MIV Rule 3: Level Sensor Turbulence Filter --
    const checkLevelTurbulence = (ltId: string) => {
      const ltVal = latestValues.get(ltId);
      if (ltVal === undefined) return;
      let history = levelHistory.current.get(ltId) || [];
      history.push({ value: ltVal, timestamp: nowTime });
      history = history.filter(h => nowTime - h.timestamp <= 5000);
      levelHistory.current.set(ltId, history);

      if (history.length >= 3) {
        const first = history[0].value;
        const last = history[history.length - 1].value;
        const delta = Math.abs(last - first);
        if (delta > 15.0) {
          const turbKey = `${ltId}-Turbulence`;
          const turbStart = alarmActiveSince.current.get(turbKey);
          if (!turbStart) {
            alarmActiveSince.current.set(turbKey, nowTime);
            const tag = tags.find(t => t.id === ltId);
            const msg = `Sensor Warning: Level Sensor Turbulence / Jitter filter triggered on ${tag?.label || ltId} (fluctuation of ${delta.toFixed(1)}% ignored)`;
            addAlarm({
              tagId: ltId, tagConfigId: tag?.dbId, label: tag?.label || ltId,
              value: ltVal, unit: tag?.unit || '%', type: 'Low', message: msg,
              section: section as 'intake' | 'wtp',
            });
          }
        }
      }
    };

    if (section === 'oht') {
      const ohtNum = subsection?.match(/OHT-(\d+)/)?.[1];
      if (ohtNum) checkLevelTurbulence(`OHT${ohtNum}-LT`);
    } else if (section === 'wtp') {
      checkLevelTurbulence('WTP-LT-CW');
    }

    // -- Ultra-MIV Rule 4: Impeller Wear / Low Pump Output Detector (FDHE Fallback) --
    if (section === 'wtp') {
      const flowIn = latestValues.get('WTP-Flow-IN') || 0;
      const kwVal = latestValues.get('WTP-KW') || 0;
      
      const checkPumpEfficiency = (ptId: string, pumpId: string) => {
        const ptVal = latestValues.get(ptId) || 0;
        const ptTag = tags.find(t => t.id === ptId);
        
        const isPtActive = ptTag && ptTag.status === 'connected' && ptVal > 1.8;
        const kwTag = tags.find(t => t.id === 'WTP-KW');
        const isKwActive = kwTag && kwTag.status === 'connected' && !kwTag.notInstalled && kwVal > 10.0;
        const kwMissing = !kwTag || kwTag.status !== 'connected' || kwTag.notInstalled;
        
        const isPumpRunning = isPtActive && (isKwActive || kwMissing);
        const flowTag = tags.find(t => t.id === 'WTP-Flow-IN');
        const isFlowLow = flowTag && flowTag.status === 'connected' && flowIn < 40.0;

        if (isPumpRunning && isFlowLow) {
          const effKey = `${pumpId}-Efficiency`;
          const effStart = alarmActiveSince.current.get(effKey);
          if (!effStart) {
            alarmActiveSince.current.set(effKey, nowTime);
          } else if (nowTime - effStart > 120000) {
            const msg = `Mechanical Alert: Low Pump Output suspected on ${pumpId} (Pressure: ${ptVal.toFixed(2)} Bar, flow: ${flowIn.toFixed(1)} m³/hr. ${kwMissing ? 'Note: Energy meter uninstalled/offline' : `Consumption: ${kwVal.toFixed(1)} kW`})`;
            addAlarm({
              tagId: pumpId, tagConfigId: ptTag?.dbId, label: pumpId,
              value: ptVal, unit: 'Bar', type: 'Low', message: msg,
              section: 'wtp',
            });
          }
        } else {
          alarmActiveSince.current.delete(`${pumpId}-Efficiency`);
        }
      };
      checkPumpEfficiency('WTP-PT1', 'WTP-Pump1');
      checkPumpEfficiency('WTP-PT2', 'WTP-Pump2');
    }

    // -- Ultra-MIV Rule 5: Sump / Reservoir Mass Balance Check --
    if (section === 'wtp') {
      const flowIn = latestValues.get('WTP-Flow-IN') || 0;
      const level = latestValues.get('WTP-LT-CW') || 0;
      
      const pump1Val = latestValues.get('WTP-Pump1') || 0;
      const pump2Val = latestValues.get('WTP-Pump2') || 0;
      const arePumpsOff = pump1Val === 0 && pump2Val === 0;
      
      const flowTag = tags.find(t => t.id === 'WTP-Flow-IN');
      const ltTag = tags.find(t => t.id === 'WTP-LT-CW');
      
      const isFlowActive = flowTag && flowTag.status === 'connected' && flowIn > 40.0;
      const isLtHealthy = ltTag && ltTag.status === 'connected';
      
      if (isFlowActive && isLtHealthy && arePumpsOff) {
        const tracker = massBalanceTracker.current.get('WTP-LT-CW');
        if (!tracker) {
          massBalanceTracker.current.set('WTP-LT-CW', { startLevel: level, timestamp: nowTime });
        } else if (nowTime - tracker.timestamp > 15 * 60 * 1000) {
          const levelDiff = level - tracker.startLevel;
          if (levelDiff < 1.0) {
            const mbKey = 'WTP-SumpMassBalance';
            const mbStart = alarmActiveSince.current.get(mbKey);
            if (!mbStart) {
              alarmActiveSince.current.set(mbKey, nowTime);
              const msg = `Process Warning: Sump Mass Balance Discrepancy (Active inflow ${flowIn.toFixed(1)} m³/hr, pumps OFF, but level is not rising. Sump leak or level sensor fault suspected)`;
              addAlarm({
                tagId: 'WTP-LT-CW', tagConfigId: ltTag.dbId, label: 'CWR Level',
                value: level, unit: '%', type: 'Low', message: msg,
                section: 'wtp',
              });
            }
          } else {
            massBalanceTracker.current.set('WTP-LT-CW', { startLevel: level, timestamp: nowTime });
            alarmActiveSince.current.delete('WTP-SumpMassBalance');
          }
        }
      } else {
        massBalanceTracker.current.delete('WTP-LT-CW');
        alarmActiveSince.current.delete('WTP-SumpMassBalance');
      }
    }

    // -- Ultra-MIV Rule 6: OHT Mass Balance Check --
    if (section === 'oht') {
      const ohtNum = subsection?.match(/OHT-(\d+)/)?.[1];
      if (ohtNum) {
        const flowId = tags.some(t => t.id === `OHT${ohtNum}-Flow`) ? `OHT${ohtNum}-Flow` : `OHT${ohtNum}-Flow-IN`;
        const ltId = `OHT${ohtNum}-LT`;
        
        const flowIn = latestValues.get(flowId) || 0;
        const level = latestValues.get(ltId) || 0;
        
        const flowTag = tags.find(t => t.id === flowId);
        const ltTag = tags.find(t => t.id === ltId);
        
        const isFlowActive = flowTag && flowTag.status === 'connected' && flowIn > 15.0;
        const isLtHealthy = ltTag && ltTag.status === 'connected';
        
        if (isFlowActive && isLtHealthy) {
          const tracker = massBalanceTracker.current.get(ltId);
          if (!tracker) {
            massBalanceTracker.current.set(ltId, { startLevel: level, timestamp: nowTime });
          } else if (nowTime - tracker.timestamp > 10 * 60 * 1000) {
            const levelDiff = level - tracker.startLevel;
            if (levelDiff < -2.0) {
              const mbKey = `${ltId}-MassBalance`;
              const mbStart = alarmActiveSince.current.get(mbKey);
              if (!mbStart) {
                alarmActiveSince.current.set(mbKey, nowTime);
                const msg = `Process Warning: OHT ${ohtNum} Mass Balance Discrepancy (Active inlet flow ${flowIn.toFixed(1)} m³/hr, but tank level is decreasing. Leakage or abnormal distribution suspected)`;
                addAlarm({
                  tagId: ltId, tagConfigId: ltTag.dbId, label: ltTag.label,
                  value: level, unit: '%', type: 'Low', message: msg,
                  section: 'oht',
                });
              }
            } else {
              massBalanceTracker.current.set(ltId, { startLevel: level, timestamp: nowTime });
              alarmActiveSince.current.delete(`${ltId}-MassBalance`);
            }
          }
        } else {
          massBalanceTracker.current.delete(ltId);
          alarmActiveSince.current.delete(`${ltId}-MassBalance`);
        }
      }
    }

    // -- Ultra-MIV Rule 7: Water Quality Potability Safety Alert --
    if (section === 'wtp') {
      const flowIn = latestValues.get('WTP-Flow-IN') || 0;
      const ph = latestValues.get('WTP-PH') || 7.0;
      const chlorine = latestValues.get('WTP-CL') || 0.5;
      const turbidity = latestValues.get('WTP-TA') || 1.0;
      
      const flowTag = tags.find(t => t.id === 'WTP-Flow-IN');
      const phTag = tags.find(t => t.id === 'WTP-PH');
      const clTag = tags.find(t => t.id === 'WTP-CL');
      const taTag = tags.find(t => t.id === 'WTP-TA');
      
      const isFlowActive = flowTag && flowTag.status === 'connected' && flowIn > 15.0;
      const isPhHealthy = phTag && phTag.status === 'connected';
      const isClHealthy = clTag && clTag.status === 'connected';
      const isTaHealthy = taTag && taTag.status === 'connected';
      
      if (isFlowActive && isPhHealthy && isClHealthy && isTaHealthy) {
        const isPhUnsafe = ph < 6.5 || ph > 8.5;
        const isClUnsafe = chlorine < 0.2 || chlorine > 1.5;
        const isTaUnsafe = turbidity > 5.0;
        
        if (isPhUnsafe || isClUnsafe || isTaUnsafe) {
          const wqKey = 'WTP-WaterQualitySafety';
          const wqStart = alarmActiveSince.current.get(wqKey);
          if (!wqStart) {
            alarmActiveSince.current.set(wqKey, nowTime);
          } else if (nowTime - wqStart > 600000) {
            let reasonStr = '';
            if (isPhUnsafe) reasonStr += `pH ${ph.toFixed(2)} out of bounds (6.5-8.5). `;
            if (isClUnsafe) reasonStr += `Chlorine ${chlorine.toFixed(2)} mg/L out of bounds (0.2-1.5). `;
            if (isTaUnsafe) reasonStr += `Turbidity ${turbidity.toFixed(1)} NTU exceeds 5.0 limit. `;
            
            const msg = `Water Quality Alert: Active Water Pumping Violates Potable Standards! Reason: ${reasonStr.trim()} (Flow: ${flowIn.toFixed(1)} m³/hr)`;
            addAlarm({
              tagId: 'WTP-PH', tagConfigId: phTag.dbId, label: 'pH Analyzer',
              value: ph, unit: 'pH', type: 'High', message: msg,
              section: 'wtp',
            });
          }
        } else {
          alarmActiveSince.current.delete('WTP-WaterQualitySafety');
        }
      } else {
        alarmActiveSince.current.delete('WTP-WaterQualitySafety');
      }
    }

    // -- Ultra-MIV Rule 8: OHT Inlet Check-Valve Leakage / Backflow Alert --
    if (section === 'oht') {
      const ohtNum = subsection?.match(/OHT-(\d+)/)?.[1];
      if (ohtNum) {
        const flowId = tags.some(t => t.id === `OHT${ohtNum}-Flow-IN`) ? `OHT${ohtNum}-Flow-IN` : `OHT${ohtNum}-Flow`;
        const flowIn = latestValues.get(flowId) || 0;
        const flowTag = tags.find(t => t.id === flowId);
        
        // Check if all pumping stations are OFF
        const intakeFlow = latestValues.get('INT-Flow-OUT') ?? latestValues.get('INT-Flow-IN') ?? latestValues.get('INT-Flow') ?? 0;
        const wtpFlow = latestValues.get('WTP-Flow-IN') || 0;
        const arePumpsOff = intakeFlow < 2.0 && wtpFlow < 2.0;
        
        if (arePumpsOff && flowTag && flowTag.status === 'connected' && flowIn > 5.0 && flowId.includes('Flow-IN')) {
          const leakKey = `${flowId}-BackflowLeak`;
          const leakStart = alarmActiveSince.current.get(leakKey);
          if (!leakStart) {
            alarmActiveSince.current.set(leakKey, nowTime);
          } else if (nowTime - leakStart > 120000) { // 2 minutes continuous
            const msg = `Process Fault: OHT ${ohtNum} Inlet Line Backflow suspected (Pumps are OFF, but inlet flow shows ${flowIn.toFixed(1)} m³/hr. Check valve passing or gravity main siphoning suspected)`;
            addAlarm({
              tagId: flowId, tagConfigId: flowTag.dbId, label: flowTag.label,
              value: flowIn, unit: 'm³/hr', type: 'High', message: msg,
              section: 'oht',
            });
          }
        } else {
          alarmActiveSince.current.delete(`${flowId}-BackflowLeak`);
        }
      }
    }

    // -- Ultra-MIV Rule 9: Raw Water Transmission Pipeline Friction / Clogging Detector --
    if (section === 'intake') {
      const intFlow = latestValues.get('INT-Flow-OUT') ?? latestValues.get('INT-Flow-IN') ?? latestValues.get('INT-Flow') ?? 0;
      const combinedPT = latestValues.get('INT-HeaderPT') ?? latestValues.get('INT-CombinedPT') ?? 0;
      
      const flowTag = tags.find(t => t.id === 'INT-Flow-OUT' || t.id === 'INT-Flow-IN' || t.id === 'INT-Flow');
      const ptTag = tags.find(t => t.id === 'INT-HeaderPT' || t.id === 'INT-CombinedPT');
      
      const isFlowNormal = flowTag && flowTag.status === 'connected' && intFlow >= 60.0 && intFlow <= 100.0;
      const isPTConnected = ptTag && ptTag.status === 'connected';
      
      if (isFlowNormal && isPTConnected) {
        const headLoss = combinedPT - 0.8; // 0.8 Bar is static elevation head
        if (headLoss > 3.5) { // Normal pipeline head loss is ~2.0 Bar. >3.5 indicates friction build-up/clogging.
          const frictionKey = 'INT-PipelineFriction';
          const frictionStart = alarmActiveSince.current.get(frictionKey);
          if (!frictionStart) {
            alarmActiveSince.current.set(frictionKey, nowTime);
          } else if (nowTime - frictionStart > 600000) { // 10 minutes continuous
            const msg = `Mechanical Warning: High Pipe Friction / Pipeline Clogging suspected (Head loss is abnormally high: ${headLoss.toFixed(2)} Bar at flow ${intFlow.toFixed(1)} m³/hr. Check for pipeline siltation or partially closed inline valves)`;
            addAlarm({
              tagId: ptTag.id, tagConfigId: ptTag.dbId, label: ptTag.label || 'Header Pressure',
              value: combinedPT, unit: 'Bar', type: 'High', message: msg,
              section: 'intake',
            });
          }
        } else {
          alarmActiveSince.current.delete('INT-PipelineFriction');
        }
      } else {
        alarmActiveSince.current.delete('INT-PipelineFriction');
      }
    }

    // -- Ultra-MIV Rule 10: Chemical Dosing Pump Discrepancy Detector --
    if (section === 'wtp') {
      const flowIn = latestValues.get('WTP-Flow-IN') || 0;
      const chlorine = latestValues.get('WTP-CL') || 0;
      
      const flowTag = tags.find(t => t.id === 'WTP-Flow-IN');
      const clTag = tags.find(t => t.id === 'WTP-CL');
      
      const isFlowActive = flowTag && flowTag.status === 'connected' && flowIn > 30.0;
      const isClConnected = clTag && clTag.status === 'connected';
      
      if (isFlowActive && isClConnected) {
        // We track WTP-CL rate of change over 2 minutes
        let history = levelHistory.current.get('WTP-CL-Dosing') || [];
        history.push({ value: chlorine, timestamp: nowTime });
        history = history.filter(h => nowTime - h.timestamp <= 120000); // 2 minutes
        levelHistory.current.set('WTP-CL-Dosing', history);
        
        if (history.length >= 3) {
          const first = history[0].value;
          const last = history[history.length - 1].value;
          
          if (first > 0) {
            const pctChange = (Math.abs(last - first) / first) * 100;
            if (pctChange > 50.0) { // Residual chlorine changed by > 50% under stable flow
              const dosingKey = 'WTP-DosingPumpDiscrepancy';
              const dosingStart = alarmActiveSince.current.get(dosingKey);
              if (!dosingStart) {
                alarmActiveSince.current.set(dosingKey, nowTime);
                const msg = `Chemical Alert: Dosing Pump Fault suspected (Treated chlorine changed rapidly from ${first.toFixed(2)} to ${last.toFixed(2)} mg/L in 2 minutes while flow remained stable at ${flowIn.toFixed(1)} m³/hr)`;
                addAlarm({
                  tagId: 'WTP-CL', tagConfigId: clTag.dbId, label: 'Chlorine Analyzer',
                  value: chlorine, unit: 'mg/L', type: 'High', message: msg,
                  section: 'wtp',
                });
              }
            } else {
              alarmActiveSince.current.delete('WTP-DosingPumpDiscrepancy');
            }
          }
        }
      } else {
        levelHistory.current.delete('WTP-CL-Dosing');
        alarmActiveSince.current.delete('WTP-DosingPumpDiscrepancy');
      }
    }

    // -- Ultra-MIV Rule 11: Dry-Run vs Sump Empty Consensus (FDHE Fallback) --
    const checkDryRun = (ptId: string, pumpId: string, flowTagId: string, minFlow: number) => {
      const ptVal = latestValues.get(ptId) || 0;
      const flowVal = latestValues.get(flowTagId) || 0;
      const ptTag = tags.find(t => t.id === ptId);
      const flowTag = tags.find(t => t.id === flowTagId);

      const isPtHigh = ptTag && ptTag.status === 'connected' && ptVal > 1.8;
      const isFlowNearZero = flowTag && flowTag.status === 'connected' && flowVal < minFlow;

      if (isPtHigh && isFlowNearZero) {
        // MLTCV Layer 3: Check Sump level to isolate empty sump shutdown (normal) vs closed valve fault
        let isSumpLow = false;
        if (section === 'intake') {
          const sumpLevel = latestValues.get('INT-LT') || 0;
          isSumpLow = sumpLevel < 1.05; // 15% of 7m range is 1.05m
        } else if (section === 'wtp') {
          const sumpLevel = latestValues.get('WTP-LT-CW') || 0;
          isSumpLow = sumpLevel < 15.0; // 15% of 100%
        }
        
        if (isSumpLow) {
          // Sump level is too low. Pumping stopped normally because suction is empty. Suppress dry-run alarm.
          alarmActiveSince.current.delete(`${pumpId}-DryRun`);
          return;
        }

        const dryKey = `${pumpId}-DryRun`;
        const dryStart = alarmActiveSince.current.get(dryKey);
        if (!dryStart) {
          alarmActiveSince.current.set(dryKey, nowTime);
        } else if (nowTime - dryStart > 60000) {
          const msg = `Mechanical Fault: Dry Run or Closed Discharge Valve suspected on ${pumpId} (High pressure ${ptVal.toFixed(2)} Bar, zero flow ${flowVal.toFixed(1)} m³/hr)`;
          addAlarm({
            tagId: pumpId, tagConfigId: ptTag?.dbId, label: pumpId,
            value: ptVal, unit: 'Bar', type: 'High', message: msg,
            section: section as 'intake' | 'wtp',
          });
        }
      } else {
        alarmActiveSince.current.delete(`${pumpId}-DryRun`);
      }
    };

    if (section === 'intake') {
      const intFlowId = tags.some(t => t.id === 'INT-Flow-OUT') ? 'INT-Flow-OUT' : (tags.some(t => t.id === 'INT-Flow-IN') ? 'INT-Flow-IN' : 'INT-Flow');
      checkDryRun('INT-PT1', 'INT-Pump1', intFlowId, 2.0);
      checkDryRun('INT-PT2', 'INT-Pump2', intFlowId, 2.0);
    } else if (section === 'wtp') {
      checkDryRun('WTP-PT1', 'WTP-Pump1', 'WTP-Flow-IN', 2.0);
      checkDryRun('WTP-PT2', 'WTP-Pump2', 'WTP-Flow-IN', 2.0);
    }

    // -- MIV Rule 2 & 3: Flow active but pressure/level at 0 (Sensor Discrepancy) --
    if (section === 'intake') {
      const flowTag = tags.find(t => t.id === 'INT-Flow-OUT' || t.id === 'INT-Flow-IN' || t.id === 'INT-Flow');
      const flowVal = (flowTag ? latestValues.get(flowTag.id) : 0) || 0;
      const pt1 = latestValues.get('INT-PT1') || 0;
      const pt2 = latestValues.get('INT-PT2') || 0;
      const headerPt = latestValues.get('INT-HeaderPT') ?? latestValues.get('INT-CombinedPT') ?? 0;
      const level = latestValues.get('INT-LT') || 0;

      const pt1Tag = tags.find(t => t.id === 'INT-PT1');
      const pt2Tag = tags.find(t => t.id === 'INT-PT2');
      const headerPtTag = tags.find(t => t.id === 'INT-HeaderPT' || t.id === 'INT-CombinedPT');
      const ltTag = tags.find(t => t.id === 'INT-LT');

      const isFlowActive = flowTag && flowTag.status === 'connected' && flowVal > 15.0;

      if (isFlowActive && pt1Tag && pt1Tag.status === 'connected' && pt2Tag && pt2Tag.status === 'connected' && pt1 < 0.2 && pt2 < 0.2 && headerPt < 0.2) {
        const ptDiscKey = 'INT-PTDiscrepancy';
        const ptDiscStart = alarmActiveSince.current.get(ptDiscKey);
        if (!ptDiscStart) {
          alarmActiveSince.current.set(ptDiscKey, nowTime);
        } else if (nowTime - ptDiscStart > 30000) {
          const msg = `Sensor Fault: Intake Pressure Transmitters Discrepancy (Flow active ${flowVal.toFixed(1)} m³/hr, but pressures read < 0.2 Bar)`;
          addAlarm({
            tagId: headerPtTag?.id || 'INT-HeaderPT', tagConfigId: headerPtTag?.dbId || pt1Tag.dbId, label: headerPtTag?.label || 'Header Pressure',
            value: 0, unit: 'Bar', type: 'Low', message: msg,
            section: 'intake',
          });
        }
      } else {
        alarmActiveSince.current.delete('INT-PTDiscrepancy');
      }

      if (isFlowActive && ltTag && ltTag.status === 'connected' && level < 0.35) { // 5% of 7m is 0.35m
        const ltDiscKey = 'INT-LTDiscrepancy';
        const ltDiscStart = alarmActiveSince.current.get(ltDiscKey);
        if (!ltDiscStart) {
          alarmActiveSince.current.set(ltDiscKey, nowTime);
        } else if (nowTime - ltDiscStart > 30000) {
          const msg = `Sensor Fault: Intake Suction Level Discrepancy (Flow active ${flowVal.toFixed(1)} m³/hr, but level sensor reads near-empty ${level.toFixed(2)}m)`;
          addAlarm({
            tagId: 'INT-LT', tagConfigId: ltTag.dbId, label: ltTag.label || 'Intake Level',
            value: level, unit: ltTag.unit || '%', type: 'Low', message: msg,
            section: 'intake',
          });
        }
      } else {
        alarmActiveSince.current.delete('INT-LTDiscrepancy');
      }
    } else if (section === 'wtp') {
      const flowVal = latestValues.get('WTP-Flow-IN') || 0;
      const pt1 = latestValues.get('WTP-PT1') || 0;
      const pt2 = latestValues.get('WTP-PT2') || 0;
      const level = latestValues.get('WTP-LT-CW') || 0;

      const flowTag = tags.find(t => t.id === 'WTP-Flow-IN');
      const pt1Tag = tags.find(t => t.id === 'WTP-PT1');
      const pt2Tag = tags.find(t => t.id === 'WTP-PT2');
      const ltTag = tags.find(t => t.id === 'WTP-LT-CW');

      const isFlowActive = flowTag && flowTag.status === 'connected' && flowVal > 15.0;

      if (isFlowActive && pt1Tag && pt1Tag.status === 'connected' && pt2Tag && pt2Tag.status === 'connected' && pt1 < 0.2 && pt2 < 0.2) {
        const ptDiscKey = 'WTP-PTDiscrepancy';
        const ptDiscStart = alarmActiveSince.current.get(ptDiscKey);
        if (!ptDiscStart) {
          alarmActiveSince.current.set(ptDiscKey, nowTime);
        } else if (nowTime - ptDiscStart > 30000) {
          const msg = `Sensor Fault: WTP Discharge Pressures Discrepancy (Flow active ${flowVal.toFixed(1)} m³/hr, but both pressures read < 0.2 Bar)`;
          addAlarm({
            tagId: 'WTP-HeaderPT', tagConfigId: pt1Tag.dbId, label: 'Combined Header Pressure',
            value: 0, unit: 'Bar', type: 'Low', message: msg,
            section: 'wtp',
          });
        }
      } else {
        alarmActiveSince.current.delete('WTP-PTDiscrepancy');
      }

      if (isFlowActive && ltTag && ltTag.status === 'connected' && level < 5.0) { // 5% of 100% CWR
        const ltDiscKey = 'WTP-LTDiscrepancy';
        const ltDiscStart = alarmActiveSince.current.get(ltDiscKey);
        if (!ltDiscStart) {
          alarmActiveSince.current.set(ltDiscKey, nowTime);
        } else if (nowTime - ltDiscStart > 30000) {
          const msg = `Sensor Fault: WTP CWR Level Discrepancy (Flow active ${flowVal.toFixed(1)} m³/hr, but level sensor reads near-empty ${level.toFixed(1)}%)`;
          addAlarm({
            tagId: 'WTP-LT-CW', tagConfigId: ltTag.dbId, label: 'CWR Level',
            value: level, unit: '%', type: 'Low', message: msg,
            section: 'wtp',
          });
        }
      } else {
        alarmActiveSince.current.delete('WTP-LTDiscrepancy');
      }
    }

  }, [intakeTags, ohtTags, wtpTags, setIntakeTags, setOhtTags, setWtpTags, addAlarm]);

  return { processMqttMessage, startBatchWriter };
};
