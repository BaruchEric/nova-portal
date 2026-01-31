// Nova Portal API v5.0 - Full Featured Worker
// Real-time status, widgets, projects, notifications
// ================================================

import { getAuthUrl, exchangeCodeForTokens, fetchCalendarEvents, getValidAccessToken } from './google-calendar.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };
    
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }
    
    try {
      // Chat
      if (path === '/api/chat' && request.method === 'POST') {
        return await handleChat(request, env, corsHeaders);
      }
      
      // Real-time Status
      if (path === '/api/status') {
        return await handleStatus(env, corsHeaders);
      }
      
      // System Stats
      if (path === '/api/system') {
        return await handleSystem(env, corsHeaders);
      }
      
      // Status Reports / History
      if (path === '/api/status/history') {
        return await handleStatusHistory(env, corsHeaders);
      }
      if (path === '/api/reports') {
        return await handleReports(env, corsHeaders);
      }
      
      // Tasks
      if (path === '/api/tasks' && request.method === 'GET') {
        return await handleGetTasks(env, corsHeaders);
      }
      if (path === '/api/tasks' && request.method === 'POST') {
        return await handleSaveTasks(request, env, corsHeaders);
      }
      
      // Projects
      if (path === '/api/projects' && request.method === 'GET') {
        return await handleGetProjects(env, corsHeaders);
      }
      if (path === '/api/projects' && request.method === 'POST') {
        return await handleSaveProjects(request, env, corsHeaders);
      }
      
      // Events/Calendar
      if (path === '/api/events' && request.method === 'GET') {
        return await handleGetEvents(env, corsHeaders);
      }
      if (path === '/api/events' && request.method === 'POST') {
        return await handleSaveEvents(request, env, corsHeaders);
      }
      
      // Google Calendar OAuth
      if (path === '/oauth/google') {
        return Response.redirect(getAuthUrl(), 302);
      }
      if (path === '/oauth/callback') {
        return await handleOAuthCallback(request, env, corsHeaders);
      }
      if (path === '/api/calendar/google') {
        return await handleGoogleCalendar(env, corsHeaders);
      }
      if (path === '/api/calendar/status') {
        return await handleCalendarStatus(env, corsHeaders);
      }
      
      // Widgets Config
      if (path === '/api/widgets' && request.method === 'GET') {
        return await handleGetWidgets(env, corsHeaders);
      }
      if (path === '/api/widgets' && request.method === 'POST') {
        return await handleSaveWidgets(request, env, corsHeaders);
      }
      
      // Notes
      if (path === '/api/notes' && request.method === 'GET') {
        return await handleGetNotes(request, env, corsHeaders);
      }
      if (path === '/api/notes' && request.method === 'POST') {
        return await handleSaveNote(request, env, corsHeaders);
      }
      
      // Notifications
      if (path === '/api/notifications' && request.method === 'GET') {
        return await handleGetNotifications(env, corsHeaders);
      }
      if (path === '/api/notifications' && request.method === 'POST') {
        return await handleSaveNotification(request, env, corsHeaders);
      }
      if (path.startsWith('/api/notifications/') && request.method === 'DELETE') {
        return await handleDeleteNotification(request, path, env, corsHeaders);
      }
      
      return json({ error: 'Not Found' }, 404, corsHeaders);
    } catch (error) {
      return json({ error: error.message }, 500, corsHeaders);
    }
  }
};

