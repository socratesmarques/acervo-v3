-- A proporção vertical só é aplicada a capas novas identificadas como retrato.
ALTER TABLE videos ADD COLUMN poster_vertical boolean NOT NULL DEFAULT false;
