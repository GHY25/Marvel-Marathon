import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { BackupData } from '../../src/shared/types'
import { DomainError, localToday, MAX_BACKUP_BYTES, validateBackup } from '../../src/shared/validation'
import type { MarathonRepository } from '../db/repository'

export { MAX_BACKUP_BYTES }
export interface BackupDialogs {
	chooseSave(defaultName: string): Promise<string | null>
	chooseOpen(): Promise<string | null>
	confirmReplace(importedCount: number, currentCount: number): Promise<boolean>
}

export function readBackupFile(filename: string): BackupData {
	const fd = fs.openSync(filename, 'r')
	try {
		const info = fs.fstatSync(fd)
		if (!info.isFile() || info.size > MAX_BACKUP_BYTES) throw new Error('size')
		// Bound the read as well as the stat, even if another process grows the selected file.
		const buffer = Buffer.alloc(MAX_BACKUP_BYTES + 1)
		let length = 0
		while (length < buffer.length) {
			const count = fs.readSync(fd, buffer, length, buffer.length - length, null)
			if (!count) break
			length += count
		}
		if (length > MAX_BACKUP_BYTES) throw new Error('size')
		return validateBackup(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, length))))
	} catch {
		throw new DomainError('BACKUP_ERROR', '지원하지 않거나 손상된 백업 파일입니다. 기존 기록은 변경되지 않았습니다.')
	} finally {
		fs.closeSync(fd)
	}
}

export function writeBackupFile(filename: string, backup: BackupData): void {
	const serialized = JSON.stringify(validateBackup(backup), null, 2)
	if (Buffer.byteLength(serialized, 'utf8') > MAX_BACKUP_BYTES) {
		throw new DomainError('BACKUP_ERROR', '백업 크기가 10MB를 넘습니다. 기존 백업 파일은 변경하지 않았습니다.')
	}
	const temporary = `${filename}.${randomUUID()}.tmp`
	let fd: number | undefined
	try {
		fd = fs.openSync(temporary, 'wx', 0o600)
		fs.writeFileSync(fd, serialized, 'utf8')
		fs.fsyncSync(fd)
		fs.closeSync(fd)
		fd = undefined
		fs.renameSync(temporary, filename)
	} finally {
		if (fd !== undefined) fs.closeSync(fd)
		if (fs.existsSync(temporary)) fs.unlinkSync(temporary)
	}
}

export class BackupService {
	private busy = false
	constructor(
		private readonly repository: MarathonRepository,
		private readonly recoveryDirectory: string,
		private readonly dialogs: BackupDialogs
	) {}

	private async exclusive<T>(operation: () => Promise<T>): Promise<T> {
		if (this.busy) throw new DomainError('BACKUP_ERROR', '진행 중인 백업 작업을 먼저 마쳐 주세요.')
		this.busy = true
		try {
			return await operation()
		} catch (error) {
			if (error instanceof DomainError) throw error
			throw new DomainError('BACKUP_ERROR', '백업 작업을 완료하지 못했어요. 파일과 저장 공간을 확인해 주세요.')
		} finally {
			this.busy = false
		}
	}

	export() {
		return this.exclusive(async () => {
			const filename = await this.dialogs.chooseSave(`marvel-marathon-backup-${localToday()}.json`)
			if (!filename) return { status: 'cancelled' as const }
			const backup = this.repository.createBackup()
			writeBackupFile(filename, backup)
			return { status: 'saved' as const, exportedCount: backup.watchEntries.length }
		})
	}

	import() {
		return this.exclusive(async () => {
			const filename = await this.dialogs.chooseOpen()
			if (!filename) return { status: 'cancelled' as const }
			const backup = readBackupFile(filename)
			const confirmed = await this.dialogs.confirmReplace(backup.watchEntries.length, this.repository.listEntries().length)
			if (!confirmed) return { status: 'cancelled' as const }
			// No await from snapshot through commit: writes cannot interleave on the main thread.
			fs.mkdirSync(this.recoveryDirectory, { recursive: true })
			const recovery = path.join(this.recoveryDirectory, `before-restore-${Date.now()}-${randomUUID()}.json`)
			writeBackupFile(recovery, this.repository.createBackup())
			const importedCount = this.repository.restoreBackup(backup)
			return { status: 'restored' as const, importedCount }
		})
	}
}
