const SCHEDULE_KEY = "schedule.json";
const API_USAGE_KEY = "api-usage.json";
const TEAM_LOGO_MAX_BYTES = 512 * 1024;
const TEAM_LOGO_ALLOWED_HOSTS = new Set([
  "cdn.prod.website-files.com",
  "cdn.jsdelivr.net",
  "jsdelivr.net",
  "jsd.onmicrosoft.cn",
  "raw.githubusercontent.com",
  "upload.wikimedia.org",
  "commons.wikimedia.org",
  "images.fotmob.com",
  "images.onefootball.com",
  "media.api-sports.io",
  "crests.football-data.org",
  "logotyp.us",
  "logotypes.dev",
]);
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg"]);
const DATE_STRIP_OFFSETS = [-4, -3, -2, -1, 0, 1];
const WEEKDAY_INDEX = new Map([
  ["周一", 1],
  ["周二", 2],
  ["周三", 3],
  ["周四", 4],
  ["周五", 5],
  ["周六", 6],
  ["周日", 0],
  ["周天", 0],
]);
const WEEKDAY_LABELS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const BADGES = ["🔵", "🟢", "🟡", "🔴", "⚪", "🟣", "🟠"];

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith("/api/")) {
        return handleApi(request, env, ctx, url);
      }
      if (url.pathname.startsWith("/admin/")) {
        return handleAdmin(request, env, ctx, url);
      }
      if (url.pathname.startsWith("/daily-image/")) {
        return serveDailyImage(env, url.pathname);
      }
      return env.ASSETS.fetch(request);
    } catch (error) {
      return json({ ok: false, message: error?.message || String(error) }, 500);
    }
  },
};

export class AiAnalyzer {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch() {
    return json({ ok: true, message: "AI analyzer placeholder" });
  }
}

export class LogoPrecacher {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch() {
    return json({ ok: true, message: "Logo precacher placeholder" });
  }
}

export class ScorePoller {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch() {
    return json({ ok: true, message: "Score poller placeholder" });
  }
}

async function handleApi(request, env, ctx, url) {
  if (request.method !== "GET") return json({ ok: false, message: "Method not allowed" }, 405);

  if (url.pathname === "/api/schedule") {
    return json(await schedulePayload(env));
  }

  if (url.pathname === "/api/matches/today") {
    const data = await readScheduleData(env);
    const today = localDateKey();
    const matches = data.matches.filter((match) => {
      const dateKey = match.dateKey || dateKeyFromKickoff(match.kickoff);
      return dateKey === today;
    });
    return json({ date: today, matches, lastApiUpdate: data.lastApiUpdate || null });
  }

  if (url.pathname === "/api/update-status") {
    const data = await readScheduleData(env);
    const usage = await readJsonObject(env, API_USAGE_KEY, defaultApiUsage());
    return json({
      apiUsage: usage,
      lastApiUpdate: data.lastApiUpdate || null,
      lastImport: data.lastImport || null,
      configured: Boolean(env.API_FOOTBALL_API_KEY),
    });
  }

  if (url.pathname === "/api/image/latest") {
    return json(await latestImage(env, url.searchParams.get("kind") || ""));
  }

  if (url.pathname === "/api/team-logo") {
    return serveTeamLogo(env, url.searchParams.get("src") || "");
  }

  if (url.pathname === "/api/events") {
    return new Response("event: keep-alive\ndata: {}\n\n", {
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache",
      },
    });
  }

  return json({ ok: false, message: "Not found" }, 404);
}

