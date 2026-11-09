import { app, BrowserWindow, dialog, Menu, screen } from 'electron'
import { fileURLToPath, pathToFileURL } from 'node:url'
import fs from 'node:fs'
import path from 'node:path'
import { parseEnvBoolean, pickString, readDotEnvFile } from './dotenv'
import { AppLogger } from './logger'
import { openExternalUrl, registerIpcHandlers } from './ipc'
import { registerMarathonHandlers } from './ipc-marathon'
import { MarathonRepository } from './db/repository'
import { isAllowedRendererPermission, isTrustedRendererUrl } from './security'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

app.setName('Marvel Marathon')
app.setAppUserModelId('dev.personal.marvelmarathon')
// Explicit opt-in isolates automated Electron runs from the user's real library.
const testDataDirectory = process.env.MARATHON_TEST_MODE === '1' ? process.env.MARATHON_USER_DATA_DIR : undefined
let userDataSetupFailed = false
try {
	const userDataDirectory = testDataDirectory || path.join(app.getPath('appData'), 'Marvel Marathon')
	fs.mkdirSync(userDataDirectory, { recursive: true })
	app.setPath('userData', userDataDirectory)
} catch {
	// Do not continue with Electron's default path if the intended storage is unavailable.
	userDataSetupFailed = true
}

process.env.APP_ROOT = path.join(__dirname, '..', '..')

/** `.env` / `process.env.SCREEN_CENTER`: center initial position when windowed and smaller than the display work area. */
const SCREEN_CENTER = parseEnvBoolean(pickString(process.env.SCREEN_CENTER, readDotEnvFile(process.env.APP_ROOT).SCREEN_CENTER), false)

/** If `false`, clears the top/application menu. Default is `true`. */
const ELECTRON_MENU_ENABLED = parseEnvBoolean(pickString(process.env.ELECTRON_MENU_ENABLED, readDotEnvFile(process.env.APP_ROOT).ELECTRON_MENU_ENABLED), true)

// electron-vite 5+: dev URL is ELECTRON_RENDERER_URL; keep VITE_DEV_SERVER_URL as fallback
export const VITE_DEV_SERVER_URL = process.env['ELECTRON_RENDERER_URL'] || process.env['VITE_DEV_SERVER_URL']
const RUN_MODE = VITE_DEV_SERVER_URL ? 'development' : 'production'
const IS_DEVELOPMENT = RUN_MODE === 'development'
const SESSION_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

let win: BrowserWindow | null
let repository: MarathonRepository | undefined
const expectedRendererUrl = VITE_DEV_SERVER_URL || pathToFileURL(path.join(RENDERER_DIST, 'index.html')).href
const WINDOW_STATE_FILE = `window-state.${RUN_MODE}.json`
const DEFAULT_WINDOW_SIZE: WindowState = { width: 1200, height: 800 }
const logger = new AppLogger({
	appRoot: process.env.APP_ROOT,
	isDevelopment: IS_DEVELOPMENT,
	isPackaged: app.isPackaged,
	sessionId: SESSION_ID,
})

type WindowState = {
	width: number
	height: number
	x?: number
	y?: number
	offsetX?: number
	offsetY?: number
	workAreaWidth?: number
	workAreaHeight?: number
	isMaximized?: boolean
	displayId?: number
}

type WindowLaunchDecision = {
	state: WindowState
	mode: 'restored' | 'primary-fallback'
	reason: 'saved-display-missing' | 'offscreen-bounds' | 'saved-position-missing' | 'normal-restore' | 'normalized-to-display' | 'restored-raw-same-display'
	requestedDisplayId?: number
	appliedDisplayId?: number
}

function getWindowStatePath() {
	return path.join(app.getPath('userData'), WINDOW_STATE_FILE)
}

