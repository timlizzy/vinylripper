import logger from './logger.js';

const DISCOGS_API = 'https://api.discogs.com';
const USER_AGENT = 'VinylRipper/1.0.0';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Search Discogs for a vinyl release and return per-side track information.
 * Discogs tracks have positions like "A1", "A2", "B1", "B2" which directly
 * tell us which side each track belongs to.
 */
export async function searchDiscogsAlbum(artist, album) {
  const log = [];
  try {
    // Rate limiting: Discogs allows 25 unauthenticated requests per minute
    await sleep(1500);

    const query = `${artist} ${album}`;
    const url = `${DISCOGS_API}/database/search?q=${encodeURIComponent(query)}&type=release&format=Vinyl&per_page=10`;

    logger.info({ artist, album }, 'Searching Discogs for vinyl release');
    log.push({ type: 'info', message: `Searching Discogs for vinyl release: "${artist} - ${album}"` });

    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Discogs API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    if (!data.results || data.results.length === 0) {
      log.push({ type: 'warning', message: 'No vinyl releases found on Discogs' });
      return { release: null, sides: null, log };
    }

    log.push({ type: 'info', message: `Found ${data.results.length} Discogs result(s)` });

    // Find best match — prefer exact title matches
    const albumLower = album.toLowerCase();
    const artistLower = artist.toLowerCase();
    let bestResult = null;

    for (const result of data.results) {
      const titleStr = (result.title || '').toLowerCase();
      // Discogs titles are usually "Artist - Album"
      if (titleStr.includes(artistLower) && titleStr.includes(albumLower)) {
        bestResult = result;
        break;
      }
    }

    if (!bestResult) {
      bestResult = data.results[0]; // fallback to first result
    }

    log.push({
      type: 'info',
      message: `Best match: "${bestResult.title}" (id: ${bestResult.id}, format: ${(bestResult.format || []).join(', ')})`
    });

    // Fetch full release details to get track listing with side info
    await sleep(1500);
    const releaseUrl = `${DISCOGS_API}/releases/${bestResult.id}`;
    const releaseResponse = await fetch(releaseUrl, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/json'
      }
    });

    if (!releaseResponse.ok) {
      throw new Error(`Discogs release API error: ${releaseResponse.status}`);
    }

    const releaseData = await releaseResponse.json();
    const tracklist = releaseData.tracklist || [];

    if (tracklist.length === 0) {
      log.push({ type: 'warning', message: 'Discogs release has no track listing' });
      return { release: bestResult, sides: null, log };
    }

    // Parse tracks by side using position field (e.g., "A1", "A2", "B1", "B2")
    const sides = {};
    for (const track of tracklist) {
      // Skip non-track entries (headings, etc.)
      if (track.type_ && track.type_ !== 'track') continue;

      const position = track.position || '';
      // Extract side letter from position (A1 → A, B2 → B, C1 → C, etc.)
      const sideMatch = position.match(/^([A-Za-z])/);
      const sideLetter = sideMatch ? sideMatch[1].toUpperCase() : '?';

      if (!sides[sideLetter]) {
        sides[sideLetter] = [];
      }

      // Parse duration string like "3:33" to seconds
      let durationSec = null;
      if (track.duration) {
        const parts = track.duration.split(':');
        if (parts.length === 2) {
          durationSec = parseInt(parts[0]) * 60 + parseInt(parts[1]);
        } else if (parts.length === 3) {
          durationSec = parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2]);
        }
      }

      sides[sideLetter].push({
        position: position,
        title: track.title,
        duration: durationSec,
        durationStr: track.duration || '?:??'
      });
    }

    // Log the per-side breakdown
    const sideLetters = Object.keys(sides).sort();
    log.push({ type: 'success', message: `Discogs tracklist parsed — ${sideLetters.length} side(s):` });
    for (const side of sideLetters) {
      const tracks = sides[side];
      log.push({ type: 'info', message: `  Side ${side}: ${tracks.length} track(s)` });
      for (const t of tracks) {
        log.push({ type: 'info', message: `    ${t.position}. "${t.title}" (${t.durationStr})` });
      }
    }

    return {
      release: {
        id: bestResult.id,
        title: releaseData.title,
        artist: releaseData.artists?.[0]?.name || artist,
        year: releaseData.year
      },
      sides,
      allTracks: sideLetters.flatMap(s => sides[s]),
      log
    };
  } catch (error) {
    logger.error({ error: error.message }, 'Discogs search failed');
    log.push({ type: 'warning', message: `Discogs search failed: ${error.message}` });
    return { release: null, sides: null, log };
  }
}