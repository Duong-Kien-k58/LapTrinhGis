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

## Cập nhật máy đã chạy được bản trước

Dừng Django và Vite trước khi cập nhật. Giữ nguyên `.env`, môi trường Python,
database PostGIS và cấu hình GeoServer đang dùng; không chép đè `.env` bằng file mẫu.
Tại thư mục gốc dự án:

```powershell
git pull --ff-only origin main
cd frontend
npm ci
cd ../backend
.\venv\Scripts\python.exe -m pip install -r requirements.txt
.\venv\Scripts\python.exe manage.py check
.\venv\Scripts\python.exe manage.py migrate --plan
```

**Kiểm tra dữ liệu trước khi migrate:** bản này có migration `mygis.0003`–`0005`
đổi dữ liệu tham chiếu và căn biên quốc gia. `0003` cần sẵn các bảng PostGIS
`public.nuocngoai_all`, `public.nuocngoai`, `public.tthc`, `public.ub_tinh`;
`0004` cần thêm `public.vn_tinh`. Đây là dữ liệu nhập riêng, không có trong Git.
Sao lưu database bằng pgAdmin trước khi chạy migration. Nếu máy chỉ có dữ liệu
của bản trước và thiếu các bảng nguồn, cần nhận bộ dữ liệu tương ứng từ người
quản lý dự án rồi nhập vào database trước; chỉ pull code không bổ sung dữ liệu này.
Không dùng `--fake` để bỏ qua các migration thay đổi dữ liệu.

Khi dữ liệu đã đủ, chạy:

```powershell
.\venv\Scripts\python.exe manage.py migrate
.\venv\Scripts\python.exe manage.py runserver
```

Mở terminal khác tại `frontend`, chạy `npm run dev`. Kiểm tra các lớp
`webgis:tthc`, `webgis:nuocngoai`, `webgis:ranhgioi` đã publish đúng trên GeoServer;
`ranhgioi` là lớp ranh giới hiển thị mặc định của bản mới. Git không cập nhật
datastore, layer hay style của GeoServer. Các DEM 10 m theo tỉnh chỉ dùng được
sau khi publish dữ liệu riêng, không bắt buộc để mở ứng dụng.

Để dùng phân tích độ dốc trên máy khác, bổ sung `DEM_GDAL_PYTHON` vào `.env`,
trỏ tới Python có GDAL của QGIS thực tế trên máy đó (xem `.env.example`). Không
cần cài lại toàn bộ dự án. Sau khi sửa `.env`, khởi động lại Django và Vite.

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
   Các lớp có thể biên tập gồm: `tthc`, `tinhlo`, `vn_tinh`, `vn_xa`, `qlo`,
   `nenbien` và `nuocngoai`.
3. Trong GeoServer, tạo workspace `webgis`, kết nối PostGIS datastore tới
   database trên, rồi publish các layer cần dùng. Các lớp raster được cấu hình
   trong dự án là `fast_alpha` và `SRTM_30_VN_UTM`.
4. Mở GeoServer tại `http://localhost:8080/geoserver` để kiểm tra dịch vụ đang
   chạy.

Các style CSS được quản lý trực tiếp trong GeoServer → Styles, workspace `webgis`:
`a_nuocngoai_css`, `a_ranhgioi_css` và `a_tthc_css`. Chỉnh sửa và lưu CSS tại đó.

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

Ứng dụng mở thẳng vào **3D**, nhìn nghiêng về Đông Dương trên nền vệ tinh.
Cảnh mở đầu dùng tâm 105°Đ, 16°B, khoảng cách 4.450 km, độ nghiêng 40° và
roll 0°; chỉnh `STARTUP_3D_VIEW` trong `frontend/src/config/layers.js`.
Mỗi lần mở trang dùng cảnh này, giữ cấu hình đã lưu của bản đồ nền và các lớp dữ liệu.

Các bản đồ nền dùng cấu hình gốc trong `frontend/src/config/layers.js`:
OpenStreetMap, OpenTopoMap và Google Satellite thuần (`lyrs=s`, `hl=en`).
Dùng nút **2D** để trở lại bản đồ phẳng.

Các icon chỉ thao tác trên
OpenLayers 2D được ẩn; nút đưa hướng nhìn về Bắc nằm ngay dưới nút **2D**,
giữ nguyên vị trí, độ zoom và độ nghiêng hiện tại.