async function handleAdmin(request, env, ctx, url) {
  if (request.method !== "POST") return json({ ok: false, message: "Method not allowed" }, 405);
  if (!isAdminRequest(request, env)) {
    return json({ ok: false, message: "管理员接口需要 X-Admin-Token 或 Bearer Token" }, 401);
  }

  const payload = await readRequestJson(request);

  if (url.pathname === "/admin/import-matches") {
    const records = payload.matches || payload.records || [];
    if (!Array.isArray(records)) throw new Error("matches 必须是数组");
    const data = await readScheduleData(env);
    const result = importSchedule(records.map(normalizeImportRecord), data, "admin-json");
    data.lastImport = {
      status: "success",
      type: "schedule",
      message: "后台导入赛程完成",
      errors: result.errors,
      importedAt: nowIso(),
    };
    await writeScheduleData(env, data);
    return json({ ok: true, result });
  }

  if (url.pathname === "/admin/edit-score") {
    const matchNo = normalizeMatchNo(payload.matchNo || payload.jcNo || payload["竞彩编号"] || "");
    if (!matchNo) throw new Error("必须提供 matchNo");
    const data = await readScheduleData(env);
    const target = data.matches.find((match) => normalizeMatchNo(match.matchNo) === matchNo);
    if (!target) throw new Error(`找不到比赛：${matchNo}`);
    const halfScore = String(payload.halfScore || payload.halfTimeScore || payload["半场比分"] || "").trim();
    const fullScore = String(payload.fullScore || payload.fullTimeScore || payload["全场比分"] || "").trim();
    if (halfScore) target.manualHalfTimeScore = normalizeScore(halfScore);
    if (fullScore) target.manualFullTimeScore = normalizeScore(fullScore);
    target.manualLocked = Boolean(payload.manualLocked ?? target.manualLocked);
    target.manualUpdatedAt = nowIso();
    target.lastUpdatedAt = nowIso();
    applyEffectiveScoreFields(target);
    await writeScheduleData(env, data);
    return json({ ok: true, matchNo });
  }

  if (url.pathname === "/admin/bind-api-match-id") {
    const matchNo = normalizeMatchNo(payload.matchNo || payload.jcNo || payload["竞彩编号"] || "");
    const apiMatchId = String(payload.apiMatchId || payload.matchId || "").trim();
    if (!matchNo || !apiMatchId) throw new Error("必须提供 matchNo 和 apiMatchId");
    const data = await readScheduleData(env);
    const target = data.matches.find((match) => normalizeMatchNo(match.matchNo) === matchNo);
    if (!target) throw new Error(`找不到比赛：${matchNo}`);
    target.apiMatchId = apiMatchId;
    target.lastUpdatedAt = nowIso();
    await writeScheduleData(env, data);
    return json({ ok: true, matchNo, apiMatchId });
  }

  if (url.pathname === "/admin/update-scores" || url.pathname === "/admin/match-api-football") {
    return json({
      ok: false,
      message: "GitHub 版 Worker 已保留接口；自动比分更新需要继续接入 API-Football 轮询逻辑。",
    }, 501);
  }

  return json({ ok: false, message: "Not found" }, 404);
}

async function schedulePayload(env) {
  const data = await readScheduleData(env);
  const grouped = new Map();
  const matches = [...data.matches].sort((a, b) => {
    const date = String(a.dateKey || "").localeCompare(String(b.dateKey || ""));
    if (date) return date;
    const no = matchNoNumber(a.matchNo) - matchNoNumber(b.matchNo);
    if (no) return no;
    return String(a.time || "").localeCompare(String(b.time || ""));
  });

  for (const match of matches) {
    ensureMatchFields(match);
    const dateKey = match.dateKey || dateKeyFromKickoff(match.kickoff);
    if (!dateKey) continue;
    if (!grouped.has(dateKey)) {
      grouped.set(dateKey, {
        dateKey,
        dateLabel: match.dateLabel || dateLabel(dateKey),
        dayNumber: match.dayNumber || String(Number(dateKey.slice(8, 10))),
        dayOfWeek: match.dayOfWeek || dayOfWeekLabel(dateKey),
        matches: [],
      });
    }
    grouped.get(dateKey).matches.push(match);
  }

  return { days: [...grouped.values()], lastImport: data.lastImport || null };
}

async function readScheduleData(env) {
  const raw = await readJsonObject(env, SCHEDULE_KEY, { matches: [], lastImport: null });
  if (Array.isArray(raw.matches)) {
    raw.matches.forEach(ensureMatchFields);
    return { matches: raw.matches, lastImport: raw.lastImport || null, lastApiUpdate: raw.lastApiUpdate || null };
  }
  if (Array.isArray(raw.days)) {
    const matches = raw.days.flatMap((day) => (day.matches || []).map((match) => ({ ...match, dateKey: match.dateKey || day.dateKey })));
    matches.forEach(ensureMatchFields);
    return { matches, lastImport: raw.lastImport || null, lastApiUpdate: raw.lastApiUpdate || null };
  }
  return { matches: [], lastImport: null, lastApiUpdate: null };
}

async function writeScheduleData(env, data) {
  const body = JSON.stringify({
    matches: data.matches || [],
    lastImport: data.lastImport || null,
    lastApiUpdate: data.lastApiUpdate || null,
  }, null, 2);
  await env.STORAGE.put(SCHEDULE_KEY, body, {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
  });
}

