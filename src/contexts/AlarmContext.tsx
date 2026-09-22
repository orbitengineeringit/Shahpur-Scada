import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { logError, logDebug } from '@/lib/errorLogger';

export interface AlarmLog {
    id: string;
    timestamp: string;
    tagId: string;
    tagConfigId?: string;
    label: string;
    value: number;
    unit: string;
    type: 'High' | 'Low' | 'Disconnect';
    message: string;
    section: 'intake' | 'oht' | 'wtp';
    acknowledged: boolean;
    emailSent: boolean;
    highSetpoint?: number;
    lowSetpoint?: number;
    source?: 'browser' | 'backend:5min';
}

interface AlarmContextType {
    alarms: AlarmLog[];
    unreadCount: number;
    addAlarm: (alarm: Omit<AlarmLog, 'id' | 'timestamp' | 'acknowledged' | 'emailSent'>) => Promise<void>;
    clearAlarms: () => Promise<void>;
    acknowledgeAll: () => Promise<void>;
    acknowledgeAlarm: (id: string) => Promise<void>;
    loadAlarms: () => Promise<void>;
}

const AlarmContext = createContext<AlarmContextType | undefined>(undefined);

export const isLegacyMohgaonAlarm = (alarm: { tagId?: string; label?: string }): boolean => {
    const tid = (alarm.tagId || '').toUpperCase();
    const lbl = (alarm.label || '').toLowerCase();
    return (
        (tid.startsWith('OHT') && !tid.startsWith('OHT1') && !tid.startsWith('OHT-1') && !tid.startsWith('OHT2') && !tid.startsWith('OHT-2')) ||
        lbl.includes('oht-3') || lbl.includes('oht 3') || lbl.includes('oht3') ||
        lbl.includes('oht-4') || lbl.includes('oht 4') || lbl.includes('oht4') ||
        lbl.includes('ward') || lbl.includes('mohgaon') || tid.includes('MOH')
    );
};

