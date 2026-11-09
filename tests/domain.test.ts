import { describe, expect, it } from 'vitest'
import { CATALOG_VERSION, MOVIES } from '../src/shared/catalog'
import { buildRanking, buildStatistics, filterMovies, formatAverageRating, getCurrentRating, getNextMovie, getRatingChange, sortEntries } from '../src/shared/statistics'
import { DomainError, isValidCalendarDate, localToday, validateBackup, validateCreateEntry, validateEntryId, validateUpdateEntry } from '../src/shared/validation'
import type { BackupData, CreateWatchEntryInput, WatchEntry } from '../src/shared/types'

const today = '2026-11-05'
const timestamp = '2026-11-05T10:00:00.000Z'
const input: CreateWatchEntryInput = { movieId: 'mcu-001', watchDate: today, ratingTicks: 9, review: '다시 봐도 재미있다.' }

function entry(number: number, changes: Partial<WatchEntry> = {}): WatchEntry {
	return {
		...input,
		id: `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`,
		createdAtUtc: timestamp,
		updatedAtUtc: timestamp,
		...changes,
	}
}

function backup(watchEntries = [entry(1)]): BackupData {
	return { format: 'marvel-marathon-backup', formatVersion: 1, catalogVersion: CATALOG_VERSION, exportedAtUtc: timestamp, watchEntries }
}

describe('catalog', () => {
	it('contains 38 unique stable IDs and consecutive release order', () => {
		expect(MOVIES).toHaveLength(38)
		expect(new Set(MOVIES.map(movie => movie.id)).size).toBe(38)
		expect(MOVIES.map(movie => movie.releaseOrder)).toEqual(Array.from({ length: 38 }, (_, i) => i + 1))
		expect(MOVIES[0]).toMatchObject({ id: 'mcu-001', titleEn: 'Iron Man', releaseYear: 2008 })
		expect(MOVIES[37]).toMatchObject({ id: 'mcu-038', titleEn: 'Spider-Man: Brand New Day', releaseYear: 2026 })
	})
	it('uses the specified phase counts and sagas', () => {
		expect([1, 2, 3, 4, 5, 6].map(phase => MOVIES.filter(movie => movie.phase === phase).length)).toEqual([6, 6, 11, 7, 6, 2])
		for (const movie of MOVIES) expect(movie.saga).toBe(movie.phase <= 3 ? 'Infinity Saga' : 'Multiverse Saga')
		expect(MOVIES.some(movie => /Doomsday|Secret Wars/.test(movie.titleEn))).toBe(false)
	})
})

