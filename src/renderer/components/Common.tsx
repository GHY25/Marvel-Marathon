import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { ArrowUpRight, Film, Star, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { Movie } from '../../shared/types'

export function MovieCover({ movie, compact = false }: { movie: Movie; compact?: boolean }) {
	const [failedImage, setFailedImage] = useState('')
	const poster = movie.poster?.dataUrl
	const colors = ['#ce6752', '#6a9b8a', '#ad8c56', '#7b8cbd', '#aa7eb2', '#6fabb2']
	const style = { '--cover-color': colors[(movie.releaseOrder - 1) % colors.length], '--tilt': `${((movie.releaseOrder * 23) % 90) - 45}deg` } as CSSProperties
	if (poster && poster !== failedImage)
		return (
			<div className={`movie-cover has-poster ${compact ? 'compact' : ''}`} aria-hidden="true">
				<img src={poster} alt="" loading="lazy" decoding="async" onError={() => setFailedImage(poster)} />
			</div>
		)
	return (
		<div className={`movie-cover ${compact ? 'compact' : ''}`} style={style} aria-hidden="true">
			<div className="cover-grain" />
			<div className="cover-orbit orbit-one" />
			<div className="cover-orbit orbit-two" />
			<div className="cover-sun" />
			<div className="cover-line" />
			<span className="cover-index">{String(movie.releaseOrder).padStart(2, '0')}</span>
			<span className="cover-kicker">THE MARATHON COLLECTION</span>
			<div className="cover-caption">
				<span>
					PHASE {movie.phase} / {movie.releaseYear}
				</span>
				<strong>{movie.titleEn}</strong>
				<div className="cover-rule" />
			</div>
		</div>
	)
}

export function Rating({ ticks, label = false }: { ticks: number | null; label?: boolean }) {
	return (
		<span className={ticks === null ? 'rating muted' : 'rating'}>
			<Star size={14} fill={ticks === null ? 'none' : 'currentColor'} />
			{ticks === null ? (label ? '평점 미등록' : '—') : (ticks / 2).toFixed(1)}
		</span>
	)
}

export function Progress({ value, label }: { value: number; label: string }) {
	return (
		<div className="progress" role="progressbar" aria-label={label} aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
			<span style={{ width: `${value}%` }} />
		</div>
	)
}

export function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
	return (
		<div className="page-heading">
			<div>
				<p className="eyebrow">{eyebrow}</p>
				<h1>{title}</h1>
				<p className="description">{description}</p>
			</div>
			{action}
		</div>
	)
}

export function EmptyState({ title, description, children }: { title: string; description?: string; children?: ReactNode }) {
	return (
		<div className="empty-state">
			<span className="empty-icon">
				<Film size={25} strokeWidth={1.25} />
			</span>
			<h3>{title}</h3>
			{description && <p>{description}</p>}
			{children}
		</div>
	)
}

export function SectionTitle({ title, subtitle, to, linkLabel = '전체 보기' }: { title: string; subtitle?: string; to?: string; linkLabel?: string }) {
	return (
		<div className="section-heading">
			<div>
				<h2>{title}</h2>
				{subtitle && <p>{subtitle}</p>}
			</div>
			{to && (
				<Link className="text-link" to={to}>
					{linkLabel}
					<ArrowUpRight size={15} />
				</Link>
			)}
		</div>
	)
}

export function WatchedBadge({ count }: { count: number }) {
	return (
		<span className={`status-badge ${count ? 'watched' : ''}`}>
			{count ? (
				<>
					<Star size={11} fill="currentColor" />
					시청 완료
				</>
			) : (
				'미시청'
			)}
		</span>
	)
}

export function Modal({ title, onClose, children, busy = false, small = false }: { title: string; onClose: () => void; children: ReactNode; busy?: boolean; small?: boolean }) {
	const ref = useRef<HTMLDialogElement>(null)
	useEffect(() => {
		const dialog = ref.current
		const focused = document.activeElement as HTMLElement | null
		dialog?.showModal()
		return () => {
			dialog?.close()
			focused?.focus()
		}
	}, [])
	return (
		<dialog
			ref={ref}
			className={`modal ${small ? 'modal-small' : ''}`}
			aria-labelledby="modal-title"
			onCancel={event => {
				event.preventDefault()
				if (!busy) onClose()
			}}
		>
			<div className="modal-heading">
				<h2 id="modal-title">{title}</h2>
				<button type="button" className="icon-button" aria-label="닫기" disabled={busy} onClick={onClose}>
					<X size={20} />
				</button>
			</div>
			{children}
		</dialog>
	)
}
