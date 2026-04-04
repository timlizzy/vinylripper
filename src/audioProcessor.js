import ffmpeg from 'fluent-ffmpeg';
import { parseFile } from 'music-metadata';
import { promisify } from 'util';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import config from './config.js';
import logger from './logger.js';

const execAsync = promisify(exec);

export async function getAudioDuration(filePath) {
  const metadata = await parseFile(filePath);
  return metadata.format.duration;
}

export async function detectSilences(filePath, threshold, duration) {
  return new Promise((resolve, reject) => {
    const silences = [];

    logger.info({ filePath, threshold, duration }, 'Detecting silences');

    ffmpeg(filePath)
      .audioFilters(`silencedetect=n=${threshold}dB:d=${duration}`)
      .outputFormat('null')
      .on('stderr', (stderrLine) => {
        const silenceStartMatch = stderrLine.match(/silence_start: ([\d.]+)/);
        const silenceEndMatch = stderrLine.match(/silence_end: ([\d.]+)/);

        if (silenceStartMatch) {
          silences.push({ start: parseFloat(silenceStartMatch[1]) });
        }
        if (silenceEndMatch && silences.length > 0) {
          const lastSilence = silences[silences.length - 1];
          if (!lastSilence.end) {
            lastSilence.end = parseFloat(silenceEndMatch[1]);
            lastSilence.duration = lastSilence.end - lastSilence.start;
          }
        }
      })
      .on('end', () => {
        logger.info({ silenceCount: silences.length }, 'Silence detection complete');
        resolve(silences);
      })
      .on('error', (err) => {
        logger.error({ error: err.message }, 'Silence detection failed');
        reject(err);
      })
      .save('-');
  });
}

/**
 * Merge silences that are close together (within mergeGap seconds) into single regions.
 * This handles vinyl track breaks that often have multiple short silences in a row.
 */
function mergeSilences(silences, mergeGap = 5) {
  if (silences.length === 0) return [];

  const sorted = [...silences].sort((a, b) => a.start - b.start);
  const merged = [];
  let current = { ...sorted[0] };

  for (let i = 1; i < sorted.length; i++) {
    const next = sorted[i];
    const currentEnd = current.end || current.start;
    
    // If next silence starts within mergeGap of current silence's end, merge them
    if (next.start - currentEnd <= mergeGap) {
      current.end = next.end || next.start;
      current.duration = current.end - current.start;
    } else {
      merged.push(current);
      current = { ...next };
    }
  }
  merged.push(current);

  return merged;
}

/**
 * Detect where actual music starts by scanning RMS volume in small windows.
 * Vinyl lead-in has surface noise (-25 to -35dB) before the song begins (-15 to -20dB).
 * Returns the timestamp where music actually starts.
 */
async function detectMusicOnset(filePath, searchStart, searchEnd, musicThresholdDb = -22) {
  return new Promise((resolve, reject) => {
    const volumes = [];
    // Use astats to get per-frame RMS levels
    const cmd = `ffmpeg -ss ${searchStart} -t ${searchEnd - searchStart} -i "${filePath}" -af "astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level:file=-" -f null - 2>/dev/null`;
    
    exec(cmd, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
      if (error && !stdout) {
        resolve(searchStart);
        return;
      }
      
      const lines = stdout.split('\n');
      let currentPtsTime = null;
      
      for (const line of lines) {
        // Parse pts_time from frame lines
        const frameMatch = line.match(/pts_time:([\d.]+)/);
        if (frameMatch) {
          currentPtsTime = parseFloat(frameMatch[1]);
        }
        
        // Parse RMS level
        const rmsMatch = line.match(/lavfi\.astats\.Overall\.RMS_level=(-?[\d.]+)/);
        if (rmsMatch && currentPtsTime !== null) {
          const rms = parseFloat(rmsMatch[1]);
          if (rms > -100) { // Skip -inf values
            volumes.push({ time: searchStart + currentPtsTime, rms });
          }
        }
      }
      
      if (volumes.length === 0) {
        resolve(searchStart);
        return;
      }
      
      // Average into 0.1s windows for smoother detection
      const windowSize = 0.1;
      const windows = [];
      let windowStart = 0;
      let windowSum = 0;
      let windowCount = 0;
      
      for (const v of volumes) {
        const relTime = v.time - searchStart;
        if (relTime >= windowStart + windowSize && windowCount > 0) {
          windows.push({ time: searchStart + windowStart, rms: windowSum / windowCount });
          windowStart += windowSize;
          windowSum = 0;
          windowCount = 0;
        }
        windowSum += v.rms;
        windowCount++;
      }
      if (windowCount > 0) {
        windows.push({ time: searchStart + windowStart, rms: windowSum / windowCount });
      }
      
      // Find the first window where average volume exceeds the music threshold
      // Use a sliding window of 3 to avoid false triggers from clicks/pops
      for (let i = 0; i < windows.length - 2; i++) {
        const avg = (windows[i].rms + windows[i + 1].rms + windows[i + 2].rms) / 3;
        if (avg > musicThresholdDb) {
          // Music detected! Start slightly before (0.15s) for a clean attack
          const onset = Math.max(searchStart, windows[i].time - 0.15);
          resolve(onset);
          return;
        }
      }
      
      // No clear music onset found, use searchStart
      resolve(searchStart);
    });
  });
}

