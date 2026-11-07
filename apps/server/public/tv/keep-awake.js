// Keep the cast TV from dimming or starting its screensaver. A cast page with
// no media playing looks idle to webOS, so hold a Screen Wake Lock where the
// browser supports it and also loop a tiny muted video, which TVs treat as
// active playback.

const VIDEO_SOURCES = [
  ["/tv/assets/keep-awake.mp4", "video/mp4"],
  ["/tv/assets/keep-awake.webm", "video/webm"]
];
const RETRY_MS = 60_000;

export function installKeepAwake(doc = document) {
  let wakeLock = null;

  const video = doc.createElement("video");
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.autoplay = true;
  video.setAttribute("muted", "");
  video.setAttribute("playsinline", "");
  video.setAttribute("aria-hidden", "true");
  // Kept in the render tree (not display:none) so the TV counts it as playing.
  video.style.cssText =
    "position:fixed;right:0;bottom:0;width:2px;height:2px;opacity:0.01;pointer-events:none;z-index:-1";
  for (const [src, type] of VIDEO_SOURCES) {
    const source = doc.createElement("source");
    source.src = src;
    source.type = type;
    video.appendChild(source);
  }
  doc.body.appendChild(video);

  const playVideo = () => {
    const p = video.play?.();
    if (p && typeof p.catch === "function") p.catch(() => {});
  };

  const requestLock = async () => {
    if (wakeLock || doc.visibilityState !== "visible") return;
    try {
      wakeLock = await navigator.wakeLock?.request("screen");
      wakeLock?.addEventListener?.("release", () => {
        wakeLock = null;
      });
    } catch {
      wakeLock = null;
    }
  };

  const refresh = () => {
    if (video.paused) playVideo();
    requestLock();
  };

  doc.addEventListener("visibilitychange", refresh);
  setInterval(refresh, RETRY_MS);
  refresh();
}
