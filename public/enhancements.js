// Nova Portal v5.0 - Enhancements
// =================================

// ==================
// Weather Widget
// ==================

async function loadWeather() {
  const widget = document.getElementById('weatherWidget');
  if (!widget) return;
  
  try {
    // Use wttr.in for simple weather (no API key needed)
    const res = await fetch('https://wttr.in/Tarzana?format=j1');
    if (res.ok) {
      const data = await res.json();
      const current = data.current_condition[0];
      const temp = current.temp_F;
      const desc = current.weatherDesc[0].value;
      const icon = getWeatherIcon(current.weatherCode);
      
      widget.innerHTML = `
        <div class="weather-main">
          <span class="weather-icon">${icon}</span>
          <span class="weather-temp">${temp}°F</span>
        </div>
        <div class="weather-desc">${desc}</div>
        <div class="weather-location">📍 Tarzana, CA</div>
      `;
    }
  } catch (e) {
    widget.innerHTML = '<div class="weather-error">Weather unavailable</div>';
  }
}

function getWeatherIcon(code) {
  const icons = {
    '113': '☀️', '116': '⛅', '119': '☁️', '122': '☁️',
    '143': '🌫️', '176': '🌦️', '179': '🌨️', '182': '🌨️',
    '185': '🌨️', '200': '⛈️', '227': '🌨️', '230': '❄️',
    '248': '🌫️', '260': '🌫️', '263': '🌦️', '266': '🌦️',
    '281': '🌨️', '284': '🌨️', '293': '🌧️', '296': '🌧️',
    '299': '🌧️', '302': '🌧️', '305': '🌧️', '308': '🌧️',
    '311': '🌨️', '314': '🌨️', '317': '🌨️', '320': '🌨️',
    '323': '🌨️', '326': '🌨️', '329': '❄️', '332': '❄️',
    '335': '❄️', '338': '❄️', '350': '🌨️', '353': '🌧️',
    '356': '🌧️', '359': '🌧️', '362': '🌨️', '365': '🌨️',
    '368': '🌨️', '371': '❄️', '374': '🌨️', '377': '🌨️',
    '386': '⛈️', '389': '⛈️', '392': '⛈️', '395': '❄️'
  };
  return icons[code] || '🌤️';
}

// ==================
// Pomodoro Timer
// ==================

const pomodoro = {
  time: 25 * 60,
  running: false,
  interval: null,
  mode: 'work', // work, break
  workTime: 25 * 60,
  breakTime: 5 * 60
};

function initPomodoro() {
  renderPomodoro();
}

function renderPomodoro() {
  const widget = document.getElementById('pomodoroWidget');
  if (!widget) return;
  
  const mins = Math.floor(pomodoro.time / 60);
  const secs = pomodoro.time % 60;
  const timeStr = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  const modeIcon = pomodoro.mode === 'work' ? '🎯' : '☕';
  const modeText = pomodoro.mode === 'work' ? 'Focus' : 'Break';
  
  widget.innerHTML = `
    <div class="pomo-display">
      <span class="pomo-mode">${modeIcon} ${modeText}</span>
      <span class="pomo-time">${timeStr}</span>
    </div>
    <div class="pomo-controls">
      <button class="pomo-btn" onclick="togglePomodoro()">
        ${pomodoro.running ? '⏸️' : '▶️'}
      </button>
      <button class="pomo-btn" onclick="resetPomodoro()">🔄</button>
      <button class="pomo-btn" onclick="skipPomodoro()">⏭️</button>
    </div>
  `;
}

function togglePomodoro() {
  if (pomodoro.running) {
    clearInterval(pomodoro.interval);
    pomodoro.running = false;
  } else {
    pomodoro.running = true;
    pomodoro.interval = setInterval(tickPomodoro, 1000);
  }
  renderPomodoro();
}

