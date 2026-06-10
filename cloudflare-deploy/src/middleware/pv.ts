// PV 追踪中间件

import { Env } from '../index';

// Only count these pages as real user visits
const PAGE_PATHS = new Set(['/', '/index.html', '/admin', '/admin/']);

// Common bot/crawler User-Agent patterns
const BOT_UA = /bot|crawler|spider|scanner|scan|wget|curl|python|go-http|java|libwww|perl|ruby|php|wordpress|scanning/i;

export async function trackPageView(request: Request, env: Env): Promise<void> {
  try {
    const url = new URL(request.url);
    const path = url.pathname;
    
    // Only track actual page visits
    if (!PAGE_PATHS.has(path)) {
      return;
    }

    const userAgent = request.headers.get('User-Agent') || '';
    
    // Exclude bots and scanners
    if (BOT_UA.test(userAgent)) {
      return;
    }

    const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || '';
    const referer = request.headers.get('Referer') || '';
    
    // Hash for visitor identification (IP + UA)
    const visitorRaw = `${ip}:${userAgent}`;
    let hash = 0;
    for (let i = 0; i < visitorRaw.length; i++) {
      const chr = visitorRaw.charCodeAt(i);
      hash = ((hash << 5) - hash) + chr;
      hash |= 0;
    }
    const visitorHash = `v_${Math.abs(hash).toString(36)}`;

    await env.DB.prepare(
      'INSERT INTO page_views (visitor_hash, path, ip, user_agent, referer, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(visitorHash, path, ip, userAgent, referer, new Date().toISOString()).run();
  } catch (e) {
    // PV tracking failure should not affect the main request
  }
}

const PAGE_FILTER = "AND path IN ('/', '/index.html', '/admin', '/admin/')";

export async function getPVStats(env: Env): Promise<{
  todayPV: number;
  yesterdayPV: number;
  totalPV: number;
  todayVisitors: number;
  totalVisitors: number;
  last7Days: { date: string; pv: number }[];
  last30Days: { date: string; pv: number }[];
}> {
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

  const [todayResult, yesterdayResult, totalResult, todayVisitors, totalVisitors, last7DaysRes, last30DaysRes] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) as count FROM page_views WHERE created_at >= ? ${PAGE_FILTER}`).bind(today).first<{ count: number }>(),
    env.DB.prepare(`SELECT COUNT(*) as count FROM page_views WHERE created_at >= ? AND created_at < ? ${PAGE_FILTER}`).bind(yesterday, today).first<{ count: number }>(),
    env.DB.prepare(`SELECT COUNT(*) as count FROM page_views WHERE 1=1 ${PAGE_FILTER}`).first<{ count: number }>(),
    env.DB.prepare(`SELECT COUNT(DISTINCT visitor_hash) as count FROM page_views WHERE created_at >= ? ${PAGE_FILTER}`).bind(today).first<{ count: number }>(),
    env.DB.prepare(`SELECT COUNT(DISTINCT visitor_hash) as count FROM page_views WHERE 1=1 ${PAGE_FILTER}`).first<{ count: number }>(),
    env.DB.prepare(`SELECT DATE(created_at) as date, COUNT(DISTINCT visitor_hash) as pv FROM page_views WHERE created_at >= ? ${PAGE_FILTER} GROUP BY DATE(created_at) ORDER BY date`).bind(sevenDaysAgo).all<{ date: string; pv: number }>(),
    env.DB.prepare(`SELECT DATE(created_at) as date, COUNT(DISTINCT visitor_hash) as pv FROM page_views WHERE created_at >= ? ${PAGE_FILTER} GROUP BY DATE(created_at) ORDER BY date`).bind(thirtyDaysAgo).all<{ date: string; pv: number }>(),
  ]);

  return {
    todayPV: todayResult?.count ?? 0,
    yesterdayPV: yesterdayResult?.count ?? 0,
    totalPV: totalResult?.count ?? 0,
    todayVisitors: todayVisitors?.count ?? 0,
    totalVisitors: totalVisitors?.count ?? 0,
    last7Days: (last7DaysRes.results || []).map(r => ({ date: r.date, pv: r.pv })),
    last30Days: (last30DaysRes.results || []).map(r => ({ date: r.date, pv: r.pv })),
  };
}