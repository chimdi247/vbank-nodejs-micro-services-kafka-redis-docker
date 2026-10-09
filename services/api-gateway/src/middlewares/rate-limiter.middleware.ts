import rateLimit from 'express-rate-limit';
import { config } from '../config';

export const limiter = rateLimit({
  skip: (req) => {
    return config.NODE_ENV !== 'production' || req.path === '/health';
  },
  windowMs: config.RATE_LIMIT_WINDOW * 60 * 1000,
  limit: config.RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
});
