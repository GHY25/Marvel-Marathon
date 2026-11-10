import { formatDate } from '../utils/format'
import { useState } from 'react'
import { ArrowLeft, ArrowUpRight, CalendarDays, Edit3, Plus, Search, SlidersHorizontal, Sparkles, Trash2, TrendingUp } from 'lucide-react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import type { MovieFilters, WatchEntry } from '../../shared/types'
import { filterMovies, getCurrentRating, getMovieEntries, getRatingChange } from '../../shared/statistics'
import type { MarathonData } from '../hooks/useMarathonData'
import { EmptyState, Modal, MovieCover, PageHeading, Rating, SectionTitle, WatchedBadge } from '../components/Common'
import EntryForm from '../components/EntryForm'
import { PosterPicker } from '../components/PosterControls'
import { MediaFilter } from '../components/MediaFilter'
import { mediaLabel, type MediaFilter as Filter } from '../../shared/media'

export function Movies({ data }: { data: MarathonData }) {
	const [search, setSearch] = useSearchParams()
	const query = search.get('q') ?? ''
	const phase = search.get('phase') ?? 'all'
	const status = search.get('status') ?? 'all'
	const type = (['movie', 'series', 'special'].includes(search.get('type') ?? '') ? search.get('type') : 'all') as Filter
	const filtered = filterMovies(data.movies, data.entries, { query, mediaType: type, phase: phase === 'all' ? 'all' : Number(phase), status: status as MovieFilters['status'] })
	function filter(key: string, value: string) {
		setSearch(
			current => {
				const updated = new URLSearchParams(current)
				if (!value || value === 'all') updated.delete(key)
				else updated.set(key, value)
				return updated
			},
			{ replace: true }
		)
	}
	return (
		<>
			<PageHeading eyebrow="THE MARATHON COLLECTION" title="영화와 시리즈, 하나의 우주" description="영화 한 편, 시리즈 한 시즌, 스페셜 한 편이 나의 우주에서 하나의 별이 됩니다." />
			<MediaFilter value={type} onChange={value => filter('type', value)} titles={data.movies} />
			<p className="footnote">영화는 개봉순, 디즈니+ 작품은 시즌 공개순으로 정렬됩니다. 시리즈의 각 시즌은 별도로 기록해요.</p>
			<div className="collection-tools movie-tools">
				<label className="search-field">
					<Search size={18} />
					<input aria-label="작품 검색" placeholder="제목 검색" value={query} onChange={event => filter('q', event.target.value)} />
				</label>
				<div className="select-field">
					<SlidersHorizontal size={15} />
					<select aria-label="감상 상태" value={status} onChange={event => filter('status', event.target.value)}>
						<option value="all">전체 상태</option>
						<option value="watched">시청 완료</option>
						<option value="unwatched">미시청</option>
					</select>
				</div>
			</div>
			<div className="collection-subbar">
				<div className="phase-tabs" aria-label="페이즈 필터">
					{['all', '1', '2', '3', '4', '5', '6'].map(value => (
						<button type="button" key={value} className={phase === value ? 'active' : ''} aria-pressed={phase === value} onClick={() => filter('phase', value)}>
							{value === 'all' ? '전체' : `Phase ${value}`}
						</button>
					))}
				</div>
				<span className="result-count">
					{data.movies.length}편 중 <strong>{filtered.length}편</strong>
				</span>
			</div>
			{filtered.length ? (
				<div className="movie-grid">
					{filtered.map(movie => {
						const entries = getMovieEntries(movie.id, data.entries)
						return (
							<Link className="movie-card" key={movie.id} to={`/movies/${movie.id}`}>
								<div className="movie-art">
									<MovieCover movie={movie} />
									<span className="movie-order">{movie.mediaType === 'movie' ? `#${String(movie.releaseOrder).padStart(2, '0')}` : movie.mediaType === 'series' ? `SEASON ${movie.seasonNumber}` : 'SPECIAL'}</span>
									<WatchedBadge count={entries.length} />
								</div>
								<div className="movie-card-body">
									<div className="movie-card-meta">
										<span>
											{movie.releaseYear} <i />
											Phase {movie.phase}
										</span>
										<Rating ticks={getCurrentRating(movie.id, data.entries)} />
									</div>
									<h3 title={movie.titleEn}>{movie.titleEn}</h3>
									<span className="media-caption">
										{mediaLabel(movie)}
										{movie.releaseStatus === 'airing' ? ' · 공개 중' : ''}
									</span>
									<p>{entries.length ? `${entries.length}회 감상${entries.length > 1 ? ' · 재관람' : ''}` : '아직 만나지 않은 이야기'}</p>
								</div>
							</Link>
						)
					})}
				</div>
			) : (
				<EmptyState title="조건에 맞는 작품이 없습니다." description="검색어나 필터를 바꿔 다시 찾아보세요.">
					<button type="button" className="button secondary" onClick={() => setSearch({})}>
						필터 초기화
					</button>
				</EmptyState>
			)}
		</>
	)
}

