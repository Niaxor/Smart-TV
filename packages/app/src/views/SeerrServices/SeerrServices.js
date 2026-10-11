import {useState, useEffect, useCallback, useRef, useMemo, memo} from 'react';
import Spottable from '@enact/spotlight/Spottable';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import Spotlight from '@enact/spotlight';
import $L from '@enact/i18n/$L';
import {useSeerr} from '../../context/SeerrContext';
import {useSettings} from '../../context/SettingsContext';
import seerrApi from '../../services/seerrApi';
import LoadingSpinner from '../../components/LoadingSpinner';
import {KEYS} from '../../utils/keys';
import {pointerHover} from '../../utils/focusScroll';
import {libraryIdOf} from '../../utils/seerrTarget';
import {loadRegions, loadServices, loadServiceHome, saveRegion} from '../../utils/serviceBrowse';

import discoverCss from '../SeerrDiscover/SeerrDiscover.module.less';
import css from './SeerrServices.module.less';

const SpottableDiv = Spottable('div');
const RowContainer = SpotlightContainerDecorator({enterTo: 'last-focused', restrict: 'self-first'}, 'div');
const GridContainer = SpotlightContainerDecorator({enterTo: 'last-focused', restrict: 'self-first'}, 'div');
const RegionListContainer = SpotlightContainerDecorator({enterTo: 'default-element', restrict: 'self-only'}, 'div');

const PAGE_SIZE = 20;
const CARD_SELECTOR = `.${discoverCss.mediaCard}`;

// Remembered across visits so Back from a title lands on the same service.
let lastService = null;
let lastRegion = null;

const ServiceCard = memo(function ServiceCard({service, index, onSelect, onKeyDown}) {
	const handleClick = useCallback(() => onSelect?.(service), [service, onSelect]);
	return (
		<SpottableDiv
			className={css.serviceCard}
			data-service-index={index}
			spotlightId={`service-card-${index}`}
			onClick={handleClick}
			onKeyDown={onKeyDown}
		>
			{service.logoUrl ? (
				<img className={css.serviceLogo} src={service.logoUrl} alt={service.name} loading="lazy" />
			) : (
				<div className={css.serviceInitial}>{service.name?.[0]}</div>
			)}
			<div className={css.serviceName}>{service.name}</div>
		</SpottableDiv>
	);
});

const TitleCard = memo(function TitleCard({item, ranked, onSelect, onFocus}) {
	const posterUrl = seerrApi.getImageUrl(item.poster_path || item.posterPath, 'w342');
	const title = item.title || item.name;
	const status = item.mediaInfo?.status;
	const mediaType = item.media_type || item.mediaType;
	const handleClick = useCallback(() => onSelect?.(item), [item, onSelect]);
	const handleFocus = useCallback(() => onFocus?.(item), [item, onFocus]);

	return (
		<SpottableDiv
			className={`${discoverCss.mediaCard} ${ranked && item.rank ? css.rankedCard : ''}`}
			onClick={handleClick}
			onFocus={handleFocus}
		>
			{ranked && item.rank ? <div className={css.rankNumber}>{item.rank}</div> : null}
			<div className={`${discoverCss.posterContainer} ${ranked && item.rank ? css.rankedPoster : ''}`}>
				{posterUrl ? (
					<img className={discoverCss.poster} src={posterUrl} alt={title} loading="lazy" />
				) : (
					<div className={discoverCss.noPoster}>{title?.[0]}</div>
				)}
				{mediaType && (
					<div className={`${discoverCss.mediaTypeBadge} ${mediaType === 'movie' ? discoverCss.movieBadge : discoverCss.seriesBadge}`}>
						{mediaType === 'movie' ? $L('Movie') : $L('Series')}
					</div>
				)}
				{status && [2, 3, 4, 5].indexOf(status) >= 0 && (
					<div className={`${discoverCss.availabilityBadge} ${discoverCss[`availability${status}`]}`} />
				)}
			</div>
		</SpottableDiv>
	);
});

