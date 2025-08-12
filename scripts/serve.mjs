import { spawn } from 'child_process';
import dotenv from 'dotenv';

dotenv.config();

function parseAddressFromEnv() {
  const url = process.env.POCKETBASE_URL || 'http://127.0.0.1:8090';
  try {
    const u = new URL(url);
    const host = u.hostname || '127.0.0.1';
    const port = u.port || '8090';
    return `${host}:${port}`;
  } catch {
    return '127.0.0.1:8090';
  }
}

function run(bin, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`Command failed: ${bin} ${args.join(' ')}`))));
  });
}

(async () => {
  const httpAddr = parseAddressFromEnv();
  const bin = process.platform === 'win32' ? 'pocketbase.exe' : './pocketbase';

  const email = process.env.POCKETBASE_ADMIN_EMAIL;
  const password = process.env.POCKETBASE_ADMIN_PASSWORD;
  if (email && password) {
    try {
      await run(bin, ['superuser', 'upsert', email, password]);
    } catch (e) {
      // Ignore if user already exists
      console.warn('[serve] superuser upsert failed or already exists:', e.message || e);
    }
  } else {
    console.warn('[serve] Missing POCKETBASE_ADMIN_EMAIL or POCKETBASE_ADMIN_PASSWORD in .env; skipping superuser upsert');
  }

  const child = spawn(bin, ['serve', `--http=${httpAddr}`], { stdio: 'inherit' });
  child.on('exit', (code) => process.exit(code ?? 0));
})();
