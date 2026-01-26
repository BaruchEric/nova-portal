// Nova Portal v3.0 - Full Featured
// Command Palette, Projects, Calendar, Themes, Widgets
// =====================================================

const CONFIG = {
  apiUrl: 'https://nova-portal-api.ericbaruch.workers.dev/api',
  refreshInterval: 30000,
  storagePrefix: 'nova-'
};

// ==================
// State
// ==================

let currentProject = 'personal';
let projects = {
  personal: { name: '🏠 Personal', tasks: { todo: [], progress: [], done: [] } },
  laundromat: { name: '🧺 Laundromat', tasks: { todo: [], progress: [], done: [] } },
  'nova-dev': { name: '✨ Nova Dev', tasks: { todo: [], progress: [], done: [] } }
};
let events = [];
let notes = [];
let currentNote = null;
let calendarDate = new Date();
let widgets = ['gateway', 'portal', 'tasks-summary', 'recent-activity'];

// ==================
// Navigation
// ==================

document.querySelectorAll('.nav-link').forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    navigateTo(link.getAttribute('data-view'));
  });
});

function navigateTo(viewId) {
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  document.querySelector(`[data-view="${viewId}"]`)?.classList.add('active');
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(viewId)?.classList.add('active');
  history.pushState(null, '', `#${viewId}`);
  
  if (viewId === 'dashboard') renderDashboard();
  if (viewId === 'calendar') renderCalendar();
  if (viewId === 'notes') loadNotes();
  if (viewId === 'tasks') renderTasks();
}

window.addEventListener('popstate', () => navigateTo(location.hash.slice(1) || 'chat'));

// ==================
// Command Palette
// ==================

const commands = [
  { id: 'chat', icon: '💬', label: 'Go to Chat', shortcut: '⌘1', action: () => navigateTo('chat') },
  { id: 'dashboard', icon: '📊', label: 'Go to Dashboard', shortcut: '⌘2', action: () => navigateTo('dashboard') },
  { id: 'tasks', icon: '📋', label: 'Go to Tasks', shortcut: '⌘3', action: () => navigateTo('tasks') },
  { id: 'calendar', icon: '📆', label: 'Go to Calendar', shortcut: '⌘4', action: () => navigateTo('calendar') },
  { id: 'notes', icon: '📝', label: 'Go to Notes', shortcut: '⌘5', action: () => navigateTo('notes') },
  { id: 'new-task', icon: '➕', label: 'New Task', shortcut: '', action: () => { closeCommandPalette(); openTaskModal(); } },
  { id: 'new-event', icon: '📅', label: 'New Event', shortcut: '', action: () => { closeCommandPalette(); openEventModal(); } },
  { id: 'theme', icon: '🎨', label: 'Change Theme', shortcut: '', action: () => { closeCommandPalette(); openThemePicker(); } },
  { id: 'refresh', icon: '🔄', label: 'Refresh All', shortcut: '', action: () => { location.reload(); } },
];

let paletteIndex = 0;
let filteredCommands = [...commands];

function openCommandPalette() {
  const modal = document.getElementById('commandPalette');
  const input = document.getElementById('paletteSearch');
  modal?.classList.add('open');
  input.value = '';
  input.focus();
  filteredCommands = [...commands];
  paletteIndex = 0;
  renderPaletteResults();
}

function closeCommandPalette() {
  document.getElementById('commandPalette')?.classList.remove('open');
}

function renderPaletteResults() {
  const container = document.getElementById('paletteResults');
  if (!container) return;
  
  container.innerHTML = filteredCommands.map((cmd, i) => `
    <div class="palette-item ${i === paletteIndex ? 'selected' : ''}" onclick="executeCommand('${cmd.id}')">
      <span class="icon">${cmd.icon}</span>
      <span class="label">${cmd.label}</span>
      ${cmd.shortcut ? `<span class="shortcut">${cmd.shortcut}</span>` : ''}
    </div>
  `).join('');
}

document.getElementById('paletteSearch')?.addEventListener('input', (e) => {
  const query = e.target.value.toLowerCase();
  filteredCommands = commands.filter(c => c.label.toLowerCase().includes(query));
  paletteIndex = 0;
  renderPaletteResults();
});

