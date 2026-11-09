import { CATALOG_VERSION, CATALOG } from './catalog'
import type { AppErrorCode, BackupData, CreateWatchEntryInput, UpdateWatchEntryInput, WatchEntry } from './types'

export class DomainError extends Error {
	readonly code: AppErrorCode

	constructor(code: AppErrorCode, message: string) {
		super(message)
		this.name = 'DomainError'
		this.code = code
	}
}

const movieIds = new Set(CATALOG.map(movie => movie.id))
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const invalidBackupMessage = '지원하지 않거나 손상된 백업 파일입니다. 기존 기록은 변경되지 않았습니다.'
export const MAX_BACKUP_BYTES = 10 * 1024 * 1024
export const MAX_BACKUP_ENTRIES = 20000

export function localToday(now = new Date()): string {
	return `${String(now.getFullYear()).padStart(4, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function object(input: unknown): Record<string, unknown> {
	if (!input || typeof input !== 'object' || Array.isArray(input)) {
		throw new DomainError('INVALID_INPUT', '입력 형식을 확인해 주세요.')
	}
	const prototype = Object.getPrototypeOf(input)
	if (prototype !== Object.prototype && prototype !== null) {
		throw new DomainError('INVALID_INPUT', '입력 형식을 확인해 주세요.')
	}
	return input as Record<string, unknown>
}

export function isValidCalendarDate(value: unknown): value is string {
	if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
	const [year, month, day] = value.split('-').map(Number)
	if (year < 1 || month < 1 || month > 12 || day < 1) return false
	const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
	return day <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]
}

function watchDate(value: unknown, today: string): string {
	if (!isValidCalendarDate(value)) throw new DomainError('INVALID_INPUT', '올바른 시청 날짜를 입력해 주세요.')
	if (value > today) throw new DomainError('INVALID_INPUT', '미래 날짜에는 감상 기록을 남길 수 없어요.')
	return value
}

function ratingTicks(value: unknown): number | null {
	if (value === null) return null
	if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 10) {
		throw new DomainError('INVALID_INPUT', '별점은 0.5점부터 5점까지 0.5점 단위로 선택해 주세요.')
	}
	return value
}

function review(value: unknown, trim: boolean): string {
	// SQLite encodes UTF-8. Reject isolated UTF-16 surrogates instead of silently
	// replacing a user's text when it crosses that boundary.
	if (typeof value !== 'string' || value.length > 500 || value.includes('\u0000') || /[\uD800-\uDFFF]/u.test(value)) {
		throw new DomainError('INVALID_INPUT', '감상평은 500자 이내의 텍스트로 입력해 주세요.')
	}
	return trim ? value.trim() : value
}

function movieId(value: unknown): string {
	if (typeof value !== 'string' || !movieIds.has(value)) throw new DomainError('INVALID_INPUT', '등록된 작품을 선택해 주세요.')
	return value
}

export function validateEntryId(input: unknown): string {
	if (typeof input !== 'string' || !uuidPattern.test(input)) throw new DomainError('INVALID_INPUT', '올바른 감상 기록을 선택해 주세요.')
	return input
}

function timestamp(value: unknown): string {
	if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) || !isValidCalendarDate(value.slice(0, 10))) throw new DomainError('INVALID_INPUT', '기록 시각 형식이 올바르지 않습니다.')
	const parsed = new Date(value)
	if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) throw new DomainError('INVALID_INPUT', '기록 시각 형식이 올바르지 않습니다.')
	return value
}

function entryFields(input: Record<string, unknown>, today: string, trim = true): UpdateWatchEntryInput {
	return { watchDate: watchDate(input.watchDate, today), ratingTicks: ratingTicks(input.ratingTicks), review: review(input.review, trim) }
}

export function validateCreateEntry(input: unknown, today = localToday()): CreateWatchEntryInput {
	const data = object(input)
	return { movieId: movieId(data.movieId), ...entryFields(data, today) }
}

export function validateUpdateEntry(input: unknown, today = localToday()): UpdateWatchEntryInput {
	return entryFields(object(input), today)
}

export function validateBackup(input: unknown, today = localToday()): BackupData {
	try {
		const data = object(input)
		if (data.format !== 'marvel-marathon-backup' || data.formatVersion !== 1 || typeof data.catalogVersion !== 'string' || !data.catalogVersion.startsWith('mcu-') || !isValidCalendarDate(data.catalogVersion.slice(4)) || data.catalogVersion > CATALOG_VERSION || !Array.isArray(data.watchEntries) || data.watchEntries.length > MAX_BACKUP_ENTRIES) {
			throw new DomainError('BACKUP_ERROR', invalidBackupMessage)
		}
		const exportedAtUtc = timestamp(data.exportedAtUtc)
		const ids = new Set<string>()
		const watchEntries = data.watchEntries.map((raw): WatchEntry => {
			const entry = object(raw)
			const id = validateEntryId(entry.id)
			if (ids.has(id)) throw new DomainError('BACKUP_ERROR', invalidBackupMessage)
			ids.add(id)
			const createdAtUtc = timestamp(entry.createdAtUtc)
			const updatedAtUtc = timestamp(entry.updatedAtUtc)
			if (updatedAtUtc < createdAtUtc) throw new DomainError('BACKUP_ERROR', invalidBackupMessage)
			return { id, movieId: movieId(entry.movieId), ...entryFields(entry, today, false), createdAtUtc, updatedAtUtc }
		})
		return { format: 'marvel-marathon-backup', formatVersion: 1, exportedAtUtc, catalogVersion: data.catalogVersion, watchEntries }
	} catch {
		throw new DomainError('BACKUP_ERROR', invalidBackupMessage)
	}
}
