import React, { createContext, useContext, useCallback, useEffect, useRef, useState, useMemo } from "react";
import {
  AUDIO_REGISTRY,
  AmbientId,
  SfxSectionKey,
  PLAYER_SKILL_NAME_TO_SFX,
  MONSTER_SKILL_NAME_TO_SFX,
  WEAPON_SFX,
  WEAPON_CATEGORY_MAP,
  WeaponCategory,
  MONSTER_HIT_SFX,
} from "@/lib/audioRegistry";

const STORAGE_KEY = "idlethrone_audio_settings";
const SETTINGS_VERSION = 3;
const MAX_CACHED_BUFFERS = 60;
const MAX_ACTIVE_SOURCES = 8;

const AUDIO_DEBUG = false;
const AUDIO_KILL_SWITCH = false;

const _dbg = {
  contextCreations: 0,
  totalSourcesCreated: 0,
  totalSourcesEnded: 0,
  totalDecodesCalled: 0,
  decodedFiles: new Set<string>(),
  duplicateDecodes: [] as string[],
  activeSourceIds: new Set<number>(),
  nextSourceId: 0,
  playCallCount: 0,
  playThrottledCount: 0,
  playMaxActiveCount: 0,
  playNoGainCount: 0,
  playBufferCallCount: 0,
  htmlAudioCreations: 0,
  musicElCount: 0,
  ambientElCount: 0,
  providerMountCount: 0,
  engineCreations: 0,
  peakActive: 0,
  lastFrameTime: performance.now(),
  longFrames: [] as { dt: number; ts: number }[],
  intervalId: null as ReturnType<typeof setInterval> | null,
  rafId: 0,
};

function _startDebugLoop() {
  if (_dbg.intervalId) return;

  _dbg.intervalId = setInterval(() => {
    const mem = (performance as any).memory;
    const memStr = mem
      ? `heap=${(mem.usedJSHeapSize / 1048576).toFixed(1)}MB / ${(mem.totalJSHeapSize / 1048576).toFixed(1)}MB (limit=${(mem.jsHeapSizeLimit / 1048576).toFixed(0)}MB)`
      : 'N/A (use Chrome)';

    const musicEls = document.querySelectorAll('audio');
    let playingAudioEls = 0;
    musicEls.forEach(el => { if (!el.paused) playingAudioEls++; });

    console.log(
      `%c[AudioDebug 2s]` +
      ` active=${_dbg.activeSourceIds.size}` +
      ` peak=${_dbg.peakActive}` +
      ` created=${_dbg.totalSourcesCreated}` +
      ` ended=${_dbg.totalSourcesEnded}` +
      ` LEAK=${_dbg.totalSourcesCreated - _dbg.totalSourcesEnded}` +
      ` | decodes=${_dbg.totalDecodesCalled} (unique=${_dbg.decodedFiles.size})` +
      ` dupDecodes=${_dbg.duplicateDecodes.length}` +
      ` | ctxCreations=${_dbg.contextCreations}` +
      ` | htmlAudioPlaying=${playingAudioEls}/${musicEls.length}` +
      ` | play()=${_dbg.playCallCount} throttled=${_dbg.playThrottledCount} maxActive=${_dbg.playMaxActiveCount} noGain=${_dbg.playNoGainCount}` +
      ` | mem=${memStr}` +
      ` | longFrames(>50ms)=${_dbg.longFrames.length}`,
      'color: #00bcd4; font-weight: bold'
    );

    if (_dbg.longFrames.length > 0) {
      console.log(
        `%c[AudioDebug] LONG FRAMES:`,
        'color: #ff5722; font-weight: bold',
        _dbg.longFrames.map(f => `${f.dt.toFixed(1)}ms`).join(', ')
      );
      _dbg.longFrames = [];
    }

    if (_dbg.duplicateDecodes.length > 0) {
      console.warn(
        `[AudioDebug] DUPLICATE decodeAudioData calls:`,
        _dbg.duplicateDecodes
      );
    }

    if (_dbg.totalSourcesCreated - _dbg.totalSourcesEnded > MAX_ACTIVE_SOURCES + 2) {
      console.error(
        `[AudioDebug] NODE LEAK DETECTED! created=${_dbg.totalSourcesCreated} ended=${_dbg.totalSourcesEnded} diff=${_dbg.totalSourcesCreated - _dbg.totalSourcesEnded}`
      );
    }

    _dbg.peakActive = _dbg.activeSourceIds.size;
  }, 2000);

  function frameCheck() {
    const now = performance.now();
    const dt = now - _dbg.lastFrameTime;
    if (dt > 50) {
      _dbg.longFrames.push({ dt, ts: now });
    }
    _dbg.lastFrameTime = now;
    _dbg.rafId = requestAnimationFrame(frameCheck);
  }
  _dbg.rafId = requestAnimationFrame(frameCheck);
}

