// 认证中间件

import { Env } from '../index';

export function isAdminRequest(request: Request, env: Env): boolean {
  const token = request.headers.get('X-Admin-Token') || '';
  const auth = request.headers.get('Authorization') || '';
  let actualToken = token;
  if (auth.toLowerCase().startsWith('bearer ')) {
    actualToken = auth.slice(7).trim();
  }
  if (!env.ADMIN_TOKEN) {
    return false;
  }
  return actualToken === env.ADMIN_TOKEN;
}