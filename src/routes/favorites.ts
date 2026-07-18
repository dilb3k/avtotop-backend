import { Router, Response } from 'express';
import { supabase } from '../index';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

// Add to favorites
router.post('/:carId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { carId } = req.params;

    // Check if car exists
    const { data: car } = await supabase
      .from('cars')
      .select('id')
      .eq('id', carId)
      .single();

    if (!car) {
      return res.status(404).json({ error: 'E\'lon topilmadi' });
    }

    // Check if already favorited
    const { data: existing } = await supabase
      .from('favorites')
      .select('id')
      .eq('user_id', req.user.id)
      .eq('car_id', carId)
      .single();

    if (existing) {
      return res.status(400).json({ error: 'Bu e\'lon allaqachon sevimlilarda' });
    }

    const { data, error } = await supabase
      .from('favorites')
      .insert({
        user_id: req.user.id,
        car_id: carId
      })
      .select()
      .single();

    if (error) {
      return res.status(400).json({ error: 'Sevimlilarga qo\'shishda xatolik' });
    }

    res.status(201).json(data);
  } catch (error: any) {
    console.error('Add favorite error:', error);
    res.status(500).json({ error: 'Serverda xatolik yuz berdi' });
  }
});

// Remove from favorites
router.delete('/:carId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { carId } = req.params;

    const { error } = await supabase
      .from('favorites')
      .delete()
      .eq('user_id', req.user.id)
      .eq('car_id', carId);

    if (error) {
      return res.status(400).json({ error: 'Sevimlilardan o\'chirishda xatolik' });
    }

    res.json({ message: 'Sevimlilardan o\'chirildi' });
  } catch (error: any) {
    console.error('Remove favorite error:', error);
    res.status(500).json({ error: 'Serverda xatolik yuz berdi' });
  }
});

// Toggle favorite
router.post('/:carId/toggle', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { carId } = req.params;

    // Check if car exists
    const { data: car } = await supabase
      .from('cars')
      .select('id')
      .eq('id', carId)
      .single();

    if (!car) {
      return res.status(404).json({ error: 'E\'lon topilmadi' });
    }

    // Check if already favorited
    const { data: existing } = await supabase
      .from('favorites')
      .select('id')
      .eq('user_id', req.user.id)
      .eq('car_id', carId)
      .single();

    if (existing) {
      // Remove from favorites
      await supabase
        .from('favorites')
        .delete()
        .eq('id', existing.id);

      res.json({ is_favorite: false, message: 'Sevimlilardan o\'chirildi' });
    } else {
      // Add to favorites
      await supabase
        .from('favorites')
        .insert({
          user_id: req.user.id,
          car_id: carId
        });

      res.json({ is_favorite: true, message: 'Sevimlilarga qo\'shildi' });
    }
  } catch (error: any) {
    console.error('Toggle favorite error:', error);
    res.status(500).json({ error: 'Serverda xatolik yuz berdi' });
  }
});

// Check if car is favorited
router.get('/:carId/check', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { carId } = req.params;

    const { data } = await supabase
      .from('favorites')
      .select('id')
      .eq('user_id', req.user.id)
      .eq('car_id', carId)
      .single();

    res.json({ is_favorite: !!data });
  } catch (error: any) {
    res.json({ is_favorite: false });
  }
});

export default router;
