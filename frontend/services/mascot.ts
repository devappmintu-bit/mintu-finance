/**
 * services/mascot.ts — MintU Personality Engine client.
 *
 * Tiny service: one fetcher + a 3-tag rolling memory in AsyncStorage so
 * the server can avoid recently-shown moments. No DB, no analytics —
 * per spec this is a personality layer, not a system.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../utils/api';

export type MascotAction =
  | 'peek' | 'juggle' | 'float' | 'stretch' | 'sip' | 'spin'
  | 'bounce' | 'fly' | 'wave' | 'tap' | 'celebrate' | 'sleep';

export type MascotTone =
  | 'playful' | 'witty' | 'calm' | 'motivating' | 'cheeky' | 'celebratory' | 'confident';

export type MascotMode = 'login' | 'home' | 'coach';

export type MascotMomentDTO = {
  action: MascotAction;
  text: string;
  tone: MascotTone;
  tag: string;
  source: 'llm' | 'fallback' | 'instant-fallback';
};

// Round 53l.2: Local "instant fallback" library — keyed by mode so the
// LOGIN screen can render an animated mascot moment SYNCHRONOUSLY at
// 0ms, without ever blocking on the network. The async LLM call then
// upgrades the moment in place if it lands fast enough.
const INSTANT_FALLBACKS: Record<MascotMode, ReadonlyArray<Omit<MascotMomentDTO, 'source'>>> = {
  login: [
    { action: 'wave',    text: 'Welcome back \ud83d\udc4b',                    tone: 'playful',    tag: 'instant-login-wave-01' },
    { action: 'float',   text: "All set. Let's keep things smooth today \u2728", tone: 'calm',     tag: 'instant-login-float-01' },
    { action: 'bounce',  text: 'Good to see you again!',                       tone: 'playful',    tag: 'instant-login-bounce-01' },
    { action: 'stretch', text: 'Ready when you are.',                          tone: 'calm',       tag: 'instant-login-stretch-01' },
    { action: 'peek',    text: 'Your money world is ready.',                   tone: 'calm',       tag: 'instant-login-peek-01' },
    { action: 'tap',     text: "Let's make today count.",                      tone: 'motivating', tag: 'instant-login-tap-01' },
  ],
  home: [
    { action: 'wave',    text: "Hey \u2014 quick check-in?",            tone: 'playful', tag: 'instant-home-wave-01' },
    { action: 'float',   text: 'Floating through your finances \u2728', tone: 'calm',    tag: 'instant-home-float-01' },
    { action: 'peek',    text: 'Pssst \u2014 ready to win at money?',   tone: 'playful', tag: 'instant-home-peek-01' },
  ],
  coach: [
    { action: 'tap',       text: "Coach mode ON. Let's fix things.",  tone: 'confident',    tag: 'instant-coach-tap-01' },
    { action: 'celebrate', text: "Look who's here \u2728",             tone: 'celebratory',  tag: 'instant-coach-celebrate-01' },
    { action: 'bounce',    text: "Let's go!",                          tone: 'motivating',   tag: 'instant-coach-bounce-01' },
  ],
};

/**
 * Synchronous instant fallback — returns immediately, never awaits.
 *
 * Use this for the "0ms render, upgrade-when-ready" pattern on the
 * login screen and any other surface that must not block on the API.
 * The text is interpolated with ``userName`` when one is provided.
 */
export function getInstantFallback(mode: MascotMode = 'home', userName?: string): MascotMomentDTO {
  const pool = INSTANT_FALLBACKS[mode] || INSTANT_FALLBACKS.home;
  const pick = pool[Math.floor(Math.random() * pool.length)];
  // Personalize a single login row with the name if provided.
  let text = pick.text;
  if (mode === 'login' && userName && pick.tag === 'instant-login-wave-01') {
    text = `Welcome back, ${userName} \ud83d\udc4b`;
  }
  return { ...pick, text, source: 'instant-fallback' };
}

const MEMORY_KEY = 'mascot.last_tags.v1';
const CACHE_KEY = 'mascot.cache.v1';
// Round 53l.2: bump global memory from 3 → 5 entries, shared across
// login + home + coach so the mascot feels alive, not random.
const MAX_REMEMBER = 5;
// Round 53l.1 polish: cache fetched moments per-mode for 5 minutes so
// rapid app re-opens don't hammer the LLM. We still pass last_tags to
// the server when the cache misses, so dedup remains correct.
const CACHE_TTL_MS = 5 * 60 * 1000;

type CachedMoment = { moment: MascotMomentDTO; expiresAt: number };
type Cache = Partial<Record<'home' | 'coach', CachedMoment>>;

async function readLastTags(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(MEMORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((t: any) => typeof t === 'string').slice(-MAX_REMEMBER) : [];
  } catch {
    return [];
  }
}

async function rememberTag(tag: string) {
  if (!tag) return;
  try {
    const tags = await readLastTags();
    const next = [...tags.filter((t) => t !== tag), tag].slice(-MAX_REMEMBER);
    await AsyncStorage.setItem(MEMORY_KEY, JSON.stringify(next));
  } catch {
    /* best-effort */
  }
}

async function readCache(): Promise<Cache> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return (parsed && typeof parsed === 'object') ? parsed : {};
  } catch {
    return {};
  }
}

async function writeCache(cache: Cache) {
  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* best-effort */
  }
}

/**
 * Fetch a fresh mascot moment.
 *
 * @param mode 'home' (subtle, on app open) or 'coach' (expressive, on tap)
 * @param opts.force when true, bypass the 5-min TTL cache (use for
 *   user-driven re-rolls like a tap on the home widget that wants a
 *   fresh coach moment).
 *
 * The function always resolves — backend never errors out on this path
 * (it has its own static fallback library), so the UI gets at minimum
 * a non-repeating canned moment.
 */
export async function fetchMascotMoment(
  mode: MascotMode = 'home',
  opts: { force?: boolean; userName?: string } = {},
): Promise<MascotMomentDTO> {
  // ── Cache short-circuit (skipped on force; login is always force).
  // We never cache login because every app open is a fresh emotional
  // beat — and login fetches are unauthenticated anyway, so cost is
  // trivial.
  const useCache = !opts.force && mode !== 'login';
  if (useCache) {
    const cache = await readCache();
    const hit = cache[mode];
    if (hit && hit.expiresAt > Date.now() && hit.moment?.tag) {
      return hit.moment;
    }
  }

  const last_tags = await readLastTags();
  const r = await api.post('/mascot/moment', {
    mode,
    last_tags,
    ...(opts.userName ? { user_name: opts.userName } : {}),
  });
  const moment = r.data as MascotMomentDTO;

  // Remember even on fallback so we don't repeat fallbacks immediately.
  rememberTag(moment.tag).catch(() => {});

  // Cache only LLM-sourced moments — fallbacks should re-roll quickly
  // so the static library doesn't dominate when the LLM recovers.
  // Login is never cached (fresh moment per open).
  if (moment.source === 'llm' && mode !== 'login') {
    const cache = await readCache();
    cache[mode] = { moment, expiresAt: Date.now() + CACHE_TTL_MS };
    await writeCache(cache);
  }
  return moment;
}

/** Wipe the local moment cache — call on logout or "force fresh" UX. */
export async function clearMascotCache() {
  try {
    await AsyncStorage.multiRemove([MEMORY_KEY, CACHE_KEY]);
  } catch {
    /* best-effort */
  }
}
