import test from 'node:test';
import assert from 'node:assert/strict';
import { migrateDemCatalogState } from '../src/tool/layerCatalogTool.js';
import { RASTER_LAYER_CONFIGS, LAYER_GROUP_CONFIGS } from '../src/config/layers.js';

test('bố cục raster cũ được giữ nguyên, không tạo nhóm riêng', () => {
  const state = {
    groups: { raster: ['vn25k', 'dem_vietnam', 'custom_photo'], terrain: ['diemdocao'] },
    groupOrder: ['terrain', 'raster'],
    visibility: { layers: { dem_vietnam: true, vn25k: false } },
  };
  migrateDemCatalogState(state);
  assert.equal(state.groups.dem, undefined);
  assert.deepEqual(state.groups.raster, ['vn25k', 'dem_vietnam', 'custom_photo']);
  assert.deepEqual(state.groupOrder, ['terrain', 'raster']);
  assert.deepEqual(state.groups.terrain, ['diemdocao']);
  assert.deepEqual(state.visibility.layers, { dem_vietnam: true, vn25k: false });
});

test('gộp nhóm DEM cũ vào Raster không mất lớp hay lặp nhóm', () => {
  const state = { groups: { dem: ['dem_vietnam', 'custom_grid'], raster: ['dem_vietnam', 'vn25k'] }, groupOrder: ['dem', 'raster'] };
  migrateDemCatalogState(state);
  migrateDemCatalogState(state);
  assert.deepEqual(state, { groups: { raster: ['dem_vietnam', 'vn25k', 'custom_grid'] }, groupOrder: ['raster'] });
  assert.deepEqual(migrateDemCatalogState({}), {});
});

test('mọi raster thuộc chung một nhóm và một loại dữ liệu', () => {
  const groups = new Map(LAYER_GROUP_CONFIGS.map(group => [group.id, group]));
  const ids = new Set();
  const names = new Set();
  for (const layer of RASTER_LAYER_CONFIGS) {
    assert.equal(groups.get(layer.group)?.kind, 'raster');
    assert.ok(!ids.has(layer.id), `ID trùng: ${layer.id}`);
    assert.ok(!names.has(layer.layerName), `Layer name trùng: ${layer.layerName}`);
    ids.add(layer.id);
    names.add(layer.layerName);
    assert.equal(layer.presentation_type, 'raster');
    assert.equal(layer.group, 'raster');
  }
  assert.equal(groups.has('dem'), false);
  assert.equal(groups.get('raster').title, 'Dữ liệu raster');
});
