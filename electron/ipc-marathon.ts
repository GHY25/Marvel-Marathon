import { app, dialog, ipcMain, safeStorage, type BrowserWindow, type IpcMainInvokeEvent } from 'electron'
import path from 'node:path'
import type { ApiResult } from '../src/shared/types'
import { CATALOG_VERSION } from '../src/shared/catalog'
import { DomainError } from '../src/shared/validation'
import { IPC_CHANNELS } from './channels'
import type { MarathonRepository } from './db/repository'
import { BackupService } from './services/backup-service'
import { assertTrustedSender } from './security'
import { PosterService } from './services/poster-service'
import { normalizePoster } from './services/poster-image'
import { CloudSync } from './services/cloud-sync'

export function registerMarathonHandlers(repository: MarathonRepository, getWindow: () => BrowserWindow | null, expectedUrl: string): void {
	const cloud = new CloudSync(repository, app.getPath('userData'))
	cloud.start()
	app.once('before-quit', () => cloud.stop())
	const requireWindow = () => {
		const win = getWindow()
		if (!win || win.isDestroyed()) throw new DomainError('PERMISSION_DENIED', '앱 창을 찾을 수 없습니다.')
		return win
	}
	const posters = new PosterService(repository, {
		encrypt(value) {
			if (!safeStorage.isEncryptionAvailable() || (process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text')) {
				throw new DomainError('STORAGE_ERROR', '이 기기의 보안 저장소를 사용할 수 없어 API 키를 저장하지 않았어요. 직접 이미지 선택은 계속 사용할 수 있어요.')
			}
			return safeStorage.encryptString(value)
		},
		decrypt: value => safeStorage.decryptString(value),
		normalize: normalizePoster,
		async chooseFile() {
			const result = await dialog.showOpenDialog(requireWindow(), { title: '내 포스터 선택', properties: ['openFile'], filters: [{ name: '포스터 이미지 (10MB 이하)', extensions: ['jpg', 'jpeg', 'png'] }] })
			return result.canceled ? null : (result.filePaths[0] ?? null)
		},
	})
	app.once('before-quit', () => posters.cancelSync())
	const backup = new BackupService(repository, path.join(app.getPath('userData'), 'recovery-backups'), {
		async chooseSave(defaultName) {
			const result = await dialog.showSaveDialog(requireWindow(), {
				title: '감상 기록 백업',
				defaultPath: defaultName,
				filters: [{ name: 'JSON 백업', extensions: ['json'] }],
			})
			return result.canceled ? null : (result.filePath ?? null)
		},
		async chooseOpen() {
			const result = await dialog.showOpenDialog(requireWindow(), {
				title: '감상 기록 복원',
				properties: ['openFile'],
				filters: [{ name: 'JSON 백업', extensions: ['json'] }],
			})
			return result.canceled ? null : (result.filePaths[0] ?? null)
		},
		async confirmReplace(importedCount, currentCount) {
			const result = await dialog.showMessageBox(requireWindow(), {
				type: 'warning',
				title: '백업으로 감상 기록을 교체할까요?',
				message: '현재 감상 기록을 선택한 백업으로 교체합니다.',
				detail: `현재 ${currentCount}건 → 백업 ${importedCount}건\n계속하면 현재 기록의 복구용 백업을 먼저 저장합니다.`,
				buttons: ['취소', '기록 교체'],
				defaultId: 0,
				cancelId: 0,
				noLink: true,
			})
			return result.response === 1
		},
	})
	const handle = <T>(channel: string, operation: (...args: unknown[]) => T | Promise<T>) => {
		ipcMain.handle(channel, async (event: IpcMainInvokeEvent, ...args: unknown[]): Promise<ApiResult<T>> => {
			try {
				assertTrustedSender(event, getWindow()?.webContents, expectedUrl)
				return { ok: true, data: await operation(...args) }
			} catch (error) {
				if (error instanceof DomainError) return { ok: false, error: { code: error.code, message: error.message } }
				// Never send SQL errors, absolute paths, reviews or stacks across the IPC boundary.
				return { ok: false, error: { code: 'STORAGE_ERROR', message: '기록을 처리하지 못했어요. 저장 공간을 확인하고 다시 시도해 주세요.' } }
			}
		})
	}
	handle(IPC_CHANNELS.MOVIES_LIST, () => posters.listMovies())
	handle(IPC_CHANNELS.SYNC_STATUS, () => cloud.status())
	handle(IPC_CHANNELS.SYNC_RUN, () => cloud.run())
	handle(IPC_CHANNELS.SYNC_ENABLED, enabled => cloud.setEnabled(enabled as boolean))
	handle(IPC_CHANNELS.POSTERS_STATUS, () => posters.status())
	handle(IPC_CHANNELS.POSTERS_CREDENTIAL_SAVE, value => posters.saveCredential(value))
	handle(IPC_CHANNELS.POSTERS_CREDENTIAL_CLEAR, () => posters.clearCredential())
	handle(IPC_CHANNELS.POSTERS_START, refresh => posters.startSync(refresh))
	handle(IPC_CHANNELS.POSTERS_CANCEL, () => posters.cancelSync())
	handle(IPC_CHANNELS.POSTERS_CUSTOM, movieId => posters.chooseCustom(movieId))
	handle(IPC_CHANNELS.POSTERS_AUTOMATIC, movieId => posters.useAutomatic(movieId))
	handle(IPC_CHANNELS.ENTRIES_LIST, () => repository.listEntries())
	handle(IPC_CHANNELS.ENTRIES_CREATE, input => repository.createEntry(input))
	handle(IPC_CHANNELS.ENTRIES_UPDATE, (id, input) => repository.updateEntry(id, input))
	handle(IPC_CHANNELS.ENTRIES_DELETE, id => repository.deleteEntry(id))
	handle(IPC_CHANNELS.BACKUP_EXPORT, () => backup.export())
	handle(IPC_CHANNELS.BACKUP_IMPORT, () => backup.import())
	handle(IPC_CHANNELS.APP_INFO, () => ({ version: app.getVersion(), catalogVersion: CATALOG_VERSION, storage: 'SQLite' as const }))
}