function readWindowState(): { normalized: WindowState | null; raw: Partial<WindowState> | null } {
	try {
		const filePath = getWindowStatePath()
		if (!fs.existsSync(filePath)) return { normalized: null, raw: null }

		const raw = fs.readFileSync(filePath, 'utf-8')
		const parsed = JSON.parse(raw) as Partial<WindowState>
		if (typeof parsed.width !== 'number' || typeof parsed.height !== 'number') {
			return { normalized: null, raw: parsed }
		}

		return {
			normalized: {
				width: Math.max(760, Math.floor(parsed.width)),
				height: Math.max(600, Math.floor(parsed.height)),
				x: typeof parsed.x === 'number' ? Math.floor(parsed.x) : undefined,
				y: typeof parsed.y === 'number' ? Math.floor(parsed.y) : undefined,
				offsetX: typeof parsed.offsetX === 'number' ? Math.floor(parsed.offsetX) : undefined,
				offsetY: typeof parsed.offsetY === 'number' ? Math.floor(parsed.offsetY) : undefined,
				workAreaWidth: typeof parsed.workAreaWidth === 'number' ? Math.floor(parsed.workAreaWidth) : undefined,
				workAreaHeight: typeof parsed.workAreaHeight === 'number' ? Math.floor(parsed.workAreaHeight) : undefined,
				isMaximized: typeof parsed.isMaximized === 'boolean' ? parsed.isMaximized : false,
				displayId: typeof parsed.displayId === 'number' ? parsed.displayId : undefined,
			},
			raw: parsed,
		}
	} catch {
		return { normalized: null, raw: null }
	}
}

function isVisibleOnAnyDisplay(bounds: Electron.Rectangle) {
	return screen.getAllDisplays().some(display => {
		const area = display.workArea
		return bounds.x + bounds.width > area.x && bounds.x < area.x + area.width && bounds.y + bounds.height > area.y && bounds.y < area.y + area.height
	})
}

function getCenteredBoundsInDisplay(width: number, height: number, display: Electron.Display) {
	const area = display.workArea
	return {
		x: Math.floor(area.x + (area.width - width) / 2),
		y: Math.floor(area.y + (area.height - height) / 2),
	}
}

function clamp(value: number, min: number, max: number) {
	return Math.min(Math.max(value, min), max)
}

function normalizeStateToDisplay(state: WindowState, display: Electron.Display): WindowState {
	const area = display.workArea
	const width = Math.max(state.width, 760)
	const height = Math.max(state.height, 600)
	const defaultCentered = getCenteredBoundsInDisplay(width, height, display)
	const minX = area.x
	const maxX = area.x + area.width - width
	const minY = area.y
	const maxY = area.y + area.height - height
	const x = state.x === undefined ? defaultCentered.x : width > area.width ? state.x : clamp(state.x, minX, maxX)
	const y = state.y === undefined ? defaultCentered.y : height > area.height ? state.y : clamp(state.y, minY, maxY)
	const offsetX = x - area.x
	const offsetY = y - area.y

	return {
		...state,
		width,
		height,
		x,
		y,
		offsetX,
		offsetY,
		workAreaWidth: area.width,
		workAreaHeight: area.height,
		displayId: display.id,
	}
}

function resolveDisplayForWindow(state: WindowState): Electron.Display {
	if (state.displayId !== undefined) {
		const found = screen.getAllDisplays().find(d => d.id === state.displayId)
		if (found) return found
	}
	return screen.getDisplayMatching({
		x: state.x ?? 0,
		y: state.y ?? 0,
		width: state.width,
		height: state.height,
	})
}

/**
 * Centers x/y within the display work area only when not fullscreen/maximized
 * and the window is smaller than the current display's work area.
 */
function applyScreenCenterIfNeeded(state: WindowState): WindowState {
	if (!SCREEN_CENTER) return state
	if (state.isMaximized) return state
	const w = state.width
	const h = state.height
	if (w <= 0 || h <= 0) return state

	const display = resolveDisplayForWindow(state)
	const area = display.workArea
	if (w >= area.width || h >= area.height) return state

	const centered = getCenteredBoundsInDisplay(w, h, display)
	return {
		...state,
		x: centered.x,
		y: centered.y,
		offsetX: centered.x - area.x,
		offsetY: centered.y - area.y,
		workAreaWidth: area.width,
		workAreaHeight: area.height,
		displayId: display.id,
	}
}

function applyRelativePositionToDisplay(state: WindowState, display: Electron.Display): WindowState {
	if (state.offsetX === undefined || state.offsetY === undefined) {
		return state
	}
	const area = display.workArea
	return {
		...state,
		x: area.x + state.offsetX,
		y: area.y + state.offsetY,
	}
}

