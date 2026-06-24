const express = require('express');
const cors = require('cors');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Supabase clients ────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY || !SUPABASE_SECRET_KEY) {
    console.error('[VEB] SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY et SUPABASE_SECRET_KEY sont requis.');
    process.exit(1);
}

// Client admin (bypass RLS) — uniquement pour les opérations serveur sensibles
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
});

// Client public (respecte RLS)
const supabasePublic = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

// ─── Middleware ──────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname)));

// ─── Auth middleware (token statique) ───────────────────────────────────────
const VEB_TOKEN = process.env.VEB_TOKEN || 'veb-secret-2024';
function auth(req, res, next) {
    if (req.headers['x-veb-token'] !== VEB_TOKEN) {
          return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
}

// ─── withSupabase helper ─────────────────────────────────────────────────────
// Injecte ctx.supabase (public/RLS) et ctx.supabaseAdmin dans chaque handler
function withSupabase(handler) {
    return async (req, res) => {
          const ctx = {
                  supabase: supabasePublic,
                  supabaseAdmin
          };
          try {
                  await handler(req, res, ctx);
          } catch (e) {
                  console.error('[VEB] Handler error:', e.message);
                  res.status(500).json({ error: e.message });
          }
    };
}

// ─── Routes publiques ────────────────────────────────────────────────────────
app.get('/api/ping', (req, res) => res.json({ ok: true }));

// Login : vérifie les identifiants en variables d'env, retourne le rôle
app.post('/api/login', (req, res) => {
    const { username, password } = req.body || {};
    const ADMIN_USER = process.env.ADMIN_USER || '';
    const ADMIN_PASS = process.env.ADMIN_PASS || '';
    const GUEST_USER = process.env.GUEST_USER || '';
    const GUEST_PASS = process.env.GUEST_PASS || '';
    if (username === ADMIN_USER && password === ADMIN_PASS && ADMIN_USER !== '') {
          return res.json({ ok: true, role: 'Administrateur', display: 'Enzo' });
    }
    if (username === GUEST_USER && password === GUEST_PASS && GUEST_USER !== '') {
          return res.json({ ok: true, role: 'Collaborateur', display: GUEST_USER });
    }
    return res.status(401).json({ ok: false, error: 'Identifiants incorrects' });
});

// ─── CRM (annonces, clients, devis, commandes) ───────────────────────────────

// GET /api/crm — lecture complète depuis Supabase
app.get('/api/crm', auth, withSupabase(async (req, res, ctx) => {
    const [annoncesRes, clientsRes, devisRes, commandesRes] = await Promise.all([
          ctx.supabaseAdmin.from('annonces').select('*').order('created_at', { ascending: false }),
          ctx.supabaseAdmin.from('clients').select('*').order('created_at', { ascending: false }),
          ctx.supabaseAdmin.from('devis').select('*').order('created_at', { ascending: false }),
          ctx.supabaseAdmin.from('commandes').select('*').order('created_at', { ascending: false })
        ]);

                                         if (annoncesRes.error) throw new Error(annoncesRes.error.message);
    if (clientsRes.error) throw new Error(clientsRes.error.message);
    if (devisRes.error) throw new Error(devisRes.error.message);
    if (commandesRes.error) throw new Error(commandesRes.error.message);

                                         res.json({
                                               annonces: annoncesRes.data,
                                               clients: clientsRes.data,
                                               devisList: devisRes.data,
                                               commandesList: commandesRes.data,
                                               _updatedAt: new Date().toISOString()
                                         });
}));

// PUT /api/crm — mise à jour complète (upsert de toutes les collections)
app.put('/api/crm', auth, withSupabase(async (req, res, ctx) => {
    const { annonces = [], clients = [], devisList = [], commandesList = [] } = req.body || {};

                                         // Upsert chaque collection via supabaseAdmin (bypass RLS)
                                         const ops = [
                                               ctx.supabaseAdmin.from('annonces').upsert(annonces, { onConflict: 'id' }),
                                               ctx.supabaseAdmin.from('clients').upsert(clients, { onConflict: 'id' }),
                                               ctx.supabaseAdmin.from('devis').upsert(devisList, { onConflict: 'id' }),
                                               ctx.supabaseAdmin.from('commandes').upsert(commandesList, { onConflict: 'id' })
                                             ];

                                         const results = await Promise.all(ops);
    for (const r of results) {
          if (r.error) throw new Error(r.error.message);
    }

                                         res.json({ ok: true, _updatedAt: new Date().toISOString() });
}));

// ─── Annonces — CRUD granulaire ──────────────────────────────────────────────

// POST /api/annonces — créer une annonce
app.post('/api/annonces', auth, withSupabase(async (req, res, ctx) => {
    const annonce = req.body;
    const { data, error } = await ctx.supabaseAdmin
      .from('annonces')
      .insert([annonce])
      .select()
      .single();
    if (error) throw new Error(error.message);
    res.status(201).json(data);
}));

// PUT /api/annonces/:id — modifier une annonce
app.put('/api/annonces/:id', auth, withSupabase(async (req, res, ctx) => {
    const { id } = req.params;
    const updates = req.body;
    const { data, error } = await ctx.supabaseAdmin
      .from('annonces')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    res.json(data);
}));

// DELETE /api/annonces/:id — supprimer une annonce
app.delete('/api/annonces/:id', auth, withSupabase(async (req, res, ctx) => {
    const { id } = req.params;
    const { error } = await ctx.supabaseAdmin
      .from('annonces')
      .delete()
      .eq('id', id);
    if (error) throw new Error(error.message);
    res.json({ ok: true });
}));

// ─── Configuration ───────────────────────────────────────────────────────────

// GET /api/cfg — lire la config depuis Supabase
app.get('/api/cfg', auth, withSupabase(async (req, res, ctx) => {
    const { data, error } = await ctx.supabaseAdmin
      .from('config')
      .select('*')
      .eq('id', 'main')
      .maybeSingle();
    if (error) throw new Error(error.message);
    res.json(data ? data.value : {});
}));

// PUT /api/cfg — sauvegarder la config dans Supabase
app.put('/api/cfg', auth, withSupabase(async (req, res, ctx) => {
    const cfg = req.body;
    const { error } = await ctx.supabaseAdmin
      .from('config')
      .upsert({ id: 'main', value: cfg, updated_at: new Date().toISOString() }, { onConflict: 'id' });
    if (error) throw new Error(error.message);
    res.json({ ok: true });
}));

// ─── Logo ────────────────────────────────────────────────────────────────────

// GET /api/logo — lire le logo depuis Supabase
app.get('/api/logo', auth, withSupabase(async (req, res, ctx) => {
    const { data, error } = await ctx.supabaseAdmin
      .from('config')
      .select('*')
      .eq('id', 'logo')
      .maybeSingle();
    if (error) throw new Error(error.message);
    res.json({ logo: data ? data.value : null });
}));

// PUT /api/logo — sauvegarder le logo dans Supabase
app.put('/api/logo', auth, withSupabase(async (req, res, ctx) => {
    const { logo } = req.body;
    const { error } = await ctx.supabaseAdmin
      .from('config')
      .upsert({ id: 'logo', value: logo, updated_at: new Date().toISOString() }, { onConflict: 'id' });
    if (error) throw new Error(error.message);
    res.json({ ok: true });
}));

// ─── Route data (compatibilité rétrocompatible) ──────────────────────────────
app.get('/api/data', auth, withSupabase(async (req, res, ctx) => {
    const [annoncesRes, clientsRes, devisRes, commandesRes, cfgRes, logoRes] = await Promise.all([
          ctx.supabaseAdmin.from('annonces').select('*').order('created_at', { ascending: false }),
          ctx.supabaseAdmin.from('clients').select('*').order('created_at', { ascending: false }),
          ctx.supabaseAdmin.from('devis').select('*').order('created_at', { ascending: false }),
          ctx.supabaseAdmin.from('commandes').select('*').order('created_at', { ascending: false }),
          ctx.supabaseAdmin.from('config').select('*').eq('id', 'main').maybeSingle(),
          ctx.supabaseAdmin.from('config').select('*').eq('id', 'logo').maybeSingle()
        ]);
    res.json({
          crm: {
                  annonces: annoncesRes.data || [],
                  clients: clientsRes.data || [],
                  devisList: devisRes.data || [],
                  commandesList: commandesRes.data || []
          },
          cfg: cfgRes.data ? cfgRes.data.value : {},
          logo: logoRes.data ? logoRes.data.value : null
    });
}));

// ─── Traduction intelligente ──────────────────────────────────────────────────
app.post('/api/translate-text', withSupabase(async (req, res, ctx) => {
    const { text, targetLang = 'fr' } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ error: 'Texte vide.' });

                                               // Lire la clé OpenAI depuis Supabase config
                                               const { data: cfgData } = await ctx.supabaseAdmin
      .from('config')
      .select('*')
      .eq('id', 'main')
      .maybeSingle();
    const storedCfg = cfgData ? cfgData.value : {};
    const OPENAI_KEY = process.env.OPENAI_API_KEY || storedCfg.openai || '';

                                               let translatedText = null;

                                               if (OPENAI_KEY) {
                                                     try {
                                                             const systemPrompt = `Tu es un expert traducteur spécialisé dans le secteur des remorques, semi-remorques et véhicules utilitaires. Tu traduis des annonces professionnelles vers le français en utilisant le jargon technique du secteur : PTAC, PTRA, essieux, timon, ridelles, hayons, béquilles, châssis, bâche, plateau, porte-engins, bétaillère, citerne, frigo, semi, tridem, tandem, rampes, treuil, sangles, sellette, suspension pneumatique, ABS. Tu produis une traduction naturelle, fluide, adaptée à une publication professionnelle en français.`;
                                                             const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
                                                                       method: 'POST',
                                                                       headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + OPENAI_KEY },
                                                                       body: JSON.stringify({
                                                                                   model: 'gpt-4o-mini',
                                                                                   messages: [
                                                                                     { role: 'system', content: systemPrompt },
                                                                                     { role: 'user', content: 'Traduis ce texte en français : ' + text }
                                                                                               ],
                                                                                   temperature: 0.3,
                                                                                   max_tokens: 1000
                                                                       }),
                                                                       signal: AbortSignal.timeout(20000)
                                                             });
                                                             if (aiRes.ok) {
                                                                       const aiData = await aiRes.json();
                                                                       const msg = aiData.choices && aiData.choices[0] && aiData.choices[0].message;
                                                                       if (msg && msg.content) translatedText = msg.content.trim();
                                                             }
                                                     } catch(e) { console.warn('/api/translate-text OpenAI error:', e.message); }
                                               }

                                               if (!translatedText) {
                                                     try {
                                                             const gtUrl = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=' + encodeURIComponent(targetLang) + '&dt=t&q=' + encodeURIComponent(text);
                                                             const gtRes = await fetch(gtUrl, { signal: AbortSignal.timeout(10000) });
                                                             if (gtRes.ok) {
                                                                       const gtData = await gtRes.json();
                                                                       if (Array.isArray(gtData) && Array.isArray(gtData[0])) {
                                                                                   const parts = gtData[0].filter(s => s && s[0]).map(s => s[0]);
                                                                                   if (parts.length > 0) translatedText = parts.join('');
                                                                       }
                                                             }
                                                     } catch(e) { console.warn('/api/translate-text Google error:', e.message); }
                                               }

                                               if (!translatedText) {
                                                     return res.status(200).json({
                                                             translatedText: text,
                                                             warning: 'Service de traduction indisponible. Texte original retourné.'
                                                     });
                                               }
    res.json({ translatedText });
}));

// ─── SPA fallback ────────────────────────────────────────────────────────────
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.listen(PORT, () => {
    console.log('[VEB] Dashboard démarré sur le port ' + PORT);
    console.log('[VEB] Supabase URL:', SUPABASE_URL);
});
