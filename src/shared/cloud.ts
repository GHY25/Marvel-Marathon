import type { WatchEntry } from './types'
import { CATALOG_VERSION } from './catalog'
import { DomainError, validateBackup, validateEntryId } from './validation'

export const CLOUD_ORIGIN = 'https://marvel-marathon-bada.blond-skunk-9580.chatgpt.site'
export interface SyncRecord {
	id: string
	version: string
	entry: WatchEntry | null
}
export interface SyncStatus {
	enabled: boolean
	running: boolean
	pending: number
	lastSyncedAt: string | null
	error: string | null
	webUrl: string
}

/** Monotonic across received changes; UUID breaks simultaneous device edits deterministically. */
export function nextSyncVersion(previous = '', now = Date.now()): string {
	const time = Math.max(now, Number(previous.slice(0, 13)) + 1 || 0)
	return `${String(time).padStart(13, '0')}:${crypto.randomUUID()}`
}

export function validateSyncRecords(raw: unknown): SyncRecord[] {
	if (!Array.isArray(raw) || raw.length > 20000) throw new DomainError('INVALID_INPUT', '동기화 기록 형식이 올바르지 않습니다.')
	const seen = new Set<string>()
	return raw.map(item => {
		if (!item || typeof item !== 'object') throw new DomainError('INVALID_INPUT', '동기화 기록 형식이 올바르지 않습니다.')
		const id = validateEntryId(item.id)
		if (seen.has(id) || typeof item.version !== 'string' || !/^\d{13}:[0-9a-f-]{36}$/.test(item.version)) throw new DomainError('INVALID_INPUT', '동기화 기록 버전이 올바르지 않습니다.')
		validateEntryId(item.version.slice(14))
		seen.add(id)
		if (item.entry === null) return { id, version: item.version, entry: null }
		const backup = validateBackup({ format: 'marvel-marathon-backup', formatVersion: 1, catalogVersion: CATALOG_VERSION, exportedAtUtc: new Date().toISOString(), watchEntries: [item.entry] }, '9999-12-31')
		const entry = backup.watchEntries[0]
		if (entry.id !== id) throw new DomainError('INVALID_INPUT', '동기화 기록의 ID가 일치하지 않습니다.')
		return { id, version: item.version, entry }
	})
}
