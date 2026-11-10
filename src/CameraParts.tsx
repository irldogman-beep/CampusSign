import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import { Camera, RefreshCw, AlertTriangle } from 'lucide-react';
import { loadFaceApi, eyeOpenness, headTurn, bestDistance, areFaceSamplesConsistent, cropFace, FACE_MATCH_THRESHOLD } from './face';

function cameraErrorMessage(e: any): string {
  const name = e && typeof e === 'object' ? e.name : '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError')
    return 'Camera access was blocked. In your browser, open the site permissions (the icon beside the address), set Camera to Allow, then reload this page. Also check that camera access is enabled for your browser in your phone or computer privacy settings.';
  if (name === 'SecurityError')
    return 'The browser blocked camera access because this page is not in an approved secure context. Open the official HTTPS CampusSign link directly in Chrome, Safari or Edge.';
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError')
    return 'No camera was detected. Check that this device has a working camera, then try again.';
  if (name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError')
    return 'The camera rejected the preferred video settings. Try again; CampusSign will use the device’s default camera settings.';
  if (name === 'NotReadableError' || name === 'TrackStartError')
    return 'The camera could not start. It may be in use by another app, blocked by your operating system, or unavailable to the browser. Close other camera apps and try again.';
  if (name === 'AbortError')
    return 'The camera startup was interrupted. Close other camera apps and try again.';
  if (name === 'TypeError')
    return 'This browser does not expose camera access on this page. Open CampusSign directly in an up-to-date Chrome, Safari or Edge browser over HTTPS—not inside another app.';
  const detail = name ? ` (Browser error: ${name})` : '';
  return `CampusSign could not start the camera. Check browser and device camera permissions, close other apps using the camera, then try again.${detail}`;
}

/** Open a camera using preferred settings first, then retry with browser defaults.
 * Some mobile browsers and older webcams reject facingMode/resolution constraints.
 */
async function openCameraStream(preferredFacing: 'user' | 'environment' = 'user'): Promise<MediaStream> {
  if (!window.isSecureContext) {
    throw Object.assign(new Error('Camera access requires HTTPS.'), { name: 'SecurityError' });
  }
  if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
    throw Object.assign(new Error('MediaDevices API is unavailable.'), { name: 'TypeError' });
  }

  try {
    return await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: preferredFacing },
        width: { ideal: 640 },
        height: { ideal: 480 },
      },
      audio: false,
    });
  } catch (preferredError: any) {
    // Do not retry permission/security failures: the browser needs the user to fix them.
    const name = preferredError?.name;
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') {
      throw preferredError;
    }
    // Generic video:true lets the browser choose a supported camera and resolution.
    try {
      return await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    } catch (fallbackError: any) {
      // Keep the most actionable original failure if the fallback is less specific.
      throw fallbackError?.name === 'NotFoundError' && name ? preferredError : fallbackError;
    }
  }
}

/* ==========================================================================
   REAL QR CODE (display)
   ========================================================================== */
