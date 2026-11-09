import type { Movie } from '../../src/shared/types'
import { DomainError } from '../../src/shared/validation'

export class PosterFetchError extends DomainError {
	constructor(
		message: string,
		readonly stopBatch = false
	) {
		super('INVALID_INPUT', message)
	}
}

class MissingPosterError extends PosterFetchError {}

export function validateCredential(raw: unknown): string {
	if (typeof raw !== 'string') throw new DomainError('INVALID_INPUT', 'TMDB API Key 또는 Read Access Token을 입력해 주세요.')
	const value = raw.trim().replace(/^Bearer\s+/i, '')
	if (!/^[a-f\d]{32}$/i.test(value) && !/^[A-Za-z0-9._-]{40,4096}$/.test(value)) {
		throw new DomainError('INVALID_INPUT', 'API Key 또는 API Read Access Token 전체를 복사해 주세요.')
	}
	return value
}

/** Never accept a URL from renderer or API data; only a single raster asset name. */
export function posterImageUrl(raw: unknown): string {
	if (typeof raw !== 'string' || !/^\/[A-Za-z0-9_-]{1,200}\.(jpg|png)$/i.test(raw)) throw new PosterFetchError('사용할 수 있는 포스터 경로가 없습니다.')
	return `https://image.tmdb.org/t/p/w500${raw}`
}

const normalizeTitle = (title: string) =>
	title
		.normalize('NFKD')
		.toLowerCase()
		.replace(/[^\p{L}\p{N}]/gu, '')
const object = (value: unknown): Record<string, unknown> => (value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {})

// Verified TMDB series identity: https://www.themoviedb.org/tv/91363
// Live search also returns unrelated shows named "What If" in 2021.
const verifiedSeriesIds: Record<string, number> = {
	'mcu-tv-what-if-s01': 91363,
	'mcu-tv-what-if-s02': 91363,
	'mcu-tv-what-if-s03': 91363,
}

export function matchMovie(raw: unknown, movie: Movie): { id: number } {
	const results = object(raw).results
	if (!Array.isArray(results)) throw new PosterFetchError('TMDB 영화 응답을 읽지 못했어요.')
	const television = movie.mediaType === 'series'
	const expectedTitle = television ? movie.seriesTitle! : movie.titleEn
	const expectedYear = television ? movie.seriesStartYear! : movie.releaseYear
	const verifiedId = television ? verifiedSeriesIds[movie.id] : undefined
	const matches = results.map(object).filter(item => {
		const date = television ? item.first_air_date : item.release_date
		const titles = television ? [item.name, item.original_name] : [item.title, item.original_title]
		return Number.isSafeInteger(item.id) && Number(item.id) > 0 && (verifiedId === undefined || item.id === verifiedId) && item.adult !== true && typeof date === 'string' && date.slice(0, 4) === String(expectedYear) && titles.some(title => typeof title === 'string' && normalizeTitle(title) === normalizeTitle(expectedTitle))
	})
	if (matches.length !== 1) throw new PosterFetchError('제목과 최초 공개 연도가 일치하는 작품을 확정하지 못했어요. 직접 이미지를 선택할 수 있어요.')
	return { id: Number(matches[0].id) }
}

export function choosePoster(raw: unknown): string {
	const posters = object(raw).posters
	if (!Array.isArray(posters)) throw new PosterFetchError('TMDB 포스터 응답을 읽지 못했어요.')
	const languageOrder = ['en', null]
	const choices = posters
		.map(object)
		.filter(item => {
			try {
				posterImageUrl(item.file_path)
			} catch {
				return false
			}
			return languageOrder.includes(item.iso_639_1 as string | null) && typeof item.width === 'number' && typeof item.height === 'number' && item.height > item.width
		})
		.sort((a, b) => languageOrder.indexOf(a.iso_639_1 as string | null) - languageOrder.indexOf(b.iso_639_1 as string | null) || Number(b.vote_average || 0) - Number(a.vote_average || 0) || Number(b.width) - Number(a.width))
	// A search result's default poster has no reliable language metadata and can be Korean.
	if (!choices.length) throw new MissingPosterError('영어 또는 언어 표시 없는 포스터를 찾지 못했어요. 기존 커버는 유지됩니다.')
	return posterImageUrl(choices[0].file_path)
}

