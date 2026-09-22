import React, { memo } from 'react';
import { BarChart2, Container } from 'lucide-react';
import OhtAnalyticsCard from '@/components/OhtAnalyticsCard';
import HistoricalAnalyticsCard from '@/components/HistoricalAnalyticsCard';

const OhtAnalyticsPage = memo(() => {
  return (
    <div className="min-h-screen flex flex-col bg-background grid-pattern">
      <main className="flex-1 container mx-auto px-4 py-6 md:py-8 max-w-7xl">
        {/* Page Header */}
        <div className="flex items-center gap-3 mb-8 opacity-0 animate-fade-in">
          <div className="p-3 rounded-xl bg-gradient-to-br from-green-500/20 to-emerald-500/10 ring-1 ring-green-500/20 shadow-lg shadow-green-500/10">
            <Container className="h-6 w-6 text-green-500" />
          </div>
          <div>
            <h2 className="text-xl md:text-2xl font-bold text-foreground">OHT Network Analytics</h2>
            <p className="text-sm text-muted-foreground">Distribution performance and compliance • 2 OHT Units (Bus Station OHT & OHT-2)</p>
          </div>
          <div className="ml-auto hidden sm:flex items-center gap-2 px-4 py-2 rounded-full bg-green-500/10 ring-1 ring-green-500/20">
            <BarChart2 className="h-4 w-4 text-green-500" />
            <span className="text-xs font-bold text-green-500 uppercase tracking-wider">OHT Section</span>
          </div>
        </div>
        
        <div className="space-y-4 sm:space-y-6">
          <div className="opacity-0 animate-fade-in" style={{ animationDelay: '250ms' }}>
            <OhtAnalyticsCard />
          </div>
          <div className="opacity-0 animate-fade-in" style={{ animationDelay: '400ms' }}>
            <HistoricalAnalyticsCard section="oht" />
          </div>
        </div>
      </main>
    </div>
  );
});

OhtAnalyticsPage.displayName = 'OhtAnalyticsPage';
export default OhtAnalyticsPage;
