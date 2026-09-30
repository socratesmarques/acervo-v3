ALTER TABLE videos ADD COLUMN source_type text NOT NULL DEFAULT 'upload'
 CHECK (source_type IN ('upload','external'));
ALTER TABLE videos ADD COLUMN external_url text;
ALTER TABLE videos ADD CONSTRAINT videos_source_reference CHECK (
 (source_type='upload' AND external_url IS NULL) OR
 (source_type='external' AND external_url IS NOT NULL AND external_url LIKE 'https://%' AND status='ready')
);
