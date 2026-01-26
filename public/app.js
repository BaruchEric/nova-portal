// Nova Portal v3.1 - Complete Feature Set
// Real-time Status, Widget Customization, Project Manager, Notifications
// ======================================================================

const CONFIG = {
  apiUrl: 'https://nova-portal-api.ericbaruch.workers.dev/api',
  refreshInterval: 30000,
  storagePrefix: 'nova-'
};

// ==================
// State
// ==================

let currentProject = 'personal';
let projects = {};
let events = [];
let notes = [];
let currentNote = null;
let calendarDate = new Date();
let widgets = { enabled: [], available: [] };
let notifications = [];
let statusData = null;

// ==================
// Initialize
// ==================

document.addEventListener('DOMContentLoaded', async () => {
  loadTheme();
  await Promise.all([
    loadProjects(),
    loadEvents(),
    loadWidgets(),
    loadNotifications(),
    loadChatHistory()
  ]);
  
  renderDashboard();
  renderNotificationBadge();
  
  const initialView = location.hash.slice(1) || 'chat';
  if (initialView !== 'chat') navigateTo(initialView);
  
  // Real-time status updates
  updateStatus();
  setInterval(updateStatus, CONFIG.refreshInterval);
  
  // Check for due reminders
  setInterval(checkReminders, 60000);
  
  messageInput?.focus();
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
  
  if (viewId === 'dashboard') renderDashboard();
  if (viewId === 'calendar') renderCalendar();
  if (viewId === 'notes') loadNotes();
  if (viewId === 'tasks') renderTasks();
  if (viewId === 'reports') loadReports();
}

window.addEventListener('popstate', () => navigateTo(location.hash.slice(1) || 'chat'));

// ==================
// Real-time Status
// ==================

async function updateStatus() {
  try {
    const response = await fetch(`${CONFIG.apiUrl}/status`);
    if (response.ok) {
      statusData = await response.json();
      updateConnectionStatus(statusData.gateway?.status === 'Online');
      if (document.getElementById('dashboard')?.classList.contains('active')) {
        renderDashboard();
      }
    }
  } catch {
    updateConnectionStatus(false);
  }
}

// ==================
// Command Palette
// ==================

const commands = [
  { id: 'chat', icon: '💬', label: 'Go to Chat', shortcut: '⌘1', action: () => navigateTo('chat') },
  { id: 'dashboard', icon: '📊', label: 'Go to Dashboard', shortcut: '⌘2', action: () => navigateTo('dashboard') },
  { id: 'tasks', icon: '📋', label: 'Go to Tasks', shortcut: '⌘3', action: () => navigateTo('tasks') },
  { id: 'calendar', icon: '📆', label: 'Go to Calendar', shortcut: '⌘4', action: () => navigateTo('calendar') },
  { id: 'notes', icon: '📝', label: 'Go to Notes', shortcut: '⌘5', action: () => navigateTo('notes') },
  { id: 'new-task', icon: '➕', label: 'New Task', action: () => { closeCommandPalette(); openTaskModal(); } },
  { id: 'new-event', icon: '📅', label: 'New Event', action: () => { closeCommandPalette(); openEventModal(); } },
  { id: 'new-project', icon: '📁', label: 'New Project', action: () => { closeCommandPalette(); openProjectModal(); } },
  { id: 'widgets', icon: '🧩', label: 'Customize Widgets', action: () => { closeCommandPalette(); openWidgetPicker(); } },
  { id: 'theme', icon: '🎨', label: 'Change Theme', action: () => { closeCommandPalette(); openThemePicker(); } },
  { id: 'notifications', icon: '🔔', label: 'View Notifications', action: () => { closeCommandPalette(); openNotifications(); } },
  { id: 'refresh', icon: '🔄', label: 'Refresh All', action: () => location.reload() },
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
  if (e.key === 'ArrowDown') { e.preventDefault(); paletteIndex = Math.min(paletteIndex + 1, filteredCommands.length - 1); renderPaletteResults(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); paletteIndex = Math.max(paletteIndex - 1, 0); renderPaletteResults(); }
  else if (e.key === 'Enter' && filteredCommands[paletteIndex]) { e.preventDefault(); executeCommand(filteredCommands[paletteIndex].id); }
});

