import { afterEach, describe, expect, it, vi } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { CATALOG, MOVIES, TV_TITLES } from '../src/shared/catalog'
import { buildStatistics, filterMovies } from '../src/shared/statistics'
import { MarathonRepository } from '../electron/db/repository'
import { fetchTmdbPoster, matchMovie } from '../electron/services/tmdb-client'
import { CONSTELLATIONS, layoutConstellation, WORLD_HEIGHT } from '../src/renderer/components/universe/constellations'

afterEach(() => vi.unstubAllGlobals())
const loki1 = TV_TITLES.find(title => title.id === 'mcu-tv-loki-s01')!
const loki2 = TV_TITLES.find(title => title.id === 'mcu-tv-loki-s02')!

describe('Disney+ catalog and seasons', () => {
	it('preserves 38 film IDs and adds 23 seasons and 3 specials without duplicates', () => {
		expect(CATALOG).toHaveLength(64)
		expect(new Set(CATALOG.map(title => title.id)).size).toBe(64)
		expect(new Set(CATALOG.map(title => title.releaseOrder)).size).toBe(64)
		expect(CATALOG.slice(0, 38)).toEqual(MOVIES)
		expect(TV_TITLES.filter(title => title.mediaType === 'series')).toHaveLength(23)
		expect(TV_TITLES.filter(title => title.mediaType === 'special')).toHaveLength(3)
		expect(CATALOG.filter(title => title.releaseStatus === 'airing').map(title => title.seriesTitle)).toEqual(['VisionQuest'])
		expect([1, 2, 3, 4, 5, 6].map(phase => CATALOG.filter(title => title.phase === phase).length)).toEqual([6, 6, 11, 18, 15, 8])
	})
	it('counts seasons independently, scopes statistics, and keeps latest valid rating through rewatches', () => {
		const repo = new MarathonRepository(':memory:')
		try {
			const add = (movieId: string, watchDate: string, ratingTicks: number | null) => repo.createEntry({ movieId, watchDate, ratingTicks, review: '' })
			add(MOVIES[0].id, '2026-01-01', 10)
			add(loki1.id, '2026-01-01', 6)
			add(loki1.id, '2026-01-02', 8)
			add(loki1.id, '2026-01-03', null)
			add(loki2.id, '2026-01-04', 4)
			const entries = repo.listEntries()
			const series = filterMovies(CATALOG, entries, { mediaType: 'series', query: 'Loki', status: 'watched' })
			expect(series.map(title => title.id)).toEqual([loki1.id, loki2.id])
			expect(filterMovies(CATALOG, entries, { mediaType: 'series', phase: 5, query: 'Loki' })).toEqual([loki2])
			expect(buildStatistics(series, entries)).toMatchObject({ watchedMovies: 2, totalMovies: 2, progress: 100, totalEntries: 4, rewatches: 2, averageRating: 3 })
			expect(buildStatistics(MOVIES, entries)).toMatchObject({ watchedMovies: 1, totalEntries: 1, averageRating: 5 })
			const backup = repo.createBackup()
			repo.restoreBackup(backup)
			expect(repo.listEntries()).toEqual(entries)
		} finally {
			repo.close()
		}
	})
	it('creates a unique reachable star for every season and keeps positions when filtering', () => {
		for (const base of CONSTELLATIONS) {
			const titles = CATALOG.filter(title => title.phase === base.phase)
			const full = layoutConstellation(base, titles)
			expect(full.points).toHaveLength(titles.length)
			expect(new Set(full.points.map(point => `${point.x},${point.y}`)).size).toBe(titles.length)
			expect(base.y + full.height).toBeLessThan(WORLD_HEIGHT)
			const series = titles.filter(title => title.mediaType === 'series')
			const filtered = layoutConstellation(base, series)
			series.forEach((title, index) => expect(filtered.points[index]).toEqual(full.points[titles.indexOf(title)]))
			full.edges.forEach(([a, b]) => {
				expect(full.points[a]).toBeDefined()
				expect(full.points[b]).toBeDefined()
			})
		}
	})
})

