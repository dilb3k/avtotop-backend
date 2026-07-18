import { Router, Response } from 'express';
import multer from 'multer';
import { supabase } from '../index';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

// Multer config — memory storage, max 5MB
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Faqat JPEG, PNG, WebP, GIF formatlar qabul qilinadi'));
    }
  },
});

// Upload single image
router.post('/', authenticate, upload.single('image'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Fayl yuklanmadi' });
    }

    const ext = req.file.originalname.split('.').pop() || 'jpg';
    const filePath = `cars/${req.user.id}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const { error } = await supabase.storage
      .from('car-images')
      .upload(filePath, req.file.buffer, {
        contentType: req.file.mimetype,
        cacheControl: '3600',
        upsert: false,
      });

    if (error) {
      console.error('Storage upload error:', error);
      return res.status(400).json({ error: 'Rasmni yuklashda xatolik' });
    }

    const { data } = supabase.storage.from('car-images').getPublicUrl(filePath);

    res.json({ url: data.publicUrl });
  } catch (error: any) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Serverda xatolik' });
  }
});

// Upload multiple images (max 10)
router.post('/multiple', authenticate, upload.array('images', 10), async (req: AuthRequest, res: Response) => {
  try {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'Fayllar yuklanmadi' });
    }

    const urls: string[] = [];

    for (const file of files) {
      const ext = file.originalname.split('.').pop() || 'jpg';
      const filePath = `cars/${req.user.id}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

      const { error } = await supabase.storage
        .from('car-images')
        .upload(filePath, file.buffer, {
          contentType: file.mimetype,
          cacheControl: '3600',
          upsert: false,
        });

      if (error) {
        console.error('Storage upload error:', error);
        continue;
      }

      const { data } = supabase.storage.from('car-images').getPublicUrl(filePath);
      urls.push(data.publicUrl);
    }

    res.json({ urls });
  } catch (error: any) {
    console.error('Multiple upload error:', error);
    res.status(500).json({ error: 'Serverda xatolik' });
  }
});

export default router;