function tickPomodoro() {
  if (pomodoro.time > 0) {
    pomodoro.time--;
    renderPomodoro();
  } else {
    // Timer complete
    clearInterval(pomodoro.interval);
    pomodoro.running = false;
    
    // Notification
    if (Notification.permission === 'granted') {
      new Notification(pomodoro.mode === 'work' ? '🎯 Focus complete!' : '☕ Break over!', {
        body: pomodoro.mode === 'work' ? 'Time for a break!' : 'Ready to focus?',
        icon: '✨'
      });
    }
    
    // Play sound
    playNotificationSound();
    
    // Switch mode
    pomodoro.mode = pomodoro.mode === 'work' ? 'break' : 'work';
    pomodoro.time = pomodoro.mode === 'work' ? pomodoro.workTime : pomodoro.breakTime;
    renderPomodoro();
    
    toast(pomodoro.mode === 'work' ? '☕ Break time!' : '🎯 Focus time!');
  }
}

function resetPomodoro() {
  clearInterval(pomodoro.interval);
  pomodoro.running = false;
  pomodoro.mode = 'work';
  pomodoro.time = pomodoro.workTime;
  renderPomodoro();
}

function skipPomodoro() {
  clearInterval(pomodoro.interval);
  pomodoro.running = false;
  pomodoro.mode = pomodoro.mode === 'work' ? 'break' : 'work';
  pomodoro.time = pomodoro.mode === 'work' ? pomodoro.workTime : pomodoro.breakTime;
  renderPomodoro();
}

function playNotificationSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 800;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.5);
  } catch (e) {}
}

// ==================
// Quick Stats Bar
// ==================

async function loadQuickStats() {
  const widget = document.getElementById('quickStatsWidget');
  if (!widget) return;
  
  try {
    const res = await fetch(`${CONFIG.apiUrl}/system`);
    if (res.ok) {
      const data = await res.json();
      widget.innerHTML = `
        <div class="quick-stat">
          <span class="qs-icon">💾</span>
          <span class="qs-value">${data.disk || '--'}%</span>
          <span class="qs-label">Disk</span>
        </div>
        <div class="quick-stat">
          <span class="qs-icon">🧠</span>
          <span class="qs-value">${data.memory || '--'}%</span>
          <span class="qs-label">Memory</span>
        </div>
        <div class="quick-stat">
          <span class="qs-icon">⚡</span>
          <span class="qs-value">${data.load || '--'}</span>
          <span class="qs-label">Load</span>
        </div>
      `;
    }
  } catch (e) {
    // Silently fail - stats are optional
  }
}

// ==================
// Smart Chat Commands
// ==================

function processSmartCommand(message) {
  const lower = message.toLowerCase().trim();
  
  // Add task: "add task: Buy groceries"
  if (lower.startsWith('add task:') || lower.startsWith('task:')) {
    const title = message.replace(/^(add )?task:\s*/i, '').trim();
    if (title) {
      state.tasks.todo.push({
        title,
        description: '',
        tag: 'task',
        priority: 'medium',
        createdAt: new Date().toISOString()
      });
      saveTasks();
      renderTasks();
      return `✅ Task added: "${title}"`;
    }
  }
  
  // Add event: "add event: Meeting tomorrow at 3pm"
  if (lower.startsWith('add event:') || lower.startsWith('event:')) {
    const title = message.replace(/^(add )?event:\s*/i, '').trim();
    // Parse date from text (simple version)
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().split('T')[0];
    
    state.events.push({
      title,
      date: dateStr,
      time: '',
      color: 'blue'
    });
    save('events', state.events);
    renderCalendar();
    return `📅 Event added for tomorrow: "${title}"`;
  }
  
  // Quick stats
  if (lower === 'status' || lower === 'stats') {
    const taskCount = (state.tasks.todo?.length || 0) + (state.tasks.progress?.length || 0);
    const doneCount = state.tasks.done?.length || 0;
    return `📊 **Status:**\n• ${taskCount} active tasks\n• ${doneCount} completed\n• ${state.events.length} events`;
  }
  
  // Focus mode
  if (lower === 'focus' || lower === 'pomodoro' || lower === 'start timer') {
    if (!pomodoro.running) togglePomodoro();
    return '🎯 Focus timer started! 25 minutes of deep work.';
  }
  
  // Navigation
  if (lower === 'tasks' || lower === 'show tasks') {
    navigateTo('tasks');
    return null; // Don't send to API
  }
  if (lower === 'calendar' || lower === 'show calendar') {
    navigateTo('calendar');
    return null;
  }
  if (lower === 'dashboard' || lower === 'home') {
    navigateTo('dashboard');
    return null;
  }
  
  return null; // Not a command, send to API
}