export function QRCodeImage({ value, size = 256 }: { value: string; size?: number }) {
  const [src, setSrc] = useState('');

  useEffect(() => {
    let cancelled = false;
    if (!value) {
      setSrc('');
      return;
    }
    QRCode.toDataURL(value, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: size * 2,
      color: { dark: '#022c22', light: '#ffffff' },
    })
      .then((url: string) => {
        if (!cancelled) setSrc(url);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [value, size]);

  if (!src) {
    return (
      <div
        className="flex items-center justify-center bg-slate-100 rounded-lg text-slate-400 text-xs"
        style={{ width: size, height: size, maxWidth: '100%' }}
      >
        Generating QR…
      </div>
    );
  }
  return (
    <img
      src={src}
      width={size}
      height={size}
      alt="Check-in QR code"
      className="block rounded-lg"
      style={{ maxWidth: '100%', height: 'auto', imageRendering: 'pixelated' }}
    />
  );
}

/* ==========================================================================
   REAL QR SCANNER (camera + jsQR)
   ========================================================================== */
export function QRScanner({ onCode }: { onCode: (data: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onCodeRef = useRef(onCode);
  onCodeRef.current = onCode;
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;
    let raf = 0;
    let last = '';
    let lastAt = 0;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true } as any) as CanvasRenderingContext2D | null;

    (async () => {
      try {
        stream = await openCameraStream('environment');
      } catch (e) {
        if (!cancelled) setError(cameraErrorMessage(e));
        return;
      }
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const video = videoRef.current;
      if (!video) { stream.getTracks().forEach((t) => t.stop()); return; }
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      video.setAttribute('playsinline', 'true');
      try {
        await video.play();
      } catch (e: any) {
        stream.getTracks().forEach((t) => t.stop());
        stream = null;
        if (!cancelled) setError(cameraErrorMessage(e));
        return;
      }
      setReady(true);

      const scan = () => {
        if (cancelled) return;
        if (ctx && video.readyState === video.HAVE_ENOUGH_DATA && video.videoWidth) {
          const scale = Math.min(1, 800 / video.videoWidth);
          canvas.width = Math.round(video.videoWidth * scale);
          canvas.height = Math.round(video.videoHeight * scale);
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
          if (code && code.data) {
            const now = Date.now();
            if (code.data !== last || now - lastAt > 2500) {
              last = code.data;
              lastAt = now;
              onCodeRef.current(code.data);
            }
          }
        }
        raf = requestAnimationFrame(scan);
      };
      scan();
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div className="space-y-2">
      <div className="relative w-full h-64 bg-slate-900 rounded-xl border-2 border-dashed border-amber-400 overflow-hidden">
        <video ref={videoRef} playsInline muted autoPlay className="absolute inset-0 w-full h-full object-cover" />
        {!ready && !error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-amber-300 text-xs font-bold gap-2">
            <RefreshCw className="w-6 h-6 animate-spin" />
            Starting camera…
          </div>
        )}
        {ready && (
          <>
            <div className="absolute inset-10 border-2 border-emerald-400/80 rounded-xl pointer-events-none" />
            <div className="absolute inset-x-10 h-0.5 bg-emerald-400 animate-bounce top-12 pointer-events-none" />
          </>
        )}
      </div>
      {error ? (
        <div className="p-3 rounded-xl bg-rose-950/70 border border-rose-800 text-rose-200 text-xs flex gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : (
        <p className="text-xs text-amber-300 font-bold text-center">Point the camera at the lecturer's QR code</p>
      )}
    </div>
  );
}

/* ==========================================================================
   REAL FACE CAPTURE: liveness (blink + head turn) + matching / enrollment
   ========================================================================== */
interface FaceCaptureProps {
  mode: 'verify' | 'enroll';
  enrolled?: number[][] | null;
  onVerified?: (r: { photo: string; distance: number }) => void;
  onMismatch?: (r: { photo: string; distance: number }) => void;
  onEnrolled?: (r: { photo: string; descriptors: number[][] }) => void;
  /** Verify mode, server-side matching: hand back the raw capture instead of comparing here. */
  onCaptured?: (r: { photo: string; descriptor: number[]; descriptors: number[][] }) => void;
}

const TIMEOUT_MS = 40_000;
const ENROLL_SAMPLES = 5;

export function FaceCapture(props: FaceCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const propsRef = useRef(props);
  propsRef.current = props;

  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<'loading' | 'running' | 'error'>('loading');
  const [cameraReady, setCameraReady] = useState(false);
  const [prompt, setPrompt] = useState('Opening camera…');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let modelTimeout: ReturnType<typeof setTimeout> | undefined;
    const startedAt = Date.now();

    setStatus('loading');
    setCameraReady(false);
    setError('');
    setProgress(0);
    setPrompt('Opening camera…');

    const stopStream = () => {
      if (stream) stream.getTracks().forEach((t) => t.stop());
      stream = null;
    };
    const fail = (msg: string) => {
      stopStream();
      if (!cancelled) {
        setCameraReady(false);
        setError(msg);
        setStatus('error');
      }
    };
    const say = (text: string, pct?: number) => {
      setPrompt(text);
      if (pct !== undefined) setProgress(pct);
    };

    (async () => {
      // Start camera permission/preview and model downloads together. Previously
      // model downloads completed first, leaving students staring at a spinner
      // even after granting camera permission on slower/mobile networks.
      const modelsResult = loadFaceApi().then(
        (value) => ({ value, error: null as any }),
        (error) => ({ value: null as any, error })
      );

      try {
        stream = await openCameraStream('user');
      } catch (e) {
        return fail(cameraErrorMessage(e));
      }
      if (cancelled) {
        stopStream();
        return;
      }

      const video = videoRef.current;
      if (!video) return fail('The camera preview could not be attached. Refresh the page and try again.');
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      video.setAttribute('playsinline', 'true');
      try {
        await video.play();
      } catch (e: any) {
        const detail = e?.name === 'NotAllowedError'
          ? 'The browser prevented video playback. Make sure CampusSign is open in a normal browser tab and try again.'
          : 'The camera opened but its preview could not start. Close other camera apps and try again.';
        return fail(detail);
      }
      if (cancelled) {
        stopStream();
        return;
      }
      setCameraReady(true);
      say('Camera ready. Loading face recognition…', 5);

      const modelTimeoutResult = new Promise<{ value: null; error: Error }>((resolve) => {
        modelTimeout = setTimeout(() => resolve({ value: null, error: new Error('Face model download timed out') }), 45_000);
      });
      const models = await Promise.race([modelsResult, modelTimeoutResult]);
      if (modelTimeout) clearTimeout(modelTimeout);
      if (cancelled) return;
      if (models.error) {
        return fail('The camera is working, but face recognition could not finish loading. Check your internet connection, try another network, and press Try Again.');
      }
      const faceapi: any = models.value;
      setStatus('running');

      const opts = new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 });
      const verify = propsRef.current.mode === 'verify';
      let phase: 'align' | 'blink' | 'turn' | 'return' | 'capturing' = 'align';
      let stable = 0;
      let baseline = 0;
      let closedSeen = false;

      say(verify ? 'Look straight at the camera' : 'Look straight at the camera and hold still');

      const next = () => {
        if (!cancelled) timer = setTimeout(tick, 60);
      };

      const grab = async () => {
        // Enrolment and verification must not silently switch between people in
        // the same frame. detectSingleFace can pick whichever face is largest;
        // detectAllFaces lets us refuse ambiguous multi-person captures instead.
        const faces = await faceapi.detectAllFaces(video, opts).withFaceLandmarks().withFaceDescriptors();
        if (faces.length > 1) throw new Error('multiple_faces');
        const full = faces[0];
        if (!full) return null;
        return {
          descriptor: Array.from(full.descriptor) as number[],
          photo: cropFace(video, full.detection.box),
          turn: headTurn(full.landmarks.positions),
        };
      };

      const doCapture = async () => {
        try {
          if (verify) {
            const shots: NonNullable<Awaited<ReturnType<typeof grab>>>[] = [];
            for (let i = 0; i < 10 && shots.length < 3 && !cancelled; i++) {
              const g = await grab();
              if (g && Math.abs(g.turn) < 0.12) {
                shots.push(g);
                await new Promise((r) => setTimeout(r, 250));
              }
            }
            if (cancelled) return;
            if (!shots.length) return fail('Could not read your face clearly. Look straight at the camera in good light and try again.');
            const shot = shots[0];
            if (propsRef.current.onCaptured) {
              say('Done', 100);
              stopStream();
              propsRef.current.onCaptured({
                photo: shot.photo,
                descriptor: shot.descriptor,
                descriptors: shots.map((x) => x.descriptor),
              });
              return;
            }
            const enrolled = propsRef.current.enrolled || [];
            const distance = bestDistance(shot.descriptor, enrolled);
            say('Done', 100);
            stopStream();
            if (distance <= FACE_MATCH_THRESHOLD) propsRef.current.onVerified?.({ photo: shot.photo, distance });
            else propsRef.current.onMismatch?.({ photo: shot.photo, distance });
          } else {
            const samples: number[][] = [];
            let photo = '';
            while (samples.length < ENROLL_SAMPLES && !cancelled) {
              if (Date.now() - startedAt > TIMEOUT_MS) return fail('This is taking too long. Try again with better lighting.');
              const shot = await grab();
              if (shot && Math.abs(shot.turn) < 0.12) {
                samples.push(shot.descriptor);
                if (!photo) photo = shot.photo;
                say(`Captured ${samples.length} of ${ENROLL_SAMPLES}. Hold still…`, 40 + (samples.length / ENROLL_SAMPLES) * 60);
                await new Promise((r) => setTimeout(r, 500));
              } else {
                say('Look straight at the camera');
                await new Promise((r) => setTimeout(r, 150));
              }
            }
            if (cancelled) return;
            // Reject mixed/unstable captures before they can contaminate a
            // student's template. Every sample must have at least one close
            // neighbour among the other samples from this same capture.
            if (!areFaceSamplesConsistent(samples, 0.6)) {
              return fail('These face samples were inconsistent. Make sure only you are visible, face the camera, improve the lighting, and try enrolment again.');
            }
            say('Done', 100);
            stopStream();
            propsRef.current.onEnrolled?.({ photo, descriptors: samples });
          }
        } catch (captureError: any) {
          if (captureError?.message === 'multiple_faces') {
            fail('More than one person is visible. Please make sure only the student being enrolled is in the camera frame, then try again.');
          } else {
            fail('Face processing failed. Please try again.');
          }
        }
      };

      const tick = async () => {
        if (cancelled) return;
        if (Date.now() - startedAt > TIMEOUT_MS) {
          return fail('This is taking too long. Try again with better lighting and your face fully in view.');
        }

        let det: any;
        try {
          det = await faceapi.detectSingleFace(video, opts).withFaceLandmarks();
        } catch {
          return fail('Face detection failed. Please try again.');
        }
        if (cancelled) return;

        if (!det) {
          stable = 0;
          if (phase === 'blink') {
            // With eyes shut the detector can lose the face for a moment: count that as the blink
            closedSeen = true;
            say('Blink slowly: close your eyes for a second, then open them');
          } else {
            say('No face found. Look at the camera.');
          }
          return next();
        }

        const pts = det.landmarks.positions;
        const big = det.detection.box.width / (video.videoWidth || 640) > 0.28;
        const turn = headTurn(pts);
        const open = eyeOpenness(pts);

        if (phase === 'align') {
          if (!big) {
            stable = 0;
            say('Move a little closer');
          } else if (Math.abs(turn) > 0.1) {
            stable = 0;
            say('Look straight at the camera');
          } else {
            stable++;
            baseline = (baseline * (stable - 1) + open) / stable;
            say('Hold still…', 10);
            if (stable >= 4) {
              stable = 0;
              if (verify) {
                phase = 'blink';
                say('Blink slowly: close your eyes for a second, then open them', 30);
              } else {
                phase = 'capturing';
                say('Capturing…', 40);
                await doCapture();
                return;
              }
            }
          }
          return next();
        }

        if (phase === 'blink') {
          if (!closedSeen && open > baseline * 0.85) baseline = 0.9 * baseline + 0.1 * open;
          if (!closedSeen && open < baseline * 0.8) closedSeen = true;
          else if (closedSeen && open > baseline * 0.85) {
            phase = 'turn';
            say('Good. Now slowly turn your head to one side', 55);
          }
          return next();
        }

        if (phase === 'turn') {
          if (Math.abs(turn) > 0.14) {
            phase = 'return';
            stable = 0;
            say('Now look straight at the camera again', 80);
          }
          return next();
        }

        if (phase === 'return') {
          if (big && Math.abs(turn) < 0.1) stable++;
          else stable = 0;
          if (stable >= 3) {
            phase = 'capturing';
            say('Hold still…', 92);
            await doCapture();
            return;
          }
          return next();
        }
      };

      tick();
    })();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      if (modelTimeout) clearTimeout(modelTimeout);
      stopStream();
    };
  }, [attempt]);

  return (
    <div className="space-y-4 text-center">
      <div className="relative w-64 h-64 mx-auto rounded-full border-4 border-amber-500 bg-slate-950 overflow-hidden shadow-2xl">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className="absolute inset-0 w-full h-full object-cover"
          style={{ transform: 'scaleX(-1)' }}
        />
        {!cameraReady && (
          <div className="absolute inset-0 bg-slate-950/90 flex flex-col items-center justify-center gap-2 text-amber-300">
            {status === 'loading' ? <RefreshCw className="w-8 h-8 animate-spin" /> : <Camera className="w-8 h-8" />}
            <span className="text-[11px] font-bold px-6">{status === 'error' ? 'Camera stopped' : 'Opening camera…'}</span>
          </div>
        )}
        <div
          className="absolute inset-2 rounded-full border-2 border-emerald-400 pointer-events-none"
          style={{ opacity: progress / 100 }}
        />
      </div>

      <div className="w-full max-w-xs mx-auto bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
        <div
          className="bg-gradient-to-r from-emerald-800 to-amber-500 h-full transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      {error ? (
        <div className="space-y-3">
          <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs flex items-start gap-2 text-left">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => setAttempt((a) => a + 1)}
            className="px-5 py-2.5 bg-emerald-900 hover:bg-emerald-800 text-amber-400 font-extrabold rounded-xl text-xs border border-emerald-700"
          >
            Try Again
          </button>
        </div>
      ) : (
        <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold">
          {prompt}
        </div>
      )}
    </div>
  );
}