describe('statistics', () => {
	it('distinguishes unique movies, views, rewatches and movie-weighted current averages', () => {
		const entries = [entry(1, { watchDate: '2026-11-04', ratingTicks: 8 }), entry(2), entry(3, { movieId: 'mcu-004', ratingTicks: 7 })]
		const stats = buildStatistics(MOVIES, entries)
		expect(stats).toMatchObject({ watchedMovies: 2, totalEntries: 3, rewatches: 1, averageRating: 4, ratedMovies: 2 })
		expect(stats.progress).toBe((2 / 38) * 100)
		expect(stats.phases[0]).toMatchObject({ total: 6, watched: 2, averageRating: 4 })
		expect(stats.distribution.filter(bin => bin.count)).toEqual([
			{ ratingTicks: 7, count: 1 },
			{ ratingTicks: 9, count: 1 },
		])
		expect(getRatingChange('mcu-001', entries)).toBe(0.5)
	})
	it('keeps the previous valid rating when the latest view has no rating', () => {
		const entries = [entry(1, { watchDate: '2026-11-04' }), entry(2, { ratingTicks: null })]
		expect(getCurrentRating('mcu-001', entries)).toBe(9)
		expect(buildRanking(MOVIES, entries)[0]).toMatchObject({ ratingTicks: 9, watchDate: '2026-11-04', watchCount: 2 })
		expect(getRatingChange('mcu-001', entries)).toBeNull()
	})
	it('counts unrated watches as completion but excludes them from averages and ranking', () => {
		const stats = buildStatistics(MOVIES, [entry(1, { ratingTicks: null, review: '' })])
		expect(stats).toMatchObject({ watchedMovies: 1, totalEntries: 1, rewatches: 0, ratedMovies: 0, averageRating: null })
		expect(stats.ranking).toEqual([])
		expect(stats.nextMovie?.id).toBe('mcu-002')
	})
	it('sorts by watch date, then creation time, then ID, without mutating input', () => {
		const entries = [entry(4, { watchDate: '2026-10-01' }), entry(1), entry(3), entry(2, { createdAtUtc: '2026-11-05T11:00:00.000Z' })]
		const original = entries.map(item => item.id)
		expect(sortEntries(entries).map(item => item.id)).toEqual([entries[3].id, entries[2].id, entries[1].id, entries[0].id])
		expect(entries.map(item => item.id)).toEqual(original)
	})
	it('uses watch date over registration date for current ratings', () => {
		const entries = [entry(1, { ratingTicks: 10, watchDate: '2026-11-01', createdAtUtc: '2026-11-05T12:00:00.000Z' }), entry(2, { ratingTicks: 7 })]
		expect(getCurrentRating('mcu-001', entries)).toBe(7)
		expect(getRatingChange('mcu-001', entries)).toBe(-1.5)
	})
	it('ranks ratings descending and ties in release order with a single row per movie', () => {
		const entries = [entry(1, { movieId: 'mcu-004', ratingTicks: 9 }), entry(2), entry(3, { movieId: 'mcu-002', ratingTicks: 10 }), entry(4)]
		expect(buildRanking(MOVIES, entries).map(item => [item.rank, item.movie.id])).toEqual([
			[1, 'mcu-002'],
			[2, 'mcu-001'],
			[3, 'mcu-004'],
		])
	})
	it('recomputes after a final entry is deleted', () => {
		const entries = [entry(1), entry(2, { movieId: 'mcu-002' })]
		expect(buildStatistics(MOVIES, entries).watchedMovies).toBe(2)
		const after = buildStatistics(MOVIES, entries.slice(1))
		expect(after.watchedMovies).toBe(1)
		expect(after.nextMovie?.id).toBe('mcu-001')
	})
	it('handles empty and completely watched catalogs', () => {
		const empty = buildStatistics(MOVIES, [])
		expect(empty).toMatchObject({ progress: 0, averageRating: null, watchedMovies: 0, totalEntries: 0, rewatches: 0 })
		expect(empty.nextMovie?.id).toBe('mcu-001')
		expect(buildStatistics([], []).progress).toBe(0)
		const complete = buildStatistics(
			MOVIES,
			MOVIES.map((movie, i) => entry(i + 1, { movieId: movie.id }))
		)
		expect(complete.progress).toBe(100)
		expect(complete.nextMovie).toBeNull()
		expect(getNextMovie([...MOVIES].reverse(), [])?.id).toBe('mcu-001')
	})
	it('limits recent history to five records and retains raw average precision', () => {
		const entries = MOVIES.slice(0, 6).map((movie, i) => entry(i + 1, { movieId: movie.id, ratingTicks: i % 2 ? 9 : 8 }))
		const stats = buildStatistics(MOVIES, entries)
		expect(stats.recentEntries).toHaveLength(5)
		expect(stats.averageRating).toBe(4.25)
	})
	it.each([
		[4.35, '4.4'],
		[4.05, '4.1'],
		[4.25, '4.3'],
		[4.34, '4.3'],
		[4.36, '4.4'],
		[0.5, '0.5'],
		[5, '5.0'],
		[null, '—'],
	] as const)('formats average %s as %s using half-up rounding', (value, formatted) => {
		expect(formatAverageRating(value)).toBe(formatted)
	})
	it('rounds displayed overall and phase averages while preserving the unrounded calculation', () => {
		const phaseThree = MOVIES.filter(movie => movie.phase === 3).slice(0, 10)
		const entries = phaseThree.map((movie, i) => entry(i + 1, { movieId: movie.id, ratingTicks: i < 7 ? 9 : 8 }))
		const stats = buildStatistics(MOVIES, entries)
		expect(stats.averageRating).toBe(4.35)
		expect(stats.phases[2].averageRating).toBe(4.35)
		expect(formatAverageRating(stats.averageRating)).toBe('4.4')
		expect(formatAverageRating(stats.phases[2].averageRating)).toBe('4.4')
	})
})

describe('movie filters', () => {
	it('intersects trimmed case-insensitive title search, phase, and watch status', () => {
		const entries = [entry(1, { ratingTicks: null })]
		expect(filterMovies(MOVIES, entries, { query: ' IRON ', phase: 1, status: 'unwatched' }).map(movie => movie.id)).toEqual(['mcu-003'])
		expect(filterMovies(MOVIES, entries, { query: 'iron', phase: 1, status: 'watched' }).map(movie => movie.id)).toEqual(['mcu-001'])
		expect(filterMovies(MOVIES, entries, { query: 'iron', phase: 6 })).toEqual([])
		expect(filterMovies(MOVIES, entries, { query: '', phase: 'all', status: 'all' })).toHaveLength(38)
	})
	it('matches Korean titles when available', () => {
		expect(filterMovies([{ ...MOVIES[0], titleKo: '아이언맨' }], [], { query: '아이언' })).toHaveLength(1)
	})
})

