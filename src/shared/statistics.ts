import type { Movie, MovieFilters, Phase, RankingItem, Statistics, WatchEntry } from './types'

function descending(a: string, b: string): number {
	return a === b ? 0 : a > b ? -1 : 1
}

export function sortEntries(entries: readonly WatchEntry[]): WatchEntry[] {
	return [...entries].sort((a, b) => descending(a.watchDate, b.watchDate) || descending(a.createdAtUtc, b.createdAtUtc) || descending(a.id, b.id))
}

export function getMovieEntries(movieId: string, entries: readonly WatchEntry[]): WatchEntry[] {
	return sortEntries(entries.filter(entry => entry.movieId === movieId))
}

export function getCurrentRating(movieId: string, entries: readonly WatchEntry[]): number | null {
	return getMovieEntries(movieId, entries).find(entry => entry.ratingTicks !== null)?.ratingTicks ?? null
}

export function getRatingChange(movieId: string, entries: readonly WatchEntry[]): number | null {
	const rated = getMovieEntries(movieId, entries).filter(entry => entry.ratingTicks !== null)
	return rated.length < 2 ? null : (rated[0].ratingTicks! - rated[1].ratingTicks!) / 2
}

export function getWatchedMovieCount(movies: readonly Movie[], entries: readonly WatchEntry[]): number {
	const watched = new Set(entries.map(entry => entry.movieId))
	return movies.filter(movie => watched.has(movie.id)).length
}

export function getNextMovie(movies: readonly Movie[], entries: readonly WatchEntry[]): Movie | null {
	const watched = new Set(entries.map(entry => entry.movieId))
	return [...movies].sort((a, b) => a.releaseOrder - b.releaseOrder).find(movie => !watched.has(movie.id)) ?? null
}

export function buildRanking(movies: readonly Movie[], entries: readonly WatchEntry[]): RankingItem[] {
	return movies
		.flatMap(movie => {
			const movieEntries = getMovieEntries(movie.id, entries)
			const current = movieEntries.find(entry => entry.ratingTicks !== null)
			return current ? [{ rank: 0, movie, ratingTicks: current.ratingTicks!, watchDate: current.watchDate, watchCount: movieEntries.length }] : []
		})
		.sort((a, b) => b.ratingTicks - a.ratingTicks || a.movie.releaseOrder - b.movie.releaseOrder)
		.map((item, index) => ({ ...item, rank: index + 1 }))
}

function meanRating(ranking: readonly RankingItem[]): number | null {
	return ranking.length ? ranking.reduce((sum, item) => sum + item.ratingTicks, 0) / ranking.length / 2 : null
}

/** Display averages half-up without letting binary representation round x.x5 down. */
export function formatAverageRating(value: number | null): string {
	if (value === null) return '—'
	const rounded = Math.round((value + Number.EPSILON * Math.abs(value)) * 10) / 10
	return rounded.toFixed(1)
}

export function buildStatistics(movies: readonly Movie[], entries: readonly WatchEntry[]): Statistics {
	const ranking = buildRanking(movies, entries)
	const watchedMovies = getWatchedMovieCount(movies, entries)
	const watchedIds = new Set(entries.map(entry => entry.movieId))
	return {
		totalMovies: movies.length,
		watchedMovies,
		totalEntries: entries.length,
		rewatches: movies.reduce((sum, movie) => sum + Math.max(0, entries.filter(entry => entry.movieId === movie.id).length - 1), 0),
		averageRating: meanRating(ranking),
		ratedMovies: ranking.length,
		progress: movies.length ? (watchedMovies / movies.length) * 100 : 0,
		phases: ([1, 2, 3, 4, 5, 6] as Phase[]).map(phase => {
			const phaseMovies = movies.filter(movie => movie.phase === phase)
			const watched = phaseMovies.filter(movie => watchedIds.has(movie.id)).length
			return { phase, total: phaseMovies.length, watched, progress: phaseMovies.length ? (watched / phaseMovies.length) * 100 : 0, averageRating: meanRating(ranking.filter(item => item.movie.phase === phase)) }
		}),
		distribution: Array.from({ length: 10 }, (_, index) => ({ ratingTicks: index + 1, count: ranking.filter(item => item.ratingTicks === index + 1).length })),
		ranking,
		nextMovie: getNextMovie(movies, entries),
		recentEntries: sortEntries(entries).slice(0, 5),
	}
}

export function filterMovies(movies: readonly Movie[], entries: readonly WatchEntry[], filters: MovieFilters = {}): Movie[] {
	const query = (filters.query ?? '').trim().toLowerCase()
	const watched = new Set(entries.map(entry => entry.movieId))
	return movies
		.filter(movie => {
			if (query && !movie.titleEn.toLowerCase().includes(query) && !(movie.titleKo ?? '').toLowerCase().includes(query)) return false
			if (filters.phase && filters.phase !== 'all' && movie.phase !== filters.phase) return false
			if (filters.status === 'watched' && !watched.has(movie.id)) return false
			if (filters.status === 'unwatched' && watched.has(movie.id)) return false
			return true
		})
		.sort((a, b) => a.releaseOrder - b.releaseOrder)
}
