// Nova Portal v4.0 - Responsive & Reactive
// =========================================

const CONFIG = {
  apiUrl: 'https://api.beric.ca/api',
  refreshInterval: 30000,
  storagePrefix: 'nova-'
};

// State
const state = {
  currentProject: null,
  projects: [],
  tasks: { todo: [], progress: [], done: [] },
  events: [],
  notes: [],
  currentNote: null,
  calendarDate: new Date(),
  selectedDate: new Date(),
  connected: false,
  commandIndex: 0,
  filteredCommands: []
};

// ==================
// Initialize
// ==================

document.addEventListener('DOMContentLoaded', () => {
  loadTheme();
  loadProjects();
  initNavigation();
  initChat();
  initKanban();
  initCalendar();
  initCommandPalette();
  
  const view = location.hash.slice(1) || 'chat';
  navigateTo(view);
  
  updateDashboard();
  loadChatHistory();
  
  setInterval(updateDashboard, CONFIG.refreshInterval);
  
  // Handle resize for responsive
  window.addEventListener('resize', debounce(handleResize, 200));
  handleResize();
});

// ==================
// Utilities
// ==================

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatTime(date) {
  return new Date(date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function formatDate(date) {
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function save(key, data) {
  localStorage.setItem(CONFIG.storagePrefix + key, JSON.stringify(data));
}

function load(key, fallback = null) {
  const data = localStorage.getItem(CONFIG.storagePrefix + key);
  return data ? JSON.parse(data) : fallback;
}

function handleResize() {
  const isMobile = window.innerWidth <= 768;
  document.body.classList.toggle('is-mobile', isMobile);
}

// ==================
// Navigation
// ==================

function initNavigation() {
  $$('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      navigateTo(link.dataset.view);
      closeSidebar();
    });
  });
}

