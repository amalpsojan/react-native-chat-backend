import express from 'express';
import {
  createPocketBaseClient,
  adminClient,
  ensureAdminAuth,
  escapeFilterValue,
} from '../services/pocketbase.mjs';

const router = express.Router();

// POST /createRoom { title }
router.post('/createRoom', async (req, res) => {
  try {
    const { title } = req.body || {};
    if (!title || typeof title !== 'string') {
      return res.status(400).json({ error: 'title is required' });
    }
    const v = escapeFilterValue(title.trim());

    // Prefer admin path to bypass rules and ensure idempotency
    if (process.env.POCKETBASE_ADMIN_EMAIL && process.env.POCKETBASE_ADMIN_PASSWORD) {
      try {
        await ensureAdminAuth();
        try {
          const existing = await adminClient
            .collection('rooms')
            .getFirstListItem(`title = "${v}"`);
          return res.json({ room: existing, created: false });
        } catch (e) {
          if (Number(e?.status) !== 404) {
            return res.status(Number(e?.status) || 500).json({ error: e?.data?.message || e?.message || 'lookup_failed' });
          }
        }

        const room = await adminClient.collection('rooms').create({ title: title.trim(), createdAtMs: Date.now() });
        return res.status(201).json({ room, created: true });
      } catch (err) {
        const code = Number(err?.status) || 500;
        return res.status(code).json({ error: err?.data?.message || err?.message || 'create_failed' });
      }
    }

    // Public fallback: try to create, else try to read
    const pb = createPocketBaseClient();
    try {
      const room = await pb.collection('rooms').create({ title: title.trim(), createdAtMs: Date.now() });
      return res.status(201).json({ room, created: true });
    } catch (createErr) {
      const status = Number(createErr?.status) || 0;
      if (status === 401 || status === 403) {
        return res.status(403).json({ error: 'not_allowed' });
      }
      // If create failed due to duplicate or exists, try to fetch
      try {
        const existing = await pb.collection('rooms').getFirstListItem(`title = "${v}"`);
        return res.json({ room: existing, created: false });
      } catch (readErr) {
        const code = Number(readErr?.status) || status || 500;
        return res.status(code).json({ error: readErr?.data?.message || readErr?.message || 'create_failed' });
      }
    }
  } catch (e) {
    return res.status(500).json({ error: e?.message || 'server_error' });
  }
});

export default router;


