/**
 * 智能记事本 - 主应用逻辑 v2
 * 新功能：提醒标记置顶、日期筛选、导入导出、到时闹钟提醒
 */

(function() {
  'use strict';

  /* ============================================
     IndexedDB 本地存储层
     ============================================ */
  class NoteDB {
    constructor() {
      this.dbName = 'SmartNotesDB';
      this.dbVersion = 2; // 升级版本支持新字段
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
            notesStore.createIndex('marked', 'marked', { unique: false }); // 新增：标记索引
            notesStore.createIndex('date', 'date', { unique: false }); // 新增：日期索引
          } else {
            // 版本升级：添加新索引
            const notesStore = e.target.transaction.objectStore('notes');
            if (!notesStore.indexNames.contains('marked')) {
              notesStore.createIndex('marked', 'marked', { unique: false });
            }
            if (!notesStore.indexNames.contains('date')) {
              notesStore.createIndex('date', 'date', { unique: false });
            }
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

    // 新增：按日期筛选
    async getNotesByDate(dateStr) {
      const allNotes = await this.getAllNotes();
      return allNotes.filter(note => {
        if (!note.createdAt) return false;
        const noteDate = new Date(note.createdAt).toLocaleDateString('zh-CN');
        return noteDate === dateStr;
      });
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

    // 新增：清空所有数据
    async clearAll() {
      return new Promise((resolve, reject) => {
        const tx = this.db.transaction('notes', 'readwrite');
        const store = tx.objectStore('notes');
        const request = store.clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    }

    // 新增：批量导入
    async importNotes(notes) {
      for (const note of notes) {
        // 移除id以避免冲突
        const noteData = { ...note };
        delete noteData.id;
        noteData.createdAt = note.createdAt || Date.now();
        noteData.updatedAt = Date.now();
        await this.addNote(noteData);
      }
    }
  }

  /* ============================================
     智能时间解析器
     支持格式：明天8点、后天下午3点、周五上午10点、2小时后等
     ============================================ */
  class TimeParser {
    constructor() {
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
        '周日': 0, '星期日': 0, '礼拜日': 0, '星期天': 0,
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

    parse(text) {
      const now = new Date();
      let parsedTime = null;
      let matchedText = '';

      // 1. 相对时间：X小时后、X分钟后
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

      // 3. 日期关键词 + 时间：明天8点
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
              targetDate.setHours(9, 0, 0, 0);
              parsedTime = targetDate;
              matchedText = keyword;
            }
            break;
          }
        }
      }

      // 4. 具体日期：1月15日
      if (!parsedTime) {
        const dateMatch = text.match(/(\d{1,2})[月月]\s*(\d{1,2})[号日]?/);
        if (dateMatch) {
          const month = parseInt(dateMatch[1]) - 1;
          const day = parseInt(dateMatch[2]);
          const targetDate = new Date(now.getFullYear(), month, day);
          
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
          matchedText = dateMatch[0];
        }
      }

      // 5. 单独时间：8点、下午3点半
      if (!parsedTime) {
        const periodTime = this.extractPeriodAndHour(text, '');
        if (periodTime) {
          const targetDate = new Date(now);
          targetDate.setHours(periodTime.hour, periodTime.minute || 0, 0, 0);
          
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

    extractPeriodAndHour(text, afterKeyword) {
      const searchStart = afterKeyword ? text.indexOf(afterKeyword) + afterKeyword.length : 0;
      const searchText = text.slice(searchStart);
      
      let hour = null;
      let minute = 0;
      let periodText = '';

      let period = null;
      for (const [keyword, range] of Object.entries(this.periodKeywords)) {
        if (searchText.includes(keyword)) {
          period = range;
          periodText = keyword;
          break;
        }
      }

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
        
        if (period && hour < 12 && period.start >= 12) {
          hour += 12;
        }
      }

      if (hour !== null && hour >= 0 && hour < 24) {
        return { hour, minute, text: periodText };
      }
      
      if (period) {
        return { hour: period.start, minute: 0, text: periodText };
      }
      
      return null;
    }

    getNextWeekday(now, targetWeekday) {
      const currentWeekday = now.getDay();
      let daysUntil = targetWeekday - currentWeekday;
      if (daysUntil <= 0) daysUntil += 7;
      const targetDate = new Date(now);
      targetDate.setDate(targetDate.getDate() + daysUntil);
      return targetDate;
    }

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
     提醒闹钟系统 - 到时响铃提醒
     ============================================ */
  class ReminderManager {
    constructor(db, app) {
      this.db = db;
      this.app = app;
      this.checkInterval = null;
      this.permissionGranted = false;
      this.activeReminders = new Map(); // 正在提醒的笔记
      this.audioContext = null;
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
      // 每10秒检查一次（更频繁的检查）
      this.checkInterval = setInterval(() => this.checkReminders(), 10000);
      this.checkReminders();
      
      // 页面可见时持续检查
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
          this.checkReminders();
        }
      });
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
        // 提醒时间到了（前后30秒内）
        if (note.reminderTime <= now + 30000 && note.reminderTime >= now - 30000) {
          if (!this.activeReminders.has(note.id)) {
            this.triggerReminder(note);
          }
        }
      }
    }

    triggerReminder(note) {
      this.activeReminders.set(note.id, true);
      
      // 播放提醒音
      this.playAlarmSound();
      
      // 显示通知
      if (this.permissionGranted) {
        const notification = new Notification('智能记事本提醒', {
          body: note.content,
          icon: '/icons/icon-192.svg',
          tag: `note-${note.id}`,
          requireInteraction: true,
          vibrate: [200, 100, 200, 100, 200], // 振动模式
        });
        
        notification.onclick = () => {
          window.focus();
          notification.close();
          this.stopAlarmSound();
          this.app.editNote(note.id);
        };
        
        notification.onclose = () => {
          this.stopAlarmSound();
        };
      }
      
      // 显示应用内提醒弹窗
      this.app.showReminderAlert(note);
      
      // 提醒后禁用
      note.reminderEnabled = false;
      note.reminderTriggered = true;
      this.db.updateNote(note);
      this.app.loadNotes();
    }

    // 播放闹钟音效
    playAlarmSound() {
      try {
        if (!this.audioContext) {
          this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        
        // 创建简单的提醒音
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);
        
        oscillator.frequency.value = 800;
        oscillator.type = 'sine';
        
        gainNode.gain.setValueAtTime(0.3, this.audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.5);
        
        oscillator.start(this.audioContext.currentTime);
        oscillator.stop(this.audioContext.currentTime + 0.5);
        
        // 循环播放
        this.alarmInterval = setInterval(() => {
          if (this.audioContext) {
            const osc = this.audioContext.createOscillator();
            const gain = this.audioContext.createGain();
            osc.connect(gain);
            gain.connect(this.audioContext.destination);
            osc.frequency.value = 800;
            osc.type = 'sine';
            gain.gain.setValueAtTime(0.3, this.audioContext.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.5);
            osc.start(this.audioContext.currentTime);
            osc.stop(this.audioContext.currentTime + 0.5);
          }
        }, 1000);
        
      } catch (e) {
        console.log('无法播放音效:', e);
      }
    }

    stopAlarmSound() {
      if (this.alarmInterval) {
        clearInterval(this.alarmInterval);
        this.alarmInterval = null;
      }
    }

    dismissReminder(noteId) {
      this.activeReminders.delete(noteId);
      this.stopAlarmSound();
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
      this.filterDate = null; // 日期筛选
      this.currentParsedTime = null;
      
      this.ui = {};
      this.init();
    }

    async init() {
      await this.cacheUIElements();
      await this.db.init();
      
      this.reminderManager = new ReminderManager(this.db, this);
      this.reminderManager.startChecking();
      
      await this.loadNotes();
      this.bindEvents();
      this.registerServiceWorker();
      this.initCalendar();
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
        dateFilterBtn: document.getElementById('dateFilterBtn'),
        calendarPanel: document.getElementById('calendarPanel'),
        calendarGrid: document.getElementById('calendarGrid'),
        calendarTitle: document.getElementById('calendarTitle'),
        prevMonthBtn: document.getElementById('prevMonthBtn'),
        nextMonthBtn: document.getElementById('nextMonthBtn'),
        closeCalendarBtn: document.getElementById('closeCalendarBtn'),
        clearDateFilterBtn: document.getElementById('clearDateFilterBtn'),
        addBtn: document.getElementById('addBtn'),
        moreBtn: document.getElementById('moreBtn'),
        morePanel: document.getElementById('morePanel'),
        exportBtn: document.getElementById('exportBtn'),
        importBtn: document.getElementById('importBtn'),
        importFile: document.getElementById('importFile'),
        closeMoreBtn: document.getElementById('closeMoreBtn'),
        editModal: document.getElementById('editModal'),
        modalTitle: document.getElementById('modalTitle'),
        noteContent: document.getElementById('noteContent'),
        parsedReminder: document.getElementById('parsedReminder'),
        reminderTime: document.getElementById('reminderTime'),
        toggleReminderBtn: document.getElementById('toggleReminderBtn'),
        toggleMarkBtn: document.getElementById('toggleMarkBtn'),
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
        reminderAlert: document.getElementById('reminderAlert'),
        reminderAlertContent: document.getElementById('reminderAlertContent'),
        dismissReminderBtn: document.getElementById('dismissReminderBtn'),
        viewReminderBtn: document.getElementById('viewReminderBtn'),
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
      
      // 日期筛选
      this.ui.dateFilterBtn.addEventListener('click', () => this.toggleCalendar(true));
      this.ui.closeCalendarBtn.addEventListener('click', () => this.toggleCalendar(false));
      this.ui.prevMonthBtn.addEventListener('click', () => this.changeMonth(-1));
      this.ui.nextMonthBtn.addEventListener('click', () => this.changeMonth(1));
      this.ui.clearDateFilterBtn.addEventListener('click', () => this.clearDateFilter());
      
      // 更多菜单（导入导出）
      this.ui.moreBtn.addEventListener('click', () => this.toggleMoreMenu(true));
      this.ui.closeMoreBtn.addEventListener('click', () => this.toggleMoreMenu(false));
      this.ui.exportBtn.addEventListener('click', () => this.exportNotes());
      this.ui.importBtn.addEventListener('click', () => this.ui.importFile.click());
      this.ui.importFile.addEventListener('change', (e) => this.importNotes(e));
      
      // 编辑弹窗
      this.ui.closeModalBtn.addEventListener('click', () => this.closeModal());
      this.ui.noteContent.addEventListener('input', () => this.parseContent());
      this.ui.toggleReminderBtn.addEventListener('click', () => this.toggleReminder());
      this.ui.toggleMarkBtn.addEventListener('click', () => this.toggleMark());
      this.ui.setCustomBtn.addEventListener('click', () => this.setCustomTime());
      this.ui.saveNoteBtn.addEventListener('click', () => this.saveNote());
      this.ui.deleteNoteBtn.addEventListener('click', () => this.deleteNote());
      
      // 点击遮罩关闭弹窗
      this.ui.editModal.querySelector('.modal-backdrop').addEventListener('click', () => this.closeModal());
      this.ui.calendarPanel.querySelector('.modal-backdrop').addEventListener('click', () => this.toggleCalendar(false));
      this.ui.morePanel.querySelector('.modal-backdrop').addEventListener('click', () => this.toggleMoreMenu(false));
      
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
      
      // 提醒弹窗
      this.ui.dismissReminderBtn.addEventListener('click', () => this.dismissCurrentReminder());
      this.ui.viewReminderBtn.addEventListener('click', () => this.viewCurrentReminder());
      
      // 列表点击
      this.ui.noteList.addEventListener('click', (e) => {
        const item = e.target.closest('.note-item');
        const markBtn = e.target.closest('.mark-btn');
        
        if (markBtn) {
          const id = parseInt(markBtn.dataset.id);
          this.toggleNoteMark(id);
        } else if (item) {
          const id = parseInt(item.dataset.id);
          this.editNote(id);
        }
      });
      
      // 键盘快捷键
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          if (!this.ui.editModal.classList.contains('hidden')) {
            this.closeModal();
          } else if (!this.ui.searchPanel.classList.contains('hidden')) {
            this.toggleSearch(false);
          } else if (!this.ui.calendarPanel.classList.contains('hidden')) {
            this.toggleCalendar(false);
          } else if (!this.ui.morePanel.classList.contains('hidden')) {
            this.toggleMoreMenu(false);
          }
        }
      });
    }

    async loadNotes() {
      if (this.filterDate) {
        this.notes = await this.db.getNotesByDate(this.filterDate);
      } else if (this.searchKeyword) {
        this.notes = await this.db.searchNotes(this.searchKeyword);
      } else {
        this.notes = await this.db.getAllNotes();
      }
      this.renderList();
    }

    renderList() {
      this.ui.emptyState.classList.toggle('hidden', this.notes.length > 0);
      this.ui.noteList.innerHTML = '';
      
      // 排序：标记的置顶，然后按创建时间倒序
      const sortedNotes = [...this.notes].sort((a, b) => {
        // 标记的优先
        if (a.marked && !b.marked) return -1;
        if (!a.marked && b.marked) return 1;
        // 然后按时间
        return (b.createdAt || 0) - (a.createdAt || 0);
      });
      
      sortedNotes.forEach(note => {
        const item = document.createElement('li');
        item.className = 'note-item';
        if (note.marked) item.classList.add('marked');
        item.dataset.id = note.id;
        
        const hasReminder = note.reminderEnabled && note.reminderTime;
        const reminderBadge = hasReminder && note.reminderTime > Date.now() 
          ? `<span class="reminder-badge">🔔 ${this.parser.formatDisplay(new Date(note.reminderTime))}</span>`
          : '';
        
        const markIcon = note.marked ? '⭐' : '☆';
        const markClass = note.marked ? 'marked' : '';
        
        item.innerHTML = `
          <button class="mark-btn ${markClass}" data-id="${note.id}">${markIcon}</button>
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

    // 切换笔记标记
    async toggleNoteMark(id) {
      const note = await this.db.getNote(id);
      note.marked = !note.marked;
      await this.db.updateNote(note);
      await this.loadNotes();
      this.showToast(note.marked ? '已标记置顶' : '已取消标记', 'success');
    }

    // 初始化日历
    initCalendar() {
      this.currentCalendarDate = new Date();
      this.renderCalendar();
    }

    renderCalendar() {
      const year = this.currentCalendarDate.getFullYear();
      const month = this.currentCalendarDate.getMonth();
      
      this.ui.calendarTitle.textContent = `${year}年${month + 1}月`;
      this.ui.calendarGrid.innerHTML = '';
      
      // 获取当月第一天和最后一天
      const firstDay = new Date(year, month, 1);
      const lastDay = new Date(year, month + 1, 0);
      const startWeekday = firstDay.getDay();
      
      // 添加星期标题
      const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
      weekdays.forEach(w => {
        const header = document.createElement('div');
        header.className = 'calendar-header';
        header.textContent = w;
        this.ui.calendarGrid.appendChild(header);
      });
      
      // 添加空白格子
      for (let i = 0; i < startWeekday; i++) {
        const empty = document.createElement('div');
        empty.className = 'calendar-day empty';
        this.ui.calendarGrid.appendChild(empty);
      }
      
      // 添加日期格子
      for (let day = 1; day <= lastDay.getDate(); day++) {
        const dayEl = document.createElement('div');
        dayEl.className = 'calendar-day';
        dayEl.textContent = day;
        
        const dateStr = new Date(year, month, day).toLocaleDateString('zh-CN');
        
        // 检查是否有笔记
        const hasNotes = this.notes.some(n => {
          if (!n.createdAt) return false;
          return new Date(n.createdAt).toLocaleDateString('zh-CN') === dateStr;
        });
        
        if (hasNotes) dayEl.classList.add('has-notes');
        
        // 当前筛选的日期高亮
        if (this.filterDate === dateStr) dayEl.classList.add('selected');
        
        // 今天高亮
        const today = new Date().toLocaleDateString('zh-CN');
        if (dateStr === today) dayEl.classList.add('today');
        
        dayEl.addEventListener('click', () => this.selectDate(dateStr));
        this.ui.calendarGrid.appendChild(dayEl);
      }
    }

    selectDate(dateStr) {
      this.filterDate = dateStr;
      this.ui.clearDateFilterBtn.classList.remove('hidden');
      // 显示日期筛选指示器
      const indicator = document.getElementById('dateFilterIndicator');
      const textEl = document.getElementById('filterDateText');
      if (indicator && textEl) {
        textEl.textContent = `筛选: ${dateStr}`;
        indicator.classList.remove('hidden');
      }
      this.toggleCalendar(false);
      this.loadNotes();
      this.showToast(`显示 ${dateStr} 的记录`, 'info');
    }

    clearDateFilter() {
      this.filterDate = null;
      this.ui.clearDateFilterBtn.classList.add('hidden');
      // 隐藏日期筛选指示器
      const indicator = document.getElementById('dateFilterIndicator');
      if (indicator) {
        indicator.classList.add('hidden');
      }
      this.loadNotes();
      this.renderCalendar();
    }

    changeMonth(delta) {
      this.currentCalendarDate.setMonth(this.currentCalendarDate.getMonth() + delta);
      this.renderCalendar();
    }

    toggleCalendar(show) {
      this.ui.calendarPanel.classList.toggle('hidden', !show);
      if (show) this.renderCalendar();
    }

    toggleMoreMenu(show) {
      this.ui.morePanel.classList.toggle('hidden', !show);
    }

    // 导出笔记
    async exportNotes() {
      const allNotes = await this.db.getAllNotes();
      const exportData = {
        version: 2,
        exportDate: new Date().toISOString(),
        notes: allNotes.map(n => ({
          content: n.content,
          createdAt: n.createdAt,
          reminderTime: n.reminderTime,
          reminderEnabled: n.reminderEnabled,
          marked: n.marked || false,
        }))
      };
      
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `智能记事本_${new Date().toLocaleDateString('zh-CN')}.json`;
      a.click();
      
      URL.revokeObjectURL(url);
      this.showToast('导出成功', 'success');
      this.toggleMoreMenu(false);
    }

    // 导入笔记
    async importNotes(e) {
      const file = e.target.files[0];
      if (!file) return;
      
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        
        if (!data.notes || !Array.isArray(data.notes)) {
          this.showToast('文件格式错误', 'error');
          return;
        }
        
        await this.db.importNotes(data.notes);
        await this.loadNotes();
        this.showToast(`成功导入 ${data.notes.length} 条记录`, 'success');
        this.toggleMoreMenu(false);
      } catch (err) {
        this.showToast('导入失败: ' + err.message, 'error');
      }
      
      e.target.value = '';
    }

    toggleSearch(show) {
      this.ui.searchPanel.classList.toggle('hidden', !show);
      if (show) this.ui.searchInput.focus();
      else {
        this.ui.searchInput.value = '';
        this.handleSearch('');
      }
    }

    async handleSearch(keyword) {
      this.searchKeyword = keyword;
      this.ui.clearSearchBtn.classList.toggle('hidden', !keyword);
      await this.loadNotes();
    }

    async openModal(noteId) {
      this.currentNoteId = noteId;
      this.currentParsedTime = null;
      
      if (noteId) {
        const note = this.notes.find(n => n.id === noteId) || await this.db.getNote(noteId);
        if (note) {
          this.ui.modalTitle.textContent = '编辑笔记';
          this.ui.noteContent.value = note.content;
          this.ui.deleteNoteBtn.classList.remove('hidden');
          
          if (note.reminderTime) {
            this.ui.reminderTime.textContent = this.parser.formatDisplay(new Date(note.reminderTime));
            this.ui.parsedReminder.classList.remove('hidden');
            this.ui.toggleReminderBtn.classList.toggle('active', note.reminderEnabled);
            this.ui.toggleReminderBtn.textContent = note.reminderEnabled ? '已启用' : '启用';
            this.currentParsedTime = note.reminderTime;
          } else {
            this.ui.parsedReminder.classList.add('hidden');
          }
          
          // 标记按钮
          this.ui.toggleMarkBtn.classList.toggle('active', note.marked);
          this.ui.toggleMarkBtn.textContent = note.marked ? '已标记' : '标记';
        }
      } else {
        this.ui.modalTitle.textContent = '新建笔记';
        this.ui.noteContent.value = '';
        this.ui.deleteNoteBtn.classList.add('hidden');
        this.ui.parsedReminder.classList.add('hidden');
        this.ui.toggleMarkBtn.classList.remove('active');
        this.ui.toggleMarkBtn.textContent = '标记';
      }
      
      this.ui.editModal.classList.remove('hidden');
      this.ui.noteContent.focus();
    }

    closeModal() {
      this.ui.editModal.classList.add('hidden');
      this.currentNoteId = null;
      this.currentParsedTime = null;
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

    toggleMark() {
      const isActive = this.ui.toggleMarkBtn.classList.toggle('active');
      this.ui.toggleMarkBtn.textContent = isActive ? '已标记' : '标记';
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
      const marked = this.ui.toggleMarkBtn.classList.contains('active');
      
      const noteData = {
        content,
        reminderTime: this.currentParsedTime,
        reminderEnabled,
        marked,
        updatedAt: Date.now(),
      };
      
      try {
        if (this.currentNoteId) {
          const existing = await this.db.getNote(this.currentNoteId);
          noteData.id = this.currentNoteId;
          noteData.createdAt = existing.createdAt;
          await this.db.updateNote(noteData);
          this.showToast('笔记已更新', 'success');
        } else {
          noteData.createdAt = Date.now();
          await this.db.addNote(noteData);
          this.showToast('笔记已保存', 'success');
        }
        
        await this.loadNotes();
        this.closeModal();
        
        if (reminderEnabled && !this.reminderManager.permissionGranted) {
          this.ui.reminderModal.classList.remove('hidden');
        }
      } catch (err) {
        this.showToast('保存失败：' + err.message, 'error');
      }
    }

    async deleteNote() {
      if (!this.currentNoteId) return;
      
      if (!confirm('确定删除这条笔记？')) return;
      
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

    // 显示提醒弹窗
    showReminderAlert(note) {
      this.currentReminderNote = note;
      this.ui.reminderAlertContent.textContent = note.content;
      this.ui.reminderAlert.classList.remove('hidden');
      
      // 振动（如果支持）
      if ('vibrate' in navigator) {
        navigator.vibrate([200, 100, 200, 100, 200]);
      }
    }

    dismissCurrentReminder() {
      if (this.currentReminderNote) {
        this.reminderManager.dismissReminder(this.currentReminderNote.id);
      }
      this.ui.reminderAlert.classList.add('hidden');
      this.currentReminderNote = null;
    }

    viewCurrentReminder() {
      if (this.currentReminderNote) {
        this.dismissCurrentReminder();
        this.editNote(this.currentReminderNote.id);
      }
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