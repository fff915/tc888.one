// 主 Worker 入口 - 路由处理和 API

import { isAdminRequest } from './middleware/auth';
import { trackPageView, getPVStats } from './middleware/pv';
import { loadAllMatches, findMatchByNo, loadApiUsage, upsertMatch, type MatchRecord } from './services/db';
import { runApiFootballUpdate } from './services/apifootball';
import { getAiReport } from './services/ai';
import { importSchedule } from './services/excel';
import { normalizeMatchNo, nowISO, parseScore, matchNoSortKey, flagLogoUrl } from './utils/helpers';
import { TEAM_LOGO_ALLOWED_HOSTS, TEAM_LOGO_MAX_BYTES, IMAGE_EXTENSIONS } from './data/constants';

export interface Env {
  DB: D1Database;
  STORAGE: R2Bucket;
  ASSETS: Fetcher;
  SCORE_POLLER: DurableObjectNamespace;
  LOGO_PRECACHER: DurableObjectNamespace;
  AI_ANALYZER: DurableObjectNamespace;
  API_FOOTBALL_API_KEY: string;
  API_FOOTBALL_BASE_URL: string;
  ADMIN_TOKEN: string;
  DEEPSEEK_API_KEY: string;
  DOUBAO_API_KEY: string;
  DOUBAO_ENDPOINT_ID: string;
  API_DAILY_LIMIT: string;
  LOCAL_TIMEZONE: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // Track page views for non-API requests
    if (request.method === 'GET' && !path.startsWith('/api/') && !path.startsWith('/daily-image/')) {
      ctx.waitUntil(trackPageView(request, env));
    }

    // --- API Routes ---
    if (path.startsWith('/api/')) {
      if (path === '/api/team-logo') {
        return serveTeamLogo(request, env);
      }
      return handleApi(request, env, ctx);
    }

    // --- Daily Image Routes ---
    if (path.startsWith('/daily-image/')) {
      return serveDailyImage(request, env);
    }

    // --- Admin Routes ---
    if (path === '/admin' || path.startsWith('/admin/')) {
      // If it's an API call (has Bearer token), route to admin API
      const auth = request.headers.get('Authorization') || '';
      if (auth.startsWith('Bearer ')) {
        return handleAdminApi(request, env, ctx);
      }
      // Otherwise serve admin.html as static asset
      return env.ASSETS.fetch('https://asset/admin.html');
    }

    // --- Static Assets ---
    // Serve index.html for root
    const assetPath = path === '/' || path === '' ? '/index.html' : path;
    return env.ASSETS.fetch(new URL(assetPath, 'https://asset'));
  },
};

