// Helpers for the per-episode request status that the request-status Seerr fork
// serves at GET /api/v1/tv/:id/status. Everything here is pure so it can be
// tested without a TV.

import $L from '@enact/i18n/$L';

// One entry per episode state the server can report. color is a class name in
// SeerrRequestStatus.module.less.
const STATE_META = {
	available: {label: () => $L('Available'), color: 'available'},
	importing: {label: () => $L('Importing'), color: 'importing'},
	downloading: {label: () => $L('Downloading'), color: 'downloading'},
	grabbed: {label: () => $L('Grabbed'), color: 'grabbed'},
	searching: {label: () => $L('Searching'), color: 'searching'},
	search_queued: {label: () => $L('Queued for search'), color: 'queued'},
	not_found: {label: () => $L('Not found'), color: 'notFound'},
	failed: {label: () => $L('Failed'), color: 'failed'},
	wanted: {label: () => $L('Waiting'), color: 'queued'},
	unaired: {label: () => $L('Not aired'), color: 'unaired'},
	empty: {label: () => $L('Nothing requested'), color: 'unaired'}
};

export const stateLabel = (state) => (STATE_META[state] || STATE_META.wanted).label();
export const stateColor = (state) => (STATE_META[state] || STATE_META.wanted).color;

// Short reason text the TV shows on one line. The server's message is English;
// the codes are mapped here so they translate.
const REASON_TEXT = {
	no_releases: () => $L('No releases on the indexers'),
	no_suitable_release: () => $L('No suitable release found'),
	custom_format: () => $L('Only foreign or blocked releases'),
	quality: () => $L('Only unwanted qualities'),
	size: () => $L('Only wrong-size releases'),
	packs_only: () => $L('Only full packs that could not be used'),
	blocklisted: () => $L('Only blocklisted releases'),
	seeders: () => $L('Not enough seeders'),
	unparsable: () => $L('No release matched this episode'),
	already_queued: () => $L('Already queued'),
	download_failed: () => $L('Download failed'),
	import_blocked: () => $L('Import needs attention'),
	stalled: () => $L('Download stalled'),
	delayed: () => $L('Waiting for delay profile'),
	client_unavailable: () => $L('Download client offline'),
	paused: () => $L('Paused'),
	not_in_client: () => $L('Missing from download client'),
	not_searched_yet: () => $L('Waiting for first search')
};

export const reasonText = (reason) => {
	if (!reason) return null;
	const text = REASON_TEXT[reason.code];
	return text ? text() : (reason.message || null);
};

// 75 -> "1 min", 4000 -> "1 h 7 min", 200000 -> "2 d 7 h"
export const formatEta = (seconds) => {
	if (typeof seconds !== 'number' || !(seconds >= 0)) return null;
	if (seconds < 60) return $L('<1 min');
	const minutes = Math.round(seconds / 60);
	if (minutes < 60) return `${minutes} ${$L('min')}`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) {
		const rest = minutes % 60;
		return rest ? `${hours} ${$L('h')} ${rest} ${$L('min')}` : `${hours} ${$L('h')}`;
	}
	const days = Math.floor(hours / 24);
	const restHours = hours % 24;
	return restHours ? `${days} ${$L('d')} ${restHours} ${$L('h')}` : `${days} ${$L('d')}`;
};

const pad = (n) => (n < 10 ? `0${n}` : `${n}`);

// "S01E05", and the absolute number for anime when it differs: "S02E01 · #36"
export const episodeCode = (episode) => {
	const code = `S${pad(episode.seasonNumber)}E${pad(episode.episodeNumber)}`;
	const abs = episode.absoluteEpisodeNumber;
	return abs && abs !== episode.episodeNumber ? `${code} · #${abs}` : code;
};

const formatAirDate = (iso) => {
	const d = new Date(iso);
	if (isNaN(d.getTime())) return null;
	return `${$L('Airs')} ${d.toLocaleDateString(undefined, {month: 'short', day: 'numeric', year: 'numeric'})}`;
};

// "5 min ago", "3 h ago", "2 d ago"
export const formatAgo = (iso, now = Date.now()) => {
	const t = iso ? Date.parse(iso) : NaN;
	if (isNaN(t)) return null;
	const minutes = Math.max(0, Math.round((now - t) / 60000));
	if (minutes < 1) return $L('just now');
	if (minutes < 60) return `${minutes} ${$L('min ago')}`;
	const hours = Math.round(minutes / 60);
	if (hours < 48) return `${hours} ${$L('h ago')}`;
	return `${Math.round(hours / 24)} ${$L('d ago')}`;
};

