import { existsSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findGeoServerLib, findJava } from './runtimePaths.js';

export const styleFolder = fileURLToPath(new URL('../../styleLayer/', import.meta.url));
const javaSource = fileURLToPath(new URL('./CompileStyles.java', import.meta.url));

export function compileLayerStyles(options = {}) {
  const libFolder = options.libFolder || process.env.GEOSERVER_LIB_DIR
    || findGeoServerLib();
  const jars = existsSync(libFolder) ? readdirSync(libFolder) : [];
  if (!jars.some(name => /^gt-css-.*\.jar$/.test(name)) || !jars.some(name => /^janino-.*\.jar$/.test(name))) {
    throw new Error('Không tìm thấy GeoServer CSS trong các thư mục cài phổ biến. Hãy cài CSS extension đúng phiên bản GeoServer. Nếu cài ở thư mục riêng, đặt GEOSERVER_LIB_DIR tới WEB-INF/lib.');
  }
  const java = options.java || process.env.STYLE_JAVA || findJava();
  const result = spawnSync(java, [
    '-Djava.awt.headless=true', '-Dfile.encoding=UTF-8', '-cp', path.join(libFolder, '*'),
    'org.codehaus.janino.SimpleCompiler', javaSource, 'CompileStyles', options.folder || styleFolder,
  ], { encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024, timeout: 60000 });
  if (result.error || result.status !== 0) {
    throw new Error(`Không chuyển được CSS trong styleLayer: ${result.error?.message || result.stderr.trim()}`);
  }
  const compiled = Object.fromEntries(result.stdout.trim().split(/\r?\n/).filter(Boolean).map(line => {
    const [name, encoded] = line.split('\t');
    if (!name?.endsWith('.css') || !encoded) throw new Error('Bộ chuyển CSS trả về dữ liệu không hợp lệ.');
    return [`styleLayer/${name}`, Buffer.from(encoded, 'base64').toString('utf8')];
  }));
  if (!Object.keys(compiled).length) throw new Error('Thư mục styleLayer chưa có file CSS.');
  return compiled;
}

export function layerStylesPlugin(options = {}) {
  const moduleId = 'virtual:layer-styles';
  const resolvedId = '\0' + moduleId;
  let compiled;
  return {
    name: 'local-layer-css',
    buildStart() { compiled = compileLayerStyles(options); },
    resolveId(id) { if (id === moduleId) return resolvedId; },
    load(id) { if (id === resolvedId) return `export default ${JSON.stringify(compiled)};`; },
    configureServer(server) {
      server.watcher.add(styleFolder);
      const refresh = file => {
        if (path.dirname(path.resolve(file)) !== path.resolve(styleFolder) || !file.endsWith('.css')) return;
        try {
          const updated = compileLayerStyles(options);
          compiled = updated;
          const module = server.moduleGraph.getModuleById(resolvedId);
          if (module) server.moduleGraph.invalidateModule(module);
          server.ws.send({ type: 'full-reload' });
        } catch (error) {
          server.config.logger.error(error.message);
          server.ws.send({ type: 'error', err: { message: error.message, stack: '' } });
        }
      };
      server.watcher.on('add', refresh).on('change', refresh).on('unlink', refresh);
    },
  };
}
