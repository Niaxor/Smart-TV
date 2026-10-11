// Browse by streaming service: which services a region has, and the rows a
// service's page shows.
//
// The rich version comes from the Seerr provider-browse fork's /browse API
// (Top 10, trending, new, because-you-requested...). Against a stock Seerr that
// API answers 404, so the same shapes are built from the watch-provider and
// discover endpoints every Seerr has; those rows just lack Top 10 and the
// request-based row.

import $L from '@enact/i18n/$L';
import seerrApi, {discoverFiltered} from '../services/seerrApi';

export const DEFAULT_REGION = 'AU';
const REGION_STORAGE_KEY = 'moonfin.serviceBrowse.region';

// TMDB's display priority puts niche services above the big ones, so regions
// with a known line-up get an explicit order (TMDB watch-provider ids, checked
// against /watchproviders/{movies,tv}?watchRegion=AU on 2026-10-12). Mirrors
// FEATURED_BY_REGION in the Seerr fork.
export const FEATURED_BY_REGION = {
	AU: [8, 337, 119, 21, 385, 1899, 350, 531, 134, 283, 135, 132, 378, 246, 82, 151]
};

const NON_SERVICE_PATTERN = /(amazon channel|apple tv channel|roku premium channel|store|google play|amazon video|^youtube$|microsoft|fetch tv|justwatch|rakuten|plex channel|with ads$|netflix kids|netflix basic)/i;

const TMDB_LOGO_BASE = 'https://image.tmdb.org/t/p/w300';

export const JUSTWATCH_ATTRIBUTION = 'Streaming availability data provided by JustWatch (via TMDB)';

export const readSavedRegion = () => {
	try {
		const value = window.localStorage.getItem(REGION_STORAGE_KEY);
		return value && /^[A-Z]{2}$/.test(value) ? value : null;
	} catch {
		return null;
	}
};

export const saveRegion = (region) => {
	try {
		window.localStorage.setItem(REGION_STORAGE_KEY, region);
	} catch {
		// Storage can be unavailable; the region then only lasts this session.
	}
};

const isNotFound = (err) => err && (err.status === 404 || /404/.test(String(err.message)));

// Region list for the switcher, plus the region to start on.
export const loadRegions = async () => {
	try {
		const data = await seerrApi.getBrowseRegions();
		if (data && Array.isArray(data.regions)) {
			return {
				defaultRegion: readSavedRegion() || data.defaultRegion || DEFAULT_REGION,
				regions: data.regions.map((r) => ({code: r.iso_3166_1, name: r.name}))
			};
		}
	} catch (err) {
		if (!isNotFound(err)) throw err;
	}
	const regions = (await seerrApi.getWatchProviderRegions()) || [];
	return {
		defaultRegion: readSavedRegion() || DEFAULT_REGION,
		regions: regions
			.map((r) => ({code: r.iso_3166_1, name: r.english_name || r.iso_3166_1}))
			.sort((a, b) => a.name.localeCompare(b.name))
	};
};

// Merges movie and TV provider lists into one service list, in the same order
// the server-side browse API uses.
export const mergeProviders = (movieProviders = [], tvProviders = [], region) => {
	const merged = new Map();
	const add = (provider, mediaType) => {
		const existing = merged.get(provider.id);
		const priority = provider.displayPriority ?? 999;
		if (existing) {
			if (existing.mediaTypes.indexOf(mediaType) < 0) existing.mediaTypes.push(mediaType);
			existing.displayPriority = Math.min(existing.displayPriority, priority);
			return;
		}
		merged.set(provider.id, {
			id: provider.id,
			name: provider.name,
			logoUrl: provider.logoPath ? `${TMDB_LOGO_BASE}${provider.logoPath}` : null,
			displayPriority: priority,
			mediaTypes: [mediaType],
			featured: !NON_SERVICE_PATTERN.test(provider.name || ''),
			hasTop10: provider.id === 8
		});
	};
	movieProviders.forEach((p) => add(p, 'movie'));
	tvProviders.forEach((p) => add(p, 'tv'));

	const services = Array.from(merged.values());
	const curated = FEATURED_BY_REGION[region];
	if (curated) {
		const rank = (id) => (curated.indexOf(id) < 0 ? Number.MAX_SAFE_INTEGER : curated.indexOf(id));
		services.forEach((s) => {
			s.featured = curated.indexOf(s.id) >= 0;
		});
		services.sort((a, b) => rank(a.id) - rank(b.id) || a.displayPriority - b.displayPriority);
	} else {
		services.sort((a, b) => a.displayPriority - b.displayPriority || String(a.name).localeCompare(String(b.name)));
	}
	return services.filter((s) => s.featured).slice(0, 16);
};

