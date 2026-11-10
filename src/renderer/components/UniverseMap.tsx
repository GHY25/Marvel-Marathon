import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { ArrowUpRight, Check, Hand, Maximize, Minimize, Minus, Orbit, Plus, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { Movie, Phase, WatchEntry } from '../../shared/types'
import { useUniverseCamera } from '../hooks/useUniverseCamera'
import { CONSTELLATIONS, layoutConstellation, OVERVIEW_CENTER, WORLD_HEIGHT, WORLD_WIDTH } from './universe/constellations'
import { MovieCover } from './Common'
import { mediaLabel } from '../../shared/media'
import '../../styles/Universe.css'

function phaseStyle(color: string): CSSProperties {
	return { '--universe-phase': color } as CSSProperties
}

export default function UniverseMap({ movies, entries, nextMovie, focusNextOnMobile = false }: { movies: Movie[]; entries: WatchEntry[]; nextMovie: Movie | null; focusNextOnMobile?: boolean }) {
	const [selectedPhase, setSelectedPhase] = useState<Phase | 'all'>(() => focusNextOnMobile && window.matchMedia('(max-width: 600px)').matches ? nextMovie?.phase ?? 'all' : 'all')
	const [previewId, setPreviewId] = useState<string | null>(null)
	const atlasRef = useRef<HTMLDivElement>(null)
	const fullscreenButtonRef = useRef<HTMLButtonElement>(null)
	const [isFullscreen, setFullscreen] = useState(false)
	const [fullscreenPending, setFullscreenPending] = useState(false)
	const [fullscreenError, setFullscreenError] = useState<string | null>(null)
	useEffect(() => {
		const atlas = atlasRef.current
		let wasFullscreen = false
		const changed = () => {
			const active = document.fullscreenElement === atlas
			setFullscreen(active)
			setFullscreenError(null)
			if (wasFullscreen && !active) fullscreenButtonRef.current?.focus({ preventScroll: true })
			wasFullscreen = active
		}
		const escape = (event: KeyboardEvent) => {
			if (event.key === 'Escape' && document.fullscreenElement === atlas) {
				void document.exitFullscreen().catch(() => {
					if (atlas?.isConnected) setFullscreenError('전체 화면을 종료하지 못했어요. 종료 버튼을 다시 눌러 주세요.')
				})
			}
		}
		document.addEventListener('fullscreenchange', changed)
		document.addEventListener('keydown', escape)
		return () => {
			document.removeEventListener('fullscreenchange', changed)
			document.removeEventListener('keydown', escape)
			// A movie link can unmount the map while it owns native fullscreen.
			if (atlas && document.fullscreenElement === atlas) void document.exitFullscreen().catch(() => {})
		}
	}, [])
	async function toggleFullscreen() {
		const atlas = atlasRef.current
		if (!atlas || fullscreenPending) return
		setFullscreenPending(true)
		setFullscreenError(null)
		let timeout: number | undefined
		try {
			const transition = document.fullscreenElement === atlas ? document.exitFullscreen() : atlas.requestFullscreen()
			// Electron can leave the native promise pending when permission is denied.
			// Always return control to the user instead of leaving the button disabled.
			await Promise.race([
				transition,
				new Promise<never>((_, reject) => {
					timeout = window.setTimeout(() => reject(new Error('Fullscreen transition timed out')), 5000)
				}),
			])
		} catch {
			if (atlas.isConnected) setFullscreenError('전체 화면으로 전환하지 못했어요. 버튼을 다시 눌러 주세요.')
		} finally {
			if (timeout !== undefined) window.clearTimeout(timeout)
			if (atlas.isConnected) setFullscreenPending(false)
		}
	}
	const watchedIds = new Set(entries.map(entry => entry.movieId))
	const watched = movies.filter(movie => watchedIds.has(movie.id)).length
	const phases = CONSTELLATIONS.map(constellation => {
		const phaseMovies = movies.filter(movie => movie.phase === constellation.phase).sort((a, b) => a.releaseOrder - b.releaseOrder)
		const count = phaseMovies.filter(movie => watchedIds.has(movie.id)).length
		return { ...constellation, ...layoutConstellation(constellation, phaseMovies), movies: phaseMovies, watched: count, complete: phaseMovies.length > 0 && count === phaseMovies.length }
	})
	const nextPhase = phases.find(phase => phase.phase === nextMovie?.phase)
	const mobileInitialBounds = focusNextOnMobile && nextPhase ? { x: nextPhase.x - 28, y: nextPhase.y - 70, width: nextPhase.width + 56, height: nextPhase.height + 105 } : undefined
	const { viewportRef, camera, size, isDragging, minScale, maxScale, zoomBy, fitWorld, focusBounds, revealPoint, handlers } = useUniverseCamera({ worldWidth: WORLD_WIDTH, worldHeight: WORLD_HEIGHT, initialCenter: OVERVIEW_CENTER, mobileInitialBounds })
	const availablePhases = phases.filter(phase => phase.movies.length > 0).length
	const completeCount = phases.filter(phase => phase.complete).length
	const complete = movies.length > 0 && watched === movies.length
	const activeStarId = previewId ?? nextMovie?.id
	function showAll() {
		setSelectedPhase('all')
		fitWorld()
	}
	function visitPhase(phase: (typeof phases)[number]) {
		setSelectedPhase(phase.phase)
		setPreviewId(phase.movies.find(movie => !watchedIds.has(movie.id))?.id ?? phase.movies[0]?.id ?? null)
		focusBounds({ x: phase.x - 28, y: phase.y - 70, width: phase.width + 56, height: phase.height + 105 })
	}
	const left = Math.max(0, -camera.x / camera.scale)
	const top = Math.max(0, -camera.y / camera.scale)
	const right = Math.min(WORLD_WIDTH, (size.width - camera.x) / camera.scale)
	const bottom = Math.min(WORLD_HEIGHT, (size.height - camera.y) / camera.scale)
	const hitSize = Math.max(24, Math.min(44, camera.scale * 100))
	const labelScale = size.width <= 600 ? Math.max(1, 1 / camera.scale) : Math.max(1, Math.min(4, 1 / camera.scale))
	return (
		<section className={`universe-map${complete ? ' universe-complete' : ''}`} data-testid="universe-map" aria-labelledby="universe-title">
			<div className="universe-heading">
				<div>
					<p className="universe-eyebrow">
						<Orbit size={13} /> THE INFINITY COLLECTION
					</p>
					<h2 id="universe-title">{complete ? '당신의 우주가 완성됐어요.' : '이야기를 모으고, 우주를 탐험하세요.'}</h2>
					<p className="universe-intro">잡고 움직이면 또 다른 별자리가 나타나요. 감상한 작품은 나의 우주에서 빛나는 별이 됩니다.</p>
				</div>
				<div className="universe-counter" aria-label={`전체 ${movies.length}개 중 ${watched}개의 별을 밝혔어요`}>
					<Sparkles size={17} />
					<strong>{String(watched).padStart(2, '0')}</strong>
					<span>
						/ {movies.length}
						<small>STARS AWAKENED</small>
					</span>
				</div>
			</div>
			<div className="universe-atlas" ref={atlasRef} data-testid="universe-atlas" data-fullscreen={isFullscreen}>
				<div className="universe-atlas-toolbar">
					<span className="universe-chart-label">
						CELESTIAL ATLAS <i /> EXPLORE YOUR UNIVERSE
					</span>
					<div className="universe-controls" role="group" aria-label="우주 지도 보기 설정" data-camera-control>
						<button type="button" className="universe-control" aria-label="우주 축소" title="축소 (-)" disabled={camera.scale <= minScale + 0.001} onClick={() => zoomBy(0.8)}>
							<Minus size={16} />
						</button>
						<output className="universe-zoom-value" aria-label="우주 지도 확대율">
							{Math.round(camera.scale * 100)}%
						</output>
						<button type="button" className="universe-control" aria-label="우주 확대" title="확대 (+)" disabled={camera.scale >= maxScale - 0.001} onClick={() => zoomBy(1.25)}>
							<Plus size={16} />
						</button>
						<button type="button" className="universe-reset" aria-label="전체 우주 보기" title="전체 보기 (Home)" onClick={showAll}>
							<Orbit size={13} /> 전체 우주
						</button>
						<button type="button" ref={fullscreenButtonRef} className="universe-control" aria-label={isFullscreen ? '전체 화면 종료' : '우주 전체 화면'} aria-pressed={isFullscreen} title={isFullscreen ? '전체 화면 종료 (Esc)' : '우주만 전체 화면으로 보기'} disabled={fullscreenPending} onClick={() => void toggleFullscreen()}>
							{isFullscreen ? <Minimize size={17} /> : <Maximize size={17} />}
						</button>
					</div>
				</div>
				{fullscreenError && (
					<p className="universe-fullscreen-error" role="alert">
						{fullscreenError}
					</p>
				)}
				<div ref={viewportRef} {...handlers} className={`universe-canvas${isDragging ? ' is-dragging' : ''}`} tabIndex={0} role="region" aria-label="드래그해서 탐색하는 우주 지도" aria-describedby="universe-navigation-help" data-testid="universe-viewport" data-camera-x={camera.x.toFixed(3)} data-camera-y={camera.y.toFixed(3)} data-camera-scale={camera.scale.toFixed(4)}>
					<div className="universe-backdrop" aria-hidden="true">
						<svg className="universe-dust" viewBox={`0 0 ${WORLD_WIDTH} ${WORLD_HEIGHT}`} preserveAspectRatio="xMidYMid slice">
							{Array.from({ length: 390 }, (_, index) => (
								<circle key={index} cx={(index * 719 + 97) % WORLD_WIDTH} cy={(index * 487 + 41) % WORLD_HEIGHT} r={index % 11 === 0 ? 2 : index % 4 === 0 ? 1.2 : 0.7} opacity={0.2 + (index % 5) * 0.13} />
							))}
						</svg>
					</div>
					<div className="universe-world" data-testid="universe-world" style={{ width: WORLD_WIDTH, height: WORLD_HEIGHT, transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})` }}>
						{phases.map(phase => (
							<div key={phase.phase} className={`universe-sector${phase.complete ? ' universe-sector-complete' : ''}`} data-testid="constellation" data-phase={phase.phase} style={{ ...phaseStyle(phase.color), left: phase.x, top: phase.y, width: phase.width, height: phase.height }}>
								{phase.filmLabel && (
									<div className="universe-sector-label" style={{ left: phase.filmLabel.x, top: phase.filmLabel.y - 44, transform: `scale(${labelScale})` }}>
										<span>
											<small>PHASE 0{phase.phase}</small>
											<strong>{phase.skyName}</strong>
										</span>
										<span className="universe-sector-count">
											{phase.watched}
											<small> / {phase.movies.length}</small>
											{phase.complete && <Check size={11} />}
										</span>
									</div>
								)}
								{phase.companion && (
									<div className="universe-companion-label" style={{ left: phase.companion.label.x, top: phase.companion.label.y, transform: `scale(${labelScale})` }}>
										<span>
											PHASE 0{phase.phase} · {[phase.movies.some(movie => movie.mediaType === 'series') && '시리즈', phase.movies.some(movie => movie.mediaType === 'special') && '스페셜'].filter(Boolean).join(' · ')}
										</span>
										<strong>{phase.companion.name}</strong>
									</div>
								)}
								<svg className="universe-lines" viewBox={`0 0 ${phase.width} ${phase.height}`} aria-hidden="true">
									{phase.edges.map(([from, to]) => {
										const start = phase.points[from]
										const end = phase.points[to]
										const lit = !!phase.movies[from] && !!phase.movies[to] && watchedIds.has(phase.movies[from].id) && watchedIds.has(phase.movies[to].id)
										return <line key={`${from}-${to}`} x1={start.x} y1={start.y} x2={end.x} y2={end.y} className={lit ? 'universe-line universe-line-lit' : 'universe-line'} vectorEffect="non-scaling-stroke" />
									})}
								</svg>
								{phase.movies.map((movie, index) => {
									const point = phase.points[index]
									if (!point) return null
									const lit = watchedIds.has(movie.id)
									return (
										<Link
											key={movie.id}
											to={`/movies/${movie.id}`}
											draggable={false}
											className={`universe-star${lit ? ' universe-star-lit' : ''}${activeStarId === movie.id ? ' universe-star-selected' : ''}`}
											style={{ left: point.x, top: point.y, width: hitSize, height: hitSize, transform: `translate(-50%, -50%) scale(${1 / camera.scale})`, '--star-size': `${point.size}px`, '--star-delay': `${index * -0.7}s` } as CSSProperties}
											aria-label={`${movie.titleEn}, Phase ${movie.phase}, ${movie.mediaType === 'movie' ? phase.skyName : phase.companion?.name}, ${lit ? '시청 완료, 밝혀진 별' : '미시청, 아직 잠든 별'}`}
											onMouseEnter={() => {
												if (!isDragging) setPreviewId(movie.id)
											}}
											onFocus={() => {
												setPreviewId(movie.id)
												revealPoint(phase.x + point.x, phase.y + point.y)
											}}
											data-testid="movie-star"
											data-movie-id={movie.id}
											data-watched={lit}
											data-variant={point.variant}
										>
											<span className="universe-star-halo" aria-hidden="true" />
											<span className="universe-star-core" aria-hidden="true" />
											<span className="universe-star-number" aria-hidden="true">
												{String(movie.releaseOrder).padStart(2, '0')}
											</span>
											<span className="universe-star-tooltip" aria-hidden="true">
												{movie.titleEn}
											</span>
										</Link>
									)
								})}
							</div>
						))}
					</div>
					<div className="universe-minimap" role="img" aria-label="전체 우주에서 현재 보고 있는 위치">
						<svg viewBox={`0 0 ${WORLD_WIDTH} ${WORLD_HEIGHT}`} aria-hidden="true">
							{phases.map(phase => (
								<g key={phase.phase} fill={phase.color}>
									{phase.points.map((point, index) => (
										<circle key={index} cx={phase.x + point.x} cy={phase.y + point.y} r={9} opacity={watchedIds.has(phase.movies[index]?.id) ? 1 : 0.5} />
									))}
								</g>
							))}
							<rect className="universe-minimap-viewport" x={left} y={top} width={Math.max(0, right - left)} height={Math.max(0, bottom - top)} rx={18} vectorEffect="non-scaling-stroke" />
						</svg>
					</div>
				</div>
				<div className="universe-legend">
					<span>
						<i className="universe-legend-lit" /> 밝혀진 별
					</span>
					<span>
						<i /> 아직 잠든 별
					</span>
					<span className="universe-drag-hint" id="universe-navigation-help">
						<Hand size={12} /> 드래그 이동 · 휠 확대 · 방향키 / + − / Home{isFullscreen && ' · Esc 전체 화면 종료'}
					</span>
				</div>
				{nextMovie ? (
					<Link className="universe-next" data-testid="universe-next" to={`/movies/${nextMovie.id}`}>
						<MovieCover movie={nextMovie} compact />
						<div className="universe-next-film">
							<span className="universe-next-eyebrow">
								<Orbit size={12} /> 다음으로 밝혀볼 별
							</span>
							<strong>{nextMovie.titleEn}</strong>
							<span className="universe-next-meta">
								PHASE {nextMovie.phase} · {mediaLabel(nextMovie)} · {nextMovie.releaseYear}
							</span>
						</div>
						<span className="universe-next-action">
							다음 별 만나기 <ArrowUpRight size={15} />
						</span>
					</Link>
				) : (
					<Link className="universe-next universe-next-complete" data-testid="universe-next-complete" to="/ranking">
						<Sparkles size={30} />
						<div className="universe-next-film">
							<strong>모든 별이 빛나는 나만의 밤하늘</strong>
							<span className="universe-next-meta">가장 좋아했던 이야기를 다시 만나보세요.</span>
						</div>
						<span className="universe-next-action">
							나의 랭킹 돌아보기 <ArrowUpRight size={15} />
						</span>
					</Link>
				)}
			</div>
			<div className="universe-collection-heading">
				<h3>여섯 개의 빛을 모으는 여정</h3>
				<p aria-live="polite" aria-atomic="true" data-testid="universe-status">
					{complete ? `모든 별자리 완성 · ${availablePhases}개의 빛을 모두 모았어요!` : `${completeCount} / ${availablePhases} 수집 · Phase를 누르면 해당 별자리로 이동해요.`}
				</p>
			</div>
			<div className="universe-tokens" aria-label="페이즈별 빛 수집과 별자리 이동">
				{phases.map(phase => (
					<button type="button" key={phase.phase} disabled={!phase.movies.length} className={`universe-token${phase.complete ? ' universe-token-complete' : ''}`} data-testid="phase-token" data-phase={phase.phase} data-complete={phase.complete} aria-pressed={selectedPhase === phase.phase} aria-label={`Phase ${phase.phase}, ${phase.skyName}, ${phase.name}, ${phase.watched}/${phase.movies.length}편, ${phase.complete ? '수집 완료' : '수집 중'}`} onClick={() => visitPhase(phase)} style={phaseStyle(phase.color)}>
						<span className="universe-token-gem" aria-hidden="true">
							<span />
							<i />
						</span>
						<span className="universe-token-title">
							<small>PHASE 0{phase.phase}</small>
							<strong>{phase.name}</strong>
							<span className="universe-token-skyname">{phase.skyName}</span>
						</span>
						<span className="universe-token-count">
							{phase.complete ? (
								<>
									<Check size={11} />
									수집 완료
								</>
							) : (
								<>
									{phase.watched}
									<span> / {phase.movies.length}</span>
								</>
							)}
						</span>
						<span className="universe-token-progress" aria-hidden="true">
							<span style={{ width: `${phase.movies.length ? (phase.watched / phase.movies.length) * 100 : 0}%` }} />
						</span>
					</button>
				))}
			</div>
			<p className="universe-reference-note">영화의 별자리 곁에 같은 Phase의 시리즈와 스페셜이 모입니다. 확장의 날개, 시간의 고리, 새벽의 나침반은 이 우주만의 별자리예요.</p>
		</section>
	)
}
