import {
	episodeCode,
	episodeDetail,
	formatEta,
	groupEpisodeRows,
	hasRequestProgress,
	rangeLabel,
	reasonText,
	requestStatusPollMs,
	rollupText,
	stateColor,
	stateLabel
} from './seerrRequestStatus';

const episode = (extra = {}) => ({
	seasonNumber: 1,
	episodeNumber: 5,
	absoluteEpisodeNumber: 5,
	state: 'wanted',
	downloadProgress: null,
	progressScope: null,
	etaSeconds: null,
	reason: null,
	detail: null,
	...extra
});

describe('formatEta', () => {
	test('rounds to the unit that matters', () => {
		expect(formatEta(30)).toBe('<1 min');
		expect(formatEta(75)).toBe('1 min');
		expect(formatEta(4000)).toBe('1 h 7 min');
		expect(formatEta(7200)).toBe('2 h');
		expect(formatEta(200000)).toBe('2 d 7 h');
		expect(formatEta(null)).toBeNull();
		expect(formatEta(-1)).toBeNull();
	});
});

describe('episodeCode', () => {
	test('adds the absolute number only when it differs', () => {
		expect(episodeCode(episode())).toBe('S01E05');
		expect(episodeCode(episode({seasonNumber: 2, episodeNumber: 1, absoluteEpisodeNumber: 36}))).toBe('S02E01 · #36');
		expect(episodeCode(episode({absoluteEpisodeNumber: null}))).toBe('S01E05');
	});
});

describe('episodeDetail', () => {
	test('downloading shows percent, eta and whether it is the whole pack', () => {
		expect(episodeDetail(episode({state: 'downloading', downloadProgress: 0.437, etaSeconds: 600, progressScope: 'release'})))
			.toBe('43% · 10 min · whole pack');
		expect(episodeDetail(episode({state: 'downloading', downloadProgress: 0.5, progressScope: 'file'})))
			.toBe('50%');
	});

	test('not found speaks the reason and when it was searched', () => {
		const now = Date.parse('2026-10-12T10:00:00Z');
		expect(episodeDetail(episode({state: 'not_found', reason: {code: 'custom_format', message: 'x'}})))
			.toBe('Only foreign or blocked releases');
		expect(episodeDetail(episode({state: 'not_found', lastSearchAt: '2026-10-12T07:00:00Z', reason: {code: 'packs_only'}}), now))
			.toBe('Only full packs that could not be used · searched 3 h ago');
		expect(episodeDetail(episode({state: 'not_found', reason: {code: 'something_new', message: 'Server text'}})))
			.toBe('Server text');
	});

	test('failed adds the client message', () => {
		expect(episodeDetail(episode({state: 'failed', reason: {code: 'download_failed', details: ['Torrent has no seeders']}})))
			.toBe('Download failed · Torrent has no seeders');
	});

	test('searching distinguishes querying from choosing', () => {
		expect(episodeDetail(episode({state: 'searching', detail: 'Searching indexers now'}))).toBe('Searching indexers now');
		expect(episodeDetail(episode({state: 'searching', detail: 'Searched, choosing a release'}))).toBe('Choosing a release');
	});
});

describe('rollupText', () => {
	test('lists only the states that are present', () => {
		const text = rollupText({
			total: 35,
			available: 12,
			etaSeconds: 1200,
			counts: {available: 12, downloading: 3, not_found: 1, search_queued: 10, wanted: 9}
		});
		expect(text).toBe('12 of 35 · 3 downloading · 19 waiting · 1 not found · 20 min left');
		expect(rollupText({total: 0})).toBe('');
	});
});

describe('hasRequestProgress', () => {
	const status = (state, extra = {}) => ({phase: 'in_sonarr', episodes: [episode()], overall: {state}, ...extra});
	test('only while something is still on its way', () => {
		expect(hasRequestProgress(status('downloading'))).toBe(true);
		expect(hasRequestProgress(status('not_found'))).toBe(true);
		expect(hasRequestProgress(status('available'))).toBe(false);
		expect(hasRequestProgress(status('downloading', {phase: 'unavailable'}))).toBe(false);
		expect(hasRequestProgress(status('downloading', {episodes: []}))).toBe(false);
		expect(hasRequestProgress(null)).toBe(false);
	});
});

describe('requestStatusPollMs', () => {
	test('follows the server hint within limits', () => {
		expect(requestStatusPollMs({refreshSeconds: 10})).toBe(10000);
		expect(requestStatusPollMs({refreshSeconds: 1})).toBe(5000);
		expect(requestStatusPollMs({refreshSeconds: 9999})).toBe(300000);
		expect(requestStatusPollMs(null)).toBe(60000);
	});
});

describe('labels', () => {
	test('every state has a label and colour, unknown falls back', () => {
		expect(stateLabel('not_found')).toBe('Not found');
		expect(stateColor('downloading')).toBe('downloading');
		expect(stateLabel('mystery')).toBe('Waiting');
		expect(reasonText(null)).toBeNull();
	});
});

describe('groupEpisodeRows', () => {
	const ep = (n, state) => episode({sonarrEpisodeId: n, episodeNumber: n, absoluteEpisodeNumber: n, state});
	test('collapses runs of three or more available episodes', () => {
		const rows = groupEpisodeRows([
			ep(1, 'available'), ep(2, 'available'), ep(3, 'available'),
			ep(4, 'downloading'),
			ep(5, 'available'), ep(6, 'available'),
			ep(7, 'not_found')
		]);
		expect(rows.map((r) => r.type)).toEqual(['range', 'episode', 'episode', 'episode', 'episode']);
		expect(rangeLabel(rows[0].episodes)).toBe('S01E01–E03');
		expect(rows[2].episode.episodeNumber).toBe(5);
	});
});
