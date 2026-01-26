// Nova Portal v3.0 - Full Featured JavaScript
// Connected to Nova via Clawdbot Gateway
// ==========================================

// Configuration
const CONFIG = {
  apiUrl: 'https://nova-portal-api.ericbaruch.workers.dev/api',
  refreshInterval: 30000,
  storagePrefix: 'nova-'
};

// State
let currentProject = null;
let projects = [];
let tasks = {};
let events = [];
let notes = [];
let currentNote = null;
let currentCalendarDate = new Date();
let selectedDate = new Date();
let commandSelectedIndex = 0;
let filteredCommands = [];

// ==================
// Initialization
// ==================

document.addEventListener('DOMContentLoaded', () => {
  loadTheme();
  loadProjects();
  loadWidgetSettings();
  
  const initialView = location.hash.slice(1) || 'chat';
  if (initialView !== 'chat') navigateTo(initialView);
  
  initKanban();
  initCalendar();
  updateDashboard();
  loadChatHistory();
  
  setInterval(updateDashboard, CONFIG.refreshInterval);
  
  document.getElementById('messageInput')?.focus();
});

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
  
  if (viewId === 'dashboard') updateDashboard();
  if (viewId === 'notes') loadNotes();
  if (viewId === 'tasks') renderTasks();
  if (viewId === 'calendar') renderCalendar();
  
  closeFab();
}

window.addEventListener('popstate', () => {
  navigateTo(location.hash.slice(1) || 'chat');
});

// ==================
// Projects
// ==================

function loadProjects() {
  const saved = localStorage.getItem(`${CONFIG.storagePrefix}projects`);
  if (saved) {
    projects = JSON.parse(saved);
  } else {
    projects = [
      { id: 'personal', name: 'Personal', icon: '🏠', color: 'blue' },
      { id: 'laundromat', name: 'Laundromat', icon: '🧺', color: 'green' },
      { id: 'nova-dev', name: 'Nova Dev', icon: '✨', color: 'purple' }
    ];
    saveProjects();
  }
  
  const savedCurrent = localStorage.getItem(`${CONFIG.storagePrefix}currentProject`);
  currentProject = savedCurrent ? projects.find(p => p.id === savedCurrent) : projects[0];
  
  renderProjectList();
  updateProjectDisplay();
}

function saveProjects() {
  localStorage.setItem(`${CONFIG.storagePrefix}projects`, JSON.stringify(projects));
}

function renderProjectList() {
  const list = document.getElementById('projectList');
  if (!list) return;
  
  list.innerHTML = projects.map(p => `
    <div class="project-item ${p.id === currentProject?.id ? 'active' : ''}" 
         onclick="selectProject('${p.id}')">
      <span>${p.icon}</span>
      <span>${p.name}</span>
    </div>
  `).join('');
}

function selectProject(projectId) {
  currentProject = projects.find(p => p.id === projectId);
  localStorage.setItem(`${CONFIG.storagePrefix}currentProject`, projectId);
  
  updateProjectDisplay();
  renderProjectList();
  toggleProjectMenu();
  loadProjectData();
  showToast(`Switched to ${currentProject.name}`);
}

function updateProjectDisplay() {
  if (!currentProject) return;
  
  document.getElementById('currentProjectIcon').textContent = currentProject.icon;
  document.getElementById('currentProjectName').textContent = currentProject.name;
  document.getElementById('tasksProjectName').textContent = `${currentProject.name} Board`;
}

function loadProjectData() {
  const saved = localStorage.getItem(`${CONFIG.storagePrefix}tasks-${currentProject.id}`);
  tasks = saved ? JSON.parse(saved) : { todo: [], progress: [], done: [] };
  renderTasks();
}

function toggleProjectMenu() {
  document.getElementById('projectSwitcher')?.classList.toggle('open');
}

function openProjectModal() {
  toggleProjectMenu();
  document.getElementById('projectModal')?.classList.add('open');
  document.getElementById('projectForm')?.reset();
  document.getElementById('projectId').value = '';
  document.getElementById('projectName')?.focus();
}

function closeProjectModal() {
  document.getElementById('projectModal')?.classList.remove('open');
}

