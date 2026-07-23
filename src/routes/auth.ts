import { Router, Request, Response } from 'express';
import { supabase } from '../index';
import { authenticate, AuthRequest } from '../middleware/auth';
import crypto from 'crypto';

const router = Router();

// Validate Telegram Web App initData
function validateInitData(initData: string, botToken: string): { user: any } | null {
  try {
    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get('hash');
    urlParams.delete('hash');
    
    const dataCheckString = Array.from(urlParams.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');
    
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
    
    if (calculatedHash !== hash) {
      return null;
    }
    
    const userParam = urlParams.get('user');
    if (userParam) {
      return { user: JSON.parse(userParam) };
    }
    return null;
  } catch {
    return null;
  }
}

// Register
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, password, full_name, phone } = req.body;

    if (!email || !password || !full_name) {
      return res.status(400).json({ error: 'Email, parol va to\'liq ism kiritilishi shart' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Parol kamida 6 ta belgi bo\'lishi kerak' });
    }

    // Create auth user
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });

    if (authError) {
      if (authError.message.includes('already registered')) {
        return res.status(400).json({ error: 'Bu email allaqachon ro\'yxatdan o\'tgan' });
      }
      return res.status(400).json({ error: authError.message });
    }

    // Create profile (role is always 'user' for new registrations)
    const { error: profileError } = await supabase
      .from('profiles')
      .insert({
        id: authData.user.id,
        email,
        full_name,
        phone: phone || null,
        role: 'user'
      });

    if (profileError) {
      console.error('Profile create error:', JSON.stringify(profileError));
      await supabase.auth.admin.deleteUser(authData.user.id);
      if (profileError.message?.includes('relation') || profileError.message?.includes('does not exist')) {
        return res.status(500).json({ error: 'Database jadvali topilmadi. Admin bilan bog\'laning.' });
      }
      return res.status(400).json({ error: `Profil xatolik: ${profileError.message || profileError.code || 'Noma\'lum xatolik'}` });
    }

    // Sign in to get tokens
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (signInError) {
      return res.status(200).json({ message: 'Ro\'yxatdan o\'tish muvaffaqiyatli. Tizimga kiring.' });
    }

    // Get full profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', authData.user.id)
      .single();

    res.status(201).json({
      user: signInData.user,
      session: signInData.session,
      profile,
      message: 'Muvaffaqiyatli ro\'yxatdan o\'tildi'
    });
  } catch (error: any) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Serverda xatolik yuz berdi' });
  }
});

// Login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email va parol kiritilishi shart' });
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      if (error.message.includes('Invalid login')) {
        return res.status(401).json({ error: 'Email yoki parol noto\'g\'ri' });
      }
      return res.status(400).json({ error: error.message });
    }

    // Get profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', data.user.id)
      .single();

    res.json({
      user: data.user,
      session: data.session,
      profile,
      message: 'Muvaffaqiyatli kirildi'
    });
  } catch (error: any) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Serverda xatolik yuz berdi' });
  }
});

// Get current user
router.get('/me', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    res.json({
      user: req.user,
      profile: req.profile
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Serverda xatolik yuz berdi' });
  }
});

// Refresh token
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const { refresh_token } = req.body;

    if (!refresh_token) {
      return res.status(400).json({ error: 'Refresh token talab qilinadi' });
    }

    const { data, error } = await supabase.auth.refreshSession({
      refresh_token
    });

    if (error) {
      return res.status(401).json({ error: 'Token yangilashda xatolik' });
    }

    res.json({ session: data.session });
  } catch (error: any) {
    res.status(500).json({ error: 'Serverda xatolik yuz berdi' });
  }
});

// Logout
router.post('/logout', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token) {
      await supabase.auth.admin.signOut(token);
    }
    res.json({ message: 'Muvaffaqiyatli chiqildi' });
  } catch (error: any) {
    res.status(500).json({ error: 'Serverda xatolik yuz berdi' });
  }
});

// Register from Telegram bot
router.post('/register-bot', async (req: Request, res: Response) => {
  try {
    const { email, password, full_name, telegram_id } = req.body;

    if (!email || !password || !full_name || !telegram_id) {
      return res.status(400).json({ error: 'Barcha maydonlar to\'ldirilishi shart' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Parol kamida 6 ta belgi bo\'lishi kerak' });
    }

    // Create auth user
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });

    if (authError) {
      if (authError.message.includes('already registered')) {
        return res.status(400).json({ error: 'Bu email allaqachon ro\'yxatdan o\'tgan' });
      }
      return res.status(400).json({ error: authError.message });
    }

    // Create profile with telegram_id
    const { error: profileError } = await supabase
      .from('profiles')
      .insert({
        id: authData.user.id,
        email,
        full_name,
        telegram_id: telegram_id.toString(),
        role: 'user'
      });

    if (profileError) {
      console.error('Profile create error:', JSON.stringify(profileError));
      await supabase.auth.admin.deleteUser(authData.user.id);
      return res.status(400).json({ error: `Profil xatolik: ${profileError.message || 'Noma\'lum xatolik'}` });
    }

    // Sign in
    const { data: signInData } = await supabase.auth.signInWithPassword({ email, password });

    res.status(201).json({
      user: authData.user,
      session: signInData?.session,
      message: 'Muvaffaqiyatli ro\'yxatdan o\'tildi'
    });
  } catch (error: any) {
    console.error('Register-bot error:', error);
    res.status(500).json({ error: 'Serverda xatolik yuz berdi' });
  }
});

