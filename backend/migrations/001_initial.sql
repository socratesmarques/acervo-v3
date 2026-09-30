CREATE TABLE users (
 id uuid PRIMARY KEY, name varchar(100) NOT NULL, email varchar(254) NOT NULL UNIQUE,
 password_hash text NOT NULL, role text NOT NULL CHECK(role IN ('admin','viewer')) DEFAULT 'viewer',
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE sessions (
 token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
 csrf_token text NOT NULL, expires_at timestamptz NOT NULL
);
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE TABLE categories (
 id uuid PRIMARY KEY, name varchar(80) NOT NULL
);
CREATE UNIQUE INDEX categories_name_unique ON categories(lower(name));
CREATE TABLE videos (
 id uuid PRIMARY KEY, title varchar(160) NOT NULL, description text NOT NULL DEFAULT '',
 category_id uuid NOT NULL REFERENCES categories ON DELETE RESTRICT,
 owner_id uuid REFERENCES users ON DELETE SET NULL,
 duration double precision NOT NULL DEFAULT 0 CHECK(duration >= 0),
 published boolean NOT NULL DEFAULT false,
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','processing','ready','failed')),
 processing_error text, storage_driver text NOT NULL CHECK(storage_driver IN ('local','s3')),
 custom_thumbnail boolean NOT NULL DEFAULT false, qualities jsonb NOT NULL DEFAULT '[]',
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 published_at timestamptz, views bigint NOT NULL DEFAULT 0,
 processing_started_at timestamptz
);
CREATE INDEX videos_catalog ON videos(published, status, created_at DESC);
CREATE INDEX videos_category ON videos(category_id);
CREATE INDEX videos_search ON videos USING gin(to_tsvector('portuguese', title || ' ' || description));
CREATE TABLE watch_history (
 user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
 video_id uuid NOT NULL REFERENCES videos ON DELETE CASCADE,
 position double precision NOT NULL DEFAULT 0 CHECK(position >= 0),
 completed boolean NOT NULL DEFAULT false, updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id, video_id)
);
CREATE INDEX history_recent ON watch_history(user_id,updated_at DESC);
CREATE TABLE favorites (
 user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
 video_id uuid NOT NULL REFERENCES videos ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,video_id)
);
CREATE TABLE video_views (
 user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
 video_id uuid NOT NULL REFERENCES videos ON DELETE CASCADE,
 view_day date NOT NULL DEFAULT CURRENT_DATE, PRIMARY KEY(user_id,video_id,view_day)
);
CREATE TABLE media_gc (
 id uuid PRIMARY KEY, storage_driver text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
