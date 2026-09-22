import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { logError, logDebug } from '@/lib/errorLogger';
import { isTagLive } from '@/hooks/useTagConnection';
import {
  ALL_OHT_SENSORS, INTAKE_SENSORS, WTP_SENSORS, ALL_SENSORS,
  ShahpurSensor, OHT1_SENSORS, OHT2_SENSORS,
} from '@/config/shahpurSensors';

/** Get default setpoints based on instrument type and range */
export const getDefaultSetpoints = (sensor: ShahpurSensor): { high: number | null; low: number | null } => {
  switch (sensor.instrumentType) {
    case 'pt': // Pressure: high at 80% of max, low at 10% of max
      return { high: sensor.max * 0.8, low: sensor.max * 0.1 };
    case 'lt': // Level: high at 90%, low at 15%
      return { high: sensor.max * 0.9, low: sensor.max * 0.15 };
    case 'flow': // Flow: high at 90% of max, low at 0 (no low alarm)
      return { high: sensor.max * 0.9, low: null };
    case 'ph': // pH: normal range 6.5-8.5
      return { high: 8.5, low: 6.5 };
    case 'turbidity': // Turbidity: high alarm only
      return { high: sensor.section === 'wtp' && sensor.id.includes('TA-IN') ? 50 : 5, low: null };
    case 'chlorine': // Chlorine: 0.2-1.0 mg/L safe range
      return { high: 1.0, low: 0.2 };
    case 'temperature':
      return { high: 35, low: 5 };
    case 'combined_pt': // Combined pressure
      return { high: sensor.max * 0.8, low: sensor.max * 0.1 };
    default:
      return { high: null, low: null };
  }
};

export interface AlarmSettings {
  highSetpoint?: number;
  lowSetpoint?: number;
  alarmEnabled: boolean;
  alarmEmails: string[];
}

export interface TagData {
  id: string;
  label: string;
  value: number;
  unit: string;
  timestamp: Date;
  min: number;
  max: number;
  isActive: boolean;
  dbId?: string;
  source?: 'mqtt' | 'simulated';
  mqttTopic?: string;
  highSetpoint?: number;
  lowSetpoint?: number;
  alarmEmails?: string[];
  alarmEnabled?: boolean;
  lastDataTime?: Date;
  status?: 'connected' | 'disconnected' | 'unknown' | 'fault';
  mqttKey?: string;
  section?: 'oht' | 'intake' | 'wtp';
  subsection?: string;
  instrumentType?: string;
  sensorType?: 'analog' | 'digital' | 'totalizer';
  notInstalled?: boolean;
}

interface ScadaState {
  plantName: string;
  intakeTags: TagData[];
  ohtTags: TagData[];
  wtpTags: TagData[];
  configMode: boolean;
  isLoading: boolean;
  mqttEnabled: boolean;
}

interface ScadaContextType extends ScadaState {
  telemetryHealth: {state:'connecting'|'connected'|'error';checkedAt:Date|null;message:string|null};
  setTelemetryHealth: React.Dispatch<React.SetStateAction<{state:'connecting'|'connected'|'error';checkedAt:Date|null;message:string|null}>>;
  setPlantName: (name: string) => void;
  setConfigMode: (mode: boolean) => void;
  updateTagSetpoints: (section: 'intake' | 'oht' | 'wtp', tagId: string, high?: number, low?: number) => void;
  updateTagAlarmSettings: (section: 'intake' | 'oht' | 'wtp', tagId: string, settings: AlarmSettings) => void;
  getActiveTagCount: () => number;
  setIntakeTags: React.Dispatch<React.SetStateAction<TagData[]>>;
  setOhtTags: React.Dispatch<React.SetStateAction<TagData[]>>;
  setWtpTags: React.Dispatch<React.SetStateAction<TagData[]>>;
  setMqttEnabled: (enabled: boolean) => void;
}

const sensorToTag = (sensor: ShahpurSensor): TagData => ({
  id: sensor.id,
  label: sensor.label,
  unit: sensor.unit,
  min: sensor.min,
  max: sensor.max,
  mqttKey: sensor.mqttKey,
  value: 0,
  timestamp: new Date(),
  isActive: !sensor.notInstalled,
  status: 'unknown' as const,
  section: sensor.section,
  subsection: sensor.subsection,
  instrumentType: sensor.instrumentType,
  sensorType: sensor.type,
  notInstalled: sensor.notInstalled,
});

const ScadaContext = createContext<ScadaContextType | undefined>(undefined);

