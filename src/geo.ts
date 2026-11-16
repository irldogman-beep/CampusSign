import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';

// Best-effort device location. Keep only a fresh, sufficiently accurate fix;
// the server still makes the final attendance/geofence decision.
export interface Fix { lat: number; lng: number; acc: number }

function validFix(f: Fix, maxAcceptableM: number): boolean {
  return Number.isFinite(f.lat) &&
    Number.isFinite(f.lng) &&
    Number.isFinite(f.acc) &&
    f.lat >= -90 && f.lat <= 90 &&
    f.lng >= -180 && f.lng <= 180 &&
    f.acc > 0 && f.acc <= maxAcceptableM;
}

async function getNativeFix(maxWaitMs: number, maxAcceptableM: number): Promise<Fix | null> {
  try {
    // Use the native permission flow on Android/iOS instead of relying on the
    // WebView's browser geolocation prompt.
    let permission = await Geolocation.checkPermissions();
    if (permission.location !== 'granted') {
      permission = await Geolocation.requestPermissions({ permissions: ['location'] });
    }
    if (permission.location !== 'granted') return null;

    const position = await Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: Math.max(4000, maxWaitMs),
      enableLocationFallback: true,
    });
    const fix = {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
      acc: position.coords.accuracy,
    };
    return validFix(fix, maxAcceptableM) ? fix : null;
  } catch (error) {
    console.warn('CampusSign native location lookup failed:', error);
    return null;
  }
}

export function getBestFix(
  maxWaitMs = 10000,
  goodEnoughM = 15,
  maxAcceptableM = 50
): Promise<Fix | null> {
  if (Capacitor.isNativePlatform()) {
    return getNativeFix(maxWaitMs, maxAcceptableM);
  }

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
      resolve(best && validFix(best, maxAcceptableM) ? best : null);
    };

    try {
      watchId = navigator.geolocation.watchPosition(
        (position) => {
          const fix = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            acc: position.coords.accuracy,
          };
          if (!validFix(fix, maxAcceptableM)) return;
          if (!best || fix.acc < best.acc) best = fix;
          if (fix.acc <= goodEnoughM) finish();
        },
        (error) => {
          console.warn('CampusSign browser location lookup failed:', error);
          finish();
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: maxWaitMs }
      );
      timer = setTimeout(finish, maxWaitMs);
    } catch (error) {
      console.warn('CampusSign could not start browser location lookup:', error);
      finish();
    }
  });
}