export const AlarmProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [alarms, setAlarms] = useState<AlarmLog[]>([]);
    const recentAlarmKeys = React.useRef<Map<string, number>>(new Map());

    const unreadCount = alarms.filter(a => !a.acknowledged).length;

    // Load alarms from database on mount
    const loadAlarms = useCallback(async () => {
        try {
            const { data, error } = await supabase
                .from('alarms')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(500);

            if (error) {
                logError('AlarmContext.loadAlarms', error);
                return;
            }

            if (data) {
                const mapped: AlarmLog[] = data.map(a => ({
                    id: a.id,
                    timestamp: a.created_at,
                    tagId: a.tag_id,
                    tagConfigId: a.tag_config_id || undefined,
                    label: a.label,
                    value: Number(a.value),
                    unit: a.unit,
                    type: a.alarm_type as 'High' | 'Low' | 'Disconnect',
                    message: a.message,
                    section: a.section as 'intake' | 'oht' | 'wtp',
                    acknowledged: a.acknowledged,
                    emailSent: a.email_sent,
                    source: a.source as 'browser' | 'backend:5min',
                }));
                setAlarms(mapped.filter(a => !isLegacyMohgaonAlarm(a)));
            }
        } catch (error) {
            logError('AlarmContext.loadAlarms', error);
        }
    }, []);

    useEffect(() => {
        loadAlarms();

        const mapAlarmRow = (a: any): AlarmLog => ({
            id: a.id,
            timestamp: a.created_at,
            tagId: a.tag_id,
            tagConfigId: a.tag_config_id || undefined,
            label: a.label,
            value: Number.isFinite(Number(a.value)) ? Number(a.value) : 0,
            unit: a.unit,
            type: a.alarm_type as 'High' | 'Low' | 'Disconnect',
            message: a.message,
            section: a.section as 'intake' | 'oht' | 'wtp',
            acknowledged: a.acknowledged,
            emailSent: a.email_sent,
            source: a.source as 'browser' | 'backend:5min',
        });

        const channel = supabase
            .channel('alarms-realtime')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'alarms',
                },
                (payload) => {
                    if (payload.eventType === 'INSERT') {
                        const newRow = mapAlarmRow(payload.new);
                        if (!isLegacyMohgaonAlarm(newRow)) {
                            setAlarms(prev => [newRow, ...prev].slice(0, 500));
                        }
                    } else if (payload.eventType === 'UPDATE') {
                        const updated = payload.new as any;
                        setAlarms(prev => prev.map(a =>
                            a.id === updated.id ? { ...a, acknowledged: updated.acknowledged, emailSent: updated.email_sent } : a
                        ));
                    } else if (payload.eventType === 'DELETE') {
                        const deleted = payload.old as any;
                        if (deleted?.id) {
                            setAlarms(prev => prev.filter(a => a.id !== deleted.id));
                        } else {
                            loadAlarms();
                        }
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [loadAlarms]);

    const addAlarm = useCallback(async (newAlarm: Omit<AlarmLog, 'id' | 'timestamp' | 'acknowledged' | 'emailSent'>) => {
        const key = `${newAlarm.tagId}-${newAlarm.type}`;
        const now = Date.now();
        const lastFired = recentAlarmKeys.current.get(key) || 0;
        if (now - lastFired < 10 * 60 * 1000) return; // skip duplicates in last 10 minutes
        recentAlarmKeys.current.set(key, now);

        // Prune stale entries older than 10 minutes to prevent memory leak
        if (recentAlarmKeys.current.size > 100) {
            for (const [k, ts] of recentAlarmKeys.current.entries()) {
                if (now - ts > 10 * 60 * 1000) recentAlarmKeys.current.delete(k);
            }
        }

        try {
            // Insert into database
            const { data, error } = await supabase
                .from('alarms')
                .insert({
                    tag_id: newAlarm.tagId,
                    tag_config_id: newAlarm.tagConfigId || null,
                    label: newAlarm.label,
                    value: newAlarm.value,
                    unit: newAlarm.unit,
                    alarm_type: newAlarm.type,
                    message: newAlarm.message,
                    section: newAlarm.section,
                    acknowledged: false,
                    email_sent: false,
                    source: 'browser',
                })
                .select()
                .single();

            if (error) {
                logError('AlarmContext.addAlarm.save', error);
                return;
            }

            // Trigger email notification via edge function (disabled as Resend is removed)
            /*
            try {
                await supabase.functions.invoke('send-alarm-email', {
                    body: {
                        alarmId: data.id,
                        tagId: newAlarm.tagId,
                        label: newAlarm.label,
                        value: newAlarm.value,
                        unit: newAlarm.unit,
                        type: newAlarm.type,
                        message: newAlarm.message,
                        section: newAlarm.section,
                        timestamp: data.created_at,
                        highSetpoint: newAlarm.highSetpoint,
                        lowSetpoint: newAlarm.lowSetpoint,
                    }
                });
            } catch (emailError) {
                logError('AlarmContext.addAlarm.email', emailError);
            }
            */

        } catch (error) {
            logError('AlarmContext.addAlarm', error);
        }
    }, []);

    const clearAlarms = useCallback(async () => {
        try {
            await supabase.from('alarms').delete().neq('id', '00000000-0000-0000-0000-000000000000');
            setAlarms([]);
            toast.success('Alarm history cleared');
        } catch (error) {
            logError('AlarmContext.clearAlarms', error);
            toast.error('Failed to clear alarms');
        }
    }, []);

    const acknowledgeAll = useCallback(async () => {
        try {
            await supabase
                .from('alarms')
                .update({ acknowledged: true, acknowledged_at: new Date().toISOString() })
                .eq('acknowledged', false);
            
            setAlarms(prev => prev.map(a => ({ ...a, acknowledged: true })));
            toast.success('All alarms acknowledged');
        } catch (error) {
            logError('AlarmContext.acknowledgeAll', error);
            toast.error('Failed to acknowledge alarms');
        }
    }, []);

    const acknowledgeAlarm = useCallback(async (id: string) => {
        try {
            await supabase
                .from('alarms')
                .update({ acknowledged: true, acknowledged_at: new Date().toISOString() })
                .eq('id', id);
            
            setAlarms(prev => prev.map(a => 
                a.id === id ? { ...a, acknowledged: true } : a
            ));
        } catch (error) {
            logError('AlarmContext.acknowledgeAlarm', error);
        }
    }, []);

    return (
        <AlarmContext.Provider value={{ 
            alarms, 
            unreadCount, 
            addAlarm, 
            clearAlarms, 
            acknowledgeAll,
            acknowledgeAlarm,
            loadAlarms 
        }}>
            {children}
        </AlarmContext.Provider>
    );
};

export const useAlarm = (): AlarmContextType => {
    const context = useContext(AlarmContext);
    if (!context) {
        throw new Error('useAlarm must be used within an AlarmProvider');
    }
    return context;
};