async function handleApi(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  try {
    // GET /api/schedule
    if (method === 'GET' && path === '/api/schedule') {
      const matches = await loadAllMatches(env);
      const sorted = [...matches].sort((a, b) => {
        if (a.date_key !== b.date_key) return a.date_key.localeCompare(b.date_key);
        const [ak] = matchNoSortKey(a.match_no_normalized);
        const [bk] = matchNoSortKey(b.match_no_normalized);
        if (ak !== bk) return ak - bk;
        return a.time.localeCompare(b.time);
      });

      const grouped: Record<string, {
        dateKey: string; dateLabel: string; dayNumber: string; dayOfWeek: string; matches: Record<string, unknown>[];
      }> = {};

      for (const m of sorted) {
        if (!grouped[m.date_key]) {
          grouped[m.date_key] = {
            dateKey: m.date_key,
            dateLabel: m.date_label,
            dayNumber: m.day_number,
            dayOfWeek: m.day_of_week,
            matches: [],
          };
        }
        grouped[m.date_key].matches.push({
          matchNo: m.match_no_normalized,
          league: m.league,
          round: m.round,
          home: m.home,
          away: m.away,
          homeBadge: m.home_badge,
          awayBadge: m.away_badge,
          kickoff: m.kickoff,
          dateKey: m.date_key,
          dateLabel: m.date_label,
          dayNumber: m.day_number,
          dayOfWeek: m.day_of_week,
          time: m.time,
          fullScore: m.full_score,
          halfScore: m.half_score,
          homeScore: m.home_score,
          awayScore: m.away_score,
          matchStatus: m.match_status,
          currentScore: m.current_score,
          penaltyScore: m.penalty_score,
          extraTimeScore: m.extra_time_score,
          scoreSource: m.score_source,
          manualHalfTimeScore: m.manual_half_time_score,
          manualFullTimeScore: m.manual_full_time_score,
          apiHalfTimeScore: m.api_half_time_score,
          apiFullTimeScore: m.api_full_time_score,
        });
      }

      return jsonResponse({ days: Object.values(grouped) });
    }

    // GET /api/matches/today
    if (method === 'GET' && path === '/api/matches/today') {
      const today = new Date().toISOString().slice(0, 10);
      const matches = await loadAllMatches(env);
      return jsonResponse({
        date: today,
        matches: matches.filter(m => {
          try { return new Date(m.kickoff).toISOString().slice(0, 10) === today; } catch { return false; }
        }),
      });
    }

    // GET /api/update-status
    if (method === 'GET' && path === '/api/update-status') {
      const usage = await loadApiUsage(env);
      return jsonResponse({
        apiUsage: usage,
        configured: Boolean(env.API_FOOTBALL_API_KEY),
      });
    }

    // GET /api/image/latest
    if (method === 'GET' && path === '/api/image/latest') {
      const kind = url.searchParams.get('kind') || '';
      const image = await getLatestImage(env, kind);
      if (!image) {
        return jsonResponse({ found: false, kind });
      }
      return jsonResponse({
        found: true,
        kind,
        name: image.name,
        url: `/daily-image/${kind}/${image.name}?v=${image.uploaded ? image.uploaded.getTime() : Date.now()}`,
      });
    }

    // GET /api/ai-report
    if (method === 'GET' && path === '/api/ai-report') {
      const matchNo = url.searchParams.get('matchNo') || '';
      if (!matchNo) return jsonResponse({ ok: false, message: '缺少 matchNo 参数' }, 400);
      const result = await getAiReport(env, matchNo);

      // Compensation: if report is pending and match was created > 5 min ago, trigger background generation
      if (result.pending) {
        const matchNoNorm = normalizeMatchNo(matchNo);
        const match = await findMatchByNo(env, matchNoNorm);
        if (match?.created_at) {
          const createdAge = Date.now() - new Date(match.created_at + 'Z').getTime();
          if (createdAge > 5 * 60 * 1000) {
            const doId = env.AI_ANALYZER.idFromName('ai-analyzer');
            const stub = env.AI_ANALYZER.get(doId);
            ctx.waitUntil(stub.fetch(new Request('https://do/analyze')).catch(() => {}));
            result.triggered = true;
          }
        }
      }

      return jsonResponse({ ok: true, ...result });
    }

    return jsonResponse({ ok: false, message: 'Not found' }, 404);
  } catch (e) {
    console.error(e);
    return jsonResponse({ ok: false, message: String(e) }, 500);
  }
}

