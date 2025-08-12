import dotenv from 'dotenv';
import express from 'express';
import corsMiddleware from './middleware/cors.mjs';
import authRouter from './routes/auth.mjs';

dotenv.config();

const { API_PORT } = process.env;

const app = express();
app.use(express.json());
app.use(corsMiddleware);

app.use('/', authRouter);

const port = Number(API_PORT) || 4000;
app.listen(port, () => {
  console.log(`[api] listening on http://127.0.0.1:${port}`);
});


