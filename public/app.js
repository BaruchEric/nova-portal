// Nova Portal - Full Featured JavaScript
// ======================================

// Configuration
const CONFIG = {
  apiUrl: '/api', // Will be proxied to Cloudflare Worker
  refreshInterval: 30000, // 30 seconds
  storagePrefix: 'nova-'
};

// State
let tasks = { todo: [], progress: [], done: [] };
let notes = [];
let currentNote = null;
let isConnected = false;

// ==================
// Navigation
// ==================

document.querySelectorAll('.nav-link').forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    const viewId = link.getAttribute('data-view');
    navigateTo(viewId);
  });
});

function navigateTo(viewId) {
  // Update nav
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  document.querySelector(`[data-view="${viewId}"]`).classList.add('active');
  
  // Update view
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(viewId).classList.add('active');
  
  // Update URL
  history.pushState(null, '', `#${viewId}`);
  
  // View-specific init
  if (viewId === 'dashboard') updateDashboard();
  if (viewId === 'notes') loadNotes();
}

// Handle back/forward
window.addEventListener('popstate', () => {
  const viewId = location.hash.slice(1) || 'chat';
  navigateTo(viewId);
});

// ==================
// Chat
// ==================

const chatForm = document.getElementById('chatForm');
const messageInput = document.getElementById('messageInput');
const messagesContainer = document.getElementById('messages');

chatForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const message = messageInput.value.trim();
  if (!message) return;
  
  // Add user message
  addMessage(message, 'user');
  messageInput.value = '';
  messageInput.focus();
  
  // Show typing indicator
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
    addMessage("Having trouble connecting. I'll keep trying! ✨", 'assistant');
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
      <div class="message-content">
        <p>${formatMessage(content)}</p>
      </div>
      <span class="message-time">${formatTime(new Date())}</span>
    </div>
  `;
  
  messagesContainer.appendChild(div);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function showTyping() {
  const div = document.createElement('div');
  div.className = 'message assistant typing';
  div.innerHTML = `
    <div class="message-avatar">✨</div>
    <div class="message-body">
      <div class="message-content">
        <div class="typing-indicator">
          <span></span><span></span><span></span>
        </div>
      </div>
    </div>
  `;
  messagesContainer.appendChild(div);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
  return div;
}

function removeTyping(el) {
  if (el && el.parentNode) el.remove();
}

function formatMessage(text) {
  // Basic markdown-like formatting
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
    const response = await fetch(`${CONFIG.apiUrl}/status`);
    
    if (response.ok) {
      const data = await response.json();
      
      // VM Status
      document.getElementById('vm-status').textContent = data.vm?.status || 'Unknown';
      document.getElementById('vm-cpu').textContent = data.vm?.cpu || 'N/A';
      document.getElementById('vm-memory').textContent = data.vm?.memory || 'N/A';
      updateIndicator('vm-indicator', data.vm?.status === 'Online');
      
      // EC2 Status
      document.getElementById('ec2-status').textContent = data.ec2?.status || 'Unknown';
      document.getElementById('ec2-disk').textContent = data.ec2?.disk || 'N/A';
      document.getElementById('ec2-ip').textContent = data.ec2?.ip || 'N/A';
      updateIndicator('ec2-indicator', data.ec2?.status === 'Online');
      
      // Tailscale
      document.getElementById('tailscale-devices').textContent = data.tailscale?.devices || '0';
      document.getElementById('tailscale-status').textContent = data.tailscale?.connected ? 'Connected' : 'Disconnected';
      updateIndicator('ts-indicator', data.tailscale?.connected);
      
      // Email
      document.getElementById('email-unread').textContent = data.email?.unread || '0';
      updateIndicator('email-indicator', true);
      
      // Last updated
      document.getElementById('lastUpdated').textContent = `Last updated: ${formatTime(new Date())}`;
      
      updateConnectionStatus(true);
    }
  } catch (error) {
    console.log('Dashboard update failed:', error);
    updateConnectionStatus(false);
  }
}

function updateIndicator(id, online) {
  const el = document.getElementById(id);
  if (el) {
    el.className = `card-status ${online ? 'online' : 'offline'}`;
  }
}

function refreshDashboard() {
  showToast('Refreshing dashboard...');
  updateDashboard();
}

// ==================
// Kanban Tasks
// ==================

function initKanban() {
  // Load tasks from localStorage first
  const saved = localStorage.getItem(`${CONFIG.storagePrefix}tasks`);
  if (saved) {
    tasks = JSON.parse(saved);
  }
  
  // Try to load from API
  loadTasksFromAPI();
  
  // Setup drag and drop
  setupDragAndDrop();
  
  // Render
  renderTasks();
}

async function loadTasksFromAPI() {
  try {
    const response = await fetch(`${CONFIG.apiUrl}/tasks`);
    if (response.ok) {
      const data = await response.json();
      if (data.todo || data.progress || data.done) {
        tasks = data;
        saveTasks();
        renderTasks();
      }
    }
  } catch (error) {
    console.log('Using local tasks');
  }
}

function renderTasks() {
  ['todo', 'progress', 'done'].forEach(status => {
    const container = document.getElementById(`${status}-cards`);
    const countEl = document.getElementById(`${status}-count`);
    
    container.innerHTML = '';
    const statusTasks = tasks[status] || [];
    countEl.textContent = statusTasks.length;
    
    statusTasks.forEach((task, index) => {
      const card = createTaskCard(task, status, index);
      container.appendChild(card);
    });
  });
}

function createTaskCard(task, status, index) {
  const card = document.createElement('div');
  card.className = `kanban-card priority-${task.priority || 'medium'}`;
  card.draggable = true;
  card.dataset.status = status;
  card.dataset.index = index;
  
  const tagEmoji = {
    task: '🏷️', feature: '✨', bug: '🐛', 
    infra: '🔧', docs: '📝', urgent: '🔥'
  };
  
  card.innerHTML = `
    <div class="card-header">
      <h4>${escapeHtml(task.title)}</h4>
      <div class="card-actions">
        <button class="btn-icon-sm" onclick="editTask('${status}', ${index})" title="Edit">✏️</button>
        <button class="btn-icon-sm" onclick="deleteTask('${status}', ${index})" title="Delete">🗑️</button>
      </div>
    </div>
    ${task.description ? `<p>${escapeHtml(task.description)}</p>` : ''}
    <div class="card-footer">
      <span class="card-tag tag-${task.tag || 'task'}">${tagEmoji[task.tag] || '🏷️'} ${task.tag || 'task'}</span>
      ${task.createdAt ? `<span class="card-date">${formatDate(task.createdAt)}</span>` : ''}
    </div>
  `;
  
  // Drag events
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
  e.dataTransfer.effectAllowed = 'move';
}

function handleDragEnd(e) {
  this.classList.remove('dragging');
  document.querySelectorAll('.kanban-cards').forEach(col => col.classList.remove('drag-over'));
  draggedCard = null;
}

function handleDragOver(e) {
  e.preventDefault();
  this.classList.add('drag-over');
}

function handleDragLeave(e) {
  this.classList.remove('drag-over');
}

function handleDrop(e) {
  e.preventDefault();
  this.classList.remove('drag-over');
  
  if (!draggedCard) return;
  
  const fromStatus = draggedCard.dataset.status;
  const fromIndex = parseInt(draggedCard.dataset.index);
  const toStatus = this.id.replace('-cards', '');
  
  // Move task
  const [task] = tasks[fromStatus].splice(fromIndex, 1);
  tasks[toStatus].push(task);
  
  saveTasks();
  renderTasks();
  
  showToast(`Task moved to ${toStatus}`);
}

function openTaskModal(status = 'todo', index = null) {
  const modal = document.getElementById('taskModal');
  const form = document.getElementById('taskForm');
  
  form.reset();
  document.getElementById('taskId').value = '';
  document.getElementById('modalTitle').textContent = 'Add Task';
  
  if (index !== null && tasks[status][index]) {
    const task = tasks[status][index];
    document.getElementById('taskId').value = `${status}:${index}`;
    document.getElementById('taskTitle').value = task.title;
    document.getElementById('taskDescription').value = task.description || '';
    document.getElementById('taskTag').value = task.tag || 'task';
    document.getElementById('taskPriority').value = task.priority || 'medium';
    document.getElementById('modalTitle').textContent = 'Edit Task';
  }
  
  modal.classList.add('open');
  document.getElementById('taskTitle').focus();
}

function closeTaskModal() {
  document.getElementById('taskModal').classList.remove('open');
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
    task.createdAt = tasks[status][index].createdAt; // Keep original date
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
  
  // Sync to API
  fetch(`${CONFIG.apiUrl}/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(tasks)
  }).catch(() => {}); // Silent fail
}

// ==================
// Notes
// ==================

