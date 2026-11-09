import type { MediaType, Movie } from './types'

export type MediaFilter = MediaType | 'all'
export const MEDIA_LABELS: Record<MediaFilter, string> = { all: '전체', movie: '영화', series: '드라마·시리즈', special: '스페셜' }
export function mediaLabel(title: Movie): string {
	return title.mediaType === 'series' ? `시리즈 · 시즌 ${title.seasonNumber}` : MEDIA_LABELS[title.mediaType]
}
export function filterMedia(titles: readonly Movie[], type: MediaFilter): Movie[] {
	return titles.filter(title => type === 'all' || title.mediaType === type)
}
