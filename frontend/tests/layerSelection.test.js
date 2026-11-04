import test from 'node:test';
import assert from 'node:assert/strict';
import { selectCatalogLayers } from '../src/tool/layerCatalogTool.js';

const orderedLayers = ['a', 'b', 'c', 'd', 'e'];
const select = options => selectCatalogLayers({ orderedLayers, selected: new Set(), anchor: null, ...options });

test('click thường chọn riêng một lớp; Ctrl thêm và bỏ chọn từng lớp', () => {
  let result = select({ layer: 'b' });
  result = select({ ...result, layer: 'd', toggle: true });
  assert.deepEqual([...result.selected], ['b', 'd']);
  result = select({ ...result, layer: 'b', toggle: true });
  assert.deepEqual([...result.selected], ['d']);
  result = select({ ...result, layer: 'c' });
  assert.deepEqual([...result.selected], ['c']);
});

test('Shift chọn dải cả hai chiều và giữ điểm neo khi đổi đầu dải', () => {
  let result = select({ layer: 'd' });
  result = select({ ...result, layer: 'b', range: true });
  assert.deepEqual([...result.selected], ['b', 'c', 'd']);
  assert.equal(result.anchor, 'd');
  result = select({ ...result, layer: 'e', range: true });
  assert.deepEqual([...result.selected], ['d', 'e']);
});

test('Ctrl+Shift bổ sung dải, không bỏ các lớp đã chọn ngoài dải', () => {
  const previous = new Set(['a', 'c']);
  const result = select({ selected: previous, anchor: 'c', layer: 'e', toggle: true, range: true });
  assert.deepEqual([...result.selected], ['a', 'c', 'd', 'e']);
  assert.deepEqual([...previous], ['a', 'c']);
});

test('điểm neo bị ẩn hoặc bị xóa: Shift chọn lớp hiện tại và đặt neo mới', () => {
  const result = select({ selected: new Set(['a']), anchor: 'removed', layer: 'c', range: true });
  assert.deepEqual([...result.selected], ['c']);
  assert.equal(result.anchor, 'c');
});
