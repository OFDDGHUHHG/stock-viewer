/**
 * Service Worker - 离线缓存支持
 */

const CACHE_NAME = 'smart-notes-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/styles/main.css',
  '/js/app.js',
  '/manifest.json',
  '/icons/icon-72.svg',
  '/icons/icon-192.svg',
  '/icons/icon-512.svg',
];

// 安装事件 - 缓存静态资源
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// 激活事件 - 清理旧缓存
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => {
        return Promise.all(
          keys.filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        );
      })
      .then(() => self.clients.claim())
  );
});

// 请求拦截 - 缓存优先策略
self.addEventListener('fetch', (event) => {
  // 只缓存GET请求
  if (event.request.method !== 'GET') return;
  
  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) => {
        // 有缓存则返回缓存
        if (cachedResponse) {
          return cachedResponse;
        }
        
        // 无缓存则从网络获取并缓存
        return fetch(event.request)
          .then((response) => {
            // 只缓存成功响应
            if (response.status === 200) {
              const responseClone = response.clone();
              caches.open(CACHE_NAME)
                .then((cache) => cache.put(event.request, responseClone));
            }
            return response;
          })
          .catch(() => {
            // 网络失败时返回离线页面
            if (event.request.mode === 'navigate') {
              return caches.match('/');
            }
            return new Response('离线状态', { status: 503 });
          });
      })
  );
});

// 监听通知点击
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window' })
      .then((clientList) => {
        // 如果已有窗口则聚焦
        for (const client of clientList) {
          if (client.url === '/' && 'focus' in client) {
            return client.focus();
          }
        }
        // 否则打开新窗口
        if (clients.openWindow) {
          return clients.openWindow('/');
        }
      })
  );
});