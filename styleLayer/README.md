# Style của từng lớp bản đồ

**Chỉ sửa các file CSS trong thư mục này. Không tạo hoặc gán style trên GeoServer.**

Mỗi lớp có một file `<tên-lớp>.css`, ví dụ:

- `ranhgioi.css`: đường ranh giới, nhãn quốc gia và hai thành phố Hà Nội / TP. Hồ Chí Minh.
- `tthc.css`: ghim và tên trung tâm hành chính.
- `vn_tinh.css`, `vn_xa.css`, `nuocngoai.css`, `qlo.css`, `tinhlo.css`: các lớp vector.
- `dem_*.css`, `SRTM_30_VN_UTM.css`, `fast_alpha.css`: các lớp raster.
- `_raster.css`: mẫu mặc định cho raster mới tải lên chưa có file riêng.
- `assets/tthc-pin.svg`: biểu tượng ghim do dự án quản lý.

## Sửa hoặc thêm style

1. Mở file CSS của lớp, chỉnh màu, độ dày, font và điều kiện tỷ lệ.
2. Khi chạy `npm run dev`, lưu file là ứng dụng tự chuyển CSS và tải lại trang.
3. Để tạo style cho lớp khác, thêm `<tên-lớp-trên-GeoServer>.css`. File mới được
   tự nhận, không cần sửa danh sách import hay đăng ký style trên máy chủ.
4. Nếu lớp chưa có trong ứng dụng, khai báo lớp/dữ liệu trong `layers.js` như trước.
   File CSS chỉ quy định cách vẽ, không tự tạo dữ liệu hoặc publish lớp.
5. Dùng **Mặc định** trong công cụ trình bày nếu đã lưu cách trình bày riêng
   trong trình duyệt và muốn quay lại CSS của dự án.

Ví dụ style cho lớp đường:

```css
* {
  stroke: #ffffff;
  stroke-width: 1.2;
}
[@sd < 1000000] {
  label: [ten];
  font-family: 'Arial';
  font-size: 13;
  font-fill: #ffffff;
  halo-color: #202b35;
  halo-radius: 1.5;
}
```

Đây là **GeoServer CSS**, không phải CSS giao diện web. Tài nguyên trong style
dùng đường dẫn tương đối, ví dụ `mark: url('assets/tthc-pin.svg');`.

## Cách chạy

Vite chuyển CSS thành SLD **trong bộ nhớ** lúc khởi động/build và khi file thay
đổi. SLD được đóng gói trong JavaScript; không có file SLD nguồn cần chỉnh và
không có thao tác lưu style lên GeoServer. Yêu cầu WMS 2D/3D gửi toàn bộ style
đã chuyển bằng POST. GeoServer vẫn cung cấp dữ liệu và dựng ảnh bản đồ.

Bộ chuyển tự tìm Java và các JAR GeoServer CSS đã cài trên máy (`gt-css`,
`gt-xml`, Janino và các thư viện cùng bộ) tại các thư mục cài phổ biến.
Không cần cấu hình đường dẫn khi dùng vị trí cài thông thường. Nếu cài ở thư mục
riêng, có thể ghi đè bằng `GEOSERVER_LIB_DIR` và `STYLE_JAVA` trong `.env`.
Không cần cài JDK; JRE đang dùng cho GeoServer là đủ. Bộ chuyển không cần
dịch vụ GeoServer đang chạy. Máy chỉ phục vụ bản build không cần Java/JAR này.

GeoServer yêu cầu mỗi lớp có một style mặc định nội bộ. Các lớp `webgis`
dùng style hệ thống tối thiểu (`generic`/`raster`) cho yêu cầu bên ngoài ứng
dụng; ứng dụng luôn gửi style riêng từ CSS. Không xóa style hệ thống hoặc style
của các workspace khác.

Bản triển khai cần chạy lại `npm run build` khi sửa CSS. Bản đồ nền XYZ/OSM
và ảnh kết quả phân tích không dùng những file CSS này.
