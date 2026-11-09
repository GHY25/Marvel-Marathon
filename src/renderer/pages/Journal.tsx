import { formatDate } from '../utils/format'
import { useState } from 'react'
import { ArrowRight, ArrowUpRight, Download, HardDrive, Search, ShieldCheck, Trophy, Upload } from 'lucide-react'
import { Link } from 'react-router-dom'
import { buildRanking, buildStatistics, sortEntries } from '../../shared/statistics'
import type { RankingItem } from '../../shared/types'
import type { MarathonData } from '../hooks/useMarathonData'
import { EmptyState, MovieCover, PageHeading, Rating, SectionTitle } from '../components/Common'
import { PhaseProgress, StatisticsCards } from '../components/StatisticsCards'
import { ThemePicker } from '../components/ThemeControls'
import { PosterSettings } from '../components/PosterControls'

export function Diary({ data }: { data: MarathonData }) {
	const [query, setQuery] = useState('')
	const [filter, setFilter] = useState('all')
	const entries = sortEntries(data.entries).filter(entry => {
		const movie = data.movies.find(item => item.id === entry.movieId)!
		return `${movie.titleEn} ${movie.titleKo ?? ''}`.toLowerCase().includes(query.trim().toLowerCase()) && (filter === 'all' || (filter === 'rated' ? entry.ratingTicks !== null : entry.ratingTicks === null))
	})
	return (
		<>
			<PageHeading eyebrow="MOMENTS AFTER THE CREDITS" title="감상 일기" description="같은 영화도 매번 다른 이야기로 남으니까. 나의 감상 순간들을 모았어요." action={<span className="count-chip">총 {data.entries.length}개의 기록</span>} />
			<div className="collection-tools">
				<label className="search-field">
					<Search size={18} />
					<input aria-label="감상 일기 검색" placeholder="영화 제목으로 기록 찾기" value={query} onChange={event => setQuery(event.target.value)} />
				</label>
				<select aria-label="평점 필터" value={filter} onChange={event => setFilter(event.target.value)}>
					<option value="all">모든 기록</option>
					<option value="rated">별점 있음</option>
					<option value="unrated">별점 없음</option>
				</select>
			</div>
			{entries.length ? (
				<div className="diary-list">
					{entries.map(entry => {
						const movie = data.movies.find(item => item.id === entry.movieId)!
						return (
							<article className="diary-card" key={entry.id}>
								<div className="diary-date">
									<strong>{entry.watchDate.slice(8)}</strong>
									<span>{entry.watchDate.slice(0, 7).replace('-', '.')}</span>
								</div>
								<Link to={`/movies/${movie.id}`} className="diary-cover" aria-label={`${movie.titleEn} 상세 보기`}>
									<MovieCover movie={movie} compact />
								</Link>
								<div className="diary-content">
									<div className="diary-title">
										<Link to={`/movies/${movie.id}`}>
											<h2>{movie.titleEn}</h2>
										</Link>
										<Rating ticks={entry.ratingTicks} label />
									</div>
									<span className="muted">
										{movie.releaseYear} · Phase {movie.phase}
									</span>
									<p className={entry.review ? '' : 'muted'}>{entry.review || '감상평 없이 시청한 순간을 남겼어요.'}</p>
									<Link className="text-link" to={`/movies/${movie.id}`}>
										감상 기록 보기
										<ArrowUpRight size={13} />
									</Link>
								</div>
							</article>
						)
					})}
				</div>
			) : (
				<div className="panel">
					<EmptyState title={data.entries.length ? '조건에 맞는 감상 기록이 없어요.' : '아직 감상 기록이 없습니다.'} description={data.entries.length ? '검색어나 별점 필터를 변경해 보세요.' : '영화 목록에서 첫 기록을 남겨보세요.'}>
						<Link className="button secondary" to="/movies">
							영화 목록으로
							<ArrowRight size={15} />
						</Link>
					</EmptyState>
				</div>
			)}
		</>
	)
}

