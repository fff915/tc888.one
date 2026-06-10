-- D1 Database Schema for tc888.one

-- 赛程表
CREATE TABLE IF NOT EXISTS matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  match_no TEXT NOT NULL,
  match_no_normalized TEXT NOT NULL,
  league TEXT NOT NULL DEFAULT '',
  round TEXT NOT NULL DEFAULT '',
  home TEXT NOT NULL DEFAULT '',
  away TEXT NOT NULL DEFAULT '',
  home_badge TEXT NOT NULL DEFAULT '',
  away_badge TEXT NOT NULL DEFAULT '',
  kickoff TEXT NOT NULL DEFAULT '',
  date_key TEXT NOT NULL DEFAULT '',
  date_label TEXT NOT NULL DEFAULT '',
  day_number TEXT NOT NULL DEFAULT '',
  day_of_week TEXT NOT NULL DEFAULT '',
  time TEXT NOT NULL DEFAULT '',
  full_score TEXT NOT NULL DEFAULT '',
  half_score TEXT NOT NULL DEFAULT '',
  home_score TEXT NOT NULL DEFAULT '',
  away_score TEXT NOT NULL DEFAULT '',
  api_match_id TEXT NOT NULL DEFAULT '',
  home_team_alias_matched TEXT NOT NULL DEFAULT '',
  away_team_alias_matched TEXT NOT NULL DEFAULT '',
  league_alias_matched TEXT NOT NULL DEFAULT '',
  match_status TEXT NOT NULL DEFAULT '未开始',
  current_score TEXT NOT NULL DEFAULT '',
  penalty_score TEXT NOT NULL DEFAULT '',
  extra_time_score TEXT NOT NULL DEFAULT '',
  score_source TEXT NOT NULL DEFAULT 'pending',
  manual_half_time_score TEXT NOT NULL DEFAULT '',
  manual_full_time_score TEXT NOT NULL DEFAULT '',
  api_half_time_score TEXT NOT NULL DEFAULT '',
  api_full_time_score TEXT NOT NULL DEFAULT '',
  manual_locked INTEGER NOT NULL DEFAULT 0,
  needs_manual_check INTEGER NOT NULL DEFAULT 0,
  last_api_state TEXT NOT NULL DEFAULT '',
  last_updated_at TEXT NOT NULL DEFAULT '',
  api_updated_at TEXT NOT NULL DEFAULT '',
  manual_updated_at TEXT NOT NULL DEFAULT '',
  source_file TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_matches_date_key ON matches(date_key);
CREATE INDEX IF NOT EXISTS idx_matches_match_no ON matches(match_no_normalized);
CREATE INDEX IF NOT EXISTS idx_matches_api_id ON matches(api_match_id);
CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(match_status);

-- AI分析报告
CREATE TABLE IF NOT EXISTS ai_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  match_no_normalized TEXT NOT NULL UNIQUE,
  deepseek_content TEXT,
  deepseek_generated_at TEXT,
  doubao_content TEXT,
  doubao_generated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_ai_reports_match ON ai_reports(match_no_normalized);

-- API 使用统计
CREATE TABLE IF NOT EXISTS api_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL DEFAULT '',
  used INTEGER NOT NULL DEFAULT 0,
  remaining INTEGER NOT NULL DEFAULT 100,
  limit_count INTEGER NOT NULL DEFAULT 100,
  last_updated_at TEXT,
  last_request_at TEXT,
  last_success_at TEXT,
  last_error TEXT NOT NULL DEFAULT '',
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  pause_until TEXT
);

CREATE INDEX IF NOT EXISTS idx_api_usage_date ON api_usage(date);

-- API 调用日志
CREATE TABLE IF NOT EXISTS api_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  logged_at TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'request',
  url TEXT,
  status INTEGER,
  error TEXT,
  remaining INTEGER,
  match_count INTEGER,
  updated_matches TEXT,
  request_at TEXT
);

-- 页面浏览统计
CREATE TABLE IF NOT EXISTS page_views (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  visitor_hash TEXT NOT NULL,
  path TEXT NOT NULL DEFAULT '/',
  ip TEXT,
  user_agent TEXT,
  referer TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_pv_date ON page_views(created_at);
CREATE INDEX IF NOT EXISTS idx_pv_visitor ON page_views(visitor_hash);

-- 导入历史
CREATE TABLE IF NOT EXISTS import_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  status TEXT NOT NULL DEFAULT 'success',
  file_name TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '',
  errors TEXT,
  added INTEGER NOT NULL DEFAULT 0,
  overwritten INTEGER NOT NULL DEFAULT 0,
  imported_at TEXT NOT NULL DEFAULT '',
  stored_as TEXT
);

-- 队伍别名
CREATE TABLE IF NOT EXISTS team_aliases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  aliases TEXT NOT NULL DEFAULT '[]'
);

-- 联赛别名
CREATE TABLE IF NOT EXISTS league_aliases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  aliases TEXT NOT NULL DEFAULT '[]'
);