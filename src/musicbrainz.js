import logger from './logger.js';

const MUSICBRAINZ_API = 'https://musicbrainz.org/ws/2';
const USER_AGENT = 'VinylRipper/1.0.0 (educational project)';

// Vinyl-related format names in MusicBrainz
const VINYL_FORMATS = ['12" Vinyl', '10" Vinyl', '7" Vinyl', 'Vinyl', 'LP'];

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Normalize special characters (umlauts, accents, etc.) to ASCII equivalents.
 * Used as fallback when API searches fail with special characters.
 */
function normalizeToAscii(text) {
  const replacements = {
    'ä': 'a', 'ö': 'o', 'ü': 'u', 'ß': 'ss',
    'Ä': 'A', 'Ö': 'O', 'Ü': 'U',
    'é': 'e', 'è': 'e', 'ê': 'e', 'ë': 'e',
    'á': 'a', 'à': 'a', 'â': 'a', 'å': 'a',
    'í': 'i', 'ì': 'i', 'î': 'i', 'ï': 'i',
    'ó': 'o', 'ò': 'o', 'ô': 'o', 'õ': 'o',
    'ú': 'u', 'ù': 'u', 'û': 'u',
    'ñ': 'n', 'ç': 'c', 'æ': 'ae', 'œ': 'oe'
  };

  let normalized = text;
  for (const [special, ascii] of Object.entries(replacements)) {
    normalized = normalized.replace(new RegExp(special, 'g'), ascii);
  }
  return normalized;
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
      // Try fallback with normalized ASCII characters (handles umlauts, accents, etc.)
      const normalizedArtist = normalizeToAscii(artist);
      const normalizedAlbum = normalizeToAscii(album);

      if (normalizedArtist !== artist || normalizedAlbum !== album) {
        logger.info({ artist, normalizedArtist, album, normalizedAlbum }, 'Retrying with ASCII-normalized names');
        log.push({ type: 'info', message: `No results found — retrying with normalized names: artist="${normalizedArtist}", album="${normalizedAlbum}"` });

        await sleep(1000);
        const normalizedQuery = `artist:"${normalizedArtist}" AND release:"${normalizedAlbum}"`;
        const normalizedUrl = `${MUSICBRAINZ_API}/release?query=${encodeURIComponent(normalizedQuery)}&fmt=json&limit=10`;

        const fallbackResponse = await fetch(normalizedUrl, {
          headers: {
            'User-Agent': USER_AGENT,
            'Accept': 'application/json'
          }
        });

        if (fallbackResponse.ok) {
          const fallbackData = await fallbackResponse.json();
          if (fallbackData.releases && fallbackData.releases.length > 0) {
            log.push({ type: 'success', message: `Found ${fallbackData.releases.length} result(s) using normalized names` });
            // Continue with fallback data instead of returning empty
            return processSearchResults(fallbackData, artist, album, log);
          }
        }
      }

      logger.warn({ artist, album }, 'No releases found');
      log.push({ type: 'warning', message: 'No releases found on MusicBrainz for this artist/album combination' });
      return { release: null, log };
    }

    return processSearchResults(data, artist, album, log);
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to search album');
    log.push({ type: 'error', message: `MusicBrainz search failed: ${error.message}` });
    throw Object.assign(error, { log });
  }
}

function processSearchResults(data, artist, album, log) {

function processSearchResults(data, artist, album, log) {
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
      artist: release['artist-credit']?.[0]?.name || artist,
      date: release.date || null,
      year: release.date ? release.date.substring(0, 4) : null,
      releaseGroupId: release['release-group']?.id || null
    },
    log
  };
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

/**
 * Fetch cover art from the Cover Art Archive (associated with MusicBrainz).
 * Tries release-specific art first, then falls back to release-group art.
 * 
 * @param {string} releaseId - MusicBrainz release ID
 * @param {string} [releaseGroupId] - MusicBrainz release-group ID (fallback)
 * @returns {Promise<{imageBuffer: Buffer|null, mimeType: string|null, source: string|null, log: Array}>}
 */
export async function fetchCoverArt(releaseId, releaseGroupId = null) {
  const log = [];
  const CAA_BASE = 'https://coverartarchive.org';

  // Try release-specific cover first
  const urls = [
    { url: `${CAA_BASE}/release/${releaseId}/front-500`, label: `Cover Art Archive (release ${releaseId})` }
  ];
  if (releaseGroupId) {
    urls.push({ url: `${CAA_BASE}/release-group/${releaseGroupId}/front-500`, label: `Cover Art Archive (release-group)` });
  }

  for (const { url, label } of urls) {
    try {
      await sleep(1000);
      logger.info({ url }, 'Fetching cover art');
      
      const response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT },
        redirect: 'follow'
      });

      if (response.ok) {
        const contentType = response.headers.get('content-type') || 'image/jpeg';
        const arrayBuffer = await response.arrayBuffer();
        const imageBuffer = Buffer.from(arrayBuffer);
        
        log.push({ type: 'success', message: `Cover art found: ${label} (${(imageBuffer.length / 1024).toFixed(0)} KB)` });
        return { imageBuffer, mimeType: contentType, source: label, log };
      } else if (response.status === 404) {
        log.push({ type: 'info', message: `No cover art at: ${label}` });
      } else {
        log.push({ type: 'warning', message: `Cover Art Archive returned ${response.status} for ${label}` });
      }
    } catch (error) {
      log.push({ type: 'warning', message: `Failed to fetch from ${label}: ${error.message}` });
    }
  }

  log.push({ type: 'info', message: 'No cover art found in Cover Art Archive' });
  return { imageBuffer: null, mimeType: null, source: null, log };
}

/**
 * Fetch cover art from a URL (e.g., Discogs image URL).
 * @param {string} url - Direct URL to the image
 * @returns {Promise<{imageBuffer: Buffer|null, mimeType: string|null}>}
 */
export async function fetchImageFromUrl(url) {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      redirect: 'follow'
    });
    if (response.ok) {
      const contentType = response.headers.get('content-type') || 'image/jpeg';
      const arrayBuffer = await response.arrayBuffer();
      return { imageBuffer: Buffer.from(arrayBuffer), mimeType: contentType };
    }
  } catch (error) {
    logger.warn({ error: error.message, url }, 'Failed to fetch image from URL');
  }
  return { imageBuffer: null, mimeType: null };
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