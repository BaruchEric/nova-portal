// Nova Portal - JavaScript

// View Navigation
document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        const viewId = link.getAttribute('data-view');
        
        // Update nav
        document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
        link.classList.add('active');
        
        // Update view
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        document.getElementById(viewId).classList.add('active');
    });
});

// Chat functionality
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
    
    // Show typing indicator
    const typingId = showTyping();
    
    try {
        // Call Nova API (replace with actual endpoint)
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message })
        });
        
        if (response.ok) {
            const data = await response.json();
            removeTyping(typingId);
            addMessage(data.reply, 'assistant');
        } else {
            throw new Error('API error');
        }
    } catch (error) {
        removeTyping(typingId);
        addMessage("Sorry, I couldn't process that. Make sure the API is connected.", 'assistant');
    }
});

function addMessage(content, role) {
    const div = document.createElement('div');
    div.className = `message ${role}`;
    div.innerHTML = `
        <div class="message-content">
            <p>${escapeHtml(content)}</p>
        </div>
        <span class="message-time">${formatTime(new Date())}</span>
    `;
    messagesContainer.appendChild(div);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function showTyping() {
    const id = 'typing-' + Date.now();
    const div = document.createElement('div');
    div.id = id;
    div.className = 'message assistant';
    div.innerHTML = `
        <div class="message-content">
            <p>Nova is thinking...</p>
        </div>
    `;
    messagesContainer.appendChild(div);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    return id;
}

function removeTyping(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
}

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

// Kanban drag and drop
let draggedCard = null;

document.querySelectorAll('.kanban-card').forEach(card => {
    card.addEventListener('dragstart', handleDragStart);
    card.addEventListener('dragend', handleDragEnd);
});

document.querySelectorAll('.kanban-cards').forEach(column => {
    column.addEventListener('dragover', handleDragOver);
    column.addEventListener('drop', handleDrop);
});

function handleDragStart(e) {
    draggedCard = this;
    this.style.opacity = '0.5';
}

function handleDragEnd(e) {
    this.style.opacity = '1';
    draggedCard = null;
}

function handleDragOver(e) {
    e.preventDefault();
}

function handleDrop(e) {
    e.preventDefault();
    if (draggedCard) {
        this.appendChild(draggedCard);
        saveTasks();
    }
}

// Task management
function addTask() {
    const title = prompt('Task title:');
    if (!title) return;
    
    const description = prompt('Task description (optional):') || '';
    const tag = prompt('Tag (optional):') || 'task';
    
    const card = document.createElement('div');
    card.className = 'kanban-card';
    card.draggable = true;
    card.innerHTML = `
        <h4>${escapeHtml(title)}</h4>
        <p>${escapeHtml(description)}</p>
        <span class="card-tag">${escapeHtml(tag)}</span>
    `;
    
    card.addEventListener('dragstart', handleDragStart);
    card.addEventListener('dragend', handleDragEnd);
    
    document.getElementById('todo-cards').appendChild(card);
    saveTasks();
}

function saveTasks() {
    const tasks = {
        todo: [],
        progress: [],
        done: []
    };
    
    ['todo', 'progress', 'done'].forEach(status => {
        document.querySelectorAll(`#${status}-cards .kanban-card`).forEach(card => {
            tasks[status].push({
                title: card.querySelector('h4').textContent,
                description: card.querySelector('p').textContent,
                tag: card.querySelector('.card-tag').textContent
            });
        });
    });
    
    localStorage.setItem('nova-tasks', JSON.stringify(tasks));
}

function loadTasks() {
    const saved = localStorage.getItem('nova-tasks');
    if (!saved) return;
    
    const tasks = JSON.parse(saved);
    
    ['todo', 'progress', 'done'].forEach(status => {
        const container = document.getElementById(`${status}-cards`);
        container.innerHTML = '';
        
        tasks[status].forEach(task => {
            const card = document.createElement('div');
            card.className = 'kanban-card';
            card.draggable = true;
            card.innerHTML = `
                <h4>${escapeHtml(task.title)}</h4>
                <p>${escapeHtml(task.description)}</p>
                <span class="card-tag">${escapeHtml(task.tag)}</span>
            `;
            
            card.addEventListener('dragstart', handleDragStart);
            card.addEventListener('dragend', handleDragEnd);
            
            container.appendChild(card);
        });
    });
}

// Dashboard updates
async function updateDashboard() {
    try {
        const response = await fetch('/api/status');
        if (response.ok) {
            const data = await response.json();
            
            document.getElementById('vm-status').textContent = data.vm?.status || 'Unknown';
            document.getElementById('vm-cpu').textContent = data.vm?.cpu || 'N/A';
            document.getElementById('ec2-status').textContent = data.ec2?.status || 'Unknown';
            document.getElementById('ec2-disk').textContent = data.ec2?.disk || 'N/A';
            document.getElementById('tailscale-devices').textContent = data.tailscale?.devices || '0';
            document.getElementById('email-unread').textContent = data.email?.unread || '0';
            
            // Update connection status
            document.querySelector('.status-indicator').classList.add('online');
        }
    } catch (error) {
        console.log('Dashboard update failed - API may not be connected');
    }
}

// Notes functionality
document.querySelectorAll('.note-item').forEach(item => {
    item.addEventListener('click', () => {
        document.querySelectorAll('.note-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        
        // In a real app, load note content from API
        const title = item.querySelector('h4').textContent;
        document.getElementById('noteEditor').placeholder = `Loading ${title}...`;
    });
});

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadTasks();
    updateDashboard();
    
    // Update dashboard every 30 seconds
    setInterval(updateDashboard, 30000);
});

// Make addTask available globally
window.addTask = addTask;
