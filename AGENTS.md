# 智能记事本 - 项目文档 v2

## 项目概述

智能记事本是一款支持离线使用的笔记应用，能够自动解析文本中的时间信息并设置提醒。

## 新增功能

- ⭐ 标记功能：点击星星标记重要记录，标记后黄色高亮并置顶
- 📅 日期筛选：点击日历图标选择日期，显示当天所有记录
- 📥 导入导出：支持JSON格式导入导出所有记录
- 🔔 到时提醒：闹钟式提醒，到时间播放音效+振动+弹窗提醒

## 技术栈

- **前端框架**: 原生 JavaScript (ES6+)
- **本地存储**: IndexedDB (v2)
- **样式**: 纯 CSS (移动端优先)
- **PWA支持**: Service Worker + Web App Manifest
- **通知**: Web Notification API + AudioContext 音效

## 目录结构

```
.
├── index.html          # 主HTML页面
├── manifest.json       # PWA应用配置
├── sw.js               # Service Worker (离线支持)
├── capacitor.config.json # Capacitor配置 (用于打包APK)
├── styles/
│   └── main.css        # 主样式文件
├── js/
│   └── app.js          # 主应用逻辑
└── icons/
│   ├── icon-72.svg     # 应用图标
│   ├── icon-192.svg
│   └── icon-512.svg
```

## 功能模块

### 1. IndexedDB 存储 (`NoteDB` 类)
- 笔记增删改查
- 提醒队列管理
- 搜索功能
- 日期筛选
- 导入导出
- 标记索引（v2新增）

### 2. 时间解析器 (`TimeParser` 类)
支持解析以下格式：
- 相对时间: "2小时后"、"30分钟后"
- 日期关键词: "明天"、"后天"
- 星期: "周五"、"星期一"
- 时段: "上午"、"下午"、"晚上"
- 具体时间: "8点"、"下午3点半"
- 组合: "明天8点开会"、"周五下午3点"

### 3. 提醒闹钟系统 (`ReminderManager` 类)
- 每10秒检查提醒队列
- 到时播放音效（AudioContext）
- 振动提醒（Vibration API）
- 弹窗提醒界面
- Web Notification通知

### 4. 应用核心 (`App` 类)
- UI 状态管理
- 事件绑定
- 笔记列表渲染（标记置顶）
- 日历日期筛选
- 导入导出功能

## 使用说明

### 在浏览器中使用 (PWA)
1. 访问应用URL
2. 添加笔记时输入如 "明天8点开会"
3. 系统自动识别时间，点击"启用"开启提醒
4. 允许通知权限以接收提醒
5. 点击星星图标标记重要记录

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
          npm install @capacitor/core @capacitor/cli @capacitor/android
          npx cap init "智能记事本" "com.smartnotes.app" --web-dir="./"
      
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
          name: smart-notes-apk
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

# 2. 初始化Capacitor
npx cap init "智能记事本" "com.smartnotes.app" --web-dir="./"

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

## 系统闹钟扩展

Web应用使用浏览器通知+音效提醒。如需真正的系统闹钟，需要添加原生代码：

### 使用 Capacitor LocalNotifications

```javascript
// 在app.js中添加
import { LocalNotifications } from '@capacitor/local-notifications';

// 在ReminderManager.triggerReminder中调用
async scheduleSystemAlarm(note) {
  await LocalNotifications.schedule({
    notifications: [{
      title: '智能记事本提醒',
      body: note.content,
      id: note.id,
      schedule: { at: new Date(note.reminderTime) },
      sound: undefined, // 使用系统默认声音
      channelId: 'reminders',
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
      "iconColor": "#2563eb"
    }
  }
}
```

## 注意事项

1. **离线运行**: Service Worker 缓存所有静态资源，IndexedDB 存储数据
2. **通知权限**: 用户需要手动授权通知权限
3. **浏览器提醒**: 关闭浏览器后无法触发通知，建议打包为 APK
4. **数据安全**: 所有数据存储在本地，不上传服务器
5. **导入导出**: 导出为JSON文件，可跨设备迁移数据