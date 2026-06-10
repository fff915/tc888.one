// 工具函数 - 从 server.py 迁移

import { BADGES, WEEKDAY_INDEX, WEEK_NAMES } from '../data/constants';
import { TEAM_NAME_ALIASES, TEAM_FLAG_CODES, TEAM_LOGO_EXACT_URLS, TEAM_COLORS_DEFAULT, TEAM_COLORS } from '../data/team-data';

export function nowISO(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, '');
}

export function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function normalizeHeader(value: unknown): string {
  let text = String(value ?? '').trim();
  text = text.replace(/[\s:：/\\_\-（）()]+/g, '');
  return text.toLowerCase();
}

export function normalizeTeam(value: unknown): string {
  return String(value ?? '').trim().replace(/\s+/g, '');
}

export function normalizeLookup(value: unknown): string {
  let text = String(value ?? '').toLowerCase();
  return text.replace(/[\s\.\-_'\u2018\u2019\u00B7\u30FB/\\（）()\[\]【】:：]+/g, '');
}

export function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')} ${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`;
  }
  let text = String(value).trim();
  if (text.endsWith('.0')) text = text.slice(0, -2);
  return text;
}

export function normalizeMatchNo(value: string): string {
  let text = String(value ?? '').trim().replace(/\s+/g, '');
  const weekdayMatch = text.match(/(周[一二三四五六日天])/);
  const numberMatch = text.match(/(\d{1,3})\D*$/);
  if (weekdayMatch && numberMatch) {
    const weekday = weekdayMatch[1].replace('周天', '周日');
    return `${weekday}${String(parseInt(numberMatch[1])).padStart(3, '0')}`;
  }
  if (numberMatch) {
    return String(parseInt(numberMatch[1])).padStart(3, '0');
  }
  return text;
}

export function teamBadge(team: string): string {
  let sum = 0;
  for (let i = 0; i < team.length; i++) {
    sum += team.charCodeAt(i);
  }
  return BADGES[sum % BADGES.length];
}

export function teamInitial(teamName: string): string {
  const chars = Array.from(String(teamName ?? '').trim()).filter(c => /\S/u.test(c));
  return (chars[0] || '?').toUpperCase();
}

export function teamAccentColor(teamName: string): string {
  const key = (teamName ?? '').trim();
  if (TEAM_COLORS[key]) return TEAM_COLORS[key];
  const normalized = key.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  if (normalized !== key && TEAM_COLORS[normalized]) return TEAM_COLORS[normalized];
  return TEAM_COLORS_DEFAULT;
}

export function matchNoSortKey(matchNo: string): [number, string] {
  const text = normalizeMatchNo(matchNo);
  const numberMatch = text.match(/(\d+)/);
  return [numberMatch ? parseInt(numberMatch[1]) : 999999, text];
}

export function teamAliasCandidates(teamName: string): string[] {
  const team = String(teamName ?? '').trim();
  return [...new Set([team, ...(TEAM_NAME_ALIASES[team] || [])].filter(Boolean))];
}

export function logoNameVariants(name: string): string[] {
  const text = String(name ?? '').trim();
  const spaced = text.replace(/\s+/g, ' ');
  const hyphenated = spaced.replace(/\s+/g, '-');
  const compact = spaced.replace(/\s+/g, '');
  return [...new Set([spaced, hyphenated, hyphenated.toLowerCase(), compact].filter(Boolean))];
}

export function exactFlagLogoSources(teamName: string): string[] {
  const code = TEAM_FLAG_CODES[String(teamName ?? '').trim()];
  if (!code) return [];
  const lower = code.toLowerCase();
  const upper = code.toUpperCase();
  return [
    `https://jsd.onmicrosoft.cn/npm/svg-country-flags@1.2.10/svg/${lower}.svg`,
    `https://flagcdn.com/${lower}.svg`,
    `https://purecatamphetamine.github.io/country-flag-icons/3x2/${upper}.svg`,
  ];
}

export function exactTeamLogoSources(teamName: string): string[] {
  return [
    ...(TEAM_LOGO_EXACT_URLS[String(teamName ?? '').trim()] || []),
    ...exactFlagLogoSources(teamName),
  ];
}

