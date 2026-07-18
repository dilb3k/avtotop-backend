import { Router, Response } from 'express';
import { supabase } from '../index';
import { authenticate, optionalAuth, AuthRequest } from '../middleware/auth';

const router = Router();

// Get my listings (MUST be before /:id)
router.get('/my/listings', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { status } = req.query;

    let query = supabase
      .from('cars')
      .select(`
        *,
        categories:category_id (id, name, slug, icon),
        car_images (id, url, is_primary)
      `)
      .eq('seller_id', req.user.id)
      .order('created_at', { ascending: false });

    if (status && ['active', 'sold', 'inactive'].includes(status as string)) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) {
      return res.status(400).json({ error: 'E\'lonlarni olishda xatolik' });
    }

    res.json(data || []);
  } catch (error: any) {
    console.error('My listings error:', error);
    res.status(500).json({ error: 'Serverda xatolik yuz berdi' });
  }
});

// Get all cars with filters (public)
router.get('/', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const {
      page = '1',
      limit = '12',
      category_id,
      brand,
      model,
      year_from,
      year_to,
      price_from,
      price_to,
      fuel_type,
      transmission,
      body_type,
      color,
      city,
      search,
      sort_by = 'created_at',
      sort_order = 'desc',
      seller_id,
      status = 'active',
      min_mileage,
      max_mileage,
      engine_from,
      engine_to
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
      `, { count: 'exact' });

    // Non-admin users only see active cars
    if (!req.profile || req.profile.role !== 'admin') {
      query = query.eq('status', status as string);
    }

    // Apply filters
    if (category_id) query = query.eq('category_id', category_id as string);
    if (brand) query = query.ilike('brand', `%${brand}%`);
    if (model) query = query.ilike('model', `%${model}%`);
    if (year_from) query = query.gte('year', parseInt(year_from as string));
    if (year_to) query = query.lte('year', parseInt(year_to as string));
    if (price_from) query = query.gte('price', parseInt(price_from as string));
    if (price_to) query = query.lte('price', parseInt(price_to as string));
    if (fuel_type) query = query.eq('fuel_type', fuel_type as string);
    if (transmission) query = query.eq('transmission', transmission as string);
    if (body_type) query = query.eq('body_type', body_type as string);
    if (color) query = query.ilike('color', `%${color}%`);
    if (city) query = query.ilike('city', `%${city}%`);
    if (seller_id) query = query.eq('seller_id', seller_id as string);
    if (min_mileage) query = query.gte('mileage', parseInt(min_mileage as string));
    if (max_mileage) query = query.lte('mileage', parseInt(max_mileage as string));
    if (engine_from) query = query.gte('engine_volume', parseFloat(engine_from as string));
    if (engine_to) query = query.lte('engine_volume', parseFloat(engine_to as string));

    if (search) {
      query = query.or(`brand.ilike.%${search}%,model.ilike.%${search}%,title.ilike.%${search}%,description.ilike.%${search}%`);
    }

    // Sorting
    const validSortFields = ['created_at', 'price', 'year', 'mileage', 'views'];
    const sortField = validSortFields.includes(sort_by as string) ? sort_by as string : 'created_at';
    query = query.order(sortField, { ascending: sort_order === 'asc' });

    // Pagination
    query = query.range(offset, offset + limitNum - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error('Cars fetch error:', error);
      return res.status(400).json({ error: 'E\'lonlarni olishda xatolik' });
    }

    // Mark favorites if user is logged in
    let favoriteIds: string[] = [];
    if (req.user && data) {
      const carIds = data.map(car => car.id);
      const { data: favs } = await supabase
        .from('favorites')
        .select('car_id')
        .eq('user_id', req.user.id)
        .in('car_id', carIds);
      favoriteIds = favs?.map(f => f.car_id) || [];
    }

    const carsWithFavorites = data?.map(car => ({
      ...car,
      is_favorite: favoriteIds.includes(car.id)
    })) || [];

    res.json({
      cars: carsWithFavorites,
      total: count || 0,
      page: pageNum,
      limit: limitNum,
      total_pages: count ? Math.ceil(count / limitNum) : 0
    });
  } catch (error: any) {
    console.error('Cars list error:', error);
    res.status(500).json({ error: 'Serverda xatolik yuz berdi' });
  }
});

// Get single car by ID
router.get('/:id', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const { data: car, error } = await supabase
      .from('cars')
      .select(`
        *,
        profiles:seller_id (id, full_name, phone, email, avatar_url, city, description, created_at),
        categories:category_id (id, name, slug, icon),
        car_images (id, url, is_primary, order_index)
      `)
      .eq('id', id)
      .single();

    if (error || !car) {
      return res.status(404).json({ error: 'E\'lon topilmadi' });
    }

    // Check if favorited by current user
    let is_favorite = false;
    if (req.user) {
      const { data: fav } = await supabase
        .from('favorites')
        .select('id')
        .eq('user_id', req.user.id)
        .eq('car_id', id)
        .single();
      is_favorite = !!fav;
    }

    // Increment view count (async, don't wait)
    supabase.rpc('increment_views', { car_id: id }).then();

    res.json({ ...car, is_favorite });
  } catch (error: any) {
    console.error('Car detail error:', error);
    res.status(500).json({ error: 'Serverda xatolik yuz berdi' });
  }
});

// Create car (authenticated)
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const {
      title, description, brand, model, year, price,
      category_id, fuel_type, transmission, body_type,
      color, engine_volume, mileage, city, images
    } = req.body;

    // Validation
    if (!title || !brand || !model || !year || !price || !city) {
      return res.status(400).json({ error: 'Sarlavha, marka, model, yil, narx va shahar kiritilishi shart' });
    }

    if (price <= 0) {
      return res.status(400).json({ error: 'Narx 0 dan katta bo\'lishi kerak' });
    }

    if (year < 1950 || year > new Date().getFullYear() + 1) {
      return res.status(400).json({ error: 'Noto\'g\'ri yil' });
    }

    // Create car
    const { data: car, error: carError } = await supabase
      .from('cars')
      .insert({
        seller_id: req.user.id,
        title: title.trim(),
        description: description?.trim() || null,
        brand: brand.trim(),
        model: model.trim(),
        year: parseInt(year),
        price: parseInt(price),
        category_id: category_id || null,
        fuel_type: fuel_type || null,
        transmission: transmission || null,
        body_type: body_type || null,
        color: color?.trim() || null,
        engine_volume: engine_volume ? parseFloat(engine_volume) : null,
        mileage: mileage ? parseInt(mileage) : null,
        city: city.trim(),
        status: 'active'
      })
      .select()
      .single();

    if (carError) {
      console.error('Car create error:', carError);
      return res.status(400).json({ error: 'E\'lon yaratishda xatolik' });
    }

    // Add images
    if (images && Array.isArray(images) && images.length > 0) {
      const imageData = images.slice(0, 10).map((url: string, index: number) => ({
        car_id: car.id,
        url: url.trim(),
        is_primary: index === 0,
        order_index: index
      }));

      const { error: imgError } = await supabase.from('car_images').insert(imageData);
      if (imgError) {
        console.error('Image insert error:', imgError);
      }
    }

    // Fetch complete car data
    const { data: fullCar } = await supabase
      .from('cars')
      .select(`
        *,
        profiles:seller_id (id, full_name, phone, avatar_url),
        categories:category_id (id, name, slug, icon),
        car_images (id, url, is_primary, order_index)
      `)
      .eq('id', car.id)
      .single();

    res.status(201).json(fullCar);
  } catch (error: any) {
    console.error('Create car error:', error);
    res.status(500).json({ error: 'Serverda xatolik yuz berdi' });
  }
});

// Update car
router.put('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Check ownership
    const { data: existing } = await supabase
      .from('cars')
      .select('seller_id, status')
      .eq('id', id)
      .single();

    if (!existing) {
      return res.status(404).json({ error: 'E\'lon topilmadi' });
    }

    if (existing.seller_id !== req.user.id && req.profile?.role !== 'admin') {
      return res.status(403).json({ error: 'Bu e\'lonni tahrirlashga ruxsatingiz yo\'q' });
    }

    const { images, ...updateData } = req.body;

    // Clean update data
    const cleanData: any = {};
    if (updateData.title) cleanData.title = updateData.title.trim();
    if (updateData.description !== undefined) cleanData.description = updateData.description?.trim() || null;
    if (updateData.brand) cleanData.brand = updateData.brand.trim();
    if (updateData.model) cleanData.model = updateData.model.trim();
    if (updateData.year) cleanData.year = parseInt(updateData.year);
    if (updateData.price) cleanData.price = parseInt(updateData.price);
    if (updateData.category_id !== undefined) cleanData.category_id = updateData.category_id || null;
    if (updateData.fuel_type !== undefined) cleanData.fuel_type = updateData.fuel_type || null;
    if (updateData.transmission !== undefined) cleanData.transmission = updateData.transmission || null;
    if (updateData.body_type !== undefined) cleanData.body_type = updateData.body_type || null;
    if (updateData.color !== undefined) cleanData.color = updateData.color?.trim() || null;
    if (updateData.engine_volume !== undefined) cleanData.engine_volume = updateData.engine_volume ? parseFloat(updateData.engine_volume) : null;
    if (updateData.mileage !== undefined) cleanData.mileage = updateData.mileage ? parseInt(updateData.mileage) : null;
    if (updateData.city) cleanData.city = updateData.city.trim();
    if (updateData.status && ['active', 'sold', 'inactive', 'pending'].includes(updateData.status)) {
      cleanData.status = updateData.status;
    }

    const { data, error } = await supabase
      .from('cars')
      .update(cleanData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return res.status(400).json({ error: 'E\'lonni yangilashda xatolik' });
    }

    // Update images if provided
    if (images && Array.isArray(images)) {
      await supabase.from('car_images').delete().eq('car_id', id);

      if (images.length > 0) {
        const imageData = images.slice(0, 10).map((url: string, index: number) => ({
          car_id: id,
          url: url.trim(),
          is_primary: index === 0,
          order_index: index
        }));
        await supabase.from('car_images').insert(imageData);
      }
    }

    // Fetch complete data
    const { data: fullCar } = await supabase
      .from('cars')
      .select(`
        *,
        profiles:seller_id (id, full_name, phone, avatar_url),
        categories:category_id (id, name, slug, icon),
        car_images (id, url, is_primary, order_index)
      `)
      .eq('id', id)
      .single();

    res.json(fullCar);
  } catch (error: any) {
    console.error('Update car error:', error);
    res.status(500).json({ error: 'Serverda xatolik yuz berdi' });
  }
});

// Delete car
router.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const { data: existing } = await supabase
      .from('cars')
      .select('seller_id')
      .eq('id', id)
      .single();

    if (!existing) {
      return res.status(404).json({ error: 'E\'lon topilmadi' });
    }

    if (existing.seller_id !== req.user.id && req.profile?.role !== 'admin') {
      return res.status(403).json({ error: 'Bu e\'lonni o\'chirishga ruxsatingiz yo\'q' });
    }

    // Delete images first
    await supabase.from('car_images').delete().eq('car_id', id);
    // Delete favorites
    await supabase.from('favorites').delete().eq('car_id', id);
    // Delete car
    const { error } = await supabase.from('cars').delete().eq('id', id);

    if (error) {
      return res.status(400).json({ error: 'E\'lonni o\'chirishda xatolik' });
    }

    res.json({ message: 'E\'lon muvaffaqiyatli o\'chirildi' });
  } catch (error: any) {
    console.error('Delete car error:', error);
    res.status(500).json({ error: 'Serverda xatolik yuz berdi' });
  }
});

export default router;
