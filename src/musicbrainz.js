import logger from './logger.js';

const MUSICBRAINZ_API = 'https://musicbrainz.org/ws/2';
const USER_AGENT = 'VinylRipper/1.0.0 (educational project)';

// Vinyl-related format names in MusicBrainz
const VINYL_FORMATS = ['12" Vinyl', '10" Vinyl', '7" Vinyl', 'Vinyl', 'LP'];

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function searchAlbum(artist, album) {
  const log = [];
  try {
    // Rate limiting: MusicBrainz requires 1 request per second
    await sleep(1000);

    const query = `artist:"${artist}" AND release:"${album}"`;
    const url = `${MUSICBRAINZ_API}/release?query=${encodeURIComponent(query)}&fmt=json&limit=10`;

    logger.info({ artist, album }, 'Searching MusicBrainz for album');
    log.push({ type: 'info', message: `Searching MusicBrainz for: artist="${artist}", album="${album}"` });

    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`MusicBrainz API error: ${response.status}`);
    }

    const data = await response.json();

    if (!data.releases || data.releases.length === 0) {
      logger.warn({ artist, album }, 'No releases found');
      log.push({ type: 'warning', message: 'No releases found on MusicBrainz for this artist/album combination' });
      return { release: null, log };
    }

    // Log all candidates found
    log.push({ type: 'info', message: `Found ${data.releases.length} release candidate(s) on MusicBrainz` });
    for (let i = 0; i < Math.min(data.releases.length, 10); i++) {
      const r = data.releases[i];
      const score = r.score || 'N/A';
      const artistName = r['artist-credit']?.[0]?.name || 'Unknown';
      const format = r.media?.[0]?.format || 'Unknown format';
      const mediaCount = r.media?.length || 0;
      log.push({
        type: 'info',
        message: `  ${i + 1}. "${r.title}" by ${artistName} (score: ${score}, format: ${format}, media: ${mediaCount}, id: ${r.id})`
      });
    }

    // Prefer vinyl releases over CD releases
    const vinylRelease = data.releases.find(r => {
      if (!r.media) return false;
      return r.media.some(m => VINYL_FORMATS.some(vf => m.format && m.format.toLowerCase().includes(vf.toLowerCase())));
    });

    let release;
    if (vinylRelease) {
      release = vinylRelease;
      const format = release.media?.[0]?.format || 'Vinyl';
      log.push({ type: 'success', message: `Selected vinyl release: "${release.title}" (format: ${format}, id: ${release.id})` });
    } else {
      release = data.releases[0];
      const format = release.media?.[0]?.format || 'Unknown';
      log.push({ type: 'info', message: `No vinyl release found, using: "${release.title}" (format: ${format}, id: ${release.id})` });
    }

    logger.info({ releaseId: release.id, title: release.title }, 'Found release');

    return {
      release: {
        id: release.id,
        title: release.title,
        artist: release['artist-credit']?.[0]?.name || artist
      },
      log
    };
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to search album');
    log.push({ type: 'error', message: `MusicBrainz search failed: ${error.message}` });
    throw Object.assign(error, { log });
  }
}

export async function getTrackListing(releaseId) {
  const log = [];
  try {
    await sleep(1000);

    const url = `${MUSICBRAINZ_API}/release/${releaseId}?inc=recordings+media&fmt=json`;

    logger.info({ releaseId }, 'Fetching track listing');

    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`MusicBrainz API error: ${response.status}`);
    }

    const data = await response.json();
    const tracks = [];
    const mediaInfo = [];

    if (data.media && data.media.length > 0) {
      for (const medium of data.media) {
        const mediumTracks = [];
        if (medium.tracks) {
          for (const track of medium.tracks) {
            const trackData = {
              position: track.position,
              title: track.title,
              length: track.recording?.length ? Math.round(track.recording.length / 1000) : (track.length ? Math.round(track.length / 1000) : null),
              number: track.number,
              mediumPosition: medium.position
            };
            tracks.push(trackData);
            mediumTracks.push(trackData);
          }
        }
        mediaInfo.push({
          position: medium.position,
          format: medium.format || 'Unknown',
          title: medium.title || '',
          trackCount: medium['track-count'] || mediumTracks.length,
          tracks: mediumTracks
        });
      }
    }

    logger.info({ trackCount: tracks.length, mediaCount: mediaInfo.length }, 'Retrieved track listing');
    
    // Log media info
    if (mediaInfo.length > 1) {
      log.push({ type: 'info', message: `Release has ${mediaInfo.length} media/sides:` });
      for (const m of mediaInfo) {
        log.push({ type: 'info', message: `  Medium ${m.position} (${m.format}): ${m.trackCount} track(s)` });
      }
    }

    log.push({ type: 'success', message: `Retrieved ${tracks.length} track(s) from MusicBrainz:` });
    for (const track of tracks) {
      const lengthStr = track.length ? `${Math.floor(track.length / 60)}:${String(track.length % 60).padStart(2, '0')}` : '?:??';
      log.push({ type: 'info', message: `  ${track.position}. "${track.title}" (${lengthStr})` });
    }

    return { tracks, mediaInfo, log };
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to get track listing');
    log.push({ type: 'error', message: `Failed to fetch track listing: ${error.message}` });
    throw Object.assign(error, { log });
  }
}

export async function getAlbumMetadata(artist, album) {
  const searchResult = await searchAlbum(artist, album);
  const log = [...(searchResult.log || [])];

  if (!searchResult.release) {
    return { release: null, tracks: [], mediaInfo: [], log };
  }

  const trackResult = await getTrackListing(searchResult.release.id);
  log.push(...(trackResult.log || []));

  return {
    release: searchResult.release,
    tracks: trackResult.tracks,
    mediaInfo: trackResult.mediaInfo || [],
    log
  };
}