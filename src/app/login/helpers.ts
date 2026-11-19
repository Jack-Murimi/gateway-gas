import type { StaffProfile } from '@/types';

export const IDENTIFIER_STORAGE_KEY = 'gwg_last_identifier';
export const PHONE_LIKE_REGEX = /^\+?[0-9\s-]{9,15}$/;

/** Only allow internal, relative redirects. Blocks `//evil.com` and absolute URLs. */
export function safeInternalPath(candidate: string | null): string | null {
  if (!candidate) return null;
  if (
    !candidate.startsWith('/') ||
    candidate.startsWith('//') ||
    candidate.startsWith('/\\')
  )
    return null;
  return candidate;
}

export function getPostLoginPath(
  user: StaffProfile,
  redirectTarget: string | null
): string {
  if (user.approval_status === 'rejected') return '/pending?status=rejected';
  if (user.approval_status !== 'approved') return '/pending';
  if (redirectTarget) return redirectTarget;
  switch (user.role) {
    case 'rider':
      return '/rider';
    case 'sales_rep':
      return '/sales';
    case 'operator':
      return '/operations';
    default:
      return '/';
  }
}
