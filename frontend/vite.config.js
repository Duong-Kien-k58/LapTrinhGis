import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { fileURLToPath } from 'node:url';

const cesiumSource = 'node_modules/cesium/Build/Cesium';
const cesiumBaseUrl = 'cesiumStatic';

export default defineConfig({
  envDir: fileURLToPath(new URL('..', import.meta.url)),
  plugins: [
    viteStaticCopy({
      targets: [
        {
          src: `${cesiumSource}/ThirdParty/**/*`,
          dest: cesiumBaseUrl,
          rename: { stripBase: 4 }
        },
        {
          src: `${cesiumSource}/Workers/**/*`,
          dest: cesiumBaseUrl,
          rename: { stripBase: 4 }
        },
        {
          src: `${cesiumSource}/Assets/**/*`,
          dest: cesiumBaseUrl,
          rename: { stripBase: 4 }
        },
        {
          src: `${cesiumSource}/Widgets/**/*`,
          dest: cesiumBaseUrl,
          rename: { stripBase: 4 }
        }
      ]
    })
  ],

  define: {
    CESIUM_BASE_URL: JSON.stringify('/cesiumStatic/')
  }
});
