// Per-episode request status for a series while it is on its way into the
// library. Asks the request-status Seerr fork (GET /tv/:id/status through the
// Moonbase proxy) and keeps asking at the interval the server suggests until
// everything requested has landed. A Seerr without the endpoint answers 404,
// after which the hook stays quiet for this title.

import {useEffect, useRef, useState} from 'react';

import seerrApi from '../../services/seerrApi';
import {isMediaInFlight} from '../../utils/seerrStatus';
import {hasRequestProgress, requestStatusPollMs} from '../../utils/seerrRequestStatus';

// HD unless only the 4K track has anything going on.
export const statusTrackIs4k = (media) => {
	if (!media) return false;
	return !isMediaInFlight(media, false) && isMediaInFlight(media, true);
};

// Whether to ask at all: a series Seerr has a request or download for.
export const wantsRequestStatus = (mediaType, media, lastStatus) =>
	mediaType === 'tv' && Boolean(media) &&
	(isMediaInFlight(media, false) || isMediaInFlight(media, true) || hasRequestProgress(lastStatus));

const useSeerrRequestStatus = ({mediaId, mediaType, details}) => {
	const [status, setStatus] = useState(null);
	const unsupportedRef = useRef(false);
	const statusRef = useRef(null);
	statusRef.current = status;

	const media = details?.mediaInfo;
	const active = Boolean(mediaId) && wantsRequestStatus(mediaType, media, statusRef.current);
	const is4k = statusTrackIs4k(media);

	// A new title starts from nothing.
	useEffect(() => {
		setStatus(null);
		unsupportedRef.current = false;
	}, [mediaId]);

	useEffect(() => {
		if (!active || unsupportedRef.current) return undefined;
		let closed = false;
		let timer = null;

		const tick = async () => {
			if (closed) return;
			// Nobody is looking while the app is in the background, try again later.
			if (typeof document !== 'undefined' && document.hidden) {
				timer = setTimeout(tick, requestStatusPollMs(statusRef.current));
				return;
			}
			try {
				const next = await seerrApi.getTvRequestStatus(mediaId, is4k);
				if (closed) return;
				if (next && typeof next === 'object') setStatus(next);
				if (!hasRequestProgress(next) && next?.phase !== 'awaiting_approval') {
					// Everything landed (or nothing to track): one last state, no more polling.
					return;
				}
				timer = setTimeout(tick, requestStatusPollMs(next));
			} catch (err) {
				if (closed) return;
				if (err && err.status === 404) {
					unsupportedRef.current = true;
					return;
				}
				// A blip keeps the last answer on screen and tries again a bit later.
				timer = setTimeout(tick, 30000);
			}
		};

		tick();
		return () => {
			closed = true;
			if (timer) clearTimeout(timer);
		};
	}, [active, mediaId, is4k]);

	return status;
};

export default useSeerrRequestStatus;
