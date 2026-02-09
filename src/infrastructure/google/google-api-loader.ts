let gapiPromise: Promise<typeof gapi> | null = null;
let gisPromise: Promise<typeof google> | null = null;

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.head.appendChild(script);
  });
}

export function loadGoogleApi(): Promise<typeof gapi> {
  if (gapiPromise) return gapiPromise;

  gapiPromise = loadScript("https://apis.google.com/js/api.js").then(
    () =>
      new Promise<typeof gapi>((resolve) => {
        gapi.load("picker", () => resolve(gapi));
      })
  );

  return gapiPromise;
}

export function loadGoogleIdentityServices(): Promise<typeof google> {
  if (gisPromise) return gisPromise;

  gisPromise = loadScript("https://accounts.google.com/gsi/client").then(
    () => google
  );

  return gisPromise;
}

export async function ensureGoogleLoaded(): Promise<{
  gapi: typeof gapi;
  google: typeof google;
}> {
  const [gapiResult, googleResult] = await Promise.all([
    loadGoogleApi(),
    loadGoogleIdentityServices(),
  ]);
  return { gapi: gapiResult, google: googleResult };
}
