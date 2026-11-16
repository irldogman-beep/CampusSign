import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.campussign.app',
  appName: 'CampusSign',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
  },
};

export default config;
