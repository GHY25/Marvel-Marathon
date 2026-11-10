import { CATALOG } from './catalog'
import { DomainError, validateEntryId } from './validation'

export const INITIAL_POSTER_VERSION = '0000000000000:00000000-0000-4000-8000-000000000001'
export const MAX_POSTER_BYTES = 512 * 1024
export interface PosterRecord {
	movieId: string
	source: 'tmdb' | 'custom'
	version: string
	deleted: boolean
}
export const posterKey = (record: Pick<PosterRecord, 'movieId' | 'source'>) => `${record.movieId}/${record.source}`
export function validatePosterRecords(raw: unknown): PosterRecord[] {
	if (!Array.isArray(raw) || raw.length > CATALOG.length * 2) throw new DomainError('INVALID_INPUT', '포스터 목록이 올바르지 않습니다.')
	const seen = new Set<string>()
	return raw.map(item => {
		if (!item || !CATALOG.some(movie => movie.id === item.movieId) || !['tmdb', 'custom'].includes(item.source) || typeof item.deleted !== 'boolean' || typeof item.version !== 'string' || !/^\d{13}:[0-9a-f-]{36}$/.test(item.version)) throw new DomainError('INVALID_INPUT', '포스터 정보가 올바르지 않습니다.')
		validateEntryId(item.version.slice(14))
		const record: PosterRecord = { movieId: item.movieId, source: item.source, version: item.version, deleted: item.deleted }
		if (seen.has(posterKey(record))) throw new DomainError('INVALID_INPUT', '중복된 포스터 정보입니다.')
		seen.add(posterKey(record))
		return record
	})
}
export function validatePosterBytes(bytes: Uint8Array): Uint8Array {
	if (bytes.length < 4 || bytes.length > MAX_POSTER_BYTES || bytes[0] !== 255 || bytes[1] !== 216 || bytes[2] !== 255 || bytes[bytes.length - 2] !== 255 || bytes[bytes.length - 1] !== 217) throw new DomainError('INVALID_INPUT', '512KB 이하의 JPEG 포스터가 필요합니다.')
	return bytes
}
export interface PosterSyncStore {
	list(pendingOnly?: boolean): Promise<PosterRecord[]> | PosterRecord[]
	read(record: PosterRecord): Promise<Uint8Array | undefined> | Uint8Array | undefined
	merge(record: PosterRecord, bytes?: Uint8Array): Promise<void> | void
}
export type PosterRequest = (path: string, init?: RequestInit) => Promise<Response>

/** Exchange metadata first; transfer only changed images, keeping local copies offline. */
export async function synchronizePosters(store: PosterSyncStore, request: PosterRequest) {
	const list = async () => {
		const response = await request('/api/posters')
		if (!response.ok) throw new Error('Poster connection unavailable')
		return validatePosterRecords(((await response.json()) as { posters: unknown }).posters)
	}
	const remote = new Map((await list()).map(record => [posterKey(record), record]))
	let uploaded = false
	for (const record of await store.list(true)) {
		if ((remote.get(posterKey(record))?.version ?? '') >= record.version) continue
		const bytes = record.deleted ? undefined : await store.read(record)
		if (!record.deleted && !bytes) {
			if ((await store.list()).some(local => posterKey(local) === posterKey(record) && local.version > record.version)) continue
			throw new Error('Poster unavailable')
		}
		const response = await request(`/api/posters/${posterKey(record)}`, { method: record.deleted ? 'DELETE' : 'PUT', headers: { 'X-Poster-Version': record.version, 'Content-Type': 'image/jpeg' }, body: bytes ? new Uint8Array(validatePosterBytes(bytes)).buffer : undefined })
		if (!response.ok) throw new Error('Poster upload failed')
		uploaded = true
	}
	const incoming = uploaded ? await list() : [...remote.values()]
	const locals = new Map((await store.list()).map(record => [posterKey(record), record]))
	for (const record of incoming) {
		const local = locals.get(posterKey(record))
		if (local && local.version > record.version) continue
		let bytes: Uint8Array | undefined
		if (!record.deleted && (!local || local.version !== record.version || !(await store.read(local)))) {
			const response = await request(`/api/posters/${posterKey(record)}?version=${encodeURIComponent(record.version)}`)
			if (!response.ok || !response.headers.get('content-type')?.startsWith('image/jpeg')) throw new Error('Poster download failed')
			bytes = validatePosterBytes(new Uint8Array(await response.arrayBuffer()))
		}
		await store.merge(record, bytes)
	}
}
