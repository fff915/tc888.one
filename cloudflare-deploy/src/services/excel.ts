// Excel 解析和赛程导入服务 - 从 server.py 迁移

import { HEADER_ALIASES, TEAM_SEPARATORS } from '../data/constants';
import { normalizeHeader, cellText, splitTeams, parseKickoff, dayPayload, scheduleDayForMatch, normalizeMatchNo, teamBadge, nowISO, normalizeTeam } from '../utils/helpers';
import { loadAllMatches, upsertMatch, purgeOldMatches, type MatchRecord } from './db';
import { triggerAiForNewMatches } from './ai';
import { Env } from '../index';

export function resolveHeaders(rawHeaders: unknown[]): Record<string, number> {
  const normalized = rawHeaders.map(h => normalizeHeader(h));
  const resolved: Record<string, number> = {};
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    for (const alias of aliases) {
      const key = normalizeHeader(alias);
      if (normalized.includes(key)) {
        resolved[field] = normalized.indexOf(key);
        break;
      }
    }
  }
  return resolved;
}

export function parseExcelSheet(rows: unknown[][]): { records: Record<string, string>[]; headers: Record<string, number> } | null {
  for (let headerIndex = 0; headerIndex < rows.length; headerIndex++) {
    const row = rows[headerIndex];
    if (!row || row.filter(c => c !== null && c !== undefined && c !== '').length < 2) continue;

    const rawHeaders = row.map(c => String(c ?? ''));
    const resolved = resolveHeaders(rawHeaders);
    const hasTeams = 'teams' in resolved || ('home' in resolved && 'away' in resolved);
    const isSchedule = 'match_no' in resolved && 'league' in resolved && 'kickoff' in resolved && hasTeams;

    if (!isSchedule) continue;

    const records: Record<string, string>[] = [];
    for (let sourceRow = headerIndex + 1; sourceRow < rows.length; sourceRow++) {
      const values = rows[sourceRow];
      if (!values || !values.some(c => c !== null && c !== undefined && c !== '')) continue;
      const item: Record<string, string> = { __row: String(sourceRow + 1) };
      for (const [field, column] of Object.entries(resolved)) {
        item[field] = cellText(column < values.length ? values[column] : '');
      }
      records.push(item);
    }

    return { records, headers: resolved };
  }
  return null;
}

export async function importSchedule(env: Env, records: Record<string, string>[], fileName: string): Promise<{
  result: Record<string, unknown>;
  newMatches: MatchRecord[];
}> {
  const allMatches = await loadAllMatches(env);
  const byNo: Record<string, MatchRecord> = {};
  for (const m of allMatches) {
    if (m.match_no_normalized) byNo[m.match_no_normalized] = m;
  }

  let added = 0;
  let overwritten = 0;
  const errors: string[] = [];
  const newMatches: MatchRecord[] = [];

  for (const row of records) {
    try {
      const matchNo = normalizeMatchNo(row.match_no || '');
      if (!matchNo) throw new Error('竞彩编号为空');

      let home: string, away: string;
      if (row.teams) {
        [home, away] = splitTeams(row.teams);
      } else if (row.home && row.away) {
        home = String(row.home).trim();
        away = String(row.away).trim();
      } else {
        throw new Error('缺少双方队伍');
      }

      const kickoff = parseKickoff(row.kickoff);
      const day = dayPayload(scheduleDayForMatch(matchNo, kickoff));
      const existing = byNo[matchNo];

      const keepScore = existing && normalizeTeam(existing.home) === normalizeTeam(home) && normalizeTeam(existing.away) === normalizeTeam(away);
      const now = nowISO();

      const match: MatchRecord = {
        match_no: matchNo,
        match_no_normalized: matchNo,
        league: String(row.league || '').trim(),
        round: String(row.round || '').trim(),
        home,
        away,
        home_badge: teamBadge(home),
        away_badge: teamBadge(away),
        kickoff: kickoff.toISOString(),
        date_key: day.dateKey,
        date_label: day.dateLabel,
        day_number: day.dayNumber,
        day_of_week: day.dayOfWeek,
        time: day.time,
        full_score: keepScore ? (existing?.full_score ?? '') : '',
        half_score: keepScore ? (existing?.half_score ?? '') : '',
        home_score: keepScore ? (existing?.home_score ?? '') : '',
        away_score: keepScore ? (existing?.away_score ?? '') : '',
        api_match_id: keepScore ? (existing?.api_match_id ?? '') : '',
        home_team_alias_matched: keepScore ? (existing?.home_team_alias_matched ?? '') : '',
        away_team_alias_matched: keepScore ? (existing?.away_team_alias_matched ?? '') : '',
        league_alias_matched: keepScore ? (existing?.league_alias_matched ?? '') : '',
        match_status: keepScore ? (existing?.match_status ?? '未开始') : '未开始',
        current_score: keepScore ? (existing?.current_score ?? '') : '',
        penalty_score: keepScore ? (existing?.penalty_score ?? '') : '',
        extra_time_score: keepScore ? (existing?.extra_time_score ?? '') : '',
        score_source: keepScore ? (existing?.score_source ?? 'pending') : 'pending',
        manual_half_time_score: keepScore ? (existing?.manual_half_time_score ?? '') : '',
        manual_full_time_score: keepScore ? (existing?.manual_full_time_score ?? '') : '',
        api_half_time_score: keepScore ? (existing?.api_half_time_score ?? '') : '',
        api_full_time_score: keepScore ? (existing?.api_full_time_score ?? '') : '',
        manual_locked: keepScore ? (existing?.manual_locked ?? 0) : 0,
        needs_manual_check: keepScore ? (existing?.needs_manual_check ?? 0) : 0,
        last_api_state: keepScore ? (existing?.last_api_state ?? '') : '',
        last_updated_at: now,
        api_updated_at: keepScore ? (existing?.api_updated_at ?? '') : '',
        manual_updated_at: keepScore ? (existing?.manual_updated_at ?? '') : '',
        source_file: fileName,
        created_at: existing?.created_at ?? now,
        updated_at: now,
      };

      await upsertMatch(env, match);

      if (existing) {
        overwritten++;
      } else {
        added++;
        byNo[matchNo] = match;
        newMatches.push(match);
      }
    } catch (e) {
      errors.push(`第${row.__row}行：${e}`);
    }
  }

  const purged = await purgeOldMatches(env);

  let message = `赛程导入完成：新增 ${added}，覆盖 ${overwritten}，失败 ${errors.length}`;
  if (purged) message += `，清理过期 ${purged}`;

  const status = records.length && errors.length && !added && !overwritten ? 'failed' : 'success';

  const result = {
    status,
    type: 'schedule',
    file: fileName,
    message,
    errors: errors.slice(0, 30),
    added,
    overwritten,
    importedAt: nowISO(),
  };

  // Save import history
  await env.DB.prepare(
    'INSERT INTO import_history (status, file_name, message, errors, added, overwritten, imported_at) VALUES (?,?,?,?,?,?,?)'
  ).bind(status, fileName, message, JSON.stringify(errors.slice(0, 30)), added, overwritten, nowISO()).run();

  // Trigger AI reports for new matches
  if (newMatches.length > 0) {
    // Note: triggerAiForNewMatches is async but we don't want to block the import response
    // It will be called via ctx.waitUntil in the request handler
  }

  return { result, newMatches };
}