// ==================
// Motivational Quotes
// ==================

const quotes = [
  { text: "The best time to plant a tree was 20 years ago. The second best time is now.", author: "Chinese Proverb" },
  { text: "Done is better than perfect.", author: "Sheryl Sandberg" },
  { text: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
  { text: "Start where you are. Use what you have. Do what you can.", author: "Arthur Ashe" },
  { text: "Small daily improvements are the key to staggering long-term results.", author: "Unknown" },
  { text: "Focus on being productive instead of busy.", author: "Tim Ferriss" },
  { text: "Your time is limited. Don't waste it living someone else's life.", author: "Steve Jobs" },
  { text: "The secret of getting ahead is getting started.", author: "Mark Twain" }
];

function getRandomQuote() {
  return quotes[Math.floor(Math.random() * quotes.length)];
}

function renderQuote() {
  const widget = document.getElementById('quoteWidget');
  if (!widget) return;
  
  const quote = getRandomQuote();
  widget.innerHTML = `
    <div class="quote-text">"${quote.text}"</div>
    <div class="quote-author">— ${quote.author}</div>
  `;
}

// ==================
// Streak Counter
// ==================

function loadStreak() {
  const widget = document.getElementById('streakWidget');
  if (!widget) return;
  
  const lastVisit = load('lastVisit', null);
  let streak = load('streak', 0);
  
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();
  
  if (lastVisit === today) {
    // Same day, keep streak
  } else if (lastVisit === yesterday) {
    // Consecutive day, increment
    streak++;
    save('streak', streak);
  } else if (lastVisit) {
    // Streak broken
    streak = 1;
    save('streak', streak);
  } else {
    // First visit
    streak = 1;
    save('streak', streak);
  }
  
  save('lastVisit', today);
  
  widget.innerHTML = `
    <div class="streak-count">🔥 ${streak}</div>
    <div class="streak-label">Day Streak</div>
  `;
}

// ==================
// Greeting
// ==================

function getGreeting() {
  const hour = new Date().getHours();
  const name = 'Eric';
  
  if (hour < 12) return `Good morning, ${name}! ☀️`;
  if (hour < 17) return `Good afternoon, ${name}! 🌤️`;
  if (hour < 21) return `Good evening, ${name}! 🌆`;
  return `Good night, ${name}! 🌙`;
}

function renderGreeting() {
  const el = document.getElementById('greeting');
  if (el) el.textContent = getGreeting();
}

// ==================
// Initialize Enhancements
// ==================

function initEnhancements() {
  // Request notification permission
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
  
  loadWeather();
  initPomodoro();
  loadQuickStats();
  renderQuote();
  loadStreak();
  renderGreeting();
  
  // Refresh weather every 30 mins
  setInterval(loadWeather, 30 * 60 * 1000);
  
  // Refresh quote on dashboard visit
  const origNavigateTo = window.navigateTo;
  window.navigateTo = function(view) {
    if (view === 'dashboard') {
      renderQuote();
      renderGreeting();
    }
    origNavigateTo(view);
  };
}

// Hook into chat
const origHandleChatSubmit = window.handleChatSubmit;
if (typeof origHandleChatSubmit === 'function') {
  // Already defined, hook into it
}

// Start enhancements after DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initEnhancements);
} else {
  setTimeout(initEnhancements, 100);
}

// Exports
window.togglePomodoro = togglePomodoro;
window.resetPomodoro = resetPomodoro;
window.skipPomodoro = skipPomodoro;
window.loadWeather = loadWeather;
window.processSmartCommand = processSmartCommand;
