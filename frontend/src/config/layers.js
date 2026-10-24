// =========================================================
// 1. GEOSERVER VÀ BACKEND
// =========================================================
export const GEOSERVER_CONFIG = {
  workspace: 'webgis',
  wmsUrl: 'http://localhost:8080/geoserver/webgis/wms',
  wfsUrl: 'http://localhost:8080/geoserver/webgis/ows',
  backendUrl: 'http://localhost:8000/mygis/features'
};
// Các field thường dùng để tìm ID của đối tượng.
export const DEFAULT_ID_FIELDS = ['gid', 'id','fid'];

// =========================================================
// 2. NHÓM LAYER SWITCHER
// =========================================================
// Thứ tự khai báo là thứ tự hiển thị từ TRÊN xuống DƯỚI.
export const LAYER_GROUP_CONFIGS = [
  { id: 'background', title: 'Dữ liệu nền', fold: 'close' },
  // 7 chủ đề dữ liệu địa lý, theo.
  { id: 'survey', title: 'Cơ sở đo đạc', fold: 'close' },
  { id: 'hydrology', title: 'Thủy văn', fold: 'close' },
  { id: 'population', title: 'Dân cư', fold: 'close' },
  { id: 'transport', title: 'Giao thông', fold: 'close' },
  { id: 'administrative', title: 'Địa giới hành chính', fold: 'close' },
  { id: 'terrain', title: 'Địa hình', fold: 'close' },
  { id: 'land_cover', title: 'Phủ bề mặt', fold: 'close' },
  { id: 'raster', title: 'Dữ liệu Raster', fold: 'close', kind: 'raster' },
  { id: 'base', title: 'Bản đồ nền địa lý', fold: 'close', kind: 'base' }
];

// =========================================================
// 3. BẢN ĐỒ NỀN
// =========================================================
export const BASE_LAYER_CONFIGS = [
  //#region: Nhóm bản đồ nền
  //Osm
  {
    id: 'osm',
    title: 'OpenStreetMap',
    group: 'base',
    type: 'base',
    sourceType: 'OSM',
    visible: false
  },
  //topo
  {
    id: 'topo',
    title: 'Địa hình',
    group: 'base',
    type: 'base',
    sourceType: 'OSM',
    visible: false,
    url: 'https://{a-c}.tile.opentopomap.org/{z}/{x}/{y}.png'
  },
  //Satellite
  {
    id: 'satellite',
    title: 'Vệ tinh',
    group: 'base',
    type: 'base',
    sourceType: 'XYZ',
    visible: true,
    hideWhenPrinting: true,
    sourceMaxZoom: 19,
    url: 'https://mt0.google.com/vt/lyrs=s&hl=en&x={x}&y={y}&z={z}'
  }
  //#endregion
];

