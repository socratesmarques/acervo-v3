-- Release year shown in the catalog can differ from the date it was published in ACERVO.
ALTER TABLE videos ADD COLUMN release_year integer CHECK (release_year BETWEEN 1888 AND 2100);
-- Series cover is used for episodes without a manually uploaded thumbnail when enabled.
ALTER TABLE videos ADD COLUMN episode_cover_default boolean NOT NULL DEFAULT false;
