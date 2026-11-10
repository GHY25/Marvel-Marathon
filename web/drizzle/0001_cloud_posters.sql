CREATE TABLE poster_records (
  movie_id TEXT NOT NULL,
  source TEXT NOT NULL CHECK(source IN ('tmdb', 'custom')),
  version TEXT NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0 CHECK(deleted IN (0, 1)),
  PRIMARY KEY (movie_id, source)
);