interface AudioSettings {
  musicEnabled: boolean;
  musicVolume: number;
  ambientEnabled: boolean;
  ambientVolume: number;
  sfxEnabled: boolean;
  sfxVolume: number;
}

const DEFAULT_SETTINGS: AudioSettings = {
  musicEnabled: true,   musicVolume:   0.20,
  ambientEnabled: true, ambientVolume: 0.25,
  sfxEnabled: true,     sfxVolume:     0.75,
};

function loadSettings(): AudioSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if ((parsed.version ?? 1) < SETTINGS_VERSION) {
        return { ...DEFAULT_SETTINGS };
      }
      return {
        musicEnabled:   parsed.musicEnabled   ?? DEFAULT_SETTINGS.musicEnabled,
        musicVolume:    parsed.musicVolume    ?? DEFAULT_SETTINGS.musicVolume,
        ambientEnabled: parsed.ambientEnabled ?? DEFAULT_SETTINGS.ambientEnabled,
        ambientVolume:  parsed.ambientVolume  ?? DEFAULT_SETTINGS.ambientVolume,
        sfxEnabled:     parsed.sfxEnabled     ?? DEFAULT_SETTINGS.sfxEnabled,
        sfxVolume:      parsed.sfxVolume      ?? DEFAULT_SETTINGS.sfxVolume,
      };
    }
  } catch {}
  return { ...DEFAULT_SETTINGS };
}

function saveSettings(s: AudioSettings) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...s, version: SETTINGS_VERSION })); } catch {}
}

export type SfxCategory = SfxSectionKey;

export interface AudioContextType {
  settings: AudioSettings;
  setMusicEnabled: (v: boolean) => void;
  setMusicVolume: (v: number) => void;
  setAmbientEnabled: (v: boolean) => void;
  setAmbientVolume: (v: number) => void;
  setSfxEnabled: (v: boolean) => void;
  setSfxVolume: (v: number) => void;
  playThemeMusic: () => void;
  stopMusic: () => void;
  playAmbient: (skillId: AmbientId) => void;
  stopAmbient: () => void;
  playSfx: (category: SfxCategory, id: string) => void;
  playWeaponSfx: (weaponCategory: string | null | undefined) => void;
  playMonsterHitSfx: () => void;
  playPlayerSkillSfx: (skillName: string) => void;
  playMonsterSkillSfx: (skillName: string) => void;
  preloadCombatSounds: (weaponCategory: string | null | undefined) => void;
  unlockAudio: () => void;
}

const AudioCtx = createContext<AudioContextType | undefined>(undefined);

let globalPlaySfx: ((category: SfxCategory, id: string) => void) | null = null;
let globalPlayWeaponSfx: ((weaponCategory: string | null | undefined) => void) | null = null;
let globalPlayMonsterHitSfx: (() => void) | null = null;
let globalPlayPlayerSkillSfx: ((skillName: string) => void) | null = null;
let globalPlayMonsterSkillSfx: ((skillName: string) => void) | null = null;

export function getPlaySfx(): ((category: SfxCategory, id: string) => void) | null {
  return globalPlaySfx;
}
export function getPlayWeaponSfx(): ((weaponCategory: string | null | undefined) => void) | null {
  return globalPlayWeaponSfx;
}
export function getPlayMonsterHitSfx(): (() => void) | null {
  return globalPlayMonsterHitSfx;
}
export function getPlayPlayerSkillSfx(): ((skillName: string) => void) | null {
  return globalPlayPlayerSkillSfx;
}
export function getPlayMonsterSkillSfx(): ((skillName: string) => void) | null {
  return globalPlayMonsterSkillSfx;
}

function getSfxEntry(category: SfxCategory, id: string): { src: string; volume: number } | undefined {
  const section = AUDIO_REGISTRY.sfx[category];
  if (!section) return undefined;
  return (section as Record<string, { src: string; volume: number }>)[id];
}

