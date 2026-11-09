import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { MarathonRepository } from '../electron/db/repository'
import { BackupService, MAX_BACKUP_BYTES, readBackupFile, writeBackupFile } from '../electron/services/backup-service'
import type { BackupDialogs } from '../electron/services/backup-service'

let directory: string
let filename: string
let repository: MarathonRepository
const input = { movieId: 'mcu-001', watchDate: '2024-02-29', ratingTicks: 8, review: ' 첫 정주행 ' }
beforeEach(() => {
	directory = fs.mkdtempSync(path.join(os.tmpdir(), 'marathon-storage-test-'))
	filename = path.join(directory, 'test.sqlite3')
	repository = new MarathonRepository(filename)
})
afterEach(() => {
	repository.close()
	if (path.dirname(path.resolve(directory)) === path.resolve(os.tmpdir()) && path.basename(directory).startsWith('marathon-storage-test-')) {
		fs.rmSync(directory, { recursive: true, force: true })
	}
})

describe('durable SQLite repository', () => {
	it('migrates the previous v1 database without changing watch history', () => {
		const entry = repository.createEntry(input)
		repository.close()
		const old = new DatabaseSync(filename)
		old.exec('DROP TABLE poster_assets; DROP TABLE private_settings; PRAGMA user_version = 1;')
		old.close()
		repository = new MarathonRepository(filename)
		expect(repository.listEntries()).toEqual([entry])
		repository.savePoster('mcu-001', 'custom', Buffer.from('normalized-image'))
		expect(repository.getPoster('mcu-001')?.source).toBe('custom')
	})
	it('seeds once and preserves user entries across connection restart', () => {
		expect(repository.listMovies()).toHaveLength(38)
		expect(repository.listEntries()).toEqual([])
		const first = repository.createEntry(input)
		const second = repository.createEntry({ ...input, ratingTicks: null, review: '' })
		repository.close()
		repository = new MarathonRepository(filename)
		expect(repository.listMovies()).toHaveLength(38)
		expect(repository.listEntries()).toEqual(expect.arrayContaining([first, second]))
		expect(first.review).toBe('첫 정주행')
		const inspect = new DatabaseSync(filename)
		expect(inspect.prepare('PRAGMA user_version').get()?.user_version).toBe(2)
		expect(inspect.prepare('PRAGMA journal_mode').get()?.journal_mode).toBe('wal')
		inspect.close()
	})

	it('updates only the requested entry, preserving creation date and movie identity', () => {
		const first = repository.createEntry(input)
		const second = repository.createEntry(input)
		const updated = repository.updateEntry(first.id, { watchDate: '2024-03-01', ratingTicks: 9, review: '다시 봐도 좋다' })
		expect(updated.createdAtUtc).toBe(first.createdAtUtc)
		expect(updated.movieId).toBe(first.movieId)
		expect(repository.listEntries()).toEqual([updated, second])
		expect(repository.deleteEntry(first.id)).toEqual({ deletedId: first.id })
		expect(repository.listEntries()).toEqual([second])
		repository.deleteEntry(second.id)
		expect(repository.listEntries()).toEqual([])
	})

	it('rejects invalid create/update/delete without changing persisted records', () => {
		const entry = repository.createEntry(input)
		for (const mutation of [() => repository.createEntry({ ...input, movieId: 'missing' }), () => repository.createEntry({ ...input, watchDate: '2026-02-30' }), () => repository.createEntry({ ...input, ratingTicks: '9' }), () => repository.updateEntry(entry.id, { ...input, ratingTicks: 3.5 }), () => repository.updateEntry(randomUUID(), input), () => repository.deleteEntry(randomUUID()), () => repository.deleteEntry('bad-id')]) expect(mutation).toThrow()
		expect(repository.listEntries()).toEqual([entry])
	})

	it('round trips the complete backup including UUIDs, timestamps and optional ratings', () => {
		repository.createEntry(input)
		repository.createEntry({ ...input, movieId: 'mcu-004', ratingTicks: null, review: '줄바꿈\n기록' })
		const snapshot = repository.createBackup()
		const destination = path.join(directory, 'backup.json')
		writeBackupFile(destination, snapshot)
		repository.deleteEntry(snapshot.watchEntries[0].id)
		expect(repository.restoreBackup(readBackupFile(destination))).toBe(2)
		expect(repository.listEntries()).toEqual(snapshot.watchEntries)
	})

	it('rejects malformed restores before deleting any existing data', () => {
		const entry = repository.createEntry(input)
		const snapshot = repository.createBackup()
		const bad = [null, {}, { ...snapshot, formatVersion: 2 }, { ...snapshot, watchEntries: [entry, entry] }, { ...snapshot, watchEntries: [{ ...entry, movieId: 'mcu-999' }] }, { ...snapshot, watchEntries: [{ ...entry, ratingTicks: 11 }] }]
		for (const backup of bad) {
			expect(() => repository.restoreBackup(backup)).toThrow()
			expect(repository.listEntries()).toEqual([entry])
		}
	})

	it('rolls back a SQL failure after DELETE during restore', () => {
		const first = repository.createEntry(input)
		const snapshot = repository.createBackup()
		const external = new DatabaseSync(filename)
		external.exec("CREATE TRIGGER fail_restore BEFORE INSERT ON watch_entries BEGIN SELECT RAISE(ABORT, 'injected failure'); END;")
		external.close()
		expect(() => repository.restoreBackup(snapshot)).toThrow()
		expect(repository.listEntries()).toEqual([first])
	})

	it('refuses a newer schema without resetting user data', () => {
		const entry = repository.createEntry(input)
		const external = new DatabaseSync(filename)
		external.exec('PRAGMA user_version = 3')
		external.close()
		expect(() => new MarathonRepository(filename)).toThrow('더 새로운 앱')
		expect(repository.listEntries()).toEqual([entry])
	})
})