function saveProject(e) {
  e.preventDefault();
  
  const project = {
    id: document.getElementById('projectId').value || `proj-${Date.now()}`,
    name: document.getElementById('projectName').value,
    icon: document.getElementById('projectIcon').value,
    color: document.getElementById('projectColor').value
  };
  
  const existingIndex = projects.findIndex(p => p.id === project.id);
  if (existingIndex >= 0) {
    projects[existingIndex] = project;
  } else {
    projects.push(project);
  }
  
  saveProjects();
  renderProjectList();
  closeProjectModal();
  showToast(`Project "${project.name}" created`);
}

// Close project menu when clicking outside
document.addEventListener('click', (e) => {
  const switcher = document.getElementById('projectSwitcher');
  if (switcher && !switcher.contains(e.target)) {
    switcher.classList.remove('open');
  }
});

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
        if (messagesContainer) messagesContainer.innerHTML = '';
        data.history.slice(-20).forEach(msg => {
          addMessage(msg.content, msg.role, new Date(msg.timestamp));
        });
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
  messageInput.focus();
  
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
    } else {
      throw new Error('API error');
    }
  } catch (error) {
    removeTyping(typingEl);
    addMessage("Connection issue. Try again! ✨", 'assistant');
    updateConnectionStatus(false);
  }
});