async function boundedRequest(url: URL | string, headers: Record<string, string>, limit: number, signal: AbortSignal): Promise<Buffer> {
	try {
		const response = await fetch(url, { headers, signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]), redirect: 'error' })
		if (response.status === 401 || response.status === 403) throw new PosterFetchError('TMDB 인증에 실패했어요. API Key 또는 Read Access Token을 확인해 주세요.', true)
		if (response.status === 429) throw new PosterFetchError('TMDB 요청 한도에 도달했어요. 잠시 후 다시 시도해 주세요.', true)
		if (!response.ok) throw new PosterFetchError('TMDB에서 포스터를 받지 못했어요. 잠시 후 다시 시도해 주세요.', response.status >= 500)
		if (!response.body || Number(response.headers.get('content-length')) > limit) throw new PosterFetchError('포스터 응답이 너무 큽니다.')
		const reader = response.body.getReader()
		const chunks: Uint8Array[] = []
		let size = 0
		try {
			while (true) {
				const { done, value } = await reader.read()
				if (done) break
				size += value.length
				if (size > limit) throw new PosterFetchError('포스터 응답이 너무 큽니다.')
				chunks.push(value)
			}
		} finally {
			await reader.cancel().catch(() => undefined)
		}
		return Buffer.concat(chunks)
	} catch (error) {
		if (signal.aborted || error instanceof PosterFetchError) throw error
		// Fetch errors may contain the request URL (and API key). Never expose/log them.
		throw new PosterFetchError('TMDB에 연결하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.', true)
	}
}

export async function fetchTmdbPoster(movie: Movie, credential: string, signal: AbortSignal): Promise<Buffer> {
	async function api(endpoint: string, params: Record<string, string>) {
		const url = new URL(`https://api.themoviedb.org/3/${endpoint}`)
		for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
		const headers: Record<string, string> = { Accept: 'application/json' }
		if (/^[a-f\d]{32}$/i.test(credential)) url.searchParams.set('api_key', credential)
		else headers.Authorization = `Bearer ${credential}`
		const bytes = await boundedRequest(url, headers, 2 * 1024 * 1024, signal)
		try {
			return JSON.parse(bytes.toString('utf8')) as unknown
		} catch {
			throw new PosterFetchError('TMDB 응답을 읽지 못했어요.')
		}
	}
	const television = movie.mediaType === 'series'
	const matched = matchMovie(
		await api(television ? 'search/tv' : 'search/movie', {
			query: television ? movie.seriesTitle! : movie.titleEn,
			[television ? 'first_air_date_year' : 'primary_release_year']: String(television ? movie.seriesStartYear : movie.releaseYear),
			language: 'en-US',
			include_adult: 'false',
		}),
		movie
	)
	const languages = { language: 'en', include_image_language: 'en,null' }
	let imageUrl: string
	if (television) {
		const images = await api(`tv/${matched.id}/season/${movie.seasonNumber}/images`, languages)
		try {
			imageUrl = choosePoster(images)
		} catch (error) {
			if (!(error instanceof MissingPosterError)) throw error
			// Season artwork can be absent. Only fall back to language-verified series artwork.
			imageUrl = choosePoster(await api(`tv/${matched.id}/images`, languages))
		}
	} else imageUrl = choosePoster(await api(`movie/${matched.id}/images`, languages))
	// CDN receives no API credentials. Redirects are not followed.
	return boundedRequest(imageUrl, { Accept: 'image/jpeg,image/png' }, 10 * 1024 * 1024, signal)
}
