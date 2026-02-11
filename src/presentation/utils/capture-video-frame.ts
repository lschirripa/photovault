const TIMEOUT_MS = 15_000;
const MAX_WIDTH = 400;
const JPEG_QUALITY = 0.8;
const SEEK_TIME = 1; // seconds

/**
 * Captures a single frame from a video file using a hidden <video> + <canvas>.
 * Returns a JPEG Blob on success, or null if the browser can't decode the video.
 *
 * Mobile browsers require the video to be in the DOM and playing before seeking,
 * so we insert a hidden element, call play(), then seek once playback starts.
 */
export function captureVideoFrame(file: File): Promise<Blob | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    let settled = false;

    const timer = setTimeout(() => {
      cleanup();
      resolve(null);
    }, TIMEOUT_MS);

    function cleanup() {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video.pause();
      video.removeAttribute("src");
      video.load();
      video.remove();
      URL.revokeObjectURL(url);
    }

    let retried = false;

    function isBlankFrame(ctx: CanvasRenderingContext2D, width: number, height: number): boolean {
      // Sample a small region to detect all-black frames
      const sampleSize = Math.min(32, width, height);
      const imageData = ctx.getImageData(0, 0, sampleSize, sampleSize);
      let totalBrightness = 0;
      for (let i = 0; i < imageData.data.length; i += 4) {
        totalBrightness += imageData.data[i] + imageData.data[i + 1] + imageData.data[i + 2];
      }
      const avgBrightness = totalBrightness / (sampleSize * sampleSize * 3);
      return avgBrightness < 5;
    }

    function captureFrame() {
      try {
        if (video.videoWidth === 0 || video.videoHeight === 0) {
          cleanup();
          resolve(null);
          return;
        }

        const canvas = document.createElement("canvas");
        const scale = Math.min(1, MAX_WIDTH / video.videoWidth);
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          cleanup();
          resolve(null);
          return;
        }

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        // If frame is blank/black and we haven't retried, seek to 50% of duration
        if (!retried && isBlankFrame(ctx, canvas.width, canvas.height)) {
          retried = true;
          video.currentTime = video.duration * 0.5;
          return; // onseeked will fire captureFrame again
        }

        canvas.toBlob(
          (blob) => {
            cleanup();
            resolve(blob);
          },
          "image/jpeg",
          JPEG_QUALITY
        );
      } catch {
        cleanup();
        resolve(null);
      }
    }

    // Hide the video but keep it in the DOM (required for mobile)
    video.style.position = "fixed";
    video.style.top = "-9999px";
    video.style.width = "1px";
    video.style.height = "1px";
    video.style.opacity = "0";
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    // setAttribute needed because React-style camelCase doesn't always work on raw elements
    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "");

    video.onseeked = captureFrame;

    video.onloadeddata = () => {
      // Desktop browsers: seeking works without play()
      const target = Math.min(SEEK_TIME, video.duration * 0.1);
      video.currentTime = target;

      // Mobile browsers: seeking may be ignored until playing.
      // Start muted playback (allowed without gesture), then seek.
      video.play().then(() => {
        video.currentTime = target;
      }).catch(() => {
        // play() rejected — desktop already handled via onloadeddata + seek above
      });
    };

    video.onerror = () => {
      cleanup();
      resolve(null);
    };

    document.body.appendChild(video);
    video.src = url;
  });
}