// The line under an episode's title: what is happening right now.
export const episodeDetail = (episode, now = Date.now()) => {
	switch (episode.state) {
		case 'downloading': {
			const parts = [];
			if (typeof episode.downloadProgress === 'number') {
				parts.push(`${Math.floor(episode.downloadProgress * 100)}%`);
			}
			const eta = formatEta(episode.etaSeconds);
			if (eta) parts.push(eta);
			if (episode.progressScope === 'release') parts.push($L('whole pack'));
			const reason = reasonText(episode.reason);
			if (reason) parts.push(reason);
			return parts.join(' · ');
		}
		case 'failed': {
			const reason = reasonText(episode.reason) || episode.detail || null;
			const why = episode.reason?.details?.[0];
			return why && why !== reason ? `${reason} · ${why}` : reason;
		}
		case 'not_found': {
			const reason = reasonText(episode.reason) || episode.detail || null;
			const ago = formatAgo(episode.lastSearchAt, now);
			return ago ? `${reason} · ${$L('searched')} ${ago}` : reason;
		}
		case 'grabbed':
		case 'wanted':
			return reasonText(episode.reason) || episode.detail || null;
		case 'searching':
			return episode.detail === 'Searched, choosing a release'
				? $L('Choosing a release')
				: $L('Searching indexers now');
		case 'search_queued':
			return $L('Waiting for its turn');
		case 'importing':
			return $L('Adding to the library');
		case 'unaired':
			return episode.airDateUtc ? formatAirDate(episode.airDateUtc) : $L('No air date yet');
		default:
			return null;
	}
};

// "12 of 35 · 3 downloading · 1 not found · 20 min left"
export const rollupText = (rollup) => {
	if (!rollup || !rollup.total) return '';
	const parts = [`${rollup.available} ${$L('of')} ${rollup.total}`];
	const c = rollup.counts || {};
	const add = (n, label) => { if (n > 0) parts.push(`${n} ${label}`); };
	add(c.downloading, $L('downloading'));
	add(c.importing, $L('importing'));
	add(c.searching, $L('searching'));
	add((c.grabbed || 0), $L('grabbed'));
	add((c.search_queued || 0) + (c.wanted || 0), $L('waiting'));
	add(c.not_found, $L('not found'));
	add(c.failed, $L('failed'));
	const eta = formatEta(rollup.etaSeconds);
	if (eta) parts.push(`${eta} ${$L('left')}`);
	return parts.join(' · ');
};

// Whether there is anything worth drawing: the series is in Sonarr, has
// requested episodes, and they are not all in the library yet.
export const hasRequestProgress = (status) =>
	Boolean(status && status.phase === 'in_sonarr' && status.episodes && status.episodes.length > 0 &&
		status.overall && status.overall.state !== 'available' && status.overall.state !== 'empty');

const MIN_POLL_S = 5;
const MAX_POLL_S = 300;

export const requestStatusPollMs = (status) => {
	const s = status && typeof status.refreshSeconds === 'number' ? status.refreshSeconds : 60;
	return Math.min(Math.max(s, MIN_POLL_S), MAX_POLL_S) * 1000;
};

// Episodes of one season, in order.
export const episodesOfSeason = (status, seasonNumber) =>
	(status?.episodes || []).filter((e) => e.seasonNumber === seasonNumber);

// Runs of available episodes collapse into one row ("S01E01–E12 · 12 available")
// so the rows that need attention are near the top of a long season.
export const MIN_COLLAPSED_RUN = 3;

export const groupEpisodeRows = (episodes) => {
	const rows = [];
	let run = [];
	const flush = () => {
		if (run.length >= MIN_COLLAPSED_RUN) {
			rows.push({type: 'range', key: `range-${run[0].sonarrEpisodeId}`, episodes: run});
		} else {
			run.forEach((e) => rows.push({type: 'episode', key: `ep-${e.sonarrEpisodeId}`, episode: e}));
		}
		run = [];
	};
	(episodes || []).forEach((e) => {
		if (e.state === 'available') {
			run.push(e);
		} else {
			flush();
			rows.push({type: 'episode', key: `ep-${e.sonarrEpisodeId}`, episode: e});
		}
	});
	flush();
	return rows;
};

export const rangeLabel = (episodes) => {
	const first = episodes[0];
	const last = episodes[episodes.length - 1];
	return `S${pad(first.seasonNumber)}E${pad(first.episodeNumber)}–E${pad(last.episodeNumber)}`;
};
