import { useState } from 'react'
import { Download, ExternalLink, ImagePlus, RotateCcw } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { ApiResult, Movie } from '../../shared/types'
import type { MarathonData } from '../hooks/useMarathonData'
import { SectionTitle } from './Common'
import './PosterControls.css'

function checked<T>(result: ApiResult<T>): T {
	if (!result.ok) throw new Error(result.error.message)
	return result.data
}

export function PosterSettings({ data }: { data: MarathonData }) {
	const [credential, setCredential] = useState('')
	const [refresh, setRefresh] = useState(false)
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState('')
	const [message, setMessage] = useState('')
	const status = data.posterStatus
	const disabled = busy || !status || status.running
	async function perform(action: 'save' | 'clear' | 'start' | 'cancel') {
		if (busy) return
		setBusy(true)
		setError('')
		setMessage('')
		try {
			const api = window.electronAPI.posters
			checked(await (action === 'save' ? api.saveCredential(credential) : action === 'clear' ? api.clearCredential() : action === 'start' ? api.startSync(refresh) : api.cancelSync()))
			if (action === 'save' || action === 'clear') {
				setCredential('')
				setMessage(action === 'save' ? '키를 안전하게 저장했어요. 이제 포스터를 가져올 수 있어요.' : '키를 삭제했어요. 저장된 포스터는 계속 볼 수 있어요.')
			}
			await data.refreshPosters()
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : '포스터 설정을 처리하지 못했어요.')
		} finally {
			setBusy(false)
		}
	}
	async function openKeyPage() {
		try {
			await window.electronAPI.openExternal('https://www.themoviedb.org/settings/api')
		} catch {
			setError('브라우저를 열지 못했어요. TMDB 홈페이지의 계정 설정 → API로 이동해 주세요.')
		}
	}
	return (
		<section className="panel poster-settings">
			<SectionTitle title="영화 포스터" subtitle="38편의 실제 포스터를 가져와 나만의 컬렉션을 완성하세요." />
			<div className="poster-setup-intro">
				<p>TMDB에서 한국어 포스터를 우선 찾아요. 한 번 가져온 이미지는 이 기기에 저장되어 인터넷 없이도 볼 수 있어요.</p>
				<button type="button" className="text-link" onClick={() => void openKeyPage()}>
					TMDB 키 발급 페이지 <ExternalLink size={15} />
				</button>
			</div>
			<form
				onSubmit={event => {
					event.preventDefault()
					void perform('save')
				}}
			>
				<label htmlFor="tmdb-credential">
					TMDB API Key 또는 Read Access Token <span className="muted">{status?.hasCredential ? '· 저장됨' : '· 선택 사항'}</span>
				</label>
				<div className="poster-key-row">
					<input id="tmdb-credential" type="password" autoComplete="off" spellCheck={false} maxLength={4096} value={credential} placeholder={status?.hasCredential ? '다른 키로 바꾸려면 새로 입력하세요' : 'TMDB 계정 설정 → API에서 복사해 주세요'} onChange={event => setCredential(event.target.value)} disabled={disabled} />
					<button className="button secondary" disabled={disabled || !credential.trim()}>
						키 저장
					</button>
					{(status?.hasCredential || status?.credentialProblem) && (
						<button type="button" className="text-button" disabled={disabled} onClick={() => void perform('clear')}>
							키 삭제
						</button>
					)}
				</div>
				<p className="footnote">키는 이 기기의 보안 저장소로 암호화해 보관합니다. 감상 기록은 TMDB에 전송하지 않아요.</p>
			</form>
			{status?.credentialProblem && (
				<p className="inline-error" role="alert">
					저장된 키를 읽지 못했어요. 키를 다시 입력해 주세요.
				</p>
			)}
			<div className="poster-sync-actions">
				<label className="poster-refresh">
					<input type="checkbox" checked={refresh} disabled={disabled} onChange={event => setRefresh(event.target.checked)} />
					저장된 TMDB 포스터도 새로 받기
				</label>
				<button type="button" className="button primary" disabled={disabled || !status?.hasCredential} onClick={() => void perform('start')}>
					<Download size={17} />
					{status?.running ? '포스터 가져오는 중…' : '포스터 자동 가져오기'}
				</button>
				{status?.running && (
					<button type="button" className="button secondary" disabled={busy || status.cancelled} onClick={() => void perform('cancel')}>
						{status.cancelled ? '중지하는 중…' : '가져오기 중지'}
					</button>
				)}
			</div>
			<p className="footnote">직접 선택한 이미지는 유지됩니다. 영화 상세에서 언제든 원하는 JPG·PNG로 바꿀 수 있어요.</p>
			{status && status.total > 0 && (
				<div className="poster-progress">
					<progress max={status.total} value={status.completed} aria-label="포스터 가져오기 진행률" />
					<p role="status">{status.running ? `${status.completed} / ${status.total}편 · ${status.currentTitle}` : `${status.cancelled ? '가져오기 중지' : status.completed < status.total ? '가져오기 중단' : '가져오기 완료'} · ${status.saved}편 저장 · ${status.skipped}편 유지 · ${status.errors.length}편 실패${status.completed < status.total ? ` · ${status.total - status.completed}편 남음` : ''}`}</p>
					{status.errors.length > 0 && (
						<details open>
							<summary>가져오지 못한 포스터 {status.errors.length}편</summary>
							<ul>
								{status.errors.map(item => (
									<li key={item.title}>
										<strong>{item.title}</strong>
										<span>{item.message}</span>
									</li>
								))}
							</ul>
							<p className="footnote">빈 포스터부터 이어서 받으려면 ‘저장된 TMDB 포스터도 새로 받기’ 옵션을 꺼 주세요.</p>
						</details>
					)}
				</div>
			)}
			{message && (
				<p role="status" className="poster-message">
					{message}
				</p>
			)}
			{error && (
				<p role="alert" className="inline-error">
					{error}
				</p>
			)}
			<p className="footnote">감상 기록 JSON 백업에는 포스터 이미지와 API 키가 포함되지 않습니다.</p>
		</section>
	)
}