const ServiceRow = memo(function ServiceRow({row, rowIndex, onSelectItem, onFocusItem, onNavigate, onRowFocus}) {
	const [items, setItems] = useState([]);
	const [page, setPage] = useState(0);
	const [hasMore, setHasMore] = useState(true);
	const [loading, setLoading] = useState(false);
	const [failed, setFailed] = useState(false);
	const scrollerRef = useRef(null);
	const loadingRef = useRef(false);

	const loadPage = useCallback(async (next) => {
		if (loadingRef.current) return;
		loadingRef.current = true;
		setLoading(true);
		try {
			const data = await row.fetchPage(next);
			const results = (data?.results || []).map((r) => ({
				...r,
				media_type: r.media_type || r.mediaType || row.mediaType
			}));
			setItems((prev) => {
				const seen = new Set(prev.map((i) => `${i.media_type}-${i.id}`));
				return prev.concat(results.filter((r) => !seen.has(`${r.media_type}-${r.id}`)));
			});
			setPage(next);
			setHasMore((data?.page || next) < (data?.totalPages || 1) && results.length >= PAGE_SIZE);
		} catch (err) {
			console.error(`[SeerrServices] row ${row.id} failed:`, err);
			if (next === 1) setFailed(true);
			setHasMore(false);
		} finally {
			loadingRef.current = false;
			setLoading(false);
		}
	}, [row]);

	useEffect(() => {
		loadPage(1);
	}, [loadPage]);

	const handleKeyDown = useCallback((e) => {
		if (e.keyCode === KEYS.UP || e.keyCode === KEYS.DOWN) {
			e.preventDefault();
			e.stopPropagation();
			onNavigate?.(rowIndex, e.keyCode === KEYS.UP ? -1 : 1);
		} else if (e.keyCode === KEYS.LEFT) {
			const first = e.currentTarget.querySelector('.spottable');
			if (first && first.contains(document.activeElement)) {
				e.preventDefault();
				e.stopPropagation();
				Spotlight.focus('navbar');
			}
		}
	}, [rowIndex, onNavigate]);

	const handleFocus = useCallback((e) => {
		onRowFocus?.(rowIndex);
		const card = e.target.closest(CARD_SELECTOR);
		const scroller = scrollerRef.current;
		const hover = pointerHover();
		if (card && scroller) {
			if (!hover) {
				const cardRect = card.getBoundingClientRect();
				const scrollerRect = scroller.getBoundingClientRect();
				if (cardRect.left < scrollerRect.left) {
					scroller.scrollLeft -= (scrollerRect.left - cardRect.left + 50);
				} else if (cardRect.right > scrollerRect.right) {
					scroller.scrollLeft += (cardRect.right - scrollerRect.right + 50);
				}
			}
			const cards = scroller.querySelectorAll(CARD_SELECTOR);
			if (Array.prototype.indexOf.call(cards, card) >= cards.length - 4 && hasMore && !loadingRef.current) {
				loadPage(page + 1);
			}
		}
		const rowEl = hover ? null : e.target.closest(`.${discoverCss.contentRow}`);
		if (rowEl) rowEl.scrollIntoView({behavior: 'smooth', block: 'center'});
	}, [rowIndex, onRowFocus, hasMore, loadPage, page]);

	if (failed || (!loading && page > 0 && items.length === 0)) return null;

	return (
		<div className={discoverCss.contentRow} data-row-index={rowIndex}>
			<h2 className={discoverCss.rowTitle}>{row.title}</h2>
			<div className={discoverCss.rowScroller} ref={scrollerRef}>
				<RowContainer
					className={discoverCss.rowItems}
					spotlightId={`service-row-${rowIndex}`}
					onKeyDown={handleKeyDown}
					onFocus={handleFocus}
				>
					{items.map((item) => (
						<TitleCard
							key={`${item.media_type}-${item.id}`}
							item={item}
							ranked={row.ranked}
							onSelect={onSelectItem}
							onFocus={onFocusItem}
						/>
					))}
					{loading && (
						<div className={discoverCss.rowLoadingIndicator}>
							<span>{$L('Loading...')}</span>
						</div>
					)}
				</RowContainer>
			</div>
		</div>
	);
});

const scrollIntoViewNearest = (e) => e.target.scrollIntoView({block: 'nearest'});