document.getElementById('paletteSearch')?.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    paletteIndex = Math.min(paletteIndex + 1, filteredCommands.length - 1);
    renderPaletteResults();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    paletteIndex = Math.max(paletteIndex - 1, 0);
    renderPaletteResults();
  } else if (e.key === 'Enter' && filteredCommands[paletteIndex]) {
    e.preventDefault();
    executeCommand(filteredCommands[paletteIndex].id);
  }
});

function executeCommand(id) {
  const cmd = commands.find(c => c.id === id);
  if (cmd) {
    closeCommandPalette();
    cmd.action();
  }
}

// ==================
// Chat
// ==================

const chatForm = document.getElementById('chatForm');
const messageInput = document.getElementById('messageInput');
const messagesContainer = document.getElementById('messages');

async function loadChatHistory() {
  try {
    const response = await fetch(`${CONFIG.apiUrl}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ getHistory: true })
    });
    if (response.ok) {
      const data = await response.json();
      if (data.history?.length) {
        messagesContainer.innerHTML = '';
        data.history.slice(-20).forEach(msg => addMessage(msg.content, msg.role, msg.timestamp));
        updateConnectionStatus(true);
      }
    }
  } catch {}
}

chatForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const message = messageInput.value.trim();
  if (!message) return;
  
  addMessage(message, 'user');
  messageInput.value = '';
  const typingEl = showTyping();
  
  try {
    const response = await fetch(`${CONFIG.apiUrl}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message })
    });
    removeTyping(typingEl);
    if (response.ok) {
      const data = await response.json();
      addMessage(data.reply, 'assistant');
      updateConnectionStatus(true);
    } else throw new Error();
  } catch {
    removeTyping(typingEl);
    addMessage("Connection issue. Try again! ✨", 'assistant');
    updateConnectionStatus(false);
  }
});

