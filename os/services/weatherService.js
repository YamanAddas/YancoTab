const WEATHER_STATE_KEY = "yancotabWeatherState";
const WEATHER_CACHE_KEY = "yancotabWeatherCacheV2";

const AUTO_REFRESH_MINS = 15;

export class WeatherService {
  constructor() {
    this.stateKey = WEATHER_STATE_KEY;
    this.cacheKey = WEATHER_CACHE_KEY;
  }

  toNumber(value) {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  }

  normalizeCode(value) {
    const num = this.toNumber(value);
    return num === null ? null : Math.round(num);
  }

  normalizeNumberArray(values) {
    if (!Array.isArray(values)) {
      return values;
    }
    return values.map((value) => this.toNumber(value));
  }

  hasWeatherCode(forecast) {
    if (!forecast) {
      return false;
    }
    const currentCode = forecast.current?.weathercode;
    if (Number.isFinite(currentCode)) {
      return true;
    }
    const hourly = forecast.hourly?.weathercode;
    if (Array.isArray(hourly) && hourly.some((value) => Number.isFinite(Number(value)))) {
      return true;
    }
    const daily = forecast.daily?.weathercode;
    if (Array.isArray(daily) && daily.some((value) => Number.isFinite(Number(value)))) {
      return true;
    }
    return false;
  }

  makeId(prefix = "weather") {
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  }

