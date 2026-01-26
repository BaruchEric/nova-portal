// Nova Portal - Full Featured JavaScript
// v2.0 - Connected to Nova via Clawdbot Gateway
// ======================================

// Configuration
const CONFIG = {
  apiUrl: 'https://nova-portal-api.ericbaruch.workers.dev/api',
  refreshInterval: 30000,
  storagePrefix: 'nova-'
};

// State
let tasks = { todo: [], progress: [], done: [] };
let notes = [];
let currentNote = null;

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
}

window.addEventListener('popstate', () => {
  navigateTo(location.hash.slice(1) || 'chat');
});

// ==================
// Chat
// ==================

const chatForm = document.getElementById('chatForm');
const messageInput = document.getElementById('messageInput');
const messagesContainer = document.getElementById('messages');

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

function addMessage(content, role) {
  const div = document.createElement('div');
  div.className = `message ${role}`;
  const avatar = role === 'user' ? '👤' : '✨';
  
  div.innerHTML = `
    <div class="message-avatar">${avatar}</div>
    <div class="message-body">
      <div class="message-content"><p>${formatMessage(content)}</p></div>
      <span class="message-time">${formatTime(new Date())}</span>
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
// Dashboard
// ==================

async function updateDashboard() {
  const statusCard = document.getElementById('vm-status');
  if (statusCard) statusCard.textContent = 'Checking...';
  
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
      
      // Portal status  
      const portalStatus = document.getElementById('ec2-status');
      const portalVer = document.getElementById('ec2-disk');
      const portalIp = document.getElementById('ec2-ip');
      if (portalStatus) portalStatus.textContent = data.portal?.status || 'Online';
      if (portalVer) portalVer.textContent = `v${data.portal?.version || '2.0'}`;
      if (portalIp) portalIp.textContent = data.portal?.features?.length + ' features';
      updateIndicator('ec2-indicator', true);
      
      // Features
      const tsDevices = document.getElementById('tailscale-devices');
      const tsStatus = document.getElementById('tailscale-status');
      if (tsDevices) tsDevices.textContent = data.portal?.features?.length || 4;
      if (tsStatus) tsStatus.textContent = 'Active';
      updateIndicator('ts-indicator', true);
      
      // Last updated
      const lastUpdated = document.getElementById('lastUpdated');
      if (lastUpdated) lastUpdated.textContent = `Last updated: ${formatTime(new Date())}`;
      
      updateConnectionStatus(true);
    }
  } catch (error) {
    console.log('Dashboard update failed:', error);
    updateConnectionStatus(false);
  }
}

function updateIndicator(id, online) {
  const el = document.getElementById(id);
  if (el) el.className = `card-status ${online ? 'online' : 'offline'}`;
}

function refreshDashboard() {
  showToast('Refreshing...');
  updateDashboard();
}

// ==================
// Kanban Tasks
// ==================

function initKanban() {
  const saved = localStorage.getItem(`${CONFIG.storagePrefix}tasks`);
  if (saved) tasks = JSON.parse(saved);
  
  loadTasksFromAPI();
  setupDragAndDrop();
  renderTasks();
}

async function loadTasksFromAPI() {
  try {
    const response = await fetch(`${CONFIG.apiUrl}/tasks`);
    if (response.ok) {
      const data = await response.json();
      if (data.todo || data.progress || data.done) {
        tasks = data;
        localStorage.setItem(`${CONFIG.storagePrefix}tasks`, JSON.stringify(tasks));
        renderTasks();
      }
    }
  } catch {}
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
  localStorage.setItem(`${CONFIG.storagePrefix}tasks`, JSON.stringify(tasks));
  
  fetch(`${CONFIG.apiUrl}/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(tasks)
  }).catch(() => {});
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
  if (e.key === 'Escape') closeTaskModal();
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault();
    messageInput?.focus();
  }
  if ((e.metaKey || e.ctrlKey) && ['1','2','3','4'].includes(e.key)) {
    e.preventDefault();
    navigateTo(['chat', 'dashboard', 'tasks', 'notes'][parseInt(e.key) - 1]);
  }
});

// ==================
// Initialize
// ==================

document.addEventListener('DOMContentLoaded', () => {
  const initialView = location.hash.slice(1) || 'chat';
  if (initialView !== 'chat') navigateTo(initialView);
  
  initKanban();
  updateDashboard();
  
  setInterval(updateDashboard, CONFIG.refreshInterval);
  
  messageInput?.focus();
});

// Global functions for onclick handlers
window.openTaskModal = openTaskModal;
window.closeTaskModal = closeTaskModal;
window.saveTask = saveTask;
window.editTask = editTask;
window.deleteTask = deleteTask;
window.refreshDashboard = refreshDashboard;
window.refreshNotes = refreshNotes;
window.saveNote = saveNote;
window.copyNote = copyNote;
