// D1 数据库操作服务

import { Env } from '../index';
import { todayKey } from '../utils/helpers';

export interface MatchRecord {
  id?: number;
  match_no: string;
  match_no_normalized: string;
  league: string;
  round: string;
  home: string;
  away: string;
  home_badge: string;
  away_badge: string;
  kickoff: string;
  date_key: string;
  date_label: string;
  day_number: string;
  day_of_week: string;
  time: string;
  full_score: string;
  half_score: string;
  home_score: string;
  away_score: string;
  api_match_id: string;
  home_team_alias_matched: string;
  away_team_alias_matched: string;
  league_alias_matched: string;
  match_status: string;
  current_score: string;
  penalty_score: string;
  extra_time_score: string;
  score_source: string;
  manual_half_time_score: string;
  manual_full_time_score: string;
  api_half_time_score: string;
  api_full_time_score: string;
  manual_locked: number;
  needs_manual_check: number;
  last_api_state: string;
  last_updated_at: string;
  api_updated_at: string;
  manual_updated_at: string;
  source_file: string;
  created_at: string;
  updated_at: string;
}

export function emptyMatchFields(matchNo: string = '') {
  return {
    match_no: '',
    match_no_normalized: '',
    league: '',
    round: '',
    home: '',
    away: '',
    home_badge: '',
    away_badge: '',
    kickoff: '',
    date_key: '',
    date_label: '',
    day_number: '',
    day_of_week: '',
    time: '',
    full_score: '',
    half_score: '',
    home_score: '',
    away_score: '',
    api_match_id: '',
    home_team_alias_matched: '',
    away_team_alias_matched: '',
    league_alias_matched: '',
    match_status: '未开始',
    current_score: '',
    penalty_score: '',
    extra_time_score: '',
    score_source: 'pending',
    manual_half_time_score: '',
    manual_full_time_score: '',
    api_half_time_score: '',
    api_full_time_score: '',
    manual_locked: 0,
    needs_manual_check: 0,
    last_api_state: '',
    last_updated_at: '',
    api_updated_at: '',
    manual_updated_at: '',
    source_file: '',
    created_at: '',
    updated_at: '',
  };
}

export function rowToMatch(row: Record<string, unknown>): MatchRecord {
  return {
    match_no: String(row.match_no ?? ''),
    match_no_normalized: String(row.match_no_normalized ?? ''),
    league: String(row.league ?? ''),
    round: String(row.round ?? ''),
    home: String(row.home ?? ''),
    away: String(row.away ?? ''),
    home_badge: String(row.home_badge ?? ''),
    away_badge: String(row.away_badge ?? ''),
    kickoff: String(row.kickoff ?? ''),
    date_key: String(row.date_key ?? ''),
    date_label: String(row.date_label ?? ''),
    day_number: String(row.day_number ?? ''),
    day_of_week: String(row.day_of_week ?? ''),
    time: String(row.time ?? ''),
    full_score: String(row.full_score ?? ''),
    half_score: String(row.half_score ?? ''),
    home_score: String(row.home_score ?? ''),
    away_score: String(row.away_score ?? ''),
    api_match_id: String(row.api_match_id ?? ''),
    home_team_alias_matched: String(row.home_team_alias_matched ?? ''),
    away_team_alias_matched: String(row.away_team_alias_matched ?? ''),
    league_alias_matched: String(row.league_alias_matched ?? ''),
    match_status: String(row.match_status ?? '未开始'),
    current_score: String(row.current_score ?? ''),
    penalty_score: String(row.penalty_score ?? ''),
    extra_time_score: String(row.extra_time_score ?? ''),
    score_source: String(row.score_source ?? 'pending'),
    manual_half_time_score: String(row.manual_half_time_score ?? ''),
    manual_full_time_score: String(row.manual_full_time_score ?? ''),
    api_half_time_score: String(row.api_half_time_score ?? ''),
    api_full_time_score: String(row.api_full_time_score ?? ''),
    manual_locked: Number(row.manual_locked ?? 0),
    needs_manual_check: Number(row.needs_manual_check ?? 0),
    last_api_state: String(row.last_api_state ?? ''),
    last_updated_at: String(row.last_updated_at ?? ''),
    api_updated_at: String(row.api_updated_at ?? ''),
    manual_updated_at: String(row.manual_updated_at ?? ''),
    source_file: String(row.source_file ?? ''),
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? ''),
  };
}

