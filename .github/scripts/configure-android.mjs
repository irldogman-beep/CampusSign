import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const manifestPath = resolve('android/app/src/main/AndroidManifest.xml');
let manifest = await readFile(manifestPath, 'utf8');
if (!manifest.includes('<manifest') || !manifest.includes('<application')) {
  throw new Error('Generated Android manifest is missing required elements.');
}

const permissions = [
  'android.permission.CAMERA',
  'android.permission.ACCESS_COARSE_LOCATION',
  'android.permission.ACCESS_FINE_LOCATION',
];
const additions = permissions
  .filter((permission) => !manifest.includes('android:name="' + permission + '"'))
  .map((permission) => '    <uses-permission android:name="' + permission + '" />')
  .join('\n');

if (additions) {
  const applicationIndex = manifest.indexOf('<application');
  manifest = manifest.slice(0, applicationIndex) + additions + '\n    ' + manifest.slice(applicationIndex);
}

if (!manifest.includes('android.hardware.camera.any')) {
  const applicationIndex = manifest.indexOf('<application');
  manifest = manifest.slice(0, applicationIndex) +
    '    <uses-feature android:name="android.hardware.camera.any" android:required="false" />\n    ' +
    manifest.slice(applicationIndex);
}

await writeFile(manifestPath, manifest, 'utf8');
console.log('Android camera and location permissions declared.');
