import React from 'react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CalendarIcon, Filter } from 'lucide-react';
import { format, startOfDay, endOfDay, subDays } from 'date-fns';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

export type AssetFilter = 'all' | 'intake' | 'wtp' | 'oht-1' | 'oht-2';
export type DensityFilter = 'fast' | 'detailed' | 'analytical';

export interface GlobalFilters {
  startDate: Date | undefined;
  endDate: Date | undefined;
  assets: AssetFilter[];
  density: DensityFilter;
}

interface GlobalFilterBarProps {
  filters: GlobalFilters;
  onFiltersChange: (filters: GlobalFilters) => void;
  onApply?: () => void;
  compact?: boolean;
}

const ASSET_OPTIONS: { value: AssetFilter; label: string }[] = [
  { value: 'all', label: 'All Assets' },
  { value: 'intake', label: 'Intake' },
  { value: 'wtp', label: 'WTP' },
  { value: 'oht-1', label: 'OHT - 1 Bus Station' },
  { value: 'oht-2', label: 'OHT - 2 (Pending)' },
];

const GlobalFilterBar: React.FC<GlobalFilterBarProps> = ({ filters, onFiltersChange, onApply, compact }) => {
  const toggleAsset = (asset: AssetFilter) => {
    if (asset === 'all') {
      onFiltersChange({ ...filters, assets: ['all'] });
      return;
    }
    let newAssets: AssetFilter[] = filters.assets.filter((a): a is Exclude<AssetFilter, 'all'> => a !== 'all');
    if (newAssets.includes(asset)) {
      newAssets = newAssets.filter(a => a !== asset);
    } else {
      newAssets.push(asset);
    }
    if (newAssets.length === 0) newAssets = ['all' as AssetFilter];
    onFiltersChange({ ...filters, assets: newAssets });
  };

  const isAssetActive = (asset: AssetFilter) => filters.assets.includes(asset) || filters.assets.includes('all');

  const getPresetValue = () => {
    const { startDate, endDate } = filters;
    if (!startDate || !endDate) return 'custom';

    const start = startOfDay(startDate).getTime();
    const end = endOfDay(endDate).getTime();

    const todayStart = startOfDay(new Date()).getTime();
    const todayEnd = endOfDay(new Date()).getTime();
    if (start === todayStart && end === todayEnd) return 'today';

    const yesterdayStart = startOfDay(subDays(new Date(), 1)).getTime();
    const yesterdayEnd = endOfDay(subDays(new Date(), 1)).getTime();
    if (start === yesterdayStart && end === yesterdayEnd) return 'yesterday';

    const sevenDaysAgoStart = startOfDay(subDays(new Date(), 7)).getTime();
    if (start === sevenDaysAgoStart && end === todayEnd) return '7d';

    const thirtyDaysAgoStart = startOfDay(subDays(new Date(), 30)).getTime();
    if (start === thirtyDaysAgoStart && end === todayEnd) return '30d';

    return 'custom';
  };

  const handlePresetChange = (value: string) => {
    if (value === 'custom') return;

    const today = new Date();
    const startOfToday = startOfDay(today);
    const endOfToday = endOfDay(today);

    let startDate: Date | undefined = filters.startDate;
    let endDate: Date | undefined = filters.endDate;

    if (value === 'today') {
      startDate = startOfToday;
      endDate = endOfToday;
    } else if (value === 'yesterday') {
      const yesterday = subDays(today, 1);
      startDate = startOfDay(yesterday);
      endDate = endOfDay(yesterday);
    } else if (value === '7d') {
      startDate = startOfDay(subDays(today, 7));
      endDate = endOfToday;
    } else if (value === '30d') {
      startDate = startOfDay(subDays(today, 30));
      endDate = endOfToday;
    }

    onFiltersChange({
      ...filters,
      startDate,
      endDate,
    });
  };

  return (
    <div className={cn(
      "premium-card rounded-xl p-2.5 sm:p-3 mb-4 flex flex-wrap items-center gap-2 sm:gap-3",
      compact && "p-2 gap-2"
    )}>
      <div className="flex items-center gap-2 w-full sm:w-auto">
        <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
        
        <Select value={getPresetValue()} onValueChange={handlePresetChange}>
          <SelectTrigger className="h-8 w-[100px] sm:w-[120px] text-xs">
            <SelectValue placeholder="Preset" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="custom">📅 Custom</SelectItem>
            <SelectItem value="today">⚡ Today</SelectItem>
            <SelectItem value="yesterday">🕒 Yesterday</SelectItem>
            <SelectItem value="7d">📅 7 Days</SelectItem>
            <SelectItem value="30d">🗓️ 1 Month</SelectItem>
          </SelectContent>
        </Select>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 text-xs flex-1 sm:flex-none justify-start">
              <CalendarIcon className="mr-1 h-3 w-3" />
              {filters.startDate ? format(filters.startDate, 'MMM dd') : 'Start'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={filters.startDate}
              onSelect={(d) => onFiltersChange({ ...filters, startDate: d })}
              disabled={{ after: new Date() }} className="pointer-events-auto" />
          </PopoverContent>
        </Popover>
        <span className="text-xs text-muted-foreground">→</span>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 text-xs flex-1 sm:flex-none justify-start">
              <CalendarIcon className="mr-1 h-3 w-3" />
              {filters.endDate ? format(filters.endDate, 'MMM dd') : 'End'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={filters.endDate}
              onSelect={(d) => onFiltersChange({ ...filters, endDate: d })}
              disabled={{ after: new Date() }} className="pointer-events-auto" />
          </PopoverContent>
        </Popover>
      </div>

      <div className="hidden sm:block w-px h-6 bg-border" />

      <div className="flex flex-wrap gap-1 w-full sm:w-auto">
        {ASSET_OPTIONS.map(opt => (
          <Badge
            key={opt.value}
            variant={isAssetActive(opt.value) ? 'default' : 'outline'}
            className={cn(
              "cursor-pointer text-xs px-2 py-0.5 transition-all",
              isAssetActive(opt.value) ? 'bg-primary text-primary-foreground' : 'hover:bg-secondary'
            )}
            onClick={() => toggleAsset(opt.value)}
          >
            {opt.label}
          </Badge>
        ))}
      </div>

      <div className="hidden sm:block w-px h-6 bg-border" />

      <div className="flex items-center gap-2 w-full sm:w-auto sm:ml-auto">
        <Select value={filters.density} onValueChange={(v: DensityFilter) => onFiltersChange({ ...filters, density: v })}>
          <SelectTrigger className="h-8 flex-1 sm:w-[120px] sm:flex-none text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="fast">⚡ Fast</SelectItem>
            <SelectItem value="detailed">📊 Detailed</SelectItem>
            <SelectItem value="analytical">📈 Analytical</SelectItem>
          </SelectContent>
        </Select>
        {onApply && (
          <Button size="sm" className="h-8 text-xs" onClick={onApply}>
            Apply
          </Button>
        )}
      </div>
    </div>
  );
};

export default GlobalFilterBar;
