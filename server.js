const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'veb-data.json');
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname));
function initData() {
if (!fs.existsSync(DATA_FILE)) {
fs.writeFileSync(DATA_FILE, JSON.stringify({ cfg: {}, crm: { clients: [], devisList: [], commandesList: [], annonces: [] }, logo: null }));
}
}
function readData() {
try { initData(); return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
catch(e) { return { cfg: {}, crm: { clients: [], devisList: [], commandesList: [], annonces: [] }, logo: null }; }
}
function writeData(data) {
data.lastUpdated = new Date().toISOString();
fs.writeFileSync(DATA_FILE, JSON.stringify(data));
}
const VEB_TOKEN = process.env.VEB_TOKEN || 'veb-secret-2024';
function auth(req, res, next) {
if (req.headers['x-veb-token'] !== VEB_TOKEN) return res.status(401).json({ error: 'Unauthorized' });
next();
}
app.get('/api/ping', (req, res) => res.json({ ok: true }));
app.post('/api/login', (req, res) => {
const { username, password } = req.body || {};
const ADMIN_USER = process.env.ADMIN_USER || '';
const ADMIN_PASS = process.env.ADMIN_PASS || '';
const GUEST_USER = process.env.GUEST_USER || '';
const GUEST_PASS = process.env.GUEST_PASS || '';
if (username === ADMIN_USER && password === ADMIN_PASS && ADMIN_USER !== '') {
return res.json({ ok: true, role: 'Administrateur', display: ADMIN_USER });
}
if (username === GUEST_USER && password === GUEST_PASS && GUEST_USER !== '') {
return res.json({ ok: true, role: 'Invite', display: GUEST_USER });
}
return res.status(401).json({ ok: false, error: 'Identifiants incorrects' });
});
app.get('/api/data', auth, (req, res) => res.json(readData()));
app.put('/api/data', auth, (req, res) => {
try {
const data = readData(); const body = req.body;
if (body.cfg !== undefined) data.cfg = body.cfg;
if (body.crm !== undefined) data.crm = body.crm;
if (body.logo !== undefined) data.logo = body.logo;
writeData(data); res.json({ ok: true, lastUpdated: data.lastUpdated });
} catch(e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/crm', auth, (req, res) => res.json(readData().crm));
app.put('/api/crm', auth, (req, res) => {
try { const d = readData(); d.crm = req.body; writeData(d); res.json({ ok: true }); }
catch(e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/cfg', auth, (req, res) => res.json(readData().cfg));
app.put('/api/cfg', auth, (req, res) => {
try { const d = readData(); d.cfg = req.body; writeData(d); res.json({ ok: true }); }
catch(e) { res.status(500).json({ error: e.message }); }
});
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// ═══════════════════════════════════════════════════════════
// TRADUCTION INTELLIGENTE DE TEXTE
// ═══════════════════════════════════════════════════════════
app.post('/api/translate-text', async (req, res) => {
  try {
    const { text, targetLang = 'fr' } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ error: 'Texte vide.' });

    // Tentative de traduction via LibreTranslate (instance publique)
    const ltEndpoints = [
      'https://libretranslate.com/translate',
      'https://translate.argosopentech.com/translate',
      'https://libretranslate.de/translate'
    ];

    let translatedText = null;
    for (const endpoint of ltEndpoints) {
      try {
        const ltRes = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ q: text, source: 'auto', target: targetLang, format: 'text' }),
          signal: AbortSignal.timeout(10000)
        });
        if (ltRes.ok) {
          const ltData = await ltRes.json();
          if (ltData.translatedText) { translatedText = ltData.translatedText; break; }
        }
      } catch(e) { continue; }
    }

    if (!translatedText) {
      // Fallback: renvoyer le texte original avec un avertissement
      return res.status(200).json({
        translatedText: text,
        warning: 'Service de traduction indisponible. Texte original retourné.'
      });
    }

    res.json({ translatedText });
  } catch(e) {
    console.error('/api/translate-text error:', e);
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => { console.log('VEB Dashboard on port ' + PORT); initData(); });
