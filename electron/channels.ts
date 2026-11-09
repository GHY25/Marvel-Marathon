/** This dependency-free map is safe to bundle into the sandboxed preload. */
export const IPC_CHANNELS = {
	OPEN_EXTERNAL: 'app:open-external',
	MOVIES_LIST: 'marathon:movies:list',
	ENTRIES_LIST: 'marathon:entries:list',
	ENTRIES_CREATE: 'marathon:entries:create',
	ENTRIES_UPDATE: 'marathon:entries:update',
	ENTRIES_DELETE: 'marathon:entries:delete',
	BACKUP_EXPORT: 'marathon:backup:export',
	BACKUP_IMPORT: 'marathon:backup:import',
	APP_INFO: 'marathon:app-info',
	POSTERS_STATUS: 'marathon:posters:status',
	POSTERS_CREDENTIAL_SAVE: 'marathon:posters:credential-save',
	POSTERS_CREDENTIAL_CLEAR: 'marathon:posters:credential-clear',
	POSTERS_START: 'marathon:posters:start',
	POSTERS_CANCEL: 'marathon:posters:cancel',
	POSTERS_CUSTOM: 'marathon:posters:custom',
	POSTERS_AUTOMATIC: 'marathon:posters:automatic',
} as const