function getSafeWindowState(): WindowLaunchDecision {
	const savedState = readWindowState()
	const saved = savedState.normalized
	const fallback: WindowState = {
		...DEFAULT_WINDOW_SIZE,
		...saved,
	}
	const primaryDisplay = screen.getPrimaryDisplay()

	if (saved?.displayId !== undefined) {
		const savedDisplay = screen.getAllDisplays().find(display => display.id === saved.displayId)
		if (!savedDisplay) {
			const normalized = normalizeStateToDisplay(fallback, primaryDisplay)
			return {
				state: normalized,
				mode: 'primary-fallback',
				reason: 'saved-display-missing',
				requestedDisplayId: saved.displayId,
				appliedDisplayId: primaryDisplay.id,
			}
		}

		const relativeAdjusted = applyRelativePositionToDisplay(fallback, savedDisplay)
		const restoredRaw: WindowState = {
			...relativeAdjusted,
			displayId: savedDisplay.id,
		}
		return {
			state: restoredRaw,
			mode: 'restored',
			reason: 'restored-raw-same-display',
			requestedDisplayId: saved.displayId,
			appliedDisplayId: savedDisplay.id,
		}
	}

	if (saved?.x === undefined || saved.y === undefined) {
		const normalized = normalizeStateToDisplay(fallback, primaryDisplay)
		return {
			state: normalized,
			mode: 'restored',
			reason: 'saved-position-missing',
			requestedDisplayId: saved?.displayId,
			appliedDisplayId: normalized.displayId,
		}
	}

	const bounds: Electron.Rectangle = {
		x: saved.x,
		y: saved.y,
		width: fallback.width,
		height: fallback.height,
	}

	if (!isVisibleOnAnyDisplay(bounds)) {
		const normalized = normalizeStateToDisplay(fallback, primaryDisplay)
		return {
			state: normalized,
			mode: 'primary-fallback',
			reason: 'offscreen-bounds',
			requestedDisplayId: saved.displayId,
			appliedDisplayId: primaryDisplay.id,
		}
	}

	const matchedDisplay = screen.getDisplayMatching(bounds)
	const normalized = normalizeStateToDisplay(fallback, matchedDisplay)
	const isChanged = normalized.width !== fallback.width || normalized.height !== fallback.height || normalized.x !== fallback.x || normalized.y !== fallback.y
	return {
		state: normalized,
		mode: 'restored',
		reason: isChanged ? 'normalized-to-display' : 'normal-restore',
		requestedDisplayId: saved?.displayId,
		appliedDisplayId: normalized.displayId,
	}
}

function saveWindowState(targetWindow: BrowserWindow): WindowState | null {
	if (targetWindow.isDestroyed()) return null
	const isMaximized = targetWindow.isMaximized()
	// Fullscreen is temporary; reopening the app must restore its normal window size.
	const bounds = targetWindow.getNormalBounds()
	const display = screen.getDisplayMatching(bounds)
	const displayId = display.id
	const area = display.workArea
	const data: WindowState = {
		x: bounds.x,
		y: bounds.y,
		offsetX: bounds.x - area.x,
		offsetY: bounds.y - area.y,
		workAreaWidth: area.width,
		workAreaHeight: area.height,
		width: bounds.width,
		height: bounds.height,
		isMaximized,
		displayId,
	}
	fs.writeFileSync(getWindowStatePath(), JSON.stringify(data, null, 2), 'utf-8')
	return data
}

