// Nova Portal API - Cloudflare Worker
// Handles chat, status, and notes endpoints

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    
    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
    
    // Handle preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }
    
    try {
      // Route requests
      if (path === '/api/chat' && request.method === 'POST') {
        return await handleChat(request, env, corsHeaders);
      }
      
      if (path === '/api/status') {
        return await handleStatus(env, corsHeaders);
      }
      
      if (path === '/api/notes') {
        return await handleNotes(request, env, corsHeaders);
      }
      
      if (path === '/api/tasks' && request.method === 'GET') {
        return await handleGetTasks(env, corsHeaders);
      }
      
      if (path === '/api/tasks' && request.method === 'POST') {
        return await handleSaveTasks(request, env, corsHeaders);
      }
      
      return new Response('Not Found', { status: 404, headers: corsHeaders });
      
    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
};

// Chat handler - proxies to Clawdbot Gateway
async function handleChat(request, env, corsHeaders) {
  const { message } = await request.json();
  
  // Get Clawdbot Gateway URL from env
  const gatewayUrl = env.CLAWDBOT_GATEWAY_URL || 'http://localhost:3000';
  const gatewayToken = env.CLAWDBOT_GATEWAY_TOKEN;
  
  try {
    // Forward to Clawdbot
    const response = await fetch(`${gatewayUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(gatewayToken && { 'Authorization': `Bearer ${gatewayToken}` })
      },
      body: JSON.stringify({ message, channel: 'nova-portal' })
    });
    
    if (!response.ok) {
      throw new Error('Gateway error');
    }
    
    const data = await response.json();
    return new Response(JSON.stringify({ reply: data.reply || data.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    // Fallback response if gateway unavailable
    return new Response(JSON.stringify({ 
      reply: "I'm having trouble connecting to my backend. Try again in a moment! ✨" 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

// Status handler - returns system status
async function handleStatus(env, corsHeaders) {
  // In production, this would check actual services
  const status = {
    vm: {
      status: 'Online',
      cpu: '6 cores',
      memory: '8GB',
      uptime: '24h'
    },
    ec2: {
      status: 'Online',
      disk: '70%',
      ip: '54.67.100.74'
    },
    tailscale: {
      devices: 3,
      connected: true
    },
    email: {
      unread: 0
    },
    timestamp: new Date().toISOString()
  };
  
  return new Response(JSON.stringify(status), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

// Notes handler
async function handleNotes(request, env, corsHeaders) {
  const url = new URL(request.url);
  const file = url.searchParams.get('file');
  
  // Return list of available notes
  if (!file) {
    const notes = [
      { id: 'today', name: new Date().toISOString().split('T')[0], type: 'daily' },
      { id: 'memory', name: 'MEMORY.md', type: 'memory' },
      { id: 'soul', name: 'SOUL.md', type: 'config' },
      { id: 'tools', name: 'TOOLS.md', type: 'config' }
    ];
    return new Response(JSON.stringify({ notes }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
  
  // In production, fetch from Clawdbot or storage
  return new Response(JSON.stringify({ 
    content: '# Note content would be loaded from Clawdbot Gateway' 
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

// Tasks handlers - use KV for persistence
async function handleGetTasks(env, corsHeaders) {
  let tasks = { todo: [], progress: [], done: [] };
  
  if (env.NOVA_KV) {
    const stored = await env.NOVA_KV.get('tasks');
    if (stored) {
      tasks = JSON.parse(stored);
    }
  }
  
  return new Response(JSON.stringify(tasks), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

async function handleSaveTasks(request, env, corsHeaders) {
  const tasks = await request.json();
  
  if (env.NOVA_KV) {
    await env.NOVA_KV.put('tasks', JSON.stringify(tasks));
  }
  
  return new Response(JSON.stringify({ success: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}
