// API-Football 比分数据服务 - 从 server.py 迁移

import { Env } from '../index';
import { nowISO, normalizeLookup, parseScoreSafe, todayKey, aliasMatch, leagueMatch } from '../utils/helpers';
import { STATUS_MAP, TERMINAL_STATUS, HALF_TIME_LABEL, SCORE_POLL_MIN_REMAINING, DEFAULT_API_LIMIT } from '../data/constants';
import { TEAM_NAME_ALIASES } from '../data/team-data';
import { DEFAULT_LEAGUE_ALIASES } from '../data/team-data';
import { loadApiUsage, saveApiUsage, loadAllMatches, upsertMatch, type MatchRecord } from './db';

export async function fetchApiFootballPage(env: Env, apiDate: string): Promise<Record<string, unknown>[]> {
  const url = `${env.API_FOOTBALL_BASE_URL || 'https://v3.football.api-sports.io'}/fixtures?date=${apiDate}`;
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'QTC-APIFootballScoreUpdater/1.0',
      'x-apisports-key': env.API_FOOTBALL_API_KEY,
    },
  });

  if (!response.ok) {
    throw new Error(`API-Football 请求失败：HTTP ${response.status}`);
  }

  const payload = await response.json() as Record<string, unknown>;

  // Check for API errors in JSON response
  const errors = payload.errors as Record<string, unknown> | undefined;
  if (errors && typeof errors === 'object' && Object.keys(errors).length > 0) {
    throw new Error(Object.values(errors).flat().join('; '));
  }

  return extractApiMatches(payload);
}

function extractApiMatches(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload.filter(item => typeof item === 'object' && item !== null) as Record<string, unknown>[];
  if (typeof payload !== 'object' || payload === null) return [];

  const obj = payload as Record<string, unknown>;
  for (const key of ['data', 'matches', 'results', 'response']) {
    const value = obj[key];
    if (Array.isArray(value)) {
      return value.filter(item => typeof item === 'object' && item !== null) as Record<string, unknown>[];
    }
    if (typeof value === 'object' && value !== null) {
      const nested = extractApiMatches(value);
      if (nested.length) return nested;
    }
  }
  return [];
}

export function extractApiMatchId(item: Record<string, unknown>): string {
  return nestedGet(item, [['id'], ['matchId'], ['match_id'], ['fixture', 'id'], ['event', 'id']]);
}

export function extractApiHome(item: Record<string, unknown>): string {
  return firstNestedName(item, [['homeTeam'], ['home_team'], ['home'], ['teams', 'home'], ['participants', 'home'], ['localteam']]);
}

export function extractApiAway(item: Record<string, unknown>): string {
  return firstNestedName(item, [['awayTeam'], ['away_team'], ['away'], ['teams', 'away'], ['participants', 'away'], ['visitorteam']]);
}

export function extractApiLeague(item: Record<string, unknown>): string {
  return firstNestedName(item, [['league'], ['competition'], ['tournament'], ['season', 'league']]);
}

export function extractApiStart(item: Record<string, unknown>): Date | null {
  const value = nestedGet(item, [['date'], ['datetime'], ['startTime'], ['start_time'], ['kickoff'], ['fixture', 'date'], ['time', 'starting_at', 'date_time'], ['time', 'starting_at']]);
  return parseIsoDatetime(value);
}

export function extractApiStatusRaw(item: Record<string, unknown>): string {
  return nestedGet(item, [['fixture', 'status', 'long'], ['state', 'description'], ['status', 'description'], ['status', 'long'], ['status', 'short']]);
}

export function mapApiStatus(rawStatus: string): string {
  const key = normalizeLookup(rawStatus);
  for (const [source, label] of Object.entries(STATUS_MAP)) {
    if (normalizeLookup(source) === key) return label;
  }
  for (const [source, label] of Object.entries(STATUS_MAP)) {
    const ns = normalizeLookup(source);
    if (ns.includes(key) || key.includes(ns)) return label;
  }
  return rawStatus ? '异常' : '未开始';
}

export function extractScoreCandidates(item: Record<string, unknown>): Record<string, string> {
  const current = scorePairFromValue(nestedGet(item, [['score', 'fulltime'], ['goals'], ['state', 'score', 'current'], ['score', 'current'], ['currentScore']]));
  const half = scorePairFromValue(nestedGet(item, [['score', 'halftime'], ['state', 'score', 'halftime'], ['state', 'score', 'halfTime'], ['halfTimeScore'], ['halftimeScore']]));
  const full = scorePairFromValue(nestedGet(item, [['score', 'fulltime'], ['state', 'score', 'fulltime'], ['scores', 'fulltime'], ['fullTimeScore']]));
  const penalty = scorePairFromValue(nestedGet(item, [['state', 'score', 'penalty'], ['status', 'score', 'penalty'], ['score', 'penalty'], ['scores', 'penalty'], ['penaltyScore']]));
  const extra = scorePairFromValue(nestedGet(item, [['state', 'score', 'extratime'], ['state', 'score', 'extraTime'], ['score', 'extratime'], ['score', 'extraTime'], ['scores', 'extraTime'], ['extraTimeScore']]));
  return { current, half, full, penalty, extra };
}

