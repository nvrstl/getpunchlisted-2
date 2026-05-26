// Weather snapshot + delay-risk classifier.
// Uses Open-Meteo (free, no API key). Caches one row per (project, date) in weather_logs.
// On first call for a project with no lat/lon, geocodes its `city` field and writes
// the coordinates back to the projects table so subsequent calls skip geocoding.

const WMO = {
  0:  { label: 'Clear',                  risk: 'none'   },
  1:  { label: 'Mainly clear',           risk: 'none'   },
  2:  { label: 'Partly cloudy',          risk: 'none'   },
  3:  { label: 'Overcast',               risk: 'none'   },
  45: { label: 'Fog',                    risk: 'low'    },
  48: { label: 'Rime fog',               risk: 'low'    },
  51: { label: 'Light drizzle',          risk: 'low'    },
  53: { label: 'Drizzle',                risk: 'low'    },
  55: { label: 'Heavy drizzle',          risk: 'medium' },
  56: { label: 'Freezing drizzle',       risk: 'high'   },
  57: { label: 'Heavy freezing drizzle', risk: 'high'   },
  61: { label: 'Light rain',             risk: 'low'    },
  63: { label: 'Rain',                   risk: 'medium' },
  65: { label: 'Heavy rain',             risk: 'high'   },
  66: { label: 'Freezing rain',          risk: 'high'   },
  67: { label: 'Heavy freezing rain',    risk: 'high'   },
  71: { label: 'Light snow',             risk: 'medium' },
  73: { label: 'Snow',                   risk: 'high'   },
  75: { label: 'Heavy snow',             risk: 'high'   },
  77: { label: 'Snow grains',            risk: 'medium' },
  80: { label: 'Rain showers',           risk: 'medium' },
  81: { label: 'Heavy rain showers',     risk: 'high'   },
  82: { label: 'Violent rain showers',   risk: 'high'   },
  85: { label: 'Snow showers',           risk: 'high'   },
  86: { label: 'Heavy snow showers',     risk: 'high'   },
  95: { label: 'Thunderstorm',           risk: 'high'   },
  96: { label: 'Thunderstorm w/ hail',   risk: 'high'   },
  99: { label: 'Severe thunderstorm',    risk: 'high'   },
};

function escalateRisk(base, { precip_mm, wind_max_kmh, wind_gust_kmh, temp_min_c }) {
  const order = ['none', 'low', 'medium', 'high'];
  let idx = order.indexOf(base);
  if (precip_mm    >= 20) idx = Math.max(idx, order.indexOf('high'));
  else if (precip_mm >= 8)  idx = Math.max(idx, order.indexOf('medium'));
  if (wind_gust_kmh >= 70 || wind_max_kmh >= 50) idx = Math.max(idx, order.indexOf('high'));
  else if (wind_max_kmh >= 35)                   idx = Math.max(idx, order.indexOf('medium'));
  if (temp_min_c <= -5)      idx = Math.max(idx, order.indexOf('high'));
  else if (temp_min_c <= 0)  idx = Math.max(idx, order.indexOf('medium'));
  return order[Math.max(idx, 0)];
}

async function geocodeCity(city) {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Geocoding failed (${res.status})`);
  const json = await res.json();
  const hit = json?.results?.[0];
  if (!hit) throw new Error(`No coordinates found for city "${city}"`);
  return { lat: hit.latitude, lon: hit.longitude };
}

async function fetchOpenMeteoDaily(lat, lon, date) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}`
    + `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,wind_gusts_10m_max`
    + `&timezone=auto&start_date=${date}&end_date=${date}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Weather fetch failed (${res.status})`);
  return await res.json();
}