function RankingRows({ ranking }: { ranking: RankingItem[] }) {
	return (
		<div className="ranking-list">
			{ranking.map(item => (
				<Link className="ranking-row" key={item.movie.id} to={`/movies/${item.movie.id}`}>
					<span className={`rank-number ${item.rank <= 3 ? 'top-rank' : ''}`}>{String(item.rank).padStart(2, '0')}</span>
					<MovieCover movie={item.movie} compact />
					<div className="ranking-film">
						<h3>{item.movie.titleEn}</h3>
						<span>
							{item.movie.releaseYear} · Phase {item.movie.phase}
						</span>
					</div>
					<div className="ranking-watches">
						<span>{item.watchCount}회 감상</span>
						<time>{formatDate(item.watchDate)} 평가</time>
					</div>
					<Rating ticks={item.ratingTicks} />
					<ArrowUpRight size={17} className="muted" />
				</Link>
			))}
		</div>
	)
}

export function Ranking({ data }: { data: MarathonData }) {
	const ranking = buildRanking(data.movies, data.entries)
	return (
		<>
			<PageHeading
				eyebrow="YOUR UNIVERSE, YOUR FAVORITES"
				title="나의 랭킹"
				description="영화별 최신 유효 별점으로 완성되는, 오직 나만의 순위."
				action={
					<span className="count-chip">
						<span aria-hidden="true">★</span>
						{ranking.length}편의 평가
					</span>
				}
			/>
			{ranking.length ? (
				<>
					<div className="ranking-intro">
						<Trophy size={24} />
						<div>
							<span className="eyebrow">YOUR NUMBER ONE</span>
							<h2>{ranking[0].movie.titleEn}</h2>
						</div>
						<Rating ticks={ranking[0].ratingTicks} />
					</div>
					<div className="ranking-labels">
						<span>RANK / FILM</span>
						<span>나의 별점</span>
					</div>
					<RankingRows ranking={ranking} />
					<p className="footnote">별점이 없는 최근 감상은 기존 평가를 바꾸지 않아요. 같은 점수는 개봉 순서로 정렬됩니다.</p>
				</>
			) : (
				<div className="panel">
					<EmptyState title="아직 별점을 매긴 영화가 없습니다." description="별점을 매기면 나만의 MCU 랭킹이 만들어져요.">
						<Link className="button primary" to="/movies">
							좋아하는 영화 찾아보기
							<ArrowRight size={16} />
						</Link>
					</EmptyState>
				</div>
			)}
		</>
	)
}

export function Statistics({ data }: { data: MarathonData }) {
	const stats = buildStatistics(data.movies, data.entries)
	const highestBin = Math.max(1, ...stats.distribution.map(item => item.count))
	return (
		<>
			<PageHeading eyebrow="A CLOSER LOOK AT YOUR JOURNEY" title="숫자로 보는 나의 취향" description="얼마나 봤는지, 무엇을 좋아했는지. 감상이 쌓일수록 선명해지는 취향." />
			<StatisticsCards stats={stats} />
			<div className="statistics-grid">
				<section className="panel">
					<SectionTitle title="페이즈별 감상 현황" subtitle={`${stats.watchedMovies} / ${stats.totalMovies}편 · 전체 ${Math.round(stats.progress)}% 완료`} />
					<PhaseProgress stats={stats} averages />
				</section>
				<section className="panel distribution-panel">
					<SectionTitle title="나의 별점 분포" subtitle={`별점을 남긴 ${stats.ratedMovies}편의 영화`} />
					<div className="distribution-chart" role="img" aria-label={`별점 분포: ${stats.distribution.map(item => `${item.ratingTicks / 2}점 ${item.count}편`).join(', ')}`}>
						{stats.distribution.map(item => (
							<div className="distribution-column" key={item.ratingTicks}>
								<span>{item.count}</span>
								<div className="bar-track">
									<div style={{ height: `${(item.count / highestBin) * 100}%` }} />
								</div>
								<label>{(item.ratingTicks / 2).toFixed(1)}</label>
							</div>
						))}
					</div>
					<p className="footnote">평균과 분포는 영화별 최신 유효 별점을 기준으로 계산해요. 재관람 횟수는 평균에 영향을 주지 않아요.</p>
				</section>
			</div>
			<section className="panel top-five">
				<SectionTitle title="나의 최고 평가 TOP 5" to="/ranking" linkLabel="랭킹 전체 보기" />
				{stats.ranking.length ? <RankingRows ranking={stats.ranking.slice(0, 5)} /> : <EmptyState title="나만의 명작을 기다리는 중" description="감상 기록에 별점을 남기면 이곳에 나타나요." />}
			</section>
		</>
	)
}