export function PosterPicker({ movie, data }: { movie: Movie; data: MarathonData }) {
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState('')
	async function change(custom: boolean) {
		if (busy) return
		setBusy(true)
		setError('')
		try {
			if (custom) checked(await window.electronAPI.posters.chooseCustom(movie.id))
			else checked(await window.electronAPI.posters.useAutomatic(movie.id))
			await data.refreshPosters()
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : '포스터를 변경하지 못했어요.')
		} finally {
			setBusy(false)
		}
	}
	return (
		<div className="poster-picker">
			<div className="poster-picker-actions">
				<button type="button" className="button secondary" disabled={busy} onClick={() => void change(true)}>
					<ImagePlus size={17} />
					{busy ? '처리하는 중…' : '내 이미지로 변경'}
				</button>
				{movie.poster?.source === 'custom' && (
					<button type="button" className="text-button" disabled={busy} onClick={() => void change(false)}>
						<RotateCcw size={15} />
						{movie.poster.hasAutomatic ? '자동 포스터로 되돌리기' : '기본 커버로 되돌리기'}
					</button>
				)}
			</div>
			<p className="footnote">{movie.poster?.source === 'custom' ? '내가 선택한 이미지' : movie.poster?.source === 'tmdb' ? 'TMDB 포스터 · 기기에 저장됨' : '나만의 우주 커버'} · JPG / PNG · 최대 10MB</p>
			{!movie.poster && (
				<Link className="text-link" to="/settings">
					설정에서 실제 포스터 자동 가져오기 <ExternalLink size={14} />
				</Link>
			)}
			{error && (
				<p role="alert" className="inline-error">
					{error}
				</p>
			)}
		</div>
	)
}