function navigateTo(viewId) {
  // Update nav links
  $$('.nav-link').forEach(l => l.classList.toggle('active', l.dataset.view === viewId));
  $$('.bottom-nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === viewId));
  
  // Update views
  $$('.view').forEach(v => v.classList.toggle('active', v.id === viewId));
  
  // Update mobile title
  const titles = { chat: 'Chat', dashboard: 'Dashboard', tasks: 'Tasks', calendar: 'Calendar', notes: 'Notes' };
  $('#mobileTitle').textContent = titles[viewId] || 'Nova';
  
  // Update URL
  history.replaceState(null, '', `#${viewId}`);
  
  // View-specific init
  if (viewId === 'dashboard') updateDashboard();
  if (viewId === 'notes') loadNotes();
  if (viewId === 'tasks') renderTasks();
  if (viewId === 'calendar') renderCalendar();
  
  closeFab();
}

// Sidebar (Mobile)
function toggleSidebar() {
  $('#sidebar').classList.toggle('open');
}

function closeSidebar() {
  $('#sidebar').classList.remove('open');
}

// ==================
// Projects
// ==================

function loadProjects() {
  state.projects = load('projects', [
    { id: 'personal', name: 'Personal', icon: '🏠', color: 'blue' },
    { id: 'laundromat', name: 'Laundromat', icon: '🧺', color: 'green' },
    { id: 'nova-dev', name: 'Nova Dev', icon: '✨', color: 'purple' }
  ]);
  
  const currentId = load('currentProject', 'personal');
  state.currentProject = state.projects.find(p => p.id === currentId) || state.projects[0];
  
  loadProjectTasks();
  renderProjectUI();
}

function loadProjectTasks() {
  state.tasks = load(`tasks-${state.currentProject?.id}`, { todo: [], progress: [], done: [] });
}

function renderProjectUI() {
  const p = state.currentProject;
  if (!p) return;
  
  $('#currentProjectIcon').textContent = p.icon;
  $('#currentProjectName').textContent = p.name;
  $('#tasksSubtitle').textContent = `${p.name} Board`;
  
  const list = $('#projectList');
  list.innerHTML = state.projects.map(proj => `
    <div class="project-item ${proj.id === p.id ? 'active' : ''}" onclick="selectProject('${proj.id}')">
      <span>${proj.icon}</span>
      <span>${proj.name}</span>
    </div>
  `).join('');
}

function selectProject(id) {
  state.currentProject = state.projects.find(p => p.id === id);
  save('currentProject', id);
  loadProjectTasks();
  renderProjectUI();
  renderTasks();
  toggleProjectMenu();
  toast(`Switched to ${state.currentProject.name}`);
}

function toggleProjectMenu() {
  $('#projectSwitcher').classList.toggle('open');
}

function openProjectModal() {
  toggleProjectMenu();
  $('#projectForm').reset();
  $('#projectId').value = '';
  $('#projectModal').classList.add('open');
  $('#projectName').focus();
}

function closeProjectModal() {
  $('#projectModal').classList.remove('open');
}

function saveProject(e) {
  e.preventDefault();
  
  const project = {
    id: $('#projectId').value || `proj-${Date.now()}`,
    name: $('#projectName').value,
    icon: $('#projectIcon').value,
    color: $('#projectColor').value
  };
  
  const idx = state.projects.findIndex(p => p.id === project.id);
  if (idx >= 0) {
    state.projects[idx] = project;
  } else {
    state.projects.push(project);
  }
  
  save('projects', state.projects);
  renderProjectUI();
  closeProjectModal();
  toast(`Project "${project.name}" created`);
}

// Close dropdowns on outside click
document.addEventListener('click', (e) => {
  if (!$('#projectSwitcher').contains(e.target)) {
    $('#projectSwitcher').classList.remove('open');
  }
});

// ==================
// Chat
// ==================

function initChat() {
  $('#chatForm').addEventListener('submit', handleChatSubmit);
}

async function loadChatHistory() {
  try {
    const res = await fetch(`${CONFIG.apiUrl}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ getHistory: true })
    });
    
    if (res.ok) {
      const data = await res.json();
      if (data.history?.length) {
        $('#messages').innerHTML = '';
        data.history.slice(-20).forEach(msg => {
          addMessage(msg.content, msg.role, msg.timestamp);
        });
        setConnected(true);
      }
    }
  } catch (e) {
    console.log('Chat history load failed');
  }
}

async function handleChatSubmit(e) {
  e.preventDefault();
  
  const input = $('#messageInput');
  const message = input.value.trim();
  if (!message) return;
  
  addMessage(message, 'user');
  input.value = '';
  input.focus();
  
  const typing = showTyping();
  
  try {
    const res = await fetch(`${CONFIG.apiUrl}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message })
    });
    
    typing.remove();
    
    if (res.ok) {
      const data = await res.json();
      addMessage(data.reply, 'assistant');
      setConnected(true);
    } else {
      throw new Error();
    }
  } catch {
    typing.remove();
    addMessage("Connection issue. Try again! ✨", 'assistant');
    setConnected(false);
  }
}

