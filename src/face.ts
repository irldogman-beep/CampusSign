// ---------------------------------------------------------------------------
// Face helpers: model loading, liveness math and descriptor matching.
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
  if (a.length !== 128 || b.length !== 128) return Number.POSITIVE_INFINITY;
  let sum = 0;
  for (let i = 0; i < 128; i++) {
    const av = a[i];
    const bv = b[i];
    if (!Number.isFinite(av) || !Number.isFinite(bv)) return Number.POSITIVE_INFINITY;
    sum += (av - bv) ** 2;
  }
  return Math.sqrt(sum);
}

export function bestDistance(sample: number[], enrolled: number[][]): number {
  if (!enrolled.length) return Number.POSITIVE_INFINITY;
  return Math.min(...enrolled.map((e) => descriptorDistance(sample, e)));
}

/**
 * Select the largest coherent cluster around the capture-set medoid.
 * A single poor frame is discarded; a capture is rejected when fewer than
 * 75% of frames agree with the representative descriptor.
 */
export function selectConsistentFaceSamples(samples: number[][], maxDistance = 0.6): number[][] {
  if (samples.length < 2 || samples.some((sample) => sample.length !== 128 || sample.some((v) => !Number.isFinite(v)))) return [];

  let medoidIndex = -1;
  let bestMeanDistance = Number.POSITIVE_INFINITY;
  samples.forEach((sample, index) => {
    let total = 0;
    samples.forEach((other, otherIndex) => {
      if (index !== otherIndex) total += descriptorDistance(sample, other);
    });
    const mean = total / Math.max(1, samples.length - 1);
    if (mean < bestMeanDistance) {
      bestMeanDistance = mean;
      medoidIndex = index;
    }
  });

  const representative = samples[medoidIndex];
  const inliers = samples.filter((sample) => descriptorDistance(sample, representative) <= maxDistance);
  const minimumInliers = Math.ceil(samples.length * 0.75);
  return inliers.length >= minimumInliers ? inliers : [];
}

export function areFaceSamplesConsistent(samples: number[][], maxDistance = 0.6): boolean {
  return selectConsistentFaceSamples(samples, maxDistance).length > 0;
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