function getAmbientEntry(ambientId: string): { src: string; volume: number } | undefined {
  return (AUDIO_REGISTRY.ambient as Record<string, { src: string; volume: number }>)[ambientId];
}

interface PooledGain {
  gain: GainNode;
  busy: boolean;
}

class WebAudioSfxEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private bufferCache = new Map<string, AudioBuffer>();
  private loadingPromises = new Map<string, Promise<AudioBuffer | null>>();
  private activeCount = 0;
  private gainPool: PooledGain[] = [];
  private contextReady = false;

  constructor() {
    if (AUDIO_DEBUG) {
      _dbg.engineCreations++;
      console.log(`%c[AudioDebug] WebAudioSfxEngine created (total=${_dbg.engineCreations})`, 'color: #9c27b0');
    }
  }

  private initContext(): boolean {
    if (this.contextReady && this.ctx && this.ctx.state !== 'closed') return true;
    try {
      if (!this.ctx || this.ctx.state === 'closed') {
        this.ctx = new AudioContext();
        this.masterGain = this.ctx.createGain();
        this.masterGain.connect(this.ctx.destination);
        this.gainPool = [];
        for (let i = 0; i < MAX_ACTIVE_SOURCES; i++) {
          const g = this.ctx.createGain();
          g.connect(this.masterGain);
          this.gainPool.push({ gain: g, busy: false });
        }
        if (AUDIO_DEBUG) {
          _dbg.contextCreations++;
          console.log(
            `%c[AudioDebug] NEW AudioContext created (#${_dbg.contextCreations}) sampleRate=${this.ctx.sampleRate} state=${this.ctx.state}`,
            'color: #e91e63; font-weight: bold'
          );
          if (_dbg.contextCreations > 1) {
            console.error(`[AudioDebug] MULTIPLE AudioContext instances! This is a problem.`);
          }
        }
      }
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      this.contextReady = true;
      return true;
    } catch {
      return false;
    }
  }

  private getAvailableGain(): PooledGain | null {
    for (const pg of this.gainPool) {
      if (!pg.busy) return pg;
    }
    return null;
  }

  private loadBuffer(src: string): Promise<AudioBuffer | null> {
    if (this.bufferCache.has(src)) return Promise.resolve(this.bufferCache.get(src)!);
    const existing = this.loadingPromises.get(src);
    if (existing) return existing;
    const promise = this.doLoadBuffer(src);
    this.loadingPromises.set(src, promise);
    promise.finally(() => { this.loadingPromises.delete(src); });
    return promise;
  }

  private async doLoadBuffer(src: string): Promise<AudioBuffer | null> {
    try {
      const res = await fetch(src);
      if (!res.ok) return null;
      const ab = await res.arrayBuffer();
      if (!this.initContext()) return null;

      if (AUDIO_DEBUG) {
        _dbg.totalDecodesCalled++;
        const shortSrc = src.split('/').slice(-2).join('/');
        if (_dbg.decodedFiles.has(src)) {
          _dbg.duplicateDecodes.push(shortSrc);
          console.warn(
            `%c[AudioDebug] DUPLICATE decodeAudioData for "${shortSrc}" (total decodes=${_dbg.totalDecodesCalled})`,
            'color: #ff9800; font-weight: bold'
          );
        } else {
          console.log(
            `[AudioDebug] decodeAudioData "${shortSrc}" size=${(ab.byteLength / 1024).toFixed(1)}KB (decode #${_dbg.totalDecodesCalled})`,
          );
        }
        _dbg.decodedFiles.add(src);
      }

      const buf = await this.ctx!.decodeAudioData(ab);
      if (this.bufferCache.size >= MAX_CACHED_BUFFERS) {
        const firstKey = this.bufferCache.keys().next().value;
        if (firstKey) {
          this.bufferCache.delete(firstKey);
          if (AUDIO_DEBUG) {
            const evictedShort = firstKey.split('/').slice(-2).join('/');
            console.log(`[AudioDebug] Cache EVICT "${evictedShort}" (cache was full at ${MAX_CACHED_BUFFERS})`);
          }
        }
      }
      this.bufferCache.set(src, buf);
      return buf;
    } catch {
      return null;
    }
  }

  play(src: string, baseVolume: number, userVolumeScale: number) {
    if (AUDIO_DEBUG) _dbg.playCallCount++;

    if (this.activeCount >= MAX_ACTIVE_SOURCES) {
      if (AUDIO_DEBUG) _dbg.playMaxActiveCount++;
      return;
    }

    const cached = this.bufferCache.get(src);
    if (cached) {
      this.playBuffer(cached, baseVolume * userVolumeScale);
    } else {
      if (AUDIO_DEBUG) {
        const shortSrc = src.split('/').slice(-2).join('/');
        console.log(`[AudioDebug] Cache MISS for "${shortSrc}" — will fetch+decode`);
      }
      this.loadBuffer(src).then(buf => {
        if (buf && this.activeCount < MAX_ACTIVE_SOURCES) {
          this.playBuffer(buf, baseVolume * userVolumeScale);
        }
      });
    }
  }

  private playBuffer(buffer: AudioBuffer, volume: number) {
    if (!this.initContext() || !this.ctx) return;

    const pg = this.getAvailableGain();
    if (!pg) {
      if (AUDIO_DEBUG) {
        _dbg.playNoGainCount++;
        console.warn(
          `[AudioDebug] No available GainNode! Pool status:`,
          this.gainPool.map((p, i) => `slot${i}=${p.busy ? 'BUSY' : 'free'}`).join(' ')
        );
      }
      return;
    }

    try {
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      pg.gain.gain.value = Math.max(0, Math.min(1, volume));
      pg.busy = true;
      this.activeCount++;

      if (AUDIO_DEBUG) {
        _dbg.totalSourcesCreated++;
        _dbg.playBufferCallCount++;
        const sid = _dbg.nextSourceId++;
        _dbg.activeSourceIds.add(sid);
        if (_dbg.activeSourceIds.size > _dbg.peakActive) {
          _dbg.peakActive = _dbg.activeSourceIds.size;
        }

        source.onended = () => {
          source.disconnect();
          pg.busy = false;
          this.activeCount--;
          _dbg.totalSourcesEnded++;
          _dbg.activeSourceIds.delete(sid);
        };
      } else {
        source.onended = () => {
          source.disconnect();
          pg.busy = false;
          this.activeCount--;
        };
      }

      source.connect(pg.gain);
      source.start(0);
    } catch {
      pg.busy = false;
    }
  }

  preload(srcs: string[]) {
    this.initContext();
    for (const src of srcs) {
      if (!this.bufferCache.has(src) && !this.loadingPromises.has(src)) {
        this.loadBuffer(src);
      }
    }
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  ensureReady(): boolean {
    return this.initContext();
  }

  getCtx(): AudioContext | null {
    return this.ctx;
  }

  async fetchBuffer(src: string): Promise<AudioBuffer | null> {
    return this.loadBuffer(src);
  }

  destroy() {
    if (this.ctx && this.ctx.state !== 'closed') {
      this.ctx.close().catch(() => {});
    }
    this.bufferCache.clear();
    this.loadingPromises.clear();
    this.gainPool = [];
    this.ctx = null;
    this.masterGain = null;
    this.contextReady = false;
    this.activeCount = 0;
    if (AUDIO_DEBUG) {
      console.log(`%c[AudioDebug] WebAudioSfxEngine DESTROYED`, 'color: #f44336; font-weight: bold');
    }
  }
}

