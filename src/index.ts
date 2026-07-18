import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import rateLimit from 'express-rate-limit';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Supabase client with service role key
export const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Middleware
app.use(helmet());
app.use(morgan('combined'));
const allowedOrigins = (process.env.CORS_ORIGIN || '').split(',').filter(Boolean);
app.use(cors({
  origin: allowedOrigins.length > 0 ? allowedOrigins : false,
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: { error: 'Juda ko\'p so\'rov. Iltimos, biroz kuting.' }
});
app.use('/api/', limiter);

// Routes
import authRoutes from './routes/auth';
import carRoutes from './routes/cars';
import categoryRoutes from './routes/categories';
import userRoutes from './routes/users';
import favoriteRoutes from './routes/favorites';
import searchRoutes from './routes/search';
import uploadRoutes from './routes/upload';

app.use('/api/auth', authRoutes);
app.use('/api/cars', carRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/users', userRoutes);
app.use('/api/favorites', favoriteRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/upload', uploadRoutes);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'Avtotop Backend API',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Sahifa topilmadi' });
});

// Error handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Serverda xatolik yuz berdi' });
});

app.listen(PORT, () => {
  console.log(`Avtotop Backend API running on port ${PORT}`);
});

export default app;
