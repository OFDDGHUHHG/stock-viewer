/**
 * 股票应用核心逻辑
 * 功能：自选股管理、K线图、实时行情、搜索、价格提醒
 */

// ==================== 常量定义 ====================
const DB_NAME = 'StockAppDB';
const DB_VERSION = 1;
const STORE_NAME = 'favorites';
const REMINDER_STORE = 'reminders';

// 模拟股票数据（演示用）
const MOCK_STOCKS = [
  { code: '600519', name: '贵州茅台', market: 'sh', price: 1688.00, change: 12.50, changePercent: 0.74 },
  { code: '000858', name: '五粮液', market: 'sz', price: 156.32, change: -2.18, changePercent: -1.38 },
  { code: '600036', name: '招商银行', market: 'sh', price: 32.45, change: 0.35, changePercent: 1.08 },
  { code: '000001', name: '平安银行', market: 'sz', price: 11.28, change: -0.15, changePercent: -1.31 },
  { code: '601318', name: '中国平安', market: 'sh', price: 45.68, change: 1.23, changePercent: 2.71 },
  { code: '000333', name: '美的集团', market: 'sz', price: 58.90, change: 0.82, changePercent: 1.41 },
  { code: '002594', name: '比亚迪', market: 'sz', price: 245.60, change: 8.35, changePercent: 3.51 },
  { code: '300750', name: '宁德时代', market: 'sz', price: 178.45, change: -5.62, changePercent: -3.03 },
  { code: 'AAPL', name: '苹果', market: 'us', price: 178.72, change: 2.35, changePercent: 1.32 },
  { code: 'TSLA', name: '特斯拉', market: 'us', price: 245.80, change: -8.45, changePercent: -3.32 },
];

// 生成模拟K线数据
function generateKlineData(basePrice, days = 60) {
  const data = [];
  let price = basePrice;
  const now = new Date();
  
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    
    // 随机波动
    const volatility = 0.03;
    const change = (Math.random() - 0.5) * 2 * volatility;
    const open = price;
    const close = price * (1 + change);
    const high = Math.max(open, close) * (1 + Math.random() * 0.01);
    const low = Math.min(open, close) * (1 - Math.random() * 0.01);
    const volume = Math.floor(Math.random() * 10000000 + 1000000);
    
    data.push({
      date: date.toISOString().split('T')[0],
      open: Math.round(open * 100) / 100,
      close: Math.round(close * 100) / 100,
      high: Math.round(high * 100) / 100,
      low: Math.round(low * 100) / 100,
      volume
    });
    
    price = close;
  }
  
  return data;
}

// ==================== IndexedDB 存储 ====================
class StockDB {
  constructor() {
    this.db = null;
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };
      
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        
        // 自选股存储
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'code' });
        }
        
        // 提醒存储
        if (!db.objectStoreNames.contains(REMINDER_STORE)) {
          const store = db.createObjectStore(REMINDER_STORE, { keyPath: 'id' });
          store.createIndex('code', 'code', { unique: false });
        }
      };
    });
  }

  async getAllFavorites() {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async addFavorite(stock) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.put(stock);
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async removeFavorite(code) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(code);
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async isFavorite(code) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(code);
      
      request.onsuccess = () => resolve(request.result !== undefined);
      request.onerror = () => reject(request.error);
    });
  }

  async getAllReminders() {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(REMINDER_STORE, 'readonly');
      const store = tx.objectStore(REMINDER_STORE);
      const request = store.getAll();
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async addReminder(reminder) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(REMINDER_STORE, 'readwrite');
      const store = tx.objectStore(REMINDER_STORE);
      reminder.id = Date.now();
      const request = store.put(reminder);
      
      request.onsuccess = () => resolve(reminder);
      request.onerror = () => reject(request.error);
    });
  }

  async removeReminder(id) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(REMINDER_STORE, 'readwrite');
      const store = tx.objectStore(REMINDER_STORE);
      const request = store.delete(id);
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}

// ==================== 股票数据API ====================
class StockAPI {
  constructor() {
    this.useMockData = true; // 默认使用模拟数据
    this.apiType = 'mock'; // 'mock', 'sina', 'eastmoney'
  }