function addMessage(content, role, timestamp = null) {
  const div = document.createElement('div');
  div.className = `message ${role}`;
  const avatar = role === 'user' ? '👤' : '✨';
  const time = timestamp ? new Date(timestamp) : new Date();
  
  div.innerHTML = `
    <div class="message-avatar">${avatar}</div>
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
  div.innerHTML = `
    <div class="message-avatar">✨</div>
    <div class="message-body">
      <div class="message-content">
        <div class="typing-indicator"><span></span><span></span><span></span></div>
      </div>
    </div>
  `;
  messagesContainer?.appendChild(div);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
  return div;
}

function removeTyping(el) {
  el?.remove();
}

function formatMessage(text) {
  return escapeHtml(text)
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br>');
}

// ==================
// Dashboard & Widgets
// ==================

async function updateDashboard() {
  try {
    const response = await fetch(`${CONFIG.apiUrl}/status`);
    
    if (response.ok) {
      const data = await response.json();
      
      // Gateway status
      const gwStatus = document.getElementById('vm-status');
      const gwCpu = document.getElementById('vm-cpu');
      const gwMem = document.getElementById('vm-memory');
      if (gwStatus) gwStatus.textContent = data.gateway?.status || 'Unknown';
      if (gwCpu) gwCpu.textContent = data.gateway?.agent || 'Unknown';
      if (gwMem) gwMem.textContent = data.gateway?.url?.replace('https://', '') || 'N/A';
      updateIndicator('vm-indicator', data.gateway?.status === 'Online');
      updateIndicator('ec2-indicator', true);
      
      updateConnectionStatus(true);
    }
  } catch (error) {
    console.log('Dashboard update failed:', error);
    updateConnectionStatus(false);
  }
  
  // Update stats
  updateQuickStats();
  updateUpcomingEvents();
  updateRecentTasks();
  
  const lastUpdated = document.getElementById('lastUpdated');
  if (lastUpdated) lastUpdated.textContent = `Last updated: ${formatTime(new Date())}`;
}

function updateQuickStats() {
  const projectTasks = tasks;
  const totalTasks = (projectTasks.todo?.length || 0) + 
                    (projectTasks.progress?.length || 0) + 
                    (projectTasks.done?.length || 0);
  
  document.getElementById('stat-tasks').textContent = totalTasks;
  document.getElementById('stat-events').textContent = events.length;
  document.getElementById('stat-notes').textContent = notes.length || 0;
}

function updateUpcomingEvents() {
  const container = document.getElementById('upcomingEvents');
  if (!container) return;
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const upcoming = events
    .filter(e => new Date(e.date) >= today)
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(0, 3);
  
  if (upcoming.length === 0) {
    container.innerHTML = '<div class="upcoming-empty">No upcoming events</div>';
    return;
  }
  
  container.innerHTML = upcoming.map(e => `
    <div class="upcoming-item" onclick="navigateTo('calendar')">
      <div class="upcoming-dot ${e.color || 'blue'}"></div>
      <div class="upcoming-info">
        <div class="upcoming-title">${escapeHtml(e.title)}</div>
        <div class="upcoming-time">${formatEventDate(e.date)} ${e.time || ''}</div>
      </div>
    </div>
  `).join('');
}

function updateRecentTasks() {
  const container = document.getElementById('recentTasks');
  if (!container) return;
  
  const allTasks = [
    ...(tasks.todo || []).map(t => ({ ...t, status: 'todo' })),
    ...(tasks.progress || []).map(t => ({ ...t, status: 'progress' }))
  ].slice(0, 3);
  
  if (allTasks.length === 0) {
    container.innerHTML = '<div class="upcoming-empty">No recent tasks</div>';
    return;
  }
  
  const statusIcons = { todo: '📥', progress: '🔄', done: '✅' };
  
  container.innerHTML = allTasks.map(t => `
    <div class="recent-task-item" onclick="navigateTo('tasks')">
      <span>${statusIcons[t.status]}</span>
      <div class="task-info">
        <div class="task-title">${escapeHtml(t.title)}</div>
        <div class="task-meta">${t.tag || 'task'}</div>
      </div>
    </div>
  `).join('');
}

function updateIndicator(id, online) {
  const el = document.getElementById(id);
  if (el) el.className = `card-status ${online ? 'online' : 'offline'}`;
}

function refreshDashboard() {
  showToast('Refreshing...');
  updateDashboard();
}

// Widget Settings
function loadWidgetSettings() {
  const saved = localStorage.getItem(`${CONFIG.storagePrefix}widgets`);
  const settings = saved ? JSON.parse(saved) : {};
  
  document.querySelectorAll('.widget').forEach(widget => {
    const widgetId = widget.dataset.widget;
    if (settings[widgetId] === false) {
      widget.style.display = 'none';
    }
  });
  
  document.querySelectorAll('.widget-toggle input').forEach(input => {
    const widgetId = input.dataset.widget;
    input.checked = settings[widgetId] !== false;
  });
}

function saveWidgetSettings() {
  const settings = {};
  document.querySelectorAll('.widget-toggle input').forEach(input => {
    settings[input.dataset.widget] = input.checked;
  });
  
  localStorage.setItem(`${CONFIG.storagePrefix}widgets`, JSON.stringify(settings));
  
  document.querySelectorAll('.widget').forEach(widget => {
    widget.style.display = settings[widget.dataset.widget] !== false ? '' : 'none';
  });
  
  showToast('Widget settings saved');
}

function openWidgetModal() {
  document.getElementById('widgetModal')?.classList.add('open');
}

function closeWidgetModal() {
  document.getElementById('widgetModal')?.classList.remove('open');
}

// ==================
// Kanban Tasks
// ==================

function initKanban() {
  loadProjectData();
  setupDragAndDrop();
  renderTasks();
}

function renderTasks() {
  ['todo', 'progress', 'done'].forEach(status => {
    const container = document.getElementById(`${status}-cards`);
    const countEl = document.getElementById(`${status}-count`);
    if (!container) return;
    
    container.innerHTML = '';
    const statusTasks = tasks[status] || [];
    if (countEl) countEl.textContent = statusTasks.length;
    
    statusTasks.forEach((task, index) => {
      container.appendChild(createTaskCard(task, status, index));
    });
  });
}

function createTaskCard(task, status, index) {
  const card = document.createElement('div');
  card.className = `kanban-card priority-${task.priority || 'medium'}`;
  card.draggable = true;
  card.dataset.status = status;
  card.dataset.index = index;
  
  const tagEmoji = { task: '🏷️', feature: '✨', bug: '🐛', infra: '🔧', docs: '📝', urgent: '🔥' };
  
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
    </div>
  `;
  
  card.addEventListener('dragstart', handleDragStart);
  card.addEventListener('dragend', handleDragEnd);
  
  return card;
}

function setupDragAndDrop() {
  document.querySelectorAll('.kanban-cards').forEach(column => {
    column.addEventListener('dragover', handleDragOver);
    column.addEventListener('dragleave', handleDragLeave);
    column.addEventListener('drop', handleDrop);
  });
}

let draggedCard = null;

function handleDragStart(e) {
  draggedCard = this;
  this.classList.add('dragging');
}

