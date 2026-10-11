// Dev-only preview of the request status UI with fixture data, so the layout can
// be checked in a browser without a Jellyfin login or a live request.
// Open the dev server with ?preview=request-status (npm run dev:tizen).

import ThemeDecorator from '@enact/sandstone/ThemeDecorator';
import {Scroller} from '@enact/sandstone/Scroller';

import {SeerrRequestStatusPanel, SeerrRequestSummary} from '../../components/seerr/SeerrRequestStatus';
import requestStatusFixture from './requestStatusFixture';

const pageStyle = {
	padding: '60px 90px',
	background: '#101114',
	color: '#fff',
	boxSizing: 'border-box'
};

const headingStyle = {fontSize: '44px', fontWeight: 700, margin: '0 0 6px'};
const subStyle = {fontSize: '22px', color: 'rgba(255,255,255,0.6)', margin: '0 0 8px'};
const tabStyle = {fontSize: '26px', fontWeight: 600, margin: '40px 0 16px', borderBottom: '3px solid #fff', display: 'inline-block', paddingBottom: '4px'};

const RequestStatusPreviewBase = () => (
	<Scroller style={{height: '100vh', background: '#101114'}} focusableScrollbar={false}>
	<div style={pageStyle}>
		<h1 style={headingStyle}>Naruto</h1>
		<p style={subStyle}>2002 · TV-PG · 5 Seasons</p>
		<SeerrRequestSummary status={requestStatusFixture} />
		<div style={tabStyle}>Progress</div>
		<SeerrRequestStatusPanel status={requestStatusFixture} />
	</div>
	</Scroller>
);

const RequestStatusPreview = ThemeDecorator(RequestStatusPreviewBase);

export default RequestStatusPreview;
