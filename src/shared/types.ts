export type Phase = 1 | 2 | 3 | 4 | 5 | 6
export type Saga = 'Infinity Saga' | 'Multiverse Saga'
export type MediaType = 'movie' | 'series' | 'special'

export interface Movie {
	id: string
	titleEn: string
	titleKo: string | null
	releaseYear: number
	phase: Phase
	saga: Saga
	releaseOrder: number
	mediaType: MediaType
	seriesTitle: string | null
	seriesStartYear: number | null
	seasonNumber: number | null
	releaseStatus: 'released' | 'airing'
	poster?: { dataUrl: string; source: 'tmdb' | 'custom'; hasAutomatic: boolean }
}

export interface PosterStatus {
	hasCredential: boolean
	credentialProblem: boolean
	running: boolean
	cancelled: boolean
	total: number
	completed: number
	saved: number
	skipped: number
	currentTitle: string
	errors: { title: string; message: string }[]
	revision: number
}

export interface WatchEntry {
	id: string
	movieId: string
	watchDate: string
	ratingTicks: number | null
	review: string
	createdAtUtc: string
	updatedAtUtc: string
}

export type CreateWatchEntryInput = Pick<WatchEntry, 'movieId' | 'watchDate' | 'ratingTicks' | 'review'>
export type UpdateWatchEntryInput = Pick<WatchEntry, 'watchDate' | 'ratingTicks' | 'review'>
export type AppErrorCode = 'INVALID_INPUT' | 'NOT_FOUND' | 'STORAGE_ERROR' | 'BACKUP_ERROR' | 'PERMISSION_DENIED' | 'UNKNOWN'
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: { code: AppErrorCode; message: string } }

export interface BackupData {
	format: 'marvel-marathon-backup'
	formatVersion: 1
	exportedAtUtc: string
	catalogVersion: string
	watchEntries: WatchEntry[]
}

export interface AppInfo {
	version: string
	catalogVersion: string
	storage: 'SQLite' | 'IndexedDB'
}

export interface MarvelMarathonAPI {
	sync: {
		status(): Promise<ApiResult<import('./cloud').SyncStatus>>
		run(): Promise<ApiResult<import('./cloud').SyncStatus>>
		setEnabled(enabled: boolean): Promise<ApiResult<import('./cloud').SyncStatus>>
	}
	openExternal(url: string): Promise<void>
	movies: { list(): Promise<ApiResult<Movie[]>> }
	entries: {
		list(): Promise<ApiResult<WatchEntry[]>>
		create(input: CreateWatchEntryInput): Promise<ApiResult<WatchEntry>>
		update(id: string, input: UpdateWatchEntryInput): Promise<ApiResult<WatchEntry>>
		delete(id: string): Promise<ApiResult<{ deletedId: string }>>
	}
	backup: {
		export(): Promise<ApiResult<{ status: 'saved' | 'cancelled'; exportedCount?: number }>>
		import(): Promise<ApiResult<{ status: 'restored' | 'cancelled'; importedCount?: number }>>
	}
	appInfo: { get(): Promise<ApiResult<AppInfo>> }
	posters: {
		status(): Promise<ApiResult<PosterStatus>>
		saveCredential(value: string): Promise<ApiResult<PosterStatus>>
		clearCredential(): Promise<ApiResult<PosterStatus>>
		startSync(refresh: boolean): Promise<ApiResult<PosterStatus>>
		cancelSync(): Promise<ApiResult<PosterStatus>>
		chooseCustom(movieId: string): Promise<ApiResult<{ status: 'saved' | 'cancelled' }>>
		useAutomatic(movieId: string): Promise<ApiResult<void>>
	}
}

export interface RankingItem {
	rank: number
	movie: Movie
	ratingTicks: number
	watchDate: string
	watchCount: number
}

export interface PhaseStatistics {
	phase: Phase
	total: number
	watched: number
	progress: number
	averageRating: number | null
}

export interface Statistics {
	totalMovies: number
	watchedMovies: number
	totalEntries: number
	rewatches: number
	averageRating: number | null
	ratedMovies: number
	progress: number
	phases: PhaseStatistics[]
	distribution: { ratingTicks: number; count: number }[]
	ranking: RankingItem[]
	nextMovie: Movie | null
	recentEntries: WatchEntry[]
}

export interface MovieFilters {
	mediaType?: MediaType | 'all'
	query?: string
	phase?: number | 'all'
	status?: 'all' | 'watched' | 'unwatched'
}
