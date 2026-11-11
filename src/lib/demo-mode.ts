export const IS_DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

export function setDemoSessionCookies(userId: string, role: string, status: string) {
  if (typeof document === 'undefined') return;
  document.cookie = `gwg_user_id=${userId}; path=/; max-age=604800; SameSite=Lax`;
  document.cookie = `gwg_role=${role}; path=/; max-age=604800; SameSite=Lax`;
  document.cookie = `gwg_status=${status}; path=/; max-age=604800; SameSite=Lax`;
}

export function clearDemoSessionCookies() {
  if (typeof document === 'undefined') return;
  document.cookie = 'gwg_user_id=; path=/; max-age=0';
  document.cookie = 'gwg_role=; path=/; max-age=0';
  document.cookie = 'gwg_status=; path=/; max-age=0';
}