export const loadServices = async (region) => {
	try {
		const data = await seerrApi.getBrowseServices(region);
		if (data && Array.isArray(data.services)) {
			return {
				region: data.region || region,
				services: data.services,
				attribution: data.attribution || [JUSTWATCH_ATTRIBUTION],
				source: 'browse'
			};
		}
	} catch (err) {
		if (!isNotFound(err)) throw err;
	}
	const [movies, tv] = await Promise.all([
		seerrApi.getWatchProviders('movie', region).catch(() => []),
		seerrApi.getWatchProviders('tv', region).catch(() => [])
	]);
	return {
		region,
		services: mergeProviders(movies || [], tv || [], region),
		attribution: [JUSTWATCH_ATTRIBUTION],
		source: 'fallback'
	};
};

const isoDaysAgo = (days) => new Date(Date.now() - days * 86400000).toISOString().split('T')[0];

// Rows for a service when the server has no /browse API. Each row knows how to
// fetch a page of standard discover results.
export const fallbackRows = (service, region) => {
	const base = {watchProviders: String(service.id), watchRegion: region};
	const has = (type) => !service.mediaTypes || service.mediaTypes.indexOf(type) >= 0;
	const rows = [
		{id: 'trending-tv', mediaType: 'tv', title: $L('Trending Shows on {service}'), params: {sortBy: 'popularity.desc', releaseDateGte: isoDaysAgo(365), releaseDateLte: isoDaysAgo(0)}},
		{id: 'trending-movies', mediaType: 'movie', title: $L('Trending Movies on {service}'), params: {sortBy: 'popularity.desc', releaseDateGte: isoDaysAgo(365), releaseDateLte: isoDaysAgo(0)}},
		{id: 'new-tv', mediaType: 'tv', title: $L('New Shows on {service}'), params: {sortBy: 'first_air_date.desc', releaseDateGte: isoDaysAgo(120), releaseDateLte: isoDaysAgo(0)}},
		{id: 'new-movies', mediaType: 'movie', title: $L('New Movies on {service}'), params: {sortBy: 'primary_release_date.desc', releaseDateGte: isoDaysAgo(120), releaseDateLte: isoDaysAgo(0)}},
		{id: 'popular-tv', mediaType: 'tv', title: $L('Popular Shows on {service}'), params: {sortBy: 'popularity.desc'}},
		{id: 'popular-movies', mediaType: 'movie', title: $L('Popular Movies on {service}'), params: {sortBy: 'popularity.desc'}},
		{id: 'top-rated-tv', mediaType: 'tv', title: $L('Critically Acclaimed Shows on {service}'), params: {sortBy: 'vote_average.desc', voteCountGte: 300}},
		{id: 'top-rated-movies', mediaType: 'movie', title: $L('Critically Acclaimed Movies on {service}'), params: {sortBy: 'vote_average.desc', voteCountGte: 1000}}
	];
	return rows.filter((row) => has(row.mediaType)).map((row) => ({
		id: row.id,
		title: row.title.replace('{service}', service.name),
		mediaType: row.mediaType,
		ranked: false,
		fetchPage: (page) => discoverFiltered(row.mediaType, {...base, ...row.params, page})
	}));
};

export const loadServiceHome = async (service, region) => {
	try {
		const home = await seerrApi.getBrowseServiceHome(service.id, region);
		if (home && Array.isArray(home.rows)) {
			return {
				service: {...service, ...home.service},
				region: home.region || region,
				attribution: home.attribution || [JUSTWATCH_ATTRIBUTION],
				source: 'browse',
				rows: home.rows.map((row) => ({
					id: row.id,
					title: row.title,
					mediaType: row.mediaType,
					ranked: !!row.ranked,
					fetchPage: (page) => seerrApi.getBrowseRow(row.path, page)
				}))
			};
		}
	} catch (err) {
		if (!isNotFound(err)) throw err;
	}
	return {
		service,
		region,
		attribution: [JUSTWATCH_ATTRIBUTION],
		source: 'fallback',
		rows: fallbackRows(service, region)
	};
};