export async function loadAllMatches(env: Env): Promise<MatchRecord[]> {
  const { results } = await env.DB.prepare('SELECT * FROM matches ORDER BY date_key, match_no_normalized').all<Record<string, unknown>>();
  return (results || []).map(rowToMatch);
}

export async function findMatchByNo(env: Env, normalizedNo: string): Promise<MatchRecord | null> {
  const row = await env.DB.prepare('SELECT * FROM matches WHERE match_no_normalized = ?').bind(normalizedNo).first<Record<string, unknown>>();
  return row ? rowToMatch(row) : null;
}

export async function findMatchByApiId(env: Env, apiId: string): Promise<MatchRecord | null> {
  const row = await env.DB.prepare('SELECT * FROM matches WHERE api_match_id = ?').bind(apiId).first<Record<string, unknown>>();
  return row ? rowToMatch(row) : null;
}

export async function upsertMatch(env: Env, match: MatchRecord): Promise<void> {
  const existing = await findMatchByNo(env, match.match_no_normalized);
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

  if (existing) {
    await env.DB.prepare(`UPDATE matches SET 
      match_no=?, league=?, round=?, home=?, away=?, home_badge=?, away_badge=?,
      kickoff=?, date_key=?, date_label=?, day_number=?, day_of_week=?, time=?,
      full_score=?, half_score=?, home_score=?, away_score=?,
      api_match_id=?, home_team_alias_matched=?, away_team_alias_matched=?, league_alias_matched=?,
      match_status=?, current_score=?, penalty_score=?, extra_time_score=?, score_source=?,
      manual_half_time_score=?, manual_full_time_score=?, api_half_time_score=?, api_full_time_score=?,
      manual_locked=?, needs_manual_check=?, last_api_state=?,
      last_updated_at=?, api_updated_at=?, manual_updated_at=?,
      source_file=?, updated_at=?
      WHERE match_no_normalized=?`
    ).bind(
      match.match_no, match.league, match.round, match.home, match.away, match.home_badge, match.away_badge,
      match.kickoff, match.date_key, match.date_label, match.day_number, match.day_of_week, match.time,
      match.full_score, match.half_score, match.home_score, match.away_score,
      match.api_match_id, match.home_team_alias_matched, match.away_team_alias_matched, match.league_alias_matched,
      match.match_status, match.current_score, match.penalty_score, match.extra_time_score, match.score_source,
      match.manual_half_time_score, match.manual_full_time_score, match.api_half_time_score, match.api_full_time_score,
      match.manual_locked, match.needs_manual_check, match.last_api_state,
      now, match.api_updated_at, match.manual_updated_at,
      match.source_file, now,
      match.match_no_normalized,
    ).run();
  } else {
    await env.DB.prepare(`INSERT INTO matches (
      match_no, match_no_normalized, league, round, home, away, home_badge, away_badge,
      kickoff, date_key, date_label, day_number, day_of_week, time,
      full_score, half_score, home_score, away_score,
      api_match_id, home_team_alias_matched, away_team_alias_matched, league_alias_matched,
      match_status, current_score, penalty_score, extra_time_score, score_source,
      manual_half_time_score, manual_full_time_score, api_half_time_score, api_full_time_score,
      manual_locked, needs_manual_check, last_api_state,
      last_updated_at, api_updated_at, manual_updated_at,
      source_file, created_at, updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).bind(
      match.match_no, match.match_no_normalized, match.league, match.round, match.home, match.away, match.home_badge, match.away_badge,
      match.kickoff, match.date_key, match.date_label, match.day_number, match.day_of_week, match.time,
      match.full_score, match.half_score, match.home_score, match.away_score,
      match.api_match_id, match.home_team_alias_matched, match.away_team_alias_matched, match.league_alias_matched,
      match.match_status, match.current_score, match.penalty_score, match.extra_time_score, match.score_source,
      match.manual_half_time_score, match.manual_full_time_score, match.api_half_time_score, match.api_full_time_score,
      match.manual_locked, match.needs_manual_check, match.last_api_state,
      now, now, now,
      match.source_file, now, now,
    ).run();
  }
}

export async function purgeOldMatches(env: Env): Promise<number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 5);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const { meta } = await env.DB.prepare('DELETE FROM matches WHERE date_key < ?').bind(cutoffStr).run();
  return meta.changes || 0;
}

export async function loadApiUsage(env: Env): Promise<Record<string, unknown>> {
  const today = todayKey();
  const row = await env.DB.prepare('SELECT * FROM api_usage WHERE date = ?').bind(today).first<Record<string, unknown>>();
  if (row) return row;
  return {
    date: today,
    used: 0,
    remaining: 100,
    limit_count: 100,
    last_updated_at: null,
    last_request_at: null,
    last_success_at: null,
    last_error: '',
    consecutive_failures: 0,
    pause_until: null,
  };
}

export async function saveApiUsage(env: Env, usage: Record<string, unknown>): Promise<void> {
  const today = todayKey();
  const existing = await env.DB.prepare('SELECT id FROM api_usage WHERE date = ?').bind(today).first();
  if (existing) {
    await env.DB.prepare(`UPDATE api_usage SET used=?, remaining=?, limit_count=?, last_updated_at=?, last_request_at=?, last_success_at=?, last_error=?, consecutive_failures=?, pause_until=? WHERE date=?`)
      .bind(usage.used, usage.remaining, usage.limit_count, usage.last_updated_at, usage.last_request_at, usage.last_success_at, usage.last_error, usage.consecutive_failures, usage.pause_until, today).run();
  } else {
    await env.DB.prepare(`INSERT INTO api_usage (date, used, remaining, limit_count, last_updated_at, last_request_at, last_success_at, last_error, consecutive_failures, pause_until) VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .bind(today, usage.used || 0, usage.remaining || 100, usage.limit_count || 100, usage.last_updated_at, usage.last_request_at, usage.last_success_at, usage.last_error, usage.consecutive_failures || 0, usage.pause_until).run();
  }
}

export async function loadAiReports(env: Env): Promise<Record<string, { deepseek?: { content: string; generatedAt: string }; doubao?: { content: string; generatedAt: string } }>> {
  const { results } = await env.DB.prepare('SELECT * FROM ai_reports').all<{ match_no_normalized: string; deepseek_content: string; deepseek_generated_at: string; doubao_content: string; doubao_generated_at: string }>();
  const reports: Record<string, { deepseek?: { content: string; generatedAt: string }; doubao?: { content: string; generatedAt: string } }> = {};
  for (const row of (results || [])) {
    const entry: Record<string, { content: string; generatedAt: string }> = {};
    if (row.deepseek_content) {
      entry.deepseek = { content: row.deepseek_content, generatedAt: row.deepseek_generated_at };
    }
    if (row.doubao_content) {
      entry.doubao = { content: row.doubao_content, generatedAt: row.doubao_generated_at };
    }
    reports[row.match_no_normalized] = entry;
  }
  return reports;
}

export async function saveAiReport(env: Env, matchNoNorm: string, provider: string, content: string, generatedAt: string): Promise<void> {
  const existing = await env.DB.prepare('SELECT * FROM ai_reports WHERE match_no_normalized = ?').bind(matchNoNorm).first();
  if (existing) {
    if (provider === 'deepseek') {
      await env.DB.prepare('UPDATE ai_reports SET deepseek_content=?, deepseek_generated_at=? WHERE match_no_normalized=?')
        .bind(content, generatedAt, matchNoNorm).run();
    } else {
      await env.DB.prepare('UPDATE ai_reports SET doubao_content=?, doubao_generated_at=? WHERE match_no_normalized=?')
        .bind(content, generatedAt, matchNoNorm).run();
    }
  } else {
    await env.DB.prepare('INSERT INTO ai_reports (match_no_normalized, deepseek_content, deepseek_generated_at, doubao_content, doubao_generated_at) VALUES (?,?,?,?,?)')
      .bind(matchNoNorm, provider === 'deepseek' ? content : null, provider === 'deepseek' ? generatedAt : null,
            provider === 'doubao' ? content : null, provider === 'doubao' ? generatedAt : null).run();
  }
}

export async function purgeOldAiReports(env: Env): Promise<void> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 8);
  const cutoffStr = cutoff.toISOString();
  // Delete records where both reports are older than cutoff
  await env.DB.prepare(
    "DELETE FROM ai_reports WHERE (deepseek_generated_at IS NULL OR deepseek_generated_at < ?) AND (doubao_generated_at IS NULL OR doubao_generated_at < ?)"
  ).bind(cutoffStr, cutoffStr).run();
}