async function readJsonObject(env, key, fallback) {
  const object = await env.STORAGE.get(key);
  if (!object) return structuredClone(fallback);
  try {
    const text = typeof object.text === "function" ? await object.text() : JSON.stringify(await object.json());
    return JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch {
    return structuredClone(fallback);
  }
}

function importSchedule(records, data, fileName) {
  const byNo = new Map(data.matches.map((match) => [String(match.matchNo || "").trim(), match]));
  const errors = [];
  let added = 0;
  let overwritten = 0;

  records.forEach((row, index) => {
    try {
      const matchNo = normalizeMatchNo(row.match_no || row.matchNo || row.jcNo || "");
      if (!matchNo) throw new Error("竞彩编号为空");
      const home = String(row.home || "").trim();
      const away = String(row.away || "").trim();
      if (!home || !away) throw new Error("主队或客队为空");
      const kickoffDisplay = String(row.kickoff || "").trim();
      const kickoff = parseKickoff(kickoffDisplay);
      const day = dayPayload(scheduleDayForMatch(matchNo, kickoff));
      const existing = byNo.get(matchNo);
      const keepScore = existing && normalizeTeam(existing.home) === normalizeTeam(home) && normalizeTeam(existing.away) === normalizeTeam(away);
      const match = {
        matchNo,
        league: String(row.league || "").trim(),
        round: String(row.round || "").trim(),
        home,
        away,
        homeBadge: teamBadge(home),
        awayBadge: teamBadge(away),
        kickoff: kickoff.toISOString(),
        kickoffDisplay,
        dateKey: day.dateKey,
        dateLabel: day.dateLabel,
        dayNumber: day.dayNumber,
        dayOfWeek: day.dayOfWeek,
        time: day.time,
        fullScore: keepScore ? existing.fullScore || "" : "",
        halfScore: keepScore ? existing.halfScore || "" : "",
        homeScore: keepScore ? existing.homeScore || "" : "",
        awayScore: keepScore ? existing.awayScore || "" : "",
        apiMatchId: keepScore ? existing.apiMatchId || "" : "",
        matchStatus: keepScore ? existing.matchStatus || "未开始" : "未开始",
        currentScore: keepScore ? existing.currentScore || "" : "",
        penaltyScore: keepScore ? existing.penaltyScore || "" : "",
        extraTimeScore: keepScore ? existing.extraTimeScore || "" : "",
        scoreSource: keepScore ? existing.scoreSource || "pending" : "pending",
        manualHalfTimeScore: keepScore ? existing.manualHalfTimeScore || "" : "",
        manualFullTimeScore: keepScore ? existing.manualFullTimeScore || "" : "",
        apiHalfTimeScore: keepScore ? existing.apiHalfTimeScore || "" : "",
        apiFullTimeScore: keepScore ? existing.apiFullTimeScore || "" : "",
        manualLocked: keepScore ? Boolean(existing.manualLocked) : false,
        needsManualCheck: keepScore ? Boolean(existing.needsManualCheck) : false,
        hasAiReport: true,
        lastUpdatedAt: nowIso(),
        sourceFile: fileName,
        updatedAt: nowIso(),
        createdAt: existing?.createdAt || nowIso(),
      };
      ensureMatchFields(match);
      if (existing) {
        Object.assign(existing, match);
        overwritten += 1;
      } else {
        data.matches.push(match);
        byNo.set(matchNo, match);
        added += 1;
      }
    } catch (error) {
      errors.push(`第${row.__row || index + 1}行：${error.message}`);
    }
  });

  return { added, overwritten, errors };
}

function normalizeImportRecord(item, index) {
  const teams = item.teams || item["双方队伍"] || "";
  const splitTeams = splitTeamsText(teams);
  return {
    __row: item.__row || index + 1,
    match_no: item.match_no || item.matchNo || item.jcNo || item["竞彩编号"],
    league: item.league || item.leagueName || item["赛事种类"] || item["赛事"],
    round: item.round || item["轮次"] || "",
    home: item.home || item.homeTeamName || item["主队"] || splitTeams[0],
    away: item.away || item.awayTeamName || item["客队"] || splitTeams[1],
    kickoff: item.kickoff || item.startTime || item["开赛日期"] || item["开赛时间"],
  };
}

function splitTeamsText(text) {
  const normalized = String(text || "").replace(/\s+/g, "");
  const parts = normalized.split(/(?:VS|vs|v|－|-|—|对|：|:)/).filter(Boolean);
  return [parts[0] || "", parts[1] || ""];
}

function ensureMatchFields(match) {
  match.fullScore ||= "";
  match.halfScore ||= "";
  match.homeScore ||= "";
  match.awayScore ||= "";
  match.matchStatus ||= "未开始";
  match.currentScore ||= "";
  match.penaltyScore ||= "";
  match.extraTimeScore ||= "";
  match.scoreSource ||= "pending";
  match.manualHalfTimeScore ||= "";
  match.manualFullTimeScore ||= "";
  match.apiHalfTimeScore ||= "";
  match.apiFullTimeScore ||= "";
  match.hasAiReport = match.hasAiReport !== false;
  applyEffectiveScoreFields(match);
}

function applyEffectiveScoreFields(match) {
  const full = match.manualFullTimeScore || match.apiFullTimeScore || match.currentScore || match.fullScore || "";
  const half = match.manualHalfTimeScore || match.apiHalfTimeScore || match.halfScore || "";
  match.fullScore = full;
  match.halfScore = half;
  const score = normalizeScore(full);
  if (score) {
    const [home, away] = score.split("-");
    match.homeScore = home || "";
    match.awayScore = away || "";
  }
}

function parseKickoff(value) {
  const text = String(value || "").trim().replace(/\s+/g, " ");
  let match = text.match(/(?:(\d{4})[-/])?(\d{1,2})[-/](\d{1,2})\s+(\d{1,2}):(\d{2})/);
  if (!match) match = text.match(/(?:(\d{4})年)?(\d{1,2})月(\d{1,2})日\s*(\d{1,2}):(\d{2})/);
  if (!match) {
    const parsed = new Date(text);
    if (!Number.isNaN(parsed.getTime())) return parsed;
    throw new Error(`开赛日期格式无法识别：${value}`);
  }
  const year = Number(match[1] || new Date().getFullYear());
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  return new Date(Date.UTC(year, month - 1, day, hour - 8, minute, 0));
}

function scheduleDayForMatch(matchNo, kickoff) {
  const weekday = String(matchNo || "").match(/周[一二三四五六日天]/)?.[0];
  if (!weekday || !WEEKDAY_INDEX.has(weekday)) return kickoff;
  const target = WEEKDAY_INDEX.get(weekday);
  const today = startOfLocalDay(new Date());
  for (const offset of DATE_STRIP_OFFSETS) {
    const candidate = new Date(today.getTime() + offset * 86400000);
    if (candidate.getDay() === target) {
      return new Date(Date.UTC(
        candidate.getFullYear(),
        candidate.getMonth(),
        candidate.getDate(),
        Number(formatInShanghai(kickoff, "hour")),
        Number(formatInShanghai(kickoff, "minute")),
      ));
    }
  }
  return kickoff;
}

function dayPayload(date) {
  const dateKey = localDateKey(date);
  return {
    dateKey,
    dateLabel: dateLabel(dateKey),
    dayNumber: String(Number(dateKey.slice(8, 10))),
    dayOfWeek: dayOfWeekLabel(dateKey),
    time: `${formatInShanghai(date, "hour")}:${formatInShanghai(date, "minute")}`,
  };
}

function dateLabel(dateKey) {
  return `${Number(dateKey.slice(5, 7))}月${Number(dateKey.slice(8, 10))}日`;
}

function dayOfWeekLabel(dateKey) {
  const date = new Date(`${dateKey}T00:00:00+08:00`);
  return WEEKDAY_LABELS[date.getDay()];
}

function localDateKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function dateKeyFromKickoff(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return localDateKey(date);
}

function formatInShanghai(date, part) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  return parts.find((item) => item.type === part)?.value || "00";
}

