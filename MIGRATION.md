# Migration vers Supabase — VEB Dashboard

## Vue d'ensemble

Ce document décrit la migration du stockage local (fichier JSON `veb-data.json`)
vers une base de données Supabase PostgreSQL persistante et partagée.

---

## Fichiers modifiés

| Fichier | Changement |
|---------|------------|
| `server.js` | Remplace `fs`/JSON par `@supabase/supabase-js` + `withSupabase` |
| `package.json` | Ajout de `@supabase/supabase-js ^2.45.0` |
| `render.yaml` | Ajout des variables d'environnement Supabase |
| `schema.sql` | Nouveau — schéma PostgreSQL complet |
| `MIGRATION.md` | Nouveau — ce guide |

**`index.html` n'est PAS modifié** : le frontend utilise déjà les APIs REST
(`/api/crm`, `/api/cfg`, etc.) via `fetch`. Il suffit que le backend réponde
correctement, ce qui est maintenant le cas avec Supabase.

---

## Étape 1 — Créer le projet Supabase

1. Connectez-vous sur [supabase.com](https://supabase.com)
2. Cliquez **New project**
3. Choisissez un nom (ex: `veb-dashboard`) et un mot de passe de BDD fort
4. Choisissez la région la plus proche (ex: `eu-west-1` pour l'Europe)
5. Attendez que le projet soit prêt (~2 min)

---

## Étape 2 — Récupérer les clés API

Dans votre projet Supabase → **Settings → API** :

| Variable | Où la trouver |
|----------|---------------|
| `SUPABASE_URL` | Project URL (ex: `https://xxxxx.supabase.co`) |
| `SUPABASE_PUBLISHABLE_KEY` | `anon` / `public` key |
| `SUPABASE_SECRET_KEY` | `service_role` key (secrète — ne jamais exposer côté client) |
| `SUPABASE_JWKS_URL` | `https://xxxxx.supabase.co/auth/v1/jwks` |

---

## Étape 3 — Créer le schéma de base de données

1. Dans Supabase → **SQL Editor**
2. Ouvrez le fichier `schema.sql` de ce dépôt
3. Collez le contenu et cliquez **Run**

Ce script crée :
- `annonces` — toutes les annonces (remorques, matériel)
- `clients` — base clients CRM
- `devis` — devis / propositions commerciales
- `commandes` — bons de commande
- `config` — configuration globale + logo (stockés en JSONB)
- Triggers `updated_at` automatiques
- Index pour les performances
- RLS activé (accès uniquement via la clé secrète du backend)

---

## Étape 4 — Configurer les variables d'environnement

### Sur Render.com

Dans votre service Render → **Environment** → ajoutez :

```
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_PUBLISHABLE_KEY=eyJhbGc...
SUPABASE_SECRET_KEY=eyJhbGc...
SUPABASE_JWKS_URL=https://xxxxx.supabase.co/auth/v1/jwks
VEB_TOKEN=votre-token-secret
ADMIN_USER=votre-login-admin
ADMIN_PASS=votre-mot-de-passe-admin
GUEST_USER=votre-login-invite
GUEST_PASS=votre-mot-de-passe-invite
```

### En local (.env)

Créez un fichier `.env` (jamais committer !) :

```
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_PUBLISHABLE_KEY=eyJhbGc...
SUPABASE_SECRET_KEY=eyJhbGc...
SUPABASE_JWKS_URL=https://xxxxx.supabase.co/auth/v1/jwks
VEB_TOKEN=veb-secret-local
ADMIN_USER=admin
ADMIN_PASS=motdepasse
```

---

## Étape 5 — Déployer

```bash
npm install        # installe @supabase/supabase-js
node server.js     # démarre le serveur
```

---

## Architecture après migration

```
Browser (index.html)
  │
    ├─ fetch('/api/login')      → Auth par variables d'env
      ├─ fetch('/api/crm')        → supabaseAdmin → tables annonces/clients/devis/commandes
        ├─ fetch('/api/cfg')        → supabaseAdmin → table config (id='main')
          ├─ fetch('/api/logo')       → supabaseAdmin → table config (id='logo')
            └─ fetch('/api/translate-text') → OpenAI / Google Translate
            ```

            **Stockage** : 100% Supabase PostgreSQL (persistant, partagé entre tous les appareils)

            **Plus aucun stockage temporaire** :
            - ❌ `veb-data.json` — supprimé
            - ❌ Variables en mémoire comme source principale — remplacées par Supabase
            - ✅ `localStorage` dans le frontend — conservé uniquement comme **cache local** pour
              la réactivité de l'interface (lecture rapide), mais toujours synchronisé avec Supabase
                à chaque modification

                ---

                ## Vérification

                Après démarrage, vérifiez que :

                1. `GET /api/ping` répond `{"ok":true}`
                2. `POST /api/login` avec vos identifiants retourne `{"ok":true,"role":"Administrateur"}`
                3. `GET /api/crm` (avec header `x-veb-token`) retourne les données Supabase
                4. Créez une annonce → rafraîchissez dans un autre navigateur → elle apparaît

                ---

                ## Sécurité

                - `SUPABASE_SECRET_KEY` (service_role) n'est jamais envoyée au client
                - Toutes les requêtes Supabase passent par le backend Node.js
                - Le frontend utilise uniquement les APIs REST du backend avec le header `x-veb-token`
                - RLS activé : même si quelqu'un accède directement à Supabase avec la clé publique,
                  il ne peut pas lire/écrire les données (aucune politique publique définie)
