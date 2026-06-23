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
return res.json({ ok: true, role: 'Administrateur', display: 'Enzo' });
}
if (username === GUEST_USER && password === GUEST_PASS && GUEST_USER !== '') {
return res.json({ ok: true, role: 'Collaborateur', display: GUEST_USER });
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

// TRADUCTION INTELLIGENTE DE TEXTE
app.post('/api/translate-text', async (req, res) => {
try {
const { text, targetLang = 'fr' } = req.body;
if (!text || !text.trim()) return res.status(400).json({ error: 'Texte vide.' });

const storedCfg = readData().cfg || {};
const OPENAI_KEY = process.env.OPENAI_API_KEY || storedCfg.openai || '';
let translatedText = null;

// Tentative 1 : OpenAI GPT avec prompt spécialisé remorques / véhicules utilitaires
if (OPENAI_KEY) {
try {
const systemPrompt = `Tu es un expert traducteur spécialisé dans le secteur des remorques, semi-remorques et véhicules utilitaires. Tu traduis des annonces professionnelles vers le français en utilisant le jargon technique du secteur : PTAC (Poids Total Autorisé en Charge), PTRA, essieu(x), timon, flèche d'attelage, ridelles, hayons, béquilles de stabilisation, châssis, longerons, traverse, bâche, galerie, carrosserie, caisse, plancher, plateau, porte-engins, bétaillère, citerne, frigo, semi, tridem, tandem, rampes d'accès, treuil, sangles d'arrimage, sellette, tourelle, roue de secours, suspension pneumatique, ABS, ralentisseur, boîte de vitesses, couple moteur, heures moteur. Tu produis une traduction naturelle, fluide, adaptée à une publication en français sur un site d'annonces de matériel professionnel. Ne traduis pas mot à mot : réécris de façon professionnelle et commerciale.`;
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

// Tentative 2 : Google Translate (fallback si pas de clé OpenAI ou erreur)
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
warning: 'Service de traduction indisponible. Texte original retourne.'
});
}

res.json({ translatedText });
} catch(e) {
console.error('/api/translate-text error:', e);
res.status(500).json({ error: e.message });
}
});

app.listen(PORT, () => { console.log('VEB Dashboard on port ' + PORT); initData(); });
