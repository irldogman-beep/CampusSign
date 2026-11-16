import type { CapacitorConfig } from '@capacitor/cli';

// Build either focused app with CAMPUSSIGN_APP=student or CAMPUSSIGN_APP=staff.
// Both packages intentionally share the same Supabase backend and account system.
const appSpace = process.env.CAMPUSSIGN_APP === 'staff' ? 'staff' : 'student';
const config: CapacitorConfig = {
  appId: appSpace === 'staff' ? 'com.campussign.staff' : 'com.campussign.student',
  appName: appSpace === 'staff' ? 'CampusSign Staff' : 'CampusSign Student',
  webDir: 'dist',
  android: { allowMixedContent: false },
};

export default config;
