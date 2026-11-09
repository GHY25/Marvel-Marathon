import { formatDate } from '../utils/format'
import { ArrowRight, Orbit, Plus, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import { buildStatistics } from '../../shared/statistics'
import type { MarathonData } from '../hooks/useMarathonData'
import { EmptyState, MovieCover, PageHeading, Rating, SectionTitle } from '../components/Common'
import { PhaseProgress, StatisticsCards } from '../components/StatisticsCards'
import UniverseMap from '../components/UniverseMap'

export default function Dashboard({ data }: { data: MarathonData }) {
	const stats = buildStatistics(data.movies, data.entries)
	const next = stats.nextMovie
	return (
		<>
			<PageHeading
				eyebrow="YOUR PERSONAL CINEMATIC UNIVERSE"
				title="나만의 MCU 정주행 기록"
				description="한 편의 영화가 하나의 별로. 여섯 개의 별자리를 모아 나만의 우주를 완성하세요."
				action={
					<Link className="button secondary" to="/movies">
						<Plus size={16} />
						감상 기록 남기기
					</Link>
				}
			/>
			<UniverseMap movies={data.movies} entries={data.entries} />
			{next ? (
				<Link className="cosmic-next" to={`/movies/${next.id}`}>
					<MovieCover movie={next} compact />
					<div className="cosmic-next-title">
						<span className="eyebrow">
							<Orbit size={13} /> YOUR NEXT STAR
						</span>
						<h2>{next.titleEn}</h2>
						<p>
							{next.releaseYear} · Phase {next.phase} · 개봉 순서 #{String(next.releaseOrder).padStart(2, '0')}
						</p>
					</div>
					<span className="cosmic-next-action">
						다음 별 만나기 <ArrowRight size={17} />
					</span>
				</Link>
			) : (
				<div className="cosmic-next cosmic-finished">
					<Sparkles size={30} />
					<div className="cosmic-next-title">
						<h2>모든 별이 빛나는 나만의 밤하늘</h2>
						<p>완성된 우주에서, 가장 좋아했던 이야기를 다시 만나보세요.</p>
					</div>
					<Link className="button secondary" to="/ranking">
						나의 랭킹 돌아보기 <ArrowRight size={16} />
					</Link>
				</div>
			)}
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