  normalizeState(state) {
    const next = state && typeof state === "object" ? state : {};
    next.locations = Array.isArray(next.locations) ? next.locations : [];
    const seen = new Set();
    next.locations = next.locations
      .map((loc) => ({
        ...loc,
        id: loc.id || this.makeId("weather"),
      }))
      .filter((loc) => {
        const key = (loc.query || loc.label || "").trim().toLowerCase();
        if (!key) {
          return false;
        }
        if (seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      });
    if (next.currentLocation && typeof next.currentLocation === "object") {
      next.currentLocation = {
        label: next.currentLocation.label || "Current Location",
        query: next.currentLocation.query || "",
        lat: next.currentLocation.lat || null,
        lon: next.currentLocation.lon || null,
        id: next.currentLocation.id || this.makeId("weather"),
      };
    } else {
      const storedLat = localStorage.getItem("yancotabLat");
      const storedLon = localStorage.getItem("yancotabLon");
      const storedCity = localStorage.getItem("yancotabCityManual") || localStorage.getItem("yancotabCityAuto");
      if (storedLat && storedLon) {
        next.currentLocation = {
          label: storedCity || "Current Location",
          query: `${storedLat},${storedLon}`,
          lat: storedLat,
          lon: storedLon,
        };
      } else {
        next.currentLocation = null;
      }
    }
    next.unit = next.unit === "f" ? "f" : "c";
    next.expanded = Boolean(next.expanded);
    next.effectsEnabled = next.effectsEnabled !== false;
    next.refreshMins = AUTO_REFRESH_MINS;
    if (next.currentLocation) {
      const match = next.locations.find(
        (loc) => (loc.query || "").toLowerCase() === (next.currentLocation.query || "").toLowerCase()
      );
      if (match) {
        next.currentLocation.id = match.id;
      }
    }
    return next;
  }

  getState() {
    const raw = localStorage.getItem(this.stateKey);
    if (raw) {
      try {
        const state = JSON.parse(raw);
        return this.normalizeState(state);
      } catch (error) {
        // ignore parse errors
      }
    }

    const legacyAreas = this.getLegacyAreas();
    const legacyUnit = localStorage.getItem("yancotabTempUnit") === "f" ? "f" : "c";
    const legacyExpanded = localStorage.getItem("yancotabWeatherOpen") === "true";
    const state = {
      locations: Array.isArray(legacyAreas) ? legacyAreas.map((area) => ({
        id: this.makeId(),
        label: area.label,
        query: area.query,
        lat: area.lat || null,
        lon: area.lon || null,
      })) : [],
      unit: legacyUnit,
      expanded: legacyExpanded,
      effectsEnabled: true,
      refreshMins: AUTO_REFRESH_MINS,
    };
    this.saveState(state);
    return this.normalizeState(state);
  }

  saveState(state) {
    const normalized = this.normalizeState(state);
    localStorage.setItem(this.stateKey, JSON.stringify(normalized));
    localStorage.setItem("yancotabWeatherAreas", JSON.stringify(normalized.locations.map((loc) => ({
      label: loc.label,
      query: loc.query,
      lat: loc.lat || null,
      lon: loc.lon || null,
    }))));
    localStorage.setItem("yancotabTempUnit", normalized.unit);
    localStorage.setItem("yancotabWeatherOpen", normalized.expanded ? "true" : "false");
  }

  getLegacyAreas() {
    const raw = localStorage.getItem("yancotabWeatherAreas");
    if (raw) {
      try {
        const list = JSON.parse(raw);
        return Array.isArray(list) ? list : [];
      } catch (error) {
        return [];
      }
    }
    return [];
  }

  formatTemp(temp, unit = "c") {
    if (temp === null || temp === undefined || temp === "—") {
      return "—";
    }
    const c = Number(temp);
    if (Number.isNaN(c)) {
      return "—";
    }
    if (unit === "f") {
      const f = Math.round(c * 9 / 5 + 32);
      return `${f}°F`;
    }
    return `${Math.round(c)}°C`;
  }

  formatWind(speedKmh) {
    if (speedKmh === null || speedKmh === undefined) {
      return "—";
    }
    const speed = Number(speedKmh);
    if (Number.isNaN(speed)) {
      return "—";
    }
    return `${Math.round(speed)} km/h`;
  }

  getWeatherCondition(code) {
    const normalized = this.normalizeCode(code);
    if (normalized === 0) return "Clear";
    if (normalized === 1) return "Mostly Clear";
    if (normalized === 2) return "Partly Cloudy";
    if (normalized === 3) return "Overcast";
    if (normalized === 45 || normalized === 48) return "Fog";
    if ([51, 53, 55].includes(normalized)) return "Drizzle";
    if ([56, 57].includes(normalized)) return "Freezing Drizzle";
    if ([61, 63, 65].includes(normalized)) return "Rain";
    if ([66, 67].includes(normalized)) return "Freezing Rain";
    if ([71, 73, 75].includes(normalized)) return "Snow";
    if (normalized === 77) return "Snow Grains";
    if ([80, 81, 82].includes(normalized)) return "Rain Showers";
    if ([85, 86].includes(normalized)) return "Snow Showers";
    if ([95, 96, 99].includes(normalized)) return "Thunderstorm";
    return "Clear";
  }

  getIconSvg(code) {
    const stroke = "currentColor";
    const normalized = this.normalizeCode(code);
    if (normalized === null) {
      return this.weatherSvgSun(stroke);
    }
    if (normalized === 0) return this.weatherSvgSun(stroke);
    if ([1, 2].includes(normalized)) return this.weatherSvgSunCloud(stroke);
    if (normalized === 3) return this.weatherSvgCloud(stroke);
    if ([45, 48].includes(normalized)) return this.weatherSvgFog(stroke);
    if ([51, 53, 55, 56, 57].includes(normalized)) return this.weatherSvgDrizzle(stroke);
    if ([61, 63, 65, 66, 67, 80, 81, 82].includes(normalized)) return this.weatherSvgRain(stroke);
    if ([71, 73, 75, 77, 85, 86].includes(normalized)) return this.weatherSvgSnow(stroke);
    if ([95, 96, 99].includes(normalized)) return this.weatherSvgStorm(stroke);
    return this.weatherSvgSun(stroke);
  }

  weatherSvgSun(stroke) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="M4.9 4.9l1.4 1.4"/><path d="M17.7 17.7l1.4 1.4"/><path d="M4.9 19.1l1.4-1.4"/><path d="M17.7 6.3l1.4-1.4"/></svg>`;
  }

  weatherSvgSunCloud(stroke) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="7" cy="7" r="3"/><path d="M7 1v2"/><path d="M1 7h2"/><path d="M11 7h2"/><path d="M4.2 4.2l1.2 1.2"/><path d="M9.6 9.6l1.2 1.2"/><path d="M6 18h9a4 4 0 0 0 0-8 5.5 5.5 0 0 0-10.5 2"/></svg>`;
  }

