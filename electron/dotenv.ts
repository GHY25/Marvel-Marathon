import fs from 'node:fs'
import path from 'node:path'

declare global {
	namespace NodeJS {
		interface ProcessEnv {
			NODE_ENV: 'development' | 'test' | 'production'
			readonly VITE_DEV_SERVER_URL: string
			APP_ROOT: string
			VITE_PUBLIC: string
			LOG_ENABLED?: string
			LOG_FILE?: string
			LOG_CONSOLE?: string
			SCREEN_CENTER?: string
			ELECTRON_MENU_ENABLED?: string
		}

		interface Process {
			electronApp: import('node:child_process').ChildProcess
		}
	}

	interface ImportMeta {
		/** shims Vite */
		env: Record<string, unknown>
	}

	interface ElectronLoggerConfig {
		enabled: boolean
		file: boolean
		console: boolean
	}
}

export function parseDotEnv(content: string): Record<string, string> {
	const out: Record<string, string> = {}
	for (const line of content.split(/\r?\n/)) {
		const trimmed = line.trim()
		if (!trimmed || trimmed.startsWith('#')) continue
		const eq = trimmed.indexOf('=')
		if (eq === -1) continue
		const key = trimmed.slice(0, eq).trim()
		let value = trimmed.slice(eq + 1).trim()
		if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
			value = value.slice(1, -1)
		}
		out[key] = value
	}
	return out
}

export function readDotEnvFile(appRoot: string): Record<string, string> {
	const envPath = path.join(appRoot, '.env')
	if (!fs.existsSync(envPath)) return {}
	try {
		return parseDotEnv(fs.readFileSync(envPath, 'utf-8'))
	} catch {
		return {}
	}
}

export function parseEnvBoolean(value: string | undefined, defaultValue: boolean): boolean {
	if (value === undefined || value === '') return defaultValue
	const v = value.trim().toLowerCase()
	if (v === '1' || v === 'true' || v === 'yes') return true
	if (v === '0' || v === 'false' || v === 'no') return false
	return defaultValue
}

export function pickString(...vals: (string | undefined)[]): string | undefined {
	for (const v of vals) {
		if (v !== undefined && v !== '') return v
	}
	return undefined
}
