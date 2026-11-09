import { useEffect } from 'react'
import { BookOpen, CheckCircle2, ChevronRight, Film, Orbit, LoaderCircle, Settings as SettingsIcon, ShieldCheck, Trophy, BarChart3 } from 'lucide-react'
import { HashRouter, Link, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useMarathonData } from './hooks/useMarathonData'
import { buildStatistics } from '../shared/statistics'
import { EmptyState, Progress } from './components/Common'
import { ThemeProvider } from './hooks/useTheme'
import { ThemeToggle } from './components/ThemeControls'
import Dashboard from './pages/Dashboard'
import { Movies, MovieDetail } from './pages/Movies'
import { Diary, Ranking, Settings, Statistics } from './pages/Journal'
import '../styles/App.css'
import '../styles/Theme.css'
import '../styles/CosmicJourney.css'

const navigation = [
	{ path: '/dashboard', label: '나의 우주', Icon: Orbit },
	{ path: '/movies', label: '작품 목록', Icon: Film },
	{ path: '/diary', label: '감상 일기', Icon: BookOpen },
	{ path: '/ranking', label: '나의 랭킹', Icon: Trophy },
	{ path: '/statistics', label: '통계', Icon: BarChart3 },
]

function AppShell() {
	const data = useMarathonData()
	const location = useLocation()
	const stats = buildStatistics(data.movies, data.entries)
	const current = [...navigation, { path: '/settings', label: '설정' }].find(item => location.pathname.startsWith(item.path))
	useEffect(() => {
		document.querySelector('.main-scroll')?.scrollTo(0, 0)
	}, [location.pathname])
	return (
		<div className="app-shell">
			<button type="button" className="skip-link" onClick={() => document.getElementById('main-content')?.focus()}>
				본문 바로가기
			</button>
			<aside className="sidebar">
				<Link className="brand" to="/dashboard" aria-label="Marvel Marathon 홈">
					<span className="brand-mark">
						M<span />
					</span>
					<span>
						MARVEL<strong>MARATHON</strong>
					</span>
				</Link>
				<div className="sidebar-label">MY MARVEL UNIVERSE</div>
				<nav aria-label="메인 메뉴">
					{navigation.map(({ path, label, Icon }) => (
						<NavLink key={path} to={path} className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
							<Icon size={18} strokeWidth={1.7} />
							<span>{label}</span>
							{path === '/movies' && <span className="nav-count">{data.movies.length}</span>}
						</NavLink>
					))}
				</nav>
				<div className="sidebar-journey">
					<div>
						<span>나의 별 수집</span>
						<strong>{Math.round(stats.progress)}%</strong>
					</div>
					<Progress value={stats.progress} label="사이드바 정주행 진행률" />
					<p>
						{stats.watchedMovies} / {data.movies.length}개의 별이 빛나는 중
					</p>
				</div>
				<div className="sidebar-bottom">
					<NavLink to="/settings" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
						<SettingsIcon size={18} strokeWidth={1.7} />
						<span>설정</span>
					</NavLink>
					<div className="sidebar-footer">
						<span className="local-indicator" />
						나만의 공간, 이 기기에 저장<p>UNOFFICIAL FAN PROJECT</p>
					</div>
				</div>
			</aside>
			<div className="main-column">
				<header className="topbar">
					<div>
						<span>MY UNIVERSE</span>
						<ChevronRight size={13} />
						<strong>{current?.label ?? '대시보드'}</strong>
					</div>
					<div className="topbar-actions">
						<span className="topbar-local">
							<ShieldCheck size={14} />
							로컬 우선 · 오프라인 사용
						</span>
						<ThemeToggle />
					</div>
				</header>
				<main className="main-scroll" id="main-content" tabIndex={-1}>
					<div className="page-content">
						{data.loading ? (
							<div className="loading-state" role="status">
								<LoaderCircle className="spinner" size={30} />
								<h2>나의 감상 기록을 불러오고 있어요.</h2>
							</div>
						) : data.error ? (
							<EmptyState title="기록을 불러오지 못했어요." description={data.error}>
								<button type="button" className="button primary" onClick={() => void data.refresh()}>
									다시 시도
								</button>
							</EmptyState>
						) : (
							<Routes>
								<Route path="/dashboard" element={<Dashboard data={data} />} />
								<Route path="/movies" element={<Movies data={data} />} />
								<Route path="/movies/:movieId" element={<MovieDetail key={location.pathname} data={data} />} />
								<Route path="/diary" element={<Diary data={data} />} />
								<Route path="/ranking" element={<Ranking data={data} />} />
								<Route path="/statistics" element={<Statistics data={data} />} />
								<Route path="/settings" element={<Settings data={data} />} />
								<Route path="*" element={<Navigate to="/dashboard" replace />} />
							</Routes>
						)}
						<footer className="page-footer">
							<span>MARVEL MARATHON</span>
							<span>Every story becomes a star.</span>
						</footer>
					</div>
				</main>
			</div>
			{data.notice && (
				<div className="toast" role="status">
					<CheckCircle2 size={18} />
					{data.notice}
				</div>
			)}
		</div>
	)
}
export default function App() {
	return (
		<ThemeProvider>
			<HashRouter>
				<AppShell />
			</HashRouter>
		</ThemeProvider>
	)
}