async function handleAdminApi(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  try {
    if (!isAdminRequest(request, env)) {
      return jsonResponse({ ok: false, message: '需要管理员认证' }, 401);
    }

    // POST /admin/upload-excel - Excel上传
    if (method === 'POST' && path === '/admin/upload-excel') {
      const contentType = request.headers.get('Content-Type') || '';
      if (!contentType.includes('multipart/form-data')) {
        return jsonResponse({ ok: false, message: '需要 multipart/form-data' }, 400);
      }

      const formData = await request.formData();
      const file = formData.get('file');
      if (!file || typeof file === 'string') {
        return jsonResponse({ ok: false, message: '未上传文件' }, 400);
      }
      const uploadedFile = file as unknown as { name: string; arrayBuffer(): Promise<ArrayBuffer> };

      const fileName = uploadedFile.name;
      const buffer = await uploadedFile.arrayBuffer();
      
      // Store in R2
      const r2Key = `excels/${Date.now()}_${fileName}`;
      await env.STORAGE.put(r2Key, buffer);

      // Parse Excel using SheetJS/xlsx
      const XLSX = await import('xlsx');
      const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array' });
      
      let allRecords: Record<string, string>[] = [];
      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false }) as unknown[][];
        
        const { parseExcelSheet } = await import('./services/excel');
        const parsed = parseExcelSheet(rows);
        if (parsed) {
          allRecords = allRecords.concat(parsed.records);
          break;
        }
      }

      if (allRecords.length === 0) {
        return jsonResponse({ ok: false, message: '未找到可识别的赛程表头（需包含：竞彩编号、赛事种类、双方队伍、开赛日期）' }, 400);
      }

      const { result, newMatches } = await importSchedule(env, allRecords, fileName);

      if (env.API_FOOTBALL_API_KEY) {
        ctx.waitUntil(runApiFootballUpdate(env).catch(() => {}));
      }
      if (newMatches.length > 0) {
        // Trigger AI analysis via Durable Object alarm (runs independently of request lifecycle)
        const doId = env.AI_ANALYZER.idFromName('ai-analyzer');
        const stub = env.AI_ANALYZER.get(doId);
        ctx.waitUntil(stub.fetch(new Request('https://do/analyze')).catch(() => {}));
      }

      return jsonResponse({ ok: true, result });
    }

    // POST /admin/update-scores
    if (method === 'POST' && (path === '/admin/update-scores' || path === '/admin/match-api-football')) {
      const body = await request.json().catch(() => ({})) as Record<string, unknown>;
      const date = String(body.date || '');
      const result = await runApiFootballUpdate(env, date);
      return jsonResponse({ ok: true, result });
    }

    // POST /admin/edit-score
    if (method === 'POST' && path === '/admin/edit-score') {
      const body = await request.json() as Record<string, string>;
      const matchNo = normalizeMatchNo(body.matchNo || body.jcNo || body['竞彩编号'] || '');
      if (!matchNo) return jsonResponse({ ok: false, message: '必须提供 matchNo' }, 400);

      const match = await findMatchByNo(env, matchNo);
      if (!match) return jsonResponse({ ok: false, message: `找不到比赛：${matchNo}` }, 404);

      const halfScore = String(body.halfScore || body.halfTimeScore || body['半场比分'] || '').trim();
      const fullScore = String(body.fullScore || body.fullTimeScore || body['全场比分'] || '').trim();

      if (halfScore) {
        const [, , parsed] = parseScore(halfScore);
        match.manual_half_time_score = parsed;
      }
      if (fullScore) {
        const [, , parsed] = parseScore(fullScore);
        match.manual_full_time_score = parsed;
      }
      match.manual_locked = body.manualLocked === 'true' ? 1 : 0;
      match.manual_updated_at = nowISO();
      if (!(match.api_full_time_score || match.api_half_time_score || match.current_score)) {
        match.score_source = 'manual';
      } else {
        match.score_source = 'api_over_manual';
      }
      match.last_updated_at = nowISO();
      match.updated_at = nowISO();

      const { applyEffectiveScoreFields } = await import('./services/apifootball');
      applyEffectiveScoreFields(match);
      await upsertMatch(env, match);

      return jsonResponse({ ok: true, matchNo });
    }

    // POST /admin/bind-api-match-id
    if (method === 'POST' && path === '/admin/bind-api-match-id') {
      const body = await request.json() as Record<string, string>;
      const matchNo = normalizeMatchNo(body.matchNo || body.jcNo || body['竞彩编号'] || '');
      const apiMatchId = String(body.apiMatchId || body.matchId || '').trim();
      if (!matchNo || !apiMatchId) return jsonResponse({ ok: false, message: '必须提供 matchNo 和 apiMatchId' }, 400);

      const match = await findMatchByNo(env, matchNo);
      if (!match) return jsonResponse({ ok: false, message: `找不到比赛：${matchNo}` }, 404);

      match.api_match_id = apiMatchId;
      match.last_updated_at = nowISO();
      await upsertMatch(env, match);

      return jsonResponse({ ok: true, matchNo, apiMatchId });
    }

    // GET /admin/pv-stats
    if (method === 'GET' && path === '/admin/pv-stats') {
      const stats = await getPVStats(env);
      return jsonResponse({ ok: true, stats });
    }

    // GET /admin/import-history
    if (method === 'GET' && path === '/admin/import-history') {
      const { results } = await env.DB.prepare('SELECT * FROM import_history ORDER BY imported_at DESC LIMIT 20').all();
      return jsonResponse({ ok: true, history: results });
    }

    return jsonResponse({ ok: false, message: 'Not found' }, 404);
  } catch (e) {
    console.error(e);
    return jsonResponse({ ok: false, message: String(e) }, 500);
  }
}

