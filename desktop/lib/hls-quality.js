const fetch = require("cross-fetch");
const { net } = require("electron");
const { probeStream, findFfprobe } = require("./stream-probe");
const { safeDisplayUrl } = require("./stream-debug");
const { enrichRequestHeaders } = require("./session-headers");
const { validatePlaylistSegmentContent } = require("./segment-probe");

const STREAM_INF_PATTERN = /#EXT-X-STREAM-INF:([^\n]+)/i;
const RESOLUTION_PATTERN = /RESOLUTION=(\d+)x(\d+)/i;
const BANDWIDTH_PATTERN = /BANDWIDTH=(\d+)/i;

function headersToFetchObject(requestHeaders = []) {
  const headers = {};
  for (const header of requestHeaders) {
    if (header?.name && header?.value) {
      headers[header.name] = header.value;
    }
  }
  return headers;
}

function resolvePlaylistUrl(baseUrl, relativeUrl) {
  return new URL(relativeUrl, baseUrl).toString();
}

function parseStreamInf(line) {
  const match = line.match(STREAM_INF_PATTERN);
  const attrs = match ? match[1] : line;
  const resolution = attrs.match(RESOLUTION_PATTERN);
  const bandwidth = attrs.match(BANDWIDTH_PATTERN);

  return {
    width: resolution ? Number(resolution[1]) : 0,
    height: resolution ? Number(resolution[2]) : 0,
    bandwidth: bandwidth ? Number(bandwidth[1]) : 0
  };
}

function parseVariants(m3u8Text, baseUrl) {
  const lines = m3u8Text.split(/\r?\n/);
  const variants = [];
  let pending = null;

  for (const line of lines) {
    if (line.startsWith("#EXT-X-STREAM-INF:")) {
      pending = parseStreamInf(line);
      continue;
    }

    if (pending && line && !line.startsWith("#")) {
      variants.push({
        ...pending,
        url: resolvePlaylistUrl(baseUrl, line.trim())
      });
      pending = null;
    }
  }

  return variants;
}

function isMasterPlaylist(m3u8Text) {
  return m3u8Text.includes("#EXT-X-STREAM-INF");
}

function segmentLines(m3u8Text) {
  return m3u8Text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
}

