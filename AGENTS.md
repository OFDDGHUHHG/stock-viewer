# 股票看盘应用 - 项目文档

## 项目概述

股票看盘是一款基于Web技术的股票行情查看应用，支持K线图、自选股管理、价格提醒等功能。

## 功能特性

### 核心功能
- 📈 **K线图**：日K、周K、月K三种周期，Canvas绘制
- 💹 **实时行情**：股票价格、涨跌幅实时更新
- ⭐ **自选股**：添加、删除、管理关注的股票
- 🔍 **股票搜索**：按代码或名称搜索
- 🔔 **价格提醒**：设置目标价格，触发时弹窗+通知

### 数据源
- 模拟数据（演示用）
- 东方财富API（非官方，可能不稳定）
- 新浪财经API（非官方，可能不稳定）

## 技术栈

- **前端**: 原生 JavaScript (ES6+)
- **图表**: Canvas 2D
- **存储**: IndexedDB
- **样式**: CSS3 (移动端优先)
- **PWA**: Service Worker + Web App Manifest
- **通知**: Web Notification API

## 目录结构

```
.
├── index.html          # 主HTML页面
├── manifest.json       # PWA应用配置
├── sw.js               # Service Worker (离线支持)
├── capacitor.config.json # Capacitor配置 (APK打包)
├── styles/
│   └── main.css        # 主样式文件
├── js/
│   └── app.js          # 主应用逻辑
└── icons/
    ├── icon-72.svg     # 应用图标
    ├── icon-192.svg
    └── icon-512.svg
```

## 使用说明

### 在浏览器中使用 (PWA)
1. 访问应用URL
2. 搜索添加感兴趣的股票到自选股
3. 点击股票查看K线图
4. 设置价格提醒，到价时会通知

### 添加到手机主屏幕
- **Android**: Chrome浏览器菜单 → "添加到主屏幕"
- **iOS**: Safari分享 → "添加到主屏幕"

## APK打包指南

### 方式一: GitHub Actions 自动构建

1. 将项目上传到GitHub仓库
2. 创建 `.github/workflows/build-apk.yml` 文件：

```yaml
name: Build Android APK

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install Capacitor
        run: |
          npm init -y
          npm install @capacitor/core @capacitor/cli @capacitor/android @capacitor/local-notifications
          npx cap init "股票看盘" "com.stockapp.viewer" --web-dir="./"
      
      - name: Add Android Platform
        run: npx cap add android
      
      - name: Copy Web Assets
        run: npx cap copy
      
      - name: Build APK
        uses: sparkfabrik/android-build-action@v1.2.0
        with:
          project-path: android
          output-path: app/build/outputs/apk/debug/app-debug.apk
      
      - name: Upload APK
        uses: actions/upload-artifact@v3
        with:
          name: stock-app-apk
          path: android/app/build/outputs/apk/debug/app-debug.apk
```

3. Push到GitHub，等待构建完成
4. 在Actions页面下载APK

### 方式二: Ionic Appflow (在线构建)
1. 注册 Ionic Appflow 账号: https://ionic.io/appflow
2. 连接GitHub仓库
3. 选择 Android Package 构建
4. 下载生成的 APK

### 方式三: 本地构建（需要Android环境）

```bash
# 1. 安装Node.js依赖
npm init -y
npm install @capacitor/core @capacitor/cli @capacitor/android @capacitor/local-notifications

# 2. 初始化Capacitor（已有配置文件可跳过）
npx cap init "股票看盘" "com.stockapp.viewer" --web-dir="./"

# 3. 添加Android平台
npx cap add android

# 4. 复制Web资源
npx cap copy

# 5. 打开Android Studio构建
npx cap open android
```

在Android Studio中:
- Build → Build Bundle(s) / APK(s) → Build APK(s)
- APK生成在 `android/app/build/outputs/apk/debug/`

## 注意事项

1. **API可用性**: 免费股票API可能不稳定或被限制，建议使用模拟数据演示
2. **通知权限**: 用户需要手动授权通知权限
3. **数据实时性**: Web应用只能通过浏览器通知，无法像原生App那样后台运行
4. **价格提醒**: 需要浏览器运行时才能检测价格触发提醒
5. **跨域问题**: 调用外部API可能遇到CORS限制

## 扩展建议

### 使用 Capacitor LocalNotifications 实现系统提醒

```javascript
import { LocalNotifications } from '@capacitor/local-notifications';

// 在价格触发时调用
async scheduleNotification(reminder, currentPrice) {
  await LocalNotifications.schedule({
    notifications: [{
      title: '股价提醒',
      body: `${reminder.name} 当前价格 ${currentPrice}`,
      id: reminder.id,
      sound: 'beep.mp3',
      channelId: 'price-alerts',
    }]
  });
}
```

需要在 `capacitor.config.json` 中配置:
```json
{
  "plugins": {
    "LocalNotifications": {
      "smallIcon": "ic_stat_alarm",
      "iconColor": "#1890ff"
    }
  }
}
```

## API接口说明

### 搜索股票
- 东方财富: `https://searchapi.eastmoney.com/bussiness/web/QuotationLabelSearch?keyword=茅台`
- 返回格式: JSON数组，包含代码、名称、市场

### 实时行情
- 新浪财经: `https://hq.sinajs.cn/list=sh600519`
- 返回格式: 字符串，需手动解析

### K线数据
- 东方财富: `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=1.600519&klt=101&lmt=60`
- 返回格式: JSON，包含日期、开、收、高、低、量