function handleDragEnd() {
  this.classList.remove('dragging');
  document.querySelectorAll('.kanban-cards').forEach(col => col.classList.remove('drag-over'));
  draggedCard = null;
}

function handleDragOver(e) {
  e.preventDefault();
  this.classList.add('drag-over');
}

function handleDragLeave() {
  this.classList.remove('drag-over');
}

function handleDrop(e) {
  e.preventDefault();
  this.classList.remove('drag-over');
  
  if (!draggedCard) return;
  
  const fromStatus = draggedCard.dataset.status;
  const fromIndex = parseInt(draggedCard.dataset.index);
  const toStatus = this.id.replace('-cards', '');
  
  const [task] = tasks[fromStatus].splice(fromIndex, 1);
  tasks[toStatus].push(task);
  
  saveTasks();
  renderTasks();
  showToast(`Moved to ${toStatus}`);
}

function openTaskModal(status = 'todo', index = null) {
  const modal = document.getElementById('taskModal');
  const form = document.getElementById('taskForm');
  
  form?.reset();
  document.getElementById('taskId').value = '';
  document.getElementById('modalTitle').textContent = 'Add Task';
  
  if (index !== null && tasks[status]?.[index]) {
    const task = tasks[status][index];
    document.getElementById('taskId').value = `${status}:${index}`;
    document.getElementById('taskTitle').value = task.title;
    document.getElementById('taskDescription').value = task.description || '';
    document.getElementById('taskTag').value = task.tag || 'task';
    document.getElementById('taskPriority').value = task.priority || 'medium';
    document.getElementById('modalTitle').textContent = 'Edit Task';
  }
  
  modal?.classList.add('open');
  document.getElementById('taskTitle')?.focus();
}

function closeTaskModal() {
  document.getElementById('taskModal')?.classList.remove('open');
}

function saveTask(e) {
  e.preventDefault();
  
  const taskId = document.getElementById('taskId').value;
  const task = {
    title: document.getElementById('taskTitle').value,
    description: document.getElementById('taskDescription').value,
    tag: document.getElementById('taskTag').value,
    priority: document.getElementById('taskPriority').value,
    createdAt: new Date().toISOString()
  };
  
  if (taskId) {
    const [status, index] = taskId.split(':');
    task.createdAt = tasks[status][index].createdAt;
    tasks[status][index] = task;
    showToast('Task updated');
  } else {
    if (!tasks.todo) tasks.todo = [];
    tasks.todo.push(task);
    showToast('Task created');
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
    tasks[status].splice(index, 1);
    saveTasks();
    renderTasks();
    showToast('Task deleted');
  }
}