function json(data, status = 200, corsHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

// ============ CHAT ============
async function handleChat(request, env, corsHeaders) {
  const { message, getHistory } = await request.json();
  
  if (getHistory && env.NOVA_KV) {
    const history = await env.NOVA_KV.get('chat-history', 'json') || [];
    return json({ history }, 200, corsHeaders);
  }
  
  const gatewayUrl = env.GATEWAY_URL || 'https://gateway.beric.ca';
  const gatewayToken = env.GATEWAY_TOKEN;
  
  if (!gatewayToken) {
    return json({ reply: "Gateway not configured." }, 200, corsHeaders);
  }
  
  let history = [];
  if (env.NOVA_KV) {
    history = await env.NOVA_KV.get('chat-history', 'json') || [];
  }
  
  const userMsg = { role: 'user', content: message, timestamp: Date.now() };
  history.push(userMsg);
  
  try {
    const contextMessages = history.slice(-10).map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.content
    }));
    
    const response = await fetch(`${gatewayUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${gatewayToken}`,
        'x-clawdbot-session-key': 'portal:main'
      },
      body: JSON.stringify({
        model: 'clawdbot:main',
        messages: contextMessages
      })
    });
    
    if (!response.ok) throw new Error(await response.text());
    
    const data = await response.json();
    const reply = data.choices[0]?.message?.content || "No response.";
    
    const assistantMsg = { role: 'assistant', content: reply, timestamp: Date.now() };
    history.push(assistantMsg);
    
    if (env.NOVA_KV) {
      await env.NOVA_KV.put('chat-history', JSON.stringify(history.slice(-100)));
    }
    
    return json({ reply, history: history.slice(-50) }, 200, corsHeaders);
  } catch (error) {
    history.pop();
    return json({ reply: `Connection error. Try again.` }, 200, corsHeaders);
  }
}

// ============ REAL-TIME STATUS ============
async function handleStatus(env, corsHeaders) {
  const gatewayUrl = env.GATEWAY_URL || 'https://gateway.beric.ca';
  const gatewayToken = env.GATEWAY_TOKEN;
  
  const status = {
    timestamp: Date.now(),
    gateway: { status: 'Unknown', latency: null, agent: 'Unknown' },
    tunnel: { status: 'Unknown', endpoint: gatewayUrl },
    portal: { status: 'Online', version: '3.1', uptime: Date.now() },
    services: {}
  };
  
  // Check Gateway health
  const gwStart = Date.now();
  try {
    const healthRes = await fetch(`${gatewayUrl}/health`, { 
      signal: AbortSignal.timeout(5000) 
    });
    status.gateway.latency = Date.now() - gwStart;
    status.gateway.status = healthRes.ok ? 'Online' : 'Error';
    status.tunnel.status = 'Connected';
  } catch (e) {
    status.gateway.status = 'Offline';
    status.gateway.latency = null;
    status.tunnel.status = 'Disconnected';
  }
  
  // Check Agent availability
  if (status.gateway.status === 'Online' && gatewayToken) {
    try {
      const agentStart = Date.now();
      const testRes = await fetch(`${gatewayUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${gatewayToken}`
        },
        body: JSON.stringify({
          model: 'clawdbot:main',
          max_tokens: 5,
          messages: [{ role: 'user', content: 'ping' }]
        }),
        signal: AbortSignal.timeout(15000)
      });
      status.gateway.agent = testRes.ok ? 'Ready' : 'Busy';
      status.gateway.agentLatency = Date.now() - agentStart;
    } catch {
      status.gateway.agent = 'Busy';
    }
  }
  
  // Get stats from KV
  if (env.NOVA_KV) {
    try {
      const tasks = await env.NOVA_KV.get('tasks', 'json');
      const events = await env.NOVA_KV.get('events', 'json');
      const chat = await env.NOVA_KV.get('chat-history', 'json');
      
      status.stats = {
        tasks: {
          todo: tasks?.todo?.length || 0,
          progress: tasks?.progress?.length || 0,
          done: tasks?.done?.length || 0
        },
        events: events?.length || 0,
        messages: chat?.length || 0
      };
      
      // Log status snapshot for history
      await logStatusSnapshot(env, status);
    } catch {}
  }
  
  return json(status, 200, corsHeaders);
}

async function logStatusSnapshot(env, status) {
  if (!env.NOVA_KV) return;
  
  try {
    const logs = await env.NOVA_KV.get('status-logs', 'json') || [];
    logs.push({
      timestamp: Date.now(),
      gateway: status.gateway?.status,
      latency: status.gateway?.latency,
      agent: status.gateway?.agent,
      tunnel: status.tunnel?.status
    });
    
    // Keep last 288 entries (24h at 5min intervals)
    await env.NOVA_KV.put('status-logs', JSON.stringify(logs.slice(-288)));
  } catch {}
}

