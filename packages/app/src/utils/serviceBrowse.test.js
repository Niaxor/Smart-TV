jest.mock('@enact/i18n/$L', () => ({__esModule: true, default: (str) => str}));

jest.mock('../services/seerrApi', () => {
	const api = {
		getBrowseServices: jest.fn(),
		getBrowseServiceHome: jest.fn(),
		getBrowseRow: jest.fn(),
		getBrowseRegions: jest.fn(),
		getWatchProviders: jest.fn(),
		getWatchProviderRegions: jest.fn()
	};
	return {__esModule: true, default: api, discoverFiltered: jest.fn()};
});

import seerrApi, {discoverFiltered} from '../services/seerrApi';
import {mergeProviders, loadServices, loadServiceHome, loadRegions} from './serviceBrowse';

const mockApi = seerrApi;
const mockDiscoverFiltered = discoverFiltered;

const notFound = () => Object.assign(new Error('Moonfin proxy error: 404'), {status: 404});

describe('serviceBrowse', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('merges movie and tv providers in the curated AU order and drops stores', () => {
		const movies = [
			{id: 2, name: 'Apple TV Store', displayPriority: 4, logoPath: '/a.png'},
			{id: 21, name: 'Stan', displayPriority: 12, logoPath: '/s.png'},
			{id: 8, name: 'Netflix', displayPriority: 0, logoPath: '/n.png'}
		];
		const tv = [
			{id: 8, name: 'Netflix', displayPriority: 0, logoPath: '/n.png'},
			{id: 232, name: 'Zee5', displayPriority: 2},
			{id: 337, name: 'Disney Plus', displayPriority: 3}
		];
		const services = mergeProviders(movies, tv, 'AU');
		expect(services.map((s) => s.id)).toEqual([8, 337, 21]);
		expect(services[0].mediaTypes).toEqual(['movie', 'tv']);
		expect(services[0].logoUrl).toBe('https://image.tmdb.org/t/p/w300/n.png');
		expect(services[0].hasTop10).toBe(true);
	});

	it('orders other regions by TMDB priority', () => {
		const services = mergeProviders([
			{id: 1, name: 'B', displayPriority: 5},
			{id: 2, name: 'A', displayPriority: 1},
			{id: 3, name: 'Google Play Movies', displayPriority: 0}
		], [], 'GB');
		expect(services.map((s) => s.id)).toEqual([2, 1]);
	});

	it('uses the browse API when the server has it', async () => {
		mockApi.getBrowseServices.mockResolvedValue({region: 'AU', services: [{id: 8, name: 'Netflix'}], attribution: ['x']});
		const result = await loadServices('AU');
		expect(result.source).toBe('browse');
		expect(result.services).toHaveLength(1);
		expect(mockApi.getWatchProviders).not.toHaveBeenCalled();
	});

	it('falls back to watch providers on a stock Seerr', async () => {
		mockApi.getBrowseServices.mockRejectedValue(notFound());
		mockApi.getWatchProviders.mockImplementation((type) => Promise.resolve(type === 'movie'
			? [{id: 8, name: 'Netflix', displayPriority: 0}]
			: [{id: 21, name: 'Stan', displayPriority: 12}]));
		const result = await loadServices('AU');
		expect(result.source).toBe('fallback');
		expect(result.services.map((s) => s.id)).toEqual([8, 21]);
	});

	it('does not hide real errors behind the fallback', async () => {
		mockApi.getBrowseServices.mockRejectedValue(Object.assign(new Error('boom'), {status: 500}));
		await expect(loadServices('AU')).rejects.toThrow('boom');
	});

	it('maps server rows to page fetchers', async () => {
		mockApi.getBrowseServiceHome.mockResolvedValue({
			region: 'AU',
			service: {id: 8, name: 'Netflix'},
			attribution: ['JustWatch'],
			rows: [{id: 'top10-tv', title: 'Top 10 Shows', mediaType: 'tv', ranked: true, path: '/api/v1/browse/services/8/rows/top10-tv?region=AU'}]
		});
		mockApi.getBrowseRow.mockResolvedValue({results: []});
		const home = await loadServiceHome({id: 8, name: 'Netflix'}, 'AU');
		expect(home.source).toBe('browse');
		expect(home.rows[0].ranked).toBe(true);
		await home.rows[0].fetchPage(2);
		expect(mockApi.getBrowseRow).toHaveBeenCalledWith('/api/v1/browse/services/8/rows/top10-tv?region=AU', 2);
	});

	it('builds discover rows for a service when the browse API is missing', async () => {
		mockApi.getBrowseServiceHome.mockRejectedValue(notFound());
		mockDiscoverFiltered.mockResolvedValue({results: []});
		const home = await loadServiceHome({id: 223, name: 'Hayu', mediaTypes: ['tv']}, 'AU');
		expect(home.source).toBe('fallback');
		expect(home.rows.every((r) => r.mediaType === 'tv')).toBe(true);
		expect(home.rows[0].title).toBe('Trending Shows on Hayu');
		await home.rows[0].fetchPage(1);
		expect(mockDiscoverFiltered).toHaveBeenCalledWith('tv', expect.objectContaining({watchProviders: '223', watchRegion: 'AU', page: 1}));
	});

	it('reads regions from the browse API, else the watch-provider list', async () => {
		mockApi.getBrowseRegions.mockRejectedValue(notFound());
		mockApi.getWatchProviderRegions.mockResolvedValue([
			{iso_3166_1: 'GB', english_name: 'United Kingdom'},
			{iso_3166_1: 'AU', english_name: 'Australia'}
		]);
		const data = await loadRegions();
		expect(data.regions.map((r) => r.code)).toEqual(['AU', 'GB']);
		expect(data.defaultRegion).toBe('AU');
	});
});