**Hiệu ứng cảnh 3D** có sáu lựa chọn, mặc định đều tắt, mỗi lựa chọn có thanh
cường độ 0–100%. Chọn hiệu ứng để mở thanh chỉnh; icon sáng khi còn ít nhất
một lựa chọn được tick. 0% không tạo hiệu ứng dù checkbox vẫn được chọn.
Các mức dương chuyển tiếp theo thời gian để tránh giật khi kéo thanh; 0%
tắt ngay. Sóng dùng thời gian tích lũy để không nhảy pha khi đổi cường độ.
Mặt nước điều chỉnh độ rõ/tốc độ gợn sóng ở vùng World Terrain có mặt nạ nước,
không mô phỏng chiều cao sóng thực. Chiếu sáng dùng đèn xiên theo hướng nhìn:
sườn hướng về đèn sáng hơn, sườn khuất tối hơn, giúp đọc địa hình và không
thay đổi cao độ. Sương pha màu theo độ sâu để chỉnh độ mờ ở xa, không cắt bớt
ô địa hình; khí quyển chỉnh quầng sáng chân trời.
Thanh chiếu sáng tăng tương phản giữa sườn sáng/tối, giữ độ phơi sáng ổn định
để tránh ảnh trắng lóa ở mức cao. Sương rõ ở góc nhìn nghiêng gần địa hình;
khí quyển rõ ở chân trời và góc nhìn toàn cầu, nước chỉ áp dụng tại vùng nước.
Mưa/tuyết chỉ mô phỏng hạt quanh camera; cường độ đổi mật độ, kích thước và độ rõ, không lấy
dữ liệu khí tượng hay tạo tuyết phủ tích lũy. Các hiệu ứng dùng trực tiếp cảnh
Cesium, không thêm lớp bản đồ. Hạt được giải phóng khi tắt, về 2D hoặc ẩn tab.
Hạt đi theo điểm nhìn khi pan/zoom; mật độ có giới hạn và điều chỉnh theo
diện tích màn hình. Giảm cường độ cũng làm giảm độ rõ của các hạt đã sinh ra.

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
tại thư mục `frontend`. Các test nằm trong `temp/tests/frontend/unit/`.

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

Panel hiệu ứng 3D dùng cùng bộ điều khiển trong `cesiumTool.js` (region 5.7).
Cường độ 0% ngừng tác động; tắt công tắc giữ lại mức đã chọn. Nút “Tắt tất cả”
dừng cả sáu hiệu ứng. Khi về 2D hoặc ẩn tab, hiệu ứng được ngừng và hạt thời tiết
được giải phóng; khi quay lại 3D, các lựa chọn được khôi phục.

## Kiểm tra mã nguồn

Tại thư mục gốc:

```powershell
.\backend\venv\Scripts\python.exe backend/manage.py check
.\backend\venv\Scripts\python.exe backend/manage.py makemigrations --check --dry-run
cd frontend
npm test
npm run build
```

`npm run build` tạo thư mục `temp/frontend-dist`. Để xem thử bản build, chạy
`npm run preview`; backend, GeoServer và PostGIS vẫn cần chạy riêng.

### Tải DEM tạm cho phân tích địa hình

Trong **Phân tích địa hình → Phân tích độ dốc → Tệp từ máy**, chọn GeoTIFF,
xác nhận loại DEM/DSM/DTM, band và đơn vị cao độ rồi bấm **Tải lên và kiểm tra**.
Nếu GeoTIFF thiếu CRS, nhập mã EPSG của dữ liệu. Không đọc toàn bộ raster trong
trình duyệt; GDAL kiểm tra band và tính thống kê ở tiến trình riêng trên backend.

- Tối đa **2 GiB/tệp**, tải từng khối **8 MiB**. Khi lỗi mạng, có thể tiếp tục
  từ khối đã xác nhận trong cùng trang; nút Hủy dừng tải và hủy DEM tạm.
- Dữ liệu nằm trong `temp/dem-uploads/` ở gốc dự án, cách ly theo phiên trình duyệt,
  hết hiệu lực sau **24 giờ**, không tự xuất bản GeoServer hoặc thêm vào kho DEM.
- Tệp hết hạn được dọn khi khởi tạo phiên tải mới. Có thể dọn chủ động bằng
  `python manage.py cleanup_dem_uploads` từ thư mục `backend`.
- Cấu hình `.env`: `DEM_GDAL_PYTHON` trỏ tới Python có GDAL; mặc định sử dụng
  `C:/Program Files/QGIS 3.40.3/bin/python3.exe`. Runtime QGIS được cách ly với
  Python của Django. Các giới hạn lưu trữ nằm trong `backend/backend/settings.py`.
- Sau khi DEM sẵn sàng, có thể chọn toàn bộ DEM hoặc vẽ vùng phân tích trên
  bản đồ, xem diện tích/số ô ước tính và chọn đơn vị độ dốc, rồi bấm **Phân tích
  độ dốc**. Backend tính Horn 3×3, hỗ trợ độ và phần trăm, scale/offset của band
  và cao độ mét/feet. DEM tọa độ địa lý hoặc lưới xoay được chuyển sang UTM.