describe('backup dialog workflow', () => {
	it('rejects invalid UTF-8 instead of replacing the review text', () => {
		repository.createEntry(input)
		const file = path.join(directory, 'invalid-utf8.json')
		const json = JSON.stringify(repository.createBackup())
		const marker = json.indexOf('첫 정주행')
		fs.writeFileSync(file, Buffer.concat([Buffer.from(json.slice(0, marker)), Buffer.from([0xc3, 0x28]), Buffer.from(json.slice(marker + '첫 정주행'.length))]))
		expect(() => readBackupFile(file)).toThrow('손상된 백업')
	})

	it('refuses unimportable exports before changing an existing backup file', () => {
		const entry = repository.createEntry(input)
		const file = path.join(directory, 'previous.json')
		fs.writeFileSync(file, 'preserve me')
		const entries = Array.from({ length: 6500 }, () => ({ ...entry, id: randomUUID(), review: '한'.repeat(500) }))
		expect(() => writeBackupFile(file, { ...repository.createBackup(), watchEntries: entries })).toThrow('10MB')
		expect(fs.readFileSync(file, 'utf8')).toBe('preserve me')
		expect(() => writeBackupFile(file, { ...repository.createBackup(), watchEntries: [entry, entry] })).toThrow('손상된 백업')
		expect(fs.readFileSync(file, 'utf8')).toBe('preserve me')
	})

	function dialogs(): BackupDialogs {
		return { chooseSave: vi.fn(async () => null), chooseOpen: vi.fn(async () => null), confirmReplace: vi.fn(async () => false) }
	}

	it('does not mutate on native dialog or confirmation cancellation', async () => {
		const entry = repository.createEntry(input)
		const fakeDialogs = dialogs()
		const service = new BackupService(repository, path.join(directory, 'recovery'), fakeDialogs)
		expect(await service.export()).toEqual({ status: 'cancelled' })
		expect(await service.import()).toEqual({ status: 'cancelled' })
		const backupPath = path.join(directory, 'backup.json')
		writeBackupFile(backupPath, { ...repository.createBackup(), watchEntries: [] })
		vi.mocked(fakeDialogs.chooseOpen).mockResolvedValue(backupPath)
		expect(await service.import()).toEqual({ status: 'cancelled' })
		expect(repository.listEntries()).toEqual([entry])
		expect(fs.existsSync(path.join(directory, 'recovery'))).toBe(false)
	})

	it('creates a recovery copy before replacing and reports real export/import counts', async () => {
		repository.createEntry(input)
		const fakeDialogs = dialogs()
		const backupPath = path.join(directory, 'backup.json')
		vi.mocked(fakeDialogs.chooseSave).mockResolvedValue(backupPath)
		vi.mocked(fakeDialogs.chooseOpen).mockResolvedValue(backupPath)
		vi.mocked(fakeDialogs.confirmReplace).mockResolvedValue(true)
		const recovery = path.join(directory, 'recovery')
		const service = new BackupService(repository, recovery, fakeDialogs)
		expect(await service.export()).toEqual({ status: 'saved', exportedCount: 1 })
		repository.createEntry({ ...input, movieId: 'mcu-004' })
		expect(await service.import()).toEqual({ status: 'restored', importedCount: 1 })
		expect(repository.listEntries()).toHaveLength(1)
		const recoveryFiles = fs.readdirSync(recovery)
		expect(recoveryFiles).toHaveLength(1)
		expect(readBackupFile(path.join(recovery, recoveryFiles[0])).watchEntries).toHaveLength(2)
	})

	it('rejects broken and oversized files without confirmation or database change', async () => {
		const entry = repository.createEntry(input)
		const badPath = path.join(directory, 'bad.json')
		fs.writeFileSync(badPath, '{broken JSON')
		const fakeDialogs = dialogs()
		vi.mocked(fakeDialogs.chooseOpen).mockResolvedValue(badPath)
		const service = new BackupService(repository, path.join(directory, 'recovery'), fakeDialogs)
		await expect(service.import()).rejects.toThrow('손상된 백업')
		fs.writeFileSync(badPath, Buffer.alloc(MAX_BACKUP_BYTES + 1))
		await expect(service.import()).rejects.toThrow('손상된 백업')
		expect(fakeDialogs.confirmReplace).not.toHaveBeenCalled()
		expect(repository.listEntries()).toEqual([entry])
	})

	it('preserves records if writing the recovery copy fails', async () => {
		const entry = repository.createEntry(input)
		const backupPath = path.join(directory, 'empty.json')
		writeBackupFile(backupPath, { ...repository.createBackup(), watchEntries: [] })
		const notADirectory = path.join(directory, 'blocked')
		fs.writeFileSync(notADirectory, 'a file cannot become a directory')
		const fakeDialogs = dialogs()
		vi.mocked(fakeDialogs.chooseOpen).mockResolvedValue(backupPath)
		vi.mocked(fakeDialogs.confirmReplace).mockResolvedValue(true)
		const service = new BackupService(repository, notADirectory, fakeDialogs)
		await expect(service.import()).rejects.toThrow('완료하지 못했어요')
		expect(repository.listEntries()).toEqual([entry])
	})
})
