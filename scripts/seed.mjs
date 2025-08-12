import dotenv from 'dotenv';
import fs from 'node:fs/promises';
import path from 'node:path';
import PocketBase from 'pocketbase';

dotenv.config();

const { POCKETBASE_URL, POCKETBASE_ADMIN_EMAIL, POCKETBASE_ADMIN_PASSWORD } = process.env;

if (!POCKETBASE_URL || !POCKETBASE_ADMIN_EMAIL || !POCKETBASE_ADMIN_PASSWORD) {
  console.error('Missing env. Set POCKETBASE_URL, POCKETBASE_ADMIN_EMAIL, POCKETBASE_ADMIN_PASSWORD');
  process.exit(1);
}

const pb = new PocketBase(POCKETBASE_URL);

async function ensureAuth() {
  if (!pb.authStore.isValid) {
    await pb.collection('_superusers').authWithPassword(POCKETBASE_ADMIN_EMAIL, POCKETBASE_ADMIN_PASSWORD);
  }
}

async function getOrCreateRoom(title) {
  try {
    const room = await pb.collection('rooms').getFirstListItem(`title = "${title}"`);
    return room;
  } catch {
    return pb.collection('rooms').create({ title, createdAtMs: Date.now() });
  }
}

async function loadSeedMessages() {
  const file = path.join(process.cwd(), 'seed', 'messages.json');
  const raw = await fs.readFile(file, 'utf-8');
  const arr = JSON.parse(raw);
  if (!Array.isArray(arr)) throw new Error('seed/messages.json must be an array');
  return arr;
}

async function upsertMessage(roomId, m) {
  const filter = `from = "${m.from}" && createdAtMs = ${m.createdAtMs}`;
  try {
    const existing = await pb.collection('messages').getFirstListItem(filter);
    await pb.collection('messages').update(existing.id, {
      roomId,
      from: m.from,
      type: m.type,
      content: m.content,
      createdAtMs: m.createdAtMs,
      editedAtMs: m.editedAtMs,
      status: m.status,
      refMessageId: m.refMessageId,
      refType: m.refType,
      refContent: m.refContent,
    });
  } catch {
    await pb.collection('messages').create({
      roomId,
      from: m.from,
      type: m.type,
      content: m.content,
      createdAtMs: m.createdAtMs,
      editedAtMs: m.editedAtMs,
      status: m.status,
      refMessageId: m.refMessageId,
      refType: m.refType,
      refContent: m.refContent,
    });
  }
}

async function main() {
  await ensureAuth();
  const room = await getOrCreateRoom('room-123');
  const seedMessages = await loadSeedMessages();

  for (const m of seedMessages) {
    await upsertMessage(room.id, m);
  }

  console.log('Seed complete');
}

main().catch((e) => { console.error(e); process.exit(1); });