async function handleSystem(env, corsHeaders) {
  // Get system stats from gateway
  const gatewayUrl = env.GATEWAY_URL || 'https://gateway.beric.ca';
  const gatewayToken = env.GATEWAY_TOKEN;
  
  const stats = {
    disk: null,
    memory: null,
    load: null
  };
  
  // Try to get stats from gateway (would need a /system endpoint there)
  // For now, return placeholder or cached values
  if (env.NOVA_KV) {
    try {
      const cached = await env.NOVA_KV.get('system-stats', 'json');
      if (cached) {
        return json(cached, 200, corsHeaders);
      }
    } catch {}
  }
  
  return json(stats, 200, corsHeaders);
}

// Google Calendar OAuth Callback
async function handleOAuthCallback(request, env, corsHeaders) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');
  
  if (error) {
    return new Response(`
      <html><body style="font-family: system-ui; text-align: center; padding: 50px;">
        <h1>❌ Authorization Failed</h1>
        <p>${error}</p>
        <a href="https://portal.beric.ca">Return to Portal</a>
      </body></html>
    `, { headers: { 'Content-Type': 'text/html' } });
  }
  
  if (!code) {
    return new Response('Missing authorization code', { status: 400 });
  }
  
  try {
    const tokens = await exchangeCodeForTokens(code);
    
    if (tokens.error) {
      throw new Error(tokens.error_description || tokens.error);
    }
    
    // Store tokens in KV
    if (env.NOVA_KV) {
      await env.NOVA_KV.put('google-tokens', JSON.stringify({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: Date.now() + (tokens.expires_in * 1000),
        scope: tokens.scope
      }));
    }
    
    return new Response(`
      <html><body style="font-family: system-ui; text-align: center; padding: 50px; background: #1a1b26; color: #c0caf5;">
        <h1>✅ Calendar Connected!</h1>
        <p>Your Google Calendar is now synced with Nova Portal.</p>
        <a href="https://portal.beric.ca/#calendar" style="color: #7aa2f7;">Go to Calendar →</a>
        <script>setTimeout(() => window.location.href = 'https://portal.beric.ca/#calendar', 2000);</script>
      </body></html>
    `, { headers: { 'Content-Type': 'text/html' } });
  } catch (e) {
    return new Response(`
      <html><body style="font-family: system-ui; text-align: center; padding: 50px;">
        <h1>❌ Error</h1>
        <p>${e.message}</p>
        <a href="https://portal.beric.ca">Return to Portal</a>
      </body></html>
    `, { headers: { 'Content-Type': 'text/html' } });
  }
}

