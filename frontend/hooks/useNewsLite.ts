/**
 * hooks/useNewsLite — Round 89c upgrade.
 *
 * Cache-first news feed optimised for instant render + background
 * refresh. Used by DiscoverDrawer (home supporting surface) and the
 * new /news-view in-app reader.
 *
 * Contract:
 *   • First mount returns last-known-good cached list SYNCHRONOUSLY.
 *   • Background fetch fires once per session.
 *   • Max 5 items (per P2 spec: "3–5 items max").
 *   • Individual items are selected for the reader via a module-level
 *     selection slot (zero-copy, avoids URL payload bloat).
 */
import { useEffect, useState } from 'react';
import api from '../utils/api';

export interface NewsItem {
  title: string;
  source?: string;
  summary?: string;
  emoji?: string;
  category?: string;
  published_at?: string;
  source_url?: string;
  url?: string;
}

interface CacheShape { list: NewsItem[]; at: number; isFallback: boolean }
// Module-level session cache — survives component unmount.
const _newsCache: { current: CacheShape | null } = { current: null };
let _inflight: Promise<{ list: NewsItem[]; isFallback: boolean }> | null = null;

// Selection slot for the /news-view reader. Set by the drawer right
// before `router.push('/news-view')`; read on the reader screen's
// first paint. Not a store — just a pass-through variable.
let _selected: NewsItem | null = null;
export function setSelectedNews(item: NewsItem | null): void { _selected = item; }
export function getSelectedNews(): NewsItem | null { return _selected; }

const MAX_ITEMS = 5;

async function _fetchNews(): Promise<{ list: NewsItem[]; isFallback: boolean }> {
  if (_inflight) return _inflight;
  _inflight = (async () => {
    try {
      const r = await api.get('/news/india-finance');
      const arr = Array.isArray(r?.data?.articles) ? r.data.articles : [];
      const trimmed = arr.slice(0, MAX_ITEMS) as NewsItem[];
      // R104I — Trust contract. The backend signals when it is
      // serving the static `_FALLBACK` list (no real LLM-generated
      // news cached for today) via `is_fallback: true`. We thread
      // it through so the UI can render an honest "Showing default
      // headlines — live feed warming up" pill instead of pretending
      // these are fresh news.
      const isFallback = !!r?.data?.is_fallback;
      _newsCache.current = { list: trimmed, at: Date.now(), isFallback };
      return { list: trimmed, isFallback };
    } catch {
      return {
        list: _newsCache.current?.list || [],
        isFallback: _newsCache.current?.isFallback ?? true,
      };
    } finally {
      setTimeout(() => { _inflight = null; }, 0);
    }
  })();
  return _inflight;
}

/**
 * Subscribe to the news-lite feed.
 *
 * `enabled=false` — if you want to only fetch when the drawer is expanded
 *                   (so collapsed Home never eats a network request).
 *                   Cached items are still returned instantly for the
 *                   one-line preview in the collapsed header.
 */
export function useNewsLite(enabled: boolean = true): { items: NewsItem[]; loading: boolean; isFallback: boolean } {
  const [items, setItems] = useState<NewsItem[]>(_newsCache.current?.list || []);
  const [loading, setLoading] = useState<boolean>(false);
  const [isFallback, setIsFallback] = useState<boolean>(_newsCache.current?.isFallback ?? true);

  useEffect(() => {
    if (!enabled) return;
    // Fire if we have no cache OR cache is older than 30 min (P2 spec
    // TTL guidance — 30-60 min). News is a supporting surface, so stale
    // is fine.
    const stale = !_newsCache.current || (Date.now() - _newsCache.current.at > 30 * 60_000);
    if (!stale) {
      if (_newsCache.current && items.length === 0) setItems(_newsCache.current.list);
      return;
    }
    let alive = true;
    setLoading(true);
    _fetchNews()
      .then(({ list, isFallback: fb }) => {
        if (!alive) return;
        setItems(list);
        setIsFallback(fb);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => { alive = false; };
  }, [enabled]);

  return { items, loading, isFallback };
}

/** Synchronous accessor — used by the collapsed-drawer one-liner. */
export function getCachedNewsTop(): NewsItem | null {
  return _newsCache.current?.list?.[0] || null;
}

/** Get cached list non-reactively. */
export function getCachedNewsList(): NewsItem[] {
  return _newsCache.current?.list || [];
}

/** R104J — Synchronous accessor for the fallback-flag (mirror of
 * `is_fallback` from /news/india-finance). UI surfaces use this to
 * append a small "· demo headlines" hint when we're showing the
 * static fallback list instead of real LLM-generated news. */
export function getCachedIsFallback(): boolean {
  return _newsCache.current?.isFallback ?? true;
}
