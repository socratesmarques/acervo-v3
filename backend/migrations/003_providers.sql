CREATE TABLE providers (
 id text PRIMARY KEY,
 name text NOT NULL,
 kind text NOT NULL CHECK(kind IN ('youtube','vimeo','redecanais')),
 base_url text NOT NULL UNIQUE CHECK(base_url ~ '^https://[^/]+$'),
 version integer NOT NULL DEFAULT 1,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE provider_origins (
 origin text PRIMARY KEY,
 provider_id text NOT NULL REFERENCES providers(id) ON DELETE CASCADE
);
CREATE TABLE provider_changes (
 id bigserial PRIMARY KEY,
 provider_id text NOT NULL REFERENCES providers(id),
 old_url text NOT NULL, new_url text NOT NULL,
 changed_by uuid REFERENCES users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO providers(id,name,kind,base_url) VALUES
 ('youtube','YouTube','youtube','https://www.youtube.com'),
 ('youtube-private','YouTube (privacidade)','youtube','https://www.youtube-nocookie.com'),
 ('vimeo','Vimeo','vimeo','https://player.vimeo.com'),
 ('redecanais','RedeCanais','redecanais','https://redecanais.press');
INSERT INTO provider_origins(origin,provider_id) SELECT base_url,id FROM providers;
INSERT INTO provider_origins(origin,provider_id) VALUES ('https://redecanais.af','redecanais');
ALTER TABLE videos ADD COLUMN provider_id text REFERENCES providers(id) ON DELETE RESTRICT;
ALTER TABLE videos ADD COLUMN external_path text;
UPDATE videos v SET provider_id=o.provider_id,
 external_path=substring(v.external_url from length(o.origin)+1)
 FROM provider_origins o
 WHERE v.source_type='external' AND split_part(v.external_url,'/',1)||'//'||split_part(v.external_url,'/',3)=o.origin;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM videos WHERE source_type='external' AND provider_id IS NULL) THEN
  RAISE EXCEPTION 'Existem vídeos externos com domínios não reconhecidos. Nenhum dado foi removido; revise os domínios antes da migration 003.';
 END IF;
END $$;
ALTER TABLE videos DROP CONSTRAINT videos_source_reference;
ALTER TABLE videos RENAME COLUMN external_url TO legacy_external_url;
ALTER TABLE videos ADD CONSTRAINT videos_provider_reference CHECK (
 (source_type='upload' AND provider_id IS NULL AND external_path IS NULL) OR
 (source_type='external' AND provider_id IS NOT NULL AND external_path IS NOT NULL
  AND external_path LIKE '/%' AND external_path NOT LIKE '//%' AND status='ready')
);
CREATE INDEX videos_provider ON videos(provider_id);