describe('entry validation', () => {
	it('accepts leap dates, local today and optional ratings/reviews, and trims writes', () => {
		expect(validateCreateEntry({ ...input, watchDate: '2024-02-29', ratingTicks: null, review: '  감상\n기록  ' }, today)).toMatchObject({ watchDate: '2024-02-29', ratingTicks: null, review: '감상\n기록' })
		expect(validateUpdateEntry({ watchDate: today, ratingTicks: null, review: '' }, today)).toEqual({ watchDate: today, ratingTicks: null, review: '' })
		expect(localToday(new Date(2026, 0, 2, 0, 30))).toBe('2026-01-02')
		expect(isValidCalendarDate('2000-02-29')).toBe(true)
		expect(isValidCalendarDate('1900-02-29')).toBe(false)
	})
	it.each(['2026-02-30', '2025-02-29', '2026-13-01', '2026-00-01', '0000-01-01', '2026-11-06', '2026-1-01', '2026-01-00', '2026-01-01T00:00:00.000Z', ''])('rejects invalid/future date %s', date => {
		expect(() => validateCreateEntry({ ...input, watchDate: date }, today)).toThrow(DomainError)
	})
	it.each([-1, 0, 11, 8.6, 4.3, Number.NaN, Number.POSITIVE_INFINITY, '9', undefined])('rejects invalid ratingTicks %s', rating => {
		expect(() => validateCreateEntry({ ...input, ratingTicks: rating }, today)).toThrow(DomainError)
	})
	it('accepts all ten tick values and rejects unknown films and input types', () => {
		for (let tick = 1; tick <= 10; tick++) expect(validateCreateEntry({ ...input, ratingTicks: tick }, today).ratingTicks).toBe(tick)
		for (const bad of [null, [], 'entry', { ...input, movieId: 'mcu-999' }, { ...input, review: null }, { ...input, review: '\u0000' }]) {
			expect(() => validateCreateEntry(bad, today)).toThrow(DomainError)
		}
	})
	it('accepts 500 UTF-16 characters and rejects 501 before trimming', () => {
		expect(validateCreateEntry({ ...input, review: '가'.repeat(500) }, today).review).toHaveLength(500)
		expect(() => validateCreateEntry({ ...input, review: '가'.repeat(501) }, today)).toThrow(DomainError)
		expect(() => validateCreateEntry({ ...input, review: ' '.repeat(501) }, today)).toThrow(DomainError)
	})
	it('preserves valid Unicode and rejects lone surrogates that SQLite would replace', () => {
		const review = '🎬 재관람, 오늘도 좋았다. ⭐'
		expect(validateCreateEntry({ ...input, review }, today).review).toBe(review)
		for (const bad of ['bad\uD800', '\uDC00bad', '\uD800\uD800']) {
			expect(() => validateCreateEntry({ ...input, review: bad }, today)).toThrow(DomainError)
			expect(() => validateBackup(backup([entry(1, { review: bad })]), today)).toThrow(DomainError)
		}
	})
	it('validates IDs without accepting arbitrary strings', () => {
		expect(validateEntryId(entry(1).id)).toBe(entry(1).id)
		for (const bad of ['', 'not-a-uuid', null, 15, '00000000-0000-0000-0000-000000000000']) expect(() => validateEntryId(bad)).toThrow(DomainError)
	})
})

describe('backup validation', () => {
	it('round trips all fields including whitespace and entry identity', () => {
		const original = backup([entry(1, { review: '  감상\n기록  ' }), entry(2, { ratingTicks: null, review: '' })])
		expect(validateBackup(JSON.parse(JSON.stringify(original)), today)).toEqual(original)
		expect(validateBackup({ ...original, catalogVersion: 'mcu-2025-01-01' }, today).catalogVersion).toBe('mcu-2025-01-01')
	})
	it.each([null, [], {}, { ...backup(), format: 'another-app' }, { ...backup(), formatVersion: 2 }, { ...backup(), catalogVersion: 'mcu-2027-01-01' }, { ...backup(), catalogVersion: 'mcu-2026-02-30' }, { ...backup(), exportedAtUtc: '2026-02-30T10:00:00.000Z' }, { ...backup(), watchEntries: 'not-an-array' }, backup([entry(1), entry(1)]), backup([entry(1, { movieId: 'mcu-999' })]), backup([entry(1, { id: '../../bad' })]), backup([entry(1, { watchDate: '2026-11-06' })]), backup([entry(1, { ratingTicks: 11 })]), backup([entry(1, { review: 'x'.repeat(501) })]), backup([entry(1, { createdAtUtc: '2026-11-05T25:00:00.000Z' })]), backup([entry(1, { updatedAtUtc: '2026-11-04T10:00:00.000Z' })])])('rejects malformed or incompatible backup %# with a safe error', candidate => {
		try {
			validateBackup(candidate, today)
			expect.fail('Expected invalid backup to be rejected')
		} catch (error) {
			expect(error).toBeInstanceOf(DomainError)
			expect((error as DomainError).code).toBe('BACKUP_ERROR')
			expect((error as Error).message).toContain('기존 기록은 변경되지 않았습니다')
		}
	})
	it('rejects excessively large entry arrays before validation', () => {
		expect(() => validateBackup(backup(Array.from({ length: 20001 }, () => entry(1))), today)).toThrow(DomainError)
	})
})