function startOfLocalDay(date) {
  const key = localDateKey(date);
  return new Date(`${key}T00:00:00+08:00`);
}

function normalizeMatchNo(value) {
  const text = String(value || "").replace(/\s+/g, "").trim();
  const weekday = text.match(/周[一二三四五六日天]/)?.[0]?.replace("周天", "周日") || "";
  const number = text.match(/(\d{1,3})\D*$/)?.[1] || "";
  if (weekday && number) return `${weekday}${String(Number(number)).padStart(3, "0")}`;
  if (number) return String(Number(number)).padStart(3, "0");
  return text;
}

function matchNoNumber(value) {
  return Number(String(value || "").match(/(\d{1,3})\D*$/)?.[1] || 999999);
}

function normalizeTeam(value) {
  return String(value || "").replace(/\s+/g, "").toLowerCase();
}

function normalizeScore(value) {
  const match = String(value || "").match(/(\d+)\D+(\d+)/);
  return match ? `${Number(match[1])}-${Number(match[2])}` : "";
}

function teamBadge(team) {
  const total = [...String(team || "")].reduce((sum, char) => sum + char.codePointAt(0), 0);
  return BADGES[total % BADGES.length];
}

async function latestImage(env, kind) {
  if (!kind || !env.STORAGE) return { found: false, kind };
  const prefix = `daily-image/${kind}/`;
  const listed = await env.STORAGE.list({ prefix, limit: 100 });
  const images = listed.objects.filter((object) => IMAGE_EXTENSIONS.has(extension(object.key)));
  if (!images.length) return { found: false, kind };
  images.sort((a, b) => new Date(b.uploaded || 0) - new Date(a.uploaded || 0));
  const latest = images[0];
  const name = latest.key.slice(prefix.length);
  return { found: true, kind, name, url: `/daily-image/${kind}/${encodeURIComponent(name)}?v=${Date.parse(latest.uploaded || 0) || Date.now()}` };
}

