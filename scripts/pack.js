/**
 * 生成 uTools 发布目录
 *
 * uTools 开发者工具「发布新版本」会把所选文件夹整体打包，且不允许包含 .git。
 * 本脚本按白名单把插件运行时文件复制到 release/，发布时在对话框中选择 release 文件夹即可。
 *
 * 用法：npm run pack
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'release');

/** 插件运行时需要的文件/目录（相对仓库根目录） */
const ENTRIES = [
  'plugin.json',
  'logo.png',
  'index.html',
  'overlay.html',
  'preload.js',
  'overlay-preload.js',
  'src'
];

/** 需要校验本地资源引用的页面 */
const PAGES = ['index.html', 'overlay.html'];

const failures = [];
const warnings = [];

function fail(message) {
  failures.push(message);
}

function warn(message) {
  warnings.push(message);
}

function walk(dir, visit) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    visit(full, entry);
    if (entry.isDirectory()) {
      walk(full, visit);
    }
  }
}

function copyEntries() {
  for (const entry of ENTRIES) {
    const from = path.join(ROOT, entry);
    if (!fs.existsSync(from)) {
      fail('缺少打包入口: ' + entry);
      continue;
    }
    const to = path.join(OUT, entry);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.cpSync(from, to, { recursive: true });
  }
}

function checkPluginJson() {
  let plugin;
  try {
    plugin = JSON.parse(fs.readFileSync(path.join(OUT, 'plugin.json'), 'utf8'));
  } catch (err) {
    fail('plugin.json 无法解析: ' + err.message);
    return;
  }
  for (const field of ['main', 'logo', 'preload']) {
    const value = plugin[field];
    if (!value) {
      if (field !== 'preload') {
        fail('plugin.json 缺少 ' + field);
      }
      continue;
    }
    if (!fs.existsSync(path.join(OUT, value))) {
      fail('plugin.json 的 ' + field + ' 指向的文件不在发布目录内: ' + value);
    }
  }
}

function checkPageRefs() {
  for (const page of PAGES) {
    const file = path.join(OUT, page);
    if (!fs.existsSync(file)) {
      fail('缺少页面: ' + page);
      continue;
    }
    const html = fs.readFileSync(file, 'utf8');
    const refs = [...html.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/g)].map((match) => match[1]);
    for (const ref of refs) {
      if (/^(?:https?:|data:|mailto:|#)/i.test(ref)) {
        continue;
      }
      const clean = ref.split(/[?#]/)[0];
      const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(page), clean));
      if (!fs.existsSync(path.join(OUT, resolved))) {
        fail(page + ' 引用了发布目录内不存在的文件: ' + ref);
      }
    }
  }
}

function checkPreloadRequires() {
  const file = path.join(OUT, 'preload.js');
  if (!fs.existsSync(file)) {
    return;
  }
  const source = fs.readFileSync(file, 'utf8');
  const requires = [...source.matchAll(/require\(\s*'(\.\/[^']+)'\s*\)/g)].map((match) => match[1]);
  for (const request of requires) {
    if (!fs.existsSync(path.join(OUT, request))) {
      fail('preload.js 依赖的本地文件不在发布目录内: ' + request);
    }
  }
}

function checkNoGit() {
  walk(OUT, (full, entry) => {
    if (entry.name === '.git') {
      fail('发布目录内包含 .git: ' + path.relative(ROOT, full));
    }
  });
}

function readVersion() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const html = fs.readFileSync(path.join(OUT, 'index.html'), 'utf8');
  const match = html.match(/class="about-version"[^>]*>\s*v?([\d.]+)/);
  if (match && match[1] !== pkg.version) {
    warn('关于页版本 v' + match[1] + ' 与 package.json ' + pkg.version + ' 不一致');
  }
  return pkg.version;
}

function summarize() {
  let files = 0;
  let bytes = 0;
  walk(OUT, (full, entry) => {
    if (entry.isFile()) {
      files += 1;
      bytes += fs.statSync(full).size;
    }
  });
  return { files, bytes };
}

function main() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  copyEntries();

  if (fs.existsSync(path.join(OUT, 'plugin.json'))) {
    checkPluginJson();
  }
  checkPageRefs();
  checkPreloadRequires();
  checkNoGit();

  const version = fs.existsSync(path.join(OUT, 'index.html')) ? readVersion() : 'unknown';
  const stats = summarize();

  console.log('发布目录: ' + path.relative(ROOT, OUT));
  console.log('版本号: ' + version + '（发布对话框请填同一版本）');
  console.log('文件数: ' + stats.files + '，体积: ' + (stats.bytes / 1024).toFixed(1) + ' KB');

  for (const message of warnings) {
    console.warn('警告: ' + message);
  }

  if (failures.length > 0) {
    for (const message of failures) {
      console.error('错误: ' + message);
    }
    console.error('打包检查未通过，共 ' + failures.length + ' 项错误。');
    process.exitCode = 1;
    return;
  }

  console.log('检查通过：可直接在 uTools 开发者工具「发布新版本」中选择 release 文件夹。');
}

main();
