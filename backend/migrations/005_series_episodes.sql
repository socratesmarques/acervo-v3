-- Existing movies and series keep their media and identifiers.
ALTER TABLE videos DROP CONSTRAINT videos_source_type_check;
ALTER TABLE videos ADD CONSTRAINT videos_source_type_check CHECK (source_type IN ('upload','external','collection'));
ALTER TABLE videos DROP CONSTRAINT videos_content_type_check;
ALTER TABLE videos ADD CONSTRAINT videos_content_type_check CHECK (content_type IN ('movie','series','episode'));
ALTER TABLE videos DROP CONSTRAINT videos_provider_reference;
ALTER TABLE videos ADD CONSTRAINT videos_provider_reference CHECK (
 (source_type='upload' AND provider_id IS NULL AND external_path IS NULL) OR
 (source_type='external' AND provider_id IS NOT NULL AND external_path IS NOT NULL
  AND external_path LIKE '/%' AND external_path NOT LIKE '//%' AND status='ready') OR
 (source_type='collection' AND content_type='series' AND status='ready' AND provider_id IS NULL AND external_path IS NULL)
);
CREATE TABLE seasons (
 id uuid PRIMARY KEY,
 series_id uuid NOT NULL REFERENCES videos(id) ON DELETE RESTRICT,
 number integer NOT NULL CHECK(number BETWEEN 1 AND 1000),
 title varchar(160) NOT NULL DEFAULT '',
 CONSTRAINT seasons_series_number_key UNIQUE(series_id,number)
);
ALTER TABLE videos ADD COLUMN season_id uuid REFERENCES seasons(id) ON DELETE RESTRICT;
ALTER TABLE videos ADD COLUMN episode_number integer;
ALTER TABLE videos ADD CONSTRAINT videos_episode_shape CHECK (
 (content_type='episode' AND season_id IS NOT NULL AND episode_number IS NOT NULL AND episode_number BETWEEN 1 AND 10000 AND source_type<>'collection') OR
 (content_type<>'episode' AND season_id IS NULL AND episode_number IS NULL)
);
CREATE UNIQUE INDEX videos_season_episode_key ON videos(season_id,episode_number) WHERE season_id IS NOT NULL;

-- Serialize changes to a series with season creation, including direct SQL writes.
CREATE FUNCTION check_season_series() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM 1 FROM videos WHERE id=NEW.series_id AND content_type='series' FOR UPDATE;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'A temporada precisa pertencer a uma série.' USING ERRCODE='23514', CONSTRAINT='seasons_parent_series';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER seasons_parent_series BEFORE INSERT OR UPDATE OF series_id ON seasons
 FOR EACH ROW EXECUTE FUNCTION check_season_series();
CREATE FUNCTION protect_series_type() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.content_type<>'series' AND EXISTS(SELECT 1 FROM seasons WHERE series_id=NEW.id) THEN
  RAISE EXCEPTION 'A série ainda possui temporadas.' USING ERRCODE='23514', CONSTRAINT='series_has_seasons';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER series_has_seasons BEFORE UPDATE OF content_type ON videos
 FOR EACH ROW EXECUTE FUNCTION protect_series_type();
