// A Naruto-sized request in every state the status endpoint can report, shaped
// exactly like GET /api/v1/tv/:id/status from the request-status Seerr fork.
// Used by the dev-only preview (?preview=request-status) and by tests.

const NOW = Date.now();
const day = 86400000;

const STATES_S1 = [
	// [state, downloadProgress, etaSeconds, reasonCode, detail]
	['available'], ['available'], ['available'], ['available'], ['available'],
	['available'], ['available'], ['available'], ['available'], ['available'],
	['available'], ['available'],
	['importing', 1],
	['downloading', 0.82, 95],
	['downloading', 0.41, 410],
	['downloading', 0.07, 980],
	['grabbed', 0, null, null, 'Queued in the bundle, earlier episodes first'],
	['grabbed', 0, null, null, 'Queued in the bundle, earlier episodes first'],
	['grabbed', 0, null, null, 'Queued in the bundle, earlier episodes first'],
	['grabbed', 0, null, null, 'Queued in the bundle, earlier episodes first'],
	['failed', 0, null, 'download_failed', 'Torrent has no seeders'],
	['not_found', null, null, 'custom_format'],
	['not_found', null, null, 'packs_only'],
	['not_found', null, null, 'no_releases']
];

const TITLES = [
	'Enter: Naruto Uzumaki!', 'My Name is Konohamaru!', 'Sasuke and Sakura: Friends or Foes?',
	'Pass or Fail: Survival Test', 'You Failed! Kakashi\'s Final Decision', 'A Dangerous Mission! Journey to the Land of Waves!',
	'The Assassin of the Mist!', 'The Oath of Pain', 'Kakashi: Sharingan Warrior', 'The Forest of Chakra',
	'The Land Where a Hero Once Lived', 'Battle on the Bridge! Zabuza Returns!', 'Haku\'s Secret Jutsu: Crystal Ice Mirrors',
	'The Number One Hyperactive, Knucklehead Ninja Joins the Fight!', 'Zero Visibility: The Sharingan Shatters',
	'The Broken Seal', 'White Past: Hidden Ambition', 'The Weapons Known as Shinobi',
	'The Demon in the Snow', 'A New Chapter Begins: The Chunin Exam!', 'Identify Yourself: Powerful New Rivals',
	'Chunin Challenge: Rock Lee vs. Sasuke!', 'Genin Takedown! All Nine Rookies Face Off!', 'Start Your Engines: The Chunin Exam Begins!'
];

const REASONS = {
	custom_format: {code: 'custom_format', message: 'Only releases rejected by custom formats', details: ['12 × Only releases rejected by custom formats (Foreign subs or dubs)']},
	packs_only: {code: 'packs_only', message: 'Only season packs or bundles that could not be used'},
	no_releases: {code: 'no_releases', message: 'No releases found on the indexers'},
	download_failed: {code: 'download_failed', message: 'Download failed', details: ['Torrent has no seeders']}
};

const episode = (season, number, abs, row, title) => {
	const [state, downloadProgress = null, etaSeconds = null, reasonCode = null, detail = null] = row;
	return {
		sonarrEpisodeId: abs,
		seasonNumber: season,
		episodeNumber: number,
		absoluteEpisodeNumber: abs,
		title,
		airDateUtc: new Date(NOW - (400 - abs) * 7 * day).toISOString(),
		state,
		progress: state === 'available' || state === 'importing' ? 1 : (downloadProgress || 0),
		downloadProgress: state === 'downloading' || state === 'importing' ? downloadProgress : null,
		progressScope: state === 'downloading' || state === 'importing' || state === 'grabbed' ? 'file' : null,
		sizeBytes: state === 'downloading' ? 285000000 : null,
		sizeLeftBytes: state === 'downloading' ? Math.round(285000000 * (1 - downloadProgress)) : null,
		etaSeconds,
		releaseTitle: state === 'downloading' || state === 'grabbed' ? '[Anime Time] Naruto Complete (001-220 + Movies) [BD] [Dual Audio]' : null,
		downloadId: state === 'downloading' || state === 'grabbed' ? 'ABC123' : null,
		reason: reasonCode ? REASONS[reasonCode] : null,
		lastSearchAt: state === 'not_found' ? new Date(NOW - 3600000).toISOString() : null,
		detail
	};
};

const season1 = STATES_S1.map((row, i) => episode(1, i + 1, i + 1, row, TITLES[i]));
// Season 2 still being searched: one episode in flight, the rest queued.
const season2 = Array.from({length: 12}, (_, i) => episode(2, i + 1, 25 + i,
	i === 0 ? ['searching', null, null, null, 'Searching indexers now'] : ['search_queued'],
	`Season 2 episode ${i + 1}`));

const counts = (list) => {
	const c = {available: 0, importing: 0, downloading: 0, grabbed: 0, searching: 0, search_queued: 0, not_found: 0, failed: 0, wanted: 0, unaired: 0};
	list.forEach((e) => { c[e.state] += 1; });
	return c;
};

const rollup = (list, state, etaSeconds) => {
	const c = counts(list);
	const total = list.length - c.unaired;
	const done = list.reduce((sum, e) => sum + e.progress, 0);
	return {
		total,
		percent: Math.min(99, Math.floor((done / total) * 100)),
		available: c.available,
		counts: c,
		state,
		etaSeconds,
		bytesTotal: 4 * 285000000,
		bytesLeft: 1500000000
	};
};

const all = season1.concat(season2);

const requestStatusFixture = {
	tmdbId: 46260,
	is4k: false,
	mediaStatus: 3,
	phase: 'in_sonarr',
	source: 'sonarr-faststart',
	sonarrSeriesId: 1,
	generatedAt: new Date(NOW).toISOString(),
	refreshSeconds: 10,
	overall: rollup(all, 'downloading', 980),
	seasons: [
		{seasonNumber: 1, ...rollup(season1, 'downloading', 980)},
		{seasonNumber: 2, ...rollup(season2, 'searching', null)}
	],
	episodes: all,
	activity: [{command: 'MissingEpisodeSearch', status: 'started', message: 'Searching indexers for [Naruto : S02E01 (25)]. 1 active indexers', startedAt: new Date(NOW - 20000).toISOString()}]
};

export default requestStatusFixture;
