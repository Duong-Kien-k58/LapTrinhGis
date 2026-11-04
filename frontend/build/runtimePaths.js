import { existsSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

function directories(root) {
  try { return readdirSync(root, { withFileTypes: true }).filter(item => item.isDirectory()).map(item => path.join(root, item.name)); }
  catch { return []; }
}

function installRoots() {
  return [...new Set([
    process.env.ProgramW6432 || 'C:/Program Files',
    process.env.ProgramFiles || 'C:/Program Files',
    process.env['ProgramFiles(x86)'] || 'C:/Program Files (x86)',
    ...(process.env.LOCALAPPDATA ? [path.join(process.env.LOCALAPPDATA, 'Programs')] : []),
    'C:/', 'D:/', 'E:/',
  ])];
}

export function findGeoServerLib(roots = installRoots()) {
  const homes = [process.env.GEOSERVER_HOME, ...roots.flatMap(root => directories(root).filter(folder => /geoserver|tomcat/i.test(path.basename(folder))))].filter(Boolean);
  for (const home of homes) {
    for (const relative of ['webapps/geoserver/WEB-INF/lib', 'geoserver/WEB-INF/lib', 'WEB-INF/lib']) {
      const folder = path.join(home, relative);
      let jars;
      try { jars = readdirSync(folder); } catch { continue; }
      if (jars.some(name => /^gt-css-.*\.jar$/.test(name)) && jars.some(name => /^janino-.*\.jar$/.test(name))) return folder;
    }
  }
  return '';
}

export function findJava() {
  const homes = [process.env.JAVA_HOME, process.env.JRE_HOME, process.env.GEOSERVER_HOME].filter(Boolean);
  for (const root of installRoots()) {
    for (const home of directories(root).filter(folder => /java|jdk|jre|adoptium|adoptopenjdk|temurin|geoserver/i.test(path.basename(folder)))) {
      homes.push(home, ...directories(home));
    }
  }
  const candidates = ['java', ...homes.flatMap(home => ['bin/java.exe', 'jre/bin/java.exe'].map(relative => path.join(home, relative)))];
  for (const candidate of candidates) {
    if (candidate !== 'java' && !existsSync(candidate)) continue;
    const result = spawnSync(candidate, ['-version'], { windowsHide: true, timeout: 5000, stdio: 'ignore' });
    if (!result.error && result.status === 0) return candidate;
  }
  throw new Error('Không tìm thấy Java. Hãy cài Java tương thích với GeoServer rồi khởi động lại frontend.');
}