async function loadNotes() {
  // Show loading state
  ['daily-notes', 'memory-notes', 'config-notes'].forEach(id => {
    document.getElementById(id).innerHTML = '<div class="note-item loading">Loading...</div>';
  });
  
  try {
    const response = await fetch(`${CONFIG.apiUrl}/notes`);
    if (response.ok) {
      const data = await response.json();
      notes = data.notes || [];
      renderNotes();
    }
  } catch (error) {
    // Fallback to default notes
    notes = [
      { id: 'today', name: new Date().toISOString().split('T')[0], type: 'daily' },
      { id: 'memory', name: 'MEMORY.md', type: 'memory' },
      { id: 'soul', name: 'SOUL.md', type: 'config' },
      { id: 'tools', name: 'TOOLS.md', type: 'config' }
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
  
  Object.values(containers).forEach(c => c.innerHTML = '');
  
  notes.forEach(note => {
    const item = document.createElement('div');
    item.className = 'note-item';
    item.onclick = () => selectNote(note);
    item.innerHTML = `<span>${note.name}</span>`;
    
    const container = containers[note.type] || containers.config;
    container.appendChild(item);
  });
}

async function selectNote(note) {
  currentNote = note;
  
  // Update UI
  document.querySelectorAll('.note-item').forEach(i => i.classList.remove('active'));
  event.target.closest('.note-item').classList.add('active');
  
  document.getElementById('noteTitle').textContent = note.name;
  document.getElementById('noteContent').value = 'Loading...';
  document.getElementById('noteContent').readOnly = true;
  
  try {
    const response = await fetch(`${CONFIG.apiUrl}/notes?file=${encodeURIComponent(note.id)}`);
    if (response.ok) {
      const data = await response.json();
      document.getElementById('noteContent').value = data.content || '';
      document.getElementById('noteContent').readOnly = false;
    }
  } catch (error) {
    document.getElementById('noteContent').value = '# Could not load note\n\nConnect to Clawdbot Gateway to access notes.';
  }
}

async function saveNote() {
  if (!currentNote) return;
  
  const content = document.getElementById('noteContent').value;
  
  try {
    await fetch(`${CONFIG.apiUrl}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file: currentNote.id, content })
    });
    showToast('Note saved');
  } catch (error) {
    showToast('Could not save note', 'error');
  }
}

function copyNote() {
  const content = document.getElementById('noteContent').value;
  navigator.clipboard.writeText(content);
  showToast('Copied to clipboard');
}

function refreshNotes() {
  showToast('Refreshing notes...');
  loadNotes();
}

// ==================
// Connection Status
// ==================

function updateConnectionStatus(connected) {
  isConnected = connected;
  const indicator = document.getElementById('connectionStatus');
  const text = document.getElementById('connectionText');
  
  indicator.className = `status-indicator ${connected ? 'online' : 'offline'}`;
  text.textContent = connected ? 'Connected' : 'Offline';
}

// ==================
// Toast Notifications
// ==================

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
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
  return date.toLocaleTimeString('en-US', { 
    hour: 'numeric', 
    minute: '2-digit',
    hour12: true 
  });
}

function formatDate(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ==================
// Keyboard Shortcuts
// ==================

document.addEventListener('keydown', (e) => {
  // Escape to close modals
  if (e.key === 'Escape') {
    closeTaskModal();
  }
  
  // Cmd/Ctrl + K for quick nav
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault();
    messageInput.focus();
  }
  
  // Cmd/Ctrl + 1-4 for views
  if ((e.metaKey || e.ctrlKey) && ['1', '2', '3', '4'].includes(e.key)) {
    e.preventDefault();
    const views = ['chat', 'dashboard', 'tasks', 'notes'];
    navigateTo(views[parseInt(e.key) - 1]);
  }
});

// ==================
// Initialize
// ==================

document.addEventListener('DOMContentLoaded', () => {
  // Check initial hash
  const initialView = location.hash.slice(1) || 'chat';
  if (initialView !== 'chat') navigateTo(initialView);
  
  // Init components
  initKanban();
  updateDashboard();
  
  // Periodic refresh
  setInterval(updateDashboard, CONFIG.refreshInterval);
  
  // Focus chat input
  messageInput.focus();
});

// Expose functions for HTML onclick handlers
window.openTaskModal = openTaskModal;
window.closeTaskModal = closeTaskModal;
window.saveTask = saveTask;
window.editTask = editTask;
window.deleteTask = deleteTask;
window.refreshDashboard = refreshDashboard;
window.refreshNotes = refreshNotes;
window.saveNote = saveNote;
window.copyNote = copyNote;
