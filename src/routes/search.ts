import { Router, Request, Response } from 'express';
import { supabase } from '../index';

const router = Router();

// Advanced search
router.get('/', async (req: Request, res: Response) => {
  try {
    const {
      q,
      brand,
      model,
      category,
      year_from,
      year_to,
      price_from,
      price_to,
      fuel_type,
      transmission,
      body_type,
      city,
      sort = 'newest',
      page = '1',
      limit = '12'
    } = req.query;

    const pageNum = Math.max(1, parseInt(page as string) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit as string) || 12));
    const offset = (pageNum - 1) * limitNum;

    let query = supabase
      .from('cars')
      .select(`
        *,
        profiles:seller_id (id, full_name, phone, avatar_url, city),
        categories:category_id (id, name, slug, icon),
        car_images (id, url, is_primary)
      `, { count: 'exact' })
      .eq('status', 'active');

    // Full text search
    if (q) {
      query = query.or(`brand.ilike.%${q}%,model.ilike.%${q}%,title.ilike.%${q}%,description.ilike.%${q}%`);
    }

    if (brand) query = query.ilike('brand', `%${brand}%`);
    if (model) query = query.ilike('model', `%${model}%`);
    if (category) query = query.eq('category_id', category as string);
    if (year_from) query = query.gte('year', parseInt(year_from as string));
    if (year_to) query = query.lte('year', parseInt(year_to as string));
    if (price_from) query = query.gte('price', parseInt(price_from as string));
    if (price_to) query = query.lte('price', parseInt(price_to as string));
    if (fuel_type) query = query.eq('fuel_type', fuel_type as string);
    if (transmission) query = query.eq('transmission', transmission as string);
    if (body_type) query = query.eq('body_type', body_type as string);
    if (city) query = query.ilike('city', `%${city}%`);

    // Sorting
    switch (sort) {
      case 'price_asc':
        query = query.order('price', { ascending: true });
        break;
      case 'price_desc':
        query = query.order('price', { ascending: false });
        break;
      case 'year_desc':
        query = query.order('year', { ascending: false });
        break;
      case 'year_asc':
        query = query.order('year', { ascending: true });
        break;
      case 'mileage':
        query = query.order('mileage', { ascending: true });
        break;
      case 'popular':
        query = query.order('views', { ascending: false });
        break;
      default:
        query = query.order('created_at', { ascending: false });
    }

    query = query.range(offset, offset + limitNum - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error('Search error:', error);
      return res.status(400).json({ error: 'Qidirishda xatolik' });
    }

    // Get unique brands for filter
    const { data: brands } = await supabase
      .from('cars')
      .select('brand')
      .eq('status', 'active')
      .order('brand');

    const uniqueBrands = [...new Set(brands?.map(b => b.brand) || [])];

    // Get unique cities
    const { data: cities } = await supabase
      .from('cars')
      .select('city')
      .eq('status', 'active')
      .order('city');

    const uniqueCities = [...new Set(cities?.map(c => c.city) || [])];

    res.json({
      cars: data || [],
      filters: {
        brands: uniqueBrands,
        cities: uniqueCities
      },
      total: count || 0,
      page: pageNum,
      limit: limitNum,
      total_pages: count ? Math.ceil(count / limitNum) : 0
    });
  } catch (error: any) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Serverda xatolik yuz berdi' });
  }
});

// Get popular brands
router.get('/brands', async (_req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .rpc('get_popular_brands');

    if (error) {
      // Fallback: manual query
      const { data: cars } = await supabase
        .from('cars')
        .select('brand')
        .eq('status', 'active');

      const brandCounts: Record<string, number> = {};
      cars?.forEach(car => {
        brandCounts[car.brand] = (brandCounts[car.brand] || 0) + 1;
      });

      const brands = Object.entries(brandCounts)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 20);

      return res.json(brands);
    }

    res.json(data);
  } catch (error: any) {
    console.error('Brands error:', error);
    res.status(500).json({ error: 'Serverda xatolik yuz berdi' });
  }
});

// Get price statistics
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const { brand, model } = req.query;

    let query = supabase
      .from('cars')
      .select('price')
      .eq('status', 'active');

    if (brand) query = query.ilike('brand', `%${brand}%`);
    if (model) query = query.ilike('model', `%${model}%`);

    const { data } = await query;

    if (!data || data.length === 0) {
      return res.json({ min: 0, max: 0, avg: 0, count: 0 });
    }

    const prices = data.map(d => d.price);
    const stats = {
      min: Math.min(...prices),
      max: Math.max(...prices),
      avg: Math.round(prices.reduce((a, b) => a + b, 0) / prices.length),
      count: prices.length
    };

    res.json(stats);
  } catch (error: any) {
    console.error('Stats error:', error);
    res.status(500).json({ error: 'Serverda xatolik yuz berdi' });
  }
});

export default router;
