import { ipcRenderer, contextBridge } from 'electron'
import { IPC_CHANNELS } from './channels'
import type { MarvelMarathonAPI } from '../src/shared/types'

// --------- Expose some API to the Renderer process ---------
const api: MarvelMarathonAPI = {
	sync: {
		status: () => ipcRenderer.invoke(IPC_CHANNELS.SYNC_STATUS),
		run: () => ipcRenderer.invoke(IPC_CHANNELS.SYNC_RUN),
		setEnabled: enabled => ipcRenderer.invoke(IPC_CHANNELS.SYNC_ENABLED, enabled),
	},
	openExternal: (url: string) => ipcRenderer.invoke(IPC_CHANNELS.OPEN_EXTERNAL, url),
	movies: { list: () => ipcRenderer.invoke(IPC_CHANNELS.MOVIES_LIST) },
	entries: {
		list: () => ipcRenderer.invoke(IPC_CHANNELS.ENTRIES_LIST),
		create: input => ipcRenderer.invoke(IPC_CHANNELS.ENTRIES_CREATE, input),
		update: (id, input) => ipcRenderer.invoke(IPC_CHANNELS.ENTRIES_UPDATE, id, input),
		delete: id => ipcRenderer.invoke(IPC_CHANNELS.ENTRIES_DELETE, id),
	},
	backup: {
		export: () => ipcRenderer.invoke(IPC_CHANNELS.BACKUP_EXPORT),
		import: () => ipcRenderer.invoke(IPC_CHANNELS.BACKUP_IMPORT),
	},
	appInfo: { get: () => ipcRenderer.invoke(IPC_CHANNELS.APP_INFO) },
	posters: {
		status: () => ipcRenderer.invoke(IPC_CHANNELS.POSTERS_STATUS),
		saveCredential: value => ipcRenderer.invoke(IPC_CHANNELS.POSTERS_CREDENTIAL_SAVE, value),
		clearCredential: () => ipcRenderer.invoke(IPC_CHANNELS.POSTERS_CREDENTIAL_CLEAR),
		startSync: refresh => ipcRenderer.invoke(IPC_CHANNELS.POSTERS_START, refresh),
		cancelSync: () => ipcRenderer.invoke(IPC_CHANNELS.POSTERS_CANCEL),
		chooseCustom: movieId => ipcRenderer.invoke(IPC_CHANNELS.POSTERS_CUSTOM, movieId),
		useAutomatic: movieId => ipcRenderer.invoke(IPC_CHANNELS.POSTERS_AUTOMATIC, movieId),
	},
}
contextBridge.exposeInMainWorld('electronAPI', api)
