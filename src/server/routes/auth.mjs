import express from 'express';
import {
  createPocketBaseClient,
  adminClient,
  ensureAdminAuth,
  escapeFilterValue,
} from '../services/pocketbase.mjs';

const router = express.Router();

// POST /preLogin { identity }
router.post('/preLogin', async (req, res) => {
  try {
    const { identity } = req.body || {};
    if (!identity || typeof identity !== 'string') {
      return res.status(400).json({ error: 'identity is required' });
    }
    const value = escapeFilterValue(identity);
    const isEmail = identity.includes('@');
    const tryFilters = isEmail
      ? [`email = "${value}"`]
      : [`username = "${value}"`, `email = "${value}"`];

    // Prefer admin lookup if admin credentials are provided to ignore list rules
    if (process.env.POCKETBASE_ADMIN_EMAIL && process.env.POCKETBASE_ADMIN_PASSWORD) {
      try {
        await ensureAdminAuth();
      } catch {}
      for (const filterStr of tryFilters) {
        try {
          await adminClient.collection('users').getFirstListItem(filterStr);
          return res.json({ exists: true });
        } catch (adminErr) {
          const aStatus = Number(adminErr?.status) || 0;
          if (aStatus === 404) {
            continue;
          }
          
          // On other admin errors, fall through to public attempt below
        }
      }
    }

    // Fallback to public list attempts
    for (const filterStr of tryFilters) {
      try {
        const pb = createPocketBaseClient();
        let list;
        try {
          list = await pb.collection('users').getList(1, 1, { filter: filterStr });
        } catch {
          list = await pb.collection('users').getList(1, 1, { query: { filter: filterStr } });
        }
        const items = Array.isArray(list?.items) ? list.items : Array.isArray(list) ? list : [];
        const exists = items.length > 0;
        if (exists) return res.json({ exists: true });
      } catch (err) {
        const status = Number(err?.status) || 0;
        
        // ignore and continue to next filter
      }
    }
    return res.json({ exists: false });
  } catch (e) {
    console.error('[api] preLogin fatal error:', e?.message || e);
    return res.status(500).json({ error: e?.message || 'server_error' });
  }
});

// POST /register { email, password, passwordConfirm, username? }
router.post('/register', async (req, res) => {
  try {
    const { email, password, passwordConfirm, username } = req.body || {};
    if (!email || !password || !passwordConfirm) {
      return res
        .status(400)
        .json({ error: 'email, password, passwordConfirm are required' });
    }
    if (password !== passwordConfirm) {
      return res.status(400).json({ error: 'password_mismatch' });
    }

    const desiredUsername = (username && String(username).trim()) || String(email).split('@')[0];

    // Try unauthenticated user creation first (works if registration is open)
    const pbForCreate = createPocketBaseClient();
    try {
      await pbForCreate.collection('users').create({
        email,
        username: desiredUsername,
        password,
        passwordConfirm,
      });
    } catch (err) {
      const status = Number(err?.status) || 0;
      const errMsg = err?.data?.message || err?.message || '';
      const isDuplicate = status === 400 && /already exists|unique|taken/i.test(String(JSON.stringify(err?.data || errMsg)));
      if (isDuplicate) {
        return res.status(409).json({ error: 'user_exists' });
      }

      // If open registration is disabled, try with admin if available
      if (status === 401 || status === 403) {
        try {
          await ensureAdminAuth();
          await adminClient.collection('users').create({
            email,
            username: desiredUsername,
            password,
            passwordConfirm,
          });
        } catch (adminErr) {
          const adminStatus = Number(adminErr?.status) || 0;
          const adminMsg = adminErr?.data?.message || adminErr?.message || '';
          const adminDuplicate = adminStatus === 400 && /already exists|unique|taken/i.test(String(JSON.stringify(adminErr?.data || adminMsg)));
          if (adminDuplicate) {
            return res.status(409).json({ error: 'user_exists' });
          }
          return res.status(adminStatus || 500).json({ error: adminMsg || 'register_failed' });
        }
      } else {
        return res.status(status || 500).json({ error: errMsg || 'register_failed' });
      }
    }

    // Auto-login after creation
    const pb = createPocketBaseClient();
    await pb.collection('users').authWithPassword(email, password);
    return res.status(201).json({
      user: pb.authStore.record,
      token: pb.authStore.token,
    });
  } catch (e) {
    const code = Number(e?.status) || 500;
    return res
      .status(code)
      .json({ error: e?.data?.message || e?.message || 'register_failed' });
  }
});

// POST /login { identity, password }
router.post('/login', async (req, res) => {
  try {
    const { identity, password } = req.body || {};
    if (!identity || !password) {
      return res
        .status(400)
        .json({ error: 'identity and password are required' });
    }
    const pb = createPocketBaseClient();
    await pb.collection('users').authWithPassword(identity, password);
    return res.json({
      user: pb.authStore.record,
      token: pb.authStore.token,
    });
  } catch (e) {
    
    const code = Number(e?.status) || 401;
    return res
      .status(code)
      .json({ error: e?.data?.message || e?.message || 'auth_failed' });
  }
});

// POST /logout
router.post('/logout', async (_req, res) => {
  // PocketBase JWTs are stateless; logout is client-side (discard token)
  return res.json({ success: true });
});

export default router;


