import { GEOSERVER_CONFIG } from './layers.js';

let localStyles = new Map();

// Vite chuyển CSS trong styleLayer thành SLD trong bộ nhớ trước khi tạo lớp.
export function configureLocalStyles(files) {
  localStyles = new Map(Object.entries(files).map(([path, content]) => [
    path.split('/').at(-1).replace(/\.css$/, ''),
    content.replace(/>\s+</g, '><').trim(),
  ]));
}

export function getLocalStyleParams(layerName, { raster = false } = {}) {
  const shortName = layerName.split(':').at(-1);
  const template = localStyles.get(shortName) || (raster && localStyles.get('_raster'));
  if (!template) throw new Error(`Thiếu file styleLayer/${shortName}.css cho lớp bản đồ.`);
  const qualifiedName = layerName.includes(':') ? layerName : `${GEOSERVER_CONFIG.workspace}:${shortName}`;
  const endpoint = new URL(GEOSERVER_CONFIG.wmsUrl).pathname.replace(/\/+$/, '');
  const sldName = !raster && endpoint.endsWith(`/${GEOSERVER_CONFIG.workspace}/wms`) ? shortName : qualifiedName;
  const escapeXml = value => value.replace(/[<>&"']/g, character => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[character]);
  const assetBaseUrl = `${globalThis.location?.origin || 'http://localhost:5173'}/style-assets`;
  return {
    SLD_BODY: template.replaceAll('{{layerName}}', escapeXml(sldName)).replaceAll('{{assetBaseUrl}}', escapeXml(assetBaseUrl)),
    STYLES: '',
    TILED: false,
  };
}
