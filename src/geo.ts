// Best-effort device location. Keep the most accurate fresh reading, but never
// treat a very imprecise fix as evidence that someone is outside the classroom.
export interface Fix { lat: number; lng: number; acc: number }

export function getBestFix(
  maxWaitMs = 10000,
  goodEnoughM = 15,
  maxAcceptableM = 50
): Promise<Fix | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);

    let best: Fix | null = null;
    let done = false;
    let watchId: number | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const finish = () => {
      if (done) return;
      done = true;
      if (watchId !== undefined) navigator.geolocation.clearWatch(watchId);
      if (timer) clearTimeout(timer);
      // A timeout with only a weak fix is not a reliable location result.
      resolve(best && best.acc <= maxAcceptableM ? best : null);
    };

    watchId = navigator.geolocation.watchPosition(
      (p) => {
        const f = {
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          acc: p.coords.accuracy
        };

        const valid =
          Number.isFinite(f.lat) &&
          Number.isFinite(f.lng) &&
          Number.isFinite(f.acc) &&
          f.lat >= -90 &&
          f.lat <= 90 &&
          f.lng >= -180 &&
          f.lng <= 180 &&
          f.acc > 0;

        if (!valid) return;
        if (!best || f.acc < best.acc) best = f;
        if (f.acc <= goodEnoughM) finish();
      },
      () => finish(), // permission denied or no signal
      { enableHighAccuracy: true, maximumAge: 0, timeout: maxWaitMs }
    );

    timer = setTimeout(finish, maxWaitMs);
  });
}
