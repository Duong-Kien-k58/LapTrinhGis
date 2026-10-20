# WebGIS

## Chức năng đối chiếu PTN

Đã nối trình bày vector/raster bằng SLD (gồm chuyên đề), overview theo lớp,
tra cứu pixel raster, tìm vị trí WGS84/VN2000, tìm công cụ và bảng hỗ trợ trạng thái
dịch vụ. Mục lục lưu thứ tự, nhóm, visibility; các panel hỗ trợ kéo và nhớ vị trí.
Tìm thuộc tính bao gồm mọi trường của các lớp vector, giữ luồng CRUD và công cụ
3D/PDF hiện có. Không tích hợp đăng nhập, đăng ký hoặc các chức năng tài khoản.

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
- Node.js 22.12 trở lên (có thể dùng Node.js 24; Cesium yêu cầu Node.js 22+)
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

### 3. Cấu hình môi trường và chạy backend Django

Tại thư mục gốc dự án, tạo file cấu hình (chỉ làm lần đầu):

```powershell
Copy-Item .env.example .env
notepad .env
```

Điền `DJANGO_SECRET_KEY` bằng chuỗi bí mật riêng; điền `POSTGRES_*` theo database
đã chuẩn bị. Để thêm/sửa/xóa raster, điền thêm `GEOSERVER_ADMIN_USER` và
`GEOSERVER_ADMIN_PASSWORD` bằng tài khoản GeoServer. Lưu file trước khi chạy Django.

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

Trước khi chạy trên máy mới, sao chép `.env.example` thành `.env` ở thư mục gốc
LapTrinhGis, điền `DJANGO_SECRET_KEY` và các biến `POSTGRES_*` cho đúng máy của bạn.

### 4. Chạy frontend

Mở **một cửa sổ PowerShell khác** tại thư mục dự án:

```powershell
cd frontend
npm ci
npm run dev
```

Vite sẽ in địa chỉ để mở ứng dụng, thông thường là
`http://localhost:5173`.

## Cấu hình địa chỉ dịch vụ

Các địa chỉ GeoServer và Django được khai báo trong:

```text
frontend/src/config/layers.js
```

Mặc định dự án dùng:

- GeoServer WMS: `http://localhost:8080/geoserver/webgis/wms`
- GeoServer WFS: `http://localhost:8080/geoserver/webgis/ows`
- API Django: `http://localhost:8000/mygis/features`

Nếu cổng, tên workspace hoặc máy chủ khác, sửa các giá trị tương ứng trong
`GEOSERVER_CONFIG` rồi khởi động lại `npm run dev`.

## File cấu hình .env dùng chung

Django và Vite cùng đọc file `.env` ở thư mục gốc LapTrinhGis, giống cách PTN
tổ chức. File chứa cấu hình Django, tài khoản PostgreSQL, tài khoản REST GeoServer,
CORS/CSRF và token Cesium. Trên máy mới, sao chép `.env.example` thành `.env`
rồi điền thông tin. Git bỏ qua `.env`; file mẫu không chứa mật khẩu hay token thật.
Thay token Cesium bằng biến:

```env
VITE_CESIUM_ION_TOKEN=your_cesium_ion_token
```

Sau khi sửa `.env`, khởi động lại Django và Vite. Biến môi trường đã đặt trong
terminal được ưu tiên hơn giá trị trong file cho cấu hình Django. Riêng các biến
`GEOSERVER_*` dùng cho quản trị raster được đọc lại từ `.env` mỗi lần gọi REST,
ưu tiên giá trị trong file để áp dụng ngay khi sửa tài khoản. Chỉ các biến có tiền tố `VITE_`
được đưa vào frontend; tài khoản PostgreSQL và GeoServer chỉ dùng ở backend.

## Kiểm tra khi gặp lỗi

- Bản đồ không có dữ liệu: kiểm tra GeoServer đang chạy, workspace là `webgis`,
  layer đã được publish và URL WMS/WFS trong `layers.js` đúng.
