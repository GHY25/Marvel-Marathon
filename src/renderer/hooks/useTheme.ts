import { createContext, createElement, useCallback, useContext, useLayoutEffect, useState, type ReactNode } from 'react'

export type Theme = 'dark' | 'light'
const STORAGE_KEY = 'marvel-marathon.theme'
const ThemeContext = createContext<{ theme: Theme; setTheme: (theme: Theme) => void } | null>(null)

function readTheme(): Theme {
	try {
		return localStorage.getItem(STORAGE_KEY) === 'light' ? 'light' : 'dark'
	} catch {
		return 'dark'
	}
}

export function ThemeProvider({ children }: { children: ReactNode }) {
	const [theme, updateTheme] = useState<Theme>(readTheme)
	useLayoutEffect(() => {
		document.documentElement.dataset.theme = theme
		document.documentElement.style.colorScheme = theme
	}, [theme])
	const setTheme = useCallback((nextTheme: Theme) => {
		updateTheme(nextTheme)
		try {
			localStorage.setItem(STORAGE_KEY, nextTheme)
		} catch {
			// Appearance still changes for this session if local storage is unavailable.
		}
	}, [])
	return createElement(ThemeContext.Provider, { value: { theme, setTheme } }, children)
}

export function useTheme() {
	const context = useContext(ThemeContext)
	if (!context) throw new Error('Theme controls must be inside ThemeProvider')
	return context
}
