// Per-episode request status for a series (request-status Seerr fork).
//
// SeerrRequestSummary sits under the action buttons: one bar for the whole
// request, a line saying what is going on, and a thin bar per season.
// SeerrRequestStatusPanel is the Progress tab: seasons down the left, the
// focused season's episodes on the right, each with a state chip, a bar while
// downloading, and why it is stuck when it is.

import {memo, useCallback, useEffect, useMemo, useState} from 'react';
import $L from '@enact/i18n/$L';
import Spottable from '@enact/spotlight/Spottable';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';

import {
	episodeCode,
	episodeDetail,
	episodesOfSeason,
	groupEpisodeRows,
	rangeLabel,
	rollupText,
	stateColor,
	stateLabel
} from '../../utils/seerrRequestStatus';

import css from './SeerrRequestStatus.module.less';

const SpottableDiv = Spottable('div');
const SeasonColumn = SpotlightContainerDecorator({enterTo: 'last-focused', restrict: 'self-first'}, 'div');
const EpisodeColumn = SpotlightContainerDecorator({enterTo: 'last-focused', restrict: 'self-first'}, 'div');

const clampPct = (p) => Math.max(0, Math.min(100, Math.round(p || 0)));

export const StateChip = memo(({state}) => (
	<span className={`${css.chip} ${css[stateColor(state)] || ''}`}>{stateLabel(state)}</span>
));

const Bar = ({percent, state, thin}) => (
	<div className={thin ? `${css.track} ${css.thin}` : css.track}>
		<div className={`${css.fill} ${css[`fill_${stateColor(state)}`] || ''}`} style={{width: `${clampPct(percent)}%`}} />
	</div>
);

const seasonName = (n) => (n === 0 ? $L('Specials') : `${$L('Season')} ${n}`);

// Under the buttons: the whole request at a glance.
export const SeerrRequestSummary = memo(({status}) => {
	if (!status?.overall) return null;
	const {overall, seasons} = status;
	return (
		<div className={css.summary}>
			<div className={css.summaryHead}>
				<StateChip state={overall.state} />
				<span className={css.summaryText}>{rollupText(overall)}</span>
				<span className={css.summaryPct}>{`${overall.percent}%`}</span>
			</div>
			<Bar percent={overall.percent} state={overall.state} />
			{seasons.length > 1 && (
				<div className={css.seasonStrip}>
					{seasons.map((s) => (
						<div key={s.seasonNumber} className={css.seasonStripItem}>
							<div className={css.seasonStripLabel}>{`S${s.seasonNumber} · ${s.percent}%`}</div>
							<Bar percent={s.percent} state={s.state} thin />
						</div>
					))}
				</div>
			)}
		</div>
	);
});

const SeasonRow = memo(({season, selected, onSelect}) => {
	const handleFocus = useCallback(() => onSelect(season.seasonNumber), [onSelect, season.seasonNumber]);
	return (
		<SpottableDiv
			className={selected ? `${css.seasonRow} ${css.selected}` : css.seasonRow}
			onFocus={handleFocus}
			onClick={handleFocus}
			data-season={season.seasonNumber}
		>
			<div className={css.seasonHead}>
				<span className={css.seasonName}>{seasonName(season.seasonNumber)}</span>
				<span className={css.seasonPct}>{`${season.percent}%`}</span>
			</div>
			<Bar percent={season.percent} state={season.state} />
			<div className={css.seasonMeta}>
				<StateChip state={season.state} />
				<span className={css.seasonCounts}>{rollupText(season)}</span>
			</div>
		</SpottableDiv>
	);
});

const EpisodeRow = memo(({episode}) => {
	const detail = episodeDetail(episode);
	const showsBar = episode.state === 'downloading' || (episode.state === 'grabbed' && episode.downloadProgress > 0);
	return (
		<SpottableDiv className={`${css.episodeRow} ${css[`row_${stateColor(episode.state)}`] || ''}`}>
			<div className={css.episodeMain}>
				<span className={css.episodeCode}>{episodeCode(episode)}</span>
				<span className={css.episodeTitle}>{episode.title || ''}</span>
				<StateChip state={episode.state} />
			</div>
			{showsBar && <Bar percent={(episode.downloadProgress || 0) * 100} state={episode.state} thin />}
			{detail && <div className={css.episodeDetail}>{detail}</div>}
		</SpottableDiv>
	);
});

const AvailableRange = memo(({episodes}) => (
	<SpottableDiv className={`${css.episodeRow} ${css.row_available} ${css.rangeRow}`}>
		<div className={css.episodeMain}>
			<span className={css.episodeCode}>{rangeLabel(episodes)}</span>
			<span className={css.episodeTitle}>{`${episodes.length} ${$L('episodes in the library')}`}</span>
			<StateChip state="available" />
		</div>
	</SpottableDiv>
));

// The Progress tab.
export const SeerrRequestStatusPanel = memo(({status}) => {
	const seasons = useMemo(() => status?.seasons || [], [status]);
	// Starts on the season with something happening, else the first.
	const firstActive = useMemo(() => {
		const busy = seasons.find((s) => s.state !== 'available' && s.state !== 'unaired');
		return (busy || seasons[0])?.seasonNumber ?? null;
	}, [seasons]);
	const [selected, setSelected] = useState(firstActive);
	useEffect(() => {
		if (selected === null || !seasons.some((s) => s.seasonNumber === selected)) setSelected(firstActive);
	}, [seasons, selected, firstActive]);

	const rows = useMemo(() => groupEpisodeRows(episodesOfSeason(status, selected)), [status, selected]);

	if (!status || seasons.length === 0) return null;

	const activity = (status.activity || []).find((a) => a.status === 'started');

	return (
		<div className={css.panel}>
			{activity && activity.message && (
				<div className={css.activity}>{activity.message}</div>
			)}
			<div className={css.columns}>
				<SeasonColumn className={css.seasonColumn} spotlightId="seerr-request-seasons">
					{seasons.map((s) => (
						<SeasonRow key={s.seasonNumber} season={s} selected={s.seasonNumber === selected} onSelect={setSelected} />
					))}
				</SeasonColumn>
				<EpisodeColumn className={css.episodeColumn} spotlightId="seerr-request-episodes">
					{rows.map((row) => (row.type === 'range'
						? <AvailableRange key={row.key} episodes={row.episodes} />
						: <EpisodeRow key={row.key} episode={row.episode} />
					))}
				</EpisodeColumn>
			</div>
			{status.source === 'sonarr' && (
				<div className={css.footnote}>
					{$L('Progress for packs is shown for the whole pack.')}
				</div>
			)}
		</div>
	);
});
