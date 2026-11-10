// Best-effort device location. Watches for a few seconds and keeps the most accurate reading.
export interface Fix { lat: number; lng: number; acc: number }

export function getBestFix(maxWaitMs = 10000, goodEnoughM = 15): Promise<Fix | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    let best: Fix | null = null;
    let done = false;
    let watchId = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = () => {
      if (done) return;
      done = true;
      navigator.geolocation.clearWatch(watchId);
      if (timer) clearTimeout(timer);
      resolve(best);
    };
    watchId = navigator.geolocation.watchPosition(
      (p) => {
        const f = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy };
        if (!best || f.acc < best.acc) best = f;
        if (f.acc <= goodEnoughM) finish();
      },
      () => finish(), // permission denied or no signal
      { enableHighAccuracy: true, maximumAge: 0, timeout: maxWaitMs }
    );
    timer = setTimeout(finish, maxWaitMs);
  });
}
