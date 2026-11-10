import { CATALOG, CATALOG_VERSION } from '../../shared/catalog'
import { CLOUD_ORIGIN, nextSyncVersion, validateSyncRecords, type SyncRecord, type SyncStatus } from '../../shared/cloud'
import type { ApiResult, MarvelMarathonAPI, PosterStatus, WatchEntry } from '../../shared/types'
import { DomainError, MAX_BACKUP_BYTES, validateBackup, validateCreateEntry, validateEntryId, validateUpdateEntry } from '../../shared/validation'
import { MAX_POSTER_BYTES, posterKey, synchronizePosters, validatePosterBytes, type PosterRecord } from '../../shared/poster-sync'

type StoredRecord = SyncRecord & { dirty: boolean }
type StoredPoster = PosterRecord & { key: string; dataUrl?: string; dirty: boolean }
let database: Promise<IDBDatabase> | undefined
function db() {
	return (database ??= new Promise((resolve, reject) => {
		const opening = indexedDB.open('marvel-marathon', 2)
		opening.onupgradeneeded = event => {
			if (event.oldVersion < 1) {
				opening.result.createObjectStore('records', { keyPath: 'id' })
				opening.result.createObjectStore('posters')
				opening.result.createObjectStore('backups')
			}
			const posters = opening.result.createObjectStore('posterAssets', { keyPath: 'key' })
			const cursor = opening.transaction!.objectStore('posters').openCursor()
			cursor.onsuccess = () => {
				const row = cursor.result
				if (!row) return
				const movieId = String(row.key)
				if (CATALOG.some(movie => movie.id === movieId) && row.value?.dataUrl) posters.put({ key: `${movieId}/custom`, movieId, source: 'custom', version: nextSyncVersion(), deleted: false, dataUrl: row.value.dataUrl, dirty: true } satisfies StoredPoster)
				row.continue()
			}
		}
		opening.onsuccess = () => {
			opening.result.onversionchange = () => opening.result.close()
			resolve(opening.result)
		}
		opening.onblocked = () => reject(new Error('다른 Marvel Marathon 창을 닫고 다시 열어 주세요.'))
		opening.onerror = () => reject(new Error('아이폰 저장 공간을 열지 못했어요. 저장 공간을 확인해 주세요.'))
	}))
}
function result<T>(request: IDBRequest<T>): Promise<T> {
	return new Promise((resolve, reject) => {
		request.onsuccess = () => resolve(request.result)
		request.onerror = () => reject(request.error)
	})
}
async function transaction<T>(store: string, action: (store: IDBObjectStore) => Promise<T>, mode: IDBTransactionMode = 'readonly'): Promise<T> {
	const tx = (await db()).transaction(store, mode)
	const done = new Promise<void>((resolve, reject) => {
		tx.oncomplete = () => resolve()
		tx.onerror = () => reject(tx.error)
		tx.onabort = () => reject(tx.error ?? new Error('저장을 완료하지 못했어요.'))
	})
	try {
		const value = await action(tx.objectStore(store))
		await done
		return value
	} catch (error) {
		try {
			tx.abort()
		} catch {
			/* already finished */
		}
		await done.catch(() => {})
		throw error
	}
}
async function records(): Promise<StoredRecord[]> {
	return transaction('records', store => result(store.getAll()))
}
async function entries() {
	return (await records()).flatMap(record => (record.entry ? [record.entry] : []))
}
async function change(id: string, entry: WatchEntry | null) {
	await transaction(
		'records',
		async store => {
			const all = await result<StoredRecord[]>(store.getAll())
			const latest = all.reduce((version, row) => (row.version > version ? row.version : version), '')
			await result(store.put({ id, entry, version: nextSyncVersion(latest), dirty: true } satisfies StoredRecord))
		},
		'readwrite'
	)
}
function posterBytes(dataUrl: string): Uint8Array {
	return validatePosterBytes(Uint8Array.from(atob(dataUrl.split(',')[1]), char => char.charCodeAt(0)))
}
function posterDataUrl(bytes: Uint8Array): string {
	const pieces: string[] = []
	for (let offset = 0; offset < bytes.length; offset += 8192) pieces.push(String.fromCharCode(...bytes.subarray(offset, offset + 8192)))
	return `data:image/jpeg;base64,${btoa(pieces.join(''))}`
}
async function posterRecords(): Promise<StoredPoster[]> {
	return transaction('posterAssets', store => result(store.getAll()))
}
async function changePoster(movieId: string, dataUrl?: string) {
	await transaction(
		'posterAssets',
		async store => {
			const all = await result<StoredPoster[]>(store.getAll())
			const latest = all.reduce((version, row) => (row.version > version ? row.version : version), '')
			await result(store.put({ key: `${movieId}/custom`, movieId, source: 'custom', version: nextSyncVersion(latest), deleted: !dataUrl, dataUrl, dirty: true } satisfies StoredPoster))
		},
		'readwrite'
	)
	posterRevision++
	void sync()
}
async function syncPosters() {
	await synchronizePosters(
		{
			list: async pending => (await posterRecords()).filter(record => !pending || record.dirty),
			read: async record => {
				const local = await transaction('posterAssets', store => result<StoredPoster | undefined>(store.get(posterKey(record))))
				return local?.version === record.version && local.dataUrl ? posterBytes(local.dataUrl) : undefined
			},
			merge: async (record, bytes) => {
				await transaction(
					'posterAssets',
					async store => {
						const local = await result<StoredPoster | undefined>(store.get(posterKey(record)))
						if (local && local.version > record.version) return
						const dataUrl = record.deleted ? undefined : bytes ? posterDataUrl(bytes) : local?.dataUrl
						if (!record.deleted && !dataUrl) throw new Error('Missing poster')
						await result(store.put({ ...record, key: posterKey(record), dataUrl, dirty: false } satisfies StoredPoster))
						if (!local || local.version !== record.version || bytes) posterRevision++
					},
					'readwrite'
				)
			},
		},
		(path, init) => fetch(path, { ...init, credentials: 'same-origin', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(20000) })
	)
}
const syncState: SyncStatus = { enabled: localStorage.getItem('marathon-sync-enabled') !== 'false', running: false, pending: 0, lastSyncedAt: null, error: null, webUrl: CLOUD_ORIGIN }
async function status() {
	return { ...syncState, pending: (await records()).filter(record => record.dirty).length + (await posterRecords()).filter(record => record.dirty).length }
}
async function sync() {
	if (syncState.running || !syncState.enabled) return status()
	syncState.running = true
	try {
		const request = async (method: string, body?: unknown) => {
			const response = await fetch('/api/sync', { method, credentials: 'same-origin', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15000), headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
			if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) throw new Error('Cloud unavailable')
			return response.json()
		}
		const pending = (await records()).filter(record => record.dirty)
		for (let offset = 0; offset < pending.length; offset += 100) await request('POST', { records: pending.slice(offset, offset + 100).map(({ id, entry, version }) => ({ id, entry, version })) })
		const remote = (await request('GET')) as { records: unknown }
		const incoming = validateSyncRecords(remote.records)
		await transaction(
			'records',
			async store => {
				for (const record of incoming) {
					const local = await result<StoredRecord | undefined>(store.get(record.id))
					if (!local || local.version <= record.version) await result(store.put({ ...record, dirty: false }))
				}
			},
			'readwrite'
		)
		await syncPosters()
		syncState.lastSyncedAt = new Date().toISOString()
		syncState.error = null
	} catch {
		syncState.error = navigator.onLine ? '연결을 확인하거나 다시 로그인해 주세요. 기록은 이 기기에 보관 중입니다.' : '오프라인이에요. 연결되면 저장한 기록을 자동으로 동기화합니다.'
	} finally {
		syncState.running = false
	}
	return status()
}
async function api<T>(operation: () => Promise<T>): Promise<ApiResult<T>> {
	try {
		return { ok: true, data: await operation() }
	} catch (error) {
		return { ok: false, error: { code: error instanceof DomainError ? error.code : 'STORAGE_ERROR', message: error instanceof Error ? error.message : '저장하지 못했어요. 다시 시도해 주세요.' } }
	}
}
function chooseFile(accept: string): Promise<File | null> {
	return new Promise(resolve => {
		const input = document.createElement('input')
		input.type = 'file'
		input.accept = accept
		input.onchange = () => resolve(input.files?.[0] ?? null)
		input.oncancel = () => resolve(null)
		input.click()
	})
}
let posterRevision = 0
const posterStatus = (): PosterStatus => ({ hasCredential: false, credentialProblem: false, running: false, cancelled: false, total: 0, completed: 0, saved: 0, skipped: 0, currentTitle: '', errors: [], revision: posterRevision })
function unavailable(): Promise<ApiResult<PosterStatus>> {
	return api(async () => {
		throw new Error('자동 포스터 가져오기는 PC 앱에서 사용할 수 있어요. 아이폰에서는 내 이미지를 선택해 주세요.')
	})
}

