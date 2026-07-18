import { Router, Request, Response } from 'express';
import { supabase } from '../index';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

// Get all categories with car count
router.get('/', async (_req: Request, res: Response) => {
  try {
    const { data: categories, error } = await supabase
      .from('categories')
      .select('*')
      .order('name');

    if (error) {
      return res.status(400).json({ error: 'Kategoriyalarni olishda xatolik' });
    }

    // Get car counts for each category
    const categoriesWithCounts = await Promise.all(
      (categories || []).map(async (cat) => {
        const { count } = await supabase
          .from('cars')
          .select('*', { count: 'exact', head: true })
          .eq('category_id', cat.id)
          .eq('status', 'active');
        return { ...cat, car_count: count || 0 };
      })
    );

    res.json(categoriesWithCounts);
  } catch (error: any) {
    console.error('Categories error:', error);
    res.status(500).json({ error: 'Serverda xatolik yuz berdi' });
  }
});

// Get category by ID
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Kategoriya topilmadi' });
    }

    // Get car count
    const { count } = await supabase
      .from('cars')
      .select('*', { count: 'exact', head: true })
      .eq('category_id', id)
      .eq('status', 'active');

    res.json({ ...data, car_count: count || 0 });
  } catch (error: any) {
    console.error('Category detail error:', error);
    res.status(500).json({ error: 'Serverda xatolik yuz berdi' });
  }
});

// Create category (admin only)
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (req.profile?.role !== 'admin') {
      return res.status(403).json({ error: 'Faqat adminlar kategoriya qo\'sha oladi' });
    }

    const { name, slug, icon, description } = req.body;

    if (!name || !slug) {
      return res.status(400).json({ error: 'Nomi va slug kiritilishi shart' });
    }

    const { data, error } = await supabase
      .from('categories')
      .insert({ name, slug, icon, description })
      .select()
      .single();

    if (error) {
      if (error.message.includes('duplicate')) {
        return res.status(400).json({ error: 'Bu slug allaqachon mavjud' });
      }
      return res.status(400).json({ error: 'Kategoriya yaratishda xatolik' });
    }

    res.status(201).json(data);
  } catch (error: any) {
    console.error('Create category error:', error);
    res.status(500).json({ error: 'Serverda xatolik yuz berdi' });
  }
});

// Update category (admin only)
router.put('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (req.profile?.role !== 'admin') {
      return res.status(403).json({ error: 'Faqat adminlar kategoriyani tahrirlay oladi' });
    }

    const { id } = req.params;
    const { name, slug, icon, description } = req.body;

    const { data, error } = await supabase
      .from('categories')
      .update({ name, slug, icon, description })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return res.status(400).json({ error: 'Kategoriyani yangilashda xatolik' });
    }

    res.json(data);
  } catch (error: any) {
    console.error('Update category error:', error);
    res.status(500).json({ error: 'Serverda xatolik yuz berdi' });
  }
});

// Delete category (admin only)
router.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (req.profile?.role !== 'admin') {
      return res.status(403).json({ error: 'Faqat adminlar kategoriyani o\'chira oladi' });
    }

    const { id } = req.params;

    // Check if category has cars
    const { count } = await supabase
      .from('cars')
      .select('*', { count: 'exact', head: true })
      .eq('category_id', id);

    if (count && count > 0) {
      return res.status(400).json({ error: 'Bu kategoriyada e\'lonlar mavjud. Avval ularni o\'chiring yoki boshqa kategoriyaga ko\'chiring.' });
    }

    const { error } = await supabase.from('categories').delete().eq('id', id);

    if (error) {
      return res.status(400).json({ error: 'Kategoriyani o\'chirishda xatolik' });
    }

    res.json({ message: 'Kategoriya o\'chirildi' });
  } catch (error: any) {
    console.error('Delete category error:', error);
    res.status(500).json({ error: 'Serverda xatolik yuz berdi' });
  }
});

export default router;
