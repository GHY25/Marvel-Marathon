import type { Movie } from '../../shared/types'
import { MEDIA_LABELS, type MediaFilter as Filter } from '../../shared/media'
import '../../styles/Media.css'

export function MediaFilter({ value, onChange, titles }: { value: Filter; onChange(value: Filter): void; titles: Movie[] }) {
	return (
		<div className="media-tabs" aria-label="작품 유형">
			{(['all', 'movie', 'series', 'special'] as const).map(type => (
				<button type="button" key={type} aria-pressed={value === type} className={value === type ? 'active' : ''} onClick={() => onChange(type)}>
					{MEDIA_LABELS[type]} <span>{titles.filter(title => type === 'all' || title.mediaType === type).length}</span>
				</button>
			))}
		</div>
	)
}
