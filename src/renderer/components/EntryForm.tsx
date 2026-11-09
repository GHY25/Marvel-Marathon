import { useState, type FormEvent } from 'react'
import { Star } from 'lucide-react'
import type { Movie, WatchEntry } from '../../shared/types'
import { localToday } from '../../shared/validation'
import type { MarathonData } from '../hooks/useMarathonData'
import { Modal } from './Common'

export default function EntryForm({ movie, entry, data, onClose }: { movie: Movie; entry?: WatchEntry; data: MarathonData; onClose: () => void }) {
	const [watchDate, setWatchDate] = useState(entry?.watchDate ?? localToday())
	const [ratingTicks, setRatingTicks] = useState<number | null>(entry?.ratingTicks ?? null)
	const [review, setReview] = useState(entry?.review ?? '')
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState('')
	async function save(event: FormEvent) {
		event.preventDefault()
		if (busy) return
		setBusy(true)
		setError('')
		try {
			const input = { watchDate, ratingTicks, review }
			if (entry) await data.update(entry.id, input)
			else await data.create({ ...input, movieId: movie.id })
			onClose()
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : '기록을 저장하지 못했어요. 다시 시도해 주세요.')
		} finally {
			setBusy(false)
		}
	}
	return (
		<Modal title={entry ? '감상 기록 수정' : '감상 기록 추가'} onClose={onClose} busy={busy}>
			<p className="form-movie-title">{movie.titleEn}</p>
			<form onSubmit={save}>
				<label className="field-label" htmlFor="watch-date">
					시청 날짜
				</label>
				<input id="watch-date" type="date" required max={localToday()} value={watchDate} onChange={event => setWatchDate(event.target.value)} disabled={busy} />
				<div className="field-heading">
					<span className="field-label" id="rating-label">
						나의 별점 <span>선택</span>
					</span>
					<button type="button" className="text-button" onClick={() => setRatingTicks(null)} disabled={busy || ratingTicks === null}>
						평점 지우기
					</button>
				</div>
				<div className="rating-picker">
					<div className="rating-stars" role="group" aria-labelledby="rating-label" aria-describedby="rating-help">
						{[2, 4, 6, 8, 10].map(value => {
							const next = ratingTicks === value - 1 ? value : value - 1
							return (
								<button type="button" className="rating-star" key={value} data-star={value / 2} aria-label={`${value / 2}번째 별, ${(next / 2).toFixed(1)}점으로 설정`} aria-pressed={ratingTicks === value || ratingTicks === value - 1} disabled={busy} onClick={() => setRatingTicks(current => (current === value - 1 ? value : value - 1))}>
									<span className="rating-star-shape" aria-hidden="true">
										<Star size={32} />
										<span className="star-fill" style={{ width: `${Math.min(100, Math.max(0, (((ratingTicks ?? 0) - value + 2) / 2) * 100))}%` }}>
											<Star size={32} fill="currentColor" />
										</span>
									</span>
								</button>
							)
						})}
					</div>
					<output className="rating-value" aria-live="polite" aria-atomic="true" data-testid="selected-rating">
						{ratingTicks === null ? '평점 미등록' : `${(ratingTicks / 2).toFixed(1)} / 5`}
					</output>
				</div>
				<p className="form-hint" id="rating-help">
					별을 한 번 누르면 반 개, 같은 별을 한 번 더 누르면 한 개가 채워져요.
				</p>
				<div className="field-heading">
					<label className="field-label" htmlFor="review">
						한 줄 감상평 <span>선택</span>
					</label>
					<span className="input-counter">{review.length} / 500</span>
				</div>
				<textarea id="review" rows={4} maxLength={500} placeholder="엔딩 크레딧이 올라간 뒤, 어떤 마음이 남았나요?" value={review} onChange={event => setReview(event.target.value)} disabled={busy} />
				<p className="form-hint">별점과 감상평 없이 시청한 날짜만 남겨도 괜찮아요.</p>
				{error && (
					<p className="inline-error" role="alert">
						{error}
					</p>
				)}
				<div className="modal-actions">
					<button type="button" className="button secondary" disabled={busy} onClick={onClose}>
						취소
					</button>
					<button type="submit" className="button primary" disabled={busy}>
						{busy ? '저장 중…' : '기록 저장'}
					</button>
				</div>
			</form>
		</Modal>
	)
}
