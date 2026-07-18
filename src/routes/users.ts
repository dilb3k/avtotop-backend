import { Router, Response } from 'express';
import { supabase } from '../index';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

// Get user's favorites (MUST be before /:id)
router.get('/favorites', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('favorites')
      .select(`
        id,
        created_at,
        cars (
          *,
          profiles:seller_id (id, full_name, phone, avatar_url),
          categories:category_id (id, name, slug, icon),
          car_images (id, url, is_primary)
        )
      `)
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(400).json({ error: 'Sevimlilarni olishda xatolik' });
    }

    const favorites = data?.map(fav => ({
      ...fav,
      car: fav.cars
    })) || [];

    res.json(favorites);
  } catch (error: any) {
    console.error('Favorites error:', error);
    res.status(500).json({ error: 'Serverda xatolik yuz berdi' });
  }
});

// Update own profile (MUST be before /:id)
router.put('/profile', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { full_name, phone, avatar_url, city, description } = req.body;

    const updateData: any = {};
    if (full_name !== undefined) updateData.full_name = full_name.trim();
    if (phone !== undefined) updateData.phone = phone?.trim() || null;
    if (avatar_url !== undefined) updateData.avatar_url = avatar_url?.trim() || null;
    if (city !== undefined) updateData.city = city?.trim() || null;
    if (description !== undefined) updateData.description = description?.trim() || null;

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: "Yangilash uchun ma'lumot kiritilmadi" });
    }

    const { data, error } = await supabase
      .from('profiles')
      .update(updateData)
      .eq('id', req.user.id)
      .select()
      .single();

    if (error) {
      return res.status(400).json({ error: 'Profilni yangilashda xatolik' });
    }

    res.json(data);
  } catch (error: any) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Serverda xatolik yuz berdi' });
  }
});

// Get user stats (MUST be before /:id)
router.get('/:id/stats', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const { count: totalCars } = await supabase
      .from('cars')
      .select('*', { count: 'exact', head: true })
      .eq('seller_id', id);

    const { count: activeCars } = await supabase
      .from('cars')
      .select('*', { count: 'exact', head: true })
      .eq('seller_id', id)
      .eq('status', 'active');

    const { count: soldCars } = await supabase
      .from('cars')
      .select('*', { count: 'exact', head: true })
      .eq('seller_id', id)
      .eq('status', 'sold');

    const { data: cars } = await supabase
      .from('cars')
      .select('views')
      .eq('seller_id', id);

    const totalViews = cars?.reduce((sum, car) => sum + (car.views || 0), 0) || 0;

    const { count: favorites } = await supabase
      .from('favorites')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', id);

    res.json({
      total_cars: totalCars || 0,
      active_cars: activeCars || 0,
      sold_cars: soldCars || 0,
      total_views: totalViews,
      favorites: favorites || 0
    });
  } catch (error: any) {
    console.error('User stats error:', error);
    res.status(500).json({ error: 'Serverda xatolik yuz berdi' });
  }
});

// Get user public profile
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url, city, description, role, created_at')
      .eq('id', id)
      .single();

    if (error || !profile) {
      return res.status(404).json({ error: 'Foydalanuvchi topilmadi' });
    }

    // Get user's active cars
    const { data: cars } = await supabase
      .from('cars')
      .select(`
        *,
        categories:category_id (id, name, slug, icon),
        car_images (id, url, is_primary)
      `)
      .eq('seller_id', id)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(20);

    // Get stats
    const { count: totalCars } = await supabase
      .from('cars')
      .select('*', { count: 'exact', head: true })
      .eq('seller_id', id);

    const { count: activeCars } = await supabase
      .from('cars')
      .select('*', { count: 'exact', head: true })
      .eq('seller_id', id)
      .eq('status', 'active');

    res.json({
      ...profile,
      cars: cars || [],
      stats: {
        total_cars: totalCars || 0,
        active_cars: activeCars || 0
      }
    });
  } catch (error: any) {
    console.error('User profile error:', error);
    res.status(500).json({ error: 'Serverda xatolik yuz berdi' });
  }
});

export default router;