function addMessage(content, role, timestamp = null) {
  const div = document.createElement('div');
  div.className = `message ${role}`;
  const time = timestamp ? new Date(timestamp) : new Date();
  div.innerHTML = `
    <div class="message-avatar">${role === 'user' ? '👤' : '✨'}</div>
    <div class="message-body">
      <div class="message-content"><p>${formatMessage(content)}</p></div>
      <span class="message-time">${formatTime(time)}</span>
    </div>
  `;
  messagesContainer?.appendChild(div);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function showTyping() {
  const div = document.createElement('div');
  div.className = 'message assistant typing';
  div.innerHTML = `<div class="message-avatar">✨</div><div class="message-body"><div class="message-content"><div class="typing-indicator"><span></span><span></span><span></span></div></div></div>`;
  messagesContainer?.appendChild(div);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
  return div;
}

function removeTyping(el) { el?.remove(); }

function formatMessage(text) {
  return escapeHtml(text)
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br>');
}

// ==================
// Dashboard Widgets
// ==================

function renderDashboard() {
  const grid = document.getElementById('dashboardGrid');
  if (!grid) return;
  
  grid.innerHTML = widgets.map(w => renderWidget(w)).join('');
  updateDashboard();
}

function renderWidget(type) {
  switch(type) {
    case 'gateway':
      return `<div class="widget" data-widget="gateway">
        <div class="widget-header"><h3>🤖 Clawdbot Gateway</h3><span class="card-status" id="gw-status"></span></div>
        <div class="stat"><span class="stat-value" id="gw-val">Checking...</span><span class="stat-label">Status</span></div>
      </div>`;
    case 'portal':
      return `<div class="widget" data-widget="portal">
        <div class="widget-header"><h3>✨ Nova Portal</h3><span class="card-status online"></span></div>
        <div class="stat"><span class="stat-value">v3.0</span><span class="stat-label">Version</span></div>
      </div>`;
    case 'tasks-summary':
      const total = Object.values(projects).reduce((sum, p) => sum + p.tasks.todo.length + p.tasks.progress.length, 0);
      return `<div class="widget" data-widget="tasks-summary">
        <div class="widget-header"><h3>📋 Tasks</h3></div>
        <div class="stat"><span class="stat-value">${total}</span><span class="stat-label">Active Tasks</span></div>
      </div>`;
    case 'recent-activity':
      return `<div class="widget" data-widget="recent-activity">
        <div class="widget-header"><h3>⚡ Recent</h3></div>
        <p style="color: var(--text-secondary); font-size: 0.9rem;">Chat & tasks synced</p>
      </div>`;
    default:
      return '';
  }
}

async function updateDashboard() {
  try {
    const response = await fetch(`${CONFIG.apiUrl}/status`);
    if (response.ok) {
      const data = await response.json();
      const gwStatus = document.getElementById('gw-status');
      const gwVal = document.getElementById('gw-val');
      if (gwStatus) gwStatus.className = `card-status ${data.gateway?.status === 'Online' ? 'online' : 'offline'}`;
      if (gwVal) gwVal.textContent = data.gateway?.status || 'Unknown';
      document.getElementById('lastUpdated').textContent = `Last updated: ${formatTime(new Date())}`;
      updateConnectionStatus(true);
    }
  } catch {
    updateConnectionStatus(false);
  }
}

function refreshDashboard() { showToast('Refreshing...'); renderDashboard(); }
function openWidgetPicker() { showToast('Widget picker coming soon!'); }

// ==================
// Projects & Tasks
// ==================

function switchProject(projectId) {
  currentProject = projectId;
  renderTasks();
  saveProjects();
}

function initProjects() {
  const saved = localStorage.getItem(`${CONFIG.storagePrefix}projects`);
  if (saved) projects = JSON.parse(saved);
  loadTasksFromAPI();
}

async function loadTasksFromAPI() {
  try {
    const response = await fetch(`${CONFIG.apiUrl}/tasks`);
    if (response.ok) {
      const data = await response.json();
      // Merge into personal project for backward compat
      if (data.todo || data.progress || data.done) {
        projects.personal.tasks = data;
        saveProjects();
        renderTasks();
      }
    }
  } catch {}
}

function renderTasks() {
  const project = projects[currentProject];
  if (!project) return;
  
  ['todo', 'progress', 'done'].forEach(status => {
    const container = document.getElementById(`${status}-cards`);
    const countEl = document.getElementById(`${status}-count`);
    if (!container) return;
    
    container.innerHTML = '';
    const tasks = project.tasks[status] || [];
    if (countEl) countEl.textContent = tasks.length;
    
    tasks.forEach((task, i) => container.appendChild(createTaskCard(task, status, i)));
  });
  
  setupDragAndDrop();
}

function createTaskCard(task, status, index) {
  const card = document.createElement('div');
  card.className = `kanban-card priority-${task.priority || 'medium'}`;
  card.draggable = true;
  card.dataset.status = status;
  card.dataset.index = index;
  
  const tagEmoji = { task: '🏷️', feature: '✨', bug: '🐛', infra: '🔧', docs: '📝', urgent: '🔥' };
  const dueStr = task.due ? `<span class="card-due">📅 ${task.due}</span>` : '';
  
  card.innerHTML = `
    <div class="card-header">
      <h4>${escapeHtml(task.title)}</h4>
      <div class="card-actions">
        <button class="btn-icon-sm" onclick="editTask('${status}', ${index})">✏️</button>
        <button class="btn-icon-sm" onclick="deleteTask('${status}', ${index})">🗑️</button>
      </div>
    </div>
    ${task.description ? `<p>${escapeHtml(task.description)}</p>` : ''}
    <div class="card-footer">
      <span class="card-tag">${tagEmoji[task.tag] || '🏷️'} ${task.tag || 'task'}</span>
      ${dueStr}
    </div>
  `;
  
  card.addEventListener('dragstart', handleDragStart);
  card.addEventListener('dragend', handleDragEnd);
  return card;
}

function setupDragAndDrop() {
  document.querySelectorAll('.kanban-cards').forEach(col => {
    col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('drag-over'); });
    col.addEventListener('dragleave', () => col.classList.remove('drag-over'));
    col.addEventListener('drop', handleDrop);
  });
}

let draggedCard = null;
function handleDragStart(e) { draggedCard = this; this.classList.add('dragging'); }
function handleDragEnd() { this.classList.remove('dragging'); document.querySelectorAll('.kanban-cards').forEach(c => c.classList.remove('drag-over')); draggedCard = null; }

