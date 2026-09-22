import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import mqtt, { MqttClient, IClientOptions } from 'mqtt';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { logError, logDebug, logWarn, logInfo } from '@/lib/errorLogger';
import { MQTT_TOPICS, ALL_MQTT_TOPICS, TOPIC_TO_SECTION, DEFAULT_MQTT_TOPICS, setTopicsFromDb } from '@/config/shahpurSensors';

export interface MqttConfig {
  id?: string;
  brokerUrl: string;
  username?: string;
  password?: string;
  clientId?: string;
  autoConnect: boolean;
  topics: Record<string, string>;
}

export interface MqttMessage {
  topic: string;
  payload: Record<string, string | number>;
  timestamp: Date;
  section: 'oht' | 'intake' | 'wtp' | 'unknown';
  subsection?: string;
  rawPayload?: string;
}

interface MqttContextType {
  config: MqttConfig;
  isConnected: boolean;
  isConnecting: boolean;
  lastMessage: MqttMessage | null;
  messageCount: number;
  messagesPerSecond: number;
  lastError: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  updateConfig: (config: Partial<MqttConfig>) => Promise<void>;
  saveConfig: () => Promise<void>;
}

const getDefaultBrokerUrl = () => {
  let url = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_MQTT_BROKER_URL) || 'ws://mqtt.orbitengineerings.com:8080';
  const isSecure = typeof window !== 'undefined' && window.location.protocol === 'https:';
  if (isSecure && url.startsWith('ws://')) {
    url = url.replace('ws://', 'wss://');
  }
  return url;
};

const defaultUsername = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_MQTT_USERNAME) || '';
const defaultPassword = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_MQTT_PASSWORD) || '';

const defaultConfig: MqttConfig = {
  brokerUrl: getDefaultBrokerUrl(),
  username: defaultUsername,
  password: defaultPassword,
  autoConnect: true,
  topics: { ...MQTT_TOPICS },
};

const MqttContext = createContext<MqttContextType | undefined>(undefined);

