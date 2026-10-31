// Nội dung và cách trình bày riêng của chức năng độ dốc.
export const slopeTool = {
  operation: 'slope',
  label: 'độ dốc',
  title: 'Độ dốc',
  units: [{ label: 'Độ (°)', value: 'degree' }, { label: 'Phần trăm (%)', value: 'percent' }],
  note: 'Horn 3 × 3 · Bỏ ô NoData và ô thiếu hàng xóm.',
  regionNote: 'Đã chọn vùng có cao độ hợp lệ, giữ các phần rời và lỗ NoData. Xử lý theo khối, bỏ qua khối trống; ô thiếu hàng xóm 3 × 3 bị loại khi tính độ dốc.',

  summary(result, number, suffix) {
    return [
      ['Nhỏ nhất / Lớn nhất', `${number(result.min)} / ${number(result.max)} ${suffix}`],
      ['Trung bình', `${number(result.mean)} ${suffix}`],
    ];
  },

  legend(item, index, result, number, suffix) {
    if (item.max === null) return `≥ ${number(item.min)} ${suffix}`;
    return `${number(item.min)} ${index === result.classes.length - 1 ? '–' : '– <'} ${number(item.max)} ${suffix}`;
  },
};