/**
 * Filter out lead-in silence (near start) and run-out silence (near end).
 * Vinyl records typically have silence at the very beginning and a long run-out at the end.
 */
function filterLeadInRunOut(silences, totalDuration, leadInMargin = 10, runOutMargin = 15) {
  return silences.filter(s => {
    const midpoint = ((s.start || 0) + (s.end || s.start)) / 2;
    // Skip silences in the lead-in region
    if (midpoint < leadInMargin) return false;
    // Skip silences in the run-out region
    if (midpoint > totalDuration - runOutMargin) return false;
    return true;
  });
}

export async function splitAudioFile(filePath, splits, outputDir) {
  const tracks = [];
  const basename = path.basename(filePath, path.extname(filePath));

  logger.info({ filePath, splitCount: splits.length }, 'Splitting audio file');

  for (let i = 0; i < splits.length; i++) {
    const split = splits[i];
    const outputPath = path.join(outputDir, `${basename}_track_${String(i + 1).padStart(2, '0')}.mp3`);

    await new Promise((resolve, reject) => {
      const command = ffmpeg(filePath)
        .seekInput(split.start)
        .audioCodec('libmp3lame')
        .audioBitrate('320k');

      if (split.duration) {
        command.duration(split.duration);
      }

      command
        .on('end', () => {
          logger.info({ track: i + 1, outputPath }, 'Track split complete');
          resolve();
        })
        .on('error', (err) => {
          logger.error({ error: err.message, track: i + 1 }, 'Track split failed');
          reject(err);
        })
        .save(outputPath);
    });

    tracks.push({
      index: i,
      path: outputPath,
      start: split.start,
      duration: split.duration || (splits[i + 1] ? splits[i + 1].start - split.start : null)
    });
  }

  return tracks;
}