// Fetch Google Calendar Events
async function handleGoogleCalendar(env, corsHeaders) {
  try {
    const accessToken = await getValidAccessToken(env);
    
    if (!accessToken) {
      return json({ 
        connected: false, 
        authUrl: getAuthUrl(),
        events: [] 
      }, 200, corsHeaders);
    }
    
    const data = await fetchCalendarEvents(accessToken);
    
    // Transform to portal format
    const events = (data.items || []).map(event => ({
      id: event.id,
      title: event.summary || 'Untitled',
      date: event.start?.date || event.start?.dateTime?.split('T')[0],
      time: event.start?.dateTime ? new Date(event.start.dateTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : null,
      endTime: event.end?.dateTime ? new Date(event.end.dateTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : null,
      color: 'blue',
      location: event.location,
      description: event.description,
      source: 'google'
    }));
    
    return json({ connected: true, events }, 200, corsHeaders);
  } catch (e) {
    return json({ connected: false, error: e.message, events: [] }, 200, corsHeaders);
  }
}

// Calendar Connection Status
async function handleCalendarStatus(env, corsHeaders) {
  if (!env.NOVA_KV) {
    return json({ connected: false, authUrl: getAuthUrl() }, 200, corsHeaders);
  }
  
  const tokens = await env.NOVA_KV.get('google-tokens', 'json');
  
  if (!tokens || !tokens.refresh_token) {
    return json({ connected: false, authUrl: getAuthUrl() }, 200, corsHeaders);
  }
  
  return json({ connected: true }, 200, corsHeaders);
}

async function handleStatusHistory(env, corsHeaders) {
  let logs = [];
  if (env.NOVA_KV) {
    logs = await env.NOVA_KV.get('status-logs', 'json') || [];
  }
  return json({ logs }, 200, corsHeaders);
}

async function handleReports(env, corsHeaders) {
  const report = {
    generated: Date.now(),
    period: '24h',
    uptime: { gateway: 0, tunnel: 0 },
    avgLatency: 0,
    totalChecks: 0,
    incidents: [],
    taskMetrics: {},
    chatMetrics: {}
  };
  
  if (!env.NOVA_KV) return json(report, 200, corsHeaders);
  
  try {
    // Status history analysis
    const logs = await env.NOVA_KV.get('status-logs', 'json') || [];
    report.totalChecks = logs.length;
    
    if (logs.length > 0) {
      const onlineChecks = logs.filter(l => l.gateway === 'Online').length;
      const tunnelOnline = logs.filter(l => l.tunnel === 'Connected').length;
      report.uptime.gateway = Math.round((onlineChecks / logs.length) * 100);
      report.uptime.tunnel = Math.round((tunnelOnline / logs.length) * 100);
      
      const latencies = logs.filter(l => l.latency).map(l => l.latency);
      report.avgLatency = latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0;
      
      // Find incidents (offline periods)
      let incident = null;
      logs.forEach((log, i) => {
        if (log.gateway !== 'Online' && !incident) {
          incident = { start: log.timestamp, type: 'gateway_down' };
        } else if (log.gateway === 'Online' && incident) {
          incident.end = log.timestamp;
          incident.duration = incident.end - incident.start;
          report.incidents.push(incident);
          incident = null;
        }
      });
      if (incident) report.incidents.push({ ...incident, ongoing: true });
    }
    
    // Task metrics
    const tasks = await env.NOVA_KV.get('tasks', 'json');
    if (tasks) {
      report.taskMetrics = {
        total: (tasks.todo?.length || 0) + (tasks.progress?.length || 0) + (tasks.done?.length || 0),
        completed: tasks.done?.length || 0,
        inProgress: tasks.progress?.length || 0,
        pending: tasks.todo?.length || 0
      };
    }
    
    // Chat metrics
    const chat = await env.NOVA_KV.get('chat-history', 'json') || [];
    const last24h = chat.filter(m => m.timestamp > Date.now() - 86400000);
    report.chatMetrics = {
      totalMessages: chat.length,
      last24h: last24h.length,
      userMessages: last24h.filter(m => m.role === 'user').length,
      assistantMessages: last24h.filter(m => m.role === 'assistant').length
    };
    
  } catch {}
  
  return json(report, 200, corsHeaders);
}

// ============ TASKS ============
async function handleGetTasks(env, corsHeaders) {
  let tasks = { todo: [], progress: [], done: [] };
  if (env.NOVA_KV) {
    const stored = await env.NOVA_KV.get('tasks', 'json');
    if (stored) tasks = stored;
  }
  return json(tasks, 200, corsHeaders);
}

async function handleSaveTasks(request, env, corsHeaders) {
  const tasks = await request.json();
  if (env.NOVA_KV) {
    await env.NOVA_KV.put('tasks', JSON.stringify(tasks));
  }
  return json({ success: true }, 200, corsHeaders);
}

// ============ PROJECTS ============
async function handleGetProjects(env, corsHeaders) {
  let projects = {
    personal: { name: '🏠 Personal', color: '#7aa2f7', tasks: { todo: [], progress: [], done: [] } },
    laundromat: { name: '🧺 Laundromat', color: '#9ece6a', tasks: { todo: [], progress: [], done: [] } },
    'nova-dev': { name: '✨ Nova Dev', color: '#bb9af7', tasks: { todo: [], progress: [], done: [] } }
  };
  if (env.NOVA_KV) {
    const stored = await env.NOVA_KV.get('projects', 'json');
    if (stored) projects = stored;
  }
  return json(projects, 200, corsHeaders);
}

async function handleSaveProjects(request, env, corsHeaders) {
  const projects = await request.json();
  if (env.NOVA_KV) {
    await env.NOVA_KV.put('projects', JSON.stringify(projects));
  }
  return json({ success: true }, 200, corsHeaders);
}

// ============ EVENTS ============
async function handleGetEvents(env, corsHeaders) {
  let events = [];
  if (env.NOVA_KV) {
    const stored = await env.NOVA_KV.get('events', 'json');
    if (stored) events = stored;
  }
  return json({ events }, 200, corsHeaders);
}

async function handleSaveEvents(request, env, corsHeaders) {
  const { events } = await request.json();
  if (env.NOVA_KV) {
    await env.NOVA_KV.put('events', JSON.stringify(events));
  }
  return json({ success: true }, 200, corsHeaders);
}

// ============ WIDGETS ============
async function handleGetWidgets(env, corsHeaders) {
  let widgets = {
    enabled: ['status-gateway', 'status-portal', 'stats-tasks', 'stats-activity'],
    available: [
      { id: 'status-gateway', name: 'Gateway Status', icon: '🤖', size: 'small' },
      { id: 'status-portal', name: 'Portal Status', icon: '✨', size: 'small' },
      { id: 'status-tunnel', name: 'Tunnel Status', icon: '🔗', size: 'small' },
      { id: 'stats-tasks', name: 'Task Summary', icon: '📋', size: 'small' },
      { id: 'stats-activity', name: 'Recent Activity', icon: '⚡', size: 'medium' },
      { id: 'stats-messages', name: 'Chat Stats', icon: '💬', size: 'small' },
      { id: 'calendar-upcoming', name: 'Upcoming Events', icon: '📆', size: 'medium' },
      { id: 'quick-actions', name: 'Quick Actions', icon: '🚀', size: 'small' }
    ]
  };
  if (env.NOVA_KV) {
    const stored = await env.NOVA_KV.get('widgets', 'json');
    if (stored) widgets.enabled = stored.enabled || widgets.enabled;
  }
  return json(widgets, 200, corsHeaders);
}

async function handleSaveWidgets(request, env, corsHeaders) {
  const { enabled } = await request.json();
  if (env.NOVA_KV) {
    await env.NOVA_KV.put('widgets', JSON.stringify({ enabled }));
  }
  return json({ success: true }, 200, corsHeaders);
}

// ============ NOTES ============
async function handleGetNotes(request, env, corsHeaders) {
  const url = new URL(request.url);
  const fileId = url.searchParams.get('file');
  
  if (!fileId) {
    const today = new Date().toISOString().split('T')[0];
    const notes = [
      { id: 'memory', name: 'MEMORY.md', type: 'memory', icon: '🧠' },
      { id: 'soul', name: 'SOUL.md', type: 'config', icon: '✨' },
      { id: 'tools', name: 'TOOLS.md', type: 'config', icon: '🔧' },
      { id: 'user', name: 'USER.md', type: 'config', icon: '👤' },
      { id: 'agents', name: 'AGENTS.md', type: 'config', icon: '📋' },
      { id: `daily-${today}`, name: `${today}.md`, type: 'daily', icon: '📅' }
    ];
    return json({ notes }, 200, corsHeaders);
  }
  
  const gatewayUrl = env.GATEWAY_URL || 'https://gateway.beric.ca';
  const gatewayToken = env.GATEWAY_TOKEN;
  
  if (!gatewayToken) {
    return json({ content: 'Gateway not configured.' }, 200, corsHeaders);
  }
  
  const fileMap = {
    'memory': 'MEMORY.md',
    'soul': 'SOUL.md', 
    'tools': 'TOOLS.md',
    'user': 'USER.md',
    'agents': 'AGENTS.md'
  };
  
  let filePath = fileMap[fileId];
  if (!filePath && fileId.startsWith('daily-')) {
    filePath = `memory/${fileId.replace('daily-', '')}.md`;
  }
  
  if (!filePath) {
    return json({ content: 'Unknown file.' }, 200, corsHeaders);
  }
  
  try {
    const response = await fetch(`${gatewayUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${gatewayToken}`
      },
      body: JSON.stringify({
        model: 'clawdbot:main',
        messages: [{ 
          role: 'user', 
          content: `Read the file "${filePath}" and return ONLY its raw contents. No commentary.`
        }]
      })
    });
    
    if (!response.ok) throw new Error('Failed to read');
    
    const data = await response.json();
    const content = data.choices[0]?.message?.content || 'Could not read file.';
    
    return json({ content, path: filePath }, 200, corsHeaders);
  } catch (error) {
    return json({ content: `Error: ${error.message}` }, 200, corsHeaders);
  }
}

