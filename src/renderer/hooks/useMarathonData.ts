import { useCallback, useEffect, useState } from 'react'
import type { ApiResult, AppInfo, Movie, WatchEntry, CreateWatchEntryInput, UpdateWatchEntryInput, PosterStatus } from '../../shared/types'
import type { SyncStatus } from '../../shared/cloud'

function unwrap<T>(result: ApiResult<T>): T {
	if (result.ok === false) throw new Error(result.error.message)
	return result.data
}

async function fetchSnapshot() {
	const api = window.electronAPI
	if (!api) throw new Error('앱의 데이터 연결을 찾을 수 없습니다. Electron 앱으로 실행해 주세요.')
	const [movieResult, entryResult, infoResult] = await Promise.all([api.movies.list(), api.entries.list(), api.appInfo.get()])
	return { movies: unwrap(movieResult), entries: unwrap(entryResult), appInfo: unwrap(infoResult) }
}

export function useMarathonData() {
	const [movies, setMovies] = useState<Movie[]>([])
	const [entries, setEntries] = useState<WatchEntry[]>([])
	const [appInfo, setAppInfo] = useState<AppInfo>({ version: '0.1.0', catalogVersion: '', storage: 'SQLite' })
	const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null)
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState('')
	const [notice, setNotice] = useState('')
	const [posterStatus, setPosterStatus] = useState<PosterStatus | null>(null)
	const refreshSync = useCallback(async () => {
		const [status, result] = await Promise.all([window.electronAPI.sync.status(), window.electronAPI.entries.list()])
		setSyncStatus(unwrap(status))
		const incoming = unwrap(result)
		setEntries(current => (JSON.stringify(current) === JSON.stringify(incoming) ? current : incoming))
	}, [])
	useEffect(() => {
		let active = true
		const poll = async () => {
			if (active && !document.hidden) await refreshSync().catch(() => {})
		}
		void poll()
		const timer = setInterval(() => void poll(), 3000)
		return () => {
			active = false
			clearInterval(timer)
		}
	}, [refreshSync])
	async function syncNow() {
		setSyncStatus(unwrap(await window.electronAPI.sync.run()))
		await refreshSync()
	}
	async function setSyncEnabled(enabled: boolean) {
		setSyncStatus(unwrap(await window.electronAPI.sync.setEnabled(enabled)))
		await refreshSync()
	}
	const refreshPosters = useCallback(async () => {
		const [movieResult, statusResult] = await Promise.all([window.electronAPI.movies.list(), window.electronAPI.posters.status()])
		setMovies(unwrap(movieResult))
		setPosterStatus(unwrap(statusResult))
	}, [])
	useEffect(() => {
		let active = true
		let revision = -1
		let timer: ReturnType<typeof setTimeout>
		async function poll() {
			try {
				const status = unwrap(await window.electronAPI.posters.status())
				if (!active) return
				setPosterStatus(status)
				if (revision !== status.revision) {
					const updated = unwrap(await window.electronAPI.movies.list())
					if (active) setMovies(updated)
					revision = status.revision
				}
			} catch {
				/* The normal snapshot owns startup errors; a later poll can recover. */
			} finally {
				if (active) timer = setTimeout(() => void poll(), 1000)
			}
		}
		void poll()
		return () => {
			active = false
			clearTimeout(timer)
		}
	}, [])
	const refresh = useCallback(async () => {
		setError('')
		setLoading(true)
		try {
			const snapshot = await fetchSnapshot()
			setMovies(snapshot.movies)
			setEntries(snapshot.entries)
			setAppInfo(snapshot.appInfo)
			return true
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : '데이터를 불러오지 못했어요.')
			return false
		} finally {
			setLoading(false)
		}
	}, [])
	useEffect(() => {
		let active = true
		void fetchSnapshot().then(
			snapshot => {
				if (!active) return
				setMovies(snapshot.movies)
				setEntries(snapshot.entries)
				setAppInfo(snapshot.appInfo)
				setLoading(false)
			},
			cause => {
				if (!active) return
				setError(cause instanceof Error ? cause.message : '데이터를 불러오지 못했어요.')
				setLoading(false)
			}
		)
		return () => {
			active = false
		}
	}, [])
	useEffect(() => {
		if (!notice) return
		const timer = setTimeout(() => setNotice(''), 4500)
		return () => clearTimeout(timer)
	}, [notice])
	async function create(input: CreateWatchEntryInput) {
		const entry = unwrap(await window.electronAPI.entries.create(input))
		const watchedIds = new Set(entries.map(item => item.movieId))
		const isNewStar = !watchedIds.has(input.movieId)
		watchedIds.add(input.movieId)
		const movie = movies.find(item => item.id === input.movieId)
		const phaseMovies = movies.filter(item => item.phase === movie?.phase)
		setEntries(current => [...current.filter(item => item.id !== entry.id), entry])
		void window.electronAPI.sync
			.run()
			.then(refreshSync)
			.catch(() => {})
		setNotice(isNewStar && movies.length > 0 && movies.every(item => watchedIds.has(item.id)) ? `${movies.length}개의 별, 나만의 우주를 완성했어요!` : isNewStar && phaseMovies.length > 0 && phaseMovies.every(item => watchedIds.has(item.id)) ? `새로운 별이 켜졌어요. Phase ${movie!.phase} 별자리 완성!` : isNewStar ? '감상 기록을 저장했어요. 나의 우주에 새로운 별이 켜졌어요!' : '재관람 기록을 저장했어요. 빛나는 별에 새로운 이야기가 쌓였어요.')
	}
	async function update(id: string, input: UpdateWatchEntryInput) {
		const entry = unwrap(await window.electronAPI.entries.update(id, input))
		setEntries(current => current.map(item => (item.id === id ? entry : item)))
		void window.electronAPI.sync
			.run()
			.then(refreshSync)
			.catch(() => {})
		setNotice('감상 기록을 수정했어요.')
	}
	async function remove(id: string) {
		unwrap(await window.electronAPI.entries.delete(id))
		setEntries(current => current.filter(item => item.id !== id))
		void window.electronAPI.sync
			.run()
			.then(refreshSync)
			.catch(() => {})
		setNotice('감상 기록을 삭제했어요.')
	}
	async function exportBackup() {
		const result = unwrap(await window.electronAPI.backup.export())
		if (result.status === 'saved') setNotice(`${result.exportedCount ?? entries.length}개의 감상 기록을 백업했어요.`)
	}
	async function importBackup() {
		const result = unwrap(await window.electronAPI.backup.import())
		if (result.status === 'restored') {
			if (await refresh()) {
				setNotice(`${result.importedCount ?? 0}개의 감상 기록을 복원했어요.`)
			} else {
				setNotice('')
				setError('기록은 복원했지만 화면을 새로 불러오지 못했어요. 다시 시도를 눌러 주세요.')
			}
		}
	}
	return { movies, entries, appInfo, loading, error, notice, refresh, create, update, remove, exportBackup, importBackup, posterStatus, refreshPosters, syncStatus, syncNow, setSyncEnabled }
}
export type MarathonData = ReturnType<typeof useMarathonData>
