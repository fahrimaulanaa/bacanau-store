export const CATALOG_MANAGER_EMAIL = 'maul@gmail.com';

export function normalizeAdminEmail(email?: string | null) {
  return String(email || '').trim().toLowerCase();
}

export function canManageCatalog(email?: string | null) {
  return normalizeAdminEmail(email) === CATALOG_MANAGER_EMAIL;
}

export function getConfiguredAdminEmails(adminAllowlist: string) {
  return Array.from(new Set([
    ...adminAllowlist
      .split(',')
      .map((email) => normalizeAdminEmail(email))
      .filter(Boolean),
    CATALOG_MANAGER_EMAIL,
  ]));
}
