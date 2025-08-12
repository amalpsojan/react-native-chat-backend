import cors from 'cors';

const { CORS_ORIGIN } = process.env;

const allowedOrigins = CORS_ORIGIN ? CORS_ORIGIN.split(',').map((s) => s.trim()) : ['*'];

const corsMiddleware = cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error('Not allowed by CORS'));
  },
  credentials: false,
});

export default corsMiddleware;


