import { defineConfig, loadEnv } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { fileURLToPath } from 'node:url';
import { layerStylesPlugin } from './build/layerStyles.js';

const cesiumSource = 'node_modules/cesium/Build/Cesium';
const cesiumBaseUrl = 'cesiumStatic';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, fileURLToPath(new URL('..', import.meta.url)), '');
  return {
  envDir: fileURLToPath(new URL('..', import.meta.url)),
  cacheDir: fileURLToPath(new URL('../temp/vite-cache', import.meta.url)),
  build: {
    outDir: fileURLToPath(new URL('../temp/frontend-dist', import.meta.url)),
    emptyOutDir: true,
  },
  plugins: [
    layerStylesPlugin({ libFolder: env.GEOSERVER_LIB_DIR, java: env.STYLE_JAVA }),
    viteStaticCopy({
      targets: [
        {
          src: '../styleLayer/assets/*',
          dest: 'style-assets',
          rename: { stripBase: true }
        },
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
  };
});