let sharedSfxEngine: WebAudioSfxEngine | null = null;
function getSharedSfxEngine(): WebAudioSfxEngine {
  if (!sharedSfxEngine) sharedSfxEngine = new WebAudioSfxEngine();
  return sharedSfxEngine;
}

export function getSharedAudioContext(): AudioContext | null {
  return sharedSfxEngine?.getCtx() ?? null;
}

export async function fetchSharedAudioBuffer(src: string): Promise<AudioBuffer | null> {
  const engine = getSharedSfxEngine();
  engine.ensureReady();
  return engine.fetchBuffer(src);
}

export function AudioProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<AudioSettings>(loadSettings);
  const settingsRef = useRef(settings);
  useEffect(() => { settingsRef.current = settings; }, [settings]);

  const musicPlayingRef = useRef(false);
  const musicGainRef = useRef<GainNode | null>(null);
  const musicSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const musicBufferRef = useRef<AudioBuffer | null>(null);
  const currentAmbientIdRef = useRef<string | null>(null);
  const ambientGainRef = useRef<GainNode | null>(null);
  const ambientSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const ambientBufferCache = useRef<Map<string, AudioBuffer>>(new Map());
  const unlocked = useRef(false);

  const sfxEngine = getSharedSfxEngine();

  useEffect(() => {
    if (AUDIO_DEBUG) {
      _dbg.providerMountCount++;
      if (_dbg.providerMountCount === 1) {
        _startDebugLoop();
      }
    }
    return () => {
      if (_dbg.intervalId) {
        clearInterval(_dbg.intervalId);
        _dbg.intervalId = null;
      }
      if (_dbg.rafId) {
        cancelAnimationFrame(_dbg.rafId);
        _dbg.rafId = 0;
      }
    };
  }, []);

  const updateSettings = useCallback((patch: Partial<AudioSettings>) => {
    setSettings(prev => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  const setMusicEnabled   = useCallback((v: boolean) => updateSettings({ musicEnabled: v }),   [updateSettings]);
  const setMusicVolume    = useCallback((v: number)  => updateSettings({ musicVolume: v }),    [updateSettings]);
  const setAmbientEnabled = useCallback((v: boolean) => updateSettings({ ambientEnabled: v }), [updateSettings]);
  const setAmbientVolume  = useCallback((v: number)  => updateSettings({ ambientVolume: v }),  [updateSettings]);
  const setSfxEnabled     = useCallback((v: boolean) => updateSettings({ sfxEnabled: v }),     [updateSettings]);
  const setSfxVolume      = useCallback((v: number)  => updateSettings({ sfxVolume: v }),      [updateSettings]);

  const stopMusic = useCallback(() => {
    try { musicSourceRef.current?.stop(); } catch {}
    musicSourceRef.current = null;
    musicPlayingRef.current = false;
  }, []);

  const playThemeMusic = useCallback(() => {
    if (AUDIO_KILL_SWITCH) return;
    const s = settingsRef.current;
    if (!s.musicEnabled) return;
    if (musicPlayingRef.current) return;
    const entry = AUDIO_REGISTRY.music.theme;
    if (!entry) return;

    sfxEngine.ensureReady();
    const ctx = sfxEngine.getCtx();
    if (!ctx || ctx.state === 'closed') return;

    if (!musicGainRef.current || musicGainRef.current.context !== ctx) {
      musicGainRef.current = ctx.createGain();
      musicGainRef.current.connect(ctx.destination);
    }
    musicGainRef.current.gain.value = Math.min(1, Math.max(0, s.musicVolume));

    musicPlayingRef.current = true;

    const doPlay = (buf: AudioBuffer) => {
      const c = sfxEngine.getCtx();
      if (!c || c.state === 'closed' || !musicGainRef.current) { musicPlayingRef.current = false; return; }
      try { musicSourceRef.current?.stop(); } catch {}
      const src = c.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.connect(musicGainRef.current);
      src.start(0);
      musicSourceRef.current = src;
      if (c.state === 'suspended') c.resume().catch(() => {});
    };

    if (musicBufferRef.current) {
      doPlay(musicBufferRef.current);
    } else {
      sfxEngine.fetchBuffer(entry.src).then(buf => {
        if (!buf) { musicPlayingRef.current = false; return; }
        musicBufferRef.current = buf;
        if (musicPlayingRef.current) doPlay(buf);
      });
    }
  }, [sfxEngine]);

  const stopAmbient = useCallback(() => {
    try { ambientSourceRef.current?.stop(); } catch {}
    ambientSourceRef.current = null;
    currentAmbientIdRef.current = null;
  }, []);

  const playAmbient = useCallback((skillId: AmbientId) => {
    if (AUDIO_KILL_SWITCH) return;
    const s = settingsRef.current;
    if (currentAmbientIdRef.current === skillId && ambientSourceRef.current) return;
    const entry = AUDIO_REGISTRY.ambient[skillId];
    if (!entry) return;
    if (currentAmbientIdRef.current !== skillId) {
      stopAmbient();
    }
    currentAmbientIdRef.current = skillId;
    if (!s.ambientEnabled) return;

    sfxEngine.ensureReady();
    const ctx = sfxEngine.getCtx();
    if (!ctx || ctx.state === 'closed') return;

    if (!ambientGainRef.current || ambientGainRef.current.context !== ctx) {
      ambientGainRef.current = ctx.createGain();
      ambientGainRef.current.connect(ctx.destination);
    }
    ambientGainRef.current.gain.value = Math.min(1, Math.max(0, s.ambientVolume));

    const doPlay = (buf: AudioBuffer) => {
      const c = sfxEngine.getCtx();
      if (!c || c.state === 'closed' || !ambientGainRef.current) return;
      if (currentAmbientIdRef.current !== skillId) return;
      try { ambientSourceRef.current?.stop(); } catch {}
      const src = c.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.connect(ambientGainRef.current);
      src.start(0);
      ambientSourceRef.current = src;
      if (c.state === 'suspended') c.resume().catch(() => {});
    };

    const cached = ambientBufferCache.current.get(skillId);
    if (cached) {
      doPlay(cached);
    } else {
      sfxEngine.fetchBuffer(entry.src).then(buf => {
        if (!buf) return;
        ambientBufferCache.current.set(skillId, buf);
        if (currentAmbientIdRef.current === skillId) doPlay(buf);
      });
    }
  }, [sfxEngine, stopAmbient]);

  const sfxVolumeScale = useCallback(() => {
    return settingsRef.current.sfxVolume / 0.8;
  }, []);

  const fireSfx = useCallback((src: string, baseVolume: number) => {
    if (AUDIO_KILL_SWITCH) return;
    if (!settingsRef.current.sfxEnabled) return;
    sfxEngine.play(src, baseVolume, sfxVolumeScale());
  }, [sfxEngine, sfxVolumeScale]);

  const playSfx = useCallback((category: SfxCategory, id: string) => {
    const entry = getSfxEntry(category, id);
    if (!entry) return;
    fireSfx(entry.src, entry.volume);
  }, [fireSfx]);

  const playWeaponSfx = useCallback((weaponCategory: string | null | undefined) => {
    const mapped: WeaponCategory = weaponCategory
      ? (WEAPON_CATEGORY_MAP[weaponCategory] || 'sword')
      : 'sword';
    const set = WEAPON_SFX[mapped];
    const v = set.variants[Math.floor(Math.random() * set.variants.length)];
    fireSfx(v.src, v.volume);
  }, [fireSfx]);

  const playMonsterHitSfx = useCallback(() => {
    const v = MONSTER_HIT_SFX[Math.floor(Math.random() * MONSTER_HIT_SFX.length)];
    fireSfx(v.src, v.volume);
  }, [fireSfx]);

  useEffect(() => {
    globalPlaySfx = playSfx;
    globalPlayWeaponSfx = playWeaponSfx;
    globalPlayMonsterHitSfx = playMonsterHitSfx;
    return () => {
      globalPlaySfx = null;
      globalPlayWeaponSfx = null;
      globalPlayMonsterHitSfx = null;
    };
  }, [playSfx, playWeaponSfx, playMonsterHitSfx]);

  const playPlayerSkillSfx = useCallback((skillName: string) => {
    const sfxId = PLAYER_SKILL_NAME_TO_SFX[skillName];
    if (sfxId) playSfx('playerSkills', sfxId);
  }, [playSfx]);

  const playMonsterSkillSfx = useCallback((skillName: string) => {
    const sfxId = MONSTER_SKILL_NAME_TO_SFX[skillName];
    if (sfxId) playSfx('monsterSkills', sfxId);
  }, [playSfx]);

  useEffect(() => {
    globalPlayPlayerSkillSfx = playPlayerSkillSfx;
    globalPlayMonsterSkillSfx = playMonsterSkillSfx;
    return () => {
      globalPlayPlayerSkillSfx = null;
      globalPlayMonsterSkillSfx = null;
    };
  }, [playPlayerSkillSfx, playMonsterSkillSfx]);

  const preloadCombatSounds = useCallback((weaponCategory: string | null | undefined) => {
    if (AUDIO_KILL_SWITCH) return;
    const mapped: WeaponCategory = weaponCategory
      ? (WEAPON_CATEGORY_MAP[weaponCategory] || 'sword')
      : 'sword';
    const srcs: string[] = [];
    const playerSet = WEAPON_SFX[mapped];
    if (playerSet) srcs.push(...playerSet.variants.map(v => v.src));
    const swordSet = WEAPON_SFX['sword'];
    if (swordSet && mapped !== 'sword') srcs.push(...swordSet.variants.map(v => v.src));
    const deathEntry = (AUDIO_REGISTRY.sfx as any)?.combat?.monster_death;
    if (deathEntry) srcs.push(deathEntry.src);
    const missEntry = (AUDIO_REGISTRY.sfx as any)?.combat?.miss;
    if (missEntry) srcs.push(missEntry.src);
    for (const mh of MONSTER_HIT_SFX) srcs.push(mh.src);
    sfxEngine.preload(srcs);
  }, [sfxEngine]);

  const unlockAudio = useCallback(() => {
    if (unlocked.current) return;
    unlocked.current = true;
    sfxEngine.resume();
    if (settingsRef.current.musicEnabled && !musicPlayingRef.current) {
      playThemeMusic();
    }
  }, [sfxEngine, playThemeMusic]);

  useEffect(() => {
    const resumeOnInteraction = () => {
      const ctx = sfxEngine.getCtx();
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      if (!unlocked.current) {
        unlocked.current = true;
        if (settingsRef.current.musicEnabled && !musicPlayingRef.current) {
          playThemeMusic();
        }
      } else if (settingsRef.current.musicEnabled && !musicPlayingRef.current) {
        playThemeMusic();
      }
      const ambientId = currentAmbientIdRef.current;
      if (ambientId && settingsRef.current.ambientEnabled && !ambientSourceRef.current) {
        playAmbient(ambientId as AmbientId);
      }
    };
    document.addEventListener('touchstart', resumeOnInteraction, { passive: true });
    document.addEventListener('mousedown', resumeOnInteraction, { passive: true });
    return () => {
      document.removeEventListener('touchstart', resumeOnInteraction);
      document.removeEventListener('mousedown', resumeOnInteraction);
    };
  }, [sfxEngine, playThemeMusic, playAmbient]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      sfxEngine.ensureReady();
      const ctx = sfxEngine.getCtx();
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      if (musicGainRef.current && ctx && musicGainRef.current.context !== ctx) {
        musicGainRef.current = null;
        musicSourceRef.current = null;
        musicPlayingRef.current = false;
      }
      if (ambientGainRef.current && ctx && ambientGainRef.current.context !== ctx) {
        ambientGainRef.current = null;
        ambientSourceRef.current = null;
      }
      const s = settingsRef.current;
      if (s.musicEnabled && !musicPlayingRef.current) {
        setTimeout(() => playThemeMusic(), 50);
      }
      const ambientId = currentAmbientIdRef.current;
      if (ambientId && s.ambientEnabled && !ambientSourceRef.current) {
        setTimeout(() => playAmbient(ambientId as AmbientId), 50);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [sfxEngine, playThemeMusic, playAmbient]);

  useEffect(() => {
    if (AUDIO_KILL_SWITCH) return;
    if (settings.musicEnabled) {
      if (musicGainRef.current) {
        musicGainRef.current.gain.value = Math.min(1, Math.max(0, settings.musicVolume));
      }
      if (!musicPlayingRef.current) playThemeMusic();
    } else {
      stopMusic();
    }
  }, [settings.musicEnabled, settings.musicVolume, playThemeMusic, stopMusic]);

  useEffect(() => {
    if (AUDIO_KILL_SWITCH) return;
    if (settings.ambientEnabled) {
      if (ambientGainRef.current) {
        ambientGainRef.current.gain.value = Math.min(1, Math.max(0, settings.ambientVolume));
      }
    } else {
      stopAmbient();
    }
  }, [settings.ambientEnabled, settings.ambientVolume, stopAmbient]);

  useEffect(() => {
    return () => {
      try { musicSourceRef.current?.stop(); } catch {}
      try { ambientSourceRef.current?.stop(); } catch {}
    };
  }, []);

  const value = useMemo<AudioContextType>(() => ({
    settings, setMusicEnabled, setMusicVolume, setAmbientEnabled, setAmbientVolume,
    setSfxEnabled, setSfxVolume, playThemeMusic, stopMusic, playAmbient, stopAmbient,
    playSfx, playWeaponSfx, playMonsterHitSfx, playPlayerSkillSfx, playMonsterSkillSfx, preloadCombatSounds, unlockAudio,
  }), [settings, setMusicEnabled, setMusicVolume, setAmbientEnabled, setAmbientVolume,
    setSfxEnabled, setSfxVolume, playThemeMusic, stopMusic, playAmbient, stopAmbient,
    playSfx, playWeaponSfx, playMonsterHitSfx, playPlayerSkillSfx, playMonsterSkillSfx, preloadCombatSounds, unlockAudio]);

  return <AudioCtx.Provider value={value}>{children}</AudioCtx.Provider>;
}

export function useAudio(): AudioContextType {
  const ctx = useContext(AudioCtx);
  if (!ctx) throw new Error("useAudio must be used inside AudioProvider");
  return ctx;
}