export const MqttProvider: React.FC<{ children: ReactNode; onMessage?: (message: MqttMessage) => void }> = ({ children, onMessage }) => {
  const [config, setConfig] = useState<MqttConfig>(defaultConfig);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const onMessageRef = useRef(onMessage);
  const [isConnecting, setIsConnecting] = useState(false);
  const [lastMessage, setLastMessage] = useState<MqttMessage | null>(null);
  const [messageCount, setMessageCount] = useState(0);
  const [messagesPerSecond, setMessagesPerSecond] = useState(0);
  const [lastError, setLastError] = useState<string | null>(null);
  const clientRef = useRef<MqttClient | null>(null);
  const isConnectingRef = useRef(false);
  const wasConnectedRef = useRef(false);
  const configRef = useRef(config);
  const messageCountRef = useRef(0);
  const connectRef = useRef<() => Promise<void>>();

  useEffect(() => { configRef.current = config; }, [config]);

  useEffect(() => { onMessageRef.current = onMessage; }, [onMessage]);

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const { data } = await supabase.from('mqtt_config').select('*').limit(1).maybeSingle();

        // Fetch MQTT credentials & topics securely from Edge Function (never stored in frontend)
        let mqttUsername: string | undefined = defaultUsername;
        let mqttPassword: string | undefined = defaultPassword;
        let vaultTopics: Record<string, string> | undefined = undefined;
        try {
          const { data: session } = await supabase.auth.getSession();
          if (session?.session?.access_token) {
            const { data: creds, error: credErr } = await supabase.functions.invoke('get-mqtt-credentials');
            if (!credErr && creds) {
              if (creds.username) mqttUsername = creds.username;
              if (creds.password) mqttPassword = creds.password;
              if (creds.topics && typeof creds.topics === 'object') {
                vaultTopics = creds.topics;
                setTopicsFromDb(creds.topics);
              }
              logInfo('MqttContext', 'MQTT credentials & topics loaded from Vault');
            } else {
              logWarn('MqttContext', 'Could not load MQTT credentials from Vault — using default broker credentials');
            }
          }
        } catch (credFetchErr) {
          logWarn('MqttContext', 'MQTT credentials fetch skipped: ' + String(credFetchErr));
        }

        if (data) {
          let brokerUrl = data.broker_url || getDefaultBrokerUrl();
          const isSecure = typeof window !== 'undefined' && window.location.protocol === 'https:';
          if (isSecure && brokerUrl.startsWith('ws://')) {
            brokerUrl = brokerUrl.replace('ws://', 'wss://');
            if (brokerUrl.includes('broker.hivemq.com:8000')) brokerUrl = brokerUrl.replace(':8000', ':8884');
          }
          const dbTopics = {
            OHT1: data.oht_topic || DEFAULT_MQTT_TOPICS.OHT1,
            OHT2: (data as any).oht_topic_2 || DEFAULT_MQTT_TOPICS.OHT2,
            INTAKE: data.intake_topic || DEFAULT_MQTT_TOPICS.INTAKE,
            WTP: (data as any).wtp_topic || DEFAULT_MQTT_TOPICS.WTP,
          };
          const mergedTopics = {
            ...dbTopics,
            ...(vaultTopics || {}),
          };
          setConfig({
            id: data.id,
            brokerUrl,
            username: mqttUsername,
            password: mqttPassword,
            clientId: data.client_id || undefined,
            autoConnect: data.auto_connect !== false,
            topics: mergedTopics,
          });
          setTopicsFromDb(mergedTopics);
        } else {
          // No DB config — still apply credentials and topics if loaded
          if (vaultTopics || mqttUsername) {
            setConfig(prev => ({
              ...prev,
              username: mqttUsername,
              password: mqttPassword,
              topics: vaultTopics || prev.topics,
            }));
            if (vaultTopics) setTopicsFromDb(vaultTopics);
          }
        }
      } catch (error) {
        logError('MqttContext.loadConfig', error);
      } finally {
        setConfigLoaded(true);
      }
    };
    loadConfig();
    return () => { if (clientRef.current) { clientRef.current.end(true); clientRef.current = null; } };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setMessagesPerSecond(messageCountRef.current);
      messageCountRef.current = 0;
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const parsePayload = useCallback((payload: string): Record<string, string | number>[] => {
    const results: Record<string, string | number>[] = [];
    try {
      const parsed = JSON.parse(payload);
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        // Handle params.r_data format (e.g. { params: { r_data: [ { name: "PT_01", value: "10" } ] } })
        const rData = parsed.params?.r_data || parsed.r_data;
        if (Array.isArray(rData)) {
          rData.forEach((item: any) => {
            if (item && item.name !== undefined && item.value !== undefined) {
              // Skip items where the PLC error flag indicates a sensor fault (err !== '0')
              if (item.err !== undefined && String(item.err) !== '0') return;
              const val = typeof item.value === 'number' ? item.value : (isNaN(Number(item.value)) || item.value === '' || item.value === null ? item.value : Number(item.value));
              results.push({ [item.name]: val });
            }
          });
          return results;
        }

        // Handle {TAG: "NAME", VALUE: x} shape (Mohgaon broker format)
        const keys = Object.keys(parsed);
        const hasTag = keys.some(k => k.toUpperCase() === 'TAG');
        const hasVal = keys.some(k => k.toUpperCase() === 'VALUE');
        if (hasTag && hasVal && keys.length <= 3) {
          const tagKey = keys.find(k => k.toUpperCase() === 'TAG')!;
          const valKey = keys.find(k => k.toUpperCase() === 'VALUE')!;
          const tagName = String(parsed[tagKey]);
          const val = parsed[valKey];
          const rawVal = typeof val === 'object' && val !== null && 'value' in val ? (val as any).value : val;
          const parsedVal = typeof rawVal === 'number' ? rawVal : (isNaN(Number(rawVal)) || rawVal === '' || rawVal === null ? rawVal : Number(rawVal));
          results.push({ [tagName]: parsedVal });
          return results;
        }
        Object.entries(parsed).forEach(([key, value]) => {
          if (key === 'params') return;
          if (typeof value === 'object' && value !== null && 'value' in value) {
            const val = (value as { value: number | string }).value;
            const parsedVal = typeof val === 'number' ? val : (isNaN(Number(val)) || val === '' || val === null ? val : Number(val));
            results.push({ [key]: parsedVal });
          } else {
            const parsedVal = typeof value === 'number' ? value : (isNaN(Number(value)) || value === '' || value === null ? value as string : Number(value));
            results.push({ [key]: parsedVal });
          }
        });
      } else if (Array.isArray(parsed)) {
        parsed.forEach(item => {
          if (item && item.name !== undefined && item.value !== undefined) {
            const val = typeof item.value === 'number' ? item.value : (isNaN(Number(item.value)) || item.value === '' || item.value === null ? item.value : Number(item.value));
            results.push({ [item.name]: val });
          } else {
            results.push(item);
          }
        });
      }
    } catch {
      const jsonRegex = /\{[^}]+\}/g;
      const matches = payload.match(jsonRegex);
      if (matches) {
        matches.forEach(match => {
          try { results.push(JSON.parse(match)); } catch { }
        });
      }
    }
    return results;
  }, []);

  const determineSectionFromTopic = useCallback((topic: string, payloadStr?: string): { section: 'oht' | 'intake' | 'wtp' | 'unknown'; subsection?: string } => {
    const cleanTopic = topic.trim();
    const mapping = TOPIC_TO_SECTION[cleanTopic] || TOPIC_TO_SECTION[topic];
    if (mapping) return { section: mapping.section, subsection: mapping.subsection };

    for (const [key, tPath] of Object.entries(DEFAULT_MQTT_TOPICS)) {
      if (tPath && (tPath === topic || tPath === cleanTopic)) {
        if (key === 'INTAKE') return { section: 'intake' };
        if (key === 'WTP') return { section: 'wtp' };
        if (key === 'OHT1') return { section: 'oht', subsection: 'OHT-1' };
        if (key === 'OHT2') return { section: 'oht', subsection: 'OHT-2' };
      }
    }

    if (topic.toLowerCase().includes('oht')) {
      if (topic.includes('OHT01') || topic.includes('OHT-1') || topic.includes('OHT1') || topic.includes('plc01')) {
        return { section: 'oht', subsection: 'OHT-1' };
      }
      if (topic.includes('OHT02') || topic.includes('OHT-2') || topic.includes('OHT2') || topic.includes('plc02')) {
        return { section: 'oht', subsection: 'OHT-2' };
      }
      return { section: 'oht', subsection: 'OHT-1' };
    }
    const upperTopic = topic.toUpperCase();
    if (upperTopic.includes('INTAKE') || upperTopic.includes('INT') || topic.toLowerCase().includes('intake')) return { section: 'intake' };
    if (upperTopic.includes('WTP') || topic.toLowerCase().includes('wtp')) return { section: 'wtp' };

    // Payload tag inspection fallback
    if (payloadStr) {
      if (payloadStr.includes('02500225110500007982') || payloadStr.includes('INTAKEPT') || payloadStr.includes('INFLOW') || payloadStr.includes('INT_')) return { section: 'intake' };
      if (payloadStr.includes('02500225110500007512') || payloadStr.includes('OHT_PT_') || payloadStr.includes('OHT_LT') || payloadStr.includes('OHT_FLOW')) return { section: 'oht', subsection: 'OHT-1' };
      if (payloadStr.includes('RAW_PH') || payloadStr.includes('RAW_EFM') || payloadStr.includes('CWR_') || payloadStr.includes('BW_LT')) return { section: 'wtp' };
    }

    return { section: 'unknown' };
  }, []);

  const connect = useCallback(async () => {
    if (isConnectingRef.current || clientRef.current?.connected) return;
    // This broker's 8080 listener has no working TLS websocket endpoint.
    // HTTPS dashboards receive the server TCP collector via Supabase Realtime.
    if (window.location.protocol === 'https:' && config.brokerUrl.includes('mqtt.orbitengineerings.com:8080')) return;
    isConnectingRef.current = true;
    setIsConnecting(true);
    setLastError(null);

    // Clean up any existing client before connecting to avoid duplicates/leaks
    if (clientRef.current) {
      try {
        clientRef.current.end(true);
      } catch (err) {
        logError('MqttContext.cleanupOldClient', err);
      }
      clientRef.current = null;
    }

    try {
      const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
      const options: IClientOptions = {
        clientId: `${config.clientId || 'shahpur'}_${Math.random().toString(16).slice(2, 10)}`,
        clean: true,
        connectTimeout: 8000,
        reconnectPeriod: isHttps ? 20000 : 3000, // On HTTPS if broker SSL is missing, gracefully retry every 20s
        keepalive: 30, // Send ping every 30s to keep broker connection alive
      };
      if (config.username) { options.username = config.username; options.password = config.password; }

      const client = mqtt.connect(config.brokerUrl, options);
      clientRef.current = client;

      client.on('connect', () => {
        if (clientRef.current !== client) return;
        setIsConnected(true);
        setIsConnecting(false);
        isConnectingRef.current = false;
        if (!wasConnectedRef.current) {
          toast.success('MQTT Connected');
          wasConnectedRef.current = true;
        }
        const defaultTopicList = Object.values(DEFAULT_MQTT_TOPICS).filter(Boolean);
        const topicsToSub = Array.from(new Set([...ALL_MQTT_TOPICS, ...defaultTopicList, 'sahpur/#', 'sahpur/wtp']));
        client.subscribe(topicsToSub, (err) => {
          if (err) { logError('MqttContext.subscribe', err); }
          else logInfo('MQTT', `Subscribed to ${topicsToSub.length} topics: ${topicsToSub.join(', ')}`);
        });
        if (configRef.current.id) {
          supabase.from('mqtt_config').update({ is_connected: true, last_connected_at: new Date().toISOString() }).eq('id', configRef.current.id).then(() => {});
        }
      });

      const throttledUpdate = (() => {
        let pending: MqttMessage | null = null;
        let rafId: number | null = null;
        return (msg: MqttMessage) => {
          pending = msg;
          if (rafId === null) {
            rafId = requestAnimationFrame(() => {
              if (pending) setLastMessage(pending);
              rafId = null;
            });
          }
        };
      })();

      client.on('message', (topic, payload, packet) => {
        if (clientRef.current !== client || packet.retain) return;
        const payloadStr = payload.toString();
        const parsedData = parsePayload(payloadStr);
        const { section, subsection } = determineSectionFromTopic(topic, payloadStr);
        const combinedPayload: Record<string, string | number> = {};
        parsedData.forEach(data => Object.assign(combinedPayload, data));
        const message: MqttMessage = { topic, payload: combinedPayload, timestamp: new Date(), section, subsection, rawPayload: payloadStr };
        throttledUpdate(message);
        setMessageCount(prev => prev + 1);
        messageCountRef.current++;
        if (onMessageRef.current) onMessageRef.current(message);
      });

      client.on('error', (err) => {
        if (clientRef.current !== client) return;
        logError('MqttContext.connection', err);
        setLastError(err.message);
        setIsConnecting(false);
        isConnectingRef.current = false;
      });

      client.on('close', () => {
        if (clientRef.current !== client) return;
        setIsConnected(false);
        setIsConnecting(false);
        isConnectingRef.current = false;
        wasConnectedRef.current = false;
        if (config.id) {
          supabase.from('mqtt_config').update({ is_connected: false }).eq('id', config.id).then(() => {});
        }
      });

      client.on('offline', () => {
        if (clientRef.current !== client) return;
        setIsConnected(false);
        setIsConnecting(false);
        isConnectingRef.current = false;
      });
    } catch (error) {
      setIsConnecting(false);
      isConnectingRef.current = false;
      setLastError(error instanceof Error ? error.message : 'Connection failed');
    }
  }, [config, isConnecting, isConnected, parsePayload, determineSectionFromTopic]);

  useEffect(() => { connectRef.current = connect; }, [connect]);
  useEffect(() => {
    if (configLoaded && config.autoConnect) void connectRef.current?.();
  }, [configLoaded, config]);

  const disconnect = useCallback(() => {
    if (clientRef.current) {
      clientRef.current.end(true);
      clientRef.current = null;
    }
    setIsConnected(false);
    setIsConnecting(false);
    toast.info('MQTT Disconnected');
    if (config.id) supabase.from('mqtt_config').update({ is_connected: false }).eq('id', config.id).then(() => {});
  }, [config.id]);

  const updateConfig = useCallback(async (updates: Partial<MqttConfig>) => {
    setConfig(prev => ({ ...prev, ...updates }));
  }, []);

  const saveConfig = useCallback(async () => {
    try {
      const dbConfig = {
        broker_url: config.brokerUrl,
        client_id: config.clientId || null,
        oht_topic: config.topics.OHT1 || MQTT_TOPICS.OHT1,
        oht_topic_2: config.topics.OHT2 || MQTT_TOPICS.OHT2,
        intake_topic: config.topics.INTAKE || MQTT_TOPICS.INTAKE,
        wtp_topic: config.topics.WTP || MQTT_TOPICS.WTP,
        auto_connect: config.autoConnect,
      };
      if (config.id) {
        await supabase.from('mqtt_config').update(dbConfig).eq('id', config.id);
      } else {
        const { data } = await supabase.from('mqtt_config').insert(dbConfig).select('id').single();
        if (data) setConfig(prev => ({ ...prev, id: data.id }));
      }
      toast.success('Configuration saved');
    } catch (error) {
      logError('MqttContext.saveConfig', error);
      toast.error('Failed to save configuration');
    }
  }, [config]);

  return (
    <MqttContext.Provider value={{
      config, isConnected, isConnecting, lastMessage, messageCount, messagesPerSecond,
      lastError, connect, disconnect, updateConfig, saveConfig,
    }}>
      {children}
    </MqttContext.Provider>
  );
};

export const useMqtt = (): MqttContextType => {
  const context = useContext(MqttContext);
  if (!context) throw new Error('useMqtt must be used within a MqttProvider');
  return context;
};
