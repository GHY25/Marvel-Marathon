import fs from 'node:fs/promises'
import type { MarathonRepository } from '../db/repository'
import type { Movie, PosterStatus } from '../../src/shared/types'
import { DomainError } from '../../src/shared/validation'
import { fetchTmdbPoster, PosterFetchError, validateCredential } from './tmdb-client'

export interface PosterDependencies {
	encrypt(value: string): Buffer
	decrypt(value: Buffer): string
	normalize(bytes: Buffer): Buffer
	chooseFile(): Promise<string | null>
	fetchPoster?: typeof fetchTmdbPoster
}

/** SQLite owns both cached JPEGs and encrypted credentials; backups remain watch-entry only. */
export class PosterService {
	private credential = ''
	private credentialProblem = false
	private controller?: AbortController
	private state = { running: false, cancelled: false, total: 0, completed: 0, saved: 0, skipped: 0, currentTitle: '', errors: [] as PosterStatus['errors'], revision: 0 }

	constructor(
		private readonly repository: MarathonRepository,
		private readonly deps: PosterDependencies
	) {
		const encrypted = repository.getPosterCredential()
		if (encrypted) {
			try {
				this.credential = validateCredential(deps.decrypt(encrypted))
			} catch {
				this.credentialProblem = true
			}
		}
	}

	status(): PosterStatus {
		return { ...this.state, errors: [...this.state.errors], hasCredential: !!this.credential, credentialProblem: this.credentialProblem }
	}
	listMovies(): Movie[] {
		return this.repository.listMovies().map(movie => ({ ...movie, poster: this.repository.getPoster(movie.id) }))
	}
	private movie(raw: unknown): Movie {
		const movie = typeof raw === 'string' && this.repository.listMovies().find(item => item.id === raw)
		if (!movie) throw new DomainError('INVALID_INPUT', '영화를 찾을 수 없습니다.')
		return movie
	}
	private requireIdle() {
		if (this.state.running) throw new DomainError('INVALID_INPUT', '포스터 가져오기가 끝난 뒤 다시 시도해 주세요.')
	}
	saveCredential(raw: unknown): PosterStatus {
		this.requireIdle()
		const value = validateCredential(raw)
		this.repository.setPosterCredential(this.deps.encrypt(value))
		this.credential = value
		this.credentialProblem = false
		return this.status()
	}
	clearCredential(): PosterStatus {
		this.requireIdle()
		this.repository.setPosterCredential(null)
		this.credential = ''
		this.credentialProblem = false
		return this.status()
	}
	startSync(rawRefresh: unknown): PosterStatus {
		this.requireIdle()
		if (typeof rawRefresh !== 'boolean') throw new DomainError('INVALID_INPUT', '잘못된 포스터 요청입니다.')
		if (!this.credential) throw new DomainError('INVALID_INPUT', '먼저 TMDB API Key 또는 Read Access Token을 저장해 주세요.')
		const movies = this.repository.listMovies()
		this.state = { running: true, cancelled: false, total: movies.length, completed: 0, saved: 0, skipped: 0, currentTitle: '', errors: [], revision: this.state.revision }
		this.controller = new AbortController()
		void this.run(movies, rawRefresh, this.controller.signal)
		return this.status()
	}
	cancelSync(): PosterStatus {
		if (this.state.running) {
			this.state.cancelled = true
			this.controller?.abort()
		}
		return this.status()
	}
	private async run(movies: Movie[], refresh: boolean, signal: AbortSignal) {
		try {
			for (const movie of movies) {
				if (signal.aborted) break
				this.state.currentTitle = movie.titleEn
				try {
					if (this.repository.hasPoster(movie.id, 'custom') || (!refresh && this.repository.hasPoster(movie.id, 'tmdb'))) this.state.skipped++
					else {
						const bytes = await (this.deps.fetchPoster ?? fetchTmdbPoster)(movie, this.credential, signal)
						if (signal.aborted) break
						this.repository.savePoster(movie.id, 'tmdb', this.deps.normalize(bytes))
						this.state.saved++
						this.state.revision++
					}
				} catch (error) {
					if (signal.aborted) break
					this.state.errors.push({ title: movie.titleEn, message: error instanceof DomainError ? error.message : '포스터를 저장하지 못했어요. 저장 공간을 확인해 주세요.' })
					const fatal = error instanceof PosterFetchError ? error.stopBatch : !(error instanceof DomainError && error.code === 'INVALID_INPUT')
					if (fatal) {
						this.state.completed++
						break
					}
				}
				this.state.completed++
			}
		} finally {
			this.state.running = false
			this.state.currentTitle = ''
			this.controller = undefined
		}
	}
	async chooseCustom(rawId: unknown): Promise<{ status: 'saved' | 'cancelled' }> {
		const movie = this.movie(rawId)
		const filename = await this.deps.chooseFile()
		if (!filename) return { status: 'cancelled' }
		const file = await fs.open(filename, 'r')
		let bytes: Buffer
		try {
			const stat = await file.stat()
			if (!stat.isFile() || stat.size > 10 * 1024 * 1024) throw new DomainError('INVALID_INPUT', '10MB 이하의 JPG 또는 PNG 파일을 선택해 주세요.')
			const buffer = Buffer.alloc(10 * 1024 * 1024 + 1)
			const { bytesRead } = await file.read(buffer, 0, buffer.length, 0)
			if (bytesRead > 10 * 1024 * 1024) throw new DomainError('INVALID_INPUT', '10MB 이하의 JPG 또는 PNG 파일을 선택해 주세요.')
			bytes = buffer.subarray(0, bytesRead)
		} finally {
			await file.close()
		}
		this.repository.savePoster(movie.id, 'custom', this.deps.normalize(bytes))
		this.state.revision++
		return { status: 'saved' }
	}
	useAutomatic(rawId: unknown): void {
		this.repository.removeCustomPoster(this.movie(rawId).id)
		this.state.revision++
	}
}
