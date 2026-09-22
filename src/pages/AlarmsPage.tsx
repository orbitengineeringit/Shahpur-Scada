import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import StatusBar from '@/components/StatusBar';
import GlobalFilterBar, { GlobalFilters, AssetFilter } from '@/components/GlobalFilterBar';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, Trash2, CheckCircle2, AlertTriangle, BellRing } from 'lucide-react';
import { useAlarm } from '@/contexts/AlarmContext';
import { format, startOfDay, endOfDay } from 'date-fns';
import { cn } from '@/lib/utils';

const AlarmsPage: React.FC = () => {
    const { alarms, clearAlarms, acknowledgeAll, acknowledgeAlarm } = useAlarm();
    const [filter, setFilter] = useState<'all' | 'high' | 'low'>('all');
    const [sectionFilter, setSectionFilter] = useState<'all' | 'intake' | 'wtp' | 'oht'>('all');
    const [visibleCount, setVisibleCount] = useState(50);
    const [globalFilters, setGlobalFilters] = useState<GlobalFilters>({
      startDate: undefined,
      endDate: undefined,
      assets: ['all'],
      density: 'detailed',
    });

    // Reset page pagination on filter change
    useEffect(() => {
        setVisibleCount(50);
    }, [filter, sectionFilter, globalFilters]);

    const sectionFromAsset = (asset: AssetFilter): string[] => {
      if (asset === 'all') return [];
      if (asset === 'intake') return ['intake'];
      if (asset === 'wtp') return ['wtp'];
      return ['oht'];
    };

    const stats = useMemo(() => {
        const todayStart = startOfDay(new Date());
        return {
            today: alarms.filter(a => new Date(a.timestamp) >= todayStart).length,
            unacknowledged: alarms.filter(a => !a.acknowledged).length,
            high: alarms.filter(a => a.type === 'High').length,
            low: alarms.filter(a => a.type === 'Low').length
        };
    }, [alarms]);

    const { filteredAlarms, displayedAlarms } = useMemo(() => {
        const filtered = alarms.filter(alarm => {
            if (filter !== 'all' && alarm.type.toLowerCase() !== filter) return false;

            // Section Filter Pill
            if (sectionFilter !== 'all' && alarm.section !== sectionFilter) return false;

            // Filter out legacy Mohgaon OHT-3 / OHT-4 alarms
            if (alarm.tagId?.startsWith('OHT3') || alarm.tagId?.startsWith('OHT4') || 
                alarm.tagId?.startsWith('OHT-3') || alarm.tagId?.startsWith('OHT-4')) {
                return false;
            }

            // Asset filter
            if (!globalFilters.assets.includes('all')) {
                const matches = globalFilters.assets.some(asset => {
                    if (asset === 'intake') return alarm.section === 'intake';
                    if (asset === 'wtp') return alarm.section === 'wtp';
                    if (asset === 'oht-1') {
                        return alarm.section === 'oht' && (
                            alarm.tagId?.startsWith('OHT1') || alarm.tagId?.startsWith('OHT-1') ||
                            alarm.label?.includes('OHT-1') || alarm.label?.includes('OHT 1') ||
                            alarm.label?.includes('Bus Station')
                        );
                    }
                    if (asset === 'oht-2') {
                        return alarm.section === 'oht' && (
                            alarm.tagId?.startsWith('OHT2') || alarm.tagId?.startsWith('OHT-2') ||
                            alarm.label?.includes('OHT-2') || alarm.label?.includes('OHT 2')
                        );
                    }
                    return false;
                });
                if (!matches) return false;
            }

            // Date filter
            if (globalFilters.startDate) {
                const alarmDate = new Date(alarm.timestamp);
                if (alarmDate < startOfDay(globalFilters.startDate)) return false;
            }
            if (globalFilters.endDate) {
                const alarmDate = new Date(alarm.timestamp);
                if (alarmDate > endOfDay(globalFilters.endDate)) return false;
            }

            return true;
        });

        return {
            filteredAlarms: filtered,
            displayedAlarms: filtered.slice(0, visibleCount),
        };
    }, [alarms, filter, sectionFilter, globalFilters, visibleCount]);

    const getAlarmIcon = (type: string) => {
        if (type === 'High') return <AlertTriangle className="h-4 w-4 text-destructive" />;
        return <AlertCircle className="h-4 w-4 text-warning" />;
    };

    return (
        <div className="min-h-screen flex flex-col bg-background grid-pattern">

            <main className="flex-1 container mx-auto px-4 py-6 md:py-8">
                {/* Page Header */}
                <div className="flex items-center justify-between mb-6 md:mb-8 opacity-0 animate-fade-in">
                    <div className="flex items-center gap-3">
                        <div className="p-3 rounded-xl bg-destructive/10">
                            <BellRing className="h-6 w-6 text-destructive" />
                        </div>
                        <div>
                            <h2 className="text-xl md:text-2xl font-bold text-foreground">Alarm History</h2>
                            <p className="text-sm text-muted-foreground">Live monitoring of system alerts</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={acknowledgeAll} className="gap-2" disabled={alarms.length === 0}>
                            <CheckCircle2 className="h-4 w-4" />
                            <span className="hidden sm:inline">Acknowledge All</span>
                        </Button>
                        <Button variant="destructive" size="sm" onClick={clearAlarms} className="gap-2" disabled={alarms.length === 0}>
                            <Trash2 className="h-4 w-4" />
                            <span className="hidden sm:inline">Clear History</span>
                        </Button>
                    </div>
                </div>
                {/* Stats Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 opacity-0 animate-fade-in" style={{ animationDelay: '50ms' }}>
                    <Card className="bg-card/50 backdrop-blur border-border/60">
                        <CardContent className="p-4 flex items-center justify-between">
                            <div>
                                <p className="text-xs text-muted-foreground font-medium">Today's Alarms</p>
                                <h3 className="text-2xl font-bold mt-1 text-foreground">{stats.today}</h3>
                            </div>
                            <div className="p-2.5 rounded-lg bg-primary/10">
                                <BellRing className="h-5 w-5 text-primary" />
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="bg-card/50 backdrop-blur border-border/60">
                        <CardContent className="p-4 flex items-center justify-between">
                            <div>
                                <p className="text-xs text-muted-foreground font-medium">Unacknowledged</p>
                                <h3 className="text-2xl font-bold mt-1 text-destructive">{stats.unacknowledged}</h3>
                            </div>
                            <div className={cn("p-2.5 rounded-lg bg-destructive/10", stats.unacknowledged > 0 && "animate-pulse")}>
                                <AlertCircle className="h-5 w-5 text-destructive" />
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="bg-card/50 backdrop-blur border-border/60">
                        <CardContent className="p-4 flex items-center justify-between">
                            <div>
                                <p className="text-xs text-muted-foreground font-medium">High Priority</p>
                                <h3 className="text-2xl font-bold mt-1 text-destructive">{stats.high}</h3>
                            </div>
                            <div className="p-2.5 rounded-lg bg-destructive/10">
                                <AlertTriangle className="h-5 w-5 text-destructive" />
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="bg-card/50 backdrop-blur border-border/60">
                        <CardContent className="p-4 flex items-center justify-between">
                            <div>
                                <p className="text-xs text-muted-foreground font-medium">Low Priority</p>
                                <h3 className="text-2xl font-bold mt-1 text-warning">{stats.low}</h3>
                            </div>
                            <div className="p-2.5 rounded-lg bg-warning/10">
                                <AlertCircle className="h-5 w-5 text-warning" />
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Global Filter Bar */}
                <GlobalFilterBar filters={globalFilters} onFiltersChange={setGlobalFilters} />

                {/* Filter Groups */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 opacity-0 animate-fade-in" style={{ animationDelay: '100ms' }}>
                    {/* Priority Filters */}
                    <div className="flex flex-wrap gap-2">
                        <Button variant={filter === 'all' ? 'default' : 'outline'} size="sm" onClick={() => setFilter('all')}>All Priorities</Button>
                        <Button variant={filter === 'high' ? 'default' : 'outline'} size="sm" onClick={() => setFilter('high')}
                            className={filter === 'high' ? 'bg-destructive hover:bg-destructive/90 text-destructive-foreground font-medium' : ''}>High Priority</Button>
                        <Button variant={filter === 'low' ? 'default' : 'outline'} size="sm" onClick={() => setFilter('low')}
                            className={filter === 'low' ? 'bg-warning text-warning-foreground hover:bg-warning/90 font-medium' : ''}>Low Priority</Button>
                    </div>

                    {/* Section Filters */}
                    <div className="flex flex-wrap gap-1.5 bg-muted/40 p-1 rounded-lg border border-border/40">
                        <Button variant={sectionFilter === 'all' ? 'secondary' : 'ghost'} size="xs" onClick={() => setSectionFilter('all')} className="h-7 px-2.5 text-xs">All Sections</Button>
                        <Button variant={sectionFilter === 'intake' ? 'secondary' : 'ghost'} size="xs" onClick={() => setSectionFilter('intake')} className="h-7 px-2.5 text-xs">Intake</Button>
                        <Button variant={sectionFilter === 'wtp' ? 'secondary' : 'ghost'} size="xs" onClick={() => setSectionFilter('wtp')} className="h-7 px-2.5 text-xs">WTP</Button>
                        <Button variant={sectionFilter === 'oht' ? 'secondary' : 'ghost'} size="xs" onClick={() => setSectionFilter('oht')} className="h-7 px-2.5 text-xs">OHTs</Button>
                    </div>
                </div>

                {/* Alarms Table */}
                <Card className="opacity-0 animate-fade-in" style={{ animationDelay: '200ms' }}>
                    <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2">
                            Recent Alarms
                            {displayedAlarms.length > 0 && (
                                <Badge variant="secondary" className="ml-2 font-normal">{displayedAlarms.length} events</Badge>
                            )}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {displayedAlarms.length === 0 ? (
                            <div className="text-center py-12 text-muted-foreground">
                                <CheckCircle2 className="h-12 w-12 mx-auto mb-4 opacity-30 text-success" />
                                <p className="text-lg font-medium">No alarms found</p>
                                <p className="text-sm">System is operating normally.</p>
                            </div>
                        ) : (
                            <div className="rounded-lg border border-border overflow-hidden">
                                <div className="max-h-[600px] overflow-auto">
                                    <Table className="min-w-[720px]">
                                        <TableHeader className="sticky top-0 bg-card">
                                            <TableRow>
                                                <TableHead className="w-[180px]">Time</TableHead>
                                                <TableHead>Tag</TableHead>
                                                <TableHead>Type</TableHead>
                                                <TableHead>Value</TableHead>
                                                <TableHead className="w-[30%]">Message</TableHead>
                                                <TableHead>Source</TableHead>
                                                <TableHead className="text-right">Action/Status</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {displayedAlarms.map((alarm) => (
                                                <TableRow key={alarm.id} className={cn("transition-colors", !alarm.acknowledged && "bg-destructive/5")}>
                                                    <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                                                        {format(new Date(alarm.timestamp), 'yyyy-MM-dd HH:mm:ss')}
                                                    </TableCell>
                                                    <TableCell className="font-medium">
                                                        <div className="flex flex-col">
                                                            <span>{alarm.label}</span>
                                                            <span className="text-xs text-muted-foreground font-mono">{alarm.tagId}</span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="flex items-center gap-1.5">
                                                            {getAlarmIcon(alarm.type)}
                                                            <span className={cn("font-medium text-xs", alarm.type === 'High' ? "text-destructive" : "text-warning")}>
                                                                {alarm.type.toUpperCase()}
                                                            </span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="font-mono">
                                                        {alarm.value.toFixed(2)} <span className="text-xs text-muted-foreground">{alarm.unit}</span>
                                                    </TableCell>
                                                    <TableCell className="text-sm">{alarm.message}</TableCell>
                                                    <TableCell>
                                                        {alarm.source === 'backend:5min' ? (
                                                            <Badge variant="outline" className="bg-blue-500/5 text-blue-500 border-blue-500/20 gap-1 font-mono text-[10px] py-0.5">
                                                                ⚙️ Backend
                                                            </Badge>
                                                        ) : (
                                                            <Badge variant="outline" className="bg-purple-500/5 text-purple-500 border-purple-500/20 gap-1 font-mono text-[10px] py-0.5">
                                                                🖥️ Browser
                                                            </Badge>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        {alarm.acknowledged ? (
                                                            <Badge variant="outline" className="text-muted-foreground border-border">Acked</Badge>
                                                        ) : (
                                                            <div className="flex items-center justify-end gap-2">
                                                                <Badge variant="destructive" className="animate-pulse py-0.5 text-[10px]">Active</Badge>
                                                                <Button variant="outline" size="sm" onClick={() => acknowledgeAlarm(alarm.id)} className="h-6 px-2 text-[10px] hover:bg-primary hover:text-primary-foreground transition-all">
                                                                    Ack
                                                                </Button>
                                                            </div>
                                                        )}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            </div>
                        )}
                        {filteredAlarms.length > visibleCount && (
                            <div className="flex justify-center mt-6">
                                <Button variant="outline" size="sm" onClick={() => setVisibleCount(prev => prev + 50)} className="w-full sm:w-auto font-medium">
                                    Load More Alarms ({filteredAlarms.length - visibleCount} remaining)
                                </Button>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </main>

            <StatusBar />
        </div>
    );
};

export default AlarmsPage;