// Login from Telegram bot + link telegram_id
router.post('/login-bot', async (req: Request, res: Response) => {
  try {
    const { email, password, telegram_id } = req.body;

    if (!email || !password || !telegram_id) {
      return res.status(400).json({ error: 'Email, parol va telegram_id kiritilishi shart' });
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      return res.status(401).json({ error: 'Email yoki parol noto\'g\'ri' });
    }

    // Link telegram_id to profile
    const { error: linkError } = await supabase
      .from('profiles')
      .update({ telegram_id: telegram_id.toString() })
      .eq('id', data.user.id);

    if (linkError) {
      console.error('Link telegram error:', linkError);
    }

    // Get profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', data.user.id)
      .single();

    res.json({
      user: data.user,
      session: data.session,
      profile,
      message: 'Muvaffaqiyatli kirildi'
    });
  } catch (error: any) {
    console.error('Login-bot error:', error);
    res.status(500).json({ error: 'Serverda xatolik yuz berdi' });
  }
});

// Notify Telegram bot that user logged in via website
router.post('/notify-bot-login', async (req: Request, res: Response) => {
  try {
    const { chat_id } = req.body;

    if (!chat_id) {
      return res.status(400).json({ error: 'chat_id kiritilishi shart' });
    }

    const BOT_TOKEN = process.env.BOT_TOKEN;
    if (!BOT_TOKEN) {
      return res.status(500).json({ error: 'BOT_TOKEN konfiguratsiyada yo\'q' });
    }

    const { full_name, email } = req.body;

    const text = `✅ <b>Tizimga muvaffaqiyatli kirdingiz!</b>\n\n👤 ${full_name || 'Noma\'lum'}\n📧 ${email || ''}\n\n🏠 Endi botdan to\'liq foydalanishingiz mumkin.`;

    const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chat_id,
        text: text,
        parse_mode: 'HTML',
      }),
    });

    const result = await response.json();

    if (!result.ok) {
      console.error('Telegram send error:', result);
      return res.status(500).json({ error: 'Botga xabar yuborishda xatolik' });
    }

    res.json({ message: 'Botga xabar yuborildi' });
  } catch (error: any) {
    console.error('Notify-bot-login error:', error);
    res.status(500).json({ error: 'Serverda xatolik yuz berdi' });
  }
});

// Login/Register via Telegram Mini App
router.post('/mini-app-auth', async (req: Request, res: Response) => {
  try {
    const { initData } = req.body;

    if (!initData) {
      return res.status(400).json({ error: 'initData kiritilishi shart' });
    }

    const BOT_TOKEN = process.env.BOT_TOKEN;
    if (!BOT_TOKEN) {
      return res.status(500).json({ error: 'BOT_TOKEN konfiguratsiyada yo\'q' });
    }

    const validation = validateInitData(initData, BOT_TOKEN);
    if (!validation || !validation.user) {
      return res.status(401).json({ error: 'Noto\'g\'ri initData' });
    }

    const tgUser = validation.user;
    const telegramId = tgUser.id.toString();
    const email = `${telegramId}@telegram.avtotop`;
    const fullName = `${tgUser.first_name || ''} ${tgUser.last_name || ''}`.trim() || 'Telegram User';

    // Check if profile exists with this telegram_id
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('*')
      .eq('telegram_id', telegramId)
      .single();

    if (existingProfile) {
      // User exists, sign in
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password: telegramId,
      });

      if (authError) {
        console.error('Mini app auth error:', authError);
        return res.status(401).json({ error: 'Avtorizatsiya xatoligi' });
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authData.user.id)
        .single();

      return res.json({
        user: authData.user,
        session: authData.session,
        profile,
        message: 'Muvaffaqiyatli kirildi'
      });
    }

    // Create new user
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password: telegramId,
      email_confirm: true,
      user_metadata: { telegram_id: telegramId },
    });

    if (authError) {
      return res.status(400).json({ error: authError.message });
    }

    // Create profile
    const { error: profileError } = await supabase
      .from('profiles')
      .insert({
        id: authData.user.id,
        email,
        full_name: fullName,
        telegram_id: telegramId,
        role: 'user',
      });

    if (profileError) {
      await supabase.auth.admin.deleteUser(authData.user.id);
      return res.status(400).json({ error: `Profil xatolik: ${profileError.message || 'Noma\'lum xatolik'}` });
    }

    // Sign in
    const { data: signInData } = await supabase.auth.signInWithPassword({ email, password: telegramId });

    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', authData.user.id)
      .single();

    res.status(201).json({
      user: authData.user,
      session: signInData?.session,
      profile,
      message: 'Muvaffaqiyatli ro\'yxatdan o\'tildi'
    });
  } catch (error: any) {
    console.error('Mini app auth error:', error);
    res.status(500).json({ error: 'Serverda xatolik yuz berdi' });
  }
});

export default router;
