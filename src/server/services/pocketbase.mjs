import PocketBase from 'pocketbase';

const { POCKETBASE_URL, POCKETBASE_ADMIN_EMAIL, POCKETBASE_ADMIN_PASSWORD } =
  process.env;

if (!POCKETBASE_URL) {
  console.error('Missing POCKETBASE_URL in environment');
  process.exit(1);
}

// Basic debug logs (dev-friendly)
try {
  const hasAdmin = Boolean(POCKETBASE_ADMIN_EMAIL && POCKETBASE_ADMIN_PASSWORD);
  console.log(`[pb] URL: ${POCKETBASE_URL}`);
  console.log(`[pb] Admin credentials configured: ${hasAdmin}`);
} catch {}

export function createPocketBaseClient() {
  return new PocketBase(POCKETBASE_URL);
}

export const adminClient = new PocketBase(POCKETBASE_URL);

export async function ensureAdminAuth() {
  if (!POCKETBASE_ADMIN_EMAIL || !POCKETBASE_ADMIN_PASSWORD) {
    throw new Error('Missing POCKETBASE_ADMIN_EMAIL/POCKETBASE_ADMIN_PASSWORD in env');
  }
  try {
    if (!adminClient.authStore.isValid) {
      console.log('[pb] ensureAdminAuth: authenticating admin...');
      // Try PocketBase >= 0.23 style first
      let authed = false;
      try {
        if (typeof adminClient.collection === 'function') {
          await adminClient
            .collection('_superusers')
            .authWithPassword(POCKETBASE_ADMIN_EMAIL, POCKETBASE_ADMIN_PASSWORD);
          authed = true;
          console.log('[pb] ensureAdminAuth: admin authenticated via _superusers');
        }
      } catch (e) {
        console.warn('[pb] _superusers auth failed, will try legacy admins API:', e?.status, e?.data || e?.message || e);
      }
      // Fallback to legacy admins API (PocketBase < 0.23)
      if (!authed) {
        if (adminClient.admins && typeof adminClient.admins.authWithPassword === 'function') {
          await adminClient.admins.authWithPassword(
            POCKETBASE_ADMIN_EMAIL,
            POCKETBASE_ADMIN_PASSWORD
          );
          authed = true;
          console.log('[pb] ensureAdminAuth: admin authenticated via admins API');
        } else {
          throw new Error('No admin auth method available on this PocketBase client');
        }
      }
    } else {
      console.log('[pb] ensureAdminAuth: admin already authenticated');
    }
  } catch (e) {
    console.error('[pb] ensureAdminAuth error:', e?.status, e?.data || e?.message || e);
    throw e;
  }
}

export function escapeFilterValue(value) {
  return String(value || '').replace(/"/g, '\\"');
}


