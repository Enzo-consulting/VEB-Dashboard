-- ============================================================
-- VEB Dashboard — Schéma Supabase PostgreSQL
-- À exécuter dans l'éditeur SQL de votre projet Supabase
-- ============================================================

-- ─── Extension UUID ──────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Table : annonces ────────────────────────────────────────
-- Stocke toutes les annonces de remorques / matériel
CREATE TABLE IF NOT EXISTS annonces (
    id            TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    titre         TEXT        NOT NULL DEFAULT '',
    prix          TEXT        NOT NULL DEFAULT '',
    cat           TEXT        NOT NULL DEFAULT '',
    marque        TEXT        NOT NULL DEFAULT '',
    annee         TEXT        NOT NULL DEFAULT '',
    heures        TEXT        NOT NULL DEFAULT '',
    etat          TEXT        NOT NULL DEFAULT '',
    ville         TEXT        NOT NULL DEFAULT '',
    desc          TEXT        NOT NULL DEFAULT '',
    images        JSONB       NOT NULL DEFAULT '[]',
    lbc_done      BOOLEAN     NOT NULL DEFAULT FALSE,
    lbc_hist      JSONB       NOT NULL DEFAULT '[]',
    wp_id         TEXT,
    wp_url        TEXT,
    wp_published  BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

-- ─── Table : clients ─────────────────────────────────────────
-- CRM : base clients
CREATE TABLE IF NOT EXISTS clients (
    id            TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    nom           TEXT        NOT NULL DEFAULT '',
    prenom        TEXT        NOT NULL DEFAULT '',
    email         TEXT        NOT NULL DEFAULT '',
    tel           TEXT        NOT NULL DEFAULT '',
    adresse       TEXT        NOT NULL DEFAULT '',
    societe       TEXT        NOT NULL DEFAULT '',
    notes         TEXT        NOT NULL DEFAULT '',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

-- ─── Table : devis ───────────────────────────────────────────
-- Devis / propositions commerciales
CREATE TABLE IF NOT EXISTS devis (
    id            TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    ref           TEXT        NOT NULL DEFAULT '',
    client_id     TEXT        REFERENCES clients(id) ON DELETE SET NULL,
    client_nom    TEXT        NOT NULL DEFAULT '',
    date          TEXT        NOT NULL DEFAULT '',
    statut        TEXT        NOT NULL DEFAULT 'brouillon',
    lignes        JSONB       NOT NULL DEFAULT '[]',
    total_ht      NUMERIC(12,2) NOT NULL DEFAULT 0,
    tva           NUMERIC(5,2)  NOT NULL DEFAULT 20,
    total_ttc     NUMERIC(12,2) NOT NULL DEFAULT 0,
    notes         TEXT        NOT NULL DEFAULT '',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

-- ─── Table : commandes ───────────────────────────────────────
-- Commandes / bons de commande
CREATE TABLE IF NOT EXISTS commandes (
    id            TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    ref           TEXT        NOT NULL DEFAULT '',
    client_id     TEXT        REFERENCES clients(id) ON DELETE SET NULL,
    client_nom    TEXT        NOT NULL DEFAULT '',
    date          TEXT        NOT NULL DEFAULT '',
    statut        TEXT        NOT NULL DEFAULT 'en_attente',
    lignes        JSONB       NOT NULL DEFAULT '[]',
    total_ht      NUMERIC(12,2) NOT NULL DEFAULT 0,
    tva           NUMERIC(5,2)  NOT NULL DEFAULT 20,
    total_ttc     NUMERIC(12,2) NOT NULL DEFAULT 0,
    notes         TEXT        NOT NULL DEFAULT '',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

-- ─── Table : config ──────────────────────────────────────────
-- Configuration globale (clé/valeur JSON) + logo
-- id = 'main' pour la config, id = 'logo' pour le logo base64
CREATE TABLE IF NOT EXISTS config (
    id            TEXT        PRIMARY KEY,
    value         JSONB,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

-- ─── Triggers : updated_at automatique ───────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_annonces_updated_at
  BEFORE UPDATE ON annonces
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER trg_clients_updated_at
  BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER trg_devis_updated_at
  BEFORE UPDATE ON devis
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER trg_commandes_updated_at
  BEFORE UPDATE ON commandes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── Index pour les performances ─────────────────────────────
CREATE INDEX IF NOT EXISTS idx_annonces_created_at ON annonces(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_annonces_cat ON annonces(cat);
CREATE INDEX IF NOT EXISTS idx_clients_nom ON clients(nom);
CREATE INDEX IF NOT EXISTS idx_devis_client_id ON devis(client_id);
CREATE INDEX IF NOT EXISTS idx_commandes_client_id ON commandes(client_id);

-- ─── Row Level Security (RLS) ────────────────────────────────
-- Le serveur utilise la clé secrète (bypass RLS).
-- Ces politiques sont en place pour la sécurité future
-- si vous ajoutez une auth Supabase directe côté frontend.

ALTER TABLE annonces   ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients    ENABLE ROW LEVEL SECURITY;
ALTER TABLE devis      ENABLE ROW LEVEL SECURITY;
ALTER TABLE commandes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE config     ENABLE ROW LEVEL SECURITY;

-- Politique : seul le service_role (clé secrète) peut tout faire
-- (le serveur Node.js utilise supabaseAdmin avec la clé secrète)
-- Aucune politique publique n'est nécessaire car tout passe par le backend.

-- ─── Données initiales ───────────────────────────────────────
INSERT INTO config (id, value, updated_at)
VALUES ('main', '{
    "wpUrl": "",
    "wpUser": "",
    "wpPass": "",
    "clipdrop": "",
    "openai": "",
    "ville": "",
    "cat": "",
    "footer": "",
    "entreprise": "VEB",
    "adresseEntreprise": "",
    "siret": "",
    "tva": 20
  }'::jsonb, NOW())
ON CONFLICT (id) DO NOTHING;
