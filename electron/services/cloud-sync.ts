import fs from 'node:fs'
import path from 'node:path'
import { safeStorage } from 'electron'
import { CLOUD_ORIGIN, validateSyncRecords, type SyncStatus } from '../../src/shared/cloud'
import { DomainError } from '../../src/shared/validation'
import type { MarathonRepository } from '../db/repository'
import { synchronizePosters } from '../../src/shared/poster-sync'

export class CloudSync {
	private running = false
	private lastSyncedAt: string | null = null
	private error: string | null = null
	private timer?: ReturnType<typeof setInterval>
	private readonly filename: string
	constructor(
		private readonly repository: MarathonRepository,
		directory: string
	) {
		this.filename = path.join(directory, 'cloud-connection.json')
	}
	private config(): { enabled: boolean; credential: string } | null {
		if (!fs.existsSync(this.filename)) return null
		const value = JSON.parse(fs.readFileSync(this.filename, 'utf8'))
		if (value.origin !== CLOUD_ORIGIN || typeof value.credential !== 'string') throw new Error('Invalid connection')
		return value
	}
	status(): SyncStatus {
		let enabled = false
		try {
			enabled = this.config()?.enabled ?? false
		} catch {
			this.error = 'PC 연결 정보를 읽지 못했어요. 연결 설정을 다시 설치해 주세요.'
		}
		return { enabled, running: this.running, pending: this.repository.getSyncRecords(true).length + this.repository.getPosterRecords(true).length, lastSyncedAt: this.lastSyncedAt, error: this.error, webUrl: CLOUD_ORIGIN }
	}
	setEnabled(enabled: boolean): SyncStatus {
		if (typeof enabled !== 'boolean') throw new DomainError('INVALID_INPUT', '동기화 설정을 확인해 주세요.')
		const config = this.config()
		if (!config) throw new DomainError('NOT_FOUND', '이 PC의 연결 설정이 필요합니다. 제공된 PC 연결 설정을 먼저 실행해 주세요.')
		const temporary = `${this.filename}.tmp`
		fs.writeFileSync(temporary, JSON.stringify({ ...config, origin: CLOUD_ORIGIN, enabled }))
		fs.renameSync(temporary, this.filename)
		if (enabled) void this.run()
		return this.status()
	}
	start() {
		this.timer = setInterval(() => void this.run(), 15000)
		void this.run()
	}
	stop() {
		clearInterval(this.timer)
	}
	async run(): Promise<SyncStatus> {
		if (this.running) return this.status()
		this.running = true
		try {
			const config = this.config()
			if (!config?.enabled) return this.status()
			const token = safeStorage.decryptString(Buffer.from(config.credential, 'base64'))
			const request = async (method: string, body?: unknown) => {
				const response = await fetch(`${CLOUD_ORIGIN}/api/sync`, { method, redirect: 'error', signal: AbortSignal.timeout(15000), headers: { 'OAI-Sites-Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
				if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) throw new Error('Sync unavailable')
				return response.json()
			}
			const pending = this.repository.getSyncRecords(true)
			for (let offset = 0; offset < pending.length; offset += 100) await request('POST', { records: pending.slice(offset, offset + 100) })
			const remote = (await request('GET')) as { records: unknown }
			this.repository.mergeSyncRecords(validateSyncRecords(remote.records))
			await synchronizePosters({ list: pending => this.repository.getPosterRecords(pending), read: record => this.repository.readPosterRecord(record), merge: (record, bytes) => this.repository.mergePosterRecord(record, bytes) }, (path, init) => fetch(`${CLOUD_ORIGIN}${path}`, { ...init, redirect: 'error', signal: AbortSignal.timeout(20000), headers: { ...init?.headers, 'OAI-Sites-Authorization': `Bearer ${token}` } }))
			this.lastSyncedAt = new Date().toISOString()
			this.error = null
		} catch {
			this.error = '클라우드에 연결하지 못했어요. 기록은 이 PC에 보관되며 연결되면 다시 동기화합니다.'
		} finally {
			this.running = false
		}
		return this.status()
	}
}