// =========================================================
// 4. CÁC LỚP VECTOR
// =========================================================
// Thứ tự khai báo layer trong cùng một `group` là thứ tự hiển thị từ TRÊN xuống DƯỚI.
export const MAP_LAYER_CONFIGS = [
  //#region: Nhóm bản đồ nền
  //Nền biển
  {
    id: 'nenbien',
    title: 'Nền biển',
    group: 'background',
    geometryType: 'Polygon',
    visible: true,
    selectable: true,
    searchable: true,
    editable: true,
    attributeTable: true,
    hasPopup: true,
    searchIcon: '≈',
    searchFields: ['dosau', 'ten', 'name'],
    editFields: [
      { name: 'dosau', label: 'Độ sâu' }
    ],
    popupHeader: 'Thông tin nền biển',
    popupFields: [
      { label: 'Độ sâu', fields: ['dosau', 'ten', 'name'] },
      { label: 'GID', fields: ['gid', 'id'] }
    ],
    style: {
      type: 'polygon',
      fill: 'rgba(0, 255, 255, 0.5)',
      stroke: 'cyan',
      width: 2
    }
  },
  //Khung 25K
  {
    id: 'khung25k',
    title: 'Bảng chắp 25K',
    group: 'background',
    geometryType: 'Polygon',
    // Chỉ bật thủ công trong danh sách lớp, không tự hiện khi đổi dịch vụ bản đồ.
    visible: false,

    // Cho phép xem bảng thuộc tính và click tra cứu.
    selectable: true,
    searchable: false,
    editable: false,
    attributeTable: true,
    hasPopup: true,

    popupHeader: 'Thông tin mảnh 25K',
    popupFields: [
      { label: 'Tên mảnh', fields: ['Ten25K', 'ten25k', 'ten_manh', 'name'] },
      { label: 'ID', fields: ['gid', 'id'] }
    ],

    // Chỉ dùng nếu sau này hiển thị layer bằng WFS.
    // WMS đang hiển thị theo style bạn đặt trong GeoServer.
    style: {
      type: 'polygon',
      fill: 'rgba(255, 255, 0, 0.03)',
      stroke: '#ffff00',
      width: 2
    },
    // Đặt khung lên trên raster.
    zIndex: 100

  },
  //Nước ngoài
  {
    id: 'nuocngoai',
    title: 'Nước ngoài',
    group: 'background',
    geometryType: 'Polygon',
    visible: true,
    selectable: true,
    searchable: true,
    editable: true,
    attributeTable: true,
    hasPopup: true,
    searchIcon: '≈',
    searchFields: ['ten'],
    editFields: [
      { name: 'ten', label: 'Tên nước ngoài' }
    ],
    popupHeader: 'Thông tin nước ngoài',
    popupFields: [
      { label: 'Tên nước ngoài', fields: ['ten', 'id'] }
    ],
    style: {
      type: 'polygon',
      fill: 'rgba(119, 117, 117, 0.5)',
      stroke: 'red',
      width: 2
    }
  },
  //#endregion
  
  //#region: Nhóm hành chính
  //UB tỉnh
  {
    id: 'ub_tinh',
    title: 'UB Tỉnh',
    group: 'administrative',
    geometryType: 'Point',
    visible: true,
    selectable: true,
    searchable: true,
    editable: true,
    attributeTable: true,
    hasPopup: true,
    selectName: 'Ủy ban',
    searchTitle: 'UBND',
    searchIcon: '●',
    searchFields: ['ten', 'tinh', 'ten_tinh', 'TenTinhT', 'name', 'caphc'],
    editFields: [
      { name: 'ten', label: 'Tên UB' },
      { name: 'caphc', label: 'Cấp hành chính' },
      { name: 'tinh', label: 'Tỉnh' }
    ],
    popupHeader: 'Thông tin UB tỉnh',
    popupFields: [
      { label: 'Tên UB', fields: ['ten', 'name'] },
      { label: 'Tỉnh', fields: ['tinh', 'ten_tinh', 'TenTinhT'] },
      { label: 'Cấp HC', fields: ['caphc'] },
      { label: 'GID', fields: ['gid', 'id'] }
    ],
    style: {
      type: 'point',
      radius: 6,
      fill: 'red',
      stroke: 'white',
      width: 2
    }
  },
  //Ranh giới tỉnh
  {
    id: 'vn_tinh',
    title: 'Ranh giới tỉnh',
    group: 'administrative',
    geometryType: 'Polygon',
    visible: true,
    selectable: true,
    searchable: true,
    editable: true,
    attributeTable: true,
    hasPopup: true,
    selectName: 'Tỉnh',
    searchTitle: 'Tỉnh',
    searchIcon: '▣',
    searchFields: ['ten_tinh', 'TenTinhT', 'ten', 'name', 'ma_tinh', 'tru_so', 'loai'],
    editFields: [
      { name: 'ma_tinh', label: 'Mã tỉnh' },
      { name: 'ten_tinh', label: 'Tên tỉnh' },
      { name: 'sap_nhap', label: 'Sáp nhập' },
      { name: 'quy_mo', label: 'Quy mô' },
      { name: 'tru_so', label: 'Trụ sở' },
      { name: 'loai', label: 'Loại' }
    ],
    popupHeader: 'Thông tin tỉnh',
    popupFields: [
      { label: 'Mã tỉnh', fields: ['ma_tinh'] },
      { label: 'Tên tỉnh', fields: ['ten_tinh', 'TenTinhT', 'ten', 'name'] },
      { label: 'Trụ sở', fields: ['tru_so'] },
      { label: 'Loại', fields: ['loai'] },
      { label: 'GID', fields: ['gid', 'id'] }
    ],
    style: {
      type: 'polygon',
      fill: 'rgba(0, 0, 255, 0.5)',
      stroke: 'blue',
      width: 2
    }
  },
  //Ranh giới xã
  {
    id: 'vn_xa',
    title: 'Ranh giới xã',
    group: 'administrative',
    geometryType: 'Polygon',
    visible: true,
    selectable: true,
    searchable: true,
    editable: true,
    attributeTable: true,
    hasPopup: true,
    selectName: 'Xã',
    searchTitle: 'Xã / phường',
    searchIcon: '⌂',
    searchFields: ['ten_xa', 'TenXa', 'ten', 'name', 'ma_xa', 'ten_tinh', 'tru_so'],
    editFields: [
      { name: 'ma_xa', label: 'Mã xã' },
      { name: 'ten_xa', label: 'Tên xã' },
      { name: 'sap_nhap', label: 'Sáp nhập' },
      { name: 'tru_so', label: 'Trụ sở' },
      { name: 'loai', label: 'Loại' },
      { name: 'ma_tinh', label: 'Mã tỉnh' },
      { name: 'ten_tinh', label: 'Tên tỉnh' }
    ],
    popupHeader: 'Thông tin xã',
    popupFields: [
      { label: 'Mã xã', fields: ['ma_xa'] },
      { label: 'Tên xã', fields: ['ten_xa', 'TenXa', 'ten', 'name'] },
      { label: 'Tỉnh', fields: ['ten_tinh'] },
      { label: 'Trụ sở', fields: ['tru_so'] },
      { label: 'Loại', fields: ['loai'] },
      { label: 'GID', fields: ['gid', 'id'] }
    ],
    style: {
      type: 'polygon',
      fill: 'rgba(255, 0, 0, 0.5)',
      stroke: 'red',
      width: 2
    }
  },
  //#endregion

  //#region: Nhóm giao thông
  //Đường quốc lộ
  {
    id: 'qlo',
    title: 'Quốc lộ',
    group: 'transport',
    geometryType: 'LineString',
    visible: true,
    selectable: true,
    searchable: true,
    editable: true,
    attributeTable: true,
    hasPopup: true,
    searchIcon: '═',
    searchFields: ['td', 'tenduong', 'ten_duong', 'ten', 'name', 'bientap'],
    editFields: [
      { name: 'bientap', label: 'Biên tập' },
      { name: 'td', label: 'Tên / thuộc tính đường' }
    ],
    popupHeader: 'Thông tin quốc lộ',
    popupFields: [
      { label: 'Tên / thuộc tính đường', fields: ['td', 'tenduong', 'ten_duong', 'ten', 'name'] },
      { label: 'Biên tập', fields: ['bientap'] },
      { label: 'GID', fields: ['gid', 'id'] }
    ],
    style: {
      type: 'line',
      stroke: 'orange',
      width: 2
    }
  },
  //Đường tỉnh lộ
  {
    id: 'tinhlo',
    title: 'Tỉnh lộ',
    group: 'transport',
    geometryType: 'LineString',
    visible: true,
    selectable: true,
    searchable: true,
    editable: true,
    attributeTable: true,
    hasPopup: true,
    searchIcon: '━',
    searchFields: ['tenduong', 'ten_duong', 'ten', 'name', 'loaiduong', 'tdg'],
    editFields: [
      { name: 'tenduong', label: 'Tên đường' },
      { name: 'loaiduong', label: 'Loại đường' },
      { name: 'tdg', label: 'TDG' }
    ],
    popupHeader: 'Thông tin tỉnh lộ',
    popupFields: [
      { label: 'Tên đường', fields: ['tenduong', 'ten_duong', 'ten', 'name'] },
      { label: 'Loại đường', fields: ['loaiduong', 'loai_duong'] },
      { label: 'TDG', fields: ['tdg'] },
      { label: 'GID', fields: ['gid', 'id'] }
    ],
    style: {
      type: 'line',
      stroke: 'green',
      width: 2
    }
  },
  //#endregion
];

// =========================================================
// 5. CÁC LỚP RASTER
// =========================================================
export const RASTER_LAYER_CONFIGS = [
  //Ảnh vệ tinh 25K
  {
    id: 'vn25k',
    title: 'Dữ liệu nền VN25K',
    group: 'raster',
    layerName: 'fast_alpha',
    visible: false,
    format: 'image/png',
    transparent: true
  },
  //DEM việt nam 30m
  {
    id: 'dem_vietnam',
    title: 'DEM Việt Nam (SRTM 30 m)',
    group: 'raster',
    layerName: 'SRTM_30_VN_UTM',
    visible: false,
    format: 'image/png',
    transparent: true,
    minZoom: 1,
    maxZoom: 30,
  }
];
