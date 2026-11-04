# WebGIS

Ứng dụng bản đồ dùng OpenLayers/Cesium, Django, PostGIS và GeoServer.
Hướng dẫn dưới đây dành cho Windows/PowerShell, chạy trên cùng một máy.

**GitHub chỉ chứa code và style. Database, ảnh raster và DEM phải chuyển riêng
từ máy đang có đầy đủ dữ liệu.**

- [Cài mới](#cài-mới)
- [Cập nhật máy đã cài](#cập-nhật-máy-đã-cài)
- [Chạy chương trình](#chạy-chương-trình-mỗi-lần-sử-dụng)

## Yêu cầu

- Git, Node.js ≥ 22.12, Python ≥ 3.12.
- PostgreSQL có PostGIS; GeoServer và Java tương thích.
- GeoServer CSS extension **đúng phiên bản GeoServer** để chuyển style.
- QGIS có Python/GDAL để phân tích DEM; Internet và token Cesium ion cho địa hình 3D.

Nên dùng thư mục mặc định của bộ cài. Chương trình tự tìm Java, thư viện GeoServer
CSS và Python QGIS; không cần thêm ba biến đường dẫn vào `.env` khi cài thông thường.

## Cài mới

### 1. Tải code và cài thư viện

```powershell
git clone https://github.com/Duong-Kien-k58/LapTrinhGis.git
cd LapTrinhGis
python -m venv backend\venv
.\backend\venv\Scripts\python.exe -m pip install -r backend/requirements.txt
cd frontend
npm ci
cd ..
```

### 2. Chuẩn bị database, raster/DEM và GeoServer

1. Trên máy nguồn, backup **toàn bộ database** bằng pgAdmin, định dạng Custom,
   gồm cấu trúc, dữ liệu, view và `django_migrations`; chép riêng các GeoTIFF.
   Trong Backup: bật **Pre-data, Data, Post-data**, tắt **Only data/Only schemas**,
   không giới hạn bảng trong Objects; chờ thông báo thành công.
2. Trên máy nhận có PostGIS, tạo database mới, ví dụ `webgis_full`, rồi Restore
   bản backup. Nếu khác tài khoản, bỏ khôi phục owner/privilege; kiểm tra log Restore.
3. Chép ảnh nền, SRTM 30 m và 34 DEM tỉnh vào thư mục cố định, ví dụ
   `D:\WebGISData`, không đặt trong `temp/`.
4. Mở `http://localhost:8080/geoserver`, tạo workspace **`webgis`**, kết nối
   PostGIS Store tới database vừa restore và publish các lớp:

   | Loại | Tên lớp trên GeoServer |
   | --- | --- |
   | Vector | `ranhgioi`, `nenbien`, `khung25k`, `nuocngoai`, `tthc`, `vn_tinh`, `vn_xa`, `qlo`, `tinhlo` |
   | Raster | `fast_alpha`, `SRTM_30_VN_UTM` và 34 lớp `dem_*` đúng tên trong `frontend/src/config/layers.js` |

5. Kiểm tra CRS, tính bounding box, thử **Layer Preview**. DEM phân tích phải là
   GeoTIFF cao độ; dùng store **GeoTIFF cục bộ với đường dẫn tuyệt đối**, ví dụ
   `file:///D:/WebGISData/dem10m/ten_file.tif`. GeoServer và Django đều phải đọc được tệp.

Style nằm trong [`styleLayer/`](styleLayer/README.md), được chuyển tự động khi
chạy frontend. Không cần tạo lại style tùy chỉnh trên GeoServer; giữ style hệ thống.

### 3. Cấu hình `.env`

Tại thư mục gốc, chỉ sao chép file mẫu nếu **chưa có `.env`**:

```powershell
Copy-Item .env.example .env
notepad .env
```

Điền các giá trị theo máy đang cài:

| Biến | Nội dung |
| --- | --- |
| `DJANGO_SECRET_KEY` | Chuỗi bí mật riêng, thay giá trị mẫu |
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_HOST`, `POSTGRES_PORT` | Database đã restore và tài khoản PostgreSQL |
| `GEOSERVER_REST_URL`, `GEOSERVER_WORKSPACE` | Mặc định `http://localhost:8080/geoserver/rest`, `webgis` |
| `GEOSERVER_ADMIN_USER`, `GEOSERVER_ADMIN_PASSWORD` | Tài khoản GeoServer, dùng quản trị raster và đọc DEM đã publish |
| `VITE_CESIUM_ION_TOKEN` | Token Cesium ion cho dịch vụ địa hình/công trình 3D |

<details>
<summary>Chỉ khi cài phần mềm ở thư mục riêng</summary>

Cơ chế tự tìm kiểm tra Program Files, Programs của người dùng và các thư mục
QGIS/OSGeo4W hoặc GeoServer/Tomcat tại gốc ổ C/D/E. Java còn được tìm qua PATH,
JAVA_HOME/JRE_HOME và các thư mục Java phổ biến. Không quét toàn bộ ổ đĩa.

Nếu không tìm được bộ cài của máy, có thể thêm các biến tùy chọn vào `.env`:

```dotenv
DEM_GDAL_PYTHON='D:/duong-dan-QGIS/bin/python3.exe'
GEOSERVER_LIB_DIR='D:/duong-dan-GeoServer/webapps/geoserver/WEB-INF/lib'
STYLE_JAVA='D:/duong-dan-Java/bin/java.exe'
```

Thay đường dẫn ví dụ bằng vị trí thực tế; chỉ thêm biến cần ghi đè.

</details>

Không đưa `.env` lên GitHub. Sau khi sửa cấu hình, khởi động lại Django và Vite.
Nếu dùng cổng frontend khác, cập nhật `CORS_ALLOWED_ORIGINS` và `CSRF_TRUSTED_ORIGINS`.

### 4. Kiểm tra và tạo bảng ứng dụng

Chạy tại thư mục gốc:

```powershell
.\backend\venv\Scripts\python.exe backend/manage.py check
.\backend\venv\Scripts\python.exe backend/manage.py migrate
```

Migration quản lý metadata raster; không tự nhập dữ liệu GIS, chép DEM hoặc
publish lớp. Giữ lịch sử `django_migrations` khi backup/restore, không cần dùng `--fake`.

## Cập nhật máy đã cài

1. Dừng Django/Vite bằng `Ctrl+C`; sao lưu database, `.env` và cấu hình GeoServer.
   Sao lưu hoặc commit code chỉnh riêng trước khi pull.
2. Tại **thư mục gốc `LapTrinhGis`**, chạy:

   ```powershell
   git pull --ff-only origin main
   .\backend\venv\Scripts\python.exe -m pip install -r backend/requirements.txt
   .\backend\venv\Scripts\python.exe backend/manage.py check
   .\backend\venv\Scripts\python.exe backend/manage.py migrate
   cd frontend
   npm ci
   cd ..
   ```

3. Giữ `.env` hiện có, đối chiếu `.env.example` để bổ sung biến còn thiếu.
   Ba biến đường dẫn Java/GeoServer/QGIS không còn bắt buộc; nếu từng điền đường
   dẫn sai của máy khác, xóa dòng tương ứng để ứng dụng tự tìm lại.
4. Nếu thiếu dữ liệu: thực hiện bước **2 của phần Cài mới** để restore database
   đầy đủ vào database mới, chép DEM và cập nhật GeoServer; sửa `POSTGRES_*` theo
   database mới rồi chạy lại `check` và `migrate`. Không ghi đè database cũ chưa sao lưu.
5. Khởi động ứng dụng theo phần dưới. Nếu chỉ cập nhật code/style và dữ liệu đã đủ,
   không cần restore database hoặc publish lại các lớp.

## Chạy chương trình mỗi lần sử dụng

Bật PostgreSQL và GeoServer. Mở **hai terminal riêng từ thư mục gốc**:

**Terminal 1 — backend:**

```powershell
cd backend
.\venv\Scripts\python.exe manage.py runserver
```

**Terminal 2 — frontend:**

```powershell
cd frontend
npm run dev
```

Giữ hai terminal mở, truy cập `http://localhost:5173` hoặc địa chỉ Vite in ra.
Nếu terminal đã ở `backend`/`frontend`, bỏ lệnh `cd` tương ứng.

## Kiểm tra sau cài đặt và xử lý lỗi

- Bật các lớp vector/raster/DEM, mở bảng thuộc tính và tra cứu pixel; thử phân tích
  độ dốc/hướng dốc trên vùng nhỏ, sau đó thử 3D/mặt cắt.
- `ERR_CONNECTION_REFUSED` ở cổng `8000`: Django chưa chạy hoặc đã dừng; xem terminal backend.
- Bản đồ thiếu lớp: kiểm tra dữ liệu, tên layer, CRS và Layer Preview trên GeoServer.
- Lỗi chuyển CSS: kiểm tra đã cài Java và CSS extension đúng phiên bản GeoServer.
- Không phân tích được DEM: kiểm tra đã cài QGIS có GDAL, tài khoản GeoServer và đường dẫn GeoTIFF.
- Style vẫn như bản cũ: bấm **Mặc định** trong công cụ trình bày của lớp rồi tải lại trang.
- Địa chỉ dịch vụ frontend nằm trong `frontend/src/config/layers.js`; nếu đổi cổng,
  workspace hoặc máy chủ, sửa `GEOSERVER_CONFIG` tương ứng.

**Giới hạn hiện tại:** đăng nhập chưa kết nối xác thực backend; menu Dự án mới là
bản xem trước, chưa lưu dự án vào backend. Địa hình Cesium World Terrain dùng cho
đo/mặt cắt 3D là nguồn riêng với GeoTIFF DEM dùng phân tích.

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

## Sử dụng nhanh

### Giao diện Dự án — bước 1

Menu **Dự án** nằm đầu menu chức năng, gồm **Tạo dự án mới / Mở dự án /
Thoát dự án**. Tạo mới có ba phần khai báo: tài khoản và thông tin dự án,
cách chọn phạm vi, danh sách nhiệm vụ. Nhập tên rồi chọn **Xem trước dự án**
để mở bảng thông tin; có thể chỉnh lại khai báo hoặc mở lại bảng qua **Mở dự án**.
**Thoát dự án** cho phép đóng bản xem trước sau khi xác nhận.

Đây là khung giao diện: chưa xác thực tài khoản, lấy/vẽ phạm vi, gọi công cụ
nhiệm vụ hoặc lưu vào backend. Nút **Lưu dự án** hiện bị vô hiệu hóa. Thông tin
xem trước chỉ nằm trong bộ nhớ của trang, mất khi tải lại; chưa thay đổi dữ liệu GIS.

### Thao tác bản đồ

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
tại thư mục `frontend`. Các bài kiểm thử frontend nằm trong `frontend/tests/`.

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

Kiểm thử API backend: chạy `python manage.py test tests` từ thư mục `backend`
bằng Python trong `venv`. Kiểm thử GDAL chạy riêng bằng Python của QGIS với
file `backend/tests/slope_gdal_cases.py`.

Kiểm thử migration (SQLite trong bộ nhớ, không kết nối database đang dùng):

```powershell
.\backend\venv\Scripts\python.exe backend/tests/migration_upgrade_check.py
```


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

### Phân tích độ dốc và hướng dốc

Trong **Phân tích địa hình → Phân tích độ dốc → Tệp GeoTIFF**, chọn raster,
chọn band (nếu có nhiều band) và đơn vị cao độ rồi bấm **Tải lên và kiểm tra**.
Nếu GeoTIFF thiếu CRS, nhập mã EPSG của dữ liệu. Không đọc toàn bộ raster trong
trình duyệt; GDAL kiểm tra band và tính thống kê ở tiến trình riêng trên backend.

- Tối đa **2 GiB/tệp**, tải từng khối **8 MiB**. Khi lỗi mạng, có thể tiếp tục
  từ khối đã xác nhận trong cùng trang; nút Hủy dừng tải và hủy DEM tạm.
- Dữ liệu nằm trong `temp/dem-uploads/` ở gốc dự án, cách ly theo phiên trình duyệt,
  hết hiệu lực sau **24 giờ**, không tự xuất bản GeoServer hoặc thêm vào kho DEM.
- Tệp hết hạn được dọn khi khởi tạo phiên tải mới. Có thể dọn chủ động bằng
  `python manage.py cleanup_dem_uploads` từ thư mục `backend`.
- Ứng dụng tự tìm Python có GDAL của QGIS tại các thư mục cài phổ biến.
  Nếu dùng thư mục riêng, có thể đặt `DEM_GDAL_PYTHON` trong `.env`. Runtime QGIS được cách ly với
  Python của Django. Các giới hạn lưu trữ nằm trong `backend/backend/settings.py`.
- Tất cả lớp được quản lý chung trong **Dữ liệu raster**, không chia DEM/DSM/DTM hay loại ảnh.
- Sau khi raster sẵn sàng, chọn **Theo ranh giới lớp** hoặc **Theo vùng cắt** trên
  bản đồ, xem diện tích/số ô ước tính và chọn đơn vị độ dốc, rồi bấm **Phân tích
  độ dốc**. Backend tính Horn 3×3, hỗ trợ độ và phần trăm, scale/offset của band
  và cao độ mét/feet. DEM tọa độ địa lý hoặc lưới xoay được chuyển sang UTM.
- Lựa chọn **Theo ranh giới lớp** có hai bước: bấm **Xác định phạm vi** để
  zoom tới toàn bộ khung raster, rồi quét pixel hợp lệ và xem đường bao.
  Sau đó bấm **Phân tích**. **Theo vùng cắt** cho phép vẽ đa giác trong phạm vi lớp.
  Thông tin lưới và hệ tọa độ được đọc trực tiếp từ GeoTIFF khi chọn lớp, kể cả
  các lớp cấu hình sẵn chưa có metadata đầy đủ. Backend phải đang chạy ở cổng 8000.
  Đường bao giữ các phần rời và lỗ NoData; không tự lấy ranh giới hành chính.
  Backend cắt phần đệm trống ngoài vùng dữ liệu và dùng mask pixel chính xác.
  GeoTIFF vẫn có khung chữ nhật; vùng ngoài đường bao và ô không đủ hàng xóm
  được giữ NoData. Không giới hạn số ô; xử lý theo khối 1024×1024, bỏ qua
  khối trống và gộp tính toán, thống kê, ghi kết quả trong cùng một lượt.
- Kết quả gồm GeoTIFF Float32 đầy đủ độ phân giải, ảnh xem trước trên bản đồ 2D
  và báo cáo TXT tiếng Việt theo 7 cấp (0–3–8–15–25–35–45–90°; quy đổi tương ứng khi dùng %).
  Ảnh xem trước tối đa 1536 px, dùng lấy mẫu gần nhất; chỉ GeoTIFF là raster số
  đầy đủ. Diện tích thống kê tính theo ô lưới hệ chiếu.
- Ô trung tâm phải hợp lệ và có ít nhất 7/8 ô lân cận hợp lệ cho cả độ dốc và
  hướng dốc; hiệu chỉnh trọng số khi thiếu một ô. NoData và giá trị không hữu hạn
  không tham gia tính; ô không đủ điều kiện bị loại. Có đọc thêm
  vùng đệm 2 ô trước khi tính rồi mới áp mặt nạ vùng chọn để tránh tạo biên giả.
  Chất lượng kết quả phụ thuộc DEM nguồn; thao tác này không lấp chỗ trống.
- **Phân tích địa hình → Phân tích hướng dốc** dùng cùng bảng chọn DEM, tải tệp,
  xác định vùng, tiến trình, hủy và xem kết quả 2D/3D. Hướng dốc chỉ dùng độ:
  Bắc 0°, Đông 90°, Nam 180°, Tây 270°; bằng phẳng là −1, NoData là −9999.
  Phép tính Aspect planar dùng cửa sổ 3×3 và trọng số theo
  [công thức ArcMap](https://desktop.arcgis.com/en/arcmap/latest/tools/spatial-analyst-toolbox/how-aspect-works.htm):
  ô trung tâm phải hợp lệ, có ít nhất 7 trong 8 ô lân cận hợp lệ; mép ngoài
  raster là NoData. Đây là phương pháp planar theo Bắc lưới hệ chiếu.
  Chú giải gồm 8 hướng và bằng phẳng; nhóm Bắc gộp hai khoảng qua 0°.
  Thống kê dùng trung bình góc vòng, loại ô bằng phẳng khỏi trung bình;
  không xác định trung bình nếu không có hướng hoặc các hướng triệt tiêu nhau.
  GeoTIFF giữ góc thực, PNG xem trước và TXT giữ đúng phân nhóm hướng.
- Tác vụ chạy nền, có tiến trình/hủy; tối đa 30 phút/tác vụ,
  2 tác vụ đồng thời trên máy chủ và 1 tác vụ/phiên; vẫn kiểm tra dung lượng ổ đĩa.
- API `/mygis/slope-jobs/` dùng chung cho độ dốc và hướng dốc, nhận POST với
  `operation: "slope"`, `"aspect"` hoặc `"footprint"`; `<uuid>/` nhận GET/DELETE; các đường dẫn
  `geotiff/`, `preview/`, `report/` chỉ đọc được bởi phiên đã tạo tác vụ.
  Kết quả lưu 24 giờ trong `temp/slope-jobs/`; dọn bằng lệnh
  `python manage.py cleanup_dem_uploads` hoặc tự dọn khi tạo tác vụ mới.
- Logic riêng được tách theo chức năng: backend `backend/mygis/slope.py`
  chứa tính độ dốc, phân lớp và báo cáo; `backend/mygis/aspect.py` chứa tính
  hướng dốc, phân hướng, thống kê góc vòng và báo cáo. Quy trình dùng chung
  (tải DEM, kiểm tra GeoTIFF, chọn lưới, API, xử lý theo khối và worker) nằm
  trong `backend/mygis/terrain_analysis.py`.
- Frontend `frontend/src/tool/slopeTool.js` và `aspectTool.js` quản lý nội dung,
  đơn vị, bảng thống kê và chú giải riêng. `terrainAnalysisTool.js` giữ bảng
  thao tác, chọn vùng, tải DEM, theo dõi tác vụ và hiển thị 2D/3D dùng chung.
  Worker kiểm tra dùng `--validate-upload`, worker tính slope dùng `--worker`;
  cả hai vẫn chạy trong Python GDAL riêng, không cần nạp Django. DEM GeoServer
  hiện cần là kho GeoTIFF cục bộ mà backend đọc được, không nhận đường dẫn tùy ý
  từ trình duyệt. Nếu lớp thiếu đơn vị cao độ, người dùng chọn mét/feet trước
  khi tính.

### Thư mục tạm dùng chung

Các dữ liệu sinh ra khi chạy ứng dụng được gom trong `temp/`. Toàn bộ thư mục
`/temp/` bị Git bỏ qua; mã nguồn kiểm thử nằm riêng trong
`frontend/tests/` và `backend/tests/`:

| Thư mục | Nội dung |
| --- | --- |
| `temp/dem-uploads/` | GeoTIFF tải tạm và trạng thái phiên |
| `temp/slope-jobs/` | Raster độ dốc, ảnh xem trước, thống kê và trạng thái tác vụ |
| `temp/django-uploads/` | File tạm do Django nhận upload |
| `temp/runtime/` | File tạm của Python/GDAL |
| `temp/tests/` | Dữ liệu sinh ra khi chạy kiểm thử |
| `temp/python-cache/` | Bytecode/cache Python |
| `temp/vite-cache/` | Cache frontend |
| `temp/frontend-dist/` | Bản build frontend, có thể tạo lại |
| `temp/backups/`, `temp/reports/`, `temp/logs/` | Nơi đặt bản sao tạm, báo cáo và log khi cần |

Để dọn toàn bộ, dừng backend, frontend và các tác vụ xử lý trước rồi xóa nội dung
trong `temp/` (giữ `.gitkeep` nếu có). Thao tác này cũng xóa các DEM tải tạm và
bản build; cần tải lại DEM hoặc chạy build lại. Ứng dụng tự tạo lại các thư mục
runtime cần thiết khi khởi động. Dọn `temp/` không xóa mã nguồn kiểm thử.
