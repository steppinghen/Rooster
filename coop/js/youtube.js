// ------------------------------------------------------------------------
// coop/js/youtube.js
//
// Thin wrapper over the YouTube IFrame Player API. Loads the API script
// on first use; caller passes an element ID and video ID, plus an
// onEnded callback (used to return to the home grid).
//
// Extracted verbatim in behavior from the original single-file app.
// ------------------------------------------------------------------------

let apiLoading = null;

function loadIframeApi() {
  if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
  if (apiLoading) return apiLoading;
  apiLoading = new Promise(resolve => {
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(script);
    window.onYouTubeIframeAPIReady = () => resolve(window.YT);
  });
  return apiLoading;
}

export async function createPlayer(elementId, videoId, { onEnded } = {}) {
  const YT = await loadIframeApi();
  const player = new YT.Player(elementId, {
    videoId,
    playerVars: {
      autoplay: 1,
      rel: 0,
      modestbranding: 1,
      playsinline: 1,
      controls: 1
    },
    events: {
      onStateChange: (e) => {
        if (e.data === YT.PlayerState.ENDED && typeof onEnded === 'function') onEnded();
      }
    }
  });
  return player;
}

export function destroyPlayer(player) {
  try { player && player.destroy && player.destroy(); } catch { /* ignore */ }
}
