// AI 分析服务 - DeepSeek + 豆包

import { Env } from '../index';
import { AI_PROMPT } from '../data/constants';
import { nowISO, normalizeMatchNo } from '../utils/helpers';
import { loadAiReports, saveAiReport, purgeOldAiReports } from './db';
import type { MatchRecord } from './db';

export function buildAiMatchContext(match: MatchRecord): string {
  const ctx: string[] = [];
  ctx.push(`主队: ${match.home}`);
  ctx.push(`客队: ${match.away}`);
  ctx.push(`赛事: ${match.league}`);
  if (match.kickoff) ctx.push(`开赛时间: ${match.kickoff}`);
  const full = match.full_score || '';
  const half = match.half_score || match.api_half_time_score || '';
  if (full) ctx.push(`全场比分: ${full}`);
  if (half) ctx.push(`半场比分: ${half}`);
  return ctx.join('\n');
}

async function callDeepSeek(env: Env, matchContext: string): Promise<string> {
  if (!env.DEEPSEEK_API_KEY) throw new Error('DeepSeek API Key 未配置');

  const body = {
    model: 'deepseek-chat',
    messages: [
      { role: 'system', content: AI_PROMPT },
      { role: 'user', content: `请分析以下比赛：\n${matchContext}` },
    ],
    temperature: 0.7,
    max_tokens: 2000,
    stream: false,
  };

  const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`DeepSeek API error: ${response.status}`);
  }

  const result = await response.json() as { choices: { message: { content: string } }[] };
  return result.choices[0].message.content;
}

async function callDoubao(env: Env, matchContext: string): Promise<string> {
  if (!env.DOUBAO_API_KEY) throw new Error('豆包 API Key 未配置');
  if (!env.DOUBAO_ENDPOINT_ID) throw new Error('豆包 Endpoint ID 未配置');

  const body = {
    model: env.DOUBAO_ENDPOINT_ID,
    messages: [
      { role: 'system', content: AI_PROMPT },
      { role: 'user', content: `请分析以下比赛：\n${matchContext}` },
    ],
    temperature: 0.7,
    max_tokens: 2000,
    stream: false,
    enable_search: true,
  };

  const response = await fetch('https://ark.cn-beijing.volces.com/api/v3/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.DOUBAO_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => '');
    throw new Error(`HTTP ${response.status}: ${errBody.slice(0, 200)}`);
  }

  const result = await response.json() as { choices: { message: { content: string } }[] };
  return result.choices[0].message.content;
}

export async function generateAiReportForMatch(env: Env, match: MatchRecord): Promise<Record<string, unknown>> {
  const matchNo = match.match_no_normalized;
  if (!matchNo) return { matchNo, reports: {} };

  const ctx = buildAiMatchContext(match);
  const reports: Record<string, { content: string; generatedAt: string }> = {};
  const errors: string[] = [];

  if (env.DEEPSEEK_API_KEY) {
    try {
      const content = await callDeepSeek(env, ctx);
      reports.deepseek = { content, generatedAt: nowISO() };
      await saveAiReport(env, matchNo, 'deepseek', content, nowISO());
    } catch (e) {
      errors.push(`DeepSeek: ${e}`);
    }
  }

  if (env.DOUBAO_API_KEY && env.DOUBAO_ENDPOINT_ID) {
    try {
      const content = await callDoubao(env, ctx);
      reports.doubao = { content, generatedAt: nowISO() };
      await saveAiReport(env, matchNo, 'doubao', content, nowISO());
    } catch (e) {
      errors.push(`豆包: ${e}`);
    }
  }

  return { matchNo, reports, errors };
}

export async function getAiReport(env: Env, matchNo: string): Promise<Record<string, unknown>> {
  const matchNoNorm = normalizeMatchNo(matchNo);
  const reportsDb = await loadAiReports(env);
  await purgeOldAiReports(env);

  const result: Record<string, unknown> = { matchNo: matchNoNorm, reports: {} };

  const existing = reportsDb[matchNoNorm];
  if (existing?.deepseek?.content) {
    (result.reports as Record<string, unknown>).deepseek = existing.deepseek;
  }
  if (existing?.doubao?.content) {
    (result.reports as Record<string, unknown>).doubao = existing.doubao;
  }

  if (!Object.keys(result.reports as Record<string, unknown>).length) {
    result.pending = true;
  }

  return result;
}

export async function triggerAiForNewMatches(env: Env, matches: MatchRecord[]): Promise<void> {
  if (!env.DEEPSEEK_API_KEY && !(env.DOUBAO_API_KEY && env.DOUBAO_ENDPOINT_ID)) return;

  const reportsDb = await loadAiReports(env);
  await purgeOldAiReports(env);

  for (const match of matches) {
    const mn = match.match_no_normalized;
    if (!mn || reportsDb[mn]) continue;

    try {
      await generateAiReportForMatch(env, match);
    } catch (e) {
      console.error(`[ai] ${mn} analysis failed: ${e}`);
    }
  }
}