- Lựa chọn **Theo vùng có dữ liệu DEM** có hai bước: bấm **Xác định ranh giới
  DEM** để quét pixel hợp lệ và xem đường bao, sau đó bấm **Phân tích độ dốc**.
  Đường bao giữ các phần rời và lỗ NoData; không tự lấy ranh giới hành chính.
  Backend cắt phần đệm trống ngoài vùng dữ liệu và dùng mask pixel chính xác.
  GeoTIFF vẫn có khung chữ nhật; vùng ngoài đường bao và ô không đủ hàng xóm
  được giữ NoData. Giới hạn số ô vẫn áp dụng cho khung xử lý có vùng đệm.
- Kết quả gồm GeoTIFF Float32 đầy đủ độ phân giải, ảnh xem trước trên bản đồ 2D
  và báo cáo TXT tiếng Việt theo 7 cấp (0–3–8–15–25–35–45–90°; quy đổi tương ứng khi dùng %).
  Ảnh xem trước tối đa 1536 px, dùng lấy mẫu gần nhất; chỉ GeoTIFF là raster số
  đầy đủ. Diện tích thống kê tính theo ô lưới hệ chiếu.
- NoData, giá trị không hữu hạn và ô thiếu hàng xóm 3×3 bị loại. Có đọc thêm
  vùng đệm 2 ô trước khi tính rồi mới áp mặt nạ vùng chọn để tránh tạo biên giả.
  Chất lượng kết quả phụ thuộc DEM nguồn; thao tác này không lấp chỗ trống.
- Tác vụ chạy nền bằng GDAL, có tiến trình/hủy; giới hạn mặc định 200 triệu ô,
  30 phút/tác vụ, 2 tác vụ đồng thời trên máy chủ và 1 tác vụ/phiên. Có thể đặt
  `SLOPE_MAX_CELLS` trong Django settings để thay giới hạn ô.
- API `/mygis/slope-jobs/` nhận POST; `<uuid>/` nhận GET/DELETE; các đường dẫn
  `geotiff/`, `preview/`, `report/` chỉ đọc được bởi phiên đã tạo tác vụ.
  Kết quả lưu 24 giờ trong `temp/slope-jobs/`; dọn bằng lệnh
  `python manage.py cleanup_dem_uploads` hoặc tự dọn khi tạo tác vụ mới.
- Logic frontend nằm trong `frontend/src/tool/terrainAnalysisTool.js`. Backend
  gom tải DEM, lưu trạng thái tạm, kiểm tra GeoTIFF, API, tính độ dốc và cả hai
  worker vào `backend/mygis/slope_analysis.py` (không còn thư mục `mygis/dem/`).
  Worker kiểm tra dùng `--validate-upload`, worker tính slope dùng `--worker`;
  cả hai vẫn chạy trong Python GDAL riêng, không cần nạp Django. DEM GeoServer
  hiện cần là kho GeoTIFF cục bộ mà backend đọc được, không nhận đường dẫn tùy ý
  từ trình duyệt. Nếu lớp thiếu đơn vị cao độ, người dùng chọn mét/feet trước
  khi tính.

### Thư mục tạm dùng chung

Các dữ liệu sinh ra khi chạy ứng dụng được gom trong `temp/`. Toàn bộ thư mục
`/temp/` bị Git bỏ qua, kể cả các file test và file đánh dấu thư mục bên trong:

| Thư mục | Nội dung |
| --- | --- |
| `temp/dem-uploads/` | GeoTIFF tải tạm và trạng thái phiên |
| `temp/slope-jobs/` | Raster độ dốc, ảnh xem trước, thống kê và trạng thái tác vụ |
| `temp/django-uploads/` | File tạm do Django nhận upload |
| `temp/runtime/` | File tạm của Python/GDAL |
| `temp/tests/frontend/unit/` | Các file kiểm thử frontend |
| `temp/tests/backend/` | Các file kiểm thử backend |
| `temp/tests/` | Dữ liệu sinh ra khi chạy kiểm thử |
| `temp/python-cache/` | Bytecode/cache Python |
| `temp/vite-cache/` | Cache frontend |
| `temp/frontend-dist/` | Bản build frontend, có thể tạo lại |
| `temp/backups/`, `temp/reports/`, `temp/logs/` | Nơi đặt bản sao tạm, báo cáo và log khi cần |
| `temp/unused-assets/` | Tài nguyên cũ không còn được ứng dụng tham chiếu |

Để dọn toàn bộ, dừng backend, frontend và các tác vụ xử lý trước rồi xóa nội dung
trong `temp/` (giữ `.gitkeep` nếu có). Thao tác này cũng xóa các DEM tải tạm và
bản build; cần tải lại DEM hoặc chạy build lại. Ứng dụng tự tạo lại các thư mục
runtime cần thiết khi khởi động. Các file kiểm thử cũng được gom trong `temp/tests/`
theo cách tổ chức hiện tại; xóa thư mục này sẽ xóa cả các test, nhưng không ảnh
hưởng chức năng chạy ứng dụng. Lệnh test chỉ dùng được khi còn các file test.
Chạy backend test từ thư mục `backend` bằng:
`python manage.py test ../temp/tests/backend`.
