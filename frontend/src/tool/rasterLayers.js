import TileLayer from 'ol/layer/Tile.js';
import TileWMS from 'ol/source/TileWMS.js';
import { GEOSERVER_CONFIG } from '../config/layers.js';
import { loadWmsImage } from './toolUtils.js';

export const RASTER_PRESENTATION_TYPES = [
  { id: 'satellite', title: 'Ảnh vệ tinh' },
  { id: 'aerial', title: 'Ảnh hàng không' },
  { id: 'dem', title: 'Dữ liệu DEM' },
  { id: 'thematic', title: 'Raster chuyên đề' }
];

export function createPublishedRasterLayer(raster) {
  const layer = new TileLayer({
    visible: false,
    source: new TileWMS({
      tileLoadFunction: loadWmsImage,
      url: GEOSERVER_CONFIG.wmsUrl,
      params: { LAYERS: raster.name, TILED: true, FORMAT: 'image/png', TRANSPARENT: true },
      serverType: 'geoserver', crossOrigin: 'anonymous'
    })
  });
  layer.setProperties({ title: raster.title, configId: `raster_${raster.name}`, layerKind: 'raster', rasterName: raster.name, rasterMetadata: raster });
  return layer;
}
