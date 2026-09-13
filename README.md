# WebGIS

Ứng dụng WebGIS gồm giao diện bản đồ, API Django và các dịch vụ bản đồ
GeoServer/PostGIS. Frontend hiển thị, tra cứu và biên tập các lớp dữ liệu địa
lý; backend cung cấp API CRUD cho các lớp được cho phép.

## Thành phần

- **Frontend:** Vite, OpenLayers, Cesium và các thư viện JavaScript khác.
- **Backend:** Python, Django, Django REST Framework.
- **Dữ liệu không gian:** PostgreSQL + PostGIS.
- **Dịch vụ bản đồ:** GeoServer (WMS/WFS).

## Yêu cầu trước khi cài

Cài các phần mềm sau trên máy mới:

- [Git](https://git-scm.com/downloads)
- Node.js 20 trở lên (khuyến nghị bản LTS)
- Python 3.12 trở lên
- PostgreSQL kèm tiện ích PostGIS
- GeoServer (mặc định chạy ở cổng `8080`)

> Dữ liệu GIS và cơ sở dữ liệu không được lưu trong repository. Muốn bản đồ
> hiển thị đầy đủ, hãy xin file dữ liệu hoặc bản sao lưu database từ người quản
> lý dự án.

## Cài đặt

### 1. Tải mã nguồn

```powershell
git clone https://github.com/Duong-Kien-k58/LapTrinhGis.git
cd LapTrinhGis
```

### 2. Chuẩn bị PostGIS và GeoServer

1. Tạo database PostgreSQL tên `webgis` và bật extension PostGIS:

   ```sql
   CREATE DATABASE webgis;
   \c webgis
   CREATE EXTENSION postgis;
   ```

2. Nhập bản sao lưu database/dữ liệu GIS được cung cấp vào database `webgis`.
   Các lớp có thể biên tập gồm: `ub_tinh`, `tinhlo`, `vn_tinh`, `vn_xa`, `qlo`,
   `nenbien` và `nuocngoai`.
3. Trong GeoServer, tạo workspace `webgis`, kết nối PostGIS datastore tới
   database trên, rồi publish các layer cần dùng. Các lớp raster được cấu hình
   trong dự án là `fast_alpha` và `SRTM_30_VN_UTM`.
4. Mở GeoServer tại `http://localhost:8080/geoserver` để kiểm tra dịch vụ đang
   chạy.

### 3. Chạy backend Django

Mở một cửa sổ PowerShell tại thư mục dự án:

```powershell
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

API sẽ chạy tại `http://localhost:8000`.

Trước khi chạy, cập nhật cấu hình kết nối PostgreSQL trong
`backend/backend/settings.py` cho đúng máy của bạn (`NAME`, `USER`, `PASSWORD`,
`HOST`, `PORT`).

### 4. Chạy frontend

Mở **một cửa sổ PowerShell khác** tại thư mục dự án:

```powershell
cd frontend/my-webgis
npm install
npm run dev
```

Vite sẽ in địa chỉ để mở ứng dụng, thông thường là
`http://localhost:5173`.

## Cấu hình địa chỉ dịch vụ

Các địa chỉ GeoServer và Django được khai báo trong:

```text
frontend/my-webgis/src/config/layers.js
```

Mặc định dự án dùng:

- GeoServer WMS: `http://localhost:8080/geoserver/webgis/wms`
- GeoServer WFS: `http://localhost:8080/geoserver/webgis/ows`
- API Django: `http://localhost:8000/mygis/features`

Nếu cổng, tên workspace hoặc máy chủ khác, sửa các giá trị tương ứng trong
`GEOSERVER_CONFIG` rồi khởi động lại `npm run dev`.

## Biến môi trường frontend

Cesium dùng token từ file `frontend/my-webgis/.env`. File này bị Git bỏ qua để
không công khai token. Trên máy mới, tạo file đó và thêm token Cesium của bạn:

```env
VITE_CESIUM_ION_TOKEN=your_cesium_ion_token
```

## Kiểm tra khi gặp lỗi

- Bản đồ không có dữ liệu: kiểm tra GeoServer đang chạy, workspace là `webgis`,
  layer đã được publish và URL WMS/WFS trong `layers.js` đúng.
- Không thêm/sửa/xóa được đối tượng: kiểm tra Django đang chạy và PostgreSQL có
  đúng các bảng cùng cột dữ liệu cần thiết.
- `npm install` lỗi: kiểm tra phiên bản Node.js; dùng Node.js LTS 20 trở lên.
- `pip install` lỗi: kiểm tra Python đã được thêm vào PATH và môi trường ảo đã
  được kích hoạt.

## Lưu ý bảo mật

Không đưa mật khẩu database, token Cesium hay khóa bí mật Django lên GitHub.
Repository hiện là public; trước khi chia sẻ rộng rãi, hãy kiểm tra lịch sử Git
và thay mới mọi thông tin nhạy cảm từng bị commit.
