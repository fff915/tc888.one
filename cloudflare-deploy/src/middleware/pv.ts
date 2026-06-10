// PV 追踪中间件

import { Env } from '../index';

export async function trackPageView(request: Request, env: Env): Promise<void> {
  try {
    const url = new URL(request.url);
    const path = url.pathname;
    
    // Only track actual page views, not API calls or static asset requests
    if (path.startsWith('/api/') || path.startsWith('/daily-image/') || path.startsWith('/admin/')) {
      return;
    }
    
    // Exclude static file extensions
    const staticExts = /\.(css|js|ico|png|jpg|jpeg|gif|svg|webp|woff|woff2|ttf|eot|map|txt|xml|json|pdf)$/i;
    if (staticExts.test(path)) {
      return;
    }

    const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || '';
    const userAgent = request.headers.get('User-Agent') || '';
    const referer = request.headers.get('Referer') || '';
    
    // Simple hash for visitor identification
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
    env.DB.prepare('SELECT COUNT(*) as count FROM page_views WHERE created_at >= ?').bind(today).first<{ count: number }>(),
    env.DB.prepare('SELECT COUNT(*) as count FROM page_views WHERE created_at >= ? AND created_at < ?').bind(yesterday, today).first<{ count: number }>(),
    env.DB.prepare('SELECT COUNT(*) as count FROM page_views').first<{ count: number }>(),
    env.DB.prepare('SELECT COUNT(DISTINCT visitor_hash) as count FROM page_views WHERE created_at >= ?').bind(today).first<{ count: number }>(),
    env.DB.prepare('SELECT COUNT(DISTINCT visitor_hash) as count FROM page_views').first<{ count: number }>(),
    env.DB.prepare("SELECT DATE(created_at) as date, COUNT(*) as pv FROM page_views WHERE created_at >= ? GROUP BY DATE(created_at) ORDER BY date").bind(sevenDaysAgo).all<{ date: string; pv: number }>(),
    env.DB.prepare("SELECT DATE(created_at) as date, COUNT(*) as pv FROM page_views WHERE created_at >= ? GROUP BY DATE(created_at) ORDER BY date").bind(thirtyDaysAgo).all<{ date: string; pv: number }>(),
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