// --- File serving ---

function getContentType(filename: string): string {
  if (filename.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filename.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filename.endsWith('.js')) return 'application/javascript; charset=utf-8';
  if (filename.endsWith('.json')) return 'application/json; charset=utf-8';
  if (filename.endsWith('.svg')) return 'image/svg+xml';
  if (filename.endsWith('.png')) return 'image/png';
  if (filename.endsWith('.jpg') || filename.endsWith('.jpeg')) return 'image/jpeg';
  if (filename.endsWith('.webp')) return 'image/webp';
  if (filename.endsWith('.gif')) return 'image/gif';
  return 'application/octet-stream';
}

async function getLatestImage(env: Env, kind: string): Promise<{ name: string; uploaded: Date | null } | null> {
  const prefix = `images/${kind}/`;
  const objects = await env.STORAGE.list({ prefix });
  if (!objects.objects.length) return null;

  // Find the newest image by key (timestamp based)
  const imageObjects = objects.objects.filter(o => {
    const ext = o.key.split('.').pop()?.toLowerCase() || '';
    return IMAGE_EXTENSIONS.has(`.${ext}`) && !o.key.includes('~$');
  });

  if (!imageObjects.length) return null;

  const newest = imageObjects.sort((a, b) => (b.uploaded.getTime() - a.uploaded.getTime()))[0];
  const name = newest.key.replace(prefix, '');
  return { name, uploaded: newest.uploaded };
}

async function serveDailyImage(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts.length < 3) return new Response('Not Found', { status: 404 });

  const [, kind, ...nameParts] = parts;
  const name = nameParts.join('/');
  const key = `images/${kind}/${name}`;

  const object = await env.STORAGE.get(key);
  if (!object) return new Response('Not Found', { status: 404 });

  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (!IMAGE_EXTENSIONS.has(`.${ext}`)) return new Response('Forbidden', { status: 403 });

  const headers = new Headers();
  headers.set('Content-Type', object.httpMetadata?.contentType || getContentType(name));
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  object.writeHttpMetadata(headers);

  return new Response(object.body, { headers });
}

async function serveTeamLogo(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const src = url.searchParams.get('src') || '';
  if (!src || !isValidTeamLogoSource(src)) {
    return new Response('Bad Request', { status: 400 });
  }

  // Check R2 cache
  const cacheKey = `team-logos/${hashString(src)}`;
  let object = await env.STORAGE.get(cacheKey);

  if (!object) {
    // Fetch and cache
    try {
      const response = await fetch(src, {
        headers: {
          'Accept': 'image/avif,image/webp,image/svg+xml,image/png,image/*,*/*;q=0.8',
          'User-Agent': 'QTC-TeamLogoCache/1.0',
        },
      });

      if (!response.ok || !response.body) {
        return new Response('Not Found', { status: 404 });
      }

      const contentType = response.headers.get('Content-Type') || '';
      if (!contentType.startsWith('image/') && !src.endsWith('.svg')) {
        return new Response('Not Found', { status: 404 });
      }

      const buffer = await response.arrayBuffer();
      if (buffer.byteLength > TEAM_LOGO_MAX_BYTES) {
        return new Response('Too Large', { status: 413 });
      }

      await env.STORAGE.put(cacheKey, buffer, {
        httpMetadata: { contentType },
      });
      object = await env.STORAGE.get(cacheKey);
    } catch {
      return new Response('Not Found', { status: 404 });
    }
  }

  if (!object) return new Response('Not Found', { status: 404 });

  const headers = new Headers();
  headers.set('Content-Type', object.httpMetadata?.contentType || 'image/svg+xml');
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  object.writeHttpMetadata(headers);

  return new Response(object.body, { headers });
}