export const ScadaProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [plantName, setPlantNameState] = useState('Shahpur SCADA');
  const [configMode, setConfigModeState] = useState(false);
  const [intakeTags, setIntakeTags] = useState<TagData[]>(() => INTAKE_SENSORS.map(sensorToTag));
  const [ohtTags, setOhtTags] = useState<TagData[]>(() => ALL_OHT_SENSORS.map(sensorToTag));
  const [wtpTags, setWtpTags] = useState<TagData[]>(() => WTP_SENSORS.map(sensorToTag));
  const [isLoading, setIsLoading] = useState(true);
  const [mqttEnabled, setMqttEnabled] = useState(true);
  const [telemetryHealth, setTelemetryHealth] = useState<{state:'connecting'|'connected'|'error';checkedAt:Date|null;message:string|null}>({state:'connecting',checkedAt:null,message:null});

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const [plantResult, tagResult] = await Promise.all([
          supabase.from('plant_config').select('id, plant_name').limit(1).maybeSingle(),
          supabase.from('tag_config').select('*'),
        ]);
        if (plantResult.data) setPlantNameState(plantResult.data.plant_name);
        const tagConfigsInitial = tagResult.data;

        const allSensors = [...INTAKE_SENSORS, ...ALL_OHT_SENSORS, ...WTP_SENSORS];

        const existingSet = new Set((tagConfigsInitial || []).map(c => `${c.section}-${c.tag_id}`));
        const missingSensors = allSensors.filter(s => !existingSet.has(`${s.section}-${s.id}`));

        let tagConfigs = tagConfigsInitial || [];

        if (missingSensors.length > 0) {
          const insertData = missingSensors.map(s => {
            const defaults = getDefaultSetpoints(s);
            return {
              section: s.section,
              tag_id: s.id,
              label: s.label,
              unit: s.unit,
              is_active: !s.notInstalled,
              activated_at: new Date().toISOString(),
              high_setpoint: defaults.high,
              low_setpoint: defaults.low,
              alarm_enabled: false,
            };
          });

          const { data: created, error } = await supabase.from('tag_config').insert(insertData).select('*');
          if (error) logError('ScadaContext.createTagConfigs', error);
          else if (created) tagConfigs = [...tagConfigs, ...created];
        }

        const applyConfig = (tags: TagData[], section: string) => {
          const configs = tagConfigs.filter(t => t.section === section);
          return tags.map(tag => {
            const config = configs.find(c => c.tag_id === tag.id);
            return {
              ...tag,
              dbId: config?.id,
              isActive: config?.is_active ?? tag.isActive,
              highSetpoint: config?.high_setpoint != null ? Number(config.high_setpoint) : undefined,
              lowSetpoint: config?.low_setpoint != null ? Number(config.low_setpoint) : undefined,
              alarmEmails: [],
              alarmEnabled: config?.alarm_enabled ?? false,
            };
          });
        };

        setIntakeTags(prev => applyConfig(prev, 'intake'));
        setOhtTags(prev => applyConfig(prev, 'oht'));
        setWtpTags(prev => applyConfig(prev, 'wtp'));
      } catch (error) {
        logError('ScadaContext.loadConfig', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadConfig();
  }, []);

  const setPlantName = useCallback(async (name: string) => {
    setPlantNameState(name);
    try {
      const { data: existing } = await supabase.from('plant_config').select('id').limit(1).maybeSingle();
      if (existing) await supabase.from('plant_config').update({ plant_name: name }).eq('id', existing.id);
    } catch (error) {
      logError('ScadaContext.setPlantName', error);
    }
  }, []);

  const setConfigMode = useCallback((mode: boolean) => setConfigModeState(mode), []);

  const updateTagSetpoints = useCallback(async (section: 'intake' | 'oht' | 'wtp', tagId: string, high?: number, low?: number) => {
    const setter = section === 'intake' ? setIntakeTags : section === 'wtp' ? setWtpTags : setOhtTags;
    setter(prev => {
      const tag = prev.find(t => t.id === tagId);
      if (tag?.dbId) {
        supabase.from('tag_config').update({ high_setpoint: high ?? null, low_setpoint: low ?? null }).eq('id', tag.dbId).then(() => {}, (err) => logError('ScadaContext.updateSetpoints', err));
      }
      return prev.map(t => t.id === tagId ? { ...t, highSetpoint: high, lowSetpoint: low } : t);
    });
  }, []);

  const updateTagAlarmSettings = useCallback(async (section: 'intake' | 'oht' | 'wtp', tagId: string, settings: AlarmSettings) => {
    const setter = section === 'intake' ? setIntakeTags : section === 'wtp' ? setWtpTags : setOhtTags;
    setter(prev => {
      const tag = prev.find(t => t.id === tagId);
      if (tag?.dbId) {
        supabase.from('tag_config').update({
          high_setpoint: settings.highSetpoint ?? null,
          low_setpoint: settings.lowSetpoint ?? null,
          alarm_enabled: settings.alarmEnabled,
        }).eq('id', tag.dbId).then(() => {}, (err) => logError('ScadaContext.updateAlarmSettings', err));
      }
      return prev.map(t =>
        t.id === tagId ? { ...t, highSetpoint: settings.highSetpoint, lowSetpoint: settings.lowSetpoint,
          alarmEnabled: settings.alarmEnabled, alarmEmails: settings.alarmEmails } : t
      );
    });
  }, []);

  const getActiveTagCount = useCallback(() => {
    return [...intakeTags, ...ohtTags, ...wtpTags].filter(t => !t.notInstalled && t.instrumentType !== 'pump' && isTagLive(t)).length;
  }, [intakeTags, ohtTags, wtpTags]);

  return (
    <ScadaContext.Provider value={{
      plantName, intakeTags, ohtTags, wtpTags, configMode, isLoading, mqttEnabled,
      telemetryHealth, setTelemetryHealth,
      setPlantName, setConfigMode, updateTagSetpoints, updateTagAlarmSettings,
      getActiveTagCount, setIntakeTags, setOhtTags, setWtpTags, setMqttEnabled,
    }}>
      {children}
    </ScadaContext.Provider>
  );
};

export const useScada = (): ScadaContextType => {
  const context = useContext(ScadaContext);
  if (!context) throw new Error('useScada must be used within a ScadaProvider');
  return context;
};