function nestedGet(obj: unknown, paths: string[][]): string {
  if (typeof obj !== 'object' || obj === null) return '';
  for (const path of paths) {
    let current: unknown = obj;
    for (const key of path) {
      if (typeof current === 'object' && current !== null && key in (current as Record<string, unknown>)) {
        current = (current as Record<string, unknown>)[key];
      } else {
        current = null;
        break;
      }
    }
    if (current !== null && current !== undefined && current !== '') {
      return String(current);
    }
  }
  return '';
}

function firstNestedName(obj: unknown, paths: string[][]): string {
  const value = nestedGet(obj, paths);
  if (value) {
    try {
      const parsed = JSON.parse(value);
      if (typeof parsed === 'object' && parsed !== null) {
        return String(parsed.name || parsed.displayName || parsed.title || parsed.shortName || '');
      }
    } catch {}
  }
  return value;
}

function parseIsoDatetime(value: unknown): Date | null {
  if (typeof value === 'number') {
    let timestamp = value;
    if (timestamp > 10_000_000_000) timestamp /= 1000;
    return new Date(timestamp * 1000);
  }
  const text = String(value ?? '').trim();
  if (!text) return null;
  try {
    return new Date(text.endsWith('Z') ? text.slice(0, -1) + '+00:00' : text);
  } catch {
    return null;
  }
}

function scorePairFromValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'object' && value !== null) {
    const obj = value as Record<string, unknown>;
    const home = nestedGet(obj, [['home'], ['homeScore'], ['home_score'], ['current', 'home'], ['goals', 'home']]);
    const away = nestedGet(obj, [['away'], ['awayScore'], ['away_score'], ['current', 'away'], ['goals', 'away']]);
    if (/^\d+$/.test(home) && /^\d+$/.test(away)) {
      return `${home}∶${away}`;
    }
  }
  const parsed = parseScoreSafe(value);
  return parsed ? parsed[2] : '';
}

export function findApiMatch(localMatch: MatchRecord, apiMatches: Record<string, unknown>[]): [Record<string, unknown> | null, Record<string, unknown>] {
  // Try by API match ID first
  if (localMatch.api_match_id) {
    const apiIndex: Record<string, Record<string, unknown>> = {};
    for (const item of apiMatches) {
      const id = extractApiMatchId(item);
      if (id) apiIndex[id] = item;
    }
    if (apiIndex[localMatch.api_match_id]) {
      return [apiIndex[localMatch.api_match_id], { method: 'id', candidates: 1 }];
    }
  }

  const kickoffTime = localMatch.kickoff ? new Date(localMatch.kickoff) : null;
  const candidates: Record<string, unknown>[] = [];

  for (const item of apiMatches) {
    const apiHome = extractApiHome(item);
    const apiAway = extractApiAway(item);
    const apiLeague = extractApiLeague(item);
    const apiStart = extractApiStart(item);

    const [homeOk, homeLabel, homeScore] = aliasMatch(localMatch.home, apiHome, TEAM_NAME_ALIASES);
    const [awayOk, awayLabel, awayScore] = aliasMatch(localMatch.away, apiAway, TEAM_NAME_ALIASES);
    const [leagueOk] = leagueMatch(localMatch.league, apiLeague, DEFAULT_LEAGUE_ALIASES);

    if (!homeOk || !awayOk) continue;

    if (kickoffTime && apiStart) {
      const timeDelta = Math.abs((kickoffTime.getTime() - apiStart.getTime()) / 60000);
      if (timeDelta > 30) continue;
    }

    const score = homeScore + awayScore + (leagueOk ? 0.25 : 0);
    candidates.push({ item, score, homeLabel, awayLabel, leagueLabel: apiLeague });
  }

  if (candidates.length === 1) {
    return [candidates[0].item as Record<string, unknown>, { method: 'alias', candidates: 1, ...candidates[0] }];
  }
  if (candidates.length > 1) {
    candidates.sort((a, b) => (b.score as number) - (a.score as number));
    const top = candidates[0];
    const second = candidates[1];
    if ((top.score as number) - (second.score as number) >= 0.35) {
      return [top.item as Record<string, unknown>, { method: 'alias', candidates: candidates.length, ...top }];
    }
    return [null, { method: 'ambiguous', candidates: candidates.length }];
  }
  return [null, { method: 'none', candidates: 0 }];
}