function saveTasks() {
  localStorage.setItem(`${CONFIG.storagePrefix}tasks-${currentProject?.id || 'default'}`, JSON.stringify(tasks));
  
  fetch(`${CONFIG.apiUrl}/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId: currentProject?.id, tasks })
  }).catch(() => {});
}

// ==================
// Calendar
// ==================

function initCalendar() {
  const saved = localStorage.getItem(`${CONFIG.storagePrefix}events`);
  events = saved ? JSON.parse(saved) : [];
  renderCalendar();
}

function renderCalendar() {
  const container = document.getElementById('calendarDays');
  if (!container) return;
  
  const year = currentCalendarDate.getFullYear();
  const month = currentCalendarDate.getMonth();
  
  // Update month display
  const monthName = currentCalendarDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  document.getElementById('calendarMonth').textContent = monthName;
  
  // Get first day of month and total days
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  let html = '';
  
  // Previous month days
  for (let i = firstDay - 1; i >= 0; i--) {
    const day = daysInPrevMonth - i;
    const date = new Date(year, month - 1, day);
    const dayEvents = getEventsForDate(date);
    html += createDayCell(day, date, true, dayEvents);
  }
  
  // Current month days
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    const isToday = date.getTime() === today.getTime();
    const isSelected = date.toDateString() === selectedDate.toDateString();
    const dayEvents = getEventsForDate(date);
    html += createDayCell(day, date, false, dayEvents, isToday, isSelected);
  }
  
  // Next month days
  const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;
  const remainingCells = totalCells - firstDay - daysInMonth;
  for (let day = 1; day <= remainingCells; day++) {
    const date = new Date(year, month + 1, day);
    const dayEvents = getEventsForDate(date);
    html += createDayCell(day, date, true, dayEvents);
  }
  
  container.innerHTML = html;
  updateEventsList();
}

function createDayCell(day, date, otherMonth, dayEvents, isToday = false, isSelected = false) {
  const classes = ['calendar-day'];
  if (otherMonth) classes.push('other-month');
  if (isToday) classes.push('today');
  if (isSelected) classes.push('selected');
  
  const dotsHtml = dayEvents.slice(0, 3).map(e => 
    `<div class="day-event-dot ${e.color || 'blue'}"></div>`
  ).join('');
  
  return `
    <div class="${classes.join(' ')}" onclick="selectCalendarDate('${date.toISOString()}')">
      <span class="day-number">${day}</span>
      <div class="day-events">${dotsHtml}</div>
    </div>
  `;
}

function getEventsForDate(date) {
  const dateStr = date.toISOString().split('T')[0];
  return events.filter(e => e.date === dateStr);
}

function selectCalendarDate(dateStr) {
  selectedDate = new Date(dateStr);
  renderCalendar();
}

function updateEventsList() {
  const container = document.getElementById('eventsList');
  const titleEl = document.getElementById('selectedDateTitle');
  if (!container) return;
  
  const dateStr = selectedDate.toISOString().split('T')[0];
  const dayEvents = events.filter(e => e.date === dateStr);
  
  // Update title
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (selectedDate.getTime() === today.getTime()) {
    titleEl.textContent = "Today's Events";
  } else {
    titleEl.textContent = selectedDate.toLocaleDateString('en-US', { 
      weekday: 'long', month: 'short', day: 'numeric' 
    });
  }
  
  if (dayEvents.length === 0) {
    container.innerHTML = '<div class="event-empty">No events for this day</div>';
    return;
  }
  
  container.innerHTML = dayEvents.map((e, i) => `
    <div class="event-item" onclick="editEvent(${events.indexOf(e)})">
      <div class="event-color ${e.color || 'blue'}"></div>
      <div class="event-details">
        <div class="event-title">${escapeHtml(e.title)}</div>
        <div class="event-time">${e.time || 'All day'}</div>
      </div>
    </div>
  `).join('');
}

function changeMonth(delta) {
  currentCalendarDate.setMonth(currentCalendarDate.getMonth() + delta);
  renderCalendar();
}

function goToToday() {
  currentCalendarDate = new Date();
  selectedDate = new Date();
  renderCalendar();
}

function openEventModal(index = null) {
  const modal = document.getElementById('eventModal');
  const form = document.getElementById('eventForm');
  
  form?.reset();
  document.getElementById('eventId').value = '';
  document.getElementById('eventModalTitle').textContent = 'Add Event';
  
  // Set default date to selected date
  document.getElementById('eventDate').value = selectedDate.toISOString().split('T')[0];
  
  if (index !== null && events[index]) {
    const event = events[index];
    document.getElementById('eventId').value = index;
    document.getElementById('eventTitle').value = event.title;
    document.getElementById('eventDate').value = event.date;
    document.getElementById('eventTime').value = event.time || '';
    document.getElementById('eventDescription').value = event.description || '';
    document.getElementById('eventColor').value = event.color || 'blue';
    document.getElementById('eventModalTitle').textContent = 'Edit Event';
  }
  
  modal?.classList.add('open');
  document.getElementById('eventTitle')?.focus();
}

function closeEventModal() {
  document.getElementById('eventModal')?.classList.remove('open');
}

function saveEvent(e) {
  e.preventDefault();
  
  const eventId = document.getElementById('eventId').value;
  const event = {
    title: document.getElementById('eventTitle').value,
    date: document.getElementById('eventDate').value,
    time: document.getElementById('eventTime').value,
    description: document.getElementById('eventDescription').value,
    color: document.getElementById('eventColor').value
  };
  
  if (eventId !== '') {
    events[parseInt(eventId)] = event;
    showToast('Event updated');
  } else {
    events.push(event);
    showToast('Event created');
  }
  
  saveEvents();
  renderCalendar();
  closeEventModal();
}

function editEvent(index) {
  openEventModal(index);
}

function saveEvents() {
  localStorage.setItem(`${CONFIG.storagePrefix}events`, JSON.stringify(events));
}

function formatEventDate(dateStr) {
  const date = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  if (date.getTime() === today.getTime()) return 'Today';
  if (date.getTime() === tomorrow.getTime()) return 'Tomorrow';
  
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ==================
// Notes
// ==================

async function loadNotes() {
  const containers = {
    daily: document.getElementById('daily-notes'),
    memory: document.getElementById('memory-notes'),
    config: document.getElementById('config-notes')
  };
  
  Object.values(containers).forEach(c => {
    if (c) c.innerHTML = '<div class="note-item loading">Loading...</div>';
  });
  
  try {
    const response = await fetch(`${CONFIG.apiUrl}/notes`);
    if (response.ok) {
      const data = await response.json();
      notes = data.notes || [];
      renderNotes();
    }
  } catch {
    notes = [
      { id: 'memory', name: 'MEMORY.md', type: 'memory', icon: '🧠' },
      { id: 'soul', name: 'SOUL.md', type: 'config', icon: '✨' }
    ];
    renderNotes();
  }
}

function renderNotes() {
  const containers = {
    daily: document.getElementById('daily-notes'),
    memory: document.getElementById('memory-notes'),
    config: document.getElementById('config-notes')
  };
  
  Object.values(containers).forEach(c => { if (c) c.innerHTML = ''; });
  
  notes.forEach(note => {
    const item = document.createElement('div');
    item.className = 'note-item';
    item.onclick = () => selectNote(note, item);
    item.innerHTML = `<span>${note.icon || '📄'} ${note.name}</span>`;
    
    const container = containers[note.type] || containers.config;
    container?.appendChild(item);
  });
}

async function selectNote(note, element) {
  currentNote = note;
  
  document.querySelectorAll('.note-item').forEach(i => i.classList.remove('active'));
  element?.classList.add('active');
  
  const titleEl = document.getElementById('noteTitle');
  const contentEl = document.getElementById('noteContent');
  
  if (titleEl) titleEl.textContent = note.name;
  if (contentEl) {
    contentEl.value = 'Loading...';
    contentEl.readOnly = true;
  }
  
  try {
    const response = await fetch(`${CONFIG.apiUrl}/notes?file=${encodeURIComponent(note.id)}`);
    if (response.ok) {
      const data = await response.json();
      if (contentEl) {
        contentEl.value = data.content || '';
        contentEl.readOnly = false;
      }
    }
  } catch {
    if (contentEl) contentEl.value = 'Failed to load note.';
  }
}

async function saveNote() {
  if (!currentNote) return;
  
  const content = document.getElementById('noteContent')?.value;
  
  try {
    const response = await fetch(`${CONFIG.apiUrl}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file: currentNote.id, content })
    });
    
    if (response.ok) {
      showToast('Note saved');
    } else {
      showToast('Failed to save', 'error');
    }
  } catch {
    showToast('Failed to save', 'error');
  }
}

