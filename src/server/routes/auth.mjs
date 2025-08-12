import express from 'express';
import { randomUUID } from 'node:crypto';

const router = express.Router();

// In-memory dummy data (for API testing only)
const users = [];
const tokens = new Map(); // token -> userId

function findUserByIdentity(identity) {
  return (
    users.find((u) => u.email === identity) ||
    users.find((u) => u.username === identity)
  );
}

function sanitizeUser(user) {
  if (!user) return null;
  const { password, ...safe } = user;
  return safe;
}

// POST /preLogin { identity }
router.post('/preLogin', async (req, res) => {
  try {
    const { identity } = req.body || {};
    if (!identity || typeof identity !== 'string') {
      return res.status(400).json({ error: 'identity is required' });
    }
    const exists = Boolean(findUserByIdentity(identity));
    return res.json({ exists });
  } catch (e) {
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

    const desiredUsername =
      (username && String(username).trim()) || String(email).split('@')[0];

    // Duplicate checks
    if (findUserByIdentity(email) || findUserByIdentity(desiredUsername)) {
      return res.status(409).json({ error: 'user_exists' });
    }

    // Create dummy user
    const user = {
      id: randomUUID(),
      email,
      username: desiredUsername,
      password, // NOTE: dummy only; do not store plaintext in production
      createdAt: Date.now(),
    };
    users.push(user);

    // Issue a dummy token and return safe user
    const token = randomUUID();
    tokens.set(token, user.id);
    return res.status(201).json({ user: sanitizeUser(user), token });
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
    const user = findUserByIdentity(identity);
    if (!user || user.password !== password) {
      return res.status(401).json({ error: 'auth_failed' });
    }
    const token = randomUUID();
    tokens.set(token, user.id);
    return res.json({ user: sanitizeUser(user), token });
  } catch (e) {
    const code = Number(e?.status) || 401;
    return res
      .status(code)
      .json({ error: e?.data?.message || e?.message || 'auth_failed' });
  }
});

// POST /logout
router.post('/logout', async (_req, res) => {
  // For dummy auth, accept optional Authorization: Bearer <token> and revoke it.
  try {
    const auth = _req.headers?.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length) : null;
    if (token) tokens.delete(token);
  } catch {}
  return res.json({ success: true });
});

export default router;