  weatherSvgCloud(stroke) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 18h11a4 4 0 0 0 0-8 5.5 5.5 0 0 0-10.5 2"/></svg>`;
  }

  weatherSvgFog(stroke) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 12h12"/><path d="M4 16h16"/><path d="M7 8h10"/></svg>`;
  }

  weatherSvgDrizzle(stroke) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 16l-1 2"/><path d="M12 16l-1 2"/><path d="M18 16l-1 2"/><path d="M6 14h11a4 4 0 0 0 0-8 5.5 5.5 0 0 0-10.5 2"/></svg>`;
  }

  weatherSvgRain(stroke) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M7 16l-2 4"/><path d="M12 16l-2 4"/><path d="M17 16l-2 4"/><path d="M6 14h11a4 4 0 0 0 0-8 5.5 5.5 0 0 0-10.5 2"/></svg>`;
  }

  weatherSvgSnow(stroke) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 14h11a4 4 0 0 0 0-8 5.5 5.5 0 0 0-10.5 2"/><path d="M8 18h.01"/><path d="M12 20h.01"/><path d="M16 18h.01"/></svg>`;
  }

  weatherSvgStorm(stroke) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 14h11a4 4 0 0 0 0-8 5.5 5.5 0 0 0-10.5 2"/><path d="M11 16l-2 4h3l-1 3"/><path d="M16 16l-1 2"/></svg>`;
  }

  normalizeSearchText(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
  }

  scoreSearchResult(item, queryNorm) {
    const name = this.normalizeSearchText(item?.name);
    const admin = this.normalizeSearchText(item?.admin1);
    const country = this.normalizeSearchText(item?.country);
    const timezone = this.normalizeSearchText(item?.timezone);
    let score = 0;

    if (name === queryNorm) score += 120;
    else if (name.startsWith(queryNorm)) score += 90;
    else if (name.includes(queryNorm)) score += 55;

    if (admin === queryNorm) score += 40;
    else if (admin.startsWith(queryNorm)) score += 24;
    else if (admin.includes(queryNorm)) score += 12;

    if (country === queryNorm) score += 24;
    else if (country.startsWith(queryNorm)) score += 14;
    else if (country.includes(queryNorm)) score += 8;

    if (timezone.includes(queryNorm)) score += 6;

    const population = this.toNumber(item?.population) || 0;
    score += Math.min(18, Math.round(Math.log10(Math.max(population, 1)) * 3));
    return score;
  }

  async searchLocations(term) {
    const query = term.trim();
    if (query.length < 2) {
      return [];
    }
    try {
      const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=20&language=en`;
      const response = await fetch(url);
      if (!response.ok) {
        return [];
      }
      const data = await response.json();
      const results = Array.isArray(data?.results) ? data.results : [];
      const qNorm = this.normalizeSearchText(query);
      const mapped = results.map((item) => {
        const parts = [item.name, item.admin1, item.country].filter(Boolean);
        const label = parts.join(", ");
        return {
          label,
          query: label,
          lat: item.latitude,
          lon: item.longitude,
          timezone: item.timezone,
          score: this.scoreSearchResult(item, qNorm),
        };
      });
      const seen = new Set();
      const deduped = mapped.filter((item) => {
        const key = this.normalizeSearchText(item.label);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      deduped.sort((a, b) => {
        if ((b.score || 0) !== (a.score || 0)) return (b.score || 0) - (a.score || 0);
        return String(a.label || "").localeCompare(String(b.label || ""));
      });
      return deduped.slice(0, 8).map(({ score, ...item }) => item);
    } catch (error) {
      return [];
    }
  }

  async geocodeCity(city) {
    if (!city) {
      return null;
    }
    const query = city.trim();
    try {
      const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=en`;
      const response = await fetch(url);
      if (!response.ok) {
        return null;
      }
      const data = await response.json();
      const result = data?.results?.[0];
      if (!result) {
        return null;
      }
      return { lat: result.latitude, lon: result.longitude, timezone: result.timezone };
    } catch (error) {
      return null;
    }
  }

  async reverseGeocode(lat, lon) {
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`;
      const response = await fetch(url, { headers: { "Accept": "application/json" } });
      if (!response.ok) {
        return null;
      }
      const data = await response.json();
      const address = data?.address || {};
      const label =
        address.city ||
        address.town ||
        address.village ||
        address.state ||
        data?.display_name;
      return label ? String(label) : null;
    } catch (error) {
      return null;
    }
  }

  async resolveCoords(location, state) {
    if (!location) {
      return null;
    }
    const label = location.label || location.query || "Unknown";
    const query = location.query || location.label || "";
    if (!query) {
      return { label, query: "", lat: null, lon: null };
    }
    let lat = location.lat || null;
    let lon = location.lon || null;
    if ((!lat || !lon) && query.includes(",")) {
      const [latStr, lonStr] = query.split(",").map((part) => part.trim());
      if (!Number.isNaN(parseFloat(latStr)) && !Number.isNaN(parseFloat(lonStr))) {
        lat = latStr;
        lon = lonStr;
      }
    }

    if (!lat || !lon) {
      const geo = await this.geocodeCity(query);
      if (geo) {
        lat = geo.lat;
        lon = geo.lon;
        location.lat = lat;
        location.lon = lon;
        if (state) {
          this.saveState(state);
        }
      }
    }

    if (!lat || !lon) {
      return { label, query, lat: null, lon: null };
    }

    return { label, query, lat, lon };
  }

  getCache(query, maxAge) {
    const raw = localStorage.getItem(this.cacheKey);
    if (!raw) {
      return null;
    }
    try {
      const cache = JSON.parse(raw);
      const entry = cache[query];
      if (!entry) {
        return null;
      }
      const age = Date.now() - entry.ts;
      const maxAgeMs = typeof maxAge === "number" ? maxAge : 1000 * 60 * 15;
      if (age > maxAgeMs) {
        return null;
      }
      return entry.data;
    } catch (error) {
      return null;
    }
  }

  setCache(query, data) {
    const raw = localStorage.getItem(this.cacheKey);
    let cache = {};
    if (raw) {
      try {
        cache = JSON.parse(raw);
      } catch (error) {
        cache = {};
      }
    }
    cache[query] = { ts: Date.now(), data };
    localStorage.setItem(this.cacheKey, JSON.stringify(cache));
  }

  async fetchForecast(lat, lon) {
    const attempt = async (params) => {
      const url = `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
      const response = await fetch(url);
      if (!response.ok) {
        return null;
      }
      return response.json();
    };

    try {
      const fullParams = new URLSearchParams({
        latitude: String(lat),
        longitude: String(lon),
        current: [
          "temperature_2m",
          "apparent_temperature",
          "weather_code",
          "wind_speed_10m",
          "wind_direction_10m",
        ].join(","),
        hourly: [
          "temperature_2m",
          "apparent_temperature",
          "precipitation_probability",
          "weather_code",
          "relative_humidity_2m",
          "dew_point_2m",
          "surface_pressure",
          "visibility",
          "wind_speed_10m",
          "wind_direction_10m",
          "uv_index",
        ].join(","),
        daily: [
          "temperature_2m_max",
          "temperature_2m_min",
          "weather_code",
          "precipitation_probability_max",
          "sunrise",
          "sunset",
          "uv_index_max",
          "wind_speed_10m_max",
          "wind_direction_10m_dominant",
        ].join(","),
        timezone: "auto",
        forecast_days: "10",
      });

      const fullData = await attempt(fullParams);
      if (fullData) {
        return fullData;
      }

      const fallbackParams = new URLSearchParams({
        latitude: String(lat),
        longitude: String(lon),
        current_weather: "true",
        hourly: [
          "temperature_2m",
          "apparent_temperature",
          "precipitation_probability",
          "weathercode",
          "relativehumidity_2m",
          "dewpoint_2m",
          "pressure_msl",
          "windspeed_10m",
        ].join(","),
        daily: [
          "temperature_2m_max",
          "temperature_2m_min",
          "weathercode",
          "precipitation_probability_max",
          "sunrise",
          "sunset",
        ].join(","),
        timezone: "auto",
        forecast_days: "7",
      });
      return attempt(fallbackParams);
    } catch (error) {
      return null;
    }
  }

  buildForecast(raw) {
    if (!raw) {
      return null;
    }
    const currentRaw = raw.current || raw.current_weather || {};
    const hourly = { ...(raw.hourly || {}) };
    const daily = { ...(raw.daily || {}) };

    if (hourly.weathercode == null && hourly.weather_code != null) {
      hourly.weathercode = hourly.weather_code;
    }
    if (hourly.relativehumidity_2m == null && hourly.relative_humidity_2m != null) {
      hourly.relativehumidity_2m = hourly.relative_humidity_2m;
    }
    if (hourly.dew_point_2m == null && hourly.dewpoint_2m != null) {
      hourly.dew_point_2m = hourly.dewpoint_2m;
    }
    if (hourly.surface_pressure == null && hourly.pressure_msl != null) {
      hourly.surface_pressure = hourly.pressure_msl;
    }
    if (hourly.windspeed_10m == null && hourly.wind_speed_10m != null) {
      hourly.windspeed_10m = hourly.wind_speed_10m;
    }
    if (hourly.winddirection_10m == null && hourly.wind_direction_10m != null) {
      hourly.winddirection_10m = hourly.wind_direction_10m;
    }

    if (daily.weathercode == null && daily.weather_code != null) {
      daily.weathercode = daily.weather_code;
    }
    if (daily.windspeed_10m_max == null && daily.wind_speed_10m_max != null) {
      daily.windspeed_10m_max = daily.wind_speed_10m_max;
    }
    if (daily.winddirection_10m_dominant == null && daily.wind_direction_10m_dominant != null) {
      daily.winddirection_10m_dominant = daily.wind_direction_10m_dominant;
    }

    hourly.weathercode = this.normalizeNumberArray(hourly.weathercode);
    daily.weathercode = this.normalizeNumberArray(daily.weathercode);

    const currentTemp = this.toNumber(currentRaw.temperature ?? currentRaw.temperature_2m);
    const currentWind = this.toNumber(currentRaw.windspeed ?? currentRaw.wind_speed_10m);
    const currentDir = this.toNumber(currentRaw.winddirection ?? currentRaw.wind_direction_10m);
    let currentCode = this.normalizeCode(currentRaw.weathercode ?? currentRaw.weather_code);
    if (currentCode == null) {
      const hourlyCode = Array.isArray(hourly.weathercode) ? hourly.weathercode[0] : null;
      const dailyCode = Array.isArray(daily.weathercode) ? daily.weathercode[0] : null;
      currentCode = this.normalizeCode(hourlyCode ?? dailyCode);
    }
    return {
      updatedAt: Date.now(),
      timezone: raw.timezone,
      current: {
        time: currentRaw.time || raw.current_weather?.time || raw.current?.time || null,
        temperature: currentTemp,
        windspeed: currentWind,
        winddirection: currentDir,
        weathercode: currentCode,
      },
      hourly,
      daily,
    };
  }

  async getForecastForLocation(location, state) {
    if (!location) {
      return null;
    }
    const resolved = await this.resolveCoords(location, state);
    const label = resolved?.label || location.label || location.query || "Unknown";
    const query = resolved?.query || location.query || location.label || "";
    if (!query) {
      return { label, forecast: null };
    }
    const maxAge = (state?.refreshMins || 30) * 60 * 1000;
    const cached = this.getCache(query, maxAge);
    const cachedHasCode = cached && this.hasWeatherCode(cached);
    if (cachedHasCode) {
      return { label, forecast: cached };
    }

    if (!resolved?.lat || !resolved?.lon) {
      return { label, forecast: null };
    }

    const raw = await this.fetchForecast(resolved.lat, resolved.lon);
    const forecast = this.buildForecast(raw);
    if (!forecast) {
      return { label, forecast: cached || null };
    }
    this.setCache(query, forecast);
    return { label, forecast };
  }

  async fetchAirQuality(lat, lon) {
    try {
      const params = new URLSearchParams({
        latitude: String(lat),
        longitude: String(lon),
        current: [
          "us_aqi",
          "european_aqi",
          "pm2_5",
          "pm10",
          "ozone",
          "nitrogen_dioxide",
          "carbon_monoxide",
          "sulphur_dioxide",
        ].join(","),
        timezone: "auto",
      });
      const url = `https://air-quality-api.open-meteo.com/v1/air-quality?${params.toString()}`;
      const response = await fetch(url);
      if (!response.ok) {
        return null;
      }
      return response.json();
    } catch (error) {
      return null;
    }
  }

  buildAirQuality(raw) {
    if (!raw) {
      return null;
    }
    const current = raw.current || {};
    return {
      updatedAt: Date.now(),
      timezone: raw.timezone,
      current: {
        time: current.time || null,
        us_aqi: this.toNumber(current.us_aqi),
        european_aqi: this.toNumber(current.european_aqi),
        pm2_5: this.toNumber(current.pm2_5),
        pm10: this.toNumber(current.pm10),
        ozone: this.toNumber(current.ozone),
        nitrogen_dioxide: this.toNumber(current.nitrogen_dioxide),
        carbon_monoxide: this.toNumber(current.carbon_monoxide),
        sulphur_dioxide: this.toNumber(current.sulphur_dioxide),
      },
    };
  }

  async getAirQualityForLocation(location, state) {
    if (!location) {
      return null;
    }
    const resolved = await this.resolveCoords(location, state);
    const label = resolved?.label || location.label || location.query || "Unknown";
    if (!resolved?.lat || !resolved?.lon) {
      return { label, airQuality: null };
    }
    const maxAge = (state?.refreshMins || 30) * 60 * 1000;
    const cacheKey = `air:${resolved.lat},${resolved.lon}`;
    const cached = this.getCache(cacheKey, maxAge);
    if (cached) {
      return { label, airQuality: cached };
    }
    const raw = await this.fetchAirQuality(resolved.lat, resolved.lon);
    const airQuality = this.buildAirQuality(raw);
    if (airQuality) {
      this.setCache(cacheKey, airQuality);
    }
    return { label, airQuality };
  }

  async fetchAlerts(lat, lon) {
    try {
      const url = `https://api.weather.gov/alerts/active?point=${encodeURIComponent(lat)},${encodeURIComponent(lon)}`;
      const response = await fetch(url, {
        headers: {
          Accept: "application/geo+json",
          "User-Agent": "YancoTab Weather (local app)",
        },
      });
      if (!response.ok) {
        return null;
      }
      return response.json();
    } catch (error) {
      return null;
    }
  }

  buildAlerts(raw) {
    if (!raw) {
      return null;
    }
    const features = Array.isArray(raw.features) ? raw.features : [];
    const alerts = features.map((feature) => {
      const props = feature?.properties || {};
      return {
        id: props.id || feature?.id || props.event || "alert",
        event: props.event || null,
        severity: props.severity || null,
        urgency: props.urgency || null,
        certainty: props.certainty || null,
        headline: props.headline || null,
        description: props.description || null,
        instruction: props.instruction || null,
        area: props.areaDesc || null,
        sender: props.senderName || props.sender || null,
        effective: props.effective || null,
        ends: props.ends || null,
      };
    });
    return {
      updatedAt: Date.now(),
      alerts,
    };
  }

  async getAlertsForLocation(location, state) {
    if (!location) {
      return null;
    }
    const resolved = await this.resolveCoords(location, state);
    const label = resolved?.label || location.label || location.query || "Unknown";
    if (!resolved?.lat || !resolved?.lon) {
      return { label, alerts: null };
    }
    const maxAge = Math.min((state?.refreshMins || 30) * 60 * 1000, 30 * 60 * 1000);
    const cacheKey = `alerts:${resolved.lat},${resolved.lon}`;
    const cached = this.getCache(cacheKey, maxAge);
    if (cached) {
      return { label, alerts: cached };
    }
    const raw = await this.fetchAlerts(resolved.lat, resolved.lon);
    const alerts = this.buildAlerts(raw);
    if (alerts) {
      this.setCache(cacheKey, alerts);
    }
    return { label, alerts };
  }
}