export function Settings({ data }: { data: MarathonData }) {
	const [busy, setBusy] = useState<'export' | 'import' | null>(null)
	const [error, setError] = useState('')
	async function backup(action: 'export' | 'import') {
		if (busy) return
		setBusy(action)
		setError('')
		try {
			if (action === 'export') await data.exportBackup()
			else await data.importBackup()
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : '백업을 처리하지 못했어요. 다시 시도해 주세요.')
		} finally {
			setBusy(null)
		}
	}
	return (
		<>
			<PageHeading eyebrow="MADE FOR YOUR OWN JOURNEY" title="설정" description="당신의 감상은 당신의 것. 소중한 기록을 안전하게 관리하세요." />
			<div className="settings-stack">
				<ThemePicker />
				<PosterSettings data={data} />
				<section className="panel storage-card">
					<span className="settings-icon">
						<HardDrive size={24} />
					</span>
					<div>
						<h2>이 기기에 안전하게 보관됩니다</h2>
						<p>
							모든 감상 기록은 로컬 저장소에 저장돼요.
							<br />
							인터넷 연결이나 계정 없이 언제든 기록할 수 있어요.
						</p>
					</div>
					<span className="local-badge">
						<ShieldCheck size={14} />
						로컬 저장
					</span>
				</section>
				<section className="panel">
					<SectionTitle title="감상 기록 백업" subtitle={`현재 ${data.entries.length}개의 감상 기록을 보관하고 있어요.`} />
					<div className="backup-row">
						<span className="backup-icon">
							<Download size={21} />
						</span>
						<div>
							<h3>백업 내보내기</h3>
							<p>날짜, 별점, 감상평을 하나의 JSON 파일로 저장합니다.</p>
						</div>
						<button type="button" className="button secondary" disabled={busy !== null} onClick={() => void backup('export')}>
							{busy === 'export' ? '내보내는 중…' : '내보내기 (.json)'}
						</button>
					</div>
					<div className="backup-row">
						<span className="backup-icon">
							<Upload size={21} />
						</span>
						<div>
							<h3>백업 가져오기</h3>
							<p>
								현재 기록을 선택한 백업으로 교체합니다.
								<br />
								파일 확인 후 교체 여부를 다시 물어볼게요.
							</p>
						</div>
						<button type="button" className="button secondary" disabled={busy !== null} onClick={() => void backup('import')}>
							{busy === 'import' ? '가져오는 중…' : '가져오기 (.json)'}
						</button>
					</div>
					{error && (
						<p className="inline-error" role="alert">
							{error}
						</p>
					)}
					<div className="info-note">
						<ShieldCheck size={17} />
						<p>복원 전 현재 기록의 복구용 사본을 남깁니다. 손상되거나 지원하지 않는 파일은 기존 기록을 바꾸지 않아요.</p>
					</div>
				</section>
				<section className="panel app-about">
					<div className="about-brand">
						<span className="brand-mark">
							M<span />
						</span>
						<div>
							<h2>Marvel Marathon</h2>
							<span>Every rewatch tells a new story.</span>
						</div>
						<span className="version">v{data.appInfo.version}</span>
					</div>
					<div className="about-details">
						<div>
							<span>영화 카탈로그</span>
							<strong>{data.movies.length}편 · Phase 1—6</strong>
						</div>
						<div>
							<span>카탈로그 버전</span>
							<strong>{data.appInfo.catalogVersion}</strong>
						</div>
						<div>
							<span>저장 방식</span>
							<strong>{data.appInfo.storage} · 오프라인 우선</strong>
						</div>
					</div>
					<p className="fan-note">
						영화를 좋아하는 마음으로 만든 비공식 개인 팬 프로젝트입니다.
						<br />
						Marvel 또는 Disney와 제휴하거나 이들의 승인을 받은 앱이 아닙니다. 기본 커버는 이 앱을 위해 만든 추상 그래픽입니다.
					</p>
					<div className="tmdb-credit">
						<a
							href="https://www.themoviedb.org"
							onClick={event => {
								event.preventDefault()
								void window.electronAPI.openExternal('https://www.themoviedb.org')
							}}
						>
							<img src="./tmdb-logo.svg" alt="TMDB" />
						</a>
						<p>This product uses the TMDB API but is not endorsed or certified by TMDB.</p>
						<p>자동 포스터 출처: TMDB. 포스터의 권리는 각 권리자에게 있습니다.</p>
					</div>
				</section>
			</div>
		</>
	)
}