function buildHandler({ supabaseAdmin }) {
  return async function weatherHandler(req, res) {
    const { projectId, date } = req.method === 'GET' ? req.query : req.body;
    if (!projectId) return res.status(400).json({ success: false, error: 'projectId required' });
    if (!date)      return res.status(400).json({ success: false, error: 'date (YYYY-MM-DD) required' });
    if (!supabaseAdmin) return res.status(503).json({ success: false, error: 'Server not configured' });

    try {
      // 1) Cache hit? (weather_logs may not exist yet if migration not applied —
      //    treat any error here as a cache miss and continue.)
      const { data: existing, error: cacheErr } = await supabaseAdmin
        .from('weather_logs')
        .select('*')
        .eq('project_id', projectId)
        .eq('log_date', date)
        .maybeSingle();
      if (cacheErr && /relation .* does not exist/i.test(cacheErr.message)) {
        return res.status(503).json({
          success: false,
          error: 'Weather migration not applied yet. Run supabase/add_weather.sql in the Supabase SQL editor.',
        });
      }
      if (existing) return res.json({ success: true, data: existing, cached: true });

      // 2) Resolve project coordinates. Try lat/lon first; if those columns don't
      //    exist (migration not applied), fall back to fetching just city.
      let project, projErr;
      ({ data: project, error: projErr } = await supabaseAdmin
        .from('projects')
        .select('id, city, lat, lon')
        .eq('id', projectId)
        .maybeSingle());

      if (projErr && /column .* does not exist/i.test(projErr.message)) {
        return res.status(503).json({
          success: false,
          error: 'Weather migration not applied yet. Run supabase/add_weather.sql in the Supabase SQL editor.',
        });
      }
      if (projErr) {
        console.error('[weather] project lookup error:', projErr.message);
        return res.status(500).json({ success: false, error: `DB error: ${projErr.message}` });
      }
      if (!project) {
        return res.status(404).json({ success: false, error: `Project ${projectId} not found` });
      }

      let { lat, lon } = project;
      if (lat == null || lon == null) {
        if (!project.city) {
          return res.status(400).json({
            success: false,
            error: 'Project has no city or coordinates set. Add a city in project settings.',
          });
        }
        const geo = await geocodeCity(project.city);
        lat = geo.lat; lon = geo.lon;
        await supabaseAdmin.from('projects').update({ lat, lon }).eq('id', projectId);
      }

      // 3) Fetch weather
      const payload = await fetchOpenMeteoDaily(lat, lon, date);
      const d = payload?.daily;
      if (!d || !Array.isArray(d.time) || d.time.length === 0) {
        return res.status(502).json({ success: false, error: 'Weather provider returned no data for this date.' });
      }

      const code   = d.weather_code?.[0];
      const meta   = WMO[code] || { label: 'Unknown', risk: 'none' };
      const snapshot = {
        project_id:     projectId,
        log_date:       date,
        temp_min_c:     d.temperature_2m_min?.[0]   ?? null,
        temp_max_c:     d.temperature_2m_max?.[0]   ?? null,
        precip_mm:      d.precipitation_sum?.[0]    ?? null,
        wind_max_kmh:   d.wind_speed_10m_max?.[0]   ?? null,
        wind_gust_kmh:  d.wind_gusts_10m_max?.[0]   ?? null,
        weather_code:   code ?? null,
        conditions:     meta.label,
        raw_json:       payload,
      };
      snapshot.delay_risk = escalateRisk(meta.risk, {
        precip_mm:     snapshot.precip_mm     ?? 0,
        wind_max_kmh:  snapshot.wind_max_kmh  ?? 0,
        wind_gust_kmh: snapshot.wind_gust_kmh ?? 0,
        temp_min_c:    snapshot.temp_min_c    ?? 99,
      });

      // 4) Persist
      const { data: saved, error: insErr } = await supabaseAdmin
        .from('weather_logs')
        .upsert(snapshot, { onConflict: 'project_id,log_date' })
        .select()
        .single();
      if (insErr) throw new Error(insErr.message);

      return res.json({ success: true, data: saved, cached: false });
    } catch (err) {
      console.error('weather error:', err.message);
      return res.status(500).json({ success: false, error: err.message });
    }
  };
}

export default buildHandler;