function handleDrop(e) {
  e.preventDefault();
  this.classList.remove('drag-over');
  if (!draggedCard) return;
  
  const project = projects[currentProject];
  const fromStatus = draggedCard.dataset.status;
  const fromIndex = parseInt(draggedCard.dataset.index);
  const toStatus = this.id.replace('-cards', '');
  
  const [task] = project.tasks[fromStatus].splice(fromIndex, 1);
  project.tasks[toStatus].push(task);
  
  saveProjects();
  renderTasks();
  showToast(`Moved to ${toStatus}`);
}

function openTaskModal(status = 'todo', index = null) {
  const modal = document.getElementById('taskModal');
  document.getElementById('taskForm')?.reset();
  document.getElementById('taskId').value = '';
  document.getElementById('modalTitle').textContent = 'Add Task';
  
  if (index !== null) {
    const task = projects[currentProject].tasks[status]?.[index];
    if (task) {
      document.getElementById('taskId').value = `${status}:${index}`;
      document.getElementById('taskTitle').value = task.title;
      document.getElementById('taskDescription').value = task.description || '';
      document.getElementById('taskTag').value = task.tag || 'task';
      document.getElementById('taskPriority').value = task.priority || 'medium';
      document.getElementById('taskDue').value = task.due || '';
      document.getElementById('modalTitle').textContent = 'Edit Task';
    }
  }
  
  modal?.classList.add('open');
  document.getElementById('taskTitle')?.focus();
}

function closeTaskModal() { document.getElementById('taskModal')?.classList.remove('open'); }

function saveTask(e) {
  e.preventDefault();
  const taskId = document.getElementById('taskId').value;
  const task = {
    title: document.getElementById('taskTitle').value,
    description: document.getElementById('taskDescription').value,
    tag: document.getElementById('taskTag').value,
    priority: document.getElementById('taskPriority').value,
    due: document.getElementById('taskDue').value,
    createdAt: new Date().toISOString()
  };
  
  const project = projects[currentProject];
  if (taskId) {
    const [status, index] = taskId.split(':');
    task.createdAt = project.tasks[status][index].createdAt;
    project.tasks[status][index] = task;
    showToast('Task updated');
  } else {
    project.tasks.todo.push(task);
    showToast('Task created');
  }
  
  saveProjects();
  renderTasks();
  closeTaskModal();
}

function editTask(status, index) { openTaskModal(status, index); }
function deleteTask(status, index) {
  if (confirm('Delete this task?')) {
    projects[currentProject].tasks[status].splice(index, 1);
    saveProjects();
    renderTasks();
    showToast('Task deleted');
  }
}

