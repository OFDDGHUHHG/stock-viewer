/**
 * 智能记事本 - 主应用逻辑
 * 功能：本地存储、智能提醒解析、笔记管理、通知系统
 */

(function() {
  'use strict';

  /* ============================================
     IndexedDB 本地存储层
     ============================================ */
  class NoteDB {
    constructor() {
      this.dbName = 'SmartNotesDB';
      this.dbVersion = 1;
      this.db = null;
    }

    async init() {
      return new Promise((resolve, reject) => {
        const request = indexedDB.open(this.dbName, this.dbVersion);
        
        request.onerror = () => reject(request.error);
        
        request.onupgradeneeded = (e) => {
          const db = e.target.result;
          // 笔记存储
          if (!db.objectStoreNames.contains('notes')) {
            const notesStore = db.createObjectStore('notes', { keyPath: 'id', autoIncrement: true });
            notesStore.createIndex('content', 'content', { unique: false });
            notesStore.createIndex('reminderTime', 'reminderTime', { unique: false });
            notesStore.createIndex('createdAt', 'createdAt', { unique: false });
          }
          // 提醒队列
          if (!db.objectStoreNames.contains('reminders')) {
            const reminderStore = db.createObjectStore('reminders', { keyPath: 'id' });
            reminderStore.createIndex('triggerTime', 'triggerTime', { unique: false });
          }
        };
        
        request.onsuccess = (e) => {
          this.db = e.target.result;
          resolve(this.db);
        };
      });
    }

    async addNote(note) {
      return new Promise((resolve, reject) => {
        const tx = this.db.transaction('notes', 'readwrite');
        const store = tx.objectStore('notes');
        const request = store.add(note);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }

    async updateNote(note) {
      return new Promise((resolve, reject) => {
        const tx = this.db.transaction('notes', 'readwrite');
        const store = tx.objectStore('notes');
        const request = store.put(note);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }

    async deleteNote(id) {
      return new Promise((resolve, reject) => {
        const tx = this.db.transaction('notes', 'readwrite');
        const store = tx.objectStore('notes');
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    }

    async getNote(id) {
      return new Promise((resolve, reject) => {
        const tx = this.db.transaction('notes', 'readonly');
        const store = tx.objectStore('notes');
        const request = store.get(id);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }

    async getAllNotes() {
      return new Promise((resolve, reject) => {
        const tx = this.db.transaction('notes', 'readonly');
        const store = tx.objectStore('notes');
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }

    async searchNotes(keyword) {
      const allNotes = await this.getAllNotes();
      const lower = keyword.toLowerCase();
      return allNotes.filter(note => 
        note.content.toLowerCase().includes(lower)
      );
    }

    async getPendingReminders() {
      return new Promise((resolve, reject) => {
        const tx = this.db.transaction('notes', 'readonly');
        const store = tx.objectStore('notes');
        const index = store.index('reminderTime');
        const request = index.getAll();
        request.onsuccess = () => {
          const now = Date.now();
          const pending = request.result.filter(n => 
            n.reminderTime && n.reminderEnabled && n.reminderTime > now
          );
          resolve(pending);
        };
        request.onerror = () => reject(request.error);
      });
    }
  }

  /* ============================================
     智能时间解析器
     支持格式：明天8点、后天下午3点、周五上午10点、2小时后等
     ============================================ */
  class TimeParser {
    constructor() {
      // 时间关键词映射
      this.dayKeywords = {
        '今天': 0,
        '明日': 1, '明天': 1,
        '后天': 2,
        '大后天': 3,
      };
      
      this.weekdayKeywords = {
        '周一': 1, '星期一': 1, '礼拜一': 1,
        '周二': 2, '星期二': 2, '礼拜二': 2,
        '周三': 3, '星期三': 3, '礼拜三': 3,
        '周四': 4, '星期四': 4, '礼拜四': 4,
        '周五': 5, '星期五': 5, '礼拜五': 5,
        '周六': 6, '星期六': 6, '礼拜六': 6,
        '周日': 0, '星期日': 0, '礼拜日': 0, '星期天': 0, '周日': 0,
      };

      this.periodKeywords = {
        '上午': { start: 8, end: 12 },
        '早上': { start: 6, end: 9 },
        '早晨': { start: 6, end: 9 },
        '中午': { start: 11, end: 14 },
        '下午': { start: 13, end: 18 },
        '傍晚': { start: 17, end: 19 },
        '晚上': { start: 18, end: 22 },
        '夜间': { start: 21, end: 24 },
        '深夜': { start: 0, end: 5 },
      };
    }

    /**
     * 从文本中解析时间
     * @param {string} text 输入文本
     * @returns {Object|null} { time: Date, text: 原始时间描述 } 或 null
     */
    parse(text) {
      const now = new Date();
      let parsedTime = null;
      let matchedText = '';

      // 1. 相对时间：X小时后、X分钟后、X秒后
      const relativeMatch = text.match(/(\d+)\s*(小时|分钟|秒)[之以]?后/);
      if (relativeMatch) {
        const amount = parseInt(relativeMatch[1]);
        const unit = relativeMatch[2];
        matchedText = relativeMatch[0];
        
        if (unit === '小时') {
          parsedTime = new Date(now.getTime() + amount * 3600 * 1000);
        } else if (unit === '分钟') {
          parsedTime = new Date(now.getTime() + amount * 60 * 1000);
        } else if (unit === '秒') {
          parsedTime = new Date(now.getTime() + amount * 1000);
        }
      }

      // 2. 星期 + 时间：周五下午3点
      if (!parsedTime) {
        for (const [keyword, weekday] of Object.entries(this.weekdayKeywords)) {
          if (text.includes(keyword)) {
            const targetDate = this.getNextWeekday(now, weekday);
            const periodTime = this.extractPeriodAndHour(text, keyword);
            
            if (periodTime) {
              targetDate.setHours(periodTime.hour, periodTime.minute || 0, 0, 0);
              parsedTime = targetDate;
              matchedText = keyword + (periodTime.text || '');
            }
            break;
          }
        }
      }

      // 3. 日期关键词 + 时间：明天8点、后天下午3点
      if (!parsedTime) {
        for (const [keyword, dayOffset] of Object.entries(this.dayKeywords)) {
          if (text.includes(keyword)) {
            const targetDate = new Date(now);
            targetDate.setDate(targetDate.getDate() + dayOffset);
            
            const periodTime = this.extractPeriodAndHour(text, keyword);
            if (periodTime) {
              targetDate.setHours(periodTime.hour, periodTime.minute || 0, 0, 0);
              parsedTime = targetDate;
              matchedText = keyword + (periodTime.text || '');
            } else {
              // 默认时间为当天9点
              targetDate.setHours(9, 0, 0, 0);
              parsedTime = targetDate;
              matchedText = keyword;
            }
            break;
          }
        }
      }

      // 4. 具体日期：1月15日、15号
      if (!parsedTime) {
        const dateMatch = text.match(/(\d{1,2})[月号日]\s*(\d{1,2})[号日日]?/);
        if (dateMatch) {
          const month = parseInt(dateMatch[1]) - 1;
          const day = parseInt(dateMatch[2]);
          const targetDate = new Date(now.getFullYear(), month, day);
          
          // 如果日期已过，设为明年
          if (targetDate < now) {
            targetDate.setFullYear(targetDate.getFullYear() + 1);
          }
          
          const periodTime = this.extractPeriodAndHour(text, dateMatch[0]);
          if (periodTime) {
            targetDate.setHours(periodTime.hour, periodTime.minute || 0, 0, 0);
          } else {
            targetDate.setHours(9, 0, 0, 0);
          }
          
          parsedTime = targetDate;
          matchedText = dateMatch[0] + (periodTime?.text || '');
        }
      }

      // 5. 单独时间：8点、下午3点半
      if (!parsedTime) {
        const periodTime = this.extractPeriodAndHour(text, '');
        if (periodTime) {
          const targetDate = new Date(now);
          targetDate.setHours(periodTime.hour, periodTime.minute || 0, 0, 0);
          
          // 如果时间已过，设为明天
          if (targetDate <= now) {
            targetDate.setDate(targetDate.getDate() + 1);
          }
          
          parsedTime = targetDate;
          matchedText = periodTime.text;
        }
      }

      if (parsedTime && parsedTime > now) {
        return {
          time: parsedTime,
          text: matchedText.trim(),
          display: this.formatDisplay(parsedTime)
        };
      }
      
      return null;
    }

    // 提取时间段和小时
    extractPeriodAndHour(text, afterKeyword) {
      const searchStart = afterKeyword ? text.indexOf(afterKeyword) + afterKeyword.length : 0;
      const searchText = text.slice(searchStart);
      
      let hour = null;
      let minute = 0;
      let periodText = '';

      // 匹配时间段
      let period = null;
      for (const [keyword, range] of Object.entries(this.periodKeywords)) {
        if (searchText.includes(keyword)) {
          period = range;
          periodText = keyword;
          break;
        }
      }

      // 匹配小时和分钟：8点、3点半、10点20
      const timeMatch = searchText.match(/(\d{1,2})[点时:：]\s*(\d{1,2}|半)?/);
      if (timeMatch) {
        hour = parseInt(timeMatch[1]);
        if (timeMatch[2]) {
          if (timeMatch[2] === '半') {
            minute = 30;
          } else {
            minute = parseInt(timeMatch[2]);
          }
        }
        periodText += timeMatch[0];
        
        // 根据时间段调整小时（下午3点 = 15点）
        if (period && hour < 12) {
          if (period.start >= 12) {
            hour += 12;
          }
        }
      }

      if (hour !== null && hour >= 0 && hour < 24) {
        return { hour, minute, text: periodText };
      }
      
      // 只有时间段没有具体时间，使用默认值
      if (period) {
        return { hour: period.start, minute: 0, text: periodText };
      }
      
      return null;
    }

    // 获取下一个指定星期几
    getNextWeekday(now, targetWeekday) {
      const currentWeekday = now.getDay();
      let daysUntil = targetWeekday - currentWeekday;
      if (daysUntil <= 0) {
        daysUntil += 7;
      }
      const targetDate = new Date(now);
      targetDate.setDate(targetDate.getDate() + daysUntil);
      return targetDate;
    }

    // 格式化显示时间
    formatDisplay(date) {
      const now = new Date();
      const diffDays = Math.floor((date - now) / (24 * 3600 * 1000));
      
      const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
      const hour = date.getHours();
      const minute = date.getMinutes();
      const timeStr = `${hour}:${minute.toString().padStart(2, '0')}`;
      
      let dayStr = '';
      if (diffDays === 0) dayStr = '今天';
      else if (diffDays === 1) dayStr = '明天';
      else if (diffDays === 2) dayStr = '后天';
      else dayStr = weekdays[date.getDay()];
      
      return `${dayStr} ${timeStr}`;
    }
  }

  /* ============================================
     提醒通知系统
     ============================================ */
  class ReminderManager {
    constructor(db) {
      this.db = db;
      this.checkInterval = null;
      this.permissionGranted = false;
    }

    async requestPermission() {
      if (!('Notification' in window)) {
        return false;
      }
      
      if (Notification.permission === 'granted') {
        this.permissionGranted = true;
        return true;
      }
      
      const result = await Notification.requestPermission();
      this.permissionGranted = result === 'granted';
      return this.permissionGranted;
    }

    startChecking() {
      // 每30秒检查一次待触发的提醒
      this.checkInterval = setInterval(() => this.checkReminders(), 30000);
      // 立即检查一次
      this.checkReminders();
    }

    stopChecking() {
      if (this.checkInterval) {
        clearInterval(this.checkInterval);
        this.checkInterval = null;
      }
    }

    async checkReminders() {
      const pending = await this.db.getPendingReminders();
      const now = Date.now();
      
      for (const note of pending) {
        // 提醒时间在当前时间前后5分钟内触发
        if (note.reminderTime <= now + 5 * 60 * 1000) {
          this.triggerReminder(note);
        }
      }
    }

    triggerReminder(note) {
      if (this.permissionGranted) {
        const notification = new Notification('智能记事本提醒', {
          body: note.content,
          icon: '/icons/icon-192.svg',
          tag: `note-${note.id}`,
          requireInteraction: true,
        });
        
        notification.onclick = () => {
          window.focus();
          notification.close();
          // 打开对应笔记
          if (window.app) {
            window.app.editNote(note.id);
          }
        };
      }
      
      // 发送后禁用提醒（避免重复）
      note.reminderEnabled = false;
      this.db.updateNote(note);
    }
  }

  /* ============================================
     主应用类
     ============================================ */
  class App {
    constructor() {
      this.db = new NoteDB();
      this.parser = new TimeParser();
      this.reminderManager = null;
      this.notes = [];
      this.currentNoteId = null;
      this.searchKeyword = '';
      
      // UI元素引用
      this.ui = {};
      
      this.init();
    }

    async init() {
      // 等待DOM加载
      await this.cacheUIElements();
      
      // 初始化数据库
      await this.db.init();
      
      // 初始化提醒系统
      this.reminderManager = new ReminderManager(this.db);
      this.reminderManager.startChecking();
      
      // 加载笔记
      await this.loadNotes();
      
      // 绑定事件
      this.bindEvents();
      
      // 注册Service Worker
      this.registerServiceWorker();
    }

    async cacheUIElements() {
      this.ui = {
        noteList: document.getElementById('noteList'),
        emptyState: document.getElementById('emptyState'),
        searchBtn: document.getElementById('searchBtn'),
        searchPanel: document.getElementById('searchPanel'),
        searchInput: document.getElementById('searchInput'),
        clearSearchBtn: document.getElementById('clearSearchBtn'),
        closeSearchBtn: document.getElementById('closeSearchBtn'),
        addBtn: document.getElementById('addBtn'),
        editModal: document.getElementById('editModal'),
        modalTitle: document.getElementById('modalTitle'),
        noteContent: document.getElementById('noteContent'),
        parsedReminder: document.getElementById('parsedReminder'),
        reminderTime: document.getElementById('reminderTime'),
        toggleReminderBtn: document.getElementById('toggleReminderBtn'),
        customTimeInput: document.getElementById('customTimeInput'),
        setCustomBtn: document.getElementById('setCustomBtn'),
        closeModalBtn: document.getElementById('closeModalBtn'),
        saveNoteBtn: document.getElementById('saveNoteBtn'),
        deleteNoteBtn: document.getElementById('deleteNoteBtn'),
        toast: document.getElementById('toast'),
        reminderModal: document.getElementById('reminderModal'),
        requestNotifyBtn: document.getElementById('requestNotifyBtn'),
        closeReminderModalBtn: document.getElementById('closeReminderModalBtn'),
        reminderList: document.getElementById('reminderList'),
      };
    }

    bindEvents() {
      // 添加按钮
      this.ui.addBtn.addEventListener('click', () => this.openModal(null));
      
      // 搜索
      this.ui.searchBtn.addEventListener('click', () => this.toggleSearch(true));
      this.ui.closeSearchBtn.addEventListener('click', () => this.toggleSearch(false));
      this.ui.searchInput.addEventListener('input', (e) => this.handleSearch(e.target.value));
      this.ui.clearSearchBtn.addEventListener('click', () => {
        this.ui.searchInput.value = '';
        this.handleSearch('');
      });
      
      // 编辑弹窗
      this.ui.closeModalBtn.addEventListener('click', () => this.closeModal());
      this.ui.noteContent.addEventListener('input', () => this.parseContent());
      this.ui.toggleReminderBtn.addEventListener('click', () => this.toggleReminder());
      this.ui.setCustomBtn.addEventListener('click', () => this.setCustomTime());
      this.ui.saveNoteBtn.addEventListener('click', () => this.saveNote());
      this.ui.deleteNoteBtn.addEventListener('click', () => this.deleteNote());
      
      // 点击遮罩关闭弹窗
      this.ui.editModal.querySelector('.modal-backdrop').addEventListener('click', () => this.closeModal());
      
      // 提醒权限
      this.ui.requestNotifyBtn.addEventListener('click', async () => {
        const granted = await this.reminderManager.requestPermission();
        if (granted) {
          this.showToast('通知权限已开启', 'success');
          this.ui.requestNotifyBtn.textContent = '已开启';
          this.ui.requestNotifyBtn.disabled = true;
        } else {
          this.showToast('通知权限被拒绝', 'error');
        }
      });
      this.ui.closeReminderModalBtn.addEventListener('click', () => {
        this.ui.reminderModal.classList.add('hidden');
      });
      
      // 监听列表项点击
      this.ui.noteList.addEventListener('click', (e) => {
        const item = e.target.closest('.note-item');
        if (item) {
          const id = parseInt(item.dataset.id);
          this.editNote(id);
        }
      });
      
      // 键盘快捷键
      document.addEventListener('keydown', (e) => {
        // Escape关闭弹窗
        if (e.key === 'Escape') {
          if (!this.ui.editModal.classList.contains('hidden')) {
            this.closeModal();
          } else if (!this.ui.searchPanel.classList.contains('hidden')) {
            this.toggleSearch(false);
          }
        }
      });
    }

    async loadNotes() {
      this.notes = await this.db.getAllNotes();
      this.renderList();
    }

    renderList() {
      // 显示/隐藏空状态
      this.ui.emptyState.classList.toggle('hidden', this.notes.length > 0);
      
      // 清空列表
      this.ui.noteList.innerHTML = '';
      
      // 按创建时间倒序排列
      const sortedNotes = [...this.notes].sort((a, b) => 
        (b.createdAt || 0) - (a.createdAt || 0)
      );
      
      // 渲染每个笔记
      sortedNotes.forEach(note => {
        const item = document.createElement('li');
        item.className = 'note-item';
        item.dataset.id = note.id;
        
        const hasReminder = note.reminderEnabled && note.reminderTime;
        const reminderBadge = hasReminder && note.reminderTime > Date.now() 
          ? `<span class="reminder-badge">🔔 ${this.parser.formatDisplay(new Date(note.reminderTime))}</span>`
          : '';
        
        item.innerHTML = `
          <div class="note-content">${this.escapeHtml(note.content)}</div>
          <div class="note-meta">
            <span class="note-time ${hasReminder ? 'has-reminder' : ''}">
              ${reminderBadge}
              ${this.formatDate(note.createdAt)}
            </span>
          </div>
        `;
        
        this.ui.noteList.appendChild(item);
      });
    }

    toggleSearch(show) {
      this.ui.searchPanel.classList.toggle('hidden', !show);
      if (show) {
        this.ui.searchInput.focus();
      } else {
        this.ui.searchInput.value = '';
        this.handleSearch('');
      }
    }

    async handleSearch(keyword) {
      this.searchKeyword = keyword;
      this.ui.clearSearchBtn.classList.toggle('hidden', !keyword);
      
      if (keyword) {
        this.notes = await this.db.searchNotes(keyword);
      } else {
        this.notes = await this.db.getAllNotes();
      }
      
      this.renderList();
    }

    openModal(noteId) {
      this.currentNoteId = noteId;
      
      if (noteId) {
        // 编辑现有笔记
        const note = this.notes.find(n => n.id === noteId);
        if (note) {
          this.ui.modalTitle.textContent = '编辑笔记';
          this.ui.noteContent.value = note.content;
          this.ui.deleteNoteBtn.classList.remove('hidden');
          
          // 显示现有提醒设置
          if (note.reminderTime) {
            this.ui.reminderTime.textContent = this.parser.formatDisplay(new Date(note.reminderTime));
            this.ui.parsedReminder.classList.remove('hidden');
            this.ui.toggleReminderBtn.classList.toggle('active', note.reminderEnabled);
            this.ui.toggleReminderBtn.textContent = note.reminderEnabled ? '已启用' : '启用';
          }
        }
      } else {
        // 新建笔记
        this.ui.modalTitle.textContent = '新建笔记';
        this.ui.noteContent.value = '';
        this.ui.deleteNoteBtn.classList.add('hidden');
        this.ui.parsedReminder.classList.add('hidden');
      }
      
      this.ui.editModal.classList.remove('hidden');
      this.ui.noteContent.focus();
    }

    closeModal() {
      this.ui.editModal.classList.add('hidden');
      this.currentNoteId = null;
      this.ui.noteContent.value = '';
      this.ui.parsedReminder.classList.add('hidden');
    }

    editNote(id) {
      this.openModal(id);
    }

    parseContent() {
      const content = this.ui.noteContent.value;
      const parsed = this.parser.parse(content);
      
      if (parsed) {
        this.ui.reminderTime.textContent = parsed.display;
        this.ui.parsedReminder.classList.remove('hidden');
        this.ui.toggleReminderBtn.classList.remove('active');
        this.ui.toggleReminderBtn.textContent = '启用';
        this.currentParsedTime = parsed.time.getTime();
      } else {
        this.ui.parsedReminder.classList.add('hidden');
        this.currentParsedTime = null;
      }
    }

    toggleReminder() {
      const isActive = this.ui.toggleReminderBtn.classList.toggle('active');
      this.ui.toggleReminderBtn.textContent = isActive ? '已启用' : '启用';
    }

    setCustomTime() {
      const input = this.ui.customTimeInput.value;
      if (input) {
        const customTime = new Date(input);
        if (customTime > new Date()) {
          this.currentParsedTime = customTime.getTime();
          this.ui.reminderTime.textContent = this.parser.formatDisplay(customTime);
          this.ui.parsedReminder.classList.remove('hidden');
          this.ui.toggleReminderBtn.classList.add('active');
          this.ui.toggleReminderBtn.textContent = '已启用';
          this.showToast('自定义时间已设置', 'success');
        } else {
          this.showToast('请选择未来的时间', 'error');
        }
      }
    }

    async saveNote() {
      const content = this.ui.noteContent.value.trim();
      if (!content) {
        this.showToast('请输入笔记内容', 'error');
        return;
      }
      
      const reminderEnabled = this.ui.toggleReminderBtn.classList.contains('active');
      
      const noteData = {
        content,
        reminderTime: this.currentParsedTime,
        reminderEnabled,
        updatedAt: Date.now(),
      };
      
      try {
        if (this.currentNoteId) {
          // 更新
          const existing = await this.db.getNote(this.currentNoteId);
          noteData.id = this.currentNoteId;
          noteData.createdAt = existing.createdAt;
          await this.db.updateNote(noteData);
          this.showToast('笔记已更新', 'success');
        } else {
          // 新建
          noteData.createdAt = Date.now();
          const newId = await this.db.addNote(noteData);
          this.showToast('笔记已保存', 'success');
        }
        
        await this.loadNotes();
        this.closeModal();
        
        // 如果设置了提醒，检查通知权限
        if (reminderEnabled && !this.reminderManager.permissionGranted) {
          this.ui.reminderModal.classList.remove('hidden');
        }
      } catch (err) {
        this.showToast('保存失败：' + err.message, 'error');
      }
    }

    async deleteNote() {
      if (!this.currentNoteId) return;
      
      try {
        await this.db.deleteNote(this.currentNoteId);
        this.showToast('笔记已删除', 'success');
        await this.loadNotes();
        this.closeModal();
      } catch (err) {
        this.showToast('删除失败：' + err.message, 'error');
      }
    }

    formatDate(timestamp) {
      if (!timestamp) return '';
      const date = new Date(timestamp);
      const now = new Date();
      const diffDays = Math.floor((now - date) / (24 * 3600 * 1000));
      
      if (diffDays === 0) {
        return '今天 ' + date.getHours() + ':' + date.getMinutes().toString().padStart(2, '0');
      } else if (diffDays === 1) {
        return '昨天';
      } else if (diffDays < 7) {
        return diffDays + '天前';
      } else {
        return date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
      }
    }

    escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    showToast(message, type = '') {
      this.ui.toast.textContent = message;
      this.ui.toast.className = 'toast ' + type;
      this.ui.toast.classList.remove('hidden');
      
      setTimeout(() => {
        this.ui.toast.classList.add('hidden');
      }, 2000);
    }

    async registerServiceWorker() {
      if ('serviceWorker' in navigator) {
        try {
          await navigator.serviceWorker.register('/sw.js');
        } catch (err) {
          console.log('Service Worker 注册失败:', err);
        }
      }
    }
  }

  // 启动应用
  window.app = new App();
})();