import { Check, Moon, Sun } from 'lucide-react'
import { useTheme, type Theme } from '../hooks/useTheme'

export function ThemeToggle() {
	const { theme, setTheme } = useTheme()
	const isDark = theme === 'dark'
	return (
		<button type="button" className="theme-toggle" aria-label={isDark ? '밝은 테마로 전환' : '어두운 테마로 전환'} title={isDark ? '밝은 테마로 전환' : '어두운 테마로 전환'} onClick={() => setTheme(isDark ? 'light' : 'dark')}>
			{isDark ? <Sun size={15} /> : <Moon size={15} />}
			<span>{isDark ? '라이트 모드' : '다크 모드'}</span>
		</button>
	)
}

const options: { theme: Theme; title: string; description: string; Icon: typeof Moon }[] = [
	{ theme: 'dark', title: '밤의 우주', description: '깊은 밤하늘에서 빛나는 나의 별들', Icon: Moon },
	{ theme: 'light', title: '빛의 우주', description: '밝고 편안한 빛으로 펼치는 별 지도', Icon: Sun },
]

export function ThemePicker() {
	const { theme, setTheme } = useTheme()
	return (
		<section className="panel theme-panel" aria-labelledby="theme-heading">
			<div className="section-heading">
				<div>
					<h2 id="theme-heading">나의 우주 테마</h2>
					<p>오늘의 기분에 맞는 하늘을 골라보세요. 다음 실행에도 기억할게요.</p>
				</div>
			</div>
			<div className="theme-options" role="group" aria-label="화면 테마">
				{options.map(option => (
					<button type="button" key={option.theme} className={`theme-option theme-option-${option.theme}`} aria-label={option.theme === 'dark' ? '어두운 테마' : '밝은 테마'} aria-pressed={theme === option.theme} onClick={() => setTheme(option.theme)}>
						<span className={`theme-preview theme-preview-${option.theme}`} aria-hidden="true">
							<span className="theme-preview-sidebar" />
							<span className="theme-preview-sky">
								<span className="theme-preview-orbit" />
								<span className="theme-preview-star star-a" />
								<span className="theme-preview-star star-b" />
								<span className="theme-preview-star star-c" />
								<span className="theme-preview-star star-d" />
							</span>
							<span className="theme-preview-cards">
								<span />
								<span />
								<span />
							</span>
						</span>
						<span className="theme-option-details">
							<span className="theme-option-title">
								<option.Icon size={16} />
								{option.title}
							</span>
							<span className="theme-option-description">{option.description}</span>
						</span>
						<span className="theme-selected" aria-hidden="true">
							{theme === option.theme && <Check size={13} />}
						</span>
					</button>
				))}
			</div>
		</section>
	)
}
