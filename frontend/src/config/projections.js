import proj4 from 'proj4';
import { register } from 'ol/proj/proj4.js';

// Hệ chiếu gốc của bộ DEM tỉnh, dùng cho phạm vi và truy vấn cao độ.
proj4.defs('EPSG:32648', '+proj=utm +zone=48 +datum=WGS84 +units=m +no_defs');
proj4.defs('EPSG:32649', '+proj=utm +zone=49 +datum=WGS84 +units=m +no_defs');
register(proj4);