export function updateMatchFromApi(match: MatchRecord, apiMatch: Record<string, unknown>, matchInfo: Record<string, unknown>): boolean {
  let changed = false;

  const apiId = extractApiMatchId(apiMatch);
  if (apiId && match.api_match_id !== apiId) {
    match.api_match_id = apiId;
    changed = true;
  }

  for (const [field, infoKey] of [['home_team_alias_matched', 'homeLabel'], ['away_team_alias_matched', 'awayLabel'], ['league_alias_matched', 'leagueLabel']] as const) {
    const value = String(matchInfo[infoKey] ?? '');
    if (value && (match as unknown as Record<string, string>)[field] !== value) {
      (match as unknown as Record<string, string>)[field] = value;
      changed = true;
    }
  }

  const statusRaw = extractApiStatusRaw(apiMatch);
  const statusLabel = mapApiStatus(statusRaw);
  const scores = extractScoreCandidates(apiMatch);

  const fulltime = scores.full;
  const halftime = scores.half;

  if (statusLabel !== match.match_status) {
    match.match_status = statusLabel;
    changed = true;
  }
  if (statusRaw && statusRaw !== match.last_api_state) {
    match.last_api_state = statusRaw;
    changed = true;
  }

  if (fulltime && parseScoreSafe(fulltime)) {
    if (match.current_score !== fulltime) {
      match.current_score = fulltime;
      changed = true;
    }
  }

  if (halftime && match.api_half_time_score !== halftime) {
    match.api_half_time_score = halftime;
    changed = true;
  }

  if (statusLabel === HALF_TIME_LABEL && fulltime && parseScoreSafe(fulltime)) {
    if (match.api_half_time_score !== fulltime) {
      match.api_half_time_score = fulltime;
      changed = true;
    }
  }

  if (fulltime && parseScoreSafe(fulltime) && match.api_full_time_score !== fulltime) {
    match.api_full_time_score = fulltime;
    changed = true;
  }

  if (scores.penalty) match.penalty_score = scores.penalty;
  if (scores.extra) match.extra_time_score = scores.extra;

  if (changed || fulltime) {
    const now = nowISO();
    match.api_updated_at = now;
    match.updated_at = now;
    match.last_updated_at = now;
    if (match.manual_full_time_score || match.manual_half_time_score) {
      if (match.api_full_time_score || match.api_half_time_score) {
        match.score_source = 'api_over_manual';
      }
    } else if (match.api_full_time_score || match.api_half_time_score || match.current_score) {
      match.score_source = 'api';
    }
    applyEffectiveScoreFields(match);
  }

  return changed;
}

export function applyEffectiveScoreFields(match: MatchRecord): void {
  const fullScore = match.api_full_time_score || match.manual_full_time_score || match.current_score || '';
  const halfScore = match.api_half_time_score || match.manual_half_time_score || '';
  const parsed = parseScoreSafe(fullScore);

  match.full_score = fullScore;
  match.half_score = halfScore;
  if (parsed) {
    [match.home_score, match.away_score] = [parsed[0], parsed[1]];
  } else if (fullScore) {
    match.home_score = '';
    match.away_score = '';
    match.needs_manual_check = 1;
  } else {
    match.home_score = '';
    match.away_score = '';
  }
}

export async function runApiFootballUpdate(env: Env, requestedDate: string = ''): Promise<Record<string, unknown>> {
  const usage = await loadApiUsage(env);
  const apiDailyLimit = parseInt(String(env.API_DAILY_LIMIT || DEFAULT_API_LIMIT));

  if (!env.API_FOOTBALL_API_KEY) {
    return { status: 'failed', updated: 0, matched: 0, errors: ['未配置 API_FOOTBALL_API_KEY'] };
  }

  if (Number(usage.remaining) <= SCORE_POLL_MIN_REMAINING) {
    return { status: 'failed', updated: 0, matched: 0, errors: ['额度不足'] };
  }

  const matches = await loadAllMatches(env);
  const apiDates = requestedDate ? [requestedDate] : [...new Set(matches.filter(m => !TERMINAL_STATUS.has(m.match_status)).map(m => m.date_key))].sort().reverse().slice(0, 5);

  let updated = 0;
  let matched = 0;
  const errors: string[] = [];
  const touched: string[] = [];

  for (const apiDate of apiDates) {
    let apiMatches: Record<string, unknown>[];
    try {
      apiMatches = await fetchApiFootballPage(env, apiDate);
    } catch (e) {
      errors.push(String(e));
      continue;
    }

    for (const match of matches) {
      if (match.date_key !== apiDate) continue;
      if (TERMINAL_STATUS.has(match.match_status)) continue;

      const [apiMatch, info] = findApiMatch(match, apiMatches);
      if (!apiMatch) continue;

      matched++;
      if (updateMatchFromApi(match, apiMatch, info)) {
        updated++;
        await upsertMatch(env, match);
      }
      touched.push(match.match_no);
    }
  }

  // Update usage
  usage.used = Number(usage.used) + 1;
  usage.remaining = Math.max(0, apiDailyLimit - Number(usage.used));
  usage.last_request_at = nowISO();
  usage.last_success_at = nowISO();
  usage.last_updated_at = nowISO();
  await saveApiUsage(env, usage);

  return {
    status: errors.length ? 'partial' : 'success',
    updated,
    matched,
    errors: errors.slice(0, 20),
    updatedMatches: touched.slice(0, 50),
    updatedAt: nowISO(),
    apiUsage: usage,
  };
}