function executeCommand(id) {
  const cmd = commands.find(c => c.id === id);
  if (cmd) { closeCommandPalette(); cmd.action(); }
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
// Dashboard & Widgets
// ==================

async function loadWidgets() {
  try {
    const response = await fetch(`${CONFIG.apiUrl}/widgets`);
    if (response.ok) {
      widgets = await response.json();
    }
  } catch {}
}

function renderDashboard() {
  const grid = document.getElementById('dashboardGrid');
  if (!grid) return;
  
  grid.innerHTML = widgets.enabled.map(id => renderWidget(id)).join('');
  document.getElementById('lastUpdated').textContent = `Last updated: ${formatTime(new Date())}`;
}

function renderWidget(id) {
  const s = statusData || {};
  const stats = s.stats || {};
  
  switch(id) {
    case 'status-gateway':
      return `<div class="widget" data-widget="${id}">
        <div class="widget-header"><h3>🤖 Gateway</h3><span class="card-status ${s.gateway?.status === 'Online' ? 'online' : 'offline'}"></span></div>
        <div class="widget-body">
          <div class="stat"><span class="stat-value">${s.gateway?.status || 'Unknown'}</span><span class="stat-label">Status</span></div>
          <div class="stat"><span class="stat-value">${s.gateway?.latency ? s.gateway.latency + 'ms' : '—'}</span><span class="stat-label">Latency</span></div>
          <div class="stat"><span class="stat-value">${s.gateway?.agent || 'Unknown'}</span><span class="stat-label">Agent</span></div>
        </div>
      </div>`;
    case 'status-portal':
      return `<div class="widget" data-widget="${id}">
        <div class="widget-header"><h3>✨ Portal</h3><span class="card-status online"></span></div>
        <div class="widget-body">
          <div class="stat"><span class="stat-value">Online</span><span class="stat-label">Status</span></div>
          <div class="stat"><span class="stat-value">v3.1</span><span class="stat-label">Version</span></div>
        </div>
      </div>`;
    case 'status-tunnel':
      return `<div class="widget" data-widget="${id}">
        <div class="widget-header"><h3>🔗 Tunnel</h3><span class="card-status ${s.tunnel?.status === 'Connected' ? 'online' : 'offline'}"></span></div>
        <div class="widget-body">
          <div class="stat"><span class="stat-value">${s.tunnel?.status || 'Unknown'}</span><span class="stat-label">Status</span></div>
        </div>
      </div>`;
    case 'stats-tasks':
      return `<div class="widget" data-widget="${id}">
        <div class="widget-header"><h3>📋 Tasks</h3></div>
        <div class="widget-body">
          <div class="stat"><span class="stat-value">${stats.tasks?.todo || 0}</span><span class="stat-label">To Do</span></div>
          <div class="stat"><span class="stat-value">${stats.tasks?.progress || 0}</span><span class="stat-label">In Progress</span></div>
          <div class="stat"><span class="stat-value">${stats.tasks?.done || 0}</span><span class="stat-label">Done</span></div>
        </div>
      </div>`;
    case 'stats-activity':
      return `<div class="widget widget-medium" data-widget="${id}">
        <div class="widget-header"><h3>⚡ Activity</h3></div>
        <div class="widget-body">
          <p style="color:var(--text-secondary)">${stats.messages || 0} messages synced</p>
          <p style="color:var(--text-secondary)">${stats.events || 0} upcoming events</p>
        </div>
      </div>`;
    case 'stats-messages':
      return `<div class="widget" data-widget="${id}">
        <div class="widget-header"><h3>💬 Chat</h3></div>
        <div class="widget-body">
          <div class="stat"><span class="stat-value">${stats.messages || 0}</span><span class="stat-label">Messages</span></div>
        </div>
      </div>`;
    case 'calendar-upcoming':
      const upcoming = events.filter(e => new Date(e.date) >= new Date()).slice(0, 3);
      return `<div class="widget widget-medium" data-widget="${id}">
        <div class="widget-header"><h3>📆 Upcoming</h3></div>
        <div class="widget-body">
          ${upcoming.length ? upcoming.map(e => `<p style="color:var(--text-secondary)">• ${e.title} (${e.date})</p>`).join('') : '<p style="color:var(--text-muted)">No upcoming events</p>'}
        </div>
      </div>`;
    case 'quick-actions':
      return `<div class="widget" data-widget="${id}">
        <div class="widget-header"><h3>🚀 Quick</h3></div>
        <div class="widget-body" style="display:flex;gap:0.5rem;flex-wrap:wrap">
          <button class="btn-secondary" onclick="quickNewTask()">+ Task</button>
          <button class="btn-secondary" onclick="quickNewEvent()">+ Event</button>
          <button class="btn-secondary" onclick="quickChat()">Chat</button>
        </div>
      </div>`;
    default:
      return '';
  }
}

function openWidgetPicker() {
  const modal = document.getElementById('widgetPicker');
  renderWidgetPicker();
  modal?.classList.add('open');
}

function closeWidgetPicker() {
  document.getElementById('widgetPicker')?.classList.remove('open');
}

function renderWidgetPicker() {
  const container = document.getElementById('widgetList');
  if (!container) return;
  
  // Render enabled widgets first (draggable), then available ones
  const enabled = widgets.enabled.map(id => widgets.available.find(w => w.id === id)).filter(Boolean);
  const disabled = widgets.available.filter(w => !widgets.enabled.includes(w.id));
  
  container.innerHTML = `
    <div class="widget-section">
      <h4>Active Widgets (drag to reorder)</h4>
      <div class="widget-sortable" id="widgetSortable">
        ${enabled.map(w => `
          <div class="widget-option draggable" draggable="true" data-id="${w.id}">
            <span class="drag-handle">⠿</span>
            <span class="widget-info">${w.icon} ${w.name}</span>
            <button class="btn-icon-sm" onclick="removeWidget('${w.id}')">✕</button>
          </div>
        `).join('') || '<p class="empty-state">No widgets enabled</p>'}
      </div>
    </div>
    <div class="widget-section">
      <h4>Available Widgets</h4>
      <div class="widget-available">
        ${disabled.map(w => `
          <div class="widget-option available" onclick="addWidget('${w.id}')">
            <span class="add-icon">+</span>
            <span class="widget-info">${w.icon} ${w.name}</span>
          </div>
        `).join('') || '<p class="empty-state">All widgets enabled</p>'}
      </div>
    </div>
  `;
  
  setupWidgetDragSort();
}

function setupWidgetDragSort() {
  const container = document.getElementById('widgetSortable');
  if (!container) return;
  
  const items = container.querySelectorAll('.draggable');
  let dragItem = null;
  
  items.forEach(item => {
    item.addEventListener('dragstart', (e) => {
      dragItem = item;
      item.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    
    item.addEventListener('dragend', () => {
      item.classList.remove('dragging');
      dragItem = null;
      saveWidgetOrder();
    });
    
    item.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (!dragItem || dragItem === item) return;
      const rect = item.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      if (e.clientY < midY) {
        container.insertBefore(dragItem, item);
      } else {
        container.insertBefore(dragItem, item.nextSibling);
      }
    });
  });
}

async function saveWidgetOrder() {
  const container = document.getElementById('widgetSortable');
  if (!container) return;
  
  const newOrder = Array.from(container.querySelectorAll('.draggable')).map(el => el.dataset.id);
  widgets.enabled = newOrder;
  
  await fetch(`${CONFIG.apiUrl}/widgets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled: widgets.enabled })
  });
  renderDashboard();
}

async function addWidget(id) {
  widgets.enabled.push(id);
  await fetch(`${CONFIG.apiUrl}/widgets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled: widgets.enabled })
  });
  renderWidgetPicker();
  renderDashboard();
  showToast('Widget added');
}