- Không thêm/sửa/xóa được đối tượng: kiểm tra Django đang chạy và PostgreSQL có
  đúng các bảng cùng cột dữ liệu cần thiết.
- `npm ci` lỗi: kiểm tra phiên bản Node.js; dùng 22.12 trở lên.
- `pip install` lỗi: kiểm tra Python đã được thêm vào PATH và môi trường ảo đã
  được kích hoạt.

## Lưu ý bảo mật

Không đưa mật khẩu database, token Cesium hay khóa bí mật Django lên GitHub.
Repository hiện là public; trước khi chia sẻ rộng rãi, hãy kiểm tra lịch sử Git
và thay mới mọi thông tin nhạy cảm từng bị commit.

## Biên tập dữ liệu (thêm, sửa, xóa)

Luồng biên tập tham khảo từ PTN, sử dụng lớp WMS đang bật và lưu qua API Django:

- Mở menu thêm/sửa/xóa, chọn một lớp đang hiển thị và bấm **Bắt đầu vẽ** hoặc **Bắt đầu chọn**.
- Thêm: vẽ đối tượng; đường/vùng kết thúc bằng nhấp đúp. WFS tải ngầm tối đa 5.000 đối tượng của lớp để bắt dính điểm/cạnh. Nhập thuộc tính rồi lưu.
- Sửa: nhấp bản đồ và chọn đối tượng trong danh sách kết quả, sau đó chọn **Sửa thuộc tính** hoặc **Sửa hình học / Di chuyển điểm**. Kéo nút cyan để sửa; đường/vùng có thể **Vẽ hình thay thế**.
- Xóa: chọn đối tượng, kiểm tra hình được tô sáng rồi xác nhận xóa.
- Có thể bắt đầu các thao tác từ nút Thêm/Sửa/Xóa trong bảng thuộc tính. Lớp chỉ đọc không cho phép biên tập.
- **Hủy**, **Esc** hoặc đóng bảng biên tập sẽ bỏ bản nháp. Tắt lớp/nhóm đang sửa cũng bỏ bản nháp. Nếu lưu lỗi, bản nháp được giữ để thử lại.

Chỉ thay đổi thuộc tính sẽ không gửi lại hình học từ GetFeatureInfo. Khi vẽ/sửa hình học, frontend chuyển về EPSG:4326; backend chuyển kiểu đơn sang MultiLineString/MultiPolygon theo cấu hình hiện có. Sau khi lưu, WMS, WFS, tìm kiếm và bảng thuộc tính được làm mới.

## Quản trị raster theo PTN

Mục **Xem dữ liệu** dùng một bảng nổi chung có hai tab **Vector / Raster**, theo ý tưởng PTN. Vector có chọn lớp, tải bảng thuộc tính, lọc nhanh và các nút Xem/Sửa/Xóa trên từng dòng. Raster có chọn lớp, bảng metadata, nút zoom và giá trị pixel khi bấm bản đồ. Thông tin raster đọc từ PostgreSQL và lớp WMS trên bản đồ; đổi tab hoặc đóng bảng sẽ bỏ qua phản hồi pixel đã cũ. Bảng có thể kéo bằng tiêu đề và đổi kích thước ở góc dưới.

Trong **Quản trị dữ liệu không gian**, ba mục vector được đặt trước ba mục **Thêm/Sửa/Xóa dữ liệu raster**, theo thứ tự của PTN. Bảng raster dùng cùng luồng trình bày:

- **Thêm**: nhập tên raster, tên hiển thị, chọn loại trình bày (ảnh vệ tinh, ảnh hàng không, DEM, chuyên đề), chọn GeoTIFF, xem CRS/phạm vi/kích thước và ảnh preview rồi bấm **Thêm Raster**.
- **Sửa**: chọn raster đã xuất bản, chọn GeoTIFF thay thế rồi **Cập nhật Raster**. **Cập nhật thông tin** đồng bộ thông tin từ GeoServer và lưu tên/loại trình bày; **Lưu thông tin tệp** chỉ lưu metadata của tệp đã chọn, không thay raster đã xuất bản.
- **Xóa**: chọn raster, xem thông tin rồi **Xác nhận xóa**. Lớp được gỡ khỏi GeoServer và bản đồ; trạng thái xóa được lưu để lớp cấu hình sẵn không xuất hiện lại khi tải trang.

