import dotenv from "dotenv";
import PocketBase from "pocketbase";

dotenv.config();

const { POCKETBASE_URL, POCKETBASE_ADMIN_EMAIL, POCKETBASE_ADMIN_PASSWORD } =
  process.env;

if (!POCKETBASE_URL || !POCKETBASE_ADMIN_EMAIL || !POCKETBASE_ADMIN_PASSWORD) {
  console.error(
    "Missing env. Set POCKETBASE_URL, POCKETBASE_ADMIN_EMAIL, POCKETBASE_ADMIN_PASSWORD"
  );
  process.exit(1);
}

const pb = new PocketBase(POCKETBASE_URL);

async function ensureAuth() {
  if (!pb.authStore.isValid) {
    // PocketBase >= 0.23: use _superusers auth collection instead of deprecated admins API
    await pb
      .collection("_superusers")
      .authWithPassword(POCKETBASE_ADMIN_EMAIL, POCKETBASE_ADMIN_PASSWORD);
  }
}

async function getCollectionByName(name) {
  const list = await pb.collections.getFullList();
  return list.find((c) => c.name === name) || null;
}

async function ensureRooms() {
  const exists = await getCollectionByName("rooms");
  if (exists) {
    console.log("Collection rooms exists");
    // Ensure rules allow authenticated users to list/view rooms
    await pb.collections.update(exists.id, {
      listRule: '@request.auth.id != ""',
      viewRule: '@request.auth.id != ""',
    });
    return await getCollectionByName("rooms");
  }
  console.log("Creating collection rooms");
  return pb.collections.create({
    name: "rooms",
    type: "base",
    fields: [{ name: "title", type: "text", required: true }],
    listRule: '@request.auth.id != ""',
    viewRule: '@request.auth.id != ""',
  });
}

async function ensureMessages(roomsId) {
  const exists = await getCollectionByName("messages");
  if (exists) {
    console.log("Collection messages exists");
    // Ensure rules allow authenticated users to list/view/create messages
    await pb.collections.update(exists.id, {
      listRule: '@request.auth.id != ""',
      viewRule: '@request.auth.id != ""',
      createRule: '@request.auth.id != ""',
    });
    return await getCollectionByName("messages");
  }
  console.log("Creating collection messages");
  return pb.collections.create({
    name: "messages",
    type: "base",
    fields: [
      {
        name: "roomId",
        type: "relation",
        required: true,
        collectionId: roomsId,
        cascadeDelete: true,
      },
      { name: "from", type: "text", required: true },
      { name: "type", type: "text", required: true },
      { name: "content", type: "json", required: true },
      { name: "createdAtMs", type: "number", required: true },
      { name: "editedAtMs", type: "number" },
      { name: "status", type: "text" },
      { name: "refMessageId", type: "text" },
      { name: "refType", type: "text" },
      { name: "refContent", type: "json" },
    ],
    listRule: '@request.auth.id != ""',
    viewRule: '@request.auth.id != ""',
    createRule: '@request.auth.id != ""',
  });
}

async function main() {
  await ensureAuth();
  const rooms = await ensureRooms();
  await ensureMessages(rooms.id);
  console.log("Schema ready");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