function copyNote() {
  const content = document.getElementById('noteContent')?.value;
  if (content) {
    navigator.clipboard.writeText(content);
    showToast('Copied to clipboard');
  }
}

function refreshNotes() {
  showToast('Refreshing...');
  loadNotes();
}

// ==================
// Command Palette
// ==================

const commands = [
  // Navigation
  { name: 'Go to Chat', desc: 'Open chat view', icon: '💬', action: () => navigateTo('chat'), shortcut: '⌘1', category: 'Navigation' },
  { name: 'Go to Dashboard', desc: 'Open dashboard', icon: '📊', action: () => navigateTo('dashboard'), shortcut: '⌘2', category: 'Navigation' },
  { name: 'Go to Tasks', desc: 'Open task board', icon: '📋', action: () => navigateTo('tasks'), shortcut: '⌘3', category: 'Navigation' },
  { name: 'Go to Calendar', desc: 'Open calendar', icon: '📆', action: () => navigateTo('calendar'), shortcut: '⌘4', category: 'Navigation' },
  { name: 'Go to Notes', desc: 'Open notes', icon: '📝', action: () => navigateTo('notes'), shortcut: '⌘5', category: 'Navigation' },
  
  // Actions
  { name: 'New Task', desc: 'Create a new task', icon: '➕', action: () => { navigateTo('tasks'); setTimeout(() => openTaskModal(), 100); }, category: 'Actions' },
  { name: 'New Event', desc: 'Create a new event', icon: '📅', action: () => { navigateTo('calendar'); setTimeout(() => openEventModal(), 100); }, category: 'Actions' },
  { name: 'New Project', desc: 'Create a new project', icon: '📁', action: openProjectModal, category: 'Actions' },
  { name: 'Refresh Dashboard', desc: 'Reload all data', icon: '🔄', action: refreshDashboard, category: 'Actions' },
  
  // Settings
  { name: 'Change Theme', desc: 'Switch color scheme', icon: '🎨', action: openThemeModal, category: 'Settings' },
  { name: 'Widget Settings', desc: 'Configure dashboard', icon: '⚙️', action: openWidgetModal, category: 'Settings' },
  
  // Projects
  ...projects.map(p => ({
    name: `Switch to ${p.name}`,
    desc: `Open ${p.name} project`,
    icon: p.icon,
    action: () => selectProject(p.id),
    category: 'Projects'
  }))
];

