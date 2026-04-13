// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
/**
 * CORS-safe fetch wrapper
 *
 * 自动检测运行环境：
 * - Electron 桌面模式 → 直接使用原生 fetch()（None CORS 限制）
 * - 浏览器开Hair模式   → 通过 Vite 开Hair服务器 /__api_proxy?url=... 代理转Hair
 * - 浏览器生产模式   → 直接 fetch()（需后端/Nginx 提供反向代理）
 */

/** 检测是否在 Electron 环境中运行 */
function isElectron(): boolean {
  return !!(
    typeof window !== 'undefined' &&
    (window as any).electron
  );
}

/** 检测是否在 Vite 开Hair服务器中运行 */
function isViteDev(): boolean {
  return import.meta.env?.DEV === true;
}

/**
 * CORS 安全的 fetch 封装
 *
 * 在浏览器开Hair模式下，自动将请求代理到 Vite 开Hair服务器的
 * `/__api_proxy` 中间件，由服务端转Hair请求以绕过 CORS 限制。
 *
 * @param url    目标 URL（与原生 fetch 参数相同）
 * @param init   请求选项（与原生 fetch 参数相同）
 * @returns      Response（与原生 fetch Back值相同）
 */
export async function corsFetch(
  url: string | URL,
  init?: RequestInit,
): Promise<Response> {
  const targetUrl = url.toString();

  // Electron 或非开Hair环境：直连
  if (isElectron() || !isViteDev()) {
    return fetch(targetUrl, init);
  }

  // 浏览器开Hair模式：走 Vite 代理
  const proxyUrl = `/__api_proxy?url=${encodeURIComponent(targetUrl)}`;

  // 将原始 headers 序列化到 x-proxy-headers 头中
  // 这样代理中间件可以把它们转Hair给目标服务器
  const proxyHeaders = new Headers(init?.headers);

  // 把原始 headers 打包进一特殊头，代理端负责解包
  const originalHeaders: Record<string, string> = {};
  proxyHeaders.forEach((value, key) => {
    originalHeaders[key] = value;
  });

  const proxyInit: RequestInit = {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'x-proxy-headers': JSON.stringify(originalHeaders),
    },
  };

  return fetch(proxyUrl, proxyInit);
}
