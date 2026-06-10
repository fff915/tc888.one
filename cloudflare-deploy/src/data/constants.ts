// 常量定义 - 从 server.py 迁移

export const LOCAL_TIMEZONE = 'Asia/Shanghai';
export const VISIBLE_PAST_DAYS = 5;
export const RETENTION_DAYS = 7;
export const SCORE_POLL_MIN_REMAINING = 25;
export const SCORE_POLL_INTERVAL_SECONDS = 1800; // 30 分钟
export const LOGO_PRECACHE_INTERVAL_SECONDS = 300; // 5 分钟
export const SCAN_SECONDS = 2;
export const DEFAULT_API_LIMIT = 100;
export const AI_REPORT_RETENTION_DAYS = 8;

export const PORT = 5180;
export const HOST = '0.0.0.0';

export const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
export const TEAM_LOGO_EXTENSIONS = new Set(['.svg', '.png', '.jpg', '.jpeg', '.webp']);
export const TEAM_LOGO_ALLOWED_HOSTS = new Set([
  'jsd.onmicrosoft.cn',
  'flagcdn.com',
  'purecatamphetamine.github.io',
  'cdn.prod.website-files.com',
  'logotyp.us',
  'logotypes.dev',
]);
export const TEAM_LOGO_MAX_BYTES = 2 * 1024 * 1024;

export const STATIC_FILES = new Set(['index.html', 'styles.css', 'script.js', 'admin.html', 'admin.js', 'admin.css']);

export const FLAG_CDN_BASE = 'https://jsd.onmicrosoft.cn/npm/svg-country-flags@1.2.10/svg';

export const BADGES = ['🔴', '🔵', '🟢', '🟡', '🟠', '🟣', '⚪', '⚫'];

export const WEEKDAY_INDEX: Record<string, number> = {
  '周一': 0, '周二': 1, '周三': 2, '周四': 3, '周五': 4, '周六': 5, '周日': 6, '周天': 6,
};

export const WEEK_NAMES = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

export const HEADER_ALIASES: Record<string, string[]> = {
  match_no: ['竞彩编号', '编号', '赛事编号', '场次编号', '竞彩', 'match_no', 'matchno', 'id'],
  league: ['赛事种类', '赛事', '联赛', '赛事名称', '比赛类型', 'league'],
  teams: ['双方队伍', '对阵', '主客队', '比赛球队', '队伍', '双方球队', 'teams', 'match'],
  home: ['主队', '主场', '主场队伍', 'home'],
  away: ['客队', '客场', '客场队伍', 'away'],
  kickoff: ['开赛日期', '开赛时间', '比赛时间', '时间', '日期', 'kickoff', 'time'],
  round: ['轮次', '轮', '第几轮', 'round'],
};

export const TEAM_SEPARATORS = [
  /\s*vs\s*/i,
  /\s*v\s*/i,
  /\s*对\s*/,
  /\s*—\s*/,
  /\s*–\s*/,
  /\s+-\s+/,
];

export const STATUS_MAP: Record<string, string> = {
  'match finished': '已结束',
  'match finished after extra time': '已结束',
  'match finished after penalties': '已结束',
  'first half': '上半场',
  'second half': '下半场',
  'half time': '半场结束',
  'halftime': '半场结束',
  'extra time': '加时/点球中',
  'penalty in progress': '加时/点球中',
  'not started': '未开始',
  'time to be defined': '未开始',
  'scheduled': '未开始',
  'match suspended': '异常',
  'match interrupted': '异常',
  'match abandoned': '异常',
  'match awarded': '异常',
  'match postponed': '延期',
  'match cancelled': '取消',
  'match canceled': '取消',
};

export const TERMINAL_STATUS = new Set(['已结束', '延期', '取消', '异常']);
export const HALF_TIME_LABEL = '半场结束';
export const SECOND_HALF_LABELS = new Set(['下半场', '加时/点球中', '已结束']);

export const AI_PROMPT = `你是专业足球数据分析师。在报告中适当增加图标和彩色标题。请按照以下模板给出总共600字左右的分析报告：

1. 两队的排名：如果是两支国家队之间，请分别写明主队和客队的FIFA排名；如果是联赛，请写明当前积分赛的排名。
2. 两队近五场历史交锋战绩，并分析对战优劣势。
3. 两支球队近十场比赛的胜负，并分析原因。
4. 双方核心球员的伤病停赛情况，以及其他特殊因素。
5. 务必给出具体的比分预测，和半场是否进球（可以多写几个），并给出具体原因。

请表明自己使用的是哪一个大模型，并最后做出风险提示：赛事存在临场变数，AI分析仅数据参考，不构成投注建议；购彩有风险，理性娱乐、量力而行，未满18周岁禁止购彩。`;

export const API_FOOTBALL_BASE_URL = 'https://v3.football.api-sports.io';