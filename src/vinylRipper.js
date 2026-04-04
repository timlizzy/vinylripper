import fs from 'fs/promises';
import path from 'path';
import { processAlbumSide } from './audioProcessor.js';
import { getAlbumMetadata } from './musicbrainz.js';
import { searchDiscogsAlbum } from './discogs.js';
import { matchTracks, generateTrackName } from './trackMatcher.js';
import logger from './logger.js';

/**
 * Main function to rip a vinyl album.
 * 
 * Flow:
 * 1. Look up album metadata (Discogs first for per-side info, then MusicBrainz)
 * 2. Process each side using expected track counts to guide silence detection
 * 3. Match detected tracks against official track listing
 * 4. Rename and save output files
 */
export async function ripVinylAlbum(sides, artist, album) {
  const startTime = Date.now();
  logger.info({ artist, album, sideCount: sides.length }, 'Starting vinyl rip process');

  const processingLog = [];

  try {
    // ─── STEP 1: Look up album metadata FIRST ───────────────────────
    processingLog.push({ type: 'heading', message: 'Album Lookup' });

    // Try Discogs first (best for vinyl per-side info)
    let discogsResult = null;
    let perSideInfo = null; // { A: { trackCount, tracks }, B: { trackCount, tracks }, ... }

    try {
      discogsResult = await searchDiscogsAlbum(artist, album);
      if (discogsResult.log) {
        processingLog.push(...discogsResult.log);
      }

      if (discogsResult.sides) {
        perSideInfo = {};
        const sideLabels = ['A', 'B', 'C', 'D'];
        for (const label of sideLabels) {
          if (discogsResult.sides[label]) {
            perSideInfo[label] = {
              trackCount: discogsResult.sides[label].length,
              tracks: discogsResult.sides[label]
            };
          }
        }
        processingLog.push({
          type: 'success',
          message: `Discogs provides per-side track info: ${Object.entries(perSideInfo).map(([k, v]) => `Side ${k}=${v.trackCount}`).join(', ')}`
        });
      }
    } catch (error) {
      logger.warn({ error: error.message }, 'Discogs lookup failed');
      processingLog.push({ type: 'warning', message: `Discogs lookup failed: ${error.message}` });
    }

    // Also look up MusicBrainz (used for matching and as fallback)
    processingLog.push({ type: 'heading', message: 'MusicBrainz Lookup' });
    let metadata = null;
    try {
      metadata = await getAlbumMetadata(artist, album);
      if (metadata && metadata.log) {
        processingLog.push(...metadata.log);
      }
    } catch (error) {
      logger.warn({ error: error.message }, 'MusicBrainz lookup failed');
      if (error.log) {
        processingLog.push(...error.log);
      }
      processingLog.push({ type: 'warning', message: `MusicBrainz lookup failed: ${error.message}` });
    }

    // If no Discogs per-side info, try to derive it from MusicBrainz multi-media
    if (!perSideInfo && metadata && metadata.mediaInfo && metadata.mediaInfo.length > 1) {
      perSideInfo = {};
      const sideLabels = ['A', 'B', 'C', 'D'];
      for (let i = 0; i < metadata.mediaInfo.length && i < sideLabels.length; i++) {
        const medium = metadata.mediaInfo[i];
        perSideInfo[sideLabels[i]] = {
          trackCount: medium.trackCount,
          tracks: medium.tracks.map(t => ({
            title: t.title,
            duration: t.length,
            position: t.position
          }))
        };
      }
      processingLog.push({
        type: 'info',
        message: `Using MusicBrainz multi-media info: ${Object.entries(perSideInfo).map(([k, v]) => `Side ${k}=${v.trackCount}`).join(', ')}`
      });
    }

    // Summary of what we know
    if (perSideInfo) {
      processingLog.push({ type: 'success', message: 'Per-side track info available — will guide silence detection' });
    } else if (metadata && metadata.tracks && metadata.tracks.length > 0) {
      processingLog.push({ type: 'info', message: `No per-side info — have ${metadata.tracks.length} total tracks from MusicBrainz` });
    } else {
      processingLog.push({ type: 'warning', message: 'No album metadata found — silence detection will use default sensitivity' });
    }

    // ─── STEP 2: Process each side with expected track info ──────────
    const tempDir = path.join('output', 'temp', `${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });

    const sideResults = [];

    for (let i = 0; i < sides.length; i++) {
      const side = sides[i];
      const sideLabel = side.label; // 'A', 'B', etc.
      logger.info({ side: sideLabel, file: side.file }, 'Processing side');
      processingLog.push({ type: 'heading', message: `Side ${sideLabel}: ${side.file}` });

      // Pass expected info for this side if available
      const expectedInfo = perSideInfo?.[sideLabel] || null;

      const result = await processAlbumSide(side.path, tempDir, expectedInfo);
      const tracks = result.tracks || result;
      const sideLog = result.log || [];

      processingLog.push(...sideLog);
      processingLog.push({ type: 'info', message: `Side ${sideLabel}: ${tracks.length} track(s) detected` });

      sideResults.push({
        label: sideLabel,
        tracks: tracks
      });
    }

    // ─── STEP 3: Match detected tracks against official listing ──────
    const allTracks = sideResults.flatMap(sr => sr.tracks);
    logger.info({ totalTracks: allTracks.length }, 'All sides processed');

    let matches = [];
    processingLog.push({ type: 'heading', message: 'Track Matching' });

    // Prefer Discogs per-side info for matching
    if (perSideInfo && Object.keys(perSideInfo).length > 0) {
      processingLog.push({ type: 'info', message: 'Matching using per-side track info from Discogs' });

      for (let i = 0; i < sideResults.length; i++) {
        const sideLabel = sideResults[i].label;
        const sideDetected = sideResults[i].tracks;
        const sideExpected = perSideInfo[sideLabel];

        if (sideExpected && sideExpected.tracks) {
          processingLog.push({
            type: 'info',
            message: `Side ${sideLabel}: ${sideDetected.length} detected vs ${sideExpected.trackCount} expected`
          });

          // Match by position order (Discogs tracks are already in order)
          for (let j = 0; j < sideDetected.length; j++) {
            const officialTrack = sideExpected.tracks[j] || null;
            const detected = sideDetected[j];

            // Calculate confidence based on duration if available
            let confidence = 0;
            if (officialTrack && officialTrack.duration && detected.duration) {
              const diff = Math.abs(detected.duration - officialTrack.duration);
              confidence = diff < 15 ? 1 - (diff / 30) : 0.3;
            } else if (officialTrack) {
              confidence = 0.7; // Position-based match, no duration to verify
            }

            matches.push({
              detectedTrack: detected,
              officialTrack: officialTrack ? {
                position: officialTrack.position || (j + 1),
                title: officialTrack.title,
                length: officialTrack.duration
              } : null,
              confidence,
              method: 'discogs-side'
            });

            if (officialTrack) {
              const durStr = officialTrack.duration
                ? ` (${Math.floor(officialTrack.duration / 60)}:${String(officialTrack.duration % 60).padStart(2, '0')})`
                : '';
              processingLog.push({
                type: 'success',
                message: `  ${officialTrack.position || (j + 1)}. "${officialTrack.title}"${durStr} — confidence: ${Math.round(confidence * 100)}%`
              });
            } else {
              processingLog.push({
                type: 'warning',
                message: `  Track ${j + 1}: no matching official track on this side`
              });
            }
          }
        } else {
          // No expected info for this side, try fallback
          processingLog.push({
            type: 'warning',
            message: `Side ${sideLabel}: no expected track info — tracks will be unnamed`
          });
          for (const track of sideDetected) {
            matches.push({
              detectedTrack: track,
              officialTrack: null,
              confidence: 0
            });
          }
        }
      }
    } else if (metadata && metadata.tracks && metadata.tracks.length > 0) {
      // Fall back to MusicBrainz matching
      const officialTracks = metadata.tracks;
      const sideTrackCounts = sideResults.map(sr => sr.tracks.length);
      const totalDetected = sideTrackCounts.reduce((a, b) => a + b, 0);

      const hasMultipleMedia = metadata.mediaInfo && metadata.mediaInfo.length > 1;

      if (hasMultipleMedia && metadata.mediaInfo.length === sideResults.length) {
        processingLog.push({ type: 'info', message: `MusicBrainz: ${metadata.mediaInfo.length} media matching ${sideResults.length} sides — matching per side` });

        for (let i = 0; i < sideResults.length; i++) {
          const sideDetected = sideResults[i].tracks;
          const sideOfficial = metadata.mediaInfo[i].tracks;
          processingLog.push({ type: 'info', message: `Side ${sideResults[i].label}: ${sideDetected.length} detected vs ${sideOfficial.length} official` });

          const matchResult = matchTracks(sideDetected, sideOfficial);
          const sideMatches = matchResult.matches || matchResult;
          if (matchResult.log) {
            processingLog.push(...matchResult.log);
          }
          matches.push(...sideMatches);
        }
      } else if (!hasMultipleMedia && officialTracks.length >= totalDetected) {
        processingLog.push({
          type: 'info',
          message: `MusicBrainz: single medium with ${officialTracks.length} tracks — splitting by detected side counts: ${sideTrackCounts.map((c, i) => `Side ${sideResults[i].label}=${c}`).join(', ')}`
        });

        let offset = 0;
        for (let i = 0; i < sideResults.length; i++) {
          const sideDetected = sideResults[i].tracks;
          const sideOfficialSlice = officialTracks.slice(offset, offset + sideDetected.length);

          processingLog.push({
            type: 'info',
            message: `Side ${sideResults[i].label}: matching ${sideDetected.length} detected track(s) against official tracks ${offset + 1}-${offset + sideDetected.length}`
          });

          for (let j = 0; j < sideDetected.length; j++) {
            const officialTrack = sideOfficialSlice[j] || null;
            matches.push({
              detectedTrack: sideDetected[j],
              officialTrack: officialTrack,
              confidence: officialTrack ? 0.8 : 0,
              method: 'side-order'
            });
            if (officialTrack) {
              processingLog.push({
                type: 'success',
                message: `  Track ${offset + j + 1}: "${officialTrack.title}" (assigned by position on side ${sideResults[i].label})`
              });
            }
          }

          offset += sideDetected.length;
        }

        if (offset < officialTracks.length) {
          processingLog.push({
            type: 'warning',
            message: `${officialTracks.length - offset} official track(s) not assigned (detected fewer tracks than expected)`
          });
        }
      } else {
        processingLog.push({ type: 'info', message: `Falling back to matching all ${totalDetected} detected track(s) against ${officialTracks.length} official track(s)` });
        const matchResult = matchTracks(allTracks, officialTracks);
        matches = matchResult.matches || matchResult;
        if (matchResult.log) {
          processingLog.push(...matchResult.log);
        }
      }
    } else {
      processingLog.push({ type: 'warning', message: 'No metadata available — all tracks will be saved as "Unknown Track"' });
      matches = allTracks.map(track => ({
        detectedTrack: track,
        officialTrack: null,
        confidence: 0
      }));
    }

    // ─── STEP 4: Save output files ──────────────────────────────────
    const sanitizedArtist = artist.replace(/[<>:"/\\|?*]/g, '_');
    const sanitizedAlbum = album.replace(/[<>:"/\\|?*]/g, '_');
    const outputDir = path.join('output', `${sanitizedArtist} - ${sanitizedAlbum}`);
    await fs.mkdir(outputDir, { recursive: true });

    const results = [];
    processingLog.push({ type: 'heading', message: 'Output' });

    // Calculate global track number across all sides
    let globalTrackNum = 1;
    for (let i = 0; i < matches.length; i++) {
      const match = matches[i];
      const newName = generateTrackName(match, globalTrackNum);
      const newPath = path.join(outputDir, newName);

      await fs.rename(match.detectedTrack.path, newPath);

      results.push({
        trackNumber: globalTrackNum,
        fileName: newName,
        duration: match.detectedTrack.duration,
        matched: match.officialTrack !== null,
        title: match.officialTrack?.title || 'Unknown',
        confidence: match.confidence
      });

      logger.info({ trackNumber: globalTrackNum, fileName: newName }, 'Track saved');
      globalTrackNum++;
    }

    processingLog.push({ type: 'success', message: `Saved ${results.length} track(s) to ${outputDir}` });

    // Clean up temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      logger.warn({ error: error.message }, 'Failed to clean up temp directory');
    }

    const duration = Date.now() - startTime;
    logger.info({ duration, trackCount: results.length, outputDir }, 'Vinyl rip complete');

    return {
      success: true,
      artist,
      album,
      outputDir,
      tracks: results,
      metadata: metadata?.release || discogsResult?.release || null,
      processingLog,
      duration
    };
  } catch (error) {
    logger.error({ error: error.message, stack: error.stack }, 'Vinyl rip failed');
    processingLog.push({ type: 'error', message: `Processing failed: ${error.message}` });
    error.processingLog = processingLog;
    throw error;
  }
}