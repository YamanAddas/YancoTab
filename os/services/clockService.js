const CLOCK_STATE_KEY = "yancotabClockState";
const CLOCK_V2_STATE_KEY = "yancotab_clock_v2";
const CLOCK_V3_STATE_KEY = "yancotab_clock_v3";

export class ClockService {
  constructor() {
    this.stateKey = CLOCK_STATE_KEY;
    this.v2StateKey = CLOCK_V2_STATE_KEY;
    this.v3StateKey = CLOCK_V3_STATE_KEY;
    this.started = false;
    this.audioCtx = null;
    this.audioUnlocked = false;
    this.tickHandle = null;
    this.ringHandle = null;
    this.activeRing = null;
  }

  makeId(prefix = "clock") {
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  }

  readJson(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || "null");
    } catch (_) {
      return null;
    }
  }

  writeJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (_) {
      // ignore storage errors
    }
  }

  normalizeAlarmTime(value) {
    if (typeof value !== "string") return null;
    const parts = value.split(":");
    if (parts.length < 2) return null;
    const hours = parseInt(parts[0], 10);
    const mins = parseInt(parts[1], 10);
    if (!Number.isFinite(hours) || !Number.isFinite(mins)) return null;
    if (hours < 0 || hours > 23 || mins < 0 || mins > 59) return null;
    return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
  }

  normalizeDays(value) {
    if (!Array.isArray(value)) return [0, 1, 2, 3, 4, 5, 6];
    const set = new Set();
    value.forEach((day) => {
      const num = Number(day);
      if (Number.isFinite(num) && num >= 0 && num <= 6) set.add(num);
    });
    return Array.from(set.values()).sort((a, b) => a - b);
  }

  normalizeState(state) {
    const next = state && typeof state === "object" ? state : {};
    next.use24h = Boolean(next.use24h);
    next.expanded = Boolean(next.expanded);
    const allowedSkins = ["analog", "digital", "segment", "minimal"];
    const skin = typeof next.skin === "string" ? next.skin : "analog";
    next.skin = allowedSkins.includes(skin) ? skin : "analog";

    const worldClocks = Array.isArray(next.worldClocks) ? next.worldClocks : [];
    next.worldClocks = worldClocks
      .filter((entry) => entry && entry.tz)
      .map((entry) => ({
        id: entry.id || this.makeId("world"),
        label: entry.label || entry.tz.split("/").pop().replace(/_/g, " "),
        tz: entry.tz,
      }));

    const alarms = Array.isArray(next.alarms) ? next.alarms : [];
    next.alarms = alarms.map((alarm) => {
      const time = this.normalizeAlarmTime(alarm?.time) || "07:00";
      return {
        id: alarm?.id || this.makeId("alarm"),
        label: (alarm?.label || "Alarm").trim() || "Alarm",
        time,
        days: Array.isArray(alarm?.days) ? this.normalizeDays(alarm.days) : this.normalizeDays(null),
        enabled: alarm?.enabled !== false,
        lastFired: typeof alarm?.lastFired === "string" ? alarm.lastFired : null,
        snoozeMins: Number.isFinite(alarm?.snoozeMins) ? Math.max(1, Math.min(30, alarm.snoozeMins)) : 9,
        snoozedUntil: Number.isFinite(alarm?.snoozedUntil) ? alarm.snoozedUntil : null,
      };
    });

    const timer = next.timer && typeof next.timer === "object" ? next.timer : {};
    const duration = Number.isFinite(timer.durationSec) ? Math.max(1, timer.durationSec) : 300;
    const remaining = Number.isFinite(timer.remainingSec) ? Math.max(0, timer.remainingSec) : duration;
    next.timer = {
      durationSec: duration,
      remainingSec: remaining,
      running: Boolean(timer.running),
      endsAt: Number.isFinite(timer.endsAt) ? timer.endsAt : null,
    };
    if (next.timer.running && !next.timer.endsAt) {
      next.timer.endsAt = Date.now() + next.timer.remainingSec * 1000;
    }

    const stopwatch = next.stopwatch && typeof next.stopwatch === "object" ? next.stopwatch : {};
    next.stopwatch = {
      elapsedMs: Number.isFinite(stopwatch.elapsedMs) ? Math.max(0, stopwatch.elapsedMs) : 0,
      running: Boolean(stopwatch.running),
      lastStart: Number.isFinite(stopwatch.lastStart) ? stopwatch.lastStart : null,
      laps: Array.isArray(stopwatch.laps) ? stopwatch.laps.filter((lap) => Number.isFinite(lap) && lap >= 0) : [],
    };
    if (next.stopwatch.running && !next.stopwatch.lastStart) {
      next.stopwatch.lastStart = Date.now();
    }

    return next;
  }

  normalizeV2Alarm(alarm) {
    return {
      id: alarm?.id || this.makeId("alarm"),
      time: this.normalizeAlarmTime(alarm?.time) || "07:00",
      label: typeof alarm?.label === "string" && alarm.label.trim() ? alarm.label.trim() : "Alarm",
      enabled: alarm?.enabled !== false,
      days: this.normalizeDays(Array.isArray(alarm?.days) ? alarm.days : null),
      snoozeMins: Number.isFinite(Number(alarm?.snoozeMins)) ? Math.max(1, Math.min(30, Number(alarm.snoozeMins))) : 9,
      snoozedUntil: Number.isFinite(Number(alarm?.snoozedUntil)) ? Number(alarm.snoozedUntil) : null,
      lastTriggerKey: typeof alarm?.lastTriggerKey === "string" ? alarm.lastTriggerKey : "",
    };
  }

  normalizeV2State(state) {
    const next = state && typeof state === "object" ? state : {};
    next.use24h = Boolean(next.use24h);
    next.mainClockStyle = typeof next.mainClockStyle === "string" ? next.mainClockStyle : "digital";
    next.weatherFxEnabled = next.weatherFxEnabled !== false;
    next.weatherCode = Number.isFinite(next.weatherCode) ? next.weatherCode : null;
    next.sunTimes = next.sunTimes && typeof next.sunTimes === "object" ? next.sunTimes : null;
    next.alarmAudio = this.normalizeAlarmAudio(next.alarmAudio);

    const worldClocks = Array.isArray(next.worldClocks) ? next.worldClocks : [];
    next.worldClocks = worldClocks
      .filter((entry) => entry && entry.tz)
      .map((entry) => ({ label: entry.label || entry.tz, tz: entry.tz }));

    const alarms = Array.isArray(next.alarms) ? next.alarms : [];
    next.alarms = alarms.map((alarm) => this.normalizeV2Alarm(alarm));

    const stopwatch = next.stopwatch && typeof next.stopwatch === "object" ? next.stopwatch : {};
    next.stopwatch = {
      elapsed: Number.isFinite(stopwatch.elapsed) ? Math.max(0, stopwatch.elapsed) : 0,
      running: Boolean(stopwatch.running),
      laps: Array.isArray(stopwatch.laps) ? stopwatch.laps.filter((lap) => Number.isFinite(lap) && lap >= 0) : [],
      lastStart: Number.isFinite(stopwatch.lastStart) ? stopwatch.lastStart : null,
    };

    const timer = next.timer && typeof next.timer === "object" ? next.timer : {};
    next.timer = {
      duration: Number.isFinite(timer.duration) ? Math.max(1, timer.duration) : 300,
      remaining: Number.isFinite(timer.remaining) ? Math.max(0, timer.remaining) : 300,
      running: Boolean(timer.running),
      endsAt: Number.isFinite(timer.endsAt) ? timer.endsAt : null,
    };

    return next;
  }

  normalizeAlarmAudio(audio) {
    const tone = typeof audio?.tone === "string" ? audio.tone : "pulse";
    const volume = Number.isFinite(Number(audio?.volume)) ? Math.max(0.05, Math.min(1, Number(audio.volume))) : 0.45;
    const allowed = ["pulse", "chime", "soft"];
    return { tone: allowed.includes(tone) ? tone : "pulse", volume };
  }

  getLegacyWorldClocks() {
    const raw = localStorage.getItem("yancotabWorldClocks");
    if (!raw) return [];
    try {
      const list = JSON.parse(raw);
      return Array.isArray(list) ? list : [];
    } catch (_) {
      return [];
    }
  }

  getState() {
    const raw = localStorage.getItem(this.stateKey);
    if (raw) {
      try {
        const state = JSON.parse(raw);
        const normalized = this.normalizeState(state);
        const needsSave =
          (state?.timer?.running && !state?.timer?.endsAt && normalized.timer?.endsAt) ||
          (state?.stopwatch?.running && !state?.stopwatch?.lastStart && normalized.stopwatch?.lastStart) ||
          (Array.isArray(state?.worldClocks) && state.worldClocks.some((entry) => entry && !entry.id)) ||
          (Array.isArray(state?.alarms) && state.alarms.some((alarm) => alarm && !alarm.id));
        if (needsSave) this.saveState(normalized);
        return normalized;
      } catch (_) {
        // ignore parse errors
      }
    }
    const legacy = this.getLegacyWorldClocks();
    const state = this.normalizeState({
      use24h: false,
      expanded: false,
      skin: "analog",
      worldClocks: legacy,
      alarms: [],
      timer: { durationSec: 300, remainingSec: 300, running: false, endsAt: null },
      stopwatch: { elapsedMs: 0, running: false, lastStart: null, laps: [] },
    });
    this.saveState(state);
    return state;
  }

  saveState(state) {
    const normalized = this.normalizeState(state);
    localStorage.setItem(this.stateKey, JSON.stringify(normalized));
    localStorage.setItem("yancotabWorldClocks", JSON.stringify(normalized.worldClocks));
  }

  getV2State() {
    const parsedV3 = this.readJson(this.v3StateKey);
    if (parsedV3 && typeof parsedV3 === "object") {
      return this.normalizeV2State(parsedV3);
    }

    const parsedV2 = this.readJson(this.v2StateKey);
    if (!parsedV2 || typeof parsedV2 !== "object") return null;
    const normalized = this.normalizeV2State(parsedV2);
    this.writeJson(this.v3StateKey, normalized);
    return normalized;
  }

  saveV2State(state) {
    const normalized = this.normalizeV2State(state);
    this.writeJson(this.v3StateKey, normalized);
    this.writeJson(this.v2StateKey, normalized);
  }

  getTimerRemaining(state) {
    const timer = state?.timer;
    if (!timer) return 0;
    if (timer.running && timer.endsAt) return Math.max(0, Math.round((timer.endsAt - Date.now()) / 1000));
    return Math.max(0, Math.round(timer.remainingSec || 0));
  }

  getStopwatchElapsed(state) {
    const stopwatch = state?.stopwatch;
    if (!stopwatch) return 0;
    if (stopwatch.running && stopwatch.lastStart) return Math.max(0, stopwatch.elapsedMs + (Date.now() - stopwatch.lastStart));
    return Math.max(0, stopwatch.elapsedMs || 0);
  }

  getTimeZones() {
    if (typeof Intl !== "undefined" && typeof Intl.supportedValuesOf === "function") {
      return Intl.supportedValuesOf("timeZone");
    }
    return [
      "America/New_York",
      "America/Los_Angeles",
      "America/Chicago",
      "America/Denver",
      "Europe/London",
      "Europe/Paris",
      "Asia/Dubai",
      "Asia/Tokyo",
      "Asia/Singapore",
      "Australia/Sydney",
    ];
  }

  async searchTimeZones(term) {
    const query = term.trim();
    if (query.length < 2) return [];
    try {
      const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=6&language=en`;
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        const results = Array.isArray(data?.results) ? data.results : [];
        const mapped = results
          .filter((item) => item.timezone)
          .map((item) => {
            const parts = [item.name, item.admin1, item.country].filter(Boolean);
            return { label: parts.join(", "), tz: item.timezone };
          });
        if (mapped.length) return mapped;
      }
    } catch (_) {
      // ignore and fallback
    }
    const zones = this.getTimeZones();
    return zones
      .filter((tz) => tz.toLowerCase().includes(query.toLowerCase()))
      .slice(0, 6)
      .map((tz) => ({ label: tz.split("/").pop().replace(/_/g, " "), tz }));
  }

  bindAudioUnlock() {
    if (this.audioUnlocked) return;
    const unlock = () => {
      this.ensureAudio();
      if (this.audioCtx && this.audioCtx.state === "suspended") this.audioCtx.resume();
      this.audioUnlocked = true;
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
  }

  ensureAudio() {
    if (this.audioCtx) return this.audioCtx;
    try {
      this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (_) {
      this.audioCtx = null;
    }
    return this.audioCtx;
  }

  scheduleToneBurst(ctx, startAt, freq, duration, gainValue, type = "sine") {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, startAt);
    gain.gain.setValueAtTime(0, startAt);
    gain.gain.linearRampToValueAtTime(gainValue, startAt + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, startAt + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(startAt);
    osc.stop(startAt + duration + 0.02);
  }

  playAlarmSound(options = {}) {
    const ctx = this.ensureAudio();
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume();
    const tone = this.normalizeAlarmAudio(options).tone;
    const volume = this.normalizeAlarmAudio(options).volume;
    const baseTime = ctx.currentTime + 0.04;

    if (tone === "soft") {
      for (let i = 0; i < 3; i += 1) {
        this.scheduleToneBurst(ctx, baseTime + i * 0.82, 520 + i * 30, 0.52, 0.12 * volume, "sine");
      }
      return;
    }

    if (tone === "chime") {
      for (let i = 0; i < 3; i += 1) {
        const t = baseTime + i * 0.7;
        this.scheduleToneBurst(ctx, t, 660, 0.36, 0.14 * volume, "triangle");
        this.scheduleToneBurst(ctx, t + 0.12, 990, 0.34, 0.1 * volume, "triangle");
      }
      return;
    }

    for (let i = 0; i < 4; i += 1) {
      this.scheduleToneBurst(ctx, baseTime + i * 0.56, 860, 0.44, 0.2 * volume, "sine");
    }
  }

  emitRingState() {
    window.dispatchEvent(
      new CustomEvent("yancotab:alarmringstate", {
        detail: { ring: this.activeRing ? { ...this.activeRing } : null },
      })
    );
  }

  startRinging() {
    if (this.ringHandle) return;
    this.ringHandle = setInterval(() => {
      if (!this.activeRing) return;
      this.playAlarmSound({ tone: this.activeRing.tone, volume: this.activeRing.volume });
      if (navigator.vibrate) navigator.vibrate([120, 70, 120]);
    }, 4200);
  }

  stopRinging() {
    if (this.ringHandle) {
      clearInterval(this.ringHandle);
      this.ringHandle = null;
    }
    if (navigator.vibrate) navigator.vibrate(0);
  }

  getActiveRing() {
    return this.activeRing ? { ...this.activeRing } : null;
  }

  fireAlarm(alarm, source = "legacy") {
    const alarmId = alarm?.id || null;
    const ringKey = `${source}:${alarmId || alarm?.time || Date.now()}`;
    if (this.activeRing && this.activeRing.ringKey === ringKey) return;
    const audio = this.getRingAudioForSource(source, alarm);
    const ring = {
      ringKey,
      source,
      alarmId,
      label: alarm?.label || "Alarm",
      snoozeMins: Number.isFinite(Number(alarm?.snoozeMins)) ? Math.max(1, Number(alarm.snoozeMins)) : 9,
      tone: audio.tone,
      volume: audio.volume,
      firedAt: Date.now(),
    };
    this.activeRing = ring;
    window.dispatchEvent(new CustomEvent("yancotab:notify", { detail: { message: `Alarm: ${ring.label}` } }));
    window.dispatchEvent(new CustomEvent("yancotab:alarm", { detail: { alarm, source } }));
    this.playAlarmSound(audio);
    this.startRinging();
    this.emitRingState();
  }

  getRingAudioForSource(source, alarm) {
    const fallback = this.normalizeAlarmAudio({ tone: "pulse", volume: 0.45 });
    if (source !== "v2") return fallback;
    const state = this.getV2State();
    const stateAudio = this.normalizeAlarmAudio(state?.alarmAudio);
    const alarmAudio = this.normalizeAlarmAudio({
      tone: alarm?.tone || stateAudio.tone,
      volume: Number.isFinite(Number(alarm?.volume)) ? Number(alarm.volume) : stateAudio.volume,
    });
    return alarmAudio;
  }

  clearActiveRing() {
    if (!this.activeRing) return;
    this.activeRing = null;
    this.stopRinging();
    this.emitRingState();
  }

  dismissActiveAlarm() {
    if (!this.activeRing) return false;
    const label = this.activeRing.label;
    this.clearActiveRing();
    window.dispatchEvent(new CustomEvent("yancotab:notify", { detail: { message: `${label} dismissed` } }));
    return true;
  }

  snoozeActiveAlarm(minutesOverride) {
    if (!this.activeRing) return false;
    const ring = this.activeRing;
    const snoozeMins = Number.isFinite(Number(minutesOverride))
      ? Math.max(1, Math.min(30, Number(minutesOverride)))
      : Number.isFinite(Number(ring.snoozeMins))
        ? Math.max(1, Math.min(30, Number(ring.snoozeMins)))
        : 9;
    const snoozeUntil = Date.now() + snoozeMins * 60 * 1000;
    const updated = this.updateAlarmSnooze(ring.source, ring.alarmId, snoozeUntil, snoozeMins);
    const label = ring.label;
    this.clearActiveRing();
    if (updated) {
      window.dispatchEvent(new CustomEvent("yancotab:notify", { detail: { message: `${label} snoozed ${snoozeMins}m` } }));
    }
    return updated;
  }

  updateAlarmSnooze(source, alarmId, snoozeUntil, snoozeMins) {
    if (!alarmId) return false;
    if (source === "v2") {
      const state = this.getV2State();
      if (!state || !Array.isArray(state.alarms)) return false;
      let changed = false;
      state.alarms = state.alarms.map((alarm) => {
        const normalized = this.normalizeV2Alarm(alarm);
        if (normalized.id !== alarmId) return normalized;
        normalized.snoozedUntil = snoozeUntil;
        normalized.snoozeMins = snoozeMins;
        changed = true;
        return normalized;
      });
      if (changed) {
        this.saveV2State(state);
        window.dispatchEvent(new CustomEvent("yancotab:clockchange"));
      }
      return changed;
    }

    const state = this.getState();
    if (!Array.isArray(state.alarms)) return false;
    let changed = false;
    state.alarms = state.alarms.map((alarm) => {
      const next = { ...alarm };
      if (next.id !== alarmId) return next;
      next.snoozedUntil = snoozeUntil;
      next.snoozeMins = snoozeMins;
      changed = true;
      return next;
    });
    if (changed) {
      this.saveState(state);
      window.dispatchEvent(new CustomEvent("yancotab:clockchange"));
    }
    return changed;
  }

  fireTimerDone() {
    window.dispatchEvent(new CustomEvent("yancotab:notify", { detail: { message: "Timer complete" } }));
    window.dispatchEvent(new CustomEvent("yancotab:timerdone"));
    this.playAlarmSound();
  }

  tickLegacy(now) {
    const state = this.getState();
    let changed = false;

    if (state.timer?.running && state.timer.endsAt && state.timer.endsAt <= Date.now()) {
      state.timer.running = false;
      state.timer.remainingSec = 0;
      state.timer.endsAt = null;
      changed = true;
      this.fireTimerDone();
    }

    const hours = now.getHours();
    const minutes = now.getMinutes();
    const day = now.getDay();
    const minuteKey = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}-${hours}-${minutes}`;

    state.alarms.forEach((alarm) => {
      if (!alarm.enabled) return;
      const time = this.normalizeAlarmTime(alarm.time);
      if (!time) return;
      const [h, m] = time.split(":").map((num) => parseInt(num, 10));
      const days = Array.isArray(alarm.days) && alarm.days.length ? alarm.days : [0, 1, 2, 3, 4, 5, 6];

      if (Number.isFinite(alarm.snoozedUntil) && Date.now() >= alarm.snoozedUntil) {
        const snoozeKey = `${minuteKey}-snooze-${alarm.id}`;
        if (alarm.lastFired !== snoozeKey) {
          alarm.lastFired = snoozeKey;
          alarm.snoozedUntil = null;
          changed = true;
          this.fireAlarm(alarm, "legacy");
        }
        return;
      }
      if (Number.isFinite(alarm.snoozedUntil) && Date.now() < alarm.snoozedUntil) return;
      if (!days.includes(day)) return;
      if (h !== hours || m !== minutes) return;
      const key = `${minuteKey}-${alarm.id}`;
      if (alarm.lastFired === key) return;
      alarm.lastFired = key;
      changed = true;
      this.fireAlarm(alarm, "legacy");
    });

    if (changed) this.saveState(state);
    return changed;
  }

  tickV2(now) {
    const state = this.getV2State();
    if (!state || !Array.isArray(state.alarms)) return false;

    let changed = false;
    const day = now.getDay();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const minuteKey = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}-${hh}:${mm}`;

    state.alarms = state.alarms.map((alarm) => this.normalizeV2Alarm(alarm));
    state.alarms.forEach((alarm) => {
      if (!alarm.enabled) return;
      const days = Array.isArray(alarm.days) && alarm.days.length ? alarm.days : [0, 1, 2, 3, 4, 5, 6];
      if (Number.isFinite(alarm.snoozedUntil) && Date.now() >= alarm.snoozedUntil) {
        const snoozeKey = `${minuteKey}-snooze-${alarm.id}`;
        if (alarm.lastTriggerKey !== snoozeKey) {
          alarm.lastTriggerKey = snoozeKey;
          alarm.snoozedUntil = null;
          changed = true;
          this.fireAlarm(alarm, "v2");
        }
        return;
      }
      if (Number.isFinite(alarm.snoozedUntil) && Date.now() < alarm.snoozedUntil) return;
      if (!days.includes(day)) return;
      if (alarm.time !== `${hh}:${mm}`) return;
      const key = `${minuteKey}-${alarm.id}`;
      if (alarm.lastTriggerKey === key) return;
      alarm.lastTriggerKey = key;
      changed = true;
      this.fireAlarm(alarm, "v2");
    });

    if (changed) this.saveV2State(state);
    return changed;
  }

  tick() {
    const now = new Date();
    const changedLegacy = this.tickLegacy(now);
    const changedV2 = this.tickV2(now);
    if (changedLegacy || changedV2) {
      window.dispatchEvent(new CustomEvent("yancotab:clockchange"));
    }
    window.dispatchEvent(new CustomEvent("yancotab:clocktick"));
  }

  start() {
    if (this.started) return;
    this.started = true;
    this.bindAudioUnlock();
    this.tick();
    this.tickHandle = setInterval(() => this.tick(), 1000);
    this.emitRingState();
  }

  stop() {
    if (!this.started) return;
    this.started = false;
    if (this.tickHandle) {
      clearInterval(this.tickHandle);
      this.tickHandle = null;
    }
    this.stopRinging();
    this.clearActiveRing();
  }
}
