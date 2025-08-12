import dotenv from 'dotenv';
import { EventSource } from 'eventsource';
import PocketBase from 'pocketbase';

dotenv.config();
// Polyfill EventSource for Node environment so PocketBase realtime works
if (typeof global.EventSource === 'undefined') {
  global.EventSource = EventSource;
}

const { POCKETBASE_URL, POCKETBASE_ADMIN_EMAIL, POCKETBASE_ADMIN_PASSWORD } = process.env;

if (!POCKETBASE_URL) {
  console.error('Missing POCKETBASE_URL in environment');
  process.exit(1);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function authAdmin() {
  if (!POCKETBASE_ADMIN_EMAIL || !POCKETBASE_ADMIN_PASSWORD) {
    throw new Error('Missing POCKETBASE_ADMIN_EMAIL or POCKETBASE_ADMIN_PASSWORD');
  }
  const pb = new PocketBase(POCKETBASE_URL);
  await pb.collection('_superusers').authWithPassword(POCKETBASE_ADMIN_EMAIL, POCKETBASE_ADMIN_PASSWORD);
  return pb;
}

async function ensureRoom(pbAdmin, title) {
  try {
    return await pbAdmin.collection('rooms').getFirstListItem(`title = "${title}"`);
  } catch {
    return await pbAdmin.collection('rooms').create({ title });
  }
}

async function ensureSchema(pbAdmin) {
  // Try to reference collections; if missing, create minimal schema
  const collections = await pbAdmin.collections.getFullList();
  const hasRooms = collections.some((c) => c.name === 'rooms');
  const hasMessages = collections.some((c) => c.name === 'messages');

  if (!hasRooms) {
    await pbAdmin.collections.create({
      name: 'rooms',
      type: 'base',
      fields: [{ name: 'title', type: 'text', required: true }],
      // Allow authenticated users to list/view rooms for the test
      listRule: '@request.auth.id != ""',
      viewRule: '@request.auth.id != ""',
    });
  } else {
    // Ensure rules are permissive enough for realtime test
    const rooms = collections.find((c) => c.name === 'rooms');
    await pbAdmin.collections.update(rooms.id, {
      listRule: '@request.auth.id != ""',
      viewRule: '@request.auth.id != ""',
    });
  }

  if (!hasMessages) {
    // get rooms id for relation
    const updatedCollections = await pbAdmin.collections.getFullList();
    const rooms = updatedCollections.find((c) => c.name === 'rooms');
    await pbAdmin.collections.create({
      name: 'messages',
      type: 'base',
      fields: [
        { name: 'roomId', type: 'relation', required: true, collectionId: rooms.id, cascadeDelete: true },
        { name: 'from', type: 'text', required: true },
        { name: 'type', type: 'text', required: true },
        { name: 'content', type: 'json', required: true },
        { name: 'createdAtMs', type: 'number', required: true },
        { name: 'editedAtMs', type: 'number' },
        { name: 'status', type: 'text' },
        { name: 'refMessageId', type: 'text' },
        { name: 'refType', type: 'text' },
        { name: 'refContent', type: 'json' },
      ],
      // Allow authenticated users to list/view and create messages for the test
      listRule: '@request.auth.id != ""',
      viewRule: '@request.auth.id != ""',
      createRule: '@request.auth.id != ""',
    });
  } else {
    const messages = collections.find((c) => c.name === 'messages');
    await pbAdmin.collections.update(messages.id, {
      listRule: '@request.auth.id != ""',
      viewRule: '@request.auth.id != ""',
      createRule: '@request.auth.id != ""',
    });
  }
}

async function loginUser(identity, password) {
  const pb = new PocketBase(POCKETBASE_URL);
  await pb.collection('users').authWithPassword(identity, password);
  return pb;
}

async function main() {
  console.log('[realtime] Starting test...');
  const pbAdmin = await authAdmin();
  await ensureSchema(pbAdmin);
  const room = await ensureRoom(pbAdmin, 'realtime-test');
  console.log('[realtime] Using room:', room.id);

  const pbAlice = await loginUser('alice@example.com', 'secret123');
  const pbBob = await loginUser('bob@example.com', 'secret123');
  console.log('[realtime] Logged in as alice and bob');

  let aliceSawBob = false;
  let bobSawAlice = false;
  let adminCreatedMessageId = null;

  const donePromise = new Promise((resolve) => {
    const maybeDone = () => {
      if (aliceSawBob && bobSawAlice) resolve();
    };

    pbAlice.collection('messages').subscribe('*', (e) => {
      if (e.action === 'create' && e.record.roomId === room.id) {
        console.log('[alice] received:', e.record.type, e.record.content);
        if (e.record.from === 'bob') aliceSawBob = true;
        maybeDone();
      }
    });

    pbBob.collection('messages').subscribe('*', (e) => {
      if (e.action === 'create' && e.record.roomId === room.id) {
        console.log('[bob] received:', e.record.type, e.record.content);
        if (e.record.from === 'alice') bobSawAlice = true;
        maybeDone();
      }
    });
  });

  // Give subscriptions a moment to establish
  await sleep(300);

  // Try sending from alice; fallback to admin if forbidden
  const now = Date.now();
  try {
    const created = await pbAlice.collection('messages').create({
      roomId: room.id,
      from: 'alice',
      type: 'text',
      content: { text: 'Hello from alice (realtime test)' },
      createdAtMs: now,
      status: 'sent',
    });
    adminCreatedMessageId = created.id;
    console.log('[realtime] alice sent message');
  } catch (e) {
    console.warn('[realtime] alice send failed, retrying as admin:', e?.message || e);
    const created = await pbAdmin.collection('messages').create({
      roomId: room.id,
      from: 'alice',
      type: 'text',
      content: { text: 'Hello from alice (admin fallback)' },
      createdAtMs: now,
      status: 'sent',
    });
    adminCreatedMessageId = created.id;
  }

  // Send from bob as well; fallback to admin
  await sleep(200);
  try {
    await pbBob.collection('messages').create({
      roomId: room.id,
      from: 'bob',
      type: 'text',
      content: { text: 'Hi alice, bob here (realtime test)' },
      createdAtMs: Date.now(),
      status: 'sent',
    });
    console.log('[realtime] bob sent message');
  } catch (e) {
    console.warn('[realtime] bob send failed, retrying as admin:', e?.message || e);
    await pbAdmin.collection('messages').create({
      roomId: room.id,
      from: 'bob',
      type: 'text',
      content: { text: 'Hi alice, bob here (admin fallback)' },
      createdAtMs: Date.now(),
      status: 'sent',
    });
  }

  const timeoutMs = 5000;
  const timeout = sleep(timeoutMs).then(() => {
    throw new Error(`Timeout after ${timeoutMs}ms waiting for realtime events`);
  });

  try {
    await Promise.race([donePromise, timeout]);
    console.log('[realtime] SUCCESS: both clients received each other\'s messages');
  } catch (e) {
    console.error('[realtime] FAILED:', e?.message || e);
  } finally {
    try { await pbAlice.collection('messages').unsubscribe(); } catch {}
    try { await pbBob.collection('messages').unsubscribe(); } catch {}
  }
}

main();