const RegionItem = memo(function RegionItem({region, current, onPick}) {
	const handleClick = useCallback(() => onPick(region.code), [region.code, onPick]);
	return (
		<SpottableDiv
			spotlightId={`region-${region.code}`}
			className={`${css.regionItem} ${current ? css.regionItemCurrent : ''}`}
			onClick={handleClick}
			onFocus={scrollIntoViewNearest}
		>
			<span className={css.regionCode}>{region.code}</span>
			<span>{region.name}</span>
		</SpottableDiv>
	);
});

const RegionPicker = ({regions, current, onPick, onClose}) => {
	useEffect(() => {
		const t = setTimeout(() => {
			if (!Spotlight.focus(`region-${current}`)) Spotlight.focus('region-list');
		}, 50);
		return () => clearTimeout(t);
	}, [current]);

	const handleKeyDown = useCallback((e) => {
		// Escape (desktop), Back on webOS (461) and Tizen (10009)
		if (e.keyCode === 27 || e.keyCode === 461 || e.keyCode === 10009) {
			e.preventDefault();
			e.stopPropagation();
			onClose();
		}
	}, [onClose]);

	return (
		<div className={css.regionOverlay}>
			<div className={css.regionPanel}>
				<h2 className={css.regionHeading}>{$L('Choose region')}</h2>
				<RegionListContainer className={css.regionList} spotlightId="region-list" onKeyDown={handleKeyDown}>
					{regions.map((r) => (
						<RegionItem key={r.code} region={r} current={r.code === current} onPick={onPick} />
					))}
				</RegionListContainer>
			</div>
		</div>
	);
};

/**
 * Browse by streaming service. Opens on a service picker for the current
 * region; picking a service shows its rows (Top 10, trending, new, genres...).
 * The region pill switches region for both screens.
 */