export function teamLogoSources(teamName: string): string[] {
  const sources = [...exactTeamLogoSources(teamName)];
  teamAliasCandidates(teamName).forEach(alias => {
    logoNameVariants(alias).forEach(variant => {
      const encoded = encodeURIComponent(variant);
      sources.push(`https://jsd.onmicrosoft.cn/gh/footballcsv/japan-logos@master/teams/${encoded}.svg`);
      sources.push(`https://logotypes.dev/${encoded}.svg`);
    });
  });
  return [...new Set(sources)].slice(0, 18);
}

export function flagLogoUrl(teamName: string): string | null {
  const code = TEAM_FLAG_CODES[String(teamName ?? '').trim()];
  if (!code) return null;
  return `https://jsd.onmicrosoft.cn/npm/svg-country-flags@1.2.10/svg/${code.toLowerCase()}.svg`;
}

export function parseKickoff(value: unknown): Date {
  if (value instanceof Date) {
    value.setSeconds(0, 0);
    return value;
  }
  let text = cellText(value);
  text = text.replace(/：/g, ':').replace(/年/g, '-').replace(/月/g, '-').replace(/日/g, '');
  text = text.replace(/\s+/g, ' ').trim();

  // Try various formats
  const formats = [
    // 2026-06-12 15:00
    { regex: /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})\s+(\d{1,2}):(\d{2})$/, yearGroup: 1, monthGroup: 2, dayGroup: 3, hourGroup: 4, minuteGroup: 5 },
    // 6-12 15:00 (no year)
    { regex: /^(\d{1,2})[-/](\d{1,2})\s+(\d{1,2}):(\d{2})$/, monthGroup: 1, dayGroup: 2, hourGroup: 3, minuteGroup: 4 },
    // 6/12/26 15:00 (2-digit year, M/D/YY)
    { regex: /^(\d{1,2})[-/](\d{1,2})[-/](\d{2})\s+(\d{1,2}):(\d{2})$/, yearGroup: 3, yearLen: 2, monthGroup: 1, dayGroup: 2, hourGroup: 4, minuteGroup: 5 },
    // 2026/06/12 15:00
    { regex: /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})\s+(\d{1,2}):(\d{2})$/, yearGroup: 1, monthGroup: 2, dayGroup: 3, hourGroup: 4, minuteGroup: 5 },
  ];

  for (const fmt of formats) {
    const m = text.match(fmt.regex);
    if (m) {
      let year: number;
      if ((fmt as any).yearGroup) {
        year = parseInt(m[(fmt as any).yearGroup]);
        if ((fmt as any).yearLen === 2) year += 2000;
      } else {
        year = new Date().getFullYear();
      }
      const month = parseInt(m[(fmt as any).monthGroup]);
      const day = parseInt(m[(fmt as any).dayGroup]);
      const hour = parseInt(m[(fmt as any).hourGroup]);
      const minute = parseInt(m[(fmt as any).minuteGroup]);
      return new Date(year, month - 1, day, hour, minute, 0, 0);
    }
  }

  // Try Excel serial date number (e.g., 46185.125 = days since 1899-12-30)
  const num = parseFloat(text);
  if (!isNaN(num) && num > 30000 && num < 100000) {
    // Excel epoch is 1899-12-30 (days), with time as decimal fraction
    const days = Math.floor(num);
    const frac = num - days;
    const msPerDay = 86400000;
    const base = Date.UTC(1899, 11, 30); // Dec 30, 1899 at midnight UTC
    const timestamp = base + days * msPerDay + Math.round(frac * msPerDay);
    return new Date(timestamp);
  }

  throw new Error(`开赛日期格式无法识别：${value}`);
}

export function dayPayload(kickoff: Date) {
  return {
    dateKey: `${kickoff.getFullYear()}-${String(kickoff.getMonth() + 1).padStart(2, '0')}-${String(kickoff.getDate()).padStart(2, '0')}`,
    dateLabel: `${kickoff.getMonth() + 1}月${kickoff.getDate()}日`,
    dayNumber: String(kickoff.getDate()),
    dayOfWeek: WEEK_NAMES[kickoff.getDay()],
    time: `${String(kickoff.getHours()).padStart(2, '0')}:${String(kickoff.getMinutes()).padStart(2, '0')}`,
  };
}