export async function processAlbumSide(filePath, outputDir) {
  const duration = await getAudioDuration(filePath);
  logger.info({ filePath, duration }, 'Processing album side');

  const log = [];
  log.push({ type: 'info', message: `Audio duration: ${Math.floor(duration / 60)}m ${Math.round(duration % 60)}s` });

  // Try all silence detection levels and pick the one that finds the most track breaks
  const levels = config.audio.silenceDetection;
  let trackBreaks = [];
  let bestLevel = null;
  let bestBreaks = [];
  let bestLeadIn = null;
  let bestRunOut = null;

  for (const level of levels) {
    const rawSilences = await detectSilences(filePath, level.threshold, level.duration);
    log.push({
      type: 'info',
      message: `Silence detection [${level.label}] (${level.threshold}dB, ${level.duration}s): found ${rawSilences.length} raw silence(s)`
    });

    if (rawSilences.length < 2) continue;

    // Merge nearby silences (vinyl often has multiple short gaps between tracks)
    const merged = mergeSilences(rawSilences, 5);
    log.push({
      type: 'info',
      message: `  After merging nearby silences (within 5s): ${merged.length} silence region(s)`
    });

    // Identify lead-in and run-out silences before filtering them
    const leadIn = merged.find(s => {
      const mid = ((s.start || 0) + (s.end || s.start)) / 2;
      return mid < 10;
    });
    const runOut = [...merged].reverse().find(s => {
      const mid = ((s.start || 0) + (s.end || s.start)) / 2;
      return mid > duration - 15;
    });

    // Filter out lead-in and run-out
    const filtered = filterLeadInRunOut(merged, duration, 10, 15);
    const removedCount = merged.length - filtered.length;
    if (removedCount > 0) {
      log.push({
        type: 'info',
        message: `  Filtered out ${removedCount} silence(s) from lead-in (<10s) or run-out (last 15s)`
      });
    }

    log.push({
      type: filtered.length > bestBreaks.length ? 'success' : 'info',
      message: `  → ${filtered.length} track break(s) → ${filtered.length + 1} track(s)${filtered.length > bestBreaks.length ? ' (new best)' : ''}`
    });

    if (filtered.length > bestBreaks.length) {
      bestBreaks = filtered;
      bestLevel = level;
      bestLeadIn = leadIn;
      bestRunOut = runOut;
    }
  }

  if (bestBreaks.length >= 1) {
    trackBreaks = bestBreaks;
    log.push({
      type: 'success',
      message: `Selected ${bestLevel.label} detection — ${trackBreaks.length} track break(s) → ${trackBreaks.length + 1} tracks`
    });

    // Log the break positions
    for (let i = 0; i < trackBreaks.length; i++) {
      const b = trackBreaks[i];
      const startMin = Math.floor(b.start / 60);
      const startSec = Math.round(b.start % 60);
      const endMin = Math.floor((b.end || b.start) / 60);
      const endSec = Math.round((b.end || b.start) % 60);
      log.push({
        type: 'info',
        message: `  Break ${i + 1}: ${startMin}:${String(startSec).padStart(2, '0')} → ${endMin}:${String(endSec).padStart(2, '0')}`
      });
    }
  }

  if (trackBreaks.length === 0) {
    log.push({ type: 'warning', message: 'No track breaks found at any detection level — entire side will be treated as a single track' });
    logger.warn('No split points found, treating as single track');
    return {
      tracks: [{
        index: 0,
        path: filePath,
        start: 0,
        duration: duration
      }],
      log
    };
  }

  // Determine first track start: skip lead-in silence AND vinyl noise
  let firstTrackStart = 0;
  if (bestLeadIn && bestLeadIn.end) {
    const silenceEnd = bestLeadIn.end;
    log.push({ type: 'info', message: `Lead-in silence ends at ${silenceEnd.toFixed(1)}s — scanning for music onset...` });
    
    // Scan from silence end to find where actual music starts (not just vinyl noise)
    const scanEnd = Math.min(silenceEnd + 15, duration); // scan up to 15s after silence ends
    const musicOnset = await detectMusicOnset(filePath, silenceEnd, scanEnd);
    firstTrackStart = musicOnset;
    
    if (musicOnset > silenceEnd + 0.5) {
      log.push({ type: 'info', message: `Music onset detected at ${musicOnset.toFixed(1)}s (skipped ${(musicOnset - silenceEnd).toFixed(1)}s of vinyl noise)` });
    } else {
      log.push({ type: 'info', message: `Music starts at ${musicOnset.toFixed(1)}s` });
    }
  }

  // Determine last track end: cut before run-out
  let lastTrackEnd = duration;
  if (bestRunOut && bestRunOut.start) {
    lastTrackEnd = bestRunOut.start;
    log.push({ type: 'info', message: `Cutting run-out silence: last track ends at ${lastTrackEnd.toFixed(1)}s` });
  }

  // Convert track breaks to split points
  const splits = [];
  splits.push({ start: firstTrackStart }); // First track starts after lead-in

  for (const brk of trackBreaks) {
    // Split at the midpoint of the silence region
    const midPoint = ((brk.start || 0) + (brk.end || brk.start)) / 2;
    splits.push({ start: midPoint });
  }

  // Calculate durations (last track ends at run-out or file end)
  for (let i = 0; i < splits.length; i++) {
    if (i < splits.length - 1) {
      splits[i].duration = splits[i + 1].start - splits[i].start;
    } else {
      splits[i].duration = lastTrackEnd - splits[i].start;
    }
  }

  // Filter out tracks that are too short
  const validSplits = splits.filter(s => s.duration >= config.audio.minTrackLength);
  const filteredCount = splits.length - validSplits.length;

  if (filteredCount > 0) {
    log.push({ type: 'info', message: `Filtered out ${filteredCount} segment(s) shorter than ${config.audio.minTrackLength}s` });
  }

  log.push({ type: 'success', message: `Split into ${validSplits.length} track(s)` });
  logger.info({ totalTracks: validSplits.length }, 'Split points identified');

  const tracks = await splitAudioFile(filePath, validSplits, outputDir);
  return { tracks, log };
}