async function removeWidget(id) {
  widgets.enabled = widgets.enabled.filter(w => w !== id);
  await fetch(`${CONFIG.apiUrl}/widgets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled: widgets.enabled })
  });
  renderWidgetPicker();
  renderDashboard();
  showToast('Widget removed');
}

async function toggleWidget(id) {
  if (widgets.enabled.includes(id)) {
    await removeWidget(id);
  } else {
    await addWidget(id);
  }
}

function refreshDashboard() { showToast('Refreshing...'); updateStatus(); }

// ==================
// Projects
// ==================

async function loadProjects() {
  try {
    const response = await fetch(`${CONFIG.apiUrl}/projects`);
    if (response.ok) {
      projects = await response.json();
    }
  } catch {}
  
  // Fallback
  if (!Object.keys(projects).length) {
    projects = {
      personal: { name: '🏠 Personal', color: '#7aa2f7', tasks: { todo: [], progress: [], done: [] } },
      laundromat: { name: '🧺 Laundromat', color: '#9ece6a', tasks: { todo: [], progress: [], done: [] } },
      'nova-dev': { name: '✨ Nova Dev', color: '#bb9af7', tasks: { todo: [], progress: [], done: [] } }
    };
  }
  
  // Also load legacy tasks into personal
  try {
    const tasksRes = await fetch(`${CONFIG.apiUrl}/tasks`);
    if (tasksRes.ok) {
      const tasks = await tasksRes.json();
      if (tasks.todo?.length || tasks.progress?.length || tasks.done?.length) {
        projects.personal.tasks = tasks;
      }
    }
  } catch {}
  
  renderProjectSelector();
}

function renderProjectSelector() {
  const select = document.getElementById('projectSelect');
  if (!select) return;
  select.innerHTML = Object.entries(projects).map(([id, p]) => 
    `<option value="${id}" ${id === currentProject ? 'selected' : ''}>${p.name}</option>`
  ).join('');
}

function switchProject(projectId) {
  currentProject = projectId;
  renderTasks();
}

function openProjectModal(projectId = null) {
  const modal = document.getElementById('projectModal');
  document.getElementById('projectForm')?.reset();
  document.getElementById('projectId').value = projectId || '';
  document.getElementById('projectModalTitle').textContent = projectId ? 'Edit Project' : 'New Project';
  
  if (projectId && projects[projectId]) {
    document.getElementById('projectName').value = projects[projectId].name.replace(/^[^\s]+\s/, '');
    document.getElementById('projectIcon').value = projects[projectId].name.split(' ')[0];
    document.getElementById('projectColor').value = projects[projectId].color || '#7aa2f7';
  }
  
  modal?.classList.add('open');
}

function closeProjectModal() {
  document.getElementById('projectModal')?.classList.remove('open');
}

async function saveProject(e) {
  e.preventDefault();
  const id = document.getElementById('projectId').value || Date.now().toString();
  const name = document.getElementById('projectName').value;
  const icon = document.getElementById('projectIcon').value || '📁';
  const color = document.getElementById('projectColor').value;
  
  if (!projects[id]) {
    projects[id] = { tasks: { todo: [], progress: [], done: [] } };
  }
  projects[id].name = `${icon} ${name}`;
  projects[id].color = color;
  
  await fetch(`${CONFIG.apiUrl}/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(projects)
  });
  
  renderProjectSelector();
  closeProjectModal();
  showToast('Project saved');
}

