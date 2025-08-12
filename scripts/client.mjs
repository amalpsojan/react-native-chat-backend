import dotenv from 'dotenv';
import { EventSource } from 'eventsource';
import readline from 'node:readline';
import PocketBase from 'pocketbase';

dotenv.config();

// Polyfill EventSource for Node environment
if (typeof global.EventSource === 'undefined') {
  global.EventSource = EventSource;
}

const { POCKETBASE_URL } = process.env;
if (!POCKETBASE_URL) {
  console.error('Missing POCKETBASE_URL in environment');
  process.exit(1);
}

const args = process.argv.slice(2);
const identity = args[0] || process.env.IDENTITY;
const password = args[1] || process.env.PASSWORD || 'secret123';
const roomTitle = args[2] || process.env.ROOM || 'realtime-test';

// flags
const sendMessage = args.includes('--send') || process.env.SEND;
let messageText = 'Hello from client';
const msgFlagIdx = args.findIndex((a) => a === '--msg' || a.startsWith('--msg='));
if (msgFlagIdx !== -1) {
  const flag = args[msgFlagIdx];
  if (flag.includes('=')) {
    messageText = flag.split('=').slice(1).join('=');
  } else if (args[msgFlagIdx + 1]) {
    messageText = args[msgFlagIdx + 1];
  }
}
messageText = process.env.MSG || messageText;

if (!identity) {
  console.error('Usage: node scripts/client.mjs <identity> [password] [roomTitle] [--send]');
  process.exit(1);
}

async function getOrCreateRoom(pbAdmin, title) {
  try {
    return await pbAdmin.collection('rooms').getFirstListItem(`title = "${title}"`);
  } catch {
    return await pbAdmin.collection('rooms').create({ title, createdAtMs: Date.now() });
  }
}

async function main() {
  const pb = new PocketBase(POCKETBASE_URL);
  const admin = new PocketBase(POCKETBASE_URL);

  // Try admin auth in case room missing (optional)
  try {
    const { POCKETBASE_ADMIN_EMAIL, POCKETBASE_ADMIN_PASSWORD } = process.env;
    if (POCKETBASE_ADMIN_EMAIL && POCKETBASE_ADMIN_PASSWORD) {
      await admin.collection('_superusers').authWithPassword(
        POCKETBASE_ADMIN_EMAIL,
        POCKETBASE_ADMIN_PASSWORD
      );
    }
  } catch {}

  await pb.collection('users').authWithPassword(identity, password);
  const user = pb.authStore.record;
  console.log(`[client] logged in as: ${user?.email || user?.username || identity}`);

  let roomId;
  try {
    const room = await getOrCreateRoom(admin, roomTitle);
    roomId = room.id;
  } catch (e) {
    console.warn('[client] could not ensure room via admin, trying without admin');
    // Fallback: attempt to read existing room as user
    try {
      const room = await pb.collection('rooms').getFirstListItem(`title = "${roomTitle}"`);
      roomId = room.id;
    } catch (err) {
      console.error('[client] No access to room and cannot create it. Exiting.');
      process.exit(1);
    }
  }

  // Load recent history
  try {
    const res = await pb.collection('messages').getList(1, 50, {
      query: {
        filter: `roomId = "${roomId}"`,
        sort: 'createdAtMs',
      },
    });
    console.log(`[client] last ${res.items.length} messages in room:`);
    for (const m of res.items) {
      const time = m.createdAtMs ? new Date(m.createdAtMs).toLocaleTimeString() : '';
      const author = m.from || 'unknown';
      const text = (m.content && m.content.text) ? m.content.text : JSON.stringify(m.content);
      console.log(`- [${time}] ${author}: ${text}`);
    }
  } catch (e) {
    console.warn('[client] failed to load history:', e?.message || e);
  }

  // Subscribe to messages and filter by roomId in handler
  await pb.collection('messages').subscribe('*', (e) => {
    if (e?.record?.roomId !== roomId) return;
    if (e.action === 'create') {
      console.log(`[${identity}] received:`, e.record.type, e.record.content);
    }
  });

  console.log(`[client] subscribed to messages in room: ${roomId}`);

  if (sendMessage) {
    try {
      await pb.collection('messages').create({
        roomId,
        from: user?.username || user?.email || identity,
        type: 'text',
        content: { text: messageText },
        createdAtMs: Date.now(),
        status: 'sent',
      });
      console.log('[client] sent:', messageText);
    } catch (e) {
      console.warn('[client] failed to send (likely due to rules).');
    }
  }

  // Interactive input: type to send messages; /quit to exit
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.setPrompt('> ');
  console.log('[client] running... type a message and press Enter to send ("/quit" to exit)');
  rl.on('line', async (line) => {
    const text = (line || '').trim();
    if (!text) {
      rl.prompt();
      return;
    }
    if (text === '/quit' || text === '/exit') {
      rl.close();
      return;
    }
    try {
      await pb.collection('messages').create({
        roomId,
        from: user?.username || user?.email || identity,
        type: 'text',
        content: { text },
        createdAtMs: Date.now(),
        status: 'sent',
      });
      console.log('[client] sent:', text);
    } catch (e) {
      console.warn('[client] failed to send:', e?.message || e);
    }
    rl.prompt();
  });
  rl.on('close', () => process.exit(0));
  rl.prompt();
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});


