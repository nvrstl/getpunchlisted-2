import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Cloud, CloudRain, CloudSnow, CloudLightning, Sun, CloudDrizzle, CloudFog,
  Wind, Thermometer, Droplets, AlertTriangle, Loader2, RefreshCw, Plus, Check,
} from 'lucide-react';
import { Button } from './ui/button';
import { cn } from '../lib/utils';

function pickIcon(code) {
  if (code == null) return Cloud;
  if (code === 0 || code === 1) return Sun;
  if (code === 2 || code === 3) return Cloud;
  if (code === 45 || code === 48) return CloudFog;
  if (code >= 51 && code <= 57) return CloudDrizzle;
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return CloudRain;
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return CloudSnow;
  if (code >= 95) return CloudLightning;
  return Cloud;
}

const RISK_STYLE = {
  none:   { ring: 'border-emerald-200', dot: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50', label: 'Geen risico' },
  low:    { ring: 'border-sky-200',     dot: 'bg-sky-500',     text: 'text-sky-700',     bg: 'bg-sky-50',     label: 'Laag risico'  },
  medium: { ring: 'border-amber-200',   dot: 'bg-amber-500',   text: 'text-amber-700',   bg: 'bg-amber-50',   label: 'Verhoogd risico' },
  high:   { ring: 'border-red-200',     dot: 'bg-red-500',     text: 'text-red-700',     bg: 'bg-red-50',     label: 'Hoog risico'  },
};

function fmt(n, suffix = '') {
  if (n == null || Number.isNaN(Number(n))) return '–';
  return `${Math.round(Number(n) * 10) / 10}${suffix}`;
}

export default function WeatherCard({ projectId, date, onLogDelay = null, compact = false }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [delayed, setDelayed] = useState(false);
  const [logging, setLogging] = useState(false);

  const load = async () => {
    if (!projectId || !date) return;
    setLoading(true);
    setError('');
    setDelayed(false);
    try {
      const res = await fetch(`/api/weather?projectId=${projectId}&date=${date}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Weerdata kon niet geladen worden.');
      setData(json.data);
    } catch (err) {
      setError(err.message);
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [projectId, date]);

  const handleLogDelay = async () => {
    if (!data || !onLogDelay) return;
    setLogging(true);
    try {
      const parts = [
        `Weervertraging op ${data.log_date}`,
        `${data.conditions} (code ${data.weather_code}).`,
        data.precip_mm != null    ? `Neerslag ${fmt(data.precip_mm, ' mm')}.` : '',
        data.wind_max_kmh != null ? `Wind max ${fmt(data.wind_max_kmh, ' km/u')}` +
          (data.wind_gust_kmh ? `, vlagen tot ${fmt(data.wind_gust_kmh, ' km/u')}.` : '.') : '',
        data.temp_min_c != null && data.temp_max_c != null
          ? `Temperatuur ${fmt(data.temp_min_c, '°')} – ${fmt(data.temp_max_c, '°C')}.`
          : '',
        `Risicoclassificatie: ${RISK_STYLE[data.delay_risk]?.label || data.delay_risk}.`,
      ].filter(Boolean).join(' ');
      await onLogDelay({
        rawNote: parts,
        location: 'Werf — algemeen',
        logDate: data.log_date,
        weather: data,
      });
      setDelayed(true);
    } catch (err) {
      setError(err.message || 'Kon vertraging niet loggen.');
    } finally {
      setLogging(false);
    }
  };

  if (!projectId || !date) return null;

  const Icon = pickIcon(data?.weather_code);
  const risk = RISK_STYLE[data?.delay_risk] || RISK_STYLE.none;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={cn(
        'glass-card rounded-2xl p-4 border',
        data ? risk.ring : 'border-[var(--border-color)]',
      )}
    >
      <div className="flex items-start gap-4">
        {/* Icon */}
        <div className={cn(
          'w-12 h-12 rounded-xl flex items-center justify-center shrink-0',
          data ? risk.bg : 'bg-[var(--surface-2)]',
        )}>
          {loading
            ? <Loader2 className="w-5 h-5 animate-spin text-[var(--text-tertiary)]" />
            : <Icon className={cn('w-6 h-6', data ? risk.text : 'text-[var(--text-tertiary)]')} />
          }
        </div>

        {/* Main */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="text-[14px] font-semibold text-[var(--text-primary)]">
              {loading ? 'Weerdata ophalen…' : (data?.conditions || 'Weer')}
            </div>
            {data && (
              <span className={cn(
                'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono uppercase tracking-wide',
                risk.bg, risk.text,
              )}>
                <span className={cn('w-1.5 h-1.5 rounded-full', risk.dot)} />
                {risk.label}
              </span>
            )}
          </div>

          {data && !compact && (
            <div className="flex gap-4 mt-2 text-[12px] text-[var(--text-secondary)] flex-wrap">
              <span className="inline-flex items-center gap-1">
                <Thermometer className="w-3.5 h-3.5" />
                {fmt(data.temp_min_c, '°')} / {fmt(data.temp_max_c, '°C')}
              </span>
              <span className="inline-flex items-center gap-1">
                <Droplets className="w-3.5 h-3.5" />
                {fmt(data.precip_mm, ' mm')}
              </span>
              <span className="inline-flex items-center gap-1">
                <Wind className="w-3.5 h-3.5" />
                {fmt(data.wind_max_kmh, ' km/u')}
                {data.wind_gust_kmh ? ` (${fmt(data.wind_gust_kmh, ' km/u')})` : ''}
              </span>
            </div>
          )}

          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -2 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="mt-2 text-[11px] text-red-700 bg-red-50 border border-red-200 px-2.5 py-1.5 rounded-lg inline-flex items-center gap-1.5"
              >
                <AlertTriangle className="w-3.5 h-3.5" /> {error}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Actions */}
        <div className="flex gap-1.5 shrink-0">
          <Button variant="ghost" size="sm" onClick={load} disabled={loading} title="Opnieuw ophalen">
            <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
          </Button>
          {onLogDelay && data && (data.delay_risk === 'medium' || data.delay_risk === 'high') && (
            <Button
              size="sm"
              onClick={handleLogDelay}
              disabled={logging || delayed}
              className={cn(
                'gap-1.5',
                delayed
                  ? 'bg-emerald-600 hover:bg-emerald-600 text-white border-0'
                  : 'bg-[var(--text-primary)] hover:bg-[var(--text-secondary)] text-white border-0',
              )}
            >
              {delayed
                ? <><Check className="w-3.5 h-3.5" /> Gelogd</>
                : logging
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loggen…</>
                  : <><Plus className="w-3.5 h-3.5" /> Vertraging loggen</>
              }
            </Button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
