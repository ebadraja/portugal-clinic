(function () {
  'use strict';

  var STORAGE_KEY = 'gigi_chatbot';
  var SESSION_TTL_MS = 24 * 60 * 60 * 1000;

  function findScriptTag() {
    if (document.currentScript) return document.currentScript;
    var scripts = document.getElementsByTagName('script');
    for (var i = scripts.length - 1; i >= 0; i--) {
      var s = scripts[i];
      if (s.src && /gigi-chatbot\.js(\?|$)/.test(s.src)) return s;
    }
    return null;
  }

  var script = findScriptTag();
  var apiBase =
    (script && (script.getAttribute('data-api-url') || script.getAttribute('data-api-base'))) || '';
  if (!apiBase && script && script.src) {
    apiBase = script.src.replace(/\/gigi-chatbot\.js(\?.*)?$/, '');
  }

  var QUICK_ACTIONS = [
    { label: 'Book an Appointment', message: 'I would like to book an appointment.' },
    { label: 'Insurance Questions', message: 'I have a question about insurance coverage.' },
    { label: 'Office Hours', message: 'What are your office hours?' },
    { label: 'Contact Us', message: 'How can I contact the office?' },
  ];

  var GREETING =
    "Hi there! 🦒 I'm GIGI, the virtual assistant for Kids 0 to 18 Integrative Pediatrics. I can help with:\n\n" +
    '• Scheduling appointments\n' +
    '• Insurance & billing questions\n' +
    '• Office hours & location\n' +
    '• Services we offer\n\n' +
    'How can I help you today?';

  var state = loadState();
  var open = false;
  var mounted = false;
  var launcher, bubble, panel, messagesEl, inputEl, sendBtn, typingEl;
  var bookingActive = false;

  function portalUrl() {
    return apiBase.replace(/\/$/, '') + '/portal';
  }

  function apiUrl(path) {
    return apiBase.replace(/\/$/, '') + path;
  }

  function uuid() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'gigi-' + Date.now() + '-' + Math.random().toString(16).slice(2);
  }

  function loadState() {
    try {
      var raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      if (raw.lastActive && Date.now() - raw.lastActive > SESSION_TTL_MS) {
        localStorage.removeItem(STORAGE_KEY);
        return {};
      }
      if (raw.messages && raw.messages.length) {
        var deduped = [];
        raw.messages.forEach(function (m) {
          var prev = deduped[deduped.length - 1];
          if (prev && prev.type === m.type && prev.content === m.content) return;
          deduped.push(m);
        });
        raw.messages = deduped;
      }
      if (raw.bookingActive) bookingActive = true;
      return raw;
    } catch (_err) {
      return {};
    }
  }

  function saveState() {
    state.lastActive = Date.now();
    if (!state.sessionId) state.sessionId = uuid();
    state.bookingActive = bookingActive;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (_err) {}
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function formatTime(ts) {
    try {
      return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    } catch (_err) {
      return '';
    }
  }

  function injectFont() {
    if (document.getElementById('gigi-font')) return;
    var link = document.createElement('link');
    link.id = 'gigi-font';
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Nunito:wght@700;800&display=swap';
    document.head.appendChild(link);
  }

  function injectStyles() {
    if (document.getElementById('gigi-chatbot-styles-v6')) return;
    ['gigi-chatbot-styles-v1', 'gigi-chatbot-styles-v2', 'gigi-chatbot-styles-v3', 'gigi-chatbot-styles-v4', 'gigi-chatbot-styles-v5'].forEach(function (id) {
      var old = document.getElementById(id);
      if (old) old.remove();
    });
    var style = document.createElement('style');
    style.id = 'gigi-chatbot-styles-v6';
    style.textContent =
      '#gigi-launcher{position:fixed!important;bottom:24px;right:24px;z-index:2147483646!important;display:flex;flex-direction:row;align-items:center;gap:10px;pointer-events:none;font-family:Nunito,ui-rounded,"Segoe UI",system-ui,sans-serif}' +
      '.gigi-callout{pointer-events:none;position:relative;background:#fff;border-radius:20px;padding:14px 20px;box-shadow:0 6px 28px rgba(124,58,237,.18),0 2px 8px rgba(0,0,0,.06);animation:gigi-callout-float 3s ease-in-out infinite;transform-origin:center right}' +
      '.gigi-callout::after{content:"";position:absolute;right:-7px;top:50%;transform:translateY(-50%);width:0;height:0;border-top:9px solid transparent;border-bottom:9px solid transparent;border-left:10px solid #fff;filter:drop-shadow(2px 0 2px rgba(124,58,237,.08))}' +
      '.gigi-callout-text{display:block;font-family:Nunito,ui-rounded,"Segoe UI",system-ui,sans-serif;font-size:16px;font-weight:800;line-height:1.2;letter-spacing:.02em;text-transform:uppercase;color:#7C3AED;white-space:nowrap}' +
      '.gigi-callout-sparkle{display:inline-block;margin-left:4px;animation:gigi-sparkle 2s ease-in-out infinite}' +
      '#gigi-bubble{pointer-events:auto;position:relative;border:none!important;background:none!important;padding:0;margin:0;cursor:pointer;line-height:0;box-shadow:none!important;border-radius:0!important;-webkit-appearance:none;appearance:none;transition:transform .25s cubic-bezier(.34,1.56,.64,1)}' +
      '#gigi-bubble:hover{transform:scale(1.08)}' +
      '#gigi-bubble:focus{outline:2px solid #7C3AED;outline-offset:4px;border-radius:8px}' +
      '#gigi-bubble .gigi-avatar-img{display:block;width:84px;height:auto;max-height:92px;object-fit:contain;background:transparent!important;border:none!important;border-radius:0!important;filter:drop-shadow(0 6px 16px rgba(124,58,237,.25))}' +
      '#gigi-bubble .gigi-badge{position:absolute;top:0;right:0;width:16px;height:16px;background:#EC4899;border-radius:50%;border:2.5px solid #fff;display:none;pointer-events:none;animation:gigi-badge-pulse 2s ease-in-out infinite}' +
      '#gigi-bubble.has-unread .gigi-badge{display:block}' +
      '@keyframes gigi-callout-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}' +
      '@keyframes gigi-sparkle{0%,100%{opacity:1;transform:scale(1) rotate(0deg)}50%{opacity:.85;transform:scale(1.15) rotate(8deg)}}' +
      '@keyframes gigi-badge-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.12)}}' +
      '@media (prefers-reduced-motion:reduce){.gigi-callout,.gigi-callout-sparkle,#gigi-bubble .gigi-badge{animation:none!important}}' +
      '#gigi-panel{position:fixed!important;bottom:130px;right:24px;z-index:2147483647!important;width:400px;height:600px;max-height:calc(100vh - 150px);background:#fff;border-radius:16px;box-shadow:0 16px 48px rgba(0,0,0,.18);display:none;flex-direction:column;overflow:hidden;margin:0;font-family:Nunito,Inter,-apple-system,BlinkMacSystemFont,sans-serif;pointer-events:auto;touch-action:manipulation}' +
      '#gigi-panel.open{display:flex}' +
      '.gigi-header{background:linear-gradient(135deg,#7C3AED,#A855F7);color:#fff;padding:14px 16px;display:flex;align-items:center;gap:12px;flex-shrink:0}' +
      '.gigi-header-avatar{width:40px;height:40px;flex-shrink:0;background:transparent}' +
      '.gigi-header-avatar img{width:100%;height:100%;object-fit:contain}' +
      '.gigi-header-info{flex:1;min-width:0}' +
      '.gigi-header-title{font-size:16px;font-weight:600}' +
      '.gigi-header-sub{font-size:12px;opacity:.9;display:flex;align-items:center;gap:6px}' +
      '.gigi-online-dot{width:8px;height:8px;background:#4ADE80;border-radius:50%}' +
      '.gigi-close{background:transparent;border:none;color:#fff;font-size:22px;cursor:pointer;padding:4px}' +
      '.gigi-tabs{display:flex;border-bottom:1px solid #EDE9FE;background:#FAFAFA;flex-shrink:0}' +
      '.gigi-tab{flex:1;padding:10px 8px;border:none;background:transparent;font-size:13px;font-weight:500;color:#6B7280;cursor:pointer;border-bottom:2px solid transparent}' +
      '.gigi-tab.active{color:#7C3AED;border-bottom-color:#7C3AED;background:#fff}' +
      '.gigi-tab-panels{flex:1;min-height:0;position:relative;overflow:hidden}' +
      '.gigi-tab-panel{position:absolute;inset:0;display:flex;flex-direction:column;overflow:hidden;background:#F9FAFB}' +
      '.gigi-tab-panel.gigi-tab-hidden{display:none!important}' +
      '.gigi-scroll{flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;padding:12px;background:#F9FAFB;scrollbar-gutter:stable}' +
      '.gigi-beta-note{flex-shrink:0;margin:0;padding:8px 12px 10px;font-size:11px;line-height:1.45;text-align:center;color:#9CA3AF;background:#F9FAFB;border-top:1px solid #EDE9FE}' +
      '.gigi-messaging-panel{padding:0;overflow:hidden;background:#F9FAFB}' +
      '.gigi-portal-gateway{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:28px 24px;gap:12px}' +
      '.gigi-portal-icon{width:56px;height:56px;border-radius:50%;background:#EDE9FE;color:#7C3AED;display:flex;align-items:center;justify-content:center;font-size:28px;line-height:1;margin-bottom:4px}' +
      '.gigi-portal-title{margin:0;font-size:18px;font-weight:700;color:#1F2937}' +
      '.gigi-portal-sub{margin:0;font-size:14px;line-height:1.5;color:#6B7280;max-width:280px}' +
      '.gigi-portal-btn{margin-top:8px;width:100%;max-width:280px;min-height:48px;border:none;border-radius:12px;background:#7C3AED;color:#fff;font-size:15px;font-weight:600;cursor:pointer;font-family:inherit;padding:12px 16px}' +
      '.gigi-portal-btn:hover{background:#6D28D9}' +
      '.gigi-portal-phone{margin:8px 0 0;font-size:13px;color:#6B7280}' +
      '.gigi-msg{display:flex;gap:8px;margin:8px 0;max-width:92%}' +
      '.gigi-msg.user{margin-left:auto;flex-direction:row-reverse}' +
      '.gigi-msg-avatar{width:28px;height:28px;flex-shrink:0}' +
      '.gigi-msg-avatar img{width:100%;height:100%;object-fit:contain}' +
      '.gigi-msg-bubble{padding:10px 12px;border-radius:14px;font-size:14px;line-height:1.5;white-space:pre-wrap;word-break:break-word}' +
      '.gigi-msg.bot .gigi-msg-bubble{background:#F3F0FF;color:#1F2937;border-bottom-left-radius:4px}' +
      '.gigi-msg.user .gigi-msg-bubble{background:#7C3AED;color:#fff;border-bottom-right-radius:4px}' +
      '.gigi-msg-time{font-size:11px;color:#6B7280;margin-top:4px}' +
      '.gigi-chips{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}' +
      '.gigi-chip{border:1px solid #C4B5FD;background:#fff;color:#7C3AED;border-radius:999px;padding:8px 12px;font-size:12px;cursor:pointer;min-height:44px}' +
      '.gigi-chip:hover{background:#EDE9FE}' +
      '.gigi-typing{display:flex;gap:4px;padding:8px 12px;background:#F3F0FF;border-radius:14px;width:fit-content;margin:8px 0}' +
      '.gigi-typing span{width:6px;height:6px;background:#7C3AED;border-radius:50%;animation:gigi-dot 1.2s infinite}' +
      '.gigi-typing span:nth-child(2){animation-delay:.2s}' +
      '.gigi-typing span:nth-child(3){animation-delay:.4s}' +
      '@keyframes gigi-dot{0%,80%,100%{opacity:.3}40%{opacity:1;transform:translateY(-3px)}}' +
      '.gigi-footer{border-top:1px solid #EDE9FE;padding:10px 12px;background:#fff;display:flex;gap:8px;align-items:flex-end;flex-shrink:0}' +
      '.gigi-input{flex:1;border:1px solid #D1D5DB;border-radius:12px;padding:10px 12px;font-size:14px;resize:none;min-height:44px;font-family:inherit}' +
      '.gigi-send{width:44px;height:44px;border:none;border-radius:12px;background:#7C3AED;color:#fff;cursor:pointer;font-size:18px}' +
      '.gigi-locked-panel{padding:24px 16px;text-align:center}' +
      '.gigi-slots-card{background:#fff;border:1px solid #EDE9FE;border-radius:12px;padding:12px;margin:8px 0}' +
      '.gigi-slots-title{font-size:13px;font-weight:600;color:#374151;margin-bottom:8px}' +
      '.gigi-slots-pills{display:flex;flex-wrap:wrap;gap:6px}' +
      '.gigi-slot-pill{border:1px solid #C4B5FD;border-radius:999px;padding:8px 14px;font-size:13px;cursor:pointer;background:#fff;min-height:40px}' +
      '.gigi-slot-pill:hover{background:#7C3AED;color:#fff;border-color:#7C3AED}' +
      '@media (max-width:768px){#gigi-launcher{bottom:14px;right:14px;gap:8px}.gigi-callout{padding:11px 16px;border-radius:16px}.gigi-callout-text{font-size:13px}.gigi-callout::after{right:-6px;border-top-width:7px;border-bottom-width:7px;border-left-width:8px}#gigi-bubble .gigi-avatar-img{width:72px;max-height:80px}#gigi-panel{bottom:0;right:0;left:0;width:100%;height:100vh;max-height:100vh;border-radius:0}}';

    document.head.appendChild(style);
  }

  function avatarImg(className) {
    var wrap = el('div', className || 'gigi-msg-avatar');
    var img = document.createElement('img');
    img.src = apiUrl('/gigi-avatar.png');
    img.alt = 'GIGI';
    if (!className) img.className = 'gigi-avatar-img';
    img.onerror = function () {
      wrap.textContent = '🦒';
    };
    wrap.appendChild(img);
    return wrap;
  }

  function ensureMessages() {
    if (!state.messages) state.messages = [];
  }

  function appendMessage(type, content) {
    ensureMessages();
    var msg = { type: type, content: content, timestamp: Date.now() };
    state.messages.push(msg);
    saveState();
    renderMessage(msg);
    scrollMessages();
    if (type === 'bot' && !open && bubble) bubble.classList.add('has-unread');
  }

  function renderMessage(msg) {
    if (!messagesEl) return;
    var row = el('div', 'gigi-msg ' + (msg.type === 'user' ? 'user' : 'bot'));
    if (msg.type === 'bot') row.appendChild(avatarImg('gigi-msg-avatar'));
    var wrap = el('div');
    wrap.appendChild(el('div', 'gigi-msg-bubble', msg.content));
    wrap.appendChild(el('div', 'gigi-msg-time', formatTime(msg.timestamp)));
    row.appendChild(wrap);
    messagesEl.appendChild(row);
  }

  function scrollMessages() {
    if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function showTyping(show) {
    if (!messagesEl) return;
    if (typingEl) { typingEl.remove(); typingEl = null; }
    if (!show) return;
    typingEl = el('div', 'gigi-typing');
    typingEl.appendChild(el('span'));
    typingEl.appendChild(el('span'));
    typingEl.appendChild(el('span'));
    messagesEl.appendChild(typingEl);
    scrollMessages();
  }

  function renderQuickActions() {
    if (!messagesEl || messagesEl.querySelector('.gigi-chips')) return;
    var wrap = el('div', 'gigi-chips');
    QUICK_ACTIONS.forEach(function (qa) {
      var chip = el('button', 'gigi-chip', qa.label);
      chip.type = 'button';
      chip.onclick = function () {
        if (/book an appointment/i.test(qa.label)) bookingActive = true;
        sendUserMessage(qa.message);
      };
      wrap.appendChild(chip);
    });
    messagesEl.appendChild(wrap);
    scrollMessages();
  }

  function renderThreadFromState() {
    if (!messagesEl) return;
    messagesEl.innerHTML = '';
    ensureMessages();
    state.messages.forEach(renderMessage);
    if (state.messages.length === 1 && state.messages[0].type === 'bot' && state.messages[0].content === GREETING) {
      renderQuickActions();
    }
    scrollMessages();
  }

  function showGreetingIfNeeded() {
    ensureMessages();
    if (state.hasSeenGreeting && state.messages.length > 0) {
      renderThreadFromState();
      return;
    }
    state.hasSeenGreeting = true;
    saveState();
    appendMessage('bot', GREETING);
    renderQuickActions();
  }

  function renderSlotPicker(slots) {
    if (!messagesEl || !slots || !slots.length) return;
    var existing = document.getElementById('gigi-slot-picker');
    if (existing) existing.remove();

    var day = slots[0];
    if (!day.times || !day.times.length) return;

    var card = el('div', 'gigi-slots-card');
    card.id = 'gigi-slot-picker';
    card.appendChild(el('div', 'gigi-slots-title', 'Available times on ' + day.dateLabel + ':'));
    var pills = el('div', 'gigi-slots-pills');
    day.times.forEach(function (t) {
      var pill = el('button', 'gigi-slot-pill', t.label);
      pill.type = 'button';
      pill.onclick = function () {
        sendUserMessage(
          'Please book my appointment on ' + day.dateLabel + ' at ' + t.label + '.',
          true
        );
      };
      pills.appendChild(pill);
    });
    card.appendChild(pills);
    messagesEl.appendChild(card);
    scrollMessages();
  }

  function sendUserMessage(text, skipUserBubble) {
    var trimmed = (text || '').trim();
    if (!trimmed) return;
    if (!apiBase) {
      appendMessage('bot', 'Chat is not configured (missing data-api-url on the script tag).');
      return;
    }
    if (/book|appointment|schedule/i.test(trimmed)) bookingActive = true;
    if (!skipUserBubble) appendMessage('user', trimmed);
    if (inputEl) inputEl.value = '';
    if (sendBtn) sendBtn.disabled = true;
    showTyping(true);
    saveState();

    fetch(apiUrl('/api/chatbot/message'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: state.sessionId,
        message: trimmed,
        previousChatId: state.vapiChatId || undefined,
        bookingActive: bookingActive,
        sourcePage: typeof window !== 'undefined' ? window.location.href : undefined,
      }),
    })
      .then(function (r) {
        return r.json().then(function (data) {
          if (!r.ok) throw new Error(data.error || 'Send failed');
          return data;
        });
      })
      .then(function (data) {
        showTyping(false);
        if (data.chatId) { state.vapiChatId = data.chatId; saveState(); }
        if (data.bookingActive) bookingActive = true;
        appendMessage('bot', data.reply || '');
        if (data.slots && data.slots.length) renderSlotPicker(data.slots);
      })
      .catch(function (err) {
        showTyping(false);
        appendMessage('bot', err.message || 'Sorry, something went wrong. Please call (253) 400-4479.');
      })
      .finally(function () {
        if (sendBtn) sendBtn.disabled = false;
        if (inputEl) inputEl.focus();
      });
  }

  function renderMessagingPortalPanel(container) {
    if (!container) return;
    container.innerHTML = '';

    var gateway = el('div', 'gigi-portal-gateway');

    var iconWrap = el('div', 'gigi-portal-icon');
    iconWrap.setAttribute('aria-hidden', 'true');
    iconWrap.textContent = '🛡️';
    gateway.appendChild(iconWrap);

    gateway.appendChild(el('h3', 'gigi-portal-title', 'Secure Patient Messaging'));
    gateway.appendChild(
      el(
        'p',
        'gigi-portal-sub',
        'Message your care team securely. Your conversations are protected with phone verification.',
      ),
    );

    var openBtn = el('button', 'gigi-portal-btn', 'Open Secure Messaging');
    openBtn.type = 'button';
    openBtn.onclick = function () {
      var url = apiBase ? portalUrl() : '';
      if (!url) return;
      window.open(url, '_blank', 'noopener,noreferrer');
    };
    gateway.appendChild(openBtn);

    gateway.appendChild(el('p', 'gigi-portal-phone', 'Or call us at (253) 400-4479'));

    container.appendChild(gateway);
  }

  function switchTab(tab) {
    var tabs = panel.querySelectorAll('.gigi-tab');
    tabs.forEach(function (t) {
      t.classList.toggle('active', t.getAttribute('data-tab') === tab);
    });
    var gigiView = document.getElementById('gigi-tab-gigi');
    var msgView = document.getElementById('gigi-tab-messaging');
    var footer = document.querySelector('.gigi-footer');
    if (tab === 'gigi') {
      if (gigiView) gigiView.classList.remove('gigi-tab-hidden');
      if (msgView) msgView.classList.add('gigi-tab-hidden');
      if (footer) footer.style.display = '';
    } else {
      if (gigiView) gigiView.classList.add('gigi-tab-hidden');
      if (msgView) msgView.classList.remove('gigi-tab-hidden');
      if (footer) footer.style.display = 'none';
    }
  }

  function togglePanel() {
    open = !open;
    panel.classList.toggle('open', open);
    if (open) {
      bubble.classList.remove('has-unread');
      showGreetingIfNeeded();
      if (inputEl) inputEl.focus();
    }
  }

  function mountWidget() {
    if (mounted || document.getElementById('gigi-bubble')) return;
    mounted = true;
    if (!state.sessionId) state.sessionId = uuid();
    saveState();
    injectFont();
    injectStyles();

    launcher = el('div');
    launcher.id = 'gigi-launcher';

    var callout = el('div', 'gigi-callout');
    var calloutText = el('span', 'gigi-callout-text');
    calloutText.appendChild(document.createTextNode('Hi, I’m GIGI! '));
    var sparkle = el('span', 'gigi-callout-sparkle', '✨');
    calloutText.appendChild(sparkle);
    callout.appendChild(calloutText);

    bubble = el('button');
    bubble.id = 'gigi-bubble';
    bubble.setAttribute('aria-label', 'Ask GIGI');
    bubble.style.position = 'relative';
    bubble.onclick = togglePanel;

    var img = document.createElement('img');
    img.src = apiUrl('/gigi-avatar.png');
    img.alt = 'GIGI';
    img.className = 'gigi-avatar-img';
    img.onerror = function () {
      bubble.textContent = '🦒';
    };
    bubble.appendChild(img);
    bubble.appendChild(el('span', 'gigi-badge'));

    launcher.appendChild(callout);
    launcher.appendChild(bubble);

    panel = el('div');
    panel.id = 'gigi-panel';

    var header = el('div', 'gigi-header');
    var headerAvatar = el('div', 'gigi-header-avatar');
    var hImg = document.createElement('img');
    hImg.src = apiUrl('/gigi-avatar.png');
    hImg.alt = 'GIGI';
    hImg.onerror = function () { headerAvatar.textContent = '🦒'; };
    headerAvatar.appendChild(hImg);
    var headerInfo = el('div', 'gigi-header-info');
    headerInfo.appendChild(el('div', 'gigi-header-title', 'GIGI'));
    var sub = el('div', 'gigi-header-sub');
    sub.appendChild(el('span', 'gigi-online-dot'));
    sub.appendChild(document.createTextNode('AI Assistant · Online'));
    headerInfo.appendChild(sub);
    var closeBtn = el('button', 'gigi-close', '×');
    closeBtn.onclick = togglePanel;
    header.appendChild(headerAvatar);
    header.appendChild(headerInfo);
    header.appendChild(closeBtn);
    panel.appendChild(header);

    var tabs = el('div', 'gigi-tabs');
    var tabGigi = el('button', 'gigi-tab active', 'GIGI');
    tabGigi.type = 'button';
    tabGigi.setAttribute('data-tab', 'gigi');
    tabGigi.onclick = function () { switchTab('gigi'); };
    var tabMsg = el('button', 'gigi-tab', 'Messaging');
    tabMsg.type = 'button';
    tabMsg.setAttribute('data-tab', 'messaging');
    tabMsg.onclick = function () { switchTab('messaging'); };
    tabs.appendChild(tabGigi);
    tabs.appendChild(tabMsg);
    panel.appendChild(tabs);

    var tabPanels = el('div', 'gigi-tab-panels');

    var gigiTab = el('div', 'gigi-tab-panel');
    gigiTab.id = 'gigi-tab-gigi';
    messagesEl = el('div', 'gigi-scroll');
    messagesEl.id = 'gigi-thread';
    gigiTab.appendChild(messagesEl);
    var betaNote = el(
      'p',
      'gigi-beta-note',
      'GIGI is in beta and still learning — please verify important details with our care team.'
    );
    gigiTab.appendChild(betaNote);
    tabPanels.appendChild(gigiTab);

    var msgView = el('div', 'gigi-tab-panel gigi-messaging-panel gigi-tab-hidden');
    msgView.id = 'gigi-tab-messaging';
    renderMessagingPortalPanel(msgView);
    tabPanels.appendChild(msgView);

    panel.appendChild(tabPanels);

    var footer = el('div', 'gigi-footer');
    inputEl = el('textarea', 'gigi-input');
    inputEl.placeholder = 'Type a message…';
    inputEl.rows = 1;
    inputEl.onkeydown = function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendUserMessage(inputEl.value); }
    };
    sendBtn = el('button', 'gigi-send', '→');
    sendBtn.type = 'button';
    sendBtn.onclick = function () { sendUserMessage(inputEl.value); };
    footer.appendChild(inputEl);
    footer.appendChild(sendBtn);
    panel.appendChild(footer);

    document.body.appendChild(launcher);
    document.body.appendChild(panel);
    console.log('[GIGI] Widget mounted. API base:', apiBase || '(none)');
    console.log('[GIGI] Messaging tab opens secure portal at:', apiBase ? portalUrl() : '(none)');
  }

  function bootGigi() {
    try { mountWidget(); } catch (err) { console.error('[GIGI] mount failed:', err); }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootGigi);
  } else {
    bootGigi();
  }
})();