function addMessage(content, role, timestamp = null) {
  const container = $('#messages');
  const div = document.createElement('div');
  div.className = `message ${role}`;
  
  const avatar = role === 'user' ? '👤' : '✨';
  const time = formatTime(timestamp || new Date());
  
  div.innerHTML = `
    <div class="message-avatar">${avatar}</div>
    <div class="message-body">
      <div class="message-content"><p>${formatMessageText(content)}</p></div>
      <span class="message-time">${time}</span>
    </div>
  `;
  
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function showTyping() {
  const container = $('#messages');
  const div = document.createElement('div');
  div.className = 'message assistant';
  div.innerHTML = `
    <div class="message-avatar">✨</div>
    <div class="message-body">
      <div class="message-content">
        <div class="typing-indicator"><span></span><span></span><span></span></div>
      </div>
    </div>
  `;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
  return div;
}

function formatMessageText(text) {
  return escapeHtml(text)
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br>');
}

// ==================
// Dashboard
// ==================

async function updateDashboard() {
  try {
    const res = await fetch(`${CONFIG.apiUrl}/status`);
    if (res.ok) {
      const data = await res.json();
      $('#gwStatusVal').textContent = data.gateway?.status || 'Unknown';
      $('#gwAgent').textContent = data.gateway?.agent || 'Nova';
      $('#gatewayStatus').className = `status-badge ${data.gateway?.status === 'Online' ? 'online' : 'offline'}`;
      setConnected(true);
    }
  } catch {
    setConnected(false);
  }
  
  updateStats();
  updateUpcomingWidget();
  updateRecentTasksWidget();
}

function updateStats() {
  const taskCount = (state.tasks.todo?.length || 0) + 
                    (state.tasks.progress?.length || 0) + 
                    (state.tasks.done?.length || 0);
  
  $('#statTasks').textContent = taskCount;
  $('#statEvents').textContent = state.events.length;
  $('#statNotes').textContent = state.notes.length;
}

function updateUpcomingWidget() {
  const container = $('#upcomingWidget');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const upcoming = getAllEvents()
    .filter(e => new Date(e.date) >= today)
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(0, 3);
  
  if (!upcoming.length) {
    container.innerHTML = '<div class="events-empty">No upcoming events</div>';
    return;
  }
  
  container.innerHTML = upcoming.map(e => `
    <div class="event-item" onclick="navigateTo('calendar')">
      <div class="event-color ${e.color || 'blue'}"></div>
      <div class="event-info">
        <div class="event-title">${escapeHtml(e.title)}</div>
        <div class="event-time">${formatDate(e.date)} ${e.time || ''}</div>
      </div>
    </div>
  `).join('');
}

function updateRecentTasksWidget() {
  const container = $('#recentTasksWidget');
  const recent = [
    ...(state.tasks.todo || []).map(t => ({ ...t, status: 'todo' })),
    ...(state.tasks.progress || []).map(t => ({ ...t, status: 'progress' }))
  ].slice(0, 3);
  
  if (!recent.length) {
    container.innerHTML = '<div class="events-empty">No recent tasks</div>';
    return;
  }
  
  const icons = { todo: '📥', progress: '🔄' };
  
  container.innerHTML = recent.map(t => `
    <div class="event-item" onclick="navigateTo('tasks')">
      <span style="font-size:1.25rem">${icons[t.status]}</span>
      <div class="event-info">
        <div class="event-title">${escapeHtml(t.title)}</div>
        <div class="event-time">${t.tag || 'task'}</div>
      </div>
    </div>
  `).join('');
}

function refreshDashboard() {
  toast('Refreshing...');
  updateDashboard();
}

function setConnected(connected) {
  state.connected = connected;
  $('#statusDot').className = `status-dot ${connected ? 'online' : 'offline'}`;
  $('#statusText').textContent = connected ? 'Connected' : 'Offline';
}

// ==================
// Kanban Tasks
// ==================

function initKanban() {
  loadProjectTasks();
  setupDragDrop();
  renderTasks();
}

function renderTasks() {
  ['todo', 'progress', 'done'].forEach(status => {
    const container = $(`#${status}Cards`);
    const count = $(`#${status}Count`);
    if (!container) return;
    
    const items = state.tasks[status] || [];
    count.textContent = items.length;
    
    container.innerHTML = items.map((task, i) => `
      <div class="task-card priority-${task.priority || 'medium'}" 
           draggable="true" data-status="${status}" data-index="${i}">
        <div class="task-header">
          <span class="task-title">${escapeHtml(task.title)}</span>
          <div class="task-actions">
            <button onclick="editTask('${status}', ${i})">✏️</button>
            <button onclick="deleteTask('${status}', ${i})">🗑️</button>
          </div>
        </div>
        ${task.description ? `<div class="task-desc">${escapeHtml(task.description)}</div>` : ''}
        <div class="task-footer">
          <span class="task-tag">${getTagEmoji(task.tag)} ${task.tag || 'task'}</span>
        </div>
      </div>
    `).join('');
    
    // Re-attach drag listeners
    container.querySelectorAll('.task-card').forEach(card => {
      card.addEventListener('dragstart', handleDragStart);
      card.addEventListener('dragend', handleDragEnd);
    });
  });
  
  updateStats();
}

function getTagEmoji(tag) {
  const emojis = { task: '🏷️', feature: '✨', bug: '🐛', urgent: '🔥' };
  return emojis[tag] || '🏷️';
}

function setupDragDrop() {
  $$('.kanban-cards').forEach(col => {
    col.addEventListener('dragover', (e) => {
      e.preventDefault();
      col.classList.add('drag-over');
    });
    col.addEventListener('dragleave', () => col.classList.remove('drag-over'));
    col.addEventListener('drop', handleDrop);
  });
}

let draggedTask = null;

function handleDragStart(e) {
  draggedTask = this;
  this.classList.add('dragging');
}

function handleDragEnd() {
  this.classList.remove('dragging');
  $$('.kanban-cards').forEach(c => c.classList.remove('drag-over'));
  draggedTask = null;
}

function handleDrop(e) {
  e.preventDefault();
  this.classList.remove('drag-over');
  
  if (!draggedTask) return;
  
  const from = draggedTask.dataset.status;
  const fromIdx = parseInt(draggedTask.dataset.index);
  const to = this.id.replace('Cards', '');
  
  const [task] = state.tasks[from].splice(fromIdx, 1);
  state.tasks[to].push(task);
  
  saveTasks();
  renderTasks();
  toast(`Moved to ${to}`);
}

function openTaskModal(status = 'todo', index = null) {
  $('#taskForm').reset();
  $('#taskId').value = '';
  $('#taskModalTitle').textContent = 'Add Task';
  
  if (index !== null && state.tasks[status]?.[index]) {
    const task = state.tasks[status][index];
    $('#taskId').value = `${status}:${index}`;
    $('#taskTitle').value = task.title;
    $('#taskDesc').value = task.description || '';
    $('#taskTag').value = task.tag || 'task';
    $('#taskPriority').value = task.priority || 'medium';
    $('#taskModalTitle').textContent = 'Edit Task';
  }
  
  $('#taskModal').classList.add('open');
  $('#taskTitle').focus();
}

function closeTaskModal() {
  $('#taskModal').classList.remove('open');
}

function saveTask(e) {
  e.preventDefault();
  
  const taskId = $('#taskId').value;
  const task = {
    title: $('#taskTitle').value,
    description: $('#taskDesc').value,
    tag: $('#taskTag').value,
    priority: $('#taskPriority').value,
    createdAt: new Date().toISOString()
  };
  
  if (taskId) {
    const [status, index] = taskId.split(':');
    task.createdAt = state.tasks[status][index].createdAt;
    state.tasks[status][parseInt(index)] = task;
    toast('Task updated');
  } else {
    state.tasks.todo.push(task);
    toast('Task created');
  }
  
  saveTasks();
  renderTasks();
  closeTaskModal();
}

function editTask(status, index) {
  openTaskModal(status, index);
}

function deleteTask(status, index) {
  if (confirm('Delete this task?')) {
    state.tasks[status].splice(index, 1);
    saveTasks();
    renderTasks();
    toast('Task deleted');
  }
}

function saveTasks() {
  save(`tasks-${state.currentProject?.id || 'default'}`, state.tasks);
}

// ==================
// Calendar
// ==================

function initCalendar() {
  state.events = load('events', []);
  state.googleEvents = [];
  state.calendarConnected = false;
  renderCalendar();
  syncGoogleCalendar();
}

// Sync with Google Calendar
async function syncGoogleCalendar() {
  try {
    const res = await fetch(`${CONFIG.apiUrl}/calendar/google`);
    if (res.ok) {
      const data = await res.json();
      state.calendarConnected = data.connected;
      state.googleAuthUrl = data.authUrl;
      
      if (data.connected && data.events) {
        state.googleEvents = data.events;
        renderCalendar();
        renderCalendarStatus();
        toast(`📅 Synced ${data.events.length} events from Google`);
      } else if (!data.connected) {
        renderCalendarStatus();
      }
    }
  } catch (e) {
    console.log('Google Calendar sync failed:', e);
  }
}

function renderCalendarStatus() {
  // Add connection status to calendar header if not connected
  const header = document.querySelector('#calendar .view-header');
  if (!header) return;
  
  let statusEl = document.getElementById('calendarConnectStatus');
  if (!statusEl) {
    statusEl = document.createElement('div');
    statusEl.id = 'calendarConnectStatus';
    statusEl.className = 'calendar-connect-status';
    header.appendChild(statusEl);
  }
  
  if (state.calendarConnected) {
    statusEl.innerHTML = '<span class="connect-badge connected">🟢 Google Calendar</span>';
  } else if (state.googleAuthUrl) {
    statusEl.innerHTML = `<a href="${state.googleAuthUrl}" class="btn btn-secondary btn-sm">🔗 Connect Google Calendar</a>`;
  }
}

function getAllEvents() {
  // Merge local and Google events
  const local = state.events || [];
  const google = state.googleEvents || [];
  return [...local, ...google];
}

function renderCalendar() {
  const container = $('#calendarDays');
  if (!container) return;
  
  const year = state.calendarDate.getFullYear();
  const month = state.calendarDate.getMonth();
  
  // Update month display
  $('#calendarMonth').textContent = state.calendarDate.toLocaleDateString('en-US', { 
    month: 'long', year: 'numeric' 
  });
  
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrev = new Date(year, month, 0).getDate();
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  let html = '';
  
  // Prev month
  for (let i = firstDay - 1; i >= 0; i--) {
    const day = daysInPrev - i;
    const date = new Date(year, month - 1, day);
    html += createDayCell(day, date, true);
  }
  
  // Current month
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    const isToday = date.getTime() === today.getTime();
    const isSelected = date.toDateString() === state.selectedDate.toDateString();
    html += createDayCell(day, date, false, isToday, isSelected);
  }
  
  // Next month
  const total = Math.ceil((firstDay + daysInMonth) / 7) * 7;
  const remaining = total - firstDay - daysInMonth;
  for (let day = 1; day <= remaining; day++) {
    const date = new Date(year, month + 1, day);
    html += createDayCell(day, date, true);
  }
  
  container.innerHTML = html;
  updateDayEvents();
}

