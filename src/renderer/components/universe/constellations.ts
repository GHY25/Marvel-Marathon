import type { Phase } from '../../../shared/types'

export const WORLD_WIDTH = 2400
export const WORLD_HEIGHT = 1600

export type StarPoint = {
	x: number
	y: number
	size: number
	variant: 'cross' | 'diamond' | 'round'
}

export type Constellation = {
	phase: Phase
	name: string
	skyName: string
	latinName: string
	color: string
	x: number
	y: number
	width: number
	height: number
	points: StarPoint[]
	edges: (readonly [number, number])[]
	sourceUrl: string
}

const MUSEUM_GUIDE = 'https://smv.org/documents/58/Constellation_Viewer_ENG_SPAN.pdf'
const NASA_FINDER = 'https://spaceplace.nasa.gov/review/starfinder/star_finder_jan.pdf'

// Original, simplified drawings inspired by familiar sky patterns, not sky coordinates.
// Every point is one movie, in release order; sizes are visual variation, not magnitudes.
export const CONSTELLATIONS: Constellation[] = [
	{
		phase: 1,
		name: '시작의 빛',
		skyName: '카시오페이아자리',
		latinName: 'Cassiopeia',
		color: '#7dafff',
		x: 150,
		y: 300,
		width: 520,
		height: 360,
		points: [
			{ x: 25, y: 85, size: 6, variant: 'cross' },
			{ x: 130, y: 250, size: 8, variant: 'cross' },
			{ x: 235, y: 115, size: 5.5, variant: 'round' },
			{ x: 350, y: 285, size: 7, variant: 'diamond' },
			{ x: 465, y: 130, size: 6.5, variant: 'cross' },
			{ x: 485, y: 35, size: 4.5, variant: 'round' },
		],
		edges: [
			[0, 1],
			[1, 2],
			[2, 3],
			[3, 4],
			[4, 5],
		],
		sourceUrl: MUSEUM_GUIDE,
	},
	{
		phase: 2,
		name: '모험의 빛',
		skyName: '백조자리',
		latinName: 'Cygnus',
		color: '#ed8a84',
		x: 950,
		y: 150,
		width: 520,
		height: 420,
		points: [
			{ x: 290, y: 25, size: 8.5, variant: 'cross' },
			{ x: 245, y: 165, size: 7, variant: 'diamond' },
			{ x: 165, y: 355, size: 6, variant: 'cross' },
			{ x: 35, y: 100, size: 5.5, variant: 'round' },
			{ x: 350, y: 210, size: 4.5, variant: 'round' },
			{ x: 465, y: 265, size: 6.5, variant: 'cross' },
		],
		edges: [
			[0, 1],
			[1, 2],
			[3, 1],
			[1, 4],
			[4, 5],
		],
		sourceUrl: MUSEUM_GUIDE,
	},
	{
		phase: 3,
		name: '연결의 빛',
		skyName: '오리온자리',
		latinName: 'Orion',
		color: '#b49af5',
		x: 1720,
		y: 450,
		width: 550,
		height: 530,
		points: [
			{ x: 270, y: 25, size: 4.5, variant: 'round' },
			{ x: 110, y: 105, size: 9, variant: 'cross' },
			{ x: 430, y: 125, size: 7, variant: 'diamond' },
			{ x: 180, y: 240, size: 6.5, variant: 'cross' },
			{ x: 270, y: 225, size: 7.5, variant: 'diamond' },
			{ x: 360, y: 210, size: 6, variant: 'cross' },
			{ x: 95, y: 465, size: 6, variant: 'round' },
			{ x: 435, y: 450, size: 8.5, variant: 'cross' },
			{ x: 270, y: 305, size: 4.5, variant: 'round' },
			{ x: 255, y: 380, size: 5.5, variant: 'diamond' },
			{ x: 245, y: 455, size: 4, variant: 'round' },
		],
		edges: [
			[0, 1],
			[0, 2],
			[1, 3],
			[2, 5],
			[3, 4],
			[4, 5],
			[3, 6],
			[5, 7],
			[4, 8],
			[8, 9],
			[9, 10],
		],
		sourceUrl: MUSEUM_GUIDE,
	},
	{
		phase: 4,
		name: '확장의 빛',
		skyName: '큰곰자리 · 북두칠성',
		latinName: 'Ursa Major',
		color: '#e8c573',
		x: 340,
		y: 1040,
		width: 590,
		height: 380,
		points: [
			{ x: 25, y: 310, size: 6.5, variant: 'cross' },
			{ x: 120, y: 230, size: 5, variant: 'round' },
			{ x: 225, y: 185, size: 7, variant: 'diamond' },
			{ x: 330, y: 220, size: 6, variant: 'cross' },
			{ x: 510, y: 245, size: 7.5, variant: 'cross' },
			{ x: 550, y: 100, size: 8, variant: 'diamond' },
			{ x: 355, y: 65, size: 5.5, variant: 'round' },
		],
		edges: [
			[0, 1],
			[1, 2],
			[2, 3],
			[3, 4],
			[4, 5],
			[5, 6],
			[6, 3],
		],
		sourceUrl: MUSEUM_GUIDE,
	},
	{
		phase: 5,
		name: '변화의 빛',
		skyName: '사자자리 · 낫',
		latinName: 'Leo',
		color: '#83c8a8',
		x: 1180,
		y: 950,
		width: 380,
		height: 510,
		points: [
			{ x: 320, y: 60, size: 5.5, variant: 'round' },
			{ x: 200, y: 35, size: 6, variant: 'diamond' },
			{ x: 95, y: 125, size: 4.5, variant: 'round' },
			{ x: 125, y: 235, size: 6.5, variant: 'cross' },
			{ x: 255, y: 300, size: 7, variant: 'diamond' },
			{ x: 245, y: 445, size: 9, variant: 'cross' },
		],
		edges: [
			[0, 1],
			[1, 2],
			[2, 3],
			[3, 4],
			[4, 5],
		],
		sourceUrl: MUSEUM_GUIDE,
	},
	{
		phase: 6,
		name: '미래의 빛',
		skyName: '작은개자리',
		latinName: 'Canis Minor',
		color: '#e9a76f',
		x: 1910,
		y: 1230,
		width: 360,
		height: 280,
		points: [
			{ x: 50, y: 55, size: 5.5, variant: 'round' },
			{ x: 300, y: 215, size: 9, variant: 'cross' },
		],
		edges: [[0, 1]],
		sourceUrl: NASA_FINDER,
	},
]
