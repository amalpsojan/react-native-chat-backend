import PocketBase from 'pocketbase';

const { POCKETBASE_URL, POCKETBASE_ADMIN_EMAIL, POCKETBASE_ADMIN_PASSWORD } =
  process.env;

if (!POCKETBASE_URL) {
  console.error('Missing POCKETBASE_URL in environment');
  process.exit(1);
}

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
      // Try PocketBase >= 0.23 style first
      let authed = false;
      try {
        if (typeof adminClient.collection === 'function') {
          await adminClient
            .collection('_superusers')
            .authWithPassword(POCKETBASE_ADMIN_EMAIL, POCKETBASE_ADMIN_PASSWORD);
          authed = true;
        }
      } catch (e) {
        
      }
      // Fallback to legacy admins API (PocketBase < 0.23)
      if (!authed) {
        if (adminClient.admins && typeof adminClient.admins.authWithPassword === 'function') {
          await adminClient.admins.authWithPassword(
            POCKETBASE_ADMIN_EMAIL,
            POCKETBASE_ADMIN_PASSWORD
          );
          authed = true;
        } else {
          throw new Error('No admin auth method available on this PocketBase client');
        }
      }
    } else {
      // already authenticated
    }
  } catch (e) {
    
    throw e;
  }
}

export function escapeFilterValue(value) {
  return String(value || '').replace(/"/g, '\\"');
}