async function serveDailyImage(env, pathname) {
  const match = pathname.match(/^\/daily-image\/([^/]+)\/(.+)$/);
  if (!match) return new Response("Not found", { status: 404 });
  const key = `daily-image/${decodeURIComponent(match[1])}/${decodeURIComponent(match[2])}`;
  const object = await env.STORAGE.get(key);
  if (!object) return new Response("Not found", { status: 404 });
  return new Response(object.body, {
    headers: {
      "content-type": object.httpMetadata?.contentType || contentTypeForKey(key),
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}

async function serveTeamLogo(env, src) {
  if (!validTeamLogoSource(src)) return new Response("Bad request", { status: 400 });
  const cacheKey = `team-logo-cache/${await sha256Hex(src)}${extension(new URL(src).pathname) || ".img"}`;
  const cached = await env.STORAGE.get(cacheKey);
  if (cached) {
    return new Response(cached.body, {
      headers: {
        "content-type": cached.httpMetadata?.contentType || contentTypeForKey(cacheKey),
        "cache-control": "public, max-age=31536000, immutable",
      },
    });
  }

  const upstream = await fetch(src, {
    headers: {
      accept: "image/avif,image/webp,image/svg+xml,image/png,image/*,*/*;q=0.8",
      "user-agent": "tc888-team-logo-cache/1.0",
    },
  });
  if (!upstream.ok) return new Response("Not found", { status: 404 });
  const contentType = upstream.headers.get("content-type") || contentTypeForKey(src);
  if (!contentType.startsWith("image/")) return new Response("Not found", { status: 404 });
  const bytes = await upstream.arrayBuffer();
  if (bytes.byteLength > TEAM_LOGO_MAX_BYTES) return new Response("Too large", { status: 413 });
  await env.STORAGE.put(cacheKey, bytes, {
    httpMetadata: { contentType },
    customMetadata: { source: src },
  });
  return new Response(bytes, {
    headers: {
      "content-type": contentType,
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}

function validTeamLogoSource(src) {
  try {
    const parsed = new URL(src);
    return parsed.protocol === "https:" && TEAM_LOGO_ALLOWED_HOSTS.has(parsed.hostname.toLowerCase()) && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function contentTypeForKey(key) {
  const ext = extension(key);
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  if (ext === ".json") return "application/json; charset=utf-8";
  return "application/octet-stream";
}

function extension(pathname) {
  const match = String(pathname || "").toLowerCase().match(/\.[a-z0-9]+(?:$|\?)/);
  return match ? match[0].replace("?", "") : "";
}

function defaultApiUsage() {
  return {
    date: localDateKey(),
    used: 0,
    remaining: 100,
    limit_count: 100,
    last_updated_at: null,
    last_request_at: null,
    last_success_at: null,
    last_error: "",
    consecutive_failures: 0,
    pause_until: null,
  };
}

function isAdminRequest(request, env) {
  const auth = request.headers.get("authorization") || "";
  const headerToken = request.headers.get("x-admin-token") || "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : headerToken;
  return Boolean(env.ADMIN_TOKEN && token === env.ADMIN_TOKEN);
}

async function readRequestJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function nowIso() {
  return new Date().toISOString();
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