export function scheduleDayForMatch(matchNo: string, kickoff: Date): Date {
  const text = normalizeMatchNo(matchNo);
  const weekdayMatch = text.match(/(周[一二三四五六日天])/);
  if (!weekdayMatch) return kickoff;

  const targetWeekday = WEEKDAY_INDEX[weekdayMatch[1]];
  if (targetWeekday === undefined) return kickoff;

  const kickoffDay = new Date(kickoff);
  for (const offset of [0, -1, -2, -3, 1, 2, 3]) {
    const candidate = new Date(kickoffDay);
    candidate.setDate(kickoffDay.getDate() + offset);
    if (candidate.getDay() === targetWeekday) {
      candidate.setHours(kickoff.getHours(), kickoff.getMinutes(), 0, 0);
      return candidate;
    }
  }
  return kickoff;
}

export function parseScore(value: string): [string, string, string] {
  const text = String(value ?? '').trim();
  const match = text.match(/(\d+)\D+(\d+)/);
  if (!match) throw new Error(`比分格式无法识别：${value}`);
  const [home, away] = [match[1], match[2]];
  return [home, away, `${home}∶${away}`];
}

export function parseScoreSafe(value: unknown): [string, string, string] | null {
  try {
    return parseScore(String(value ?? ''));
  } catch {
    return null;
  }
}

export function splitTeams(value: string): [string, string] {
  let text = String(value ?? '').trim();
  text = text.replace(/\s+/g, ' ');

  const patterns = [
    /\s*vs\s*/i,
    /\s*v\s*/i,
    /\s*对\s*/,
    /\s*—\s*/,
    /\s*–\s*/,
    /\s+-\s+/,
  ];

  for (const pattern of patterns) {
    const parts = text.split(pattern, 2);
    if (parts.length === 2 && parts[0].trim() && parts[1].trim()) {
      return [parts[0].trim(), parts[1].trim()];
    }
  }

  // Try double spaces as separator
  const compact = text.split(/\s{2,}/, 2);
  if (compact.length === 2 && compact[0].trim() && compact[1].trim()) {
    return [compact[0].trim(), compact[1].trim()];
  }

  throw new Error(`无法拆分双方队伍：${value}`);
}

export function aliasMatch(localName: string, remoteName: string, aliases: Record<string, string[]>): [boolean, string, number] {
  const remoteKey = normalizeLookup(remoteName);
  if (!remoteKey) return [false, '', 0];

  const aliasSet = new Set<string>();
  aliasSet.add(normalizeLookup(localName));
  for (const a of (aliases[localName] || [])) {
    aliasSet.add(normalizeLookup(a));
  }

  for (const candidate of aliasSet) {
    if (remoteKey === candidate || remoteKey.includes(candidate) || candidate.includes(remoteKey)) {
      return [true, remoteName, 1.0];
    }
    // Simple sequence matching via longest common substring
    const ratio = longestCommonSubstringRatio(candidate, remoteKey);
    if (ratio >= 0.86) {
      return [true, remoteName, ratio];
    }
  }

  return [false, '', 0];
}

export function leagueMatch(localLeague: string, remoteLeague: string, aliases: Record<string, string[]>): [boolean, string] {
  if (!localLeague || !remoteLeague) return [true, ''];

  const localKey = normalizeLookup(localLeague);
  const remoteKey = normalizeLookup(remoteLeague);
  if (localKey === remoteKey) return [true, remoteLeague];

  const [ok, label] = aliasMatch(localLeague, remoteLeague, aliases);
  if (ok) return [true, label];
  return [false, ''];
}

function longestCommonSubstringRatio(a: string, b: string): number {
  if (!a || !b) return 0;
  let maxLen = 0;
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      let k = 0;
      while (i + k < a.length && j + k < b.length && a[i + k] === b[j + k]) k++;
      maxLen = Math.max(maxLen, k);
    }
  }
  return (2 * maxLen) / (a.length + b.length);
}

export function escapeHtml(value: string): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export { normalizeMatchNo as normalizeMatchNoForKey };