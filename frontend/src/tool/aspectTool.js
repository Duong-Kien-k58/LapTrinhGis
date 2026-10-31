// Nội dung và cách trình bày riêng của chức năng hướng dốc.
export const aspectTool = {
  operation: 'aspect',
  label: 'hướng dốc',
  title: 'Hướng dốc',
  units: [{ label: 'Độ (°)', value: 'degree' }],
  note: 'Aspect planar 3 × 3 · Bắc 0°, Đông 90°, Nam 180°, Tây 270° · Bằng phẳng −1 · Ô trung tâm và ít nhất 7 ô lân cận hợp lệ.',
  regionNote: 'Đã chọn vùng có cao độ hợp lệ, giữ các phần rời và lỗ NoData. Bỏ qua khối trống; tính hướng dốc với ô trung tâm hợp lệ và ít nhất 7 ô lân cận có dữ liệu.',

  summary(result, number) {
    return [
      ['Hướng trung bình vòng', result.mean_direction === null ? 'Không xác định' : `${number(result.mean_direction)}°`],
      ['Ô có hướng dốc', number(result.directional_cells)],
      ['Ô bằng phẳng', number(result.flat_cells)],
    ];
  },

  legend(item) {
    return `${item.name} (${item.label})`;
  },
};