function openCommandPalette() {
  const palette = document.getElementById('commandPalette');
  const input = document.getElementById('commandInput');
  
  palette?.classList.add('open');
  input.value = '';
  input?.focus();
  
  commandSelectedIndex = 0;
  filterCommands('');
}

function closeCommandPalette() {
  document.getElementById('commandPalette')?.classList.remove('open');
}

function filterCommands(query) {
  const resultsContainer = document.getElementById('commandResults');
  if (!resultsContainer) return;
  
  const q = query.toLowerCase();
  filteredCommands = q ? commands.filter(c => 
    c.name.toLowerCase().includes(q) || 
    c.desc.toLowerCase().includes(q) ||
    c.category.toLowerCase().includes(q)
  ) : commands;
  
  // Group by category
  const grouped = {};
  filteredCommands.forEach(cmd => {
    if (!grouped[cmd.category]) grouped[cmd.category] = [];
    grouped[cmd.category].push(cmd);
  });
  
  let html = '';
  let index = 0;
  
  for (const [category, cmds] of Object.entries(grouped)) {
    html += `<div class="command-group"><div class="command-group-title">${category}</div>`;
    cmds.forEach(cmd => {
      html += `
        <div class="command-item ${index === commandSelectedIndex ? 'selected' : ''}" 
             data-index="${index}" onclick="executeCommand(${index})">
          <span class="command-item-icon">${cmd.icon}</span>
          <div class="command-item-text">
            <div class="command-item-name">${cmd.name}</div>
            <div class="command-item-desc">${cmd.desc}</div>
          </div>
          ${cmd.shortcut ? `<span class="command-item-shortcut">${cmd.shortcut}</span>` : ''}
        </div>
      `;
      index++;
    });
    html += '</div>';
  }
  
  resultsContainer.innerHTML = html || '<div class="command-group"><div class="command-group-title">No results</div></div>';
}

function executeCommand(index) {
  const cmd = filteredCommands[index];
  if (cmd) {
    closeCommandPalette();
    cmd.action();
  }
}

document.getElementById('commandInput')?.addEventListener('input', (e) => {
  filterCommands(e.target.value);
});

document.getElementById('commandInput')?.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    commandSelectedIndex = Math.min(commandSelectedIndex + 1, filteredCommands.length - 1);
    filterCommands(document.getElementById('commandInput').value);
    scrollCommandIntoView();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    commandSelectedIndex = Math.max(commandSelectedIndex - 1, 0);
    filterCommands(document.getElementById('commandInput').value);
    scrollCommandIntoView();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    executeCommand(commandSelectedIndex);
  }
});

function scrollCommandIntoView() {
  const selected = document.querySelector('.command-item.selected');
  selected?.scrollIntoView({ block: 'nearest' });
}

// ==================
// Theme Management
// ==================

function loadTheme() {
  const saved = localStorage.getItem(`${CONFIG.storagePrefix}theme`) || 'tokyo';
  setTheme(saved, false);
}