const SeerrServices = ({initialServiceId, onSelectItem, backHandlerRef}) => {
	const {isAuthenticated, isEnabled} = useSeerr();
	const {settings} = useSettings();
	const [region, setRegion] = useState(lastRegion);
	const [regions, setRegions] = useState([]);
	const [services, setServices] = useState([]);
	// A tile for a specific service wins over the one viewed last time.
	const [service, setService] = useState(() => {
		if (initialServiceId) lastService = null;
		return lastService;
	});
	const [home, setHome] = useState(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);
	const [regionPickerOpen, setRegionPickerOpen] = useState(false);
	const [focusedItem, setFocusedItem] = useState(null);
	const [backdropUrl, setBackdropUrl] = useState('');
	const backdropTimer = useRef(null);
	const lastRowRef = useRef(0);
	const initialConsumedRef = useRef(false);

	// Regions first, since everything else is per region.
	useEffect(() => {
		if (!isAuthenticated) return undefined;
		let stale = false;
		loadRegions()
			.then((data) => {
				if (stale) return;
				setRegions(data.regions);
				setRegion((prev) => prev || data.defaultRegion);
			})
			.catch((err) => {
				console.error('[SeerrServices] regions failed:', err);
				if (!stale) setRegion((prev) => prev || 'AU');
			});
		return () => {
			stale = true;
		};
	}, [isAuthenticated]);

	useEffect(() => {
		if (!region) return undefined;
		lastRegion = region;
		let stale = false;
		setLoading(true);
		setError(null);
		loadServices(region)
			.then((data) => {
				if (stale) return;
				setServices(data.services);
				// A deep link (home row tile) opens straight onto that service,
				// once; later region changes leave the picker where it is.
				if (initialServiceId && !lastService && !initialConsumedRef.current) {
					initialConsumedRef.current = true;
					const match = data.services.find((s) => s.id === Number(initialServiceId));
					if (match) setService(match);
				}
			})
			.catch((err) => !stale && setError(err.message || String(err)))
			.finally(() => !stale && setLoading(false));
		return () => {
			stale = true;
		};
	}, [region, initialServiceId]);

	useEffect(() => {
		if (!service || !region) {
			setHome(null);
			return undefined;
		}
		lastService = service;
		let stale = false;
		setHome(null);
		loadServiceHome(service, region)
			.then((data) => !stale && setHome(data))
			.catch((err) => !stale && setError(err.message || String(err)));
		return () => {
			stale = true;
		};
	}, [service, region]);

	// Back closes the region list, then leaves a service for the picker, then
	// leaves the screen.
	useEffect(() => {
		if (!backHandlerRef) return undefined;
		const handler = () => {
			if (regionPickerOpen) {
				setRegionPickerOpen(false);
				return true;
			}
			if (service) {
				lastService = null;
				setService(null);
				setFocusedItem(null);
				setBackdropUrl('');
				return true;
			}
			return false;
		};
		backHandlerRef.current = handler;
		return () => {
			if (backHandlerRef.current === handler) backHandlerRef.current = null;
		};
	}, [backHandlerRef, regionPickerOpen, service]);

	useEffect(() => () => backdropTimer.current && clearTimeout(backdropTimer.current), []);

	// Initial focus whenever the screen changes between picker and service.
	useEffect(() => {
		if (loading || regionPickerOpen) return undefined;
		const t = setTimeout(() => {
			if (service) {
				if (home && !Spotlight.focus(`service-row-${lastRowRef.current}`)) Spotlight.focus('service-row-0');
			} else {
				const idx = lastService ? services.findIndex((s) => s.id === lastService.id) : 0;
				if (!Spotlight.focus(`service-card-${Math.max(idx, 0)}`)) Spotlight.focus('service-grid');
			}
		}, 120);
		return () => clearTimeout(t);
	}, [loading, service, home, services, regionPickerOpen]);

	const handlePickService = useCallback((picked) => {
		lastRowRef.current = 0;
		setFocusedItem(null);
		setService(picked);
	}, []);

	const handlePickRegion = useCallback((code) => {
		saveRegion(code);
		setRegionPickerOpen(false);
		lastRowRef.current = 0;
		setRegion(code);
	}, []);

	const handleFocusItem = useCallback((item) => {
		setFocusedItem(item);
		if (backdropTimer.current) clearTimeout(backdropTimer.current);
		backdropTimer.current = setTimeout(() => {
			const path = item?.backdrop_path || item?.backdropPath;
			if (path) setBackdropUrl(seerrApi.getImageUrl(path, 'w1280'));
		}, 150);
	}, []);

	const handleSelectItem = useCallback((item) => {
		onSelectItem?.({
			mediaId: item.id,
			mediaType: item.media_type || item.mediaType || (item.title ? 'movie' : 'tv'),
			libraryId: libraryIdOf(item.mediaInfo)
		});
	}, [onSelectItem]);

	const rowCount = home?.rows?.length || 0;
	const handleNavigateRows = useCallback((fromIndex, delta) => {
		const target = fromIndex + delta;
		if (target < 0) {
			Spotlight.focus('service-region-pill');
			return;
		}
		if (target >= rowCount) return;
		Spotlight.focus(`service-row-${target}`);
	}, [rowCount]);

	const handleRowFocus = useCallback((idx) => {
		lastRowRef.current = idx;
	}, []);

	const handlePillKeyDown = useCallback((e) => {
		if (e.keyCode === KEYS.DOWN) {
			e.preventDefault();
			e.stopPropagation();
			if (service) Spotlight.focus('service-row-0');
			else Spotlight.focus('service-card-0');
		} else if (e.keyCode === KEYS.UP) {
			e.preventDefault();
			e.stopPropagation();
			Spotlight.focus('navbar');
		}
	}, [service]);

	const openRegionPicker = useCallback(() => setRegionPickerOpen(true), []);
	const closeRegionPicker = useCallback(() => setRegionPickerOpen(false), []);

	// Grid rows of service tiles: Up from the first line goes to the pill.
	const COLUMNS = 6;
	const handleServiceKeyDown = useCallback((e) => {
		if (e.keyCode !== KEYS.UP) return;
		const idx = Number(e.currentTarget.getAttribute('data-service-index'));
		if (idx < COLUMNS) {
			e.preventDefault();
			e.stopPropagation();
			Spotlight.focus('service-region-pill');
		}
	}, []);

	const regionName = useMemo(() => {
		const match = regions.find((r) => r.code === region);
		return match ? match.name : region;
	}, [regions, region]);

	if (!isEnabled || !isAuthenticated) {
		return (
			<div className={discoverCss.container}>
				<div className={discoverCss.notConfigured}>
					<p>{!isEnabled ? $L('Seerr is not enabled.') : $L('Seerr is not authenticated.')}</p>
					<p>{$L('Go to Settings to configure Seerr.')}</p>
				</div>
			</div>
		);
	}

	const sidebar = settings.navbarPosition === 'left';

	return (
		<div className={discoverCss.container}>
			{settings.showHomeBackdrop !== false && (
				<div className={discoverCss.backdrop}>
					{service && backdropUrl && (
						<div
							className={discoverCss.backdropImage}
							style={{
								backgroundImage: `url(${backdropUrl})`,
								filter: settings.backdropBlurHome > 0 ? `blur(${settings.backdropBlurHome}px)` : 'none'
							}}
						/>
					)}
					<div className={discoverCss.backdropOverlay} />
				</div>
			)}

			<div className={`${discoverCss.mainContent} ${sidebar ? discoverCss.sidebarOffset : ''}`}>
				<div className={`${css.header} ${sidebar ? '' : css.headerBelowNav}`}>
					{service ? (
						<div className={css.headerService}>
							{service.logoUrl && <img className={css.headerLogo} src={service.logoUrl} alt="" />}
							<h1 className={css.headerTitle}>{service.name}</h1>
						</div>
					) : (
						<h1 className={css.headerTitle}>{$L('Streaming Services')}</h1>
					)}
					<SpottableDiv
						className={css.regionPill}
						spotlightId="service-region-pill"
						onClick={openRegionPicker}
						onKeyDown={handlePillKeyDown}
					>
						<span className={css.regionPillLabel}>{$L('Region')}</span>
						<span>{regionName || '…'}</span>
					</SpottableDiv>
				</div>

				{service && (
					<div className={css.detailStrip}>
						{focusedItem ? (
							<>
								<h2 className={css.detailTitle}>
									{focusedItem.rank ? <span className={css.detailRank}>#{focusedItem.rank}</span> : null}
									{focusedItem.title || focusedItem.name}
								</h2>
								<div className={css.detailMeta}>
									{(focusedItem.voteAverage || focusedItem.vote_average) > 0 && (
										<span className={css.detailRating}>★ {Number(focusedItem.voteAverage || focusedItem.vote_average).toFixed(1)}</span>
									)}
									{(focusedItem.releaseDate || focusedItem.firstAirDate || focusedItem.release_date || focusedItem.first_air_date) && (
										<span>{String(focusedItem.releaseDate || focusedItem.firstAirDate || focusedItem.release_date || focusedItem.first_air_date).substring(0, 4)}</span>
									)}
									{focusedItem.rankLabel && <span>{focusedItem.rankLabel}</span>}
								</div>
								{focusedItem.overview && <p className={css.detailOverview}>{focusedItem.overview}</p>}
							</>
						) : (
							<p className={css.detailHint}>{$L('Everything here is streaming on {service} in {region}. Pick a title to request it.').replace('{service}', service.name).replace('{region}', regionName || region)}</p>
						)}
					</div>
				)}

				{error && <div className={css.error}>{error}</div>}

				{loading || (service && !home) ? (
					<LoadingSpinner />
				) : service ? (
					<div className={`${discoverCss.rowsContainer} ${css.rows}`}>
						{home.rows.map((row, index) => (
							<ServiceRow
								key={`${home.region}-${service.id}-${row.id}`}
								row={row}
								rowIndex={index}
								onSelectItem={handleSelectItem}
								onFocusItem={handleFocusItem}
								onNavigate={handleNavigateRows}
								onRowFocus={handleRowFocus}
							/>
						))}
						<p className={css.attribution}>{(home.attribution || []).join(' · ')}</p>
					</div>
				) : (
					<div className={css.gridScroller}>
						<GridContainer className={css.serviceGrid} spotlightId="service-grid">
							{services.map((s, index) => (
								<ServiceCard
									key={s.id}
									service={s}
									index={index}
									onSelect={handlePickService}
									onKeyDown={handleServiceKeyDown}
								/>
							))}
						</GridContainer>
						{services.length === 0 && !error && (
							<p className={css.detailHint}>{$L('No streaming services found for this region.')}</p>
						)}
						<p className={css.attribution}>{$L('Streaming availability data provided by JustWatch (via TMDB)')}</p>
					</div>
				)}
			</div>

			{regionPickerOpen && (
				<RegionPicker regions={regions} current={region} onPick={handlePickRegion} onClose={closeRegionPicker} />
			)}
		</div>
	);
};

export default SeerrServices;
