import { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { CATALOG_VERSION, CATALOG } from '../../src/shared/catalog'
import type { BackupData, Movie, WatchEntry } from '../../src/shared/types'
import { DomainError, validateBackup, validateCreateEntry, validateEntryId, validateUpdateEntry } from '../../src/shared/validation'
import { nextSyncVersion, validateSyncRecords, type SyncRecord } from '../../src/shared/cloud'
import { INITIAL_POSTER_VERSION, validatePosterRecords, validatePosterBytes, type PosterRecord } from '../../src/shared/poster-sync'

const entryColumns = `id, movie_id AS movieId, watch_date AS watchDate, rating_ticks AS ratingTicks,
  review, created_at_utc AS createdAtUtc, updated_at_utc AS updatedAtUtc`

/** The only owner of the local SQLite connection. Never imported by the renderer. */
export class MarathonRepository {
	private readonly db: DatabaseSync
	posterRevision = 0

	constructor(filename: string) {
		if (filename !== ':memory:') fs.mkdirSync(path.dirname(filename), { recursive: true })
		this.db = new DatabaseSync(filename)
		try {
			const version = Number(this.db.prepare('PRAGMA user_version').get()?.user_version)
			if (version > 5) throw new DomainError('STORAGE_ERROR', '더 새로운 앱에서 만든 데이터입니다. 앱을 업데이트해 주세요.')
			this.db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;')
			this.transaction(() => {
				if (version === 0) {
					this.db.exec(`
            CREATE TABLE movies (
              id TEXT PRIMARY KEY, title_en TEXT NOT NULL, title_ko TEXT,
              release_year INTEGER NOT NULL CHECK(release_year BETWEEN 1900 AND 2100),
              phase INTEGER NOT NULL CHECK(phase BETWEEN 1 AND 6),
              saga TEXT NOT NULL CHECK(saga IN ('Infinity Saga', 'Multiverse Saga')),
              release_order INTEGER NOT NULL UNIQUE CHECK(release_order > 0)
            );
            CREATE TABLE watch_entries (
              id TEXT PRIMARY KEY, movie_id TEXT NOT NULL REFERENCES movies(id) ON DELETE RESTRICT,
              watch_date TEXT NOT NULL,
              rating_ticks INTEGER CHECK(rating_ticks IS NULL OR (typeof(rating_ticks) = 'integer' AND rating_ticks BETWEEN 1 AND 10)),
              review TEXT NOT NULL DEFAULT '' CHECK(length(review) <= 500),
              created_at_utc TEXT NOT NULL, updated_at_utc TEXT NOT NULL
            );
            CREATE INDEX idx_entries_movie_date ON watch_entries(movie_id, watch_date DESC, created_at_utc DESC);
            CREATE INDEX idx_entries_date ON watch_entries(watch_date DESC, created_at_utc DESC);
            PRAGMA user_version = 1;
          `)
				}
				if (version < 2)
					this.db.exec(`
          CREATE TABLE poster_assets (
            movie_id TEXT NOT NULL REFERENCES movies(id),
            source TEXT NOT NULL CHECK(source IN ('tmdb', 'custom')),
            jpeg BLOB NOT NULL CHECK(length(jpeg) BETWEEN 1 AND 524288),
            PRIMARY KEY (movie_id, source)
          );
          CREATE TABLE private_settings (name TEXT PRIMARY KEY, encrypted_value BLOB NOT NULL);
          PRAGMA user_version = 2;
        `)
				if (version < 3)
					this.db.exec(`
          ALTER TABLE movies ADD COLUMN media_type TEXT NOT NULL DEFAULT 'movie' CHECK(media_type IN ('movie','series','special'));
          ALTER TABLE movies ADD COLUMN series_title TEXT;
          ALTER TABLE movies ADD COLUMN series_start_year INTEGER;
          ALTER TABLE movies ADD COLUMN season_number INTEGER CHECK(season_number IS NULL OR season_number > 0);
          ALTER TABLE movies ADD COLUMN release_status TEXT NOT NULL DEFAULT 'released' CHECK(release_status IN ('released','airing'));
          PRAGMA user_version = 3;
        `)
				const seed = this.db.prepare(`INSERT INTO movies (id,title_en,title_ko,release_year,phase,saga,release_order,media_type,series_title,series_start_year,season_number,release_status)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title_en=excluded.title_en,
          title_ko=excluded.title_ko,release_year=excluded.release_year,phase=excluded.phase,
          saga=excluded.saga,release_order=excluded.release_order,media_type=excluded.media_type,
          series_title=excluded.series_title,series_start_year=excluded.series_start_year,
          season_number=excluded.season_number,release_status=excluded.release_status`)
				for (const movie of CATALOG) seed.run(movie.id, movie.titleEn, movie.titleKo, movie.releaseYear, movie.phase, movie.saga, movie.releaseOrder, movie.mediaType, movie.seriesTitle, movie.seriesStartYear, movie.seasonNumber, movie.releaseStatus)
				if (version < 4) {
					this.db.exec('CREATE TABLE sync_records (id TEXT PRIMARY KEY, version TEXT NOT NULL, payload TEXT, dirty INTEGER NOT NULL DEFAULT 1); PRAGMA user_version = 4;')
					for (const entry of this.listEntries()) this.db.prepare('INSERT INTO sync_records VALUES (?,?,?,1)').run(entry.id, `${String(Date.parse(entry.updatedAtUtc)).padStart(13, '0')}:${entry.id}`, JSON.stringify(entry))
				}
				if (version < 5) {
					this.db.exec('CREATE TABLE poster_sync (movie_id TEXT NOT NULL, source TEXT NOT NULL, version TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0, dirty INTEGER NOT NULL DEFAULT 1, PRIMARY KEY(movie_id,source)); PRAGMA user_version = 5;')
					this.db.prepare('INSERT INTO poster_sync SELECT movie_id,source,?,0,1 FROM poster_assets').run(INITIAL_POSTER_VERSION)
				}
			})
			if (this.db.prepare('PRAGMA quick_check').get()?.quick_check !== 'ok' || this.db.prepare('PRAGMA foreign_key_check').all().length) {
				throw new DomainError('STORAGE_ERROR', '데이터 무결성 검사에 실패했습니다. 기존 데이터는 초기화하지 않습니다.')
			}
		} catch (error) {
			this.db.close()
			throw error
		}
	}

	private transaction<T>(operation: () => T): T {
		this.db.exec('BEGIN IMMEDIATE')
		try {
			const result = operation()
			this.db.exec('COMMIT')
			return result
		} catch (error) {
			this.db.exec('ROLLBACK')
			throw error
		}
	}

	listMovies(): Movie[] {
		return this.db
			.prepare(
				`SELECT id, title_en AS titleEn, title_ko AS titleKo, release_year AS releaseYear,
      phase, saga, release_order AS releaseOrder, media_type AS mediaType,
      series_title AS seriesTitle, series_start_year AS seriesStartYear,
      season_number AS seasonNumber, release_status AS releaseStatus FROM movies ORDER BY release_order ASC`
			)
			.all() as unknown as Movie[]
	}

	listEntries(): WatchEntry[] {
		return this.db.prepare(`SELECT ${entryColumns} FROM watch_entries ORDER BY watch_date DESC, created_at_utc DESC, id DESC`).all() as unknown as WatchEntry[]
	}

	getPoster(movieId: string): Movie['poster'] {
		const rows = this.db.prepare('SELECT source, jpeg FROM poster_assets WHERE movie_id = ? ORDER BY source ASC').all(movieId) as unknown as { source: 'custom' | 'tmdb'; jpeg: Uint8Array }[]
		if (!rows.length) return undefined
		return { source: rows[0].source, dataUrl: `data:image/jpeg;base64,${Buffer.from(rows[0].jpeg).toString('base64')}`, hasAutomatic: rows.some(row => row.source === 'tmdb') }
	}

	hasPoster(movieId: string, source: 'custom' | 'tmdb'): boolean {
		return !!this.db.prepare('SELECT 1 FROM poster_assets WHERE movie_id = ? AND source = ?').get(movieId, source)
	}

	savePoster(movieId: string, source: 'custom' | 'tmdb', jpeg: Buffer): void {
		this.transaction(() => {
			this.db.prepare('INSERT INTO poster_assets (movie_id, source, jpeg) VALUES (?, ?, ?) ON CONFLICT(movie_id, source) DO UPDATE SET jpeg = excluded.jpeg').run(movieId, source, jpeg)
			this.markPosterChanged(movieId, source, false)
		})
		this.posterRevision++
	}

	removeCustomPoster(movieId: string): void {
		this.transaction(() => {
			this.db.prepare("DELETE FROM poster_assets WHERE movie_id = ? AND source = 'custom'").run(movieId)
			this.markPosterChanged(movieId, 'custom', true)
		})
		this.posterRevision++
	}

	private markPosterChanged(movieId: string, source: string, deleted: boolean) {
		const latest = String(this.db.prepare('SELECT MAX(version) AS version FROM poster_sync').get()?.version ?? '')
		this.db.prepare('INSERT INTO poster_sync VALUES (?,?,?,?,1) ON CONFLICT(movie_id,source) DO UPDATE SET version=excluded.version,deleted=excluded.deleted,dirty=1').run(movieId, source, nextSyncVersion(latest), Number(deleted))
	}
	getPosterRecords(pendingOnly = false): PosterRecord[] {
		return this.db
			.prepare(`SELECT movie_id AS movieId,source,version,deleted FROM poster_sync${pendingOnly ? ' WHERE dirty=1' : ''}`)
			.all()
			.map(row => ({ movieId: String(row.movieId), source: row.source as PosterRecord['source'], version: String(row.version), deleted: !!row.deleted }))
	}
	readPosterRecord(record: PosterRecord): Uint8Array | undefined {
		return this.db.prepare('SELECT jpeg FROM poster_assets JOIN poster_sync USING(movie_id,source) WHERE movie_id=? AND source=? AND version=?').get(record.movieId, record.source, record.version)?.jpeg as Uint8Array | undefined
	}
	mergePosterRecord(raw: PosterRecord, bytes?: Uint8Array): void {
		const record = validatePosterRecords([raw])[0]
		if (bytes) validatePosterBytes(bytes)
		this.transaction(() => {
			const local = this.db.prepare('SELECT version FROM poster_sync WHERE movie_id=? AND source=?').get(record.movieId, record.source)
			if (local && String(local.version) > record.version) return
			if (!record.deleted && !bytes && (!local || local.version !== record.version || !this.readPosterRecord(record))) throw new Error('Missing poster bytes')
			if (record.deleted) this.db.prepare('DELETE FROM poster_assets WHERE movie_id=? AND source=?').run(record.movieId, record.source)
			else if (bytes) this.db.prepare('INSERT INTO poster_assets VALUES (?,?,?) ON CONFLICT(movie_id,source) DO UPDATE SET jpeg=excluded.jpeg').run(record.movieId, record.source, bytes)
			this.db.prepare('INSERT INTO poster_sync VALUES (?,?,?,?,0) ON CONFLICT(movie_id,source) DO UPDATE SET version=excluded.version,deleted=excluded.deleted,dirty=0').run(record.movieId, record.source, record.version, Number(record.deleted))
			if (!local || local.version !== record.version || bytes) this.posterRevision++
		})
	}

	getPosterCredential(): Buffer | undefined {
		const row = this.db.prepare("SELECT encrypted_value FROM private_settings WHERE name = 'tmdb'").get()
		return row ? Buffer.from(row.encrypted_value as Uint8Array) : undefined
	}

	setPosterCredential(encrypted: Buffer | null): void {
		if (encrypted) this.db.prepare("INSERT INTO private_settings VALUES ('tmdb', ?) ON CONFLICT(name) DO UPDATE SET encrypted_value = excluded.encrypted_value").run(encrypted)
		else this.db.prepare("DELETE FROM private_settings WHERE name = 'tmdb'").run()
	}

	private findEntry(rawId: unknown): WatchEntry {
		const id = validateEntryId(rawId)
		const entry = this.db.prepare(`SELECT ${entryColumns} FROM watch_entries WHERE id = ?`).get(id) as unknown as WatchEntry | undefined
		if (!entry) throw new DomainError('NOT_FOUND', '감상 기록을 찾을 수 없습니다. 목록을 새로고침해 주세요.')
		return entry
	}

	createEntry(raw: unknown): WatchEntry {
		const input = validateCreateEntry(raw)
		if (!this.db.prepare('SELECT id FROM movies WHERE id = ?').get(input.movieId)) {
			throw new DomainError('NOT_FOUND', '영화를 찾을 수 없습니다.')
		}
		const timestamp = new Date().toISOString()
		const entry = { ...input, id: randomUUID(), createdAtUtc: timestamp, updatedAtUtc: timestamp }
		this.transaction(() => {
			this.insertEntry(entry)
			this.markChanged(entry.id, entry)
		})
		return entry
	}

	updateEntry(rawId: unknown, raw: unknown): WatchEntry {
		const current = this.findEntry(rawId)
		const input = validateUpdateEntry(raw)
		const updated = { ...current, ...input, updatedAtUtc: [new Date().toISOString(), current.createdAtUtc].sort().at(-1)! }
		this.transaction(() => {
			this.db.prepare(`UPDATE watch_entries SET watch_date=?,rating_ticks=?,review=?,updated_at_utc=? WHERE id=?`).run(updated.watchDate, updated.ratingTicks, updated.review, updated.updatedAtUtc, updated.id)
			this.markChanged(updated.id, updated)
		})
		return updated
	}

	deleteEntry(rawId: unknown): { deletedId: string } {
		const entry = this.findEntry(rawId)
		this.transaction(() => {
			this.db.prepare('DELETE FROM watch_entries WHERE id = ?').run(entry.id)
			this.markChanged(entry.id, null)
		})
		return { deletedId: entry.id }
	}

	private insertEntry(entry: WatchEntry) {
		this.db
			.prepare(
				`INSERT INTO watch_entries (id,movie_id,watch_date,rating_ticks,review,created_at_utc,updated_at_utc)
      VALUES (?,?,?,?,?,?,?)`
			)
			.run(entry.id, entry.movieId, entry.watchDate, entry.ratingTicks, entry.review, entry.createdAtUtc, entry.updatedAtUtc)
	}

	createBackup(): BackupData {
		return {
			format: 'marvel-marathon-backup',
			formatVersion: 1,
			exportedAtUtc: new Date().toISOString(),
			catalogVersion: CATALOG_VERSION,
			watchEntries: this.listEntries(),
		}
	}

	restoreBackup(raw: unknown): number {
		// Validate the entire payload before deleting anything; a SQL failure rolls everything back.
		const backup = validateBackup(raw)
		this.transaction(() => {
			const restoredIds = new Set(backup.watchEntries.map(entry => entry.id))
			for (const entry of this.listEntries()) if (!restoredIds.has(entry.id)) this.markChanged(entry.id, null)
			this.db.exec('DELETE FROM watch_entries')
			for (const entry of backup.watchEntries) {
				this.insertEntry(entry)
				this.markChanged(entry.id, entry)
			}
		})
		return backup.watchEntries.length
	}

	private markChanged(id: string, entry: WatchEntry | null) {
		const latest = (this.db.prepare('SELECT MAX(version) AS version FROM sync_records').get()?.version as string | null) ?? ''
		this.db.prepare('INSERT INTO sync_records VALUES (?, ?, ?, 1) ON CONFLICT(id) DO UPDATE SET version=excluded.version,payload=excluded.payload,dirty=1').run(id, nextSyncVersion(latest), entry ? JSON.stringify(entry) : null)
	}

	getSyncRecords(pendingOnly = false): SyncRecord[] {
		return this.db
			.prepare(`SELECT id,version,payload FROM sync_records${pendingOnly ? ' WHERE dirty=1' : ''}`)
			.all()
			.map(row => ({ id: String(row.id), version: String(row.version), entry: row.payload === null ? null : (JSON.parse(String(row.payload)) as WatchEntry) }))
	}

	mergeSyncRecords(raw: unknown): void {
		const records = validateSyncRecords(raw)
		this.transaction(() => {
			for (const record of records) {
				const local = this.db.prepare('SELECT version FROM sync_records WHERE id=?').get(record.id)
				if (local && String(local.version) > record.version) continue
				this.db.prepare('DELETE FROM watch_entries WHERE id=?').run(record.id)
				if (record.entry) this.insertEntry(record.entry)
				this.db.prepare('INSERT INTO sync_records VALUES (?,?,?,0) ON CONFLICT(id) DO UPDATE SET version=excluded.version,payload=excluded.payload,dirty=0').run(record.id, record.version, record.entry ? JSON.stringify(record.entry) : null)
			}
		})
	}

	close() {
		this.db.close()
	}
}
