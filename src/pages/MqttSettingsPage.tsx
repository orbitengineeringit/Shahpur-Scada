import React, { lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { Settings, Wifi, WifiOff, Save, ArrowLeft, Radio, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useMqtt } from '@/contexts/MqttContext';
import { MqttStatus } from '@/components/MqttStatus';
import { cn } from '@/lib/utils';
import { MQTT_TOPIC_KEYS } from '@/config/shahpurSensors';
import { Skeleton } from '@/components/ui/skeleton';

const DataExportSettings = lazy(() => import('@/components/DataExportSettings'));

const MqttSettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const { config, isConnected, isConnecting, messageCount, messagesPerSecond, lastMessage, lastError, connect, disconnect, updateConfig, saveConfig } = useMqtt();

  return (
    <div className="min-h-screen bg-background grid-pattern">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/')} className="rounded-full">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                <Settings className="h-6 w-6 text-primary" />
                MQTT Configuration
              </h1>
              <p className="text-sm text-muted-foreground mt-1">Configure MQTT broker for Shahpur SCADA</p>
            </div>
          </div>
          <MqttStatus />
        </div>

        <div className="grid gap-6">
          <Card className="glass">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Radio className="h-5 w-5 text-primary" />Broker Connection</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Broker URL</Label>
                  <Input value={config.brokerUrl} onChange={(e) => updateConfig({ brokerUrl: e.target.value })} className="font-mono" />
                </div>
                <div className="space-y-2">
                  <Label>Client ID (Optional)</Label>
                  <Input value={config.clientId || ''} onChange={(e) => updateConfig({ clientId: e.target.value })} />
                </div>
              </div>
              <Separator />
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-success/10 border border-success/20">
                <span className="text-xs font-medium text-success">
                  {config.username
                    ? `🔐 MQTT credentials loaded securely from server (${config.username})`
                    : '⏳ MQTT credentials will load automatically after login'}
                </span>
              </div>
              <div className="grid gap-4 md:grid-cols-2 opacity-60">
                <div className="space-y-2">
                  <Label>Username</Label>
                  <Input
                    value={config.username || ''}
                    disabled
                    placeholder="Auto-loaded from server"
                    className="cursor-not-allowed"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Password</Label>
                  <div className="relative">
                    <Input
                      type="password"
                      value={config.password || ''}
                      disabled
                      placeholder="Auto-loaded from server"
                      className="cursor-not-allowed"
                    />
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between pt-4">
                <div className="flex items-center gap-3">
                  <Switch id="autoConnect" checked={config.autoConnect} onCheckedChange={(checked) => updateConfig({ autoConnect: checked })} />
                  <Label htmlFor="autoConnect">Auto-connect on page load</Label>
                </div>
                <Button onClick={isConnected ? disconnect : connect} variant={isConnected ? 'destructive' : 'default'} disabled={isConnecting} className="gap-2">
                  {isConnecting ? <RefreshCw className="h-4 w-4 animate-spin" /> : isConnected ? <WifiOff className="h-4 w-4" /> : <Wifi className="h-4 w-4" />}
                  {isConnecting ? 'Connecting...' : isConnected ? 'Disconnect' : 'Connect'}
                </Button>
              </div>
              {lastError && <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">{lastError}</div>}
            </CardContent>
          </Card>

          <Card className="glass">
            <CardHeader>
               <CardTitle>Topic Subscriptions (Shahpur)</CardTitle>
               <CardDescription>MQTT topics for Intake, OHT, and WTP — managed securely via database</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3">
                {MQTT_TOPIC_KEYS.map((key) => (
                  <div key={key} className="flex items-center gap-3">
                    <Label className="w-20 text-xs font-mono">{key}</Label>
                    <Input
                      type="password"
                      value={config.topics?.[key] || ''}
                      className="font-mono text-sm"
                      onChange={(e) => updateConfig({ topics: { ...config.topics, [key]: e.target.value } })}
                      placeholder="Loaded from database"
                    />
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">Topics are masked for security. Values are stored in the database.</p>
            </CardContent>
          </Card>

          {isConnected && (
            <Card className="glass border-success/30">
              <CardHeader><CardTitle className="flex items-center gap-2 text-success"><Wifi className="h-5 w-5" />Live Status</CardTitle></CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="p-4 rounded-lg bg-secondary/50">
                    <p className="text-sm text-muted-foreground">Total Messages</p>
                    <p className="text-2xl font-mono font-bold">{messageCount.toLocaleString()}</p>
                  </div>
                  <div className="p-4 rounded-lg bg-secondary/50">
                    <p className="text-sm text-muted-foreground">Messages/Second</p>
                    <p className="text-2xl font-mono font-bold text-primary">{messagesPerSecond}</p>
                  </div>
                  <div className="p-4 rounded-lg bg-secondary/50">
                    <p className="text-sm text-muted-foreground">Last Message</p>
                    <p className="text-sm font-mono truncate">{lastMessage?.topic.split('/').pop() || 'Waiting...'}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="flex justify-end gap-4">
            <Button variant="outline" onClick={() => navigate('/')}>Cancel</Button>
            <Button onClick={saveConfig} className="gap-2"><Save className="h-4 w-4" />Save</Button>
          </div>

          {/* Data Export & Retention Settings */}
          <Separator className="my-8" />
          <Suspense fallback={<Skeleton className="h-64 w-full rounded-lg" />}>
            <DataExportSettings />
          </Suspense>
        </div>
      </div>
    </div>
  );
};

export default MqttSettingsPage;
