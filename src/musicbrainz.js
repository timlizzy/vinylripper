import logger from './logger.js';

const MUSICBRAINZ_API = 'https://musicbrainz.org/ws/2';
const USER_AGENT = 'VinylRipper/1.0.0 (educational project)';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function searchAlbum(artist, album) {
  try {
    // Rate limiting: MusicBrainz requires 1 request per second
    await sleep(1000);

    const query = `artist:"${artist}" AND release:"${album}"`;
    const url = `${MUSICBRAINZ_API}/release?query=${encodeURIComponent(query)}&fmt=json&limit=5`;

    logger.info({ artist, album }, 'Searching MusicBrainz for album');

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
      return null;
    }

    // Return the first match (usually most relevant)
    const release = data.releases[0];
    logger.info({ releaseId: release.id, title: release.title }, 'Found release');

    return {
      id: release.id,
      title: release.title,
      artist: release['artist-credit']?.[0]?.name || artist
    };
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to search album');
    throw error;
  }
}

export async function getTrackListing(releaseId) {
  try {
    await sleep(1000);

    const url = `${MUSICBRAINZ_API}/release/${releaseId}?inc=recordings&fmt=json`;

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

    if (data.media && data.media.length > 0) {
      for (const medium of data.media) {
        if (medium.tracks) {
          for (const track of medium.tracks) {
            tracks.push({
              position: track.position,
              title: track.title,
              length: track.length ? Math.round(track.length / 1000) : null, // Convert ms to seconds
              number: track.number
            });
          }
        }
      }
    }

    logger.info({ trackCount: tracks.length }, 'Retrieved track listing');
    return tracks;
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to get track listing');
    throw error;
  }
}

export async function getAlbumMetadata(artist, album) {
  const release = await searchAlbum(artist, album);
  if (!release) {
    return null;
  }

  const tracks = await getTrackListing(release.id);
  return {
    release,
    tracks
  };
}