async function handleSaveNote(request, env, corsHeaders) {
  const { file, content } = await request.json();
  
  const gatewayUrl = env.GATEWAY_URL || 'https://gateway.beric.ca';
  const gatewayToken = env.GATEWAY_TOKEN;
  
  if (!gatewayToken) {
    return json({ success: false, error: 'Gateway not configured.' }, 200, corsHeaders);
  }
  
  const fileMap = {
    'memory': 'MEMORY.md',
    'soul': 'SOUL.md',
    'tools': 'TOOLS.md', 
    'user': 'USER.md',
    'agents': 'AGENTS.md'
  };
  
  let filePath = fileMap[file];
  if (!filePath && file.startsWith('daily-')) {
    filePath = `memory/${file.replace('daily-', '')}.md`;
  }
  
  if (!filePath) {
    return json({ success: false, error: 'Unknown file.' }, 200, corsHeaders);
  }
  
  try {
    await fetch(`${gatewayUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${gatewayToken}`
      },
      body: JSON.stringify({
        model: 'clawdbot:main',
        messages: [{ 
          role: 'user', 
          content: `Write this content to "${filePath}":\n\n${content}\n\nConfirm when done.`
        }]
      })
    });
    
    return json({ success: true, path: filePath }, 200, corsHeaders);
  } catch (error) {
    return json({ success: false, error: error.message }, 200, corsHeaders);
  }
}

