import path from 'node:path';
export function pathApi(p) {
  return /^[A-Za-z]:[\\/]/.test(p) || /^[\\/]{2}[^\\/]/.test(p) ? path.win32 : path.posix;
}
export function absolutePath(p) {
  return typeof p === 'string' && (/^[A-Za-z]:[\\/]/.test(p) || /^\\\\[^\\]+\\[^\\]+/.test(p) || p.startsWith('/'));
}
export function samePath(a, b) {
  if (pathApi(a) !== pathApi(b)) return false;
  const wa = wslParts(a), wb = wslParts(b);
  if (wa || wb) return !!wa && !!wb && wa.distro.toLowerCase() === wb.distro.toLowerCase() && wa.linux === wb.linux;
  return pathApi(a).relative(a, b) === '';
}
export function wslParts(p) {
  const match = /^(?:\\\\|\/\/)(?:wsl\.localhost|wsl\$)[\\/]([^\\/]+)([\\/].*)?$/i.exec(p);
  return match ? { distro: match[1], linux: (match[2] || '/').replaceAll('\\', '/') } : undefined;
}
export function hostPath(p, distro, platform = process.platform) {
  if (typeof p !== 'string' || /[\u0000\r\n]/.test(p)) throw new Error('文件夹路径无效。');
  if (platform !== 'win32') return p;
  if (p.startsWith('/') && !p.startsWith('//')) {
    if (!distro || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(distro)) throw new Error('添加 Linux 路径前，请填写 WSL 发行版名称，或直接使用完整的 WSL UNC 路径。');
    if (p.split('/').includes('..')) throw new Error('WSL 路径不能包含 ..。');
    return '\\\\wsl.localhost\\' + distro + path.posix.normalize(p).replaceAll('/', '\\');
  }
  const w = wslParts(p);
  if (w) {
    if (w.linux.split('/').includes('..')) throw new Error('WSL 路径不能包含 ..。');
    return '\\\\wsl.localhost\\' + w.distro + w.linux.replaceAll('/', '\\');
  }
  if (!path.win32.isAbsolute(p) || (!/^[A-Za-z]:[\\/]/.test(p) && !/^\\\\/.test(p))) throw new Error('请填写完整的绝对文件夹路径。');
  return p;
}
