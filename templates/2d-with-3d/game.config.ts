import { defineConfig } from '@blacklight/core';

export default defineConfig({
  name: '2D with 3D',
  id: 'com.example.twodwiththreed',
  version: '0.1.0',
  entry: 'title',
  resolution: { width: 1280, height: 720, mode: 'extend' },
  // Used only by `blacklight build --target steam`. 480 is Spacewar, Valve's test app: put your
  // own App ID here before uploading.
  steam: { appId: 480 },
});