export function installBrowserAPI() {
	window.electronAPI = {
		openExternal: async url => {
			const parsed = new URL(url)
			if (parsed.protocol === 'https:') window.open(url, '_blank', 'noopener,noreferrer')
		},
		movies: {
			list: () =>
				api(async () => {
					const images = new Map((await posterRecords()).filter(record => !record.deleted && record.dataUrl).map(record => [record.key, record]))
					return CATALOG.map(movie => {
						const automatic = images.get(`${movie.id}/tmdb`)
						const selected = images.get(`${movie.id}/custom`) ?? automatic
						return { ...movie, poster: selected ? { dataUrl: selected.dataUrl!, source: selected.source, hasAutomatic: !!automatic } : undefined }
					})
				}),
		},
		entries: {
			list: () => api(entries),
			create: input =>
				api(async () => {
					const timestamp = new Date().toISOString()
					const entry = { ...validateCreateEntry(input), id: crypto.randomUUID(), createdAtUtc: timestamp, updatedAtUtc: timestamp }
					await change(entry.id, entry)
					void sync()
					return entry
				}),
			update: (id, input) =>
				api(async () => {
					validateEntryId(id)
					const current = (await entries()).find(entry => entry.id === id)
					if (!current) throw new Error('감상 기록을 찾을 수 없어요.')
					const entry = { ...current, ...validateUpdateEntry(input), updatedAtUtc: new Date(Math.max(Date.now(), Date.parse(current.updatedAtUtc) + 1)).toISOString() }
					await change(id, entry)
					void sync()
					return entry
				}),
			delete: id =>
				api(async () => {
					validateEntryId(id)
					await change(id, null)
					void sync()
					return { deletedId: id }
				}),
		},
		backup: {
			export: () =>
				api(async () => {
					const watchEntries = await entries()
					const backup = { format: 'marvel-marathon-backup', formatVersion: 1, exportedAtUtc: new Date().toISOString(), catalogVersion: CATALOG_VERSION, watchEntries }
					const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }))
					const anchor = document.createElement('a')
					anchor.href = url
					anchor.download = `marvel-marathon-backup-${new Date().toISOString().slice(0, 10)}.json`
					anchor.click()
					setTimeout(() => URL.revokeObjectURL(url), 60000)
					return { status: 'saved' as const, exportedCount: watchEntries.length }
				}),
			import: () => {
				const selected = chooseFile('.json,application/json')
				return api(async () => {
					const file = await selected
					if (!file) return { status: 'cancelled' as const }
					if (file.size > MAX_BACKUP_BYTES) throw new Error('백업 파일은 10MB 이하만 가져올 수 있어요.')
					const backup = validateBackup(JSON.parse(await file.text()))
					if (!confirm(`현재 기록을 백업의 ${backup.watchEntries.length}건으로 교체할까요? 연결된 PC에도 반영됩니다.`)) return { status: 'cancelled' as const }
					const old = await records()
					await transaction('backups', store => result(store.put(old, new Date().toISOString())), 'readwrite')
					await transaction(
						'records',
						async store => {
							const existing = await result<StoredRecord[]>(store.getAll())
							const next = new Map(backup.watchEntries.map(entry => [entry.id, entry]))
							let version = existing.reduce((v, r) => (r.version > v ? r.version : v), '')
							for (const id of new Set([...existing.map(record => record.id), ...next.keys()])) {
								version = nextSyncVersion(version)
								await result(store.put({ id, entry: next.get(id) ?? null, version, dirty: true }))
							}
						},
						'readwrite'
					)
					void sync()
					return { status: 'restored' as const, importedCount: backup.watchEntries.length }
				})
			},
		},
		appInfo: { get: () => api(async () => ({ version: '0.2.1', catalogVersion: CATALOG_VERSION, storage: 'IndexedDB' as const })) },
		sync: {
			status: () => api(status),
			run: () => api(sync),
			setEnabled: enabled =>
				api(async () => {
					localStorage.setItem('marathon-sync-enabled', String(enabled))
					syncState.enabled = enabled
					if (enabled) void sync()
					return status()
				}),
		},
		posters: {
			status: () => api(async () => posterStatus()),
			saveCredential: unavailable,
			clearCredential: unavailable,
			startSync: unavailable,
			cancelSync: unavailable,
			chooseCustom: movieId => {
				const selected = chooseFile('image/jpeg,image/png')
				return api(async () => {
					if (!CATALOG.some(movie => movie.id === movieId)) throw new Error('작품을 찾을 수 없어요.')
					const file = await selected
					if (!file) return { status: 'cancelled' as const }
					if (!['image/jpeg', 'image/png'].includes(file.type) || file.size > 10 * 1024 * 1024) throw new Error('10MB 이하의 JPG 또는 PNG를 선택해 주세요.')
					const bitmap = await createImageBitmap(file)
					try {
						if (bitmap.width * bitmap.height > 24_000_000) throw new Error('이미지가 너무 큽니다. 2,400만 화소 이하로 선택해 주세요.')
						const canvas = document.createElement('canvas')
						const ratio = Math.min(1, 500 / bitmap.width, 750 / bitmap.height)
						canvas.width = Math.round(bitmap.width * ratio)
						canvas.height = Math.round(bitmap.height * ratio)
						canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
						let dataUrl = canvas.toDataURL('image/jpeg', 0.85)
						if (dataUrl.length > (MAX_POSTER_BYTES * 4) / 3) dataUrl = canvas.toDataURL('image/jpeg', 0.65)
						posterBytes(dataUrl)
						await changePoster(movieId, dataUrl)
						return { status: 'saved' as const }
					} finally {
						bitmap.close()
					}
				})
			},
			useAutomatic: movieId =>
				api(async () => {
					if (!CATALOG.some(movie => movie.id === movieId)) throw new Error('작품을 찾을 수 없어요.')
					await changePoster(movieId)
				}),
		},
	} satisfies MarvelMarathonAPI
	window.addEventListener('online', () => void sync())
	document.addEventListener('visibilitychange', () => {
		if (!document.hidden) void sync()
	})
	setInterval(() => {
		if (!document.hidden) void sync()
	}, 15000)
	void sync()
}
