# 智能记事本 - 项目文档

## 项目概述

智能记事本是一款支持离线使用的笔记应用，能够自动解析文本中的时间信息并设置提醒。

## 技术栈

- **前端框架**: 原生 JavaScript (ES6+)
- **本地存储**: IndexedDB
- **样式**: 纯 CSS (移动端优先)
- **PWA支持**: Service Worker + Web App Manifest

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

### 2. 时间解析器 (`TimeParser` 类)
支持解析以下格式：
- 相对时间: "2小时后"、"30分钟后"
- 日期关键词: "明天"、"后天"
- 星期: "周五"、"星期一"
- 时段: "上午"、"下午"、"晚上"
- 具体时间: "8点"、"下午3点半"
- 组合: "明天8点开会"、"周五下午3点"

### 3. 提醒管理 (`ReminderManager` 类)
- Web Notification API
- 定时检查提醒队列
- 提醒触发后推送通知

### 4. 应用核心 (`App` 类)
- UI 状态管理
- 事件绑定
- 笔记列表渲染
- 弹窗交互

## 使用说明

### 在浏览器中使用 (PWA)
1. 访问应用URL
2. 添加笔记时输入如 "明天8点开会"
3. 系统自动识别时间，可启用提醒
4. 允许通知权限以接收提醒

### 添加到手机主屏幕
- **Android**: Chrome浏览器菜单 → "添加到主屏幕"
- **iOS**: Safari分享 → "添加到主屏幕"

## APK打包指南

### 方式一: Capacitor (推荐)

```bash
# 1. 安装依赖
npm install @capacitor/core @capacitor/cli @capacitor/android @capacitor/local-notifications

# 2. 初始化Capacitor
npx cap init "智能记事本" "com.smartnotes.app" --web-dir="./"

# 3. 添加Android平台
npx cap add android

# 4. 复制Web资源
npx cap copy

# 5. 打开Android项目进行构建
npx cap open android
```

在Android Studio中:
- Build → Build Bundle(s) / APK(s) → Build APK(s)
- APK生成在 `android/app/build/outputs/apk/debug/`

### 方式二: Ionic Appflow (在线构建)
1. 注册 Ionic Appflow 账号
2. 上传项目代码
3. 选择 Android Package 构建
4. 下载生成的 APK

## 系统闹钟扩展

Web应用只能使用浏览器通知，无法设置真正的系统闹钟。如需系统闹钟功能，需要添加原生代码:

### Android扩展 (使用 Capacitor Plugin)

```javascript
// 在app.js中添加
import { LocalNotifications } from '@capacitor/local-notifications';

async function scheduleAlarm(note) {
  await LocalNotifications.schedule({
    notifications: [{
      title: '智能记事本提醒',
      body: note.content,
      id: note.id,
      schedule: { at: new Date(note.reminderTime) },
      sound: 'alarm_sound.mp3',
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
      "iconColor": "#2563eb",
      "sound": "alarm_sound.mp3"
    }
  }
}
```

## 注意事项

1. **离线运行**: Service Worker 缓存所有静态资源，IndexedDB 存储数据
2. **通知权限**: 用户需要手动授权通知权限
3. **浏览器限制**: 关闭浏览器后无法触发通知，建议打包为 APK
4. **数据安全**: 所有数据存储在本地，不上传服务器