  // 搜索股票
  async searchStocks(keyword) {
    if (this.useMockData) {
      return MOCK_STOCKS.filter(s => 
        s.code.includes(keyword) || s.name.includes(keyword)
      );
    }
    
    // 真实API搜索（需用户自行测试可用性）
    try {
      // 东方财富搜索API
      const url = `https://searchapi.eastmoney.com/bussiness/web/QuotationLabelSearch?keyword=${encodeURIComponent(keyword)}&type=`;
      const response = await fetch(url);
      const data = await response.json();
      return data.Data?.map(item => ({
        code: item.Code,
        name: item.Name,
        market: item.Market === 1 ? 'sh' : 'sz'
      })) || [];
    } catch (e) {
      console.error('搜索失败，使用模拟数据:', e);
      return MOCK_STOCKS.filter(s => 
        s.code.includes(keyword) || s.name.includes(keyword)
      );
    }
  }

  // 获取实时行情
  async getQuote(code, market) {
    if (this.useMockData) {
      const stock = MOCK_STOCKS.find(s => s.code === code);
      if (stock) {
        // 添加随机波动模拟实时更新
        const volatility = 0.001;
        const change = (Math.random() - 0.5) * 2 * volatility * stock.price;
        return {
          ...stock,
          price: Math.round((stock.price + change) * 100) / 100,
          time: new Date().toLocaleTimeString()
        };
      }
      return null;
    }

    // 新浪财经API（非官方，可能不稳定）
    try {
      const symbol = market === 'us' ? code : `${market}${code}`;
      const url = `https://hq.sinajs.cn/list=${symbol}`;
      const response = await fetch(url);
      const text = await response.text();
      
      // 解析返回数据
      const match = text.match(/="([^"]+)"/);
      if (match) {
        const parts = match[1].split(',');
        if (parts.length > 30) {
          return {
            code,
            name: parts[0],
            price: parseFloat(parts[3]),
            open: parseFloat(parts[1]),
            high: parseFloat(parts[4]),
            low: parseFloat(parts[5]),
            volume: parseInt(parts[8]),
            change: parseFloat(parts[3]) - parseFloat(parts[2]),
            changePercent: ((parseFloat(parts[3]) - parseFloat(parts[2])) / parseFloat(parts[2]) * 100).toFixed(2),
            time: parts[31]
          };
        }
      }
      return null;
    } catch (e) {
      console.error('获取行情失败:', e);
      return null;
    }
  }

  // 获取K线数据
  async getKlineData(code, market, period = 'day') {
    if (this.useMockData) {
      const stock = MOCK_STOCKS.find(s => s.code === code);
      if (stock) {
        return generateKlineData(stock.price, 60);
      }
      return generateKlineData(100, 60);
    }

    // 东方财富K线API
    try {
      const secid = market === 'us' ? `105.${code}` : (market === 'sh' ? `1.${code}` : `0.${code}`);
      const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secid}&fields1=f1,f2,f3,f4,f5&fields2=f51,f52,f53,f54,f55,f56,f57&klt=${period === 'day' ? 101 : period === 'week' ? 102 : 103}&fqt=1&end=20500101&lmt=60`;
      
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.data?.klines) {
        return data.data.klines.map(line => {
          const parts = line.split(',');
          return {
            date: parts[0],
            open: parseFloat(parts[1]),
            close: parseFloat(parts[2]),
            high: parseFloat(parts[3]),
            low: parseFloat(parts[4]),
            volume: parseInt(parts[5]),
            turnover: parseFloat(parts[6])
          };
        });
      }
      return null;
    } catch (e) {
      console.error('获取K线失败，使用模拟数据:', e);
      const stock = MOCK_STOCKS.find(s => s.code === code);
      return generateKlineData(stock?.price || 100, 60);
    }
  }

  // 切换数据源
  setDataSource(type) {
    this.apiType = type;
    this.useMockData = type === 'mock';
  }
}

// ==================== K线图绘制引擎 ====================
class KlineChart {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.data = [];
    this.options = {
      upColor: '#f54545',    // 上涨红色
      downColor: '#0f0f0f',  // 下跌黑色（或绿色）
      gridColor: '#e0e0e0',
      textColor: '#666',
      bgColor: '#fff',
      showVolume: true,
      showMA: true,
      maLines: [5, 10, 20]
    };
    this.viewport = {
      startIndex: 0,
      endIndex: 60,
      candleWidth: 8
    };
    this.selectedCandle = null;
    
    this.resize();
    window.addEventListener('resize', () => this.resize());
    
    // 绑定交互事件
    this.bindEvents();
  }

  resize() {
    const container = this.canvas.parentElement;
    const rect = container.getBoundingClientRect();
    
    // 设置canvas实际像素大小
    this.canvas.width = rect.width * window.devicePixelRatio;
    this.canvas.height = rect.height * window.devicePixelRatio;
    
    // 设置CSS显示大小
    this.canvas.style.width = rect.width + 'px';
    this.canvas.style.height = rect.height + 'px';
    
    this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    
    this.width = rect.width;
    this.height = rect.height;
    
    if (this.data.length > 0) {
      this.draw();
    }
  }

  setData(data) {
    this.data = data;
    this.viewport.endIndex = Math.min(data.length, 60);
    this.viewport.startIndex = Math.max(0, this.viewport.endIndex - 60);
    this.draw();
  }

  bindEvents() {
    // 触摸/鼠标移动显示详情
    this.canvas.addEventListener('mousemove', (e) => this.handleMove(e));
    this.canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      this.handleMove({ clientX: touch.clientX, clientY: touch.clientY });
    });
    
    // 滚动/滑动切换视图
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.handleScroll(e.deltaY > 0 ? 1 : -1);
    });
    
    let touchStartX = 0;
    this.canvas.addEventListener('touchstart', (e) => {
      touchStartX = e.touches[0].clientX;
    });
    this.canvas.addEventListener('touchend', (e) => {
      const touchEndX = e.changedTouches[0].clientX;
      const delta = touchStartX - touchEndX;
      if (Math.abs(delta) > 30) {
        this.handleScroll(delta > 0 ? 5 : -5);
      }
    });
  }

  handleMove(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // 计算对应的蜡烛索引
    const chartWidth = this.width - 60;
    const candleCount = this.viewport.endIndex - this.viewport.startIndex;
    const candleWidth = chartWidth / candleCount;
    const index = Math.floor(x / candleWidth) + this.viewport.startIndex;
    
    if (index >= 0 && index < this.data.length) {
      this.selectedCandle = this.data[index];
      this.draw();
      this.showTooltip(this.selectedCandle, x, y);
    }
  }

  handleScroll(delta) {
    const newIndex = this.viewport.startIndex + delta;
    const maxStart = this.data.length - 20;
    
    if (newIndex >= 0 && newIndex <= maxStart) {
      this.viewport.startIndex = newIndex;
      this.viewport.endIndex = newIndex + Math.min(60, this.data.length - newIndex);
      this.draw();
    }
  }

  draw() {
    const ctx = this.ctx;
    const { width, height } = this;
    
    // 清空画布
    ctx.fillStyle = this.options.bgColor;
    ctx.fillRect(0, 0, width, height);
    
    if (this.data.length === 0) {
      ctx.fillStyle = '#999';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('暂无数据', width / 2, height / 2);
      return;
    }
    
    const dataSlice = this.data.slice(this.viewport.startIndex, this.viewport.endIndex);
    
    // 计算价格范围
    const prices = dataSlice.flatMap(d => [d.high, d.low]);
    let minPrice = Math.min(...prices);
    let maxPrice = Math.max(...prices);
    const priceRange = maxPrice - minPrice;
    const padding = priceRange * 0.1;
    minPrice -= padding;
    maxPrice += padding;
    
    // 绘制区域划分
    const priceAreaHeight = height * 0.7;
    const volumeAreaHeight = height * 0.2;
    const infoAreaHeight = height * 0.1;
    
    // 绘制网格
    this.drawGrid(ctx, minPrice, maxPrice, priceAreaHeight, volumeAreaHeight);
    
    // 绘制K线蜡烛
    this.drawCandles(ctx, dataSlice, minPrice, maxPrice, priceAreaHeight);
    
    // 绘制成交量
    if (this.options.showVolume) {
      this.drawVolume(ctx, dataSlice, volumeAreaHeight, priceAreaHeight);
    }
    
    // 绘制均线
    if (this.options.showMA) {
      this.drawMA(ctx, dataSlice, minPrice, maxPrice, priceAreaHeight);
    }
    
    // 绘制选中高亮
    if (this.selectedCandle) {
      this.drawHighlight(ctx, this.selectedCandle, minPrice, maxPrice, priceAreaHeight);
    }
  }

  drawGrid(ctx, minPrice, maxPrice, priceHeight, volumeHeight) {
    const { width, height } = this;
    const chartWidth = width - 60;
    
    ctx.strokeStyle = this.options.gridColor;
    ctx.lineWidth = 0.5;
    
    // 价格区域网格线
    for (let i = 0; i <= 4; i++) {
      const y = i * priceHeight / 4;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(chartWidth, y);
      ctx.stroke();
      
      // 价格标签
      const price = maxPrice - (maxPrice - minPrice) * i / 4;
      ctx.fillStyle = this.options.textColor;
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(price.toFixed(2), width - 5, y + 10);
    }
    
    // 分割线
    ctx.beginPath();
    ctx.moveTo(0, priceHeight);
    ctx.lineTo(chartWidth, priceHeight);
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  drawCandles(ctx, data, minPrice, maxPrice, priceHeight) {
    const { width } = this;
    const chartWidth = width - 60;
    const candleCount = data.length;
    const candleWidth = chartWidth / candleCount;
    const candleBodyWidth = candleWidth * 0.7;
    
    const priceScale = priceHeight / (maxPrice - minPrice);
    
    data.forEach((candle, i) => {
      const x = i * candleWidth + candleWidth / 2;
      const isUp = candle.close >= candle.open;
      const color = isUp ? this.options.upColor : this.options.downColor;
      
      // 计算Y坐标
      const openY = priceHeight - (candle.open - minPrice) * priceScale;
      const closeY = priceHeight - (candle.close - minPrice) * priceScale;
      const highY = priceHeight - (candle.high - minPrice) * priceScale;
      const lowY = priceHeight - (candle.low - minPrice) * priceScale;
      
      // 绘制影线
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, highY);
      ctx.lineTo(x, lowY);
      ctx.stroke();
      
      // 绘制实体
      ctx.fillStyle = color;
      const bodyTop = Math.min(openY, closeY);
      const bodyHeight = Math.abs(closeY - openY) || 1;
      ctx.fillRect(x - candleBodyWidth / 2, bodyTop, candleBodyWidth, bodyHeight);
    });
  }

  drawVolume(ctx, data, volumeHeight, priceHeight) {
    const { width } = this;
    const chartWidth = width - 60;
    const candleCount = data.length;
    const candleWidth = chartWidth / candleCount;
    const barWidth = candleWidth * 0.7;
    
    const volumes = data.map(d => d.volume);
    const maxVolume = Math.max(...volumes);
    const volumeScale = volumeHeight / maxVolume;
    
    const volumeStartY = priceHeight + 5;
    
    data.forEach((candle, i) => {
      const x = i * candleWidth + candleWidth / 2;
      const isUp = candle.close >= candle.open;
      const color = isUp ? this.options.upColor : this.options.downColor;
      
      const barHeight = candle.volume * volumeScale;
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.5;
      ctx.fillRect(x - barWidth / 2, volumeStartY + volumeHeight - barHeight, barWidth, barHeight);
      ctx.globalAlpha = 1;
    });
  }

  drawMA(ctx, data, minPrice, maxPrice, priceHeight) {
    const { width } = this;
    const chartWidth = width - 60;
    const candleCount = data.length;
    const candleWidth = chartWidth / candleCount;
    
    const priceScale = priceHeight / (maxPrice - minPrice);
    const maColors = ['#ff6b6b', '#4ecdc4', '#45b7d1'];
    
    this.options.maLines.forEach((maPeriod, maIndex) => {
      // 计算均线数据
      const maData = [];
      for (let i = 0; i < data.length; i++) {
        if (i >= maPeriod - 1) {
          const sum = data.slice(i - maPeriod + 1, i + 1).reduce((a, b) => a + b.close, 0);
          maData.push(sum / maPeriod);
        } else {
          maData.push(null);
        }
      }
      
      // 绘制均线
      ctx.strokeStyle = maColors[maIndex];
      ctx.lineWidth = 1;
      ctx.beginPath();
      
      let started = false;
      maData.forEach((ma, i) => {
        if (ma !== null) {
          const x = i * candleWidth + candleWidth / 2;
          const y = priceHeight - (ma - minPrice) * priceScale;
          
          if (!started) {
            ctx.moveTo(x, y);
            started = true;
          } else {
            ctx.lineTo(x, y);
          }
        }
      });
      
      ctx.stroke();
      
      // 均线标签
      const lastMa = maData[maData.length - 1];
      if (lastMa) {
        ctx.fillStyle = maColors[maIndex];
        ctx.font = '10px sans-serif';
        ctx.fillText(`MA${maPeriod}:${lastMa.toFixed(2)}`, chartWidth + 5, 20 + maIndex * 12);
      }
    });
  }

  drawHighlight(ctx, candle, minPrice, maxPrice, priceHeight) {
    const index = this.data.indexOf(candle);
    if (index < this.viewport.startIndex || index >= this.viewport.endIndex) return;
    
    const { width } = this;
    const chartWidth = width - 60;
    const dataSlice = this.data.slice(this.viewport.startIndex, this.viewport.endIndex);
    const candleIndex = index - this.viewport.startIndex;
    const candleWidth = chartWidth / dataSlice.length;
    
    const x = candleIndex * candleWidth + candleWidth / 2;
    
    // 高亮竖线
    ctx.strokeStyle = '#1890ff';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, priceHeight);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  showTooltip(candle, x, y) {
    const tooltip = document.getElementById('klineTooltip');
    if (!tooltip) return;
    
    const isUp = candle.close >= candle.open;
    const change = (candle.close - candle.open).toFixed(2);
    const changePercent = ((candle.close - candle.open) / candle.open * 100).toFixed(2);
    
    tooltip.innerHTML = `
      <div class="tooltip-date">${candle.date}</div>
      <div>开: ${candle.open.toFixed(2)} 高: ${candle.high.toFixed(2)}</div>
      <div>收: ${candle.close.toFixed(2)} 低: ${candle.low.toFixed(2)}</div>
      <div class="tooltip-change ${isUp ? 'up' : 'down'}">
        涨跌: ${isUp ? '+' : ''}${change} (${isUp ? '+' : ''}${changePercent}%)
      </div>
      <div>成交量: ${(candle.volume / 10000).toFixed(0)}万</div>
    `;
    tooltip.style.display = 'block';
  }
}

// ==================== 应用主类 ====================
class StockApp {
  constructor() {
    this.db = new StockDB();
    this.api = new StockAPI();
    this.chart = null;
    this.currentStock = null;
    this.favorites = [];
    this.reminders = [];
    this.updateTimer = null;
    
    this.init();
  }

  async init() {
    try {
      // 初始化数据库
      await this.db.init();
      
      // 加载自选股
      this.favorites = await this.db.getAllFavorites();
      
      // 初始化K线图
      this.chart = new KlineChart('klineCanvas');
      
      // 绑定事件
      this.bindEvents();
      
      // 渲染自选股列表
      this.renderFavorites();
      
      // 请求通知权限
      this.requestNotificationPermission();
      
      // 开始价格提醒检查
      this.startReminderCheck();
      
      // 如果有自选股，显示第一个
      if (this.favorites.length > 0) {
        this.showStock(this.favorites[0]);
      } else {
        // 显示演示股票
        this.showStock(MOCK_STOCKS[0]);
      }
      
      // 开始实时更新
      this.startRealtimeUpdate();
      
      console.log('股票应用初始化完成');
    } catch (e) {
      console.error('初始化失败:', e);
    }
  }

  bindEvents() {
    // 搜索输入
    const searchInput = document.getElementById('searchInput');
    searchInput.addEventListener('input', (e) => this.handleSearch(e.target.value));
    searchInput.addEventListener('focus', () => {
      document.getElementById('searchResults').style.display = 'block';
    });
    
    // 点击其他地方隐藏搜索结果
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.search-box')) {
        document.getElementById('searchResults').style.display = 'none';
      }
    });
    
    // 添加自选股按钮
    document.getElementById('addFavoriteBtn').addEventListener('click', () => {
      if (this.currentStock) {
        this.toggleFavorite(this.currentStock);
      }
    });
    
    // 设置提醒按钮
    document.getElementById('setReminderBtn').addEventListener('click', () => {
      if (this.currentStock) {
        this.showReminderModal(this.currentStock);
      }
    });
    
    // K线周期切换
    document.querySelectorAll('.period-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.changePeriod(btn.dataset.period);
      });
    });
    
    // 数据源切换
    document.getElementById('dataSourceSelect').addEventListener('change', (e) => {
      this.api.setDataSource(e.target.value);
      if (this.currentStock) {
        this.refreshCurrentStock();
      }
    });
    
    // 提醒弹窗确认
    document.getElementById('reminderConfirmBtn').addEventListener('click', () => {
      this.saveReminder();
    });
    
    document.getElementById('reminderCancelBtn').addEventListener('click', () => {
      document.getElementById('reminderModal').style.display = 'none';
    });
    
    // 提醒列表关闭
    document.getElementById('closeReminderListBtn').addEventListener('click', () => {
      document.getElementById('reminderListModal').style.display = 'none';
    });
    
    // 查看提醒列表按钮
    document.getElementById('viewRemindersBtn').addEventListener('click', () => {
      this.showReminderList();
    });
  }

  handleSearch(keyword) {
    if (!keyword || keyword.length < 1) {
      document.getElementById('searchResults').innerHTML = '';
      return;
    }
    
    this.api.searchStocks(keyword).then(results => {
      this.renderSearchResults(results);
    });
  }

  renderSearchResults(results) {
    const container = document.getElementById('searchResults');
    
    if (results.length === 0) {
      container.innerHTML = '<div class="search-empty">未找到相关股票</div>';
      return;
    }
    
    container.innerHTML = results.map(stock => `
      <div class="search-item" data-code="${stock.code}" data-market="${stock.market || 'sh'}">
        <span class="stock-code">${stock.code}</span>
        <span class="stock-name">${stock.name}</span>
        ${stock.price ? `<span class="stock-price ${stock.change >= 0 ? 'up' : 'down'}">${stock.price.toFixed(2)}</span>` : ''}
      </div>
    `).join('');
    
    // 绑定点击事件
    container.querySelectorAll('.search-item').forEach(item => {
      item.addEventListener('click', () => {
        const code = item.dataset.code;
        const market = item.dataset.market;
        const stock = results.find(s => s.code === code);
        this.showStock(stock);
        container.style.display = 'none';
        document.getElementById('searchInput').value = '';
      });
    });
  }

  async showStock(stock) {
    this.currentStock = stock;
    
    // 更新顶部信息
    this.updateStockInfo(stock);
    
    // 获取K线数据
    const klineData = await this.api.getKlineData(stock.code, stock.market);
    if (klineData) {
      this.chart.setData(klineData);
    }
    
    // 更新收藏按钮状态
    const isFav = await this.db.isFavorite(stock.code);
    document.getElementById('addFavoriteBtn').classList.toggle('favorited', isFav);
    document.getElementById('addFavoriteBtn').textContent = isFav ? '已添加' : '+自选';
    
    // 隐藏tooltip
    document.getElementById('klineTooltip').style.display = 'none';
  }

  updateStockInfo(stock) {
    const infoEl = document.getElementById('stockInfo');
    const isUp = stock.change >= 0;
    
    infoEl.innerHTML = `
      <div class="stock-header">
        <span class="stock-name-large">${stock.name}</span>
        <span class="stock-code-large">${stock.code}</span>
      </div>
      <div class="price-info ${isUp ? 'up' : 'down'}">
        <span class="current-price">${stock.price?.toFixed(2) || '--'}</span>
        <span class="price-change">${isUp ? '+' : ''}${stock.change?.toFixed(2) || '--'}</span>
        <span class="price-percent">${isUp ? '+' : ''}${stock.changePercent?.toFixed(2) || '--'}%</span>
      </div>
    `;
  }

  async refreshCurrentStock() {
    if (!this.currentStock) return;
    
    const quote = await this.api.getQuote(this.currentStock.code, this.currentStock.market);
    if (quote) {
      this.currentStock = quote;
      this.updateStockInfo(quote);
    }
  }

  async toggleFavorite(stock) {
    const isFav = await this.db.isFavorite(stock.code);
    
    if (isFav) {
      await this.db.removeFavorite(stock.code);
      this.favorites = this.favorites.filter(f => f.code !== stock.code);
    } else {
      await this.db.addFavorite({
        code: stock.code,
        name: stock.name,
        market: stock.market,
        addTime: Date.now()
      });
      this.favorites.push({
        code: stock.code,
        name: stock.name,
        market: stock.market
      });
    }
    
    this.renderFavorites();
    
    const nowFav = await this.db.isFavorite(stock.code);
    document.getElementById('addFavoriteBtn').classList.toggle('favorited', nowFav);
    document.getElementById('addFavoriteBtn').textContent = nowFav ? '已添加' : '+自选';
  }

  renderFavorites() {
    const container = document.getElementById('favoriteList');
    
    if (this.favorites.length === 0) {
      container.innerHTML = '<div class="empty-tip">暂无自选股，搜索添加</div>';
      return;
    }
    
    container.innerHTML = this.favorites.map(stock => `
      <div class="favorite-item" data-code="${stock.code}">
        <div class="fav-info">
          <span class="fav-name">${stock.name}</span>
          <span class="fav-code">${stock.code}</span>
        </div>
        <div class="fav-price loading">--</div>
        <button class="remove-btn" data-code="${stock.code}">删除</button>
      </div>
    `).join('');
    
    // 绑定点击事件
    container.querySelectorAll('.favorite-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.classList.contains('remove-btn')) {
          const code = e.target.dataset.code;
          this.removeFavorite(code);
        } else {
          const code = item.dataset.code;
          const stock = this.favorites.find(s => s.code === code);
          if (stock) {
            this.showStock(stock);
          }
        }
      });
    });
    
    // 更新价格
    this.updateFavoritesPrices();
  }

  async updateFavoritesPrices() {
    for (const stock of this.favorites) {
      const quote = await this.api.getQuote(stock.code, stock.market);
      if (quote) {
        const item = document.querySelector(`.favorite-item[data-code="${stock.code}"] .fav-price`);
        if (item) {
          item.classList.remove('loading');
          item.classList.add(quote.change >= 0 ? 'up' : 'down');
          item.innerHTML = `
            <span>${quote.price.toFixed(2)}</span>
            <span>${quote.change >= 0 ? '+' : ''}${quote.changePercent}%</span>
          `;
        }
      }
    }
  }

  async removeFavorite(code) {
    await this.db.removeFavorite(code);
    this.favorites = this.favorites.filter(f => f.code !== code);
    this.renderFavorites();
    
    if (this.currentStock?.code === code) {
      document.getElementById('addFavoriteBtn').classList.remove('favorited');
      document.getElementById('addFavoriteBtn').textContent = '+自选';
    }
  }

  changePeriod(period) {
    if (this.currentStock) {
      this.api.getKlineData(this.currentStock.code, this.currentStock.market, period)
        .then(data => {
          if (data) this.chart.setData(data);
        });
    }
  }

  startRealtimeUpdate() {
    // 每5秒更新一次行情
    this.updateTimer = setInterval(() => {
      this.refreshCurrentStock();
      this.updateFavoritesPrices();
    }, 5000);
  }

  stopRealtimeUpdate() {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = null;
    }
  }

  // ==================== 价格提醒功能 ====================
  showReminderModal(stock) {
    const modal = document.getElementById('reminderModal');
    const currentPrice = stock.price || 100;
    
    document.getElementById('reminderStockName').textContent = stock.name;
    document.getElementById('reminderStockCode').textContent = stock.code;
    document.getElementById('reminderTargetPrice').value = currentPrice.toFixed(2);
    document.getElementById('reminderType').value = 'above';
    
    // 设置价格范围提示
    document.getElementById('priceRangeTip').textContent = 
      `当前价格: ${currentPrice.toFixed(2)}，设置目标价格`;
    
    modal.style.display = 'flex';
  }

  async saveReminder() {
    const targetPrice = parseFloat(document.getElementById('reminderTargetPrice').value);
    const type = document.getElementById('reminderType').value;
    const note = document.getElementById('reminderNote').value;
    
    if (!targetPrice || targetPrice <= 0) {
      alert('请输入有效的目标价格');
      return;
    }
    
    const reminder = {
      code: this.currentStock.code,
      name: this.currentStock.name,
      market: this.currentStock.market,
      targetPrice,
      type, // 'above' 或 'below'
      note,
      currentPrice: this.currentStock.price,
      created: Date.now(),
      triggered: false
    };
    
    await this.db.addReminder(reminder);
    this.reminders.push(reminder);
    
    document.getElementById('reminderModal').style.display = 'none';
    
    alert(`提醒已设置！当 ${this.currentStock.name} 价格${type === 'above' ? '高于' : '低于'} ${targetPrice.toFixed(2)} 时将通知您。`);
  }

  async showReminderList() {
    this.reminders = await this.db.getAllReminders();
    const container = document.getElementById('reminderListContent');
    
    if (this.reminders.length === 0) {
      container.innerHTML = '<div class="empty-tip">暂无价格提醒</div>';
    } else {
      container.innerHTML = this.reminders.map(r => `
        <div class="reminder-item ${r.triggered ? 'triggered' : ''}">
          <div class="reminder-info">
            <span class="reminder-name">${r.name}</span>
            <span class="reminder-condition">
              ${r.type === 'above' ? '高于' : '低于'} ${r.targetPrice.toFixed(2)}
            </span>
            ${r.triggered ? '<span class="triggered-tag">已触发</span>' : ''}
          </div>
          <button class="remove-reminder-btn" data-id="${r.id}">删除</button>
        </div>
      `).join('');
      
      // 绑定删除事件
      container.querySelectorAll('.remove-reminder-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = parseInt(btn.dataset.id);
          await this.db.removeReminder(id);
          this.reminders = this.reminders.filter(r => r.id !== id);
          this.showReminderList();
        });
      });
    }
    
    document.getElementById('reminderListModal').style.display = 'flex';
  }

  startReminderCheck() {
    // 每10秒检查提醒
    setInterval(() => this.checkReminders(), 10000);
  }

  async checkReminders() {
    this.reminders = await this.db.getAllReminders();
    
    for (const reminder of this.reminders) {
      if (reminder.triggered) continue;
      
      const quote = await this.api.getQuote(reminder.code, reminder.market);
      if (!quote) continue;
      
      const shouldTrigger = reminder.type === 'above' 
        ? quote.price >= reminder.targetPrice
        : quote.price <= reminder.targetPrice;
      
      if (shouldTrigger) {
        this.triggerReminder(reminder, quote.price);
      }
    }
  }

  async triggerReminder(reminder, currentPrice) {
    reminder.triggered = true;
    await this.db.addReminder(reminder);
    
    const title = '股价提醒';
    const body = `${reminder.name}(${reminder.code}) 当前价格 ${currentPrice.toFixed(2)}，已${reminder.type === 'above' ? '高于' : '低于'}目标价 ${reminder.targetPrice.toFixed(2)}`;
    
    // 显示弹窗提醒
    this.showPriceAlert(reminder, currentPrice);
    
    // 发送通知
    this.sendNotification(title, body);
    
    // 播放提示音
    this.playAlertSound();
  }

  showPriceAlert(reminder, currentPrice) {
    const alertEl = document.getElementById('priceAlert');
    document.getElementById('alertTitle').textContent = '价格提醒触发！';
    document.getElementById('alertContent').innerHTML = `
      <div class="alert-stock">${reminder.name} (${reminder.code})</div>
      <div class="alert-price">当前价格: <strong>${currentPrice.toFixed(2)}</strong></div>
      <div class="alert-target">目标价格: ${reminder.targetPrice.toFixed(2)} (${reminder.type === 'above' ? '高于' : '低于'})</div>
      ${reminder.note ? `<div class="alert-note">备注: ${reminder.note}</div>` : ''}
    `;
    
    alertEl.style.display = 'flex';
    
    document.getElementById('alertCloseBtn').onclick = () => {
      alertEl.style.display = 'none';
    };
    
    document.getElementById('alertViewBtn').onclick = () => {
      alertEl.style.display = 'none';
      const stock = { code: reminder.code, name: reminder.name, market: reminder.market };
      this.showStock(stock);
    };
  }

  requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }

  sendNotification(title, body) {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body, icon: 'icons/icon-192.svg' });
    }
  }

  playAlertSound() {
    // 使用Web Audio API播放提示音
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      
      oscillator.frequency.value = 800;
      oscillator.type = 'sine';
      gainNode.gain.value = 0.3;
      
      oscillator.start();
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);
      oscillator.stop(audioCtx.currentTime + 0.5);
    } catch (e) {
      console.log('无法播放提示音');
    }
  }
}

// ==================== 启动应用 ====================
document.addEventListener('DOMContentLoaded', () => {
  window.app = new StockApp();
});