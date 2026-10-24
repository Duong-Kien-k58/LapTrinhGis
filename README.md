# WebGIS

Ứng dụng bản đồ WebGIS dùng OpenLayers/Cesium, Django, PostGIS và GeoServer.
Hướng dẫn bên dưới dành cho cài đặt và chạy phát triển trên Windows bằng PowerShell.

## Bắt đầu

1. Cài các phần mềm trong [Yêu cầu trước khi cài](#yêu-cầu-trước-khi-cài).
2. [Tải mã nguồn và chuẩn bị dữ liệu](#cài-đặt).
3. Tạo `.env` từ `.env.example`, cấu hình database và tài khoản GeoServer.
4. Chạy Django và Vite ở hai terminal riêng; mở `http://localhost:5173`.

## Chức năng đối chiếu PTN

Đã nối trình bày vector/raster bằng SLD (gồm chuyên đề), overview theo lớp,
tra cứu pixel raster, tìm vị trí WGS84/VN2000, tìm công cụ và bảng hỗ trợ trạng thái
dịch vụ. Mục lục lưu thứ tự, nhóm, visibility; các panel hỗ trợ kéo và nhớ vị trí.
Tìm thuộc tính bao gồm mọi trường của các lớp vector, giữ luồng CRUD và công cụ
3D/PDF hiện có. Có giao diện đăng nhập qua biểu tượng tài khoản ở góc trên bên
phải. Giao diện có đăng nhập, đăng ký, quên mật khẩu, lựa chọn Google/Microsoft,
hiện/ẩn mật khẩu, cảnh báo Caps Lock và kiểm tra độ mạnh mật khẩu khi đăng ký.
Các thao tác xác thực hiện chưa kết nối backend và không gửi thông tin tài khoản.
Nếu chọn **Ghi nhớ tài khoản**, chỉ tên đăng nhập được lưu trong trình duyệt;
mật khẩu không được lưu. Bỏ chọn để xóa tên đăng nhập đã ghi nhớ.

Thiết kế tham khảo bố cục hai cột của
[shadcn/ui Authentication](https://ui.shadcn.com/blocks/authentication) và
[Split Screen Login Page trên Dribbble](https://dribbble.com/shots/6668415-Split-Screen-Login-Page).
Đồ họa bản đồ SVG được tạo riêng cho WebGIS, không phụ thuộc dịch vụ ảnh bên ngoài.

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
- Java tương thích với phiên bản GeoServer đã cài nếu chạy GeoServer độc lập.

Kiểm tra các công cụ đã có trong PATH:

```powershell
git --version
node --version
npm --version
python --version
```

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

Nếu PowerShell chặn `Activate.ps1`, có thể chạy trực tiếp Python trong môi trường
ảo, không cần kích hoạt (vẫn ở thư mục `backend`):

```powershell
.\venv\Scripts\python.exe -m pip install -r requirements.txt
.\venv\Scripts\python.exe manage.py migrate
.\venv\Scripts\python.exe manage.py runserver
```

### 4. Chạy frontend

Mở **một cửa sổ PowerShell khác** tại thư mục dự án:

```powershell
cd frontend
npm ci
npm run dev
```

Vite sẽ in địa chỉ để mở ứng dụng, thông thường là
`http://localhost:5173`.

### 5. Kiểm tra sau khi cài

1. Giữ PostgreSQL, GeoServer, Django và Vite cùng chạy.
2. Mở ứng dụng, bật một lớp đã publish trong mục lục và kiểm tra bản đồ có dữ liệu.
3. Mở **Xem dữ liệu**, chọn lớp vector để kiểm tra bảng thuộc tính và API.
4. Nếu dùng địa hình 3D, điền token Cesium ion vào `VITE_CESIUM_ION_TOKEN`
   trong `.env`, khởi động lại Vite rồi chuyển sang **3D**. Các dịch vụ bản đồ
   nền và Cesium cần kết nối Internet.

`migrate` chỉ tạo các bảng do Django quản lý; lệnh này không tự nhập dữ liệu GIS
hoặc publish layer trên GeoServer. Giao diện đăng nhập hiện chỉ là bản demo,
không cần tạo tài khoản để mở bản đồ.

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

## Công cụ địa hình 3D

Chuyển sang **3D** để dùng bộ công cụ Cesium. Các icon chỉ thao tác trên
OpenLayers 2D được ẩn; nút đưa hướng nhìn về Bắc nằm ngay dưới nút **2D**,
giữ nguyên vị trí, độ zoom và độ nghiêng hiện tại.

- **Tra cứu vị trí:** bật icon tâm ngắm rồi click địa hình hoặc công trình.
  Một pin duy nhất di chuyển theo điểm click; tọa độ và cao độ nằm trên header.
- **Đo 3D:** chọn khoảng cách hoặc diện tích bề mặt, click các đỉnh rồi bấm
  **Tính kết quả**, Enter hoặc chuột phải. Khoảng cách chỉ hiển thị chiều dài
  bám địa hình và chiều dài ngang; diện tích hiển thị diện tích bề mặt.
  Backspace bỏ đỉnh cuối, Escape đóng công cụ; **Đo lại** bắt đầu phép đo mới.
- **Mặt cắt:** vẽ tuyến gồm ít nhất hai điểm rồi bấm **Tạo mặt cắt**. Giao diện
  riêng cho biểu đồ cao độ theo khoảng cách ngang, khoảng cao độ và tổng lên/xuống.
  Rê chuột hoặc kéo thanh trượt để xem cao độ, độ dốc từng đoạn lấy mẫu và vị trí
  tương ứng trên bản đồ. **Vẽ tuyến mới** bắt đầu mặt cắt khác.
- **Công trình OSM:** bấm icon công trình để bật/tắt trực tiếp. Icon sáng khi bật;
  mô hình luôn tô màu theo chiều cao. Mô hình phụ thuộc mức phủ dữ liệu OSM và quyền Cesium ion.
- **Hiệu ứng:** bật/tắt sóng nước, chiếu sáng địa hình, sương và khí quyển.
  Sóng nước chỉ xuất hiện tại vùng có water mask trong bộ địa hình.

Đo và mặt cắt lấy mẫu từ **Cesium World Terrain**, không suy ra cao độ từ ảnh
WMS/DEM đang phủ trên bản đồ. Cao độ tham chiếu ellipsoid WGS84; kết quả
xấp xỉ theo độ phân giải dữ liệu. Tuyến tối đa 64 đỉnh và khoảng 4.096 mẫu;
vùng đo bán kính dưới 100 km, tối đa 16.000 điểm lưới. Khi thiếu dữ liệu,
công cụ báo lỗi thay vì gán cao độ 0. Đóng công cụ hoặc chuyển về 2D sẽ hủy
kết quả đang chờ tải.

Kiểm thử tính toán địa hình, đồng bộ lớp và tải WMS: `npm test`
tại thư mục `frontend`. Các test nằm trong `frontend/tests/unit/`.

## Tổ chức mã nguồn frontend

Toàn bộ CSS tự viết nằm trong `frontend/src/styles/` và được import tập trung
ở đầu `main.js`, sau CSS của thư viện:

- `main.css`: giao diện bản đồ chính, workspace, bảng/panel, trình bày lớp và
  công cụ Cesium. Các vùng được đánh dấu `/* #region ... */` để thu gọn trong editor.
- `login.css`: giao diện đăng nhập, đăng ký và khôi phục tài khoản.

Các vùng CSS giữ thứ tự ghi đè của giao diện hiện có. Khi chỉnh một thành phần,
tìm vùng và selector tương ứng để sửa; tránh tạo thêm file CSS hoặc nối một khối
ghi đè ở cuối file cho cùng chức năng. Đường dẫn tài nguyên trong `public/` dùng
đường dẫn từ gốc, ví dụ `/assets/...`.

JavaScript trong `frontend/src/tool/` được chia theo chức năng:

| File | Phạm vi quản lý |
| --- | --- |
| `cesiumTool.js` | Toàn bộ 3D: đồng bộ lớp, tải WMS, tính toán địa hình, đo/mặt cắt, tra cứu, công trình, hiệu ứng và camera |
| `basicTools.js` | Tọa độ, tỷ lệ, bản đồ tổng quan và định vị GPS |
| `workspaceTools.js` | Tìm công cụ, thống kê workspace, hỗ trợ sử dụng và trạng thái dịch vụ |
| `rasterManager.js` | Loại trình bày, tạo lớp, xem trước và quản trị raster |
| `loginTool.js` | Hành vi đăng nhập, đăng ký và khôi phục tài khoản |
| `toolManager.js` | Khởi tạo, bật/tắt và điều phối công cụ bản đồ 2D |
| `apiClient.js`, `toolUtils.js` | Gọi API và các tiện ích dùng chung |

Các module lớn có nhiệm vụ riêng như CRUD, tìm thuộc tính, popup, đo 2D, chọn
vùng, in PDF, mục lục, trình bày lớp và overview theo lớp vẫn có file riêng.
`main.js` kết nối bản đồ với các module; `config/layers.js` chứa cấu hình dữ liệu.
Các file vừa hợp nhất dùng `//#region` / `//#endregion` phân chia nhóm chức năng;
`cesiumTool.js` có vùng con cho từng nhóm điều khiển 3D. Thêm chức năng cùng nhóm
vào vùng tương ứng, thay vì tạo module nhỏ chỉ để chuyển tiếp lời gọi.

## Kiểm tra mã nguồn

Tại thư mục gốc:

```powershell
.\backend\venv\Scripts\python.exe backend/manage.py check
.\backend\venv\Scripts\python.exe backend/manage.py makemigrations --check --dry-run
cd frontend
npm test
npm run build
```

`npm run build` tạo thư mục `frontend/dist`. Để xem thử bản build, chạy
`npm run preview`; backend, GeoServer và PostGIS vẫn cần chạy riêng.