function createWindow() {
	logger.log('STARTUP', 'Phase: Main window create')
	const launchDecision = getSafeWindowState()
	const beforeCenter = launchDecision.state
	const safeWindowState = applyScreenCenterIfNeeded(beforeCenter)
	if (SCREEN_CENTER && !safeWindowState.isMaximized && (safeWindowState.x !== beforeCenter.x || safeWindowState.y !== beforeCenter.y)) {
		logger.info('WINDOW', 'SCREEN_CENTER: centered window on work area', {
			displayId: safeWindowState.displayId,
			before: `${beforeCenter.width}x${beforeCenter.height}@(${beforeCenter.x ?? '?'},${beforeCenter.y ?? '?'})`,
			after: `${safeWindowState.width}x${safeWindowState.height}@(${safeWindowState.x ?? '?'},${safeWindowState.y ?? '?'})`,
		})
	}
	const restoredBounds: Electron.Rectangle = {
		x: safeWindowState.x ?? 0,
		y: safeWindowState.y ?? 0,
		width: safeWindowState.width,
		height: safeWindowState.height,
	}

	win = new BrowserWindow({
		show: false,
		title: 'Marvel Marathon',
		backgroundColor: '#0b0f17',
		minWidth: 760,
		minHeight: 600,
		width: safeWindowState.width,
		height: safeWindowState.height,
		x: safeWindowState.x,
		y: safeWindowState.y,
		icon: path.join(process.env.VITE_PUBLIC, 'app-icon.png'),
		webPreferences: {
			contextIsolation: true,
			nodeIntegration: false,
			preload: path.join(__dirname, '..', 'preload', 'preload.cjs'),
			sandbox: true,
		},
	})
	win.webContents.on('will-navigate', (event, url) => {
		if (!isTrustedRendererUrl(url, expectedRendererUrl)) event.preventDefault()
	})
	win.webContents.on('will-attach-webview', event => event.preventDefault())
	win.webContents.session.setPermissionRequestHandler((contents, permission, callback, details) => callback(isAllowedRendererPermission(contents, win?.webContents, permission, details, expectedRendererUrl)))
	win.webContents.session.setPermissionCheckHandler((contents, permission, _requestingOrigin, details) => isAllowedRendererPermission(contents, win?.webContents, permission, details, expectedRendererUrl))

	win.webContents.setWindowOpenHandler(({ url }) => {
		void openExternalUrl(url).catch((error: unknown) => {
			logger.info('WARN', 'Blocked external window open', {
				url,
				error: error instanceof Error ? error.message : String(error),
			})
		})
		return { action: 'deny' }
	})

	if (VITE_DEV_SERVER_URL) {
		logger.info('WINDOW', 'Loading URL', { url: VITE_DEV_SERVER_URL })
		win.loadURL(VITE_DEV_SERVER_URL)
		if (process.env.OPEN_DEVTOOLS === 'true') win.webContents.openDevTools({ mode: 'right' })
	} else {
		logger.info('WINDOW', 'Loading file', {
			path: path.join(RENDERER_DIST, 'index.html'),
		})
		// win.loadFile('dist/index.html')
		win.loadFile(path.join(RENDERER_DIST, 'index.html'))
	}

	win.once('ready-to-show', () => {
		if (safeWindowState.isMaximized) {
			logger.info('WINDOW', 'Apply ready-to-show maximize')
			win?.maximize()
			win?.show()
			logger.info('WINDOW', 'Window show after maximize')
			return
		}

		// Re-apply saved bounds before first paint; then show.
		win?.setBounds(restoredBounds, false)
		win?.show()
		logger.info('WINDOW', 'Window show after bounds applied')
	})

	win.on('close', () => {
		try {
			saveWindowState(win!)
			logger.info('SHUTDOWN', 'Window state saved')
		} catch {
			logger.info('WARN', 'Window state could not be saved')
		}
	})
}

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
	logger.info('STARTUP', 'Phase: window-all-closed')
	if (process.platform !== 'darwin') {
		logger.log('SHUTDOWN', 'Application quitting')
		logger.shutdown()
		app.quit()
		win = null
	}
})

app.on('activate', () => {
	// On OS X it's common to re-create a window in the app when the
	// dock icon is clicked and there are no other windows open.
	if (repository && BrowserWindow.getAllWindows().length === 0) {
		createWindow()
	}
})

app.on('will-quit', () => {
	repository?.close()
	repository = undefined
})

function reportStartupError() {
	try {
		dialog.showErrorBox('Marvel Marathon을 시작할 수 없습니다', '로컬 데이터 저장소를 열지 못했습니다. 기존 기록은 초기화하지 않았습니다. 저장 공간과 파일 권한을 확인한 뒤 다시 실행해 주세요.')
	} finally {
		app.quit()
	}
}

const hasInstanceLock = !userDataSetupFailed && app.requestSingleInstanceLock()
if (userDataSetupFailed) void app.whenReady().then(reportStartupError)
else if (!hasInstanceLock) app.quit()
else {
	app.on('second-instance', () => {
		if (win?.isMinimized()) win.restore()
		win?.focus()
	})

	app.whenReady()
		.then(() => {
			logger.init()
			if (!ELECTRON_MENU_ENABLED) {
				Menu.setApplicationMenu(null)
				logger.info('SYSTEM', 'Application menu disabled (ELECTRON_MENU_ENABLED=false)')
			}
			logger.log('STARTUP', 'Phase: IPC handlers register')
			const filename = app.isPackaged ? 'marvel-marathon.sqlite3' : 'marvel-marathon.development.sqlite3'
			repository = new MarathonRepository(path.join(app.getPath('userData'), filename))
			registerIpcHandlers(() => win?.webContents, expectedRendererUrl)
			registerMarathonHandlers(repository, () => win, expectedRendererUrl)
			createWindow()
		})
		.catch(reportStartupError)
}
