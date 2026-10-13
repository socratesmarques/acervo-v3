-- Configuração visual única, aplicada a todos os usuários, sem apagar metadados.
CREATE TABLE app_settings (
  id integer PRIMARY KEY CHECK (id = 1),
  show_release_year boolean NOT NULL DEFAULT true
);
INSERT INTO app_settings(id,show_release_year) VALUES (1,true);

-- O endereço original identifica séries importadas automaticamente.
CREATE TABLE series_import_sources (
  source_url varchar(2048) PRIMARY KEY,
  series_id uuid NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX series_import_sources_series ON series_import_sources(series_id);
