import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import { Camera, RefreshCw, AlertTriangle } from 'lucide-react';
import { loadFaceApi, eyeOpenness, headTurn, bestDistance, cropFace, FACE_MATCH_THRESHOLD } from './face';

function cameraErrorMessage(e: any): string {
  const name = e && e.name;
  if (name === 'NotAllowedError' || name === 'SecurityError')
    return 'Camera permission was denied. Allow camera access in your browser settings, then try again.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No camera was found on this device.';
  if (name === 'NotReadableError') return 'The camera is being used by another app. Close it and try again.';
  return 'Could not open the camera. Make sure the site is opened over https and camera access is allowed.';
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
    const ctx = canvas.getContext('2d', { willReadFrequently: true } as any);

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
      } catch (e) {
        if (!cancelled) setError(cameraErrorMessage(e));
        return;
      }
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const video = videoRef.current!;
      video.srcObject = stream;
      video.setAttribute('playsinline', 'true');
      try {
        await video.play();
      } catch {
        if (!cancelled) setError('Could not start the camera preview.');
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
}

const TIMEOUT_MS = 40_000;
const ENROLL_SAMPLES = 3;

export function FaceCapture(props: FaceCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const propsRef = useRef(props);
  propsRef.current = props;

  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<'loading' | 'running' | 'error'>('loading');
  const [prompt, setPrompt] = useState('Loading face models…');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const startedAt = Date.now();

    setStatus('loading');
    setError('');
    setProgress(0);
    setPrompt('Loading face models…');

    const stopStream = () => {
      if (stream) stream.getTracks().forEach((t) => t.stop());
      stream = null;
    };
    const fail = (msg: string) => {
      stopStream();
      if (!cancelled) {
        setError(msg);
        setStatus('error');
      }
    };
    const say = (text: string, pct?: number) => {
      setPrompt(text);
      if (pct !== undefined) setProgress(pct);
    };

    (async () => {
      let faceapi: any;
      try {
        faceapi = await loadFaceApi();
      } catch {
        return fail('Could not load the face models. Check your internet connection and try again.');
      }
      if (cancelled) return;

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });
      } catch (e) {
        return fail(cameraErrorMessage(e));
      }
      if (cancelled) {
        stopStream();
        return;
      }

      const video = videoRef.current!;
      video.srcObject = stream;
      video.setAttribute('playsinline', 'true');
      try {
        await video.play();
      } catch {
        return fail('Could not start the camera preview.');
      }
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
        const full = await faceapi.detectSingleFace(video, opts).withFaceLandmarks().withFaceDescriptor();
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
            let shot: Awaited<ReturnType<typeof grab>> = null;
            for (let i = 0; i < 5 && !shot && !cancelled; i++) shot = await grab();
            if (cancelled) return;
            if (!shot) return fail('Could not read your face clearly. Try again with better lighting.');
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
                await new Promise((r) => setTimeout(r, 350));
              } else {
                say('Look straight at the camera');
                await new Promise((r) => setTimeout(r, 150));
              }
            }
            if (cancelled) return;
            say('Done', 100);
            stopStream();
            propsRef.current.onEnrolled?.({ photo, descriptors: samples });
          }
        } catch {
          fail('Face processing failed. Please try again.');
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
          say('No face found. Look at the camera.');
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
                say('Blink your eyes once', 30);
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
          if (!closedSeen && open < baseline * 0.72) closedSeen = true;
          else if (closedSeen && open > baseline * 0.88) {
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
        {status !== 'running' && (
          <div className="absolute inset-0 bg-slate-950/90 flex flex-col items-center justify-center gap-2 text-amber-300">
            {status === 'loading' ? <RefreshCw className="w-8 h-8 animate-spin" /> : <Camera className="w-8 h-8" />}
            <span className="text-[11px] font-bold px-6">{status === 'loading' ? 'Getting ready…' : 'Camera stopped'}</span>
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
