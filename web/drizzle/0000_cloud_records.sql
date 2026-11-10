CREATE TABLE records (
  id TEXT PRIMARY KEY NOT NULL,
  version TEXT NOT NULL,
  payload TEXT
);
--> statement-breakpoint
CREATE TABLE record_history (
  id TEXT NOT NULL,
  version TEXT NOT NULL,
  payload TEXT,
  PRIMARY KEY (id, version)
);