GeoTIFF dưới 512 MB được upload qua Django đến workspace `webgis` của GeoServer. Preview là ảnh tạm trong bảng, chưa ghi dữ liệu. GeoTIFF từ 512 MB phải publish thủ công; ở chế độ sửa vẫn có thể đọc và lưu metadata của tệp lớn. Metadata lưu trong PostgreSQL, tệp raster do GeoServer quản lý.

Chạy migration trên máy mới:

```powershell
cd backend
.\venv\Scripts\python.exe manage.py migrate mygis
```

Điền tài khoản REST GeoServer trong `.env` ở thư mục gốc (đây là tài khoản đăng nhập GeoServer, không phải PostgreSQL):

```env
GEOSERVER_ADMIN_USER='your_geoserver_user'
GEOSERVER_ADMIN_PASSWORD='your_geoserver_password'
GEOSERVER_REST_URL='http://localhost:8080/geoserver/rest'
GEOSERVER_WORKSPACE='webgis'
```

Khởi động lại Django sau khi điền thông tin. Các API raster dùng CSRF; frontend tự lấy token và gửi cookie. Nếu đổi cổng frontend, cập nhật `CSRF_TRUSTED_ORIGINS` trong `.env`.

## Cập nhật máy đã cài dự án

Dừng Django và Vite bằng `Ctrl+C`. Nếu có thay đổi code riêng, commit hoặc sao lưu
trước khi pull. Chạy tại thư mục gốc dự án:

```powershell
git pull --ff-only origin main
.\backend\venv\Scripts\python.exe -m pip install -r backend/requirements.txt
.\backend\venv\Scripts\python.exe backend/manage.py migrate
cd frontend
npm ci
npm run dev
```

Giữ nguyên `.env` đang sử dụng, đối chiếu `.env.example` để bổ sung biến còn thiếu.
Mở terminal thứ hai tại thư mục gốc và chạy backend:

```powershell
.\backend\venv\Scripts\python.exe backend/manage.py runserver
```

## Sử dụng nhanh

1. Bật PostgreSQL và GeoServer, chạy Django và Vite, mở địa chỉ Vite in trong terminal.
2. Trong mục lục lớp, bật/tắt lớp và nhóm; kéo để sắp xếp thứ tự hiển thị.
3. Mở menu **Xem dữ liệu**, chọn tab **Vector** hoặc **Raster** và lớp cần xem.
   Vector hỗ trợ lọc thuộc tính; raster hiển thị metadata và giá trị pixel khi bấm bản đồ.
4. Dùng **Tìm vị trí WGS84 / VN2000** để đến tọa độ; với WGS84 có thể thử
   `21.0278, 105.8342` (vĩ độ, kinh độ). Chọn đúng chế độ trước khi nhập.
5. Dùng các mục **Trình bày dữ liệu điểm/đường/vùng**, **Bản đồ chuyên đề vector**
   hoặc trình bày raster để chỉnh cách hiển thị. **Xem overview** đưa bản đồ đến phạm vi lớp.
6. Muốn biên tập, dùng **Thêm/Sửa/Xóa dữ liệu vector** hoặc các mục quản trị raster
   theo hướng dẫn phía trên. Dùng **Esc** để hủy thao tác biên tập đang thực hiện.
7. Dùng **Tìm công cụ** để tìm chức năng và **Hỗ trợ sử dụng** để xem trạng thái dịch vụ.

## Kiểm tra mã nguồn

Tại thư mục gốc:

```powershell
.\backend\venv\Scripts\python.exe backend/manage.py check
.\backend\venv\Scripts\python.exe backend/manage.py makemigrations --check --dry-run
cd frontend
npm run build
```

`npm run build` tạo thư mục `frontend/dist`. Để xem thử bản build, chạy
`npm run preview`; backend, GeoServer và PostGIS vẫn cần chạy riêng.
