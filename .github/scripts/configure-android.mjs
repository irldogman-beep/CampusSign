import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const manifestPath = resolve('android/app/src/main/AndroidManifest.xml');
let manifest = await readFile(manifestPath, 'utf8');

if (!manifest.includes('<manifest')) {
  throw new Error('Generated Android manifest is missing or invalid.');
}

const requiredPermissions = [
  'android.permission.CAMERA',
  'android.permission.ACCESS_COARSE_LOCATION',
  'android.permission.ACCESS_FINE_LOCATION',
];

for (const permission of requiredPermissions) {
  const escaped = permission.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const exists = new RegExp('<uses-permission[^>]*android:name=["\\']' + escaped + '["\\']').test(manifest);
  if (!exists) {
    const tag = '    <uses-permission android:name="' + permission + '" />\\n';
    if (!manifest.includes('<application')) throw new Error('Android manifest has no application element.');
    manifest = manifest.replace(/(\\s*<application\\b)/, '\\n' + tag + '$1');
  }
}

if (!manifest.includes('android.hardware.camera.any')) {
  manifest = manifest.replace(
    /(\\s*<application\\b)/,
    '\\n    <uses-feature android:name="android.hardware.camera.any" android:required="false" />$1'
  );
}

await writeFile(manifestPath, manifest, 'utf8');
console.log('Android CAMERA and location permissions are declared.');
