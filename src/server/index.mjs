import dotenv from 'dotenv';
import express from 'express';
import corsMiddleware from './middleware/cors.mjs';
import { createProxyMiddleware } from 'http-proxy-middleware';
import authRouter from './routes/auth.mjs';
import roomsRouter from './routes/rooms.mjs';

dotenv.config();

const { API_PORT, POCKETBASE_URL } = process.env;

const app = express();
app.use(express.json());
app.use(corsMiddleware);

app.use('/api', authRouter);
app.use('/api', roomsRouter);

// Optional: proxy PocketBase under /pb to unify frontend base URL
if (POCKETBASE_URL) {
  app.use(
    '/pb',
    createProxyMiddleware({
      target: POCKETBASE_URL,
      changeOrigin: true,
      pathRewrite: {
        '^/pb': '',
      },
      ws: true,
    })
  );
}

const port = Number(API_PORT) || 4000;
app.listen(port, () => {
  console.log(`[api] listening on http://127.0.0.1:${port}/api`);
});