it('migrates a real v2 file without changing film history, posters or credential, and accepts old backups', () => {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'marathon-v2-series-'))
	const filename = path.join(directory, 'library.sqlite3')
	let repo: MarathonRepository | undefined
	try {
		const old = new DatabaseSync(filename)
		old.exec(`CREATE TABLE movies (id TEXT PRIMARY KEY, title_en TEXT NOT NULL, title_ko TEXT, release_year INTEGER NOT NULL, phase INTEGER NOT NULL, saga TEXT NOT NULL, release_order INTEGER NOT NULL UNIQUE);
		CREATE TABLE watch_entries (id TEXT PRIMARY KEY, movie_id TEXT NOT NULL REFERENCES movies(id), watch_date TEXT NOT NULL, rating_ticks INTEGER, review TEXT NOT NULL, created_at_utc TEXT NOT NULL, updated_at_utc TEXT NOT NULL);
		CREATE TABLE poster_assets (movie_id TEXT NOT NULL REFERENCES movies(id), source TEXT NOT NULL, jpeg BLOB NOT NULL, PRIMARY KEY(movie_id,source));
		CREATE TABLE private_settings (name TEXT PRIMARY KEY, encrypted_value BLOB NOT NULL); PRAGMA user_version=2;`)
		for (const title of MOVIES) old.prepare('INSERT INTO movies VALUES (?,?,?,?,?,?,?)').run(title.id, title.titleEn, null, title.releaseYear, title.phase, title.saga, title.releaseOrder)
		old.prepare('INSERT INTO watch_entries VALUES (?,?,?,?,?,?,?)').run('00000000-0000-4000-8000-000000000001', 'mcu-001', '2026-01-01', 7, 'preserve this review', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
		old.prepare('INSERT INTO poster_assets VALUES (?,?,?)').run('mcu-001', 'custom', Buffer.from('user-poster'))
		old.prepare('INSERT INTO private_settings VALUES (?,?)').run('tmdb', Buffer.from('encrypted-fixture'))
		old.close()
		repo = new MarathonRepository(filename)
		expect(repo.listMovies()).toEqual(CATALOG)
		expect(repo.listEntries()[0]).toMatchObject({ movieId: 'mcu-001', ratingTicks: 7, review: 'preserve this review' })
		expect(repo.getPoster('mcu-001')?.source).toBe('custom')
		expect(repo.getPosterCredential()?.toString()).toBe('encrypted-fixture')
		const legacy = { ...repo.createBackup(), catalogVersion: 'mcu-2026-11-05' }
		repo.restoreBackup(legacy)
		expect(repo.listEntries()).toEqual(legacy.watchEntries)
		repo.close()
		repo = new MarathonRepository(filename)
		expect(repo.listMovies()).toHaveLength(64)
		expect(repo.listEntries()).toEqual(legacy.watchEntries)
	} finally {
		repo?.close()
		if (path.dirname(path.resolve(directory)) === path.resolve(os.tmpdir()) && path.basename(directory).startsWith('marathon-v2-series-')) fs.rmSync(directory, { recursive: true, force: true })
	}
})

describe('TV poster transport', () => {
	it('disambiguates What If by verified identity while still validating its name and first year', () => {
		const title = TV_TITLES.find(title => title.id === 'mcu-tv-what-if-s03')!
		const real = { id: 91363, name: 'What If...?', first_air_date: '2021-08-11' }
		const other = { id: 332530, name: 'What if ...?', first_air_date: '2021-08-11' }
		expect(matchMovie({ results: [other, real] }, title)).toEqual({ id: 91363 })
		expect(() => matchMovie({ results: [other] }, title)).toThrow()
		expect(() => matchMovie({ results: [{ ...real, first_air_date: '2010-01-01' }] }, title)).toThrow()
	})
	it('matches the original series year and name, not season year or film title fields', () => {
		const result = { id: 84958, name: 'Loki', original_name: 'Loki', first_air_date: '2021-06-09' }
		expect(matchMovie({ results: [result] }, loki2)).toEqual({ id: 84958 })
		expect(() => matchMovie({ results: [{ ...result, first_air_date: '2023-01-01' }] }, loki2)).toThrow()
	})
	it.each([true, false])('uses season 2 artwork or language-verified series fallback (season available: %s)', async available => {
		const paths: string[] = []
		vi.stubGlobal(
			'fetch',
			vi.fn(async (input: string | URL) => {
				const url = new URL(input)
				paths.push(url.pathname)
				if (url.pathname === '/3/search/tv') {
					expect(url.searchParams.get('first_air_date_year')).toBe('2021')
					expect(url.searchParams.get('query')).toBe('Loki')
					return Response.json({ results: [{ id: 84958, name: 'Loki', first_air_date: '2021-06-09' }] })
				}
				if (url.pathname.endsWith('/images')) {
					expect(url.searchParams.get('include_image_language')).toBe('en,null')
					return Response.json({ posters: !available && url.pathname.includes('/season/') ? [] : [{ iso_639_1: 'en', file_path: '/english.jpg', width: 500, height: 750 }] })
				}
				return new Response('image')
			})
		)
		await fetchTmdbPoster(loki2, 'a'.repeat(32), new AbortController().signal)
		expect(paths).toEqual(['/3/search/tv', '/3/tv/84958/season/2/images', ...(!available ? ['/3/tv/84958/images'] : []), '/t/p/w500/english.jpg'])
	})
})