function saveProjects() {
  localStorage.setItem(`${CONFIG.storagePrefix}projects`, JSON.stringify(projects));
  // Sync personal project to API
  fetch(`${CONFIG.apiUrl}/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(projects.personal.tasks)
  }).catch(() => {});
}

function openProjectManager() { showToast('Project manager coming soon!'); }

// ==================
// Calendar
// ==================

function renderCalendar() {
  const grid = document.getElementById('calendarGrid');
  const monthLabel = document.getElementById('calendarMonth');
  if (!grid) return;
  
  const year = calendarDate.getFullYear();
  const month = calendarDate.getMonth();
  
  monthLabel.textContent = new Date(year, month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();
  
  let html = '';
  
  // Previous month days
  const prevMonthDays = new Date(year, month, 0).getDate();
  for (let i = firstDay - 1; i >= 0; i--) {
    html += `<div class="calendar-day other-month">${prevMonthDays - i}</div>`;
  }
  
  // Current month days
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const isToday = today.getDate() === day && today.getMonth() === month && today.getFullYear() === year;
    const hasEvent = events.some(e => e.date === dateStr);
    
    html += `<div class="calendar-day${isToday ? ' today' : ''}${hasEvent ? ' has-event' : ''}" onclick="selectDate('${dateStr}')">${day}</div>`;
  }
  
  // Next month days
  const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;
  for (let i = 1; i <= totalCells - firstDay - daysInMonth; i++) {
    html += `<div class="calendar-day other-month">${i}</div>`;
  }
  
  grid.innerHTML = html;
  renderUpcomingEvents();
}

function renderUpcomingEvents() {
  const container = document.getElementById('upcomingEvents');
  if (!container) return;
  
  const upcoming = events
    .filter(e => new Date(e.date) >= new Date())
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(0, 5);
  
  if (upcoming.length === 0) {
    container.innerHTML = '<p style="color: var(--text-muted)">No upcoming events</p>';
    return;
  }
  
  container.innerHTML = upcoming.map(e => {
    const date = new Date(e.date);
    return `<div class="event-item">
      <div class="event-date">
        <div class="day">${date.getDate()}</div>
        <div class="month">${date.toLocaleDateString('en-US', { month: 'short' })}</div>
      </div>
      <div class="event-info">
        <h4>${escapeHtml(e.title)}</h4>
        ${e.time ? `<p>${e.time}</p>` : ''}
      </div>
    </div>`;
  }).join('');
}

function prevMonth() { calendarDate.setMonth(calendarDate.getMonth() - 1); renderCalendar(); }
function nextMonth() { calendarDate.setMonth(calendarDate.getMonth() + 1); renderCalendar(); }
function goToToday() { calendarDate = new Date(); renderCalendar(); }
function selectDate(dateStr) { document.getElementById('eventDate').value = dateStr; openEventModal(); }

function openEventModal() { document.getElementById('eventModal')?.classList.add('open'); }
function closeEventModal() { document.getElementById('eventModal')?.classList.remove('open'); }

function saveEvent(e) {
  e.preventDefault();
  const event = {
    id: Date.now().toString(),
    title: document.getElementById('eventTitle').value,
    date: document.getElementById('eventDate').value,
    time: document.getElementById('eventTime').value,
    notes: document.getElementById('eventNotes').value
  };
  events.push(event);
  localStorage.setItem(`${CONFIG.storagePrefix}events`, JSON.stringify(events));
  closeEventModal();
  renderCalendar();
  showToast('Event added');
}

function loadEvents() {
  const saved = localStorage.getItem(`${CONFIG.storagePrefix}events`);
  if (saved) events = JSON.parse(saved);
}

// ==================
// Notes
// ==================

async function loadNotes() {
  const containers = { daily: document.getElementById('daily-notes'), memory: document.getElementById('memory-notes'), config: document.getElementById('config-notes') };
  Object.values(containers).forEach(c => { if (c) c.innerHTML = '<div class="note-item">Loading...</div>'; });
  
  try {
    const response = await fetch(`${CONFIG.apiUrl}/notes`);
    if (response.ok) {
      const data = await response.json();
      notes = data.notes || [];
      renderNotes();
    }
  } catch {
    notes = [{ id: 'memory', name: 'MEMORY.md', type: 'memory', icon: '🧠' }];
    renderNotes();
  }
}

function renderNotes() {
  const containers = { daily: document.getElementById('daily-notes'), memory: document.getElementById('memory-notes'), config: document.getElementById('config-notes') };
  Object.values(containers).forEach(c => { if (c) c.innerHTML = ''; });
  
  notes.forEach(note => {
    const item = document.createElement('div');
    item.className = 'note-item';
    item.onclick = () => selectNote(note, item);
    item.innerHTML = `<span>${note.icon || '📄'} ${note.name}</span>`;
    (containers[note.type] || containers.config)?.appendChild(item);
  });
}

async function selectNote(note, element) {
  currentNote = note;
  document.querySelectorAll('.note-item').forEach(i => i.classList.remove('active'));
  element?.classList.add('active');
  
  const contentEl = document.getElementById('noteContent');
  document.getElementById('noteTitle').textContent = note.name;
  if (contentEl) { contentEl.value = 'Loading...'; contentEl.readOnly = true; }
  
  try {
    const response = await fetch(`${CONFIG.apiUrl}/notes?file=${encodeURIComponent(note.id)}`);
    if (response.ok) {
      const data = await response.json();
      if (contentEl) { contentEl.value = data.content || ''; contentEl.readOnly = false; }
    }
  } catch {
    if (contentEl) contentEl.value = 'Failed to load.';
  }
}

async function saveNote() {
  if (!currentNote) return;
  try {
    await fetch(`${CONFIG.apiUrl}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file: currentNote.id, content: document.getElementById('noteContent')?.value })
    });
    showToast('Note saved');
  } catch { showToast('Failed to save', 'error'); }
}

