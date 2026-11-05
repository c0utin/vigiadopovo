-- Global cache in front of R2 (worker/db.ts). A BLOB column keeps each value
-- as written: metrics stay TEXT, photos stay BLOB. `expires` is Unix seconds.
CREATE TABLE cache (
  key TEXT PRIMARY KEY,
  value BLOB NOT NULL,
  etag TEXT NOT NULL,
  expires INTEGER NOT NULL
);
