import { Film, Repeat2, Star, Ticket } from 'lucide-react'
import type { Statistics } from '../../shared/types'
import { formatAverageRating } from '../../shared/statistics'
import { Progress } from './Common'

export function StatisticsCards({ stats }: { stats: Statistics }) {
	const cards = [
		{ label: '시청한 영화', value: stats.watchedMovies, unit: '편', detail: `전체 ${stats.totalMovies}편`, Icon: Film },
		{ label: '총 감상', value: stats.totalEntries, unit: '회', detail: '모든 감상의 순간', Icon: Ticket },
		{ label: '나의 평균 별점', value: formatAverageRating(stats.averageRating), unit: '/ 5', detail: `별점을 남긴 ${stats.ratedMovies}편 기준`, Icon: Star },
		{ label: '다시 만난 영화', value: stats.rewatches, unit: '회', detail: '첫 감상 이후의 재관람', Icon: Repeat2 },
	]
	return (
		<div className="stat-grid">
			{cards.map(({ label, value, unit, detail, Icon }) => (
				<div className="stat-card" key={label}>
					<div className="stat-label">
						{label}
						<Icon size={16} />
					</div>
					<div className="stat-value">
						{value}
						<span>{unit}</span>
					</div>
					<p>{detail}</p>
				</div>
			))}
		</div>
	)
}

export function PhaseProgress({ stats, averages = false }: { stats: Statistics; averages?: boolean }) {
	return (
		<div className={`phase-list ${averages ? 'with-average' : ''}`}>
			{stats.phases.map(item => (
				<div className="phase-item" key={item.phase}>
					<div className="phase-heading">
						<span>
							<i />
							Phase {item.phase}
						</span>
						<span>
							{item.watched}
							<span className="muted"> / {item.total}편</span>
						</span>
					</div>
					<Progress value={item.progress} label={`Phase ${item.phase} 진행률`} />
					{averages && (
						<div className="phase-average">
							평균 별점 <strong>{formatAverageRating(item.averageRating)}</strong>
							<span>{Math.round(item.progress)}% 완료</span>
						</div>
					)}
				</div>
			))}
		</div>
	)
}
