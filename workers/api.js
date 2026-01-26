// Nova Portal API - Cloudflare Worker
// Full featured: Chat, Status, Tasks, Notes

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
      
      // Status
      if (path === '/api/status') {
        return await handleStatus(env, corsHeaders);
      }
      
      // Tasks (KV backed)
      if (path === '/api/tasks' && request.method === 'GET') {
        return await handleGetTasks(env, corsHeaders);
      }
      if (path === '/api/tasks' && request.method === 'POST') {
        return await handleSaveTasks(request, env, corsHeaders);
      }
      
      // Notes
      if (path === '/api/notes' && request.method === 'GET') {
        return await handleGetNotes(request, env, corsHeaders);
      }
      if (path === '/api/notes' && request.method === 'POST') {
        return await handleSaveNote(request, env, corsHeaders);
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
  
  // If just fetching history
  if (getHistory && env.NOVA_KV) {
    const history = await env.NOVA_KV.get('chat-history', 'json') || [];
    return json({ history }, 200, corsHeaders);
  }
  
  const gatewayUrl = env.GATEWAY_URL || 'https://gateway.beric.ca';
  const gatewayToken = env.GATEWAY_TOKEN;
  
  if (!gatewayToken) {
    return json({ reply: "Gateway not configured." }, 200, corsHeaders);
  }
  
  // Load existing history for context
  let history = [];
  if (env.NOVA_KV) {
    history = await env.NOVA_KV.get('chat-history', 'json') || [];
  }
  
  // Add user message to history
  const userMsg = { role: 'user', content: message, timestamp: Date.now() };
  history.push(userMsg);
  
  try {
    // Build messages with recent context (last 10 messages)
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
    
    // Add assistant reply to history
    const assistantMsg = { role: 'assistant', content: reply, timestamp: Date.now() };
    history.push(assistantMsg);
    
    // Save history (keep last 100 messages)
    if (env.NOVA_KV) {
      await env.NOVA_KV.put('chat-history', JSON.stringify(history.slice(-100)));
    }
    
    return json({ reply, history: history.slice(-50) }, 200, corsHeaders);
  } catch (error) {
    // Remove failed user message
    history.pop();
    return json({ reply: `Connection error. Try again.` }, 200, corsHeaders);
  }
}

// ============ STATUS ============
async function handleStatus(env, corsHeaders) {
  const gatewayUrl = env.GATEWAY_URL || 'https://gateway.beric.ca';
  const gatewayToken = env.GATEWAY_TOKEN;
  
  let gatewayStatus = 'Unknown';
  let agentStatus = 'Unknown';
  
  // Check gateway health
  try {
    const healthRes = await fetch(`${gatewayUrl}/health`, { 
      signal: AbortSignal.timeout(5000) 
    });
    gatewayStatus = healthRes.ok ? 'Online' : 'Error';
  } catch {
    gatewayStatus = 'Offline';
  }
  
  // Get agent info via chat completions test
  if (gatewayStatus === 'Online' && gatewayToken) {
    try {
      const testRes = await fetch(`${gatewayUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${gatewayToken}`
        },
        body: JSON.stringify({
          model: 'clawdbot:main',
          max_tokens: 10,
          messages: [{ role: 'user', content: 'ping' }]
        }),
        signal: AbortSignal.timeout(10000)
      });
      agentStatus = testRes.ok ? 'Online' : 'Error';
    } catch {
      agentStatus = 'Busy';
    }
  }
  
  const status = {
    gateway: {
      status: gatewayStatus,
      url: gatewayUrl,
      agent: agentStatus
    },
    portal: {
      status: 'Online',
      version: '2.0',
      features: ['chat', 'dashboard', 'tasks', 'notes']
    },
    timestamp: new Date().toISOString()
  };
  
  return json(status, 200, corsHeaders);
}

// ============ TASKS ============
async function handleGetTasks(env, corsHeaders) {
  let tasks = { todo: [], progress: [], done: [] };
  
  if (env.NOVA_KV) {
    try {
      const stored = await env.NOVA_KV.get('tasks', 'json');
      if (stored) tasks = stored;
    } catch {}
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

// ============ NOTES ============
async function handleGetNotes(request, env, corsHeaders) {
  const url = new URL(request.url);
  const fileId = url.searchParams.get('file');
  
  // List available notes
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
  
  // Get note content via Nova
  const gatewayUrl = env.GATEWAY_URL || 'https://gateway.beric.ca';
  const gatewayToken = env.GATEWAY_TOKEN;
  
  if (!gatewayToken) {
    return json({ content: 'Gateway not configured.' }, 200, corsHeaders);
  }
  
  // Map file ID to actual path
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
          content: `Read the file "${filePath}" and return ONLY its raw contents. No commentary, no formatting, just the exact file contents.`
        }]
      })
    });
    
    if (!response.ok) throw new Error('Failed to read');
    
    const data = await response.json();
    const content = data.choices[0]?.message?.content || 'Could not read file.';
    
    return json({ content, path: filePath }, 200, corsHeaders);
  } catch (error) {
    return json({ content: `Error reading file: ${error.message}` }, 200, corsHeaders);
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
          content: `Write the following content to the file "${filePath}" (overwrite existing):\n\n${content}\n\nConfirm when done.`
        }]
      })
    });
    
    if (!response.ok) throw new Error('Failed to save');
    
    return json({ success: true, path: filePath }, 200, corsHeaders);
  } catch (error) {
    return json({ success: false, error: error.message }, 200, corsHeaders);
  }
}
