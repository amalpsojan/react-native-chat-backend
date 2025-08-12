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
  if (!adminClient.authStore.isValid) {
    await adminClient
      .collection('_superusers')
      .authWithPassword(POCKETBASE_ADMIN_EMAIL, POCKETBASE_ADMIN_PASSWORD);
  }
}

export function escapeFilterValue(value) {
  return String(value || '').replace(/"/g, '\\"');
}