function createDayCell(day, date, otherMonth, isToday = false, isSelected = false) {
  const dateStr = date.toISOString().split('T')[0];
  const dayEvents = getAllEvents().filter(e => e.date === dateStr);
  
  const classes = ['calendar-day'];
  if (otherMonth) classes.push('other-month');
  if (isToday) classes.push('today');
  if (isSelected) classes.push('selected');
  
  const dots = dayEvents.slice(0, 3).map(e => 
    `<div class="event-dot ${e.color || 'blue'}"></div>`
  ).join('');
  
  return `
    <div class="${classes.join(' ')}" onclick="selectDate('${date.toISOString()}')">
      <span class="day-num">${day}</span>
      <div class="day-dots">${dots}</div>
    </div>
  `;
}

function selectDate(dateStr) {
  state.selectedDate = new Date(dateStr);
  renderCalendar();
}

function updateDayEvents() {
  const container = $('#dayEvents');
  const dateStr = state.selectedDate.toISOString().split('T')[0];
  const dayEvents = getAllEvents().filter(e => e.date === dateStr);
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  $('#selectedDateTitle').textContent = state.selectedDate.getTime() === today.getTime()
    ? "Today's Events"
    : state.selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  
  if (!dayEvents.length) {
    container.innerHTML = '<div class="events-empty">No events</div>';
    return;
  }
  
  container.innerHTML = dayEvents.map((e, i) => {
    const isGoogle = e.source === 'google';
    const localIdx = state.events.indexOf(e);
    const onclick = isGoogle ? '' : `onclick="editEvent(${localIdx})"`;
    const sourceIcon = isGoogle ? '<span class="event-source" title="Google Calendar">📅</span>' : '';
    return `
      <div class="event-item ${isGoogle ? 'google-event' : ''}" ${onclick}>
        <div class="event-color ${e.color || 'blue'}"></div>
        <div class="event-info">
          <div class="event-title">${escapeHtml(e.title)} ${sourceIcon}</div>
          <div class="event-time">${e.time || 'All day'}${e.endTime ? ' - ' + e.endTime : ''}</div>
          ${e.location ? `<div class="event-location">📍 ${escapeHtml(e.location)}</div>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

function changeMonth(delta) {
  state.calendarDate.setMonth(state.calendarDate.getMonth() + delta);
  renderCalendar();
}

function goToToday() {
  state.calendarDate = new Date();
  state.selectedDate = new Date();
  renderCalendar();
}

function openEventModal(index = null) {
  $('#eventForm').reset();
  $('#eventId').value = '';
  $('#eventModalTitle').textContent = 'Add Event';
  $('#eventDate').value = state.selectedDate.toISOString().split('T')[0];
  
  if (index !== null && state.events[index]) {
    const event = state.events[index];
    $('#eventId').value = index;
    $('#eventTitle').value = event.title;
    $('#eventDate').value = event.date;
    $('#eventTime').value = event.time || '';
    $('#eventColor').value = event.color || 'blue';
    $('#eventModalTitle').textContent = 'Edit Event';
  }
  
  $('#eventModal').classList.add('open');
  $('#eventTitle').focus();
}

function closeEventModal() {
  $('#eventModal').classList.remove('open');
}

function saveEvent(e) {
  e.preventDefault();
  
  const eventId = $('#eventId').value;
  const event = {
    title: $('#eventTitle').value,
    date: $('#eventDate').value,
    time: $('#eventTime').value,
    color: $('#eventColor').value
  };
  
  if (eventId !== '') {
    state.events[parseInt(eventId)] = event;
    toast('Event updated');
  } else {
    state.events.push(event);
    toast('Event created');
  }
  
  save('events', state.events);
  renderCalendar();
  updateUpcomingWidget();
  closeEventModal();
}

function editEvent(index) {
  openEventModal(index);
}

// ==================
// Notes
// ==================

async function loadNotes() {
  const containers = {
    daily: $('#dailyNotes'),
    memory: $('#memoryNotes'),
    config: $('#configNotes')
  };
  
  Object.values(containers).forEach(c => {
    if (c) c.innerHTML = '<div class="note-item">Loading...</div>';
  });
  
  try {
    const res = await fetch(`${CONFIG.apiUrl}/notes`);
    if (res.ok) {
      const data = await res.json();
      state.notes = data.notes || [];
      renderNotes();
    }
  } catch {
    state.notes = [
      { id: 'memory', name: 'MEMORY.md', type: 'memory', icon: '🧠' },
      { id: 'soul', name: 'SOUL.md', type: 'config', icon: '✨' }
    ];
    renderNotes();
  }
  
  updateStats();
}

function renderNotes() {
  const containers = {
    daily: $('#dailyNotes'),
    memory: $('#memoryNotes'),
    config: $('#configNotes')
  };
  
  Object.values(containers).forEach(c => { if (c) c.innerHTML = ''; });
  
  state.notes.forEach(note => {
    const item = document.createElement('div');
    item.className = 'note-item';
    item.textContent = `${note.icon || '📄'} ${note.name}`;
    item.onclick = () => selectNote(note, item);
    
    const container = containers[note.type] || containers.config;
    container?.appendChild(item);
  });
}

async function selectNote(note, element) {
  state.currentNote = note;
  
  $$('.note-item').forEach(i => i.classList.remove('active'));
  element?.classList.add('active');
  
  $('#noteTitle').textContent = note.name;
  $('#noteContent').value = 'Loading...';
  $('#noteContent').readOnly = true;
  
  try {
    const res = await fetch(`${CONFIG.apiUrl}/notes?file=${encodeURIComponent(note.id)}`);
    if (res.ok) {
      const data = await res.json();
      $('#noteContent').value = data.content || '';
      $('#noteContent').readOnly = false;
    }
  } catch {
    $('#noteContent').value = 'Failed to load note.';
  }
}

async function saveNote() {
  if (!state.currentNote) return;
  
  try {
    const res = await fetch(`${CONFIG.apiUrl}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        file: state.currentNote.id, 
        content: $('#noteContent').value 
      })
    });
    
    toast(res.ok ? 'Note saved' : 'Failed to save', res.ok ? 'success' : 'error');
  } catch {
    toast('Failed to save', 'error');
  }
}

function copyNote() {
  const content = $('#noteContent').value;
  if (content) {
    navigator.clipboard.writeText(content);
    toast('Copied to clipboard');
  }
}

function refreshNotes() {
  toast('Refreshing...');
  loadNotes();
}

// ==================
// Command Palette
// ==================

const commands = [
  { name: 'Chat', desc: 'Open chat', icon: '💬', action: () => navigateTo('chat'), shortcut: '⌘1', cat: 'Nav' },
  { name: 'Dashboard', desc: 'Open dashboard', icon: '📊', action: () => navigateTo('dashboard'), shortcut: '⌘2', cat: 'Nav' },
  { name: 'Tasks', desc: 'Open tasks', icon: '📋', action: () => navigateTo('tasks'), shortcut: '⌘3', cat: 'Nav' },
  { name: 'Calendar', desc: 'Open calendar', icon: '📆', action: () => navigateTo('calendar'), shortcut: '⌘4', cat: 'Nav' },
  { name: 'Notes', desc: 'Open notes', icon: '📝', action: () => navigateTo('notes'), shortcut: '⌘5', cat: 'Nav' },
  { name: 'New Task', desc: 'Create task', icon: '➕', action: () => { navigateTo('tasks'); setTimeout(openTaskModal, 100); }, cat: 'Actions' },
  { name: 'New Event', desc: 'Create event', icon: '📅', action: () => { navigateTo('calendar'); setTimeout(openEventModal, 100); }, cat: 'Actions' },
  { name: 'Refresh', desc: 'Reload data', icon: '🔄', action: refreshDashboard, cat: 'Actions' },
  { name: 'Theme', desc: 'Change theme', icon: '🎨', action: openThemeModal, cat: 'Settings' }
];

function initCommandPalette() {
  const input = $('#commandInput');
  
  input.addEventListener('input', () => filterCommands(input.value));
  
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      state.commandIndex = Math.min(state.commandIndex + 1, state.filteredCommands.length - 1);
      renderCommands();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      state.commandIndex = Math.max(state.commandIndex - 1, 0);
      renderCommands();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      executeCommand(state.commandIndex);
    }
  });
}

function openCommandPalette() {
  $('#commandInput').value = '';
  state.commandIndex = 0;
  filterCommands('');
  $('#commandPalette').classList.add('open');
  $('#commandInput').focus();
}

function closeCommandPalette() {
  $('#commandPalette').classList.remove('open');
}

function filterCommands(query) {
  const q = query.toLowerCase();
  state.filteredCommands = q 
    ? commands.filter(c => c.name.toLowerCase().includes(q) || c.desc.toLowerCase().includes(q))
    : commands;
  state.commandIndex = 0;
  renderCommands();
}

function renderCommands() {
  const container = $('#commandResults');
  const grouped = {};
  
  state.filteredCommands.forEach(cmd => {
    if (!grouped[cmd.cat]) grouped[cmd.cat] = [];
    grouped[cmd.cat].push(cmd);
  });
  
  let html = '';
  let idx = 0;
  
  for (const [cat, cmds] of Object.entries(grouped)) {
    html += `<div class="command-group"><div class="command-group-title">${cat}</div>`;
    cmds.forEach(cmd => {
      html += `
        <div class="command-item ${idx === state.commandIndex ? 'selected' : ''}" 
             onclick="executeCommand(${idx})">
          <span class="command-icon">${cmd.icon}</span>
          <div class="command-text">
            <div class="command-name">${cmd.name}</div>
            <div class="command-desc">${cmd.desc}</div>
          </div>
          ${cmd.shortcut ? `<span class="command-shortcut">${cmd.shortcut}</span>` : ''}
        </div>
      `;
      idx++;
    });
    html += '</div>';
  }
  
  container.innerHTML = html || '<div class="command-group"><div class="command-group-title">No results</div></div>';
}

function executeCommand(index) {
  const cmd = state.filteredCommands[index];
  if (cmd) {
    closeCommandPalette();
    cmd.action();
  }
}

// ==================
// Theme
// ==================

function loadTheme() {
  const theme = load('theme', 'tokyo');
  setTheme(theme, false);
}

function setTheme(theme, save_= true) {
  document.documentElement.setAttribute('data-theme', theme);
  
  if (save_) {
    save('theme', theme);
    toast(`Theme: ${theme.charAt(0).toUpperCase() + theme.slice(1)}`);
  }
  
  $$('.theme-option').forEach(opt => {
    opt.classList.toggle('active', opt.dataset.theme === theme);
  });
  
  closeThemeModal();
}

function openThemeModal() {
  $('#themeModal').classList.add('open');
}

function closeThemeModal() {
  $('#themeModal').classList.remove('open');
}

// ==================
// FAB
// ==================

function toggleFab() {
  $('#fab').classList.toggle('open');
}

function closeFab() {
  $('#fab').classList.remove('open');
}

function quickAction(type) {
  closeFab();
  
  switch (type) {
    case 'task':
      navigateTo('tasks');
      setTimeout(openTaskModal, 100);
      break;
    case 'event':
      navigateTo('calendar');
      setTimeout(openEventModal, 100);
      break;
    case 'chat':
      navigateTo('chat');
      setTimeout(() => $('#messageInput').focus(), 100);
      break;
  }
}

// Close FAB on outside click
document.addEventListener('click', (e) => {
  if (!$('#fab').contains(e.target)) {
    closeFab();
  }
});

// ==================
// Toast
// ==================

function toast(message, type = 'info') {
  const container = $('#toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  
  container.appendChild(toast);
  
  requestAnimationFrame(() => toast.classList.add('show'));
  
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ==================
// Keyboard Shortcuts
// ==================

document.addEventListener('keydown', (e) => {
  // Escape closes everything
  if (e.key === 'Escape') {
    closeTaskModal();
    closeEventModal();
    closeProjectModal();
    closeThemeModal();
    closeCommandPalette();
    closeFab();
    closeSidebar();
  }
  
  // Command palette
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault();
    openCommandPalette();
  }
  
  // Navigation
  if ((e.metaKey || e.ctrlKey) && ['1','2','3','4','5'].includes(e.key)) {
    e.preventDefault();
    navigateTo(['chat', 'dashboard', 'tasks', 'calendar', 'notes'][parseInt(e.key) - 1]);
  }
});

// ==================
// Global Exports
// ==================

window.navigateTo = navigateTo;
window.toggleSidebar = toggleSidebar;
window.closeSidebar = closeSidebar;
window.selectProject = selectProject;
window.toggleProjectMenu = toggleProjectMenu;
window.openProjectModal = openProjectModal;
window.closeProjectModal = closeProjectModal;
window.saveProject = saveProject;
window.openTaskModal = openTaskModal;
window.closeTaskModal = closeTaskModal;
window.saveTask = saveTask;
window.editTask = editTask;
window.deleteTask = deleteTask;
window.openEventModal = openEventModal;
window.closeEventModal = closeEventModal;
window.saveEvent = saveEvent;
window.editEvent = editEvent;
window.selectDate = selectDate;
window.changeMonth = changeMonth;
window.goToToday = goToToday;
window.syncGoogleCalendar = syncGoogleCalendar;
window.getAllEvents = getAllEvents;
window.refreshDashboard = refreshDashboard;
window.refreshNotes = refreshNotes;
window.saveNote = saveNote;
window.copyNote = copyNote;
window.openCommandPalette = openCommandPalette;
window.closeCommandPalette = closeCommandPalette;
window.executeCommand = executeCommand;
window.openThemeModal = openThemeModal;
window.closeThemeModal = closeThemeModal;
window.setTheme = setTheme;
window.toggleFab = toggleFab;
window.quickAction = quickAction;