async function deleteProject(id) {
  if (!confirm('Delete this project and all its tasks?')) return;
  delete projects[id];
  if (currentProject === id) currentProject = 'personal';
  
  await fetch(`${CONFIG.apiUrl}/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(projects)
  });
  
  renderProjectSelector();
  renderTasks();
  showToast('Project deleted');
}

function openProjectManager() {
  openProjectModal();
}

// ==================
// Tasks
// ==================

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
  
  saveAllProjects();
  renderTasks();
  showToast(`Moved to ${toStatus}`);
}

function openTaskModal(status = 'todo', index = null) {
  const modal = document.getElementById('taskModal');
  document.getElementById('taskForm')?.reset();
  document.getElementById('taskId').value = '';
  document.getElementById('modalTitle').textContent = 'Add Task';
  
  if (index !== null) {
    const task = projects[currentProject]?.tasks[status]?.[index];
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
  
  saveAllProjects();
  renderTasks();
  closeTaskModal();
}

function editTask(status, index) { openTaskModal(status, index); }
function deleteTask(status, index) {
  if (confirm('Delete this task?')) {
    projects[currentProject].tasks[status].splice(index, 1);
    saveAllProjects();
    renderTasks();
    showToast('Task deleted');
  }
}

async function saveAllProjects() {
  // Save to projects endpoint
  await fetch(`${CONFIG.apiUrl}/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(projects)
  });
  // Also save personal tasks to legacy endpoint
  await fetch(`${CONFIG.apiUrl}/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(projects.personal?.tasks || { todo: [], progress: [], done: [] })
  });
}

// ==================
// Calendar & Events
// ==================

async function loadEvents() {
  try {
    const response = await fetch(`${CONFIG.apiUrl}/events`);
    if (response.ok) {
      const data = await response.json();
      events = data.events || [];
    }
  } catch {}
}

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
  const prevMonthDays = new Date(year, month, 0).getDate();
  for (let i = firstDay - 1; i >= 0; i--) html += `<div class="calendar-day other-month">${prevMonthDays - i}</div>`;
  
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const isToday = today.getDate() === day && today.getMonth() === month && today.getFullYear() === year;
    const hasEvent = events.some(e => e.date === dateStr);
    html += `<div class="calendar-day${isToday ? ' today' : ''}${hasEvent ? ' has-event' : ''}" onclick="selectDate('${dateStr}')">${day}</div>`;
  }
  
  const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;
  for (let i = 1; i <= totalCells - firstDay - daysInMonth; i++) html += `<div class="calendar-day other-month">${i}</div>`;
  
  grid.innerHTML = html;
  renderUpcomingEvents();
}

function renderUpcomingEvents() {
  const container = document.getElementById('upcomingEvents');
  if (!container) return;
  
  const upcoming = events.filter(e => new Date(e.date) >= new Date()).sort((a, b) => new Date(a.date) - new Date(b.date)).slice(0, 5);
  
  if (!upcoming.length) {
    container.innerHTML = '<p style="color: var(--text-muted)">No upcoming events</p>';
    return;
  }
  
  container.innerHTML = upcoming.map(e => {
    const date = new Date(e.date);
    return `<div class="event-item" onclick="editEvent('${e.id}')">
      <div class="event-date"><div class="day">${date.getDate()}</div><div class="month">${date.toLocaleDateString('en-US', { month: 'short' })}</div></div>
      <div class="event-info"><h4>${escapeHtml(e.title)}</h4>${e.time ? `<p>${e.time}</p>` : ''}</div>
      <button class="btn-icon-sm" onclick="event.stopPropagation(); deleteEvent('${e.id}')">🗑️</button>
    </div>`;
  }).join('');
}

function prevMonth() { calendarDate.setMonth(calendarDate.getMonth() - 1); renderCalendar(); }
function nextMonth() { calendarDate.setMonth(calendarDate.getMonth() + 1); renderCalendar(); }
function goToToday() { calendarDate = new Date(); renderCalendar(); }
function selectDate(dateStr) { document.getElementById('eventDate').value = dateStr; openEventModal(); }

function openEventModal(eventId = null) {
  const modal = document.getElementById('eventModal');
  document.getElementById('eventForm')?.reset();
  document.getElementById('eventId').value = eventId || '';
  
  if (eventId) {
    const event = events.find(e => e.id === eventId);
    if (event) {
      document.getElementById('eventTitle').value = event.title;
      document.getElementById('eventDate').value = event.date;
      document.getElementById('eventTime').value = event.time || '';
      document.getElementById('eventNotes').value = event.notes || '';
      document.getElementById('eventReminder').checked = event.reminder || false;
    }
  }
  
  modal?.classList.add('open');
}

function closeEventModal() { document.getElementById('eventModal')?.classList.remove('open'); }

function editEvent(id) { openEventModal(id); }

async function saveEvent(e) {
  e.preventDefault();
  const id = document.getElementById('eventId').value || Date.now().toString();
  const event = {
    id,
    title: document.getElementById('eventTitle').value,
    date: document.getElementById('eventDate').value,
    time: document.getElementById('eventTime').value,
    notes: document.getElementById('eventNotes').value,
    reminder: document.getElementById('eventReminder')?.checked || false
  };
  
  const existingIndex = events.findIndex(e => e.id === id);
  if (existingIndex >= 0) events[existingIndex] = event;
  else events.push(event);
  
  await fetch(`${CONFIG.apiUrl}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ events })
  });
  
  closeEventModal();
  renderCalendar();
  showToast('Event saved');
  
  // Create notification for reminder
  if (event.reminder) {
    await createNotification(`📅 Reminder set for: ${event.title}`, 'reminder');
  }
}