function playlistDurationSeconds(m3u8Text) {
  let total = 0;
  for (const line of m3u8Text.split(/\r?\n/)) {
    const match = line.match(/#EXTINF:([\d.]+)/);
    if (match) total += Number(match[1]);
  }
  return total > 0 ? total : null;
}

async function getPlaylistDuration(url, requestHeaders = []) {
  try {
    const text = await fetchPlaylistText(url, requestHeaders);
    return playlistDurationSeconds(text);
  } catch {
    return null;
  }
}

function isLikelyVideoSegment(segmentUrl) {
  const lower = segmentUrl.toLowerCase();
  if (/\.(png|jpe?g|gif|webp|svg|bmp)(\?|#|$)/.test(lower)) return false;
  if (/tiktokcdn\.com\/obj\/tos-alisg-avt/.test(lower)) return false;
  if (/\/avatar|\/avt-|profile_pic|cover_thumb|\/thumb|poster|sprite|preview|storyboard|vtt/.test(lower)) {
    return false;
  }
  return true;
}

function isLikelyVideoPlaylistUrl(url) {
  const lower = String(url).toLowerCase();
  if (/\.(png|jpe?g|gif|webp|svg|bmp)(\?|#|$)/.test(lower)) return false;
  if (/(^|\/)(thumb|poster|sprite|storyboard)[^/]*\.m3u8(\?|#|$)/.test(lower)) return false;
  return true;
}

function validateMediaPlaylistText(m3u8Text) {
  const segments = segmentLines(m3u8Text);
  if (!segments.length) return false;
  if (segments.some(isLikelyVideoSegment)) return true;
  if (/#EXT-X-MAP:/i.test(m3u8Text)) {
    return !segments.every((segment) =>
      /\.(png|jpe?g|gif|webp|svg|bmp)(\?|#|$)/i.test(segment)
    );
  }
  return false;
}

function isProxyPlaylistUrl(url) {
  return /animanga\.fun\/hls\//i.test(String(url));
}

function qualityScore(variant) {
  const pixels = (variant.width || 0) * (variant.height || 0);
  return pixels > 0 ? pixels : variant.bandwidth || 0;
}

function formatQuality(variant) {
  if (!variant) return "unknown";

  if (variant.width && variant.height) {
    if (variant.height >= 2160 || variant.width >= 3840) return "4K";
    if (variant.height >= 1080 || variant.width >= 1920) return "1080p";
    if (variant.height >= 720 || variant.width >= 1280) return "720p";
    return `${variant.width}x${variant.height}`;
  }

  if (variant.bandwidth >= 15000000) return "4K";
  if (variant.bandwidth >= 5000000) return "1080p";
  if (variant.bandwidth >= 2500000) return "720p";
  return "SD";
}

function urlQualityHint(url) {
  const lower = String(url).toLowerCase();
  if (/2160|3840|4k/.test(lower)) return 3840 * 2160;
  if (/1080|1920/.test(lower)) return 1920 * 1080;
  if (/720|1280/.test(lower)) return 1280 * 720;
  if (/480|854/.test(lower)) return 854 * 480;
  return 0;
}

function candidateSortScore(playlist) {
  const lower = String(playlist.url).toLowerCase();
  let score = playlist.lastSeenAt;
  if (/master\.m3u8/.test(lower)) score += 500_000_000;
  else if (/index\.m3u8|playlist\.m3u8/.test(lower)) score += 250_000_000;
  else if (/\?t\.m3u8$/.test(lower)) score -= 500_000_000;
  if (playlist.kind === "media") score += 1_000_000_000;
  if (isProxyPlaylistUrl(playlist.url)) score += 500_000_000;
  if (!isLikelyVideoPlaylistUrl(playlist.url)) score -= 2_000_000_000;
  score += urlQualityHint(playlist.url);
  return score;
}

function mergePageHeaders(requestHeaders = [], pageUrl = "", embedUrl = "") {
  const headers = headersToFetchObject(requestHeaders);
  const refererUrl = embedUrl || pageUrl;

  if (refererUrl) {
    const hasHeader = (name) =>
      Object.keys(headers).some((key) => key.toLowerCase() === name.toLowerCase());

    if (!hasHeader("referer")) {
      headers.Referer = refererUrl;
    }

    if (!hasHeader("origin")) {
      try {
        headers.Origin = new URL(refererUrl).origin;
      } catch {
        // Ignore invalid referer URLs.
      }
    }
  }

  return headers;
}

async function fetchPlaylistText(url, requestHeaders = [], options = {}) {
  const enriched = await enrichRequestHeaders(requestHeaders, {
    pageUrl: options.pageUrl,
    targetUrl: url,
    embedUrl: options.embedUrl,
    session: options.session
  });
  const headers = mergePageHeaders(enriched, options.pageUrl, options.embedUrl);

  const response = options.session
    ? await net.fetch(url, { session: options.session, headers, redirect: "follow" })
    : await fetch(url, { headers, redirect: "follow" });

  if (!response.ok) {
    throw new Error(`Could not fetch playlist (${response.status}).`);
  }

  return response.text();
}

async function tryFetchValidation(media, requestHeaders, options) {
  try {
    const text = await fetchPlaylistText(media.url, requestHeaders, options);
    if (!validateMediaPlaylistText(text)) return null;

    const segments = segmentLines(text);
    if (
      segments.length &&
      segments.every((segment) => /\.(png|jpe?g|gif|webp|svg|bmp)(\?|#|$)/i.test(segment))
    ) {
      return null;
    }

    const segmentCheck = await validatePlaylistSegmentContent(
      text,
      media.url,
      requestHeaders,
      { ...options, ffprobePath: findFfprobe() }
    );

    if (segmentCheck.status === "invalid") {
      return { rejected: "png" };
    }

    if (segmentCheck.status === "ok") {
      return {
        entry: {
          url: media.url,
          qualityLabel: media.qualityLabel || "stream",
          width: segmentCheck.width || media.width || 0,
          height: segmentCheck.height || media.height || 0,
          codec: segmentCheck.codec || "h264",
          streamIndex: segmentCheck.streamIndex,
          score:
            (segmentCheck.width || media.width || 0) * (segmentCheck.height || media.height || 0) ||
            urlQualityHint(media.url) ||
            500000,
          validatedByFetch: true
        }
      };
    }

    if (segmentCheck.status === "likely-video") {
      return {
        entry: {
          url: media.url,
          qualityLabel: media.qualityLabel || "stream",
          width: media.width || 0,
          height: media.height || 0,
          codec: "h264",
          streamIndex: null,
          score:
            (media.width || 0) * (media.height || 0) || urlQualityHint(media.url) || 500000,
          validatedByFetch: true
        }
      };
    }

    return null;
  } catch {
    return null;
  }
}

async function listCandidateMediaUrls(url, requestHeaders = [], depth = 0, options = {}) {
  const text = await fetchPlaylistText(url, requestHeaders, options);

  if (!isMasterPlaylist(text)) {
    if (!validateMediaPlaylistText(text)) {
      throw new Error("Media playlist contains invalid segments.");
    }
    return [{ url, width: 0, height: 0, qualityLabel: "stream" }];
  }

  if (depth >= 3) {
    throw new Error("Master playlist nesting too deep.");
  }

  const variants = [...parseVariants(text, url)].sort((a, b) => qualityScore(b) - qualityScore(a));
  const urls = [];

  for (const variant of variants) {
    try {
      const variantText = await fetchPlaylistText(variant.url, requestHeaders, options);
      if (isMasterPlaylist(variantText)) {
        const nested = await listCandidateMediaUrls(variant.url, requestHeaders, depth + 1, options);
        for (const entry of nested) {
          urls.push({
            ...entry,
            qualityLabel: formatQuality(variant),
            width: variant.width || entry.width,
            height: variant.height || entry.height
          });
        }
        continue;
      }

      if (!validateMediaPlaylistText(variantText)) continue;

      urls.push({
        url: variant.url,
        width: variant.width,
        height: variant.height,
        qualityLabel: formatQuality(variant)
      });
    } catch {
      // Try the next quality variant.
    }
  }

  if (!urls.length && variants.length) {
    const best = variants[0];
    urls.push({
      url: best.url,
      width: best.width,
      height: best.height,
      qualityLabel: formatQuality(best)
    });
  }

  return urls;
}

function qualityLabelFromProbe(probe, fallback = "stream") {
  if (probe.height >= 1080) return "1080p";
  if (probe.height >= 720) return "720p";
  if (probe.width > 0 && probe.height > 0) return `${probe.width}x${probe.height}`;
  return fallback;
}

async function resolveBestFromCandidates(playlists, options = {}) {
  if (!playlists.length) return null;

  const ffprobePath = findFfprobe();
  const debugReport = options.debugReport || null;

  if (debugReport) {
    debugReport.ffprobePath = ffprobePath;
    debugReport.probes = debugReport.probes || [];
  }

  const sorted = [...playlists].sort((a, b) => candidateSortScore(b) - candidateSortScore(a));
  let bestResult = null;
  let pngOnlyCount = 0;
  let probeFailCount = 0;
  let fetchOkCount = 0;

  for (const candidate of sorted) {
    const urlsToTry = [{ url: candidate.url, qualityLabel: "stream", width: 0, height: 0 }];
    let listError = null;

    try {
      const resolvedUrls = await listCandidateMediaUrls(
        candidate.url,
        candidate.requestHeaders,
        0,
        options
      );
      urlsToTry.splice(0, urlsToTry.length, ...resolvedUrls);
    } catch (error) {
      listError = error.message || String(error);
    }

    if (debugReport && listError) {
      debugReport.probes.push({
        candidate: candidate.displayUrl,
        mediaDisplayUrl: candidate.displayUrl,
        status: "error",
        error: `playlist parse: ${listError}`
      });
    }

    for (const media of urlsToTry) {
      const probeHeaders = await enrichRequestHeaders(candidate.requestHeaders, {
        pageUrl: options.pageUrl,
        targetUrl: media.url,
        embedUrl: options.embedUrl,
        session: options.session
      });

      let probe = { status: "unknown" };
      if (ffprobePath) {
        probe = await probeStream(media.url, probeHeaders, ffprobePath);
      }

      let selectedEntry = null;

      if (probe.status === "ok") {
        selectedEntry = {
          url: media.url,
          qualityLabel: qualityLabelFromProbe(probe, media.qualityLabel),
          width: probe.width || media.width || 0,
          height: probe.height || media.height || 0,
          streamIndex: probe.streamIndex,
          codec: probe.codec,
          score:
            (probe.width || media.width || 0) * (probe.height || media.height || 0) ||
            urlQualityHint(media.url)
        };
      } else if (probe.status === "invalid") {
        pngOnlyCount += 1;
      } else {
        probeFailCount += 1;
        const fetchResult = await tryFetchValidation(
          media,
          candidate.requestHeaders,
          options
        );
        if (fetchResult?.rejected === "png") {
          pngOnlyCount += 1;
          probe = {
            ...probe,
            status: "invalid",
            codec: "png",
            error: "segment contains PNG preview data"
          };
        } else if (fetchResult?.entry) {
          fetchOkCount += 1;
          selectedEntry = {
            ...fetchResult.entry,
            source: candidate
          };
          probe = {
            ...probe,
            status: "fetch-ok",
            codec: fetchResult.entry.codec || "h264",
            width: fetchResult.entry.width,
            height: fetchResult.entry.height,
            streamIndex: fetchResult.entry.streamIndex
          };
        }
      }

      if (debugReport) {
        debugReport.probes.push({
          candidate: candidate.displayUrl,
          mediaDisplayUrl: safeDisplayUrl(media.url),
          mediaUrl: media.url,
          status: probe.status,
          codec: probe.codec,
          width: selectedEntry?.width || probe.width,
          height: selectedEntry?.height || probe.height,
          streamIndex: selectedEntry?.streamIndex ?? probe.streamIndex,
          streams: probe.streams || [],
          error: probe.error || null
        });
      }

      if (!selectedEntry) continue;

      if (!bestResult || selectedEntry.score > bestResult.score) {
        bestResult = {
          ...selectedEntry,
          source: candidate
        };
      }
    }

    if (bestResult?.height >= 1080) break;
  }

  if (debugReport) {
    if (bestResult) {
      debugReport.selected = {
        url: bestResult.url,
        qualityLabel: bestResult.qualityLabel,
        codec: bestResult.codec,
        width: bestResult.width,
        height: bestResult.height,
        streamIndex: bestResult.streamIndex,
        validatedByFetch: Boolean(bestResult.validatedByFetch)
      };
      debugReport.summary = bestResult.validatedByFetch
        ? `Selected ${bestResult.qualityLabel} via playlist fetch (ffprobe unavailable)`
        : `Selected ${bestResult.codec} ${bestResult.qualityLabel}`;
    } else if (pngOnlyCount > 0 && probeFailCount === 0) {
      debugReport.summary = `All ${pngOnlyCount} probed URL(s) were thumbnails/images (png) — keep the movie playing 30+ seconds, then try again`;
    } else if (pngOnlyCount > 0) {
      debugReport.summary = `${pngOnlyCount} PNG preview stream(s) skipped — real video not captured yet; play longer and retry`;
    } else if (probeFailCount > 0 && fetchOkCount === 0) {
      debugReport.summary = `${probeFailCount} URL(s) failed ffprobe/fetch — proxy may need cookies or the stream expired`;
    } else {
      debugReport.summary = "No playable h264/hevc stream found in captured playlists";
    }
  }

  return bestResult;
}

async function diagnoseStreamCandidates(playlists, options = {}) {
  const report = {
    generatedAt: new Date().toISOString(),
    pageUrl: options.pageUrl || "",
    playlistCount: playlists.length,
    captures: playlists.map((item) => ({
      displayUrl: item.displayUrl,
      kind: item.kind,
      hits: item.hits,
      headerCount: item.requestHeaders?.length || 0,
      lastSeenAt: item.lastSeenAt
    })),
    probes: [],
    selected: null,
    summary: null
  };

  const resolved = await resolveBestFromCandidates(playlists, {
    ...options,
    debugReport: report
  });

  return { report, resolved };
}

async function resolveBestValidMediaUrl(url, requestHeaders = [], depth = 0, options = {}) {
  const entries = await listCandidateMediaUrls(url, requestHeaders, depth, options);
  if (!entries.length) throw new Error("No valid media variant found.");
  return {
    url: entries[0].url,
    quality: "variant",
    qualityLabel: entries[0].qualityLabel,
    width: entries[0].width,
    height: entries[0].height
  };
}

async function resolveHighestQualityPlaylistUrl(url, requestHeaders = [], depth = 0) {
  return resolveBestValidMediaUrl(url, requestHeaders, depth);
}

module.exports = {
  resolveHighestQualityPlaylistUrl,
  resolveBestFromCandidates,
  diagnoseStreamCandidates,
  resolveBestValidMediaUrl,
  validateMediaPlaylistText,
  getPlaylistDuration,
  formatQuality,
  isLikelyVideoPlaylistUrl,
  isLikelyVideoSegment
};
