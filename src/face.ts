// ---------------------------------------------------------------------------
// Face helpers: model loading, liveness math, matching, and on-device storage.
// Uses @vladmandic/face-api. The model files are fetched from jsDelivr at
// runtime, and the library itself is loaded lazily so the first page stays light.
// ---------------------------------------------------------------------------
const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7/model/';

/** Smaller = stricter. 0.6 is the library default; 0.55 is a bit tighter. */
export const FACE_MATCH_THRESHOLD = 0.55;

let faceApiPromise: Promise<any> | null = null;

export function loadFaceApi(): Promise<any> {
  if (!faceApiPromise) {
    faceApiPromise = (async () => {
      const faceapi: any = await import('@vladmandic/face-api');
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
      ]);
      return faceapi;
    })().catch((e) => {
      faceApiPromise = null; // allow retry
      throw e;
    });
  }
  return faceApiPromise;
}

// ---- geometry (68-point landmarks) ----------------------------------------
type Pt = { x: number; y: number };
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
const eyeRatio = (p: Pt[], i: number) =>
  (dist(p[i + 1], p[i + 5]) + dist(p[i + 2], p[i + 4])) / (2 * dist(p[i], p[i + 3]));

/** Eye aspect ratio: roughly 0.3 open, under 0.2 closed. */
export const eyeOpenness = (p: Pt[]) => (eyeRatio(p, 36) + eyeRatio(p, 42)) / 2;

/** 0 = facing the camera, negative/positive = turned to either side. */
export const headTurn = (p: Pt[]) => (p[30].x - p[0].x) / (p[16].x - p[0].x) - 0.5;

// ---- matching ----------------------------------------------------------------
export function descriptorDistance(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += (a[i] - b[i]) ** 2;
  return Math.sqrt(sum);
}

export function bestDistance(sample: number[], enrolled: number[][]): number {
  return Math.min(...enrolled.map((e) => descriptorDistance(sample, e)));
}

/**
 * Check that a multi-frame enrolment belongs to one visually consistent face.
 * Each captured sample must have at least one close neighbour among the other
 * samples. This catches an isolated frame where the detector switched to a
 * second person or produced a badly degraded descriptor.
 */
export function areFaceSamplesConsistent(samples: number[][], maxNearestDistance = 0.6): boolean {
  if (samples.length < 2) return false;
  return samples.every((sample, index) => {
    let nearest = Number.POSITIVE_INFINITY;
    samples.forEach((other, otherIndex) => {
      if (index !== otherIndex) nearest = Math.min(nearest, descriptorDistance(sample, other));
    });
    return Number.isFinite(nearest) && nearest <= maxNearestDistance;
  });
}

// ---- photo crop ----------------------------------------------------------------
export function cropFace(
  video: HTMLVideoElement,
  box: { x: number; y: number; width: number; height: number },
  size = 160
): string {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const side = Math.max(box.width, box.height) * 1.6;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  canvas.getContext('2d')!.drawImage(video, cx - side / 2, cy - side / 2, side, side, 0, 0, size, size);
  return canvas.toDataURL('image/jpeg', 0.7);
}

// ---- on-device enrollment store ---------------------------------------------
// Only numeric face templates are stored (no photos), and only in THIS browser.
const STORE_KEY = 'campussign_faces_v1';

function readStore(): Record<string, number[][]> {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
  } catch {
    return {};
  }
}

export function getEnrollment(studentId: string): number[][] | null {
  return readStore()[studentId.trim().toUpperCase()] || null;
}

export function saveEnrollment(studentId: string, descriptors: number[][]): boolean {
  try {
    const store = readStore();
    store[studentId.trim().toUpperCase()] = descriptors;
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
    return true;
  } catch {
    return false;
  }
}

export function deleteEnrollment(studentId: string): void {
  try {
    const store = readStore();
    delete store[studentId.trim().toUpperCase()];
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch {
    /* ignore */
  }
}

export const listEnrolledIds = (): string[] => Object.keys(readStore());
