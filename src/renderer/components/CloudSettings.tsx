import { useState } from 'react'
import { Cloud, RefreshCw, Smartphone, ExternalLink } from 'lucide-react'
import type { MarathonData } from '../hooks/useMarathonData'
import { isWeb } from '../platform'
import { CLOUD_ORIGIN } from '../../shared/cloud'

export function CloudSettings({ data }: { data: MarathonData }) {
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState('')
	const status = data.syncStatus
	async function act(toggle = false) {
		setBusy(true)
		setError('')
		try {
			if (toggle) await data.setSyncEnabled(!status?.enabled)
			else await data.syncNow()
		} catch (error) {
			setError(error instanceof Error ? error.message : '연결을 확인해 주세요.')
		} finally {
			setBusy(false)
		}
	}
	return (
		<section className="panel cloud-settings">
			<div className="cloud-heading">
				<Cloud size={22} />
				<div>
					<h2>어디서든 이어지는 나의 우주</h2>
					<p>PC와 아이폰에서 감상 기록과 작품 포스터를 함께 보관해요.</p>
				</div>
			</div>
			<div className="cloud-status" role="status">
				<span className={`cloud-dot${status?.enabled && !status.error ? ' connected' : ''}`} />
				{status?.running ? '기록을 동기화하고 있어요…' : !status?.enabled ? '이 기기의 동기화가 꺼져 있어요' : status.pending ? `${status.pending}개의 변경사항을 전송할 예정이에요` : status.lastSyncedAt ? `동기화 완료 · ${new Date(status.lastSyncedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}` : '클라우드에 연결하는 중이에요'}
			</div>
			{(error || status?.error) && (
				<p className="inline-error" role="alert">
					{error || status?.error}
				</p>
			)}
			<div className="cloud-actions">
				<button className="button primary" disabled={busy || status?.running || !status?.enabled} onClick={() => void act()}>
					<RefreshCw size={15} />
					지금 동기화
				</button>
				<button className="button secondary" disabled={busy} onClick={() => void act(true)}>
					{status?.enabled ? '이 기기 동기화 끄기' : '동기화 켜기'}
				</button>
			</div>
			{isWeb ? (
				<div className="cloud-install">
					<Smartphone size={20} />
					<p>
						<strong>아이폰 홈 화면에 설치하기</strong>
						<br />
						Safari의 공유 버튼 → 홈 화면에 추가 → 추가를 누르세요. 처음 한 번 온라인으로 열면 오프라인에서도 기록할 수 있어요.
					</p>
				</div>
			) : (
				<button className="text-link" onClick={() => void window.electronAPI.openExternal(CLOUD_ORIGIN)}>
					아이폰에서 사용할 웹앱 열기 <ExternalLink size={14} />
				</button>
			)}
			{isWeb && (
				<a className="text-link" href="/signin-with-chatgpt?return_to=/">
					연결 계정으로 다시 로그인
				</a>
			)}
			<p className="footnote">같은 기록이나 포스터를 양쪽에서 수정하면 나중 수정한 내용이 반영됩니다. 동기화는 앱을 열어 둔 동안 실행되고, 오프라인 변경사항은 다시 연결될 때 반영돼요. 저장된 포스터는 오프라인에서도 볼 수 있습니다.</p>
		</section>
	)
}
