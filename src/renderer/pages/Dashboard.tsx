import { formatDate } from '../utils/format'
import { ArrowRight, Plus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { buildStatistics } from '../../shared/statistics'
import type { MarathonData } from '../hooks/useMarathonData'
import { EmptyState, MovieCover, PageHeading, Rating, SectionTitle } from '../components/Common'
import { PhaseProgress, StatisticsCards } from '../components/StatisticsCards'
import UniverseMap from '../components/UniverseMap'
import { useState } from 'react'
import { MediaFilter } from '../components/MediaFilter'
import { filterMedia, type MediaFilter as Filter } from '../../shared/media'

export default function Dashboard({ data, focusNextOnMobile = false }: { data: MarathonData; focusNextOnMobile?: boolean }) {
	const [focusNextOnArrival] = useState(focusNextOnMobile)
	const [type, setType] = useState<Filter>('all')
	const titles = filterMedia(data.movies, type)
	const stats = buildStatistics(titles, data.entries)
	const next = stats.nextMovie
	return (
		<>
			<PageHeading
				eyebrow="YOUR PERSONAL CINEMATIC UNIVERSE"
				title="나만의 MCU 정주행 기록"
				description="영화 한 편, 시리즈 한 시즌이 하나의 별로. 여섯 개의 별자리를 모아 나만의 우주를 완성하세요."
				action={
					<Link className="button secondary" to="/movies">
						<Plus size={16} />
						감상 기록 남기기
					</Link>
				}
			/>
			<MediaFilter value={type} onChange={setType} titles={data.movies} />
			<UniverseMap key={type} movies={titles} entries={data.entries} nextMovie={next} focusNextOnMobile={focusNextOnArrival} />
			<StatisticsCards stats={stats} />
			<div className="dashboard-bottom">
				<section className="panel">
					<SectionTitle title="최근 감상 기록" subtitle="엔딩 크레딧 뒤에 남은 나의 이야기" to="/diary" />
					{stats.recentEntries.length === 0 ? (
						<EmptyState title="아직 기록되지 않은 첫 장면" description="영화 한 편을 보고, 오늘의 감상을 남겨보세요.">
							<Link className="text-link" to={next ? `/movies/${next.id}` : '/movies'}>
								첫 감상 기록 남기기
								<ArrowRight size={15} />
							</Link>
						</EmptyState>
					) : (
						<div className="recent-list">
							{stats.recentEntries.map(entry => {
								const movie = data.movies.find(item => item.id === entry.movieId)!
								return (
									<Link className="recent-row" key={entry.id} to={`/movies/${movie.id}`}>
										<MovieCover movie={movie} compact />
										<div>
											<strong>{movie.titleEn}</strong>
											<p>{entry.review || '감상한 순간을 기록했어요.'}</p>
											<time>{formatDate(entry.watchDate)}</time>
										</div>
										<Rating ticks={entry.ratingTicks} />
									</Link>
								)
							})}
						</div>
					)}
				</section>
				<section className="panel">
					<SectionTitle title="페이즈별 여정" subtitle="하나의 우주, 여섯 개의 챕터" to="/statistics" linkLabel="통계" />
					<PhaseProgress stats={stats} />
				</section>
			</div>
		</>
	)
}