function isValidTeamLogoSource(src: string): boolean {
  try {
    const parsed = new URL(src);
    const host = (parsed.hostname || '').toLowerCase();
    return parsed.protocol === 'https:' && TEAM_LOGO_ALLOWED_HOSTS.has(host) && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return Math.abs(hash).toString(16);
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

// --- Durable Objects ---

export class ScorePoller {
  private state: DurableObjectState;
  private env: Env;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    return new Response('ScorePoller running');
  }

  async alarm(): Promise<void> {
    try {
      const result = await runApiFootballUpdate(this.env);
      console.log(`[ScorePoller] Updated: ${result.updated}, Matched: ${result.matched}`);
    } catch (e) {
      console.error(`[ScorePoller] Error: ${e}`);
    }
    // Schedule next run in 30 minutes
    await this.state.storage.setAlarm(Date.now() + 30 * 60 * 1000);
  }
}

export class LogoPrecacher {
  private state: DurableObjectState;
  private env: Env;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    return new Response('LogoPrecacher running');
  }

  async alarm(): Promise<void> {
    try {
      const matches = await loadAllMatches(this.env);
      const teams = new Set<string>();
      for (const m of matches) {
        if (m.home) teams.add(m.home);
        if (m.away) teams.add(m.away);
      }

      let cached = 0;
      for (const team of teams) {
        const url = flagLogoUrl(team);
        if (!url) continue;
        const cacheKey = `team-logos/${hashString(url)}`;
        const existing = await this.env.STORAGE.get(cacheKey);
        if (existing) continue;

        try {
          const response = await fetch(url, { headers: { 'User-Agent': 'QTC-TeamLogoCache/1.0' } });
          if (response.ok && response.body) {
            const buffer = await response.arrayBuffer();
            await this.env.STORAGE.put(cacheKey, buffer, {
              httpMetadata: { contentType: response.headers.get('Content-Type') || 'image/svg+xml' },
            });
            cached++;
          }
        } catch {}
      }
      console.log(`[LogoPrecacher] Cached ${cached} new flags`);
    } catch (e) {
      console.error(`[LogoPrecacher] Error: ${e}`);
    }
    // Schedule next run in 5 minutes
    await this.state.storage.setAlarm(Date.now() + 5 * 60 * 1000);
  }
}

// AI Analysis — runs as a one-shot Durable Object alarm, independent of request lifecycle
export class AiAnalyzer {
  private state: DurableObjectState;
  private env: Env;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(_request: Request): Promise<Response> {
    // Set a one-time alarm (2s delay) to process all matches without AI reports
    await this.state.storage.setAlarm(Date.now() + 2000);
    return new Response('AI analysis scheduled');
  }

  async alarm(): Promise<void> {
    try {
      const { loadAiReports } = await import('./services/db');
      const { generateAiReportForMatch } = await import('./services/ai');
      const allMatches = await loadAllMatches(this.env);
      const reportsDb = await loadAiReports(this.env);

      let processed = 0;
      for (const match of allMatches) {
        const mn = match.match_no_normalized;
        if (!mn || reportsDb[mn]) continue;

        try {
          await generateAiReportForMatch(this.env, match);
          reportsDb[mn] = {}; // mark in-memory to skip double-processing within same alarm
          processed++;
        } catch (e) {
          console.error(`[AiAnalyzer] ${mn} analysis failed: ${e}`);
        }
      }
      console.log(`[AiAnalyzer] Processed ${processed} match(es)`);
    } catch (e) {
      console.error(`[AiAnalyzer] Alarm error: ${e}`);
    }
  }
}