async function deleteEvent(id) {
  events = events.filter(e => e.id !== id);
  await fetch(`${CONFIG.apiUrl}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ events })
  });
  renderCalendar();
  showToast('Event deleted');
}

// ==================
// Notifications
// ==================

async function loadNotifications() {
  try {
    const response = await fetch(`${CONFIG.apiUrl}/notifications`);
    if (response.ok) {
      const data = await response.json();
      notifications = data.notifications || [];
    }
  } catch {}
}

function renderNotificationBadge() {
  const unread = notifications.filter(n => !n.read).length;
  const badge = document.getElementById('notificationBadge');
  if (badge) {
    badge.textContent = unread || '';
    badge.style.display = unread ? 'flex' : 'none';
  }
}

async function createNotification(message, type = 'info') {
  const notification = { message, type, createdAt: Date.now(), read: false };
  await fetch(`${CONFIG.apiUrl}/notifications`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(notification)
  });
  await loadNotifications();
  renderNotificationBadge();
  
  // Browser notification
  if (Notification.permission === 'granted') {
    new Notification('Nova Portal', { body: message, icon: '/icon.svg' });
  }
}

function openNotifications() {
  const modal = document.getElementById('notificationsModal');
  renderNotificationsList();
  modal?.classList.add('open');
}

function closeNotifications() {
  document.getElementById('notificationsModal')?.classList.remove('open');
}

function renderNotificationsList() {
  const container = document.getElementById('notificationsList');
  if (!container) return;
  
  if (!notifications.length) {
    container.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:2rem">No notifications</p>';
    return;
  }
  
  container.innerHTML = notifications.map(n => `
    <div class="notification-item ${n.read ? '' : 'unread'}">
      <span class="notification-icon">${n.type === 'reminder' ? '📅' : n.type === 'success' ? '✅' : 'ℹ️'}</span>
      <div class="notification-content">
        <p>${escapeHtml(n.message)}</p>
        <span class="notification-time">${formatTimeAgo(n.createdAt)}</span>
      </div>
      <button class="btn-icon-sm" onclick="dismissNotification('${n.id}')">✕</button>
    </div>
  `).join('');
}

async function dismissNotification(id) {
  await fetch(`${CONFIG.apiUrl}/notifications/${id}`, { method: 'DELETE' });
  await loadNotifications();
  renderNotificationBadge();
  renderNotificationsList();
}

async function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    await Notification.requestPermission();
  }
}

function checkReminders() {
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const currentTime = now.toTimeString().slice(0, 5);
  
  events.forEach(event => {
    if (event.reminder && event.date === todayStr && event.time === currentTime) {
      createNotification(`⏰ ${event.title} is happening now!`, 'reminder');
    }
  });
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

function toggleFabMenu() { document.getElementById('fabMenu')?.classList.toggle('open'); }
function quickNewTask() { toggleFabMenu(); navigateTo('tasks'); setTimeout(() => openTaskModal(), 100); }
function quickNewEvent() { toggleFabMenu(); navigateTo('calendar'); setTimeout(() => openEventModal(), 100); }
function quickChat() { toggleFabMenu(); navigateTo('chat'); messageInput?.focus(); }

// ==================
// Reports
// ==================

async function loadReports() {
  try {
    const response = await fetch(`${CONFIG.apiUrl}/reports`);
    if (response.ok) {
      const report = await response.json();
      renderReports(report);
    }
  } catch (e) {
    console.error('Failed to load reports:', e);
  }
}

function renderReports(report) {
  // Uptime
  const gwBar = document.getElementById('uptimeGateway');
  const tnBar = document.getElementById('uptimeTunnel');
  if (gwBar) gwBar.style.width = `${report.uptime?.gateway || 0}%`;
  if (tnBar) tnBar.style.width = `${report.uptime?.tunnel || 0}%`;
  setText('uptimeGatewayPct', `${report.uptime?.gateway || 0}%`);
  setText('uptimeTunnelPct', `${report.uptime?.tunnel || 0}%`);
  
  // Performance
  setText('avgLatency', report.avgLatency || '--');
  setText('totalChecks', report.totalChecks || 0);
  
  // Tasks
  setText('tasksDone', report.taskMetrics?.completed || 0);
  setText('tasksProgress', report.taskMetrics?.inProgress || 0);
  setText('tasksPending', report.taskMetrics?.pending || 0);
  
  // Chat
  setText('chatTotal', report.chatMetrics?.totalMessages || 0);
  setText('chat24h', report.chatMetrics?.last24h || 0);
  
  // Incidents
  const incidentsList = document.getElementById('incidentsList');
  if (incidentsList) {
    if (!report.incidents?.length) {
      incidentsList.innerHTML = '<p class="no-incidents">No incidents recorded ✅</p>';
    } else {
      incidentsList.innerHTML = report.incidents.map(inc => `
        <div class="incident-item ${inc.ongoing ? 'ongoing' : ''}">
          <span class="incident-icon">${inc.ongoing ? '🔴' : '🟡'}</span>
          <div class="incident-info">
            <strong>${inc.type === 'gateway_down' ? 'Gateway Offline' : 'Service Issue'}</strong>
            <span>${formatTimeAgo(inc.start)}${inc.duration ? ` • ${Math.round(inc.duration / 60000)}m` : ' • Ongoing'}</span>
          </div>
        </div>
      `).join('');
    }
  }
  
  // Report time
  setText('reportTime', new Date(report.generated).toLocaleString());
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function refreshReports() {
  showToast('Refreshing reports...');
  loadReports();
}

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

function formatTimeAgo(timestamp) {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// ==================
// Keyboard Shortcuts
// ==================

document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault();
    document.getElementById('commandPalette')?.classList.contains('open') ? closeCommandPalette() : openCommandPalette();
  }
  if (e.key === 'Escape') {
    closeCommandPalette(); closeTaskModal(); closeEventModal(); closeThemePicker(); closeWidgetPicker(); closeProjectModal(); closeNotifications();
    document.getElementById('fabMenu')?.classList.remove('open');
  }
  if ((e.metaKey || e.ctrlKey) && ['1','2','3','4','5'].includes(e.key)) {
    e.preventDefault();
    navigateTo(['chat', 'dashboard', 'tasks', 'calendar', 'notes'][parseInt(e.key) - 1]);
  }
});

document.querySelectorAll('.modal').forEach(modal => {
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('open'); });
});

// Request notification permission on load
requestNotificationPermission();

// ==================
// Global Functions
// ==================

window.openCommandPalette = openCommandPalette;
window.closeCommandPalette = closeCommandPalette;
window.executeCommand = executeCommand;
window.openTaskModal = openTaskModal;
window.closeTaskModal = closeTaskModal;
window.saveTask = saveTask;
window.editTask = editTask;
window.deleteTask = deleteTask;
window.switchProject = switchProject;
window.openProjectModal = openProjectModal;
window.closeProjectModal = closeProjectModal;
window.saveProject = saveProject;
window.deleteProject = deleteProject;
window.openProjectManager = openProjectManager;
window.openEventModal = openEventModal;
window.closeEventModal = closeEventModal;
window.saveEvent = saveEvent;
window.editEvent = editEvent;
window.deleteEvent = deleteEvent;
window.selectDate = selectDate;
window.prevMonth = prevMonth;
window.nextMonth = nextMonth;
window.goToToday = goToToday;
window.refreshDashboard = refreshDashboard;
window.openWidgetPicker = openWidgetPicker;
window.closeWidgetPicker = closeWidgetPicker;
window.toggleWidget = toggleWidget;
window.addWidget = addWidget;
window.removeWidget = removeWidget;
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
window.openNotifications = openNotifications;
window.closeNotifications = closeNotifications;
window.dismissNotification = dismissNotification;
window.loadReports = loadReports;
window.refreshReports = refreshReports;
