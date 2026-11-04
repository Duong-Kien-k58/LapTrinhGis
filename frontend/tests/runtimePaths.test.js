import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { findGeoServerLib } from '../build/runtimePaths.js';

test('discovers versioned GeoServer with CSS; skips incomplete installs', context => {
  const root = mkdtempSync(path.join(tmpdir(), 'webgis-runtime-'));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  for (const name of ['GeoServer', 'GeoServer 2.28']) {
    const lib = path.join(root, name, 'webapps/geoserver/WEB-INF/lib');
    mkdirSync(lib, { recursive: true });
    writeFileSync(path.join(lib, 'gt-css-34.jar'), '');
    if (name !== 'GeoServer') writeFileSync(path.join(lib, 'janino-3.jar'), '');
  }
  const saved = process.env.GEOSERVER_HOME;
  delete process.env.GEOSERVER_HOME;
  context.after(() => { if (saved === undefined) delete process.env.GEOSERVER_HOME; else process.env.GEOSERVER_HOME = saved; });
  assert.equal(findGeoServerLib([root]), path.join(root, 'GeoServer 2.28', 'webapps/geoserver/WEB-INF/lib'));
  assert.equal(findGeoServerLib([]), '');
});