export function MovieDetail({ data }: { data: MarathonData }) {
	const { movieId } = useParams()
	const movie = data.movies.find(item => item.id === movieId)
	const [form, setForm] = useState<WatchEntry | 'new' | null>(null)
	const [deleting, setDeleting] = useState<WatchEntry | null>(null)
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState('')
	if (!movie)
		return (
			<EmptyState title="작품을 찾을 수 없습니다." description="작품 목록에서 다시 선택해 주세요.">
				<Link className="button secondary" to="/movies">
					작품 목록으로
				</Link>
			</EmptyState>
		)
	const entries = getMovieEntries(movie.id, data.entries)
	const rating = getCurrentRating(movie.id, data.entries)
	const change = getRatingChange(movie.id, data.entries)
	async function remove() {
		if (!deleting || busy) return
		setBusy(true)
		setError('')
		try {
			await data.remove(deleting.id)
			setDeleting(null)
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : '기록을 삭제하지 못했어요.')
		} finally {
			setBusy(false)
		}
	}
	return (
		<>
			<Link className="back-link" to="/movies">
				<ArrowLeft size={16} />
				작품 목록
			</Link>
			<section className="movie-detail-hero">
				<div className="detail-poster">
					<MovieCover movie={movie} />
					<PosterPicker movie={movie} data={data} />
				</div>
				<div className="detail-info">
					<span className="eyebrow">THE MARATHON COLLECTION / {String(movie.releaseOrder).padStart(2, '0')}</span>
					<div className="detail-tags">
						<span>{mediaLabel(movie)}</span>
						{movie.releaseStatus === 'airing' && <span>공개 중</span>}
						<span>PHASE {movie.phase}</span>
						<span>{movie.saga}</span>
					</div>
					<h1>{movie.titleEn}</h1>
					<p className="detail-year">
						{movie.releaseYear} <span>·</span> {movie.mediaType === 'movie' ? `MCU 개봉 #${movie.releaseOrder}` : 'Disney+ Original'}
					</p>
					{movie.mediaType === 'series' && (
						<p className="season-note">
							시즌 {movie.seasonNumber} 전체의 감상 날짜·별점·감상평을 기록해요. 에피소드별 진도는 따로 기록하지 않습니다.{movie.releaseStatus === 'airing' ? ' 현재 공개 중인 시즌입니다.' : ''}
						</p>
					)}
					<WatchedBadge count={entries.length} />
					<div className="detail-numbers">
						<div>
							<span>감상 횟수</span>
							<strong>
								{entries.length}
								<small>회</small>
							</strong>
						</div>
						<div>
							<span>현재 나의 별점</span>
							<strong className="gold">
								{rating === null ? '—' : (rating / 2).toFixed(1)}
								<small>/ 5</small>
							</strong>
						</div>
						<div>
							<span>최근 감상일</span>
							<strong className="detail-date">{entries[0] ? formatDate(entries[0].watchDate) : '아직 미시청'}</strong>
						</div>
						<button type="button" className="button primary detail-add-entry" onClick={() => setForm('new')}>
							<Plus size={17} />
							감상 기록 추가
						</button>
					</div>
				</div>
			</section>
			<Link className={`cosmic-detail-note ${entries.length ? 'is-lit' : ''}`} to="/dashboard">
				<Sparkles size={20} />
				<div>
					<strong>{entries.length ? '나의 우주에서 빛나는 별' : '아직 빛을 기다리는 별'}</strong>
					<span>{entries.length ? `Phase ${movie.phase} 별자리에 이 작품의 별이 켜졌어요. 재관람 기록도 계속 쌓을 수 있어요.` : `첫 감상 기록을 남기면 Phase ${movie.phase} 별자리에 별 하나가 켜져요. 별점은 없어도 괜찮아요.`}</span>
				</div>
				<span className="cosmic-detail-link">
					나의 우주 <ArrowUpRight size={16} />
				</span>
			</Link>
			{change !== null && (
				<div className="rating-change">
					<TrendingUp size={18} />
					<span>다시 보니 어땠나요?</span>
					<strong>
						{change > 0 ? '+' : ''}
						{change === 0 ? '변화 없음' : `${change.toFixed(1)}점`}
					</strong>
					<span className="muted">최근 두 번의 유효 별점 비교</span>
				</div>
			)}
			<section className="watch-history">
				<SectionTitle title="나의 감상 기록" subtitle={`총 ${entries.length}번의 감상${entries.length > 1 ? ` · ${entries.length - 1}번의 재관람` : ''}`} />
				{entries.length === 0 ? (
					<div className="panel">
						<EmptyState title="이 작품과의 첫 만남을 남겨보세요." description="날짜만 남겨도, 긴 감상을 적어도 좋아요.">
							<button type="button" className="button secondary" onClick={() => setForm('new')}>
								<Plus size={16} />첫 감상 기록 남기기
							</button>
						</EmptyState>
					</div>
				) : (
					<div className="entry-list">
						<div className="entry-list-heading" aria-hidden="true">
							<span>감상일</span>
							<span>평점</span>
							<span>감상평</span>
						</div>
						{entries.map((entry, index) => (
							<article className="entry-card" key={entry.id}>
								<div className="entry-top">
									<time dateTime={entry.watchDate}>
										<CalendarDays size={16} />
										{formatDate(entry.watchDate)}
									</time>
									<div className="entry-meta">
										<span className="entry-number">{entries.length - index}번째 감상</span>
										{entries.length - index > 1 && <span className="mini-badge">재관람</span>}
									</div>
								</div>
								<div className="entry-rating">
									<span className="entry-field-label">평점</span>
									<Rating ticks={entry.ratingTicks} label />
								</div>
								<div className="entry-review-block">
									<span className="entry-field-label">감상평</span>
									<p className={`entry-review ${entry.review ? '' : 'muted'}`}>{entry.review || '감상평 없이 시청한 순간을 남겼어요.'}</p>
								</div>
								<div className="entry-actions">
									<button type="button" className="text-button" aria-label={`${formatDate(entry.watchDate)} 기록 수정`} onClick={() => setForm(entry)}>
										<Edit3 size={13} />
										수정
									</button>
									<button
										type="button"
										className="text-button"
										aria-label={`${formatDate(entry.watchDate)} 기록 삭제`}
										onClick={() => {
											setError('')
											setDeleting(entry)
										}}
									>
										<Trash2 size={13} />
										삭제
									</button>
								</div>
							</article>
						))}
					</div>
				)}
			</section>
			{form && <EntryForm movie={movie} entry={form === 'new' ? undefined : form} data={data} onClose={() => setForm(null)} />}
			{deleting && (
				<Modal title="감상 기록을 삭제할까요?" small busy={busy} onClose={() => setDeleting(null)}>
					<p className="description">{formatDate(deleting.watchDate)}에 남긴 이 감상 기록을 삭제합니다. 삭제 후 복구할 수 없습니다.</p>
					{error && (
						<p role="alert" className="inline-error">
							{error}
						</p>
					)}
					<div className="modal-actions">
						<button type="button" className="button secondary" disabled={busy} onClick={() => setDeleting(null)}>
							취소
						</button>
						<button type="button" className="button danger" disabled={busy} onClick={() => void remove()}>
							{busy ? '삭제 중…' : '기록 삭제'}
						</button>
					</div>
				</Modal>
			)}
		</>
	)
}