function setTheme(theme, save = true) {
  document.documentElement.setAttribute('data-theme', theme);
  
  if (save) {
    localStorage.setItem(`${CONFIG.storagePrefix}theme`, theme);
    showToast(`Theme: ${theme.charAt(0).toUpperCase() + theme.slice(1)}`);
  }
  
  // Update active state
  document.querySelectorAll('.theme-option').forEach(opt => {
    opt.classList.toggle('active', opt.dataset.theme === theme);
  });
  
  closeThemeModal();
}

function openThemeModal() {
  document.getElementById('themeModal')?.classList.add('open');
}

function closeThemeModal() {
  document.getElementById('themeModal')?.classList.remove('open');
}

// ==================
// FAB (Quick Actions)
// ==================

function toggleFab() {
  document.getElementById('fabContainer')?.classList.toggle('open');
}

function closeFab() {
  document.getElementById('fabContainer')?.classList.remove('open');
}

function quickAction(type) {
  closeFab();
  
  switch (type) {
    case 'task':
      navigateTo('tasks');
      setTimeout(() => openTaskModal(), 100);
      break;
    case 'event':
      navigateTo('calendar');
      setTimeout(() => openEventModal(), 100);
      break;
    case 'chat':
      navigateTo('chat');
      setTimeout(() => document.getElementById('messageInput')?.focus(), 100);
      break;
    case 'note':
      navigateTo('notes');
      break;
  }
}

// Close FAB when clicking outside
document.addEventListener('click', (e) => {
  const fab = document.getElementById('fabContainer');
  if (fab && !fab.contains(e.target)) {
    fab.classList.remove('open');
  }
});

// ==================
// Connection Status
// ==================

function updateConnectionStatus(connected) {
  const indicator = document.getElementById('connectionStatus');
  const text = document.getElementById('connectionText');
  
  if (indicator) indicator.className = `status-indicator ${connected ? 'online' : 'offline'}`;
  if (text) text.textContent = connected ? 'Connected' : 'Offline';
}

// ==================
// Toast
// ==================

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  
  container.appendChild(toast);
  
  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ==================
// Utilities
// ==================

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
  // Escape closes modals
  if (e.key === 'Escape') {
    closeTaskModal();
    closeEventModal();
    closeProjectModal();
    closeThemeModal();
    closeWidgetModal();
    closeCommandPalette();
    closeFab();
  }
  
  // Command palette
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault();
    openCommandPalette();
  }
  
  // Navigation shortcuts
  if ((e.metaKey || e.ctrlKey) && ['1','2','3','4','5'].includes(e.key)) {
    e.preventDefault();
    navigateTo(['chat', 'dashboard', 'tasks', 'calendar', 'notes'][parseInt(e.key) - 1]);
  }
});

// Click outside command palette to close
document.getElementById('commandPalette')?.addEventListener('click', (e) => {
  if (e.target.id === 'commandPalette') {
    closeCommandPalette();
  }
});

// ==================
// Global Exports
// ==================

window.openTaskModal = openTaskModal;
window.closeTaskModal = closeTaskModal;
window.saveTask = saveTask;
window.editTask = editTask;
window.deleteTask = deleteTask;
window.openEventModal = openEventModal;
window.closeEventModal = closeEventModal;
window.saveEvent = saveEvent;
window.editEvent = editEvent;
window.openProjectModal = openProjectModal;
window.closeProjectModal = closeProjectModal;
window.saveProject = saveProject;
window.selectProject = selectProject;
window.toggleProjectMenu = toggleProjectMenu;
window.openThemeModal = openThemeModal;
window.closeThemeModal = closeThemeModal;
window.setTheme = setTheme;
window.openWidgetModal = openWidgetModal;
window.closeWidgetModal = closeWidgetModal;
window.saveWidgetSettings = saveWidgetSettings;
window.openCommandPalette = openCommandPalette;
window.closeCommandPalette = closeCommandPalette;
window.executeCommand = executeCommand;
window.toggleFab = toggleFab;
window.quickAction = quickAction;
window.refreshDashboard = refreshDashboard;
window.refreshNotes = refreshNotes;
window.saveNote = saveNote;
window.copyNote = copyNote;
window.navigateTo = navigateTo;
window.changeMonth = changeMonth;
window.goToToday = goToToday;
window.selectCalendarDate = selectCalendarDate;
