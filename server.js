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

    // Extraction des informations clés depuis le texte brut
    const lines = text.split(/[\n\r]+/).map(l => l.trim()).filter(Boolean);
    
    // Détection du prix (formats : 12 000 EUR, 12000€, 12.000,00, $12000, etc.)
    const priceMatch = text.match(/(?:prix|price|preis|cena|koszt)?[:\s]*([0-9][\d\s.,]*(?:[.,]\d{2})?)[\s]*(?:€|EUR|eur|euro|euros|\$|USD|PLN|z[łl]|CHF)?/i);
    const prix = priceMatch ? parseInt(priceMatch[1].replace(/[^0-9]/g, '')) || null : null;

    // Détection marque/modèle (mots en majuscules, souvent en tête)
    const marqueMatch = text.match(/^([A-Z][A-Za-z\u00C0-\u017E]+)(?:\s+([A-Z0-9][A-Za-z0-9\-]+))?/m);
    const marque = marqueMatch ? marqueMatch[1] : '';

    // Année de fabrication
    const anneeMatch = text.match(/(?:ann[ée]{2}e?|year|baujahr|rok|rocznik|jahrgang|year|mfg)[.:\s]*([12]\d{3})/i)
      || text.match(/\b(20[0-2]\d|19[89]\d)\b/);
    const annee = anneeMatch ? anneeMatch[1] : '';

    // Heures / kilomètres
    const heuresMatch = text.match(/([0-9][\d\s.,]*)[\s]*(?:h(?:eures?|rs?)?|mth|moto(?:hod?)?|bh|Bh|bth)/i)
      || text.match(/([0-9][\d\s.,]*)[\s]*(?:km|kilomet)/i);
    const heures = heuresMatch ? parseInt(heuresMatch[1].replace(/[^0-9]/g, '')) || null : null;

    // Ville / localisation
    const villeMatch = text.match(/(?:localisation|lieu|ort|location|miasto|miejscowość|city|town|from)[.:\s]+([A-ZÀ-ž][a-zÀ-ž]+(?:[\s-][A-ZÀ-ž][a-zÀ-ž]+)?)/i);
    const ville = villeMatch ? villeMatch[1] : '';

    // Traduction du texte via LibreTranslate (si disponible)
    let descriptionFr = text;
    try {
      const ltResp = await fetch('https://libretranslate.com/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: text.substring(0, 3000), source: 'auto', target: targetLang, format: 'text' }),
        signal: AbortSignal.timeout(8000)
      });
      if (ltResp.ok) {
        const ltData = await ltResp.json();
        if (ltData.translatedText) descriptionFr = ltData.translatedText;
      }
    } catch(ltErr) {
      // Si LibreTranslate est indisponible, on garde le texte original
      console.log('LibreTranslate unavailable, keeping original text.');
    }

    // Construction du titre à partir des premières lignes significatives
    const titreCandidat = lines.find(l => l.length > 5 && l.length < 120) || lines[0] || '';
    const titre = titreCandidat.length > 100 ? titreCandidat.substring(0, 100) + '...' : titreCandidat;

    res.json({
      titre: descriptionFr !== text ? descriptionFr.split('\n')[0].substring(0, 100) : titre,
      description: descriptionFr,
      prix,
      marque,
      annee,
      heures,
      ville,
      images: []
    });
  } catch(e) {
    console.error('/api/translate-text error:', e);
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => { console.log('VEB Dashboard on port ' + PORT); initData(); });
