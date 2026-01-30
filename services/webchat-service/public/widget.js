(function() {
  'use strict';

  const scriptTag = document.currentScript || document.querySelector('script[data-key]');
  if (!scriptTag) return;

  const WIDGET_KEY = scriptTag.getAttribute('data-key');
  if (!WIDGET_KEY) return;

  const SERVICE_URL = scriptTag.getAttribute('data-url') || scriptTag.src.replace(/\/widget\.js.*$/, '');
  const WS_PATH = '/ws';

  let socket = null;
  let config = null;
  let sessionId = null;
  let isOpen = false;
  let isConnected = false;
  let messages = [];
  let unreadCount = 0;

  const STORAGE_KEY = `aiyou_chat_${WIDGET_KEY}`;
  const STORAGE_SESSION_KEY = `${STORAGE_KEY}_session`;
  const STORAGE_NAME_KEY = `${STORAGE_KEY}_name`;

  function getSessionId() {
    let id = localStorage.getItem(STORAGE_SESSION_KEY);
    if (!id) { id = 'ws_' + crypto.randomUUID(); localStorage.setItem(STORAGE_SESSION_KEY, id); }
    return id;
  }
  function getVisitorName() { return localStorage.getItem(STORAGE_NAME_KEY) || ''; }
  function setVisitorName(n) { localStorage.setItem(STORAGE_NAME_KEY, n); }

  function hexToRgb(hex) {
    const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
    return `${r},${g},${b}`;
  }

  function createWidget() {
    const host = document.createElement('div');
    host.id = 'aiyou-webchat';
    document.body.appendChild(host);

    const shadow = host.attachShadow({ mode: 'closed' });

    const pc = config?.primaryColor || '#6366f1';
    const rgb = hexToRgb(pc);
    const pos = config?.position || 'right';
    const botName = config?.botName || 'Assistente IA';
    const welcomeMsg = config?.welcomeMessage || 'Ola! Como posso ajudar?';
    const posL = pos === 'left';

    shadow.innerHTML = `
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        * { margin:0; padding:0; box-sizing:border-box; }

        /* ── Bubble ── */
        .bubble {
          position:fixed; bottom:24px; ${posL?'left:24px':'right:24px'};
          width:64px; height:64px; border-radius:50%;
          background: linear-gradient(135deg, ${pc}, ${pc}dd);
          color:#fff; border:none; cursor:pointer;
          display:flex; align-items:center; justify-content:center;
          box-shadow: 0 6px 24px rgba(${rgb},0.4), 0 0 0 0 rgba(${rgb},0.3);
          z-index:2147483647; transition: all 0.3s cubic-bezier(.4,0,.2,1);
          font-family:'Inter',system-ui,-apple-system,sans-serif;
          animation: bubble-pulse 3s ease-in-out infinite;
        }
        .bubble:hover {
          transform: scale(1.1) translateY(-2px);
          box-shadow: 0 8px 32px rgba(${rgb},0.5);
        }
        .bubble:active { transform: scale(0.95); }
        .bubble.open {
          animation: none;
          transform: rotate(0deg);
        }
        .bubble svg { width:28px; height:28px; transition: all 0.3s ease; }
        .bubble.open .icon-chat { display:none; }
        .bubble.open .icon-close { display:block; }
        .bubble .icon-close { display:none; }

        @keyframes bubble-pulse {
          0%,100% { box-shadow: 0 6px 24px rgba(${rgb},0.4), 0 0 0 0 rgba(${rgb},0.3); }
          50% { box-shadow: 0 6px 24px rgba(${rgb},0.4), 0 0 0 12px rgba(${rgb},0); }
        }

        .badge {
          position:absolute; top:-2px; right:-2px;
          background:linear-gradient(135deg,#ef4444,#dc2626);
          color:#fff; font-size:11px; font-weight:700;
          min-width:22px; height:22px; border-radius:11px;
          display:flex; align-items:center; justify-content:center;
          padding:0 6px; border:2px solid #fff;
          animation: badge-pop 0.3s cubic-bezier(.4,0,.2,1);
        }
        .badge.hidden { display:none; }
        @keyframes badge-pop {
          0% { transform:scale(0); } 50% { transform:scale(1.3); } 100% { transform:scale(1); }
        }

        /* ── Greeting tooltip ── */
        .greeting {
          position:fixed; bottom:96px; ${posL?'left:24px':'right:24px'};
          background:#fff; color:#1f2937; padding:14px 18px;
          border-radius:16px; ${posL?'border-bottom-left-radius:6px':'border-bottom-right-radius:6px'};
          box-shadow: 0 8px 30px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06);
          font-family:'Inter',system-ui,sans-serif;
          font-size:14px; line-height:1.5; max-width:280px;
          z-index:2147483646;
          animation: greet-in 0.5s cubic-bezier(.4,0,.2,1) both;
          animation-delay: 2s;
          opacity:0;
          cursor:pointer;
          transition: transform 0.2s ease;
        }
        .greeting:hover { transform: translateY(-2px); }
        .greeting-close {
          position:absolute; top:6px; right:8px;
          background:none; border:none; color:#9ca3af; cursor:pointer;
          font-size:16px; line-height:1; padding:2px;
        }
        .greeting-close:hover { color:#6b7280; }
        .greeting.hidden { display:none !important; }
        @keyframes greet-in {
          0% { opacity:0; transform:translateY(10px) scale(0.95); }
          100% { opacity:1; transform:translateY(0) scale(1); }
        }

        /* ── Panel ── */
        .panel {
          position:fixed; bottom:96px; ${posL?'left:24px':'right:24px'};
          width:400px; height:560px; max-height:calc(100vh - 120px);
          background:#fff; border-radius:20px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.15), 0 4px 16px rgba(0,0,0,0.08);
          z-index:2147483647;
          display:none; flex-direction:column; overflow:hidden;
          font-family:'Inter',system-ui,-apple-system,sans-serif;
          transform-origin: bottom ${posL?'left':'right'};
        }
        .panel.open {
          display:flex;
          animation: panel-open 0.35s cubic-bezier(.4,0,.2,1) both;
        }
        .panel.closing {
          animation: panel-close 0.25s cubic-bezier(.4,0,.6,1) both;
        }
        @keyframes panel-open {
          0% { opacity:0; transform:scale(0.85) translateY(20px); }
          100% { opacity:1; transform:scale(1) translateY(0); }
        }
        @keyframes panel-close {
          0% { opacity:1; transform:scale(1) translateY(0); }
          100% { opacity:0; transform:scale(0.85) translateY(20px); }
        }

        @media (max-width:440px) {
          .panel {
            width:calc(100vw - 16px); height:calc(100vh - 80px);
            bottom:8px; ${posL?'left:8px':'right:8px'}; border-radius:16px;
          }
          .bubble { bottom:16px; ${posL?'left:16px':'right:16px'}; }
        }

        /* ── Header ── */
        .header {
          background: linear-gradient(135deg, ${pc}, ${pc}cc);
          color:#fff; padding:20px; display:flex; align-items:center;
          justify-content:space-between; flex-shrink:0;
          position:relative; overflow:hidden;
        }
        .header::before {
          content:''; position:absolute; top:-50%; right:-30%;
          width:200px; height:200px; border-radius:50%;
          background: rgba(255,255,255,0.08);
        }
        .header::after {
          content:''; position:absolute; bottom:-60%; left:-20%;
          width:160px; height:160px; border-radius:50%;
          background: rgba(255,255,255,0.05);
        }
        .header-info { display:flex; align-items:center; gap:12px; position:relative; z-index:1; }
        .header-avatar {
          width:42px; height:42px; border-radius:14px;
          background:rgba(255,255,255,0.2); backdrop-filter:blur(8px);
          display:flex; align-items:center; justify-content:center;
          font-size:18px; font-weight:700; flex-shrink:0;
        }
        .header-name { font-size:16px; font-weight:600; letter-spacing:-0.01em; }
        .header-status { font-size:12px; opacity:0.85; display:flex; align-items:center; gap:5px; }
        .status-dot {
          width:7px; height:7px; border-radius:50%; background:#34d399;
          animation: status-pulse 2s ease-in-out infinite;
        }
        @keyframes status-pulse {
          0%,100% { opacity:1; } 50% { opacity:0.4; }
        }
        .close-btn {
          background:rgba(255,255,255,0.15); border:none; color:#fff;
          cursor:pointer; padding:8px; border-radius:10px;
          display:flex; transition:all 0.2s ease; position:relative; z-index:1;
        }
        .close-btn:hover { background:rgba(255,255,255,0.25); transform:rotate(90deg); }
        .close-btn svg { width:18px; height:18px; }

        /* ── Messages ── */
        .messages {
          flex:1; overflow-y:auto; padding:20px;
          display:flex; flex-direction:column; gap:6px;
          background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%);
          scroll-behavior: smooth;
        }
        .messages::-webkit-scrollbar { width:5px; }
        .messages::-webkit-scrollbar-track { background:transparent; }
        .messages::-webkit-scrollbar-thumb { background:#cbd5e1; border-radius:3px; }

        .msg {
          max-width:82%; padding:12px 16px; font-size:14px;
          line-height:1.5; word-wrap:break-word; white-space:pre-wrap;
          animation: msg-in 0.3s cubic-bezier(.4,0,.2,1) both;
          position:relative;
        }
        @keyframes msg-in {
          0% { opacity:0; transform:translateY(8px) scale(0.97); }
          100% { opacity:1; transform:translateY(0) scale(1); }
        }
        .msg-bot {
          background:#fff; color:#1e293b;
          align-self:flex-start;
          border-radius: 4px 18px 18px 18px;
          box-shadow: 0 1px 4px rgba(0,0,0,0.05);
        }
        .msg-user {
          background: linear-gradient(135deg, ${pc}, ${pc}dd);
          color:#fff; align-self:flex-end;
          border-radius: 18px 4px 18px 18px;
        }
        .msg-time {
          font-size:10px; opacity:0.5; margin-top:4px;
        }
        .msg-bot .msg-time { text-align:left; }
        .msg-user .msg-time { text-align:right; color:rgba(255,255,255,0.7); }

        /* ── Welcome ── */
        .welcome {
          text-align:center; padding:30px 20px;
          display:flex; flex-direction:column; align-items:center; gap:12px;
        }
        .welcome-avatar {
          width:56px; height:56px; border-radius:18px;
          background: linear-gradient(135deg, ${pc}20, ${pc}10);
          display:flex; align-items:center; justify-content:center;
          font-size:24px; animation: welcome-bounce 1s ease-in-out;
        }
        @keyframes welcome-bounce {
          0% { transform:scale(0); } 50% { transform:scale(1.15); } 100% { transform:scale(1); }
        }
        .welcome-title { font-size:15px; font-weight:600; color:#1e293b; }
        .welcome-text { font-size:13px; color:#64748b; line-height:1.5; }
        .welcome-chips {
          display:flex; flex-wrap:wrap; gap:8px; justify-content:center; margin-top:4px;
        }
        .welcome-chip {
          background:#fff; border:1px solid #e2e8f0; border-radius:20px;
          padding:8px 14px; font-size:12px; color:#475569; cursor:pointer;
          transition: all 0.2s ease; font-family:inherit;
        }
        .welcome-chip:hover {
          background:${pc}10; border-color:${pc}40; color:${pc};
          transform:translateY(-1px); box-shadow: 0 2px 8px rgba(${rgb},0.1);
        }

        /* ── Typing ── */
        .typing {
          align-self:flex-start; padding:12px 16px;
          background:#fff; border-radius:4px 18px 18px 18px;
          box-shadow: 0 1px 4px rgba(0,0,0,0.05);
          display:none; gap:5px; align-items:center;
        }
        .typing.visible { display:flex; animation: msg-in 0.3s ease both; }
        .dot {
          width:8px; height:8px; background:${pc}60; border-radius:50%;
          animation: typing-wave 1.4s ease-in-out infinite;
        }
        .dot:nth-child(2) { animation-delay:0.15s; }
        .dot:nth-child(3) { animation-delay:0.3s; }
        @keyframes typing-wave {
          0%,60%,100% { transform:translateY(0); opacity:0.4; }
          30% { transform:translateY(-6px); opacity:1; }
        }

        /* ── Input ── */
        .input-area {
          padding:16px 20px; border-top:1px solid #f1f5f9;
          display:flex; gap:10px; align-items:flex-end;
          background:#fff; flex-shrink:0;
        }
        .input {
          flex:1; border:1.5px solid #e2e8f0; border-radius:14px;
          padding:12px 16px; font-size:14px; outline:none;
          resize:none; max-height:100px; font-family:'Inter',system-ui,sans-serif;
          line-height:1.45; transition: all 0.2s ease;
          background:#f8fafc;
        }
        .input:focus {
          border-color:${pc}; background:#fff;
          box-shadow: 0 0 0 3px rgba(${rgb},0.1);
        }
        .input::placeholder { color:#94a3b8; }
        .send {
          width:44px; height:44px; border-radius:14px;
          background: linear-gradient(135deg, ${pc}, ${pc}cc);
          border:none; color:#fff; cursor:pointer;
          display:flex; align-items:center; justify-content:center;
          flex-shrink:0; transition: all 0.2s ease;
          box-shadow: 0 2px 8px rgba(${rgb},0.3);
        }
        .send:hover { transform:translateY(-1px); box-shadow: 0 4px 12px rgba(${rgb},0.4); }
        .send:active { transform:scale(0.95); }
        .send:disabled { opacity:0.3; cursor:default; transform:none; box-shadow:none; }
        .send svg { width:18px; height:18px; }

        /* ── Footer ── */
        .footer {
          text-align:center; padding:8px;
          background:#fafbfc; border-top:1px solid #f1f5f9; flex-shrink:0;
        }
        .footer a {
          font-size:10px; color:#94a3b8; text-decoration:none;
          font-family:'Inter',system-ui,sans-serif;
          transition: color 0.2s ease;
        }
        .footer a:hover { color:${pc}; }

        /* ── Name form ── */
        .name-form {
          padding:32px 24px; text-align:center;
          display:flex; flex-direction:column; gap:16px;
          flex:1; justify-content:center;
          background: linear-gradient(180deg, #f8fafc, #f1f5f9);
        }
        .name-emoji { font-size:40px; animation: wave 1.5s ease-in-out infinite; }
        @keyframes wave {
          0%,100% { transform:rotate(0deg); }
          25% { transform:rotate(20deg); }
          75% { transform:rotate(-10deg); }
        }
        .name-title { font-size:18px; font-weight:700; color:#1e293b; }
        .name-sub { font-size:13px; color:#64748b; }
        .name-input {
          border:1.5px solid #e2e8f0; border-radius:14px;
          padding:14px 18px; font-size:15px; outline:none;
          text-align:center; font-family:'Inter',system-ui,sans-serif;
          transition: all 0.2s ease; background:#fff;
        }
        .name-input:focus {
          border-color:${pc};
          box-shadow: 0 0 0 3px rgba(${rgb},0.1);
        }
        .name-input::placeholder { color:#94a3b8; }
        .name-btn {
          background: linear-gradient(135deg, ${pc}, ${pc}cc);
          color:#fff; border:none; border-radius:14px;
          padding:14px; font-size:15px; font-weight:600;
          cursor:pointer; font-family:'Inter',system-ui,sans-serif;
          transition: all 0.2s ease;
          box-shadow: 0 4px 12px rgba(${rgb},0.3);
        }
        .name-btn:hover { transform:translateY(-1px); box-shadow: 0 6px 16px rgba(${rgb},0.4); }
        .name-btn:active { transform:scale(0.98); }

        /* ── Date separator ── */
        .date-sep {
          text-align:center; font-size:11px; color:#94a3b8;
          padding:8px 0; font-weight:500;
        }

        /* ── Sound indicator ── */
        .sound-wave {
          display:inline-flex; gap:2px; align-items:center; height:16px;
        }
        .sound-bar {
          width:3px; background:${pc}; border-radius:2px;
          animation: sound 0.8s ease-in-out infinite;
        }
        .sound-bar:nth-child(1) { height:6px; animation-delay:0s; }
        .sound-bar:nth-child(2) { height:12px; animation-delay:0.1s; }
        .sound-bar:nth-child(3) { height:8px; animation-delay:0.2s; }
        .sound-bar:nth-child(4) { height:14px; animation-delay:0.3s; }
        @keyframes sound {
          0%,100% { transform:scaleY(0.5); } 50% { transform:scaleY(1.2); }
        }
      </style>

      <!-- Greeting tooltip -->
      <div class="greeting" id="greeting">
        <button class="greeting-close" id="greeting-close">&times;</button>
        ${welcomeMsg}
      </div>

      <!-- Bubble -->
      <button class="bubble" id="toggle">
        <svg class="icon-chat" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
        </svg>
        <svg class="icon-close" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
        <span class="badge hidden" id="badge">0</span>
      </button>

      <!-- Panel -->
      <div class="panel" id="panel">
        <div class="header">
          <div class="header-info">
            <div class="header-avatar">${botName.charAt(0).toUpperCase()}</div>
            <div>
              <div class="header-name">${botName}</div>
              <div class="header-status" id="status"><span class="status-dot"></span> Online</div>
            </div>
          </div>
          <button class="close-btn" id="close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div class="name-form" id="name-form" style="display:none">
          <div class="name-emoji">&#128075;</div>
          <div class="name-title">Bem-vindo!</div>
          <div class="name-sub">Como podemos te chamar?</div>
          <input class="name-input" type="text" id="name-input" placeholder="Seu nome" maxlength="60" />
          <button class="name-btn" id="name-submit">Iniciar conversa</button>
        </div>

        <div class="messages" id="messages" style="display:none">
          <div class="welcome" id="welcome">
            <div class="welcome-avatar">&#129302;</div>
            <div class="welcome-title">${botName}</div>
            <div class="welcome-text">${welcomeMsg}</div>
            <div class="welcome-chips" id="chips">
              <button class="welcome-chip" data-msg="Ola! Preciso de ajuda">Preciso de ajuda</button>
              <button class="welcome-chip" data-msg="Quais servicos voces oferecem?">Servicos</button>
              <button class="welcome-chip" data-msg="Qual o horario de atendimento?">Horario</button>
            </div>
          </div>
          <div class="typing" id="typing">
            <div class="dot"></div><div class="dot"></div><div class="dot"></div>
          </div>
        </div>
        <div class="input-area" id="input-area" style="display:none">
          <textarea class="input" id="input" placeholder="Digite sua mensagem..." rows="1"></textarea>
          <button class="send" id="send">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 2L11 13"/><path d="M22 2L15 22L11 13L2 9L22 2Z"/>
            </svg>
          </button>
        </div>
        <div class="footer">
          <a href="https://meuaiyou.cloud" target="_blank" rel="noopener">Powered by AiYou</a>
        </div>
      </div>
    `;

    const $ = id => shadow.getElementById(id);
    const panel = $('panel'), toggle = $('toggle'), closeBtn = $('close');
    const badge = $('badge'), msgContainer = $('messages'), welcomeEl = $('welcome');
    const typingEl = $('typing'), inputArea = $('input-area');
    const input = $('input'), sendBtn = $('send');
    const nameForm = $('name-form'), nameInput = $('name-input'), nameSubmit = $('name-submit');
    const statusEl = $('status'), greetingEl = $('greeting'), greetingClose = $('greeting-close');
    const chipsEl = $('chips');

    let greetingDismissed = false;

    function showChat() {
      nameForm.style.display = 'none';
      msgContainer.style.display = 'flex';
      inputArea.style.display = 'flex';
      input.focus();
    }

    const savedName = getVisitorName();
    if (savedName) {
      showChat();
    } else {
      nameForm.style.display = 'flex';
      msgContainer.style.display = 'none';
      inputArea.style.display = 'none';
    }

    // Greeting tooltip
    greetingClose.addEventListener('click', (e) => {
      e.stopPropagation();
      greetingEl.classList.add('hidden');
      greetingDismissed = true;
    });
    greetingEl.addEventListener('click', () => {
      greetingEl.classList.add('hidden');
      greetingDismissed = true;
      openPanel();
    });

    nameSubmit.addEventListener('click', () => {
      const name = nameInput.value.trim() || 'Visitante';
      setVisitorName(name);
      showChat();
      connectSocket();
    });
    nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); nameSubmit.click(); }
    });

    // Quick-reply chips
    chipsEl.addEventListener('click', (e) => {
      const chip = e.target.closest('.welcome-chip');
      if (!chip) return;
      const text = chip.getAttribute('data-msg');
      if (!text || !isConnected) return;
      socket.emit('message', { text, visitorName: getVisitorName() });
      appendMessage(text, 'user');
    });

    function openPanel() {
      isOpen = true;
      panel.classList.remove('closing');
      panel.classList.add('open');
      toggle.classList.add('open');
      greetingEl.classList.add('hidden');
      unreadCount = 0;
      badge.textContent = '0';
      badge.classList.add('hidden');
      if (getVisitorName()) { input.focus(); scrollToBottom(); }
      if (!socket) connectSocket();
    }

    function closePanel() {
      isOpen = false;
      panel.classList.add('closing');
      toggle.classList.remove('open');
      setTimeout(() => {
        panel.classList.remove('open','closing');
      }, 250);
    }

    toggle.addEventListener('click', () => {
      if (isOpen) closePanel(); else openPanel();
    });
    closeBtn.addEventListener('click', closePanel);

    function sendMessage() {
      const text = input.value.trim();
      if (!text || !isConnected) return;
      socket.emit('message', { text, visitorName: getVisitorName() });
      appendMessage(text, 'user');
      input.value = '';
      input.style.height = 'auto';
      sendBtn.style.transform = 'scale(0.85)';
      setTimeout(() => sendBtn.style.transform = '', 150);
    }

    sendBtn.addEventListener('click', sendMessage);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });
    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 100) + 'px';
    });

    function appendMessage(text, sender, time) {
      if (welcomeEl.style.display !== 'none' && messages.length === 0) {
        welcomeEl.style.display = 'none';
      }
      const msg = document.createElement('div');
      msg.className = `msg msg-${sender === 'user' ? 'user' : 'bot'}`;
      msg.style.animationDelay = '0.05s';
      const timeStr = time
        ? new Date(time).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })
        : new Date().toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });
      msg.innerHTML = `${escapeHtml(text)}<div class="msg-time">${timeStr}</div>`;
      msgContainer.insertBefore(msg, typingEl);
      messages.push({ text, sender, time: time || Date.now() });
      scrollToBottom();
    }

    function scrollToBottom() {
      requestAnimationFrame(() => { msgContainer.scrollTop = msgContainer.scrollHeight; });
    }

    function escapeHtml(str) {
      const d = document.createElement('div'); d.textContent = str; return d.innerHTML;
    }

    function connectSocket() {
      if (socket) return;
      sessionId = getSessionId();
      const sioScript = document.createElement('script');
      sioScript.src = SERVICE_URL + '/static/socket.io.min.js';
      sioScript.onload = () => {
        socket = window.io(SERVICE_URL, { path: WS_PATH, transports: ['websocket','polling'] });

        socket.on('connect', () => {
          isConnected = true;
          statusEl.innerHTML = '<span class="status-dot"></span> Online';
          socket.emit('join', { widgetKey: WIDGET_KEY, sessionId });
          loadHistory();
        });
        socket.on('disconnect', () => {
          isConnected = false;
          statusEl.innerHTML = '<span class="status-dot" style="background:#fbbf24;"></span> Reconectando...';
        });
        socket.on('message', (data) => {
          if (data.sender === 'bot' && data.content) {
            appendMessage(data.content, 'bot', data.timestamp);
            if (!isOpen) {
              unreadCount++;
              badge.textContent = String(unreadCount);
              badge.classList.remove('hidden');
            }
          }
        });
        socket.on('typing', (data) => {
          if (data.isTyping) { typingEl.classList.add('visible'); scrollToBottom(); }
          else { typingEl.classList.remove('visible'); }
        });
        socket.on('error', (err) => console.warn('[AiYou]', err.message));
      };
      sioScript.onerror = () => console.error('[AiYou] Socket.io load failed');
      document.head.appendChild(sioScript);
    }

    async function loadHistory() {
      try {
        const res = await fetch(`${SERVICE_URL}/api/widget/${WIDGET_KEY}/history?session=${sessionId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.messages && data.messages.length > 0) {
          welcomeEl.style.display = 'none';
          for (const m of data.messages) {
            appendMessage(m.content, m.sender_type === 'contact' ? 'user' : 'bot', m.created_at);
          }
        }
      } catch(e) {}
    }

    if (savedName) connectSocket();

    // Auto-hide greeting after 15s
    setTimeout(() => { if (!greetingDismissed && !isOpen) greetingEl.classList.add('hidden'); }, 17000);
  }

  async function init() {
    try {
      const res = await fetch(`${SERVICE_URL}/api/widget/${WIDGET_KEY}/config`);
      if (!res.ok) return;
      config = await res.json();
      createWidget();
    } catch(e) { console.error('[AiYou] Init failed', e); }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