function copyNote() {
  navigator.clipboard.writeText(document.getElementById('noteContent')?.value || '');
  showToast('Copied!');
}

function refreshNotes() { showToast('Refreshing...'); loadNotes(); }

// ==================
// Themes
// ==================

function openThemePicker() { document.getElementById('themePicker')?.classList.add('open'); }
function closeThemePicker() { document.getElementById('themePicker')?.classList.remove('open'); }

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(`${CONFIG.storagePrefix}theme`, theme);
  closeThemePicker();
  showToast(`Theme: ${theme}`);
}

function loadTheme() {
  const saved = localStorage.getItem(`${CONFIG.storagePrefix}theme`);
  if (saved) document.documentElement.setAttribute('data-theme', saved);
}

// ==================
// FAB
// ==================

function toggleFabMenu() {
  document.getElementById('fabMenu')?.classList.toggle('open');
}

function quickNewTask() { toggleFabMenu(); navigateTo('tasks'); setTimeout(() => openTaskModal(), 100); }
function quickNewEvent() { toggleFabMenu(); navigateTo('calendar'); setTimeout(() => openEventModal(), 100); }
function quickChat() { toggleFabMenu(); navigateTo('chat'); messageInput?.focus(); }

// ==================
// Utilities
// ==================

function updateConnectionStatus(connected) {
  const indicator = document.getElementById('connectionStatus');
  const text = document.getElementById('connectionText');
  if (indicator) indicator.className = `status-indicator ${connected ? 'online' : 'offline'}`;
  if (text) text.textContent = connected ? 'Connected' : 'Offline';
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 3000);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatTime(date) {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

// ==================
// Keyboard Shortcuts
// ==================

document.addEventListener('keydown', (e) => {
  // Command palette
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault();
    document.getElementById('commandPalette')?.classList.contains('open') ? closeCommandPalette() : openCommandPalette();
  }
  // Escape
  if (e.key === 'Escape') {
    closeCommandPalette();
    closeTaskModal();
    closeEventModal();
    closeThemePicker();
    document.getElementById('fabMenu')?.classList.remove('open');
  }
  // View shortcuts
  if ((e.metaKey || e.ctrlKey) && ['1','2','3','4','5'].includes(e.key)) {
    e.preventDefault();
    navigateTo(['chat', 'dashboard', 'tasks', 'calendar', 'notes'][parseInt(e.key) - 1]);
  }
});

// Close modals on backdrop click
document.querySelectorAll('.modal').forEach(modal => {
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.remove('open');
    }
  });
});

// ==================
// Initialize
// ==================

document.addEventListener('DOMContentLoaded', () => {
  loadTheme();
  loadEvents();
  initProjects();
  loadChatHistory();
  renderDashboard();
  
  const initialView = location.hash.slice(1) || 'chat';
  if (initialView !== 'chat') navigateTo(initialView);
  
  setInterval(updateDashboard, CONFIG.refreshInterval);
  messageInput?.focus();
});

// Global functions
window.openCommandPalette = openCommandPalette;
window.closeCommandPalette = closeCommandPalette;
window.executeCommand = executeCommand;
window.openTaskModal = openTaskModal;
window.closeTaskModal = closeTaskModal;
window.saveTask = saveTask;
window.editTask = editTask;
window.deleteTask = deleteTask;
window.switchProject = switchProject;
window.openProjectManager = openProjectManager;
window.openEventModal = openEventModal;
window.closeEventModal = closeEventModal;
window.saveEvent = saveEvent;
window.selectDate = selectDate;
window.prevMonth = prevMonth;
window.nextMonth = nextMonth;
window.goToToday = goToToday;
window.refreshDashboard = refreshDashboard;
window.openWidgetPicker = openWidgetPicker;
window.refreshNotes = refreshNotes;
window.saveNote = saveNote;
window.copyNote = copyNote;
window.openThemePicker = openThemePicker;
window.closeThemePicker = closeThemePicker;
window.setTheme = setTheme;
window.toggleFabMenu = toggleFabMenu;
window.quickNewTask = quickNewTask;
window.quickNewEvent = quickNewEvent;
window.quickChat = quickChat;