// ============ NOTIFICATIONS ============
async function handleGetNotifications(env, corsHeaders) {
  let notifications = [];
  if (env.NOVA_KV) {
    const stored = await env.NOVA_KV.get('notifications', 'json');
    if (stored) notifications = stored;
  }
  return json({ notifications }, 200, corsHeaders);
}

async function handleSaveNotification(request, env, corsHeaders) {
  const notification = await request.json();
  notification.id = notification.id || Date.now().toString();
  notification.createdAt = notification.createdAt || Date.now();
  notification.read = false;
  
  let notifications = [];
  if (env.NOVA_KV) {
    notifications = await env.NOVA_KV.get('notifications', 'json') || [];
    notifications.unshift(notification);
    notifications = notifications.slice(0, 50); // Keep last 50
    await env.NOVA_KV.put('notifications', JSON.stringify(notifications));
  }
  
  return json({ success: true, notification }, 200, corsHeaders);
}

async function handleDeleteNotification(request, path, env, corsHeaders) {
  const id = path.split('/').pop();
  
  if (env.NOVA_KV) {
    let notifications = await env.NOVA_KV.get('notifications', 'json') || [];
    notifications = notifications.filter(n => n.id !== id);
    await env.NOVA_KV.put('notifications', JSON.stringify(notifications));
  }
  
  return json({ success: true }, 200, corsHeaders);
}
