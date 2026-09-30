ALTER TABLE videos ADD COLUMN content_type text NOT NULL DEFAULT 'movie'
  CHECK (content_type IN ('movie', 'series'));
CREATE INDEX videos_content_type_idx ON videos(content_type);
