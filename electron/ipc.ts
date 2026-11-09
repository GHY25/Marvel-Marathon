import { ipcMain, shell, type WebContents } from 'electron'
import { IPC_CHANNELS } from './channels'
import { assertTrustedSender, isAllowedExternalUrl } from './security'

/** IPC channel names shared by renderer and preload (single source of truth). */
export { IPC_CHANNELS, isAllowedExternalUrl }

export async function openExternalUrl(raw: string): Promise<void> {
	if (!isAllowedExternalUrl(raw)) {
		throw new Error('open-external: only http(s) URLs are allowed')
	}
	await shell.openExternal(raw)
}

/** Registers IPC handlers in the main process (call once at startup). */
export function registerIpcHandlers(getContents: () => WebContents | undefined, expectedUrl: string): void {
	ipcMain.handle(IPC_CHANNELS.OPEN_EXTERNAL, async (event, raw: unknown) => {
		assertTrustedSender(event, getContents(), expectedUrl)
		if (typeof raw !== 'string' || raw.length === 0) {
			throw new Error('open-external: URL must be a non-empty string')
		}
		await openExternalUrl(raw)
	})
}
