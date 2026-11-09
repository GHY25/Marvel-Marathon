import type { MarvelMarathonAPI } from '../shared/types'
declare global {
	interface Window {
		electronAPI: MarvelMarathonAPI
	}
}
export {}
