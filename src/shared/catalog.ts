import type { Movie, Phase } from './types'

export const CATALOG_VERSION = 'mcu-2026-11-05'

// The fixed catalog from the implementation specification. Stable IDs are never
// derived from titles, so metadata corrections cannot orphan viewing history.
const catalog: [title: string, year: number, phase: Phase][] = [
	['Iron Man', 2008, 1],
	['The Incredible Hulk', 2008, 1],
	['Iron Man 2', 2010, 1],
	['Thor', 2011, 1],
	['Captain America: The First Avenger', 2011, 1],
	['The Avengers', 2012, 1],
	['Iron Man 3', 2013, 2],
	['Thor: The Dark World', 2013, 2],
	['Captain America: The Winter Soldier', 2014, 2],
	['Guardians of the Galaxy', 2014, 2],
	['Avengers: Age of Ultron', 2015, 2],
	['Ant-Man', 2015, 2],
	['Captain America: Civil War', 2016, 3],
	['Doctor Strange', 2016, 3],
	['Guardians of the Galaxy Vol. 2', 2017, 3],
	['Spider-Man: Homecoming', 2017, 3],
	['Thor: Ragnarok', 2017, 3],
	['Black Panther', 2018, 3],
	['Avengers: Infinity War', 2018, 3],
	['Ant-Man and the Wasp', 2018, 3],
	['Captain Marvel', 2019, 3],
	['Avengers: Endgame', 2019, 3],
	['Spider-Man: Far From Home', 2019, 3],
	['Black Widow', 2021, 4],
	['Shang-Chi and the Legend of the Ten Rings', 2021, 4],
	['Eternals', 2021, 4],
	['Spider-Man: No Way Home', 2021, 4],
	['Doctor Strange in the Multiverse of Madness', 2022, 4],
	['Thor: Love and Thunder', 2022, 4],
	['Black Panther: Wakanda Forever', 2022, 4],
	['Ant-Man and the Wasp: Quantumania', 2023, 5],
	['Guardians of the Galaxy Vol. 3', 2023, 5],
	['The Marvels', 2023, 5],
	['Deadpool & Wolverine', 2024, 5],
	['Captain America: Brave New World', 2025, 5],
	['Thunderbolts*', 2025, 5],
	['The Fantastic Four: First Steps', 2025, 6],
	['Spider-Man: Brand New Day', 2026, 6],
]

export const MOVIES: Movie[] = catalog.map(([titleEn, releaseYear, phase], index) => ({
	id: `mcu-${String(index + 1).padStart(3, '0')}`,
	titleEn,
	titleKo: null,
	releaseYear,
	phase,
	saga: phase <= 3 ? 'Infinity Saga' : 'Multiverse Saga',
	releaseOrder: index + 1,
}))
