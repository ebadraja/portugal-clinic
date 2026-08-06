(function (global) {
  'use strict';

  var STORAGE_KEY = 'kids018_webchat';
  var POLL_MS = 2000;
  var VERSION = '2026.06.21-session-clarity';

  function loadState() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    } catch (e) {
      return {};
    }
  }

  function saveState(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {}
  }

  function normalizeLoadedState(raw) {
    var next = raw || {};
    if (next.phone && !next.visitorPhone) next.visitorPhone = next.phone;
    if (typeof next.visitorName === 'string') next.visitorName = next.visitorName.trim();
    if (typeof next.visitorPhone === 'string') next.visitorPhone = next.visitorPhone.trim();
    return next;
  }

  function hasVisitorIdentity(state) {
    return !!(
      state.visitorName &&
      state.visitorPhone &&
      state.visitorPhone.replace(/\D/g, '').length >= 10
    );
  }

  function hasSessionTokens(state) {
    return !!(state.conversationId || state.sessionToken);
  }

  function canResumeChat(state) {
    return state.intakeCompleted === true && hasVisitorIdentity(state) && hasSessionTokens(state);
  }

  function clearSessionTokens(state) {
    delete state.conversationId;
    delete state.sessionToken;
  }

  function resetVisitorSession(state) {
    clearSessionTokens(state);
    delete state.intakeCompleted;
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function formatReason(value) {
    var labels = {
      SCHEDULING: 'Scheduling',
      REFILL: 'Refill request',
      QUESTION: 'General question',
      URGENT: 'Urgent',
      INSURANCE: 'Insurance',
      RECORDS: 'Medical records',
      OTHER: 'Other',
    };
    return labels[value] || value;
  }

  function formatTime(iso) {
    try {
      return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    } catch (e) {
      return '';
    }
  }

  function injectStyles(color, styleId) {
    var id = styleId || 'kids018-webchat-styles';
    if (document.getElementById(id)) return;
    ['kids018-webchat-embed-styles-v3', 'kids018-webchat-embed-styles-v4', 'kids018-webchat-embed-styles-v5', 'kids018-webchat-embed-styles-v6', 'kids018-webchat-embed-styles-v7'].forEach(function (oldId) {
      var old = document.getElementById(oldId);
      if (old) old.remove();
    });
    var style = document.createElement('style');
    style.id = id;
    style.textContent =
      '#kids018-webchat-root{position:fixed;z-index:2147483000;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif}' +
      '#kids018-webchat-bubble{width:56px;height:56px;border-radius:9999px;border:none;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.18);color:#fff;font-size:22px}' +
      '#kids018-webchat-panel{position:fixed;bottom:88px;right:20px;width:min(360px,calc(100vw - 24px));height:min(520px,calc(100vh - 120px));background:#fff;border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,.2);display:none;flex-direction:column;overflow:hidden}' +
      '#kids018-webchat-panel.open{display:flex;flex-direction:column}' +
      '.kw-panel-scroll{flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;padding:12px;background:#f8fafc;scrollbar-gutter:stable}' +
      '.kw-panel-scroll .kw-body,.kw-embed-scroll .kw-body{flex:none;overflow:visible;padding:0;background:transparent}' +
      '.kw-intake{padding-bottom:12px}' +
      '.kw-embed-root{position:absolute;inset:0;display:flex;flex-direction:column;overflow:hidden;pointer-events:auto;touch-action:manipulation;background:#F9FAFB;font-family:Nunito,Inter,-apple-system,BlinkMacSystemFont,sans-serif}' +
      '.kw-embed-scroll{flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;padding:12px;background:#F9FAFB;scrollbar-gutter:stable}' +
      '.kw-embed-root .kw-header{padding:10px 12px;font-size:13px;flex-shrink:0;background:#F3F0FF!important;color:#5B21B6!important;border-bottom:1px solid #EDE9FE}' +
      '.kw-embed-root .kw-body{flex:none;overflow:visible;padding:0;background:transparent}' +
      '.kw-embed-root .kw-intake{padding-bottom:12px}' +
      '.kw-intake-title{font-size:14px;font-weight:600;color:#374151;margin:0 0 10px}' +
      '.kw-session-bar{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 12px;background:#F3F0FF;border-bottom:1px solid #EDE9FE;font-size:12px;color:#5B21B6;flex-shrink:0}' +
      '.kw-session-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.kw-session-reset{border:none;background:transparent;color:#7C3AED;font-size:12px;cursor:pointer;text-decoration:underline;padding:4px 0;font-family:inherit;flex-shrink:0}' +
      '.kw-footer.kw-footer-hidden,.kw-embed-root .kw-footer.kw-footer-hidden{display:none!important}' +
      '.kw-header{padding:14px 16px;color:#fff;font-weight:600;font-size:15px;flex-shrink:0}' +
      '.kw-msg{max-width:85%;margin:6px 0;padding:10px 12px;border-radius:14px;font-size:14px;line-height:1.4;word-break:break-word}' +
      '.kw-msg.patient{margin-left:auto;background:' +
      color +
      ';color:#fff;border-bottom-right-radius:4px}' +
      '.kw-msg.staff{background:#fff;border:1px solid #e2e8f0;border-bottom-left-radius:4px}' +
      '.kw-embed-root .kw-msg.staff{background:#fff;border:1px solid #EDE9FE}' +
      '.kw-meta{font-size:10px;opacity:.75;margin-top:4px}' +
      '.kw-footer{border-top:1px solid #e2e8f0;padding:12px;background:#fff;flex-shrink:0}' +
      '.kw-embed-root .kw-footer{border-top-color:#EDE9FE}' +
      '.kw-field{margin-bottom:8px}' +
      '.kw-field label{display:block;font-size:12px;color:#64748b;margin-bottom:4px}' +
      '.kw-field input,.kw-field select,.kw-field textarea{width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:8px;padding:10px;font-size:14px;font-family:inherit}' +
      '.kw-embed-root .kw-field input,.kw-embed-root .kw-field select,.kw-embed-root .kw-field textarea{border-color:#D1D5DB;border-radius:12px;touch-action:manipulation}' +
      '.kw-embed-root .kw-btn{min-height:44px;touch-action:manipulation}' +
      '.kw-actions{display:flex;gap:8px;margin-top:8px}' +
      '.kw-btn{flex:1;border:none;border-radius:8px;padding:10px 12px;font-size:14px;cursor:pointer;font-family:inherit}' +
      '.kw-embed-root .kw-btn{border-radius:12px}' +
      '.kw-btn.primary{background:' +
      color +
      ';color:#fff}' +
      '.kw-btn.ghost{background:#f1f5f9;color:#334155}' +
      '.kw-offline{background:#fff7ed;color:#9a3412;font-size:13px;padding:10px 12px;border-bottom:1px solid #fed7aa;flex-shrink:0}';
    document.head.appendChild(style);
  }

  function createController(options) {
    var apiBase = (options.apiBase || '').replace(/\/$/, '');
    var config = options.config || {};
    var embedded = !!options.embedded;
    var brandColor = options.brandColor || config.primaryColor || '#2563eb';
    var container = options.container || null;

    var state = normalizeLoadedState(loadState());
    if (!state.intakeCompleted) {
      resetVisitorSession(state);
      saveState(state);
    } else if (hasSessionTokens(state) && !hasVisitorIdentity(state)) {
      resetVisitorSession(state);
      saveState(state);
    }

    if (typeof console !== 'undefined' && console.log) {
      console.log('[Kids018Webchat] v' + VERSION, embedded ? 'embedded' : 'standalone', {
        intakeCompleted: !!state.intakeCompleted,
        hasSession: hasSessionTokens(state),
      });
    }
    var pollTimer = null;
    var root = null;
    var panel = null;
    var messagesEl = null;
    var formEl = null;
    var scrollEl = null;
    var open = false;
    var destroyed = false;

    function apiUrl(path) {
      return apiBase + path;
    }

    function persistSession(data, visitor) {
      if (!data) return;
      if (data.conversationId) state.conversationId = data.conversationId;
      if (data.sessionToken) state.sessionToken = data.sessionToken;
      if (visitor) {
        if (visitor.visitorName) state.visitorName = visitor.visitorName;
        if (visitor.phone) state.visitorPhone = visitor.phone;
        if (visitor.reason) state.reason = visitor.reason;
      }
      saveState(state);
    }

    function markIntakeCompleted(visitor) {
      state.intakeCompleted = true;
      if (visitor) {
        if (visitor.visitorName) state.visitorName = visitor.visitorName;
        if (visitor.phone) state.visitorPhone = visitor.phone;
        if (visitor.reason) state.reason = visitor.reason;
      }
      saveState(state);
    }

    function messageApiUrl() {
      var url = apiUrl('/api/webchat/message');
      if (state.sessionToken) {
        url += '?sessionToken=' + encodeURIComponent(state.sessionToken);
      }
      return url;
    }

    function renderMessages(messages) {
      if (!messagesEl) return;
      messagesEl.innerHTML = '';
      (messages || []).forEach(function (msg) {
        var isPatient = msg.senderType === 'PATIENT';
        var bubble = el('div', 'kw-msg ' + (isPatient ? 'patient' : 'staff'));
        bubble.appendChild(el('div', null, msg.content));
        bubble.appendChild(el('div', 'kw-meta', formatTime(msg.createdAt)));
        messagesEl.appendChild(bubble);
      });
      messagesEl.scrollTop = messagesEl.scrollHeight;
      if (scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight;
    }

    function userFacingError(err) {
      var msg = err && err.message ? err.message : '';
      if (msg === 'Failed to fetch' || /network/i.test(msg)) {
        return 'Could not reach the messaging server. Please try again or call (253) 400-4479.';
      }
      return msg || 'Could not send message';
    }

    function fetchMessages() {
      return fetch(messageApiUrl())
        .then(function (r) {
          return r.json();
        })
        .then(function (data) {
          if (data.error) throw new Error(data.error);
          if (data.conversationId) {
            state.conversationId = data.conversationId;
            saveState(state);
          }
          renderMessages(data.messages || []);
        })
        .catch(function () {});
    }

    function startPolling() {
      if (destroyed || pollTimer) return;
      pollTimer = setInterval(fetchMessages, POLL_MS);
    }

    function stopPolling() {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    }

    function sendMessage(payload) {
      return fetch(apiUrl('/api/webchat/message'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).then(function (r) {
        return r.json().then(function (data) {
          if (!r.ok) throw new Error(data.error || 'Send failed');
          return data;
        });
      });
    }

    function prepareIntakeView() {
      if (messagesEl) messagesEl.innerHTML = '';
      if (root) {
        var sessionBar = root.querySelector('.kw-session-bar');
        if (sessionBar) sessionBar.remove();
      }
      if (scrollEl) {
        var oldIntake = scrollEl.querySelector('.kw-intake');
        if (oldIntake) oldIntake.remove();
      }
    }

    function maybeShowWelcome() {
      if (!messagesEl || !config.welcomeMessage || messagesEl.children.length) return;
      messagesEl.appendChild(el('div', 'kw-msg staff', config.welcomeMessage));
    }

    function buildIntakeForm(onSubmit) {
      formEl.innerHTML = '';
      if (scrollEl) {
        formEl.classList.add('kw-footer-hidden');
        var staleIntake = scrollEl.querySelector('.kw-intake');
        if (staleIntake) staleIntake.remove();
      }

      var name = el('input');
      name.placeholder = 'Your name';
      name.value = state.visitorName || '';
      name.autocomplete = 'name';

      var phone = el('input');
      phone.type = 'tel';
      phone.placeholder = 'Phone number';
      phone.value = state.visitorPhone || '';
      phone.autocomplete = 'tel';

      var reason = el('select');
      ['SCHEDULING', 'REFILL', 'QUESTION', 'URGENT', 'INSURANCE', 'RECORDS', 'OTHER'].forEach(function (r) {
        var opt = el('option');
        opt.value = r;
        opt.textContent = formatReason(r);
        reason.appendChild(opt);
      });
      if (state.reason) reason.value = state.reason;

      var message = el('textarea');
      message.rows = 3;
      message.placeholder = 'How can we help?';

      function field(label, input) {
        var wrap = el('div', 'kw-field');
        wrap.appendChild(el('label', null, label));
        wrap.appendChild(input);
        return wrap;
      }

      var fieldsHost = formEl;
      if (scrollEl) {
        fieldsHost = el('div', 'kw-intake');
        fieldsHost.appendChild(el('div', 'kw-intake-title', 'Before we connect you'));
        scrollEl.appendChild(fieldsHost);
      } else {
        fieldsHost.appendChild(el('div', 'kw-intake-title', 'Before we connect you'));
      }

      fieldsHost.appendChild(field('Name', name));
      fieldsHost.appendChild(field('Phone', phone));
      fieldsHost.appendChild(field('Reason', reason));
      fieldsHost.appendChild(field('Message', message));

      var actions = el('div', 'kw-actions');
      var send = el('button', 'kw-btn primary', 'Send message');
      send.type = 'button';
      send.onclick = function () {
        onSubmit({
          visitorName: name.value.trim(),
          phone: phone.value.trim(),
          reason: reason.value,
          content: message.value.trim(),
        });
      };
      actions.appendChild(send);
      if (scrollEl) {
        fieldsHost.appendChild(actions);
        requestAnimationFrame(function () {
          scrollEl.scrollTop = scrollEl.scrollHeight;
        });
      } else {
        formEl.appendChild(actions);
      }
    }

    function renderSessionBar() {
      if (!root) return;
      var existing = root.querySelector('.kw-session-bar');
      if (existing) existing.remove();
      if (!state.visitorName) return;

      var bar = el('div', 'kw-session-bar');
      bar.appendChild(el('span', 'kw-session-label', 'Messaging as ' + state.visitorName));
      var reset = el('button', 'kw-session-reset', 'New conversation');
      reset.type = 'button';
      reset.onclick = function () {
        resetConversation();
      };
      bar.appendChild(reset);

      var header = root.querySelector('.kw-header');
      if (header && header.parentNode) {
        if (header.nextSibling) {
          header.parentNode.insertBefore(bar, header.nextSibling);
        } else {
          header.parentNode.appendChild(bar);
        }
      }
    }

    function resetConversation() {
      stopPolling();
      resetVisitorSession(state);
      delete state.visitorName;
      delete state.visitorPhone;
      delete state.reason;
      saveState(state);
      if (root) {
        var sessionBar = root.querySelector('.kw-session-bar');
        if (sessionBar) sessionBar.remove();
      }
      showIntakeComposer();
    }

    function buildChatComposer(onSubmit) {
      formEl.innerHTML = '';
      if (scrollEl) {
        var intake = scrollEl.querySelector('.kw-intake');
        if (intake) intake.remove();
        formEl.classList.remove('kw-footer-hidden');
      }
      var message = el('textarea');
      message.rows = 2;
      message.placeholder = 'Type a message...';
      message.onkeydown = function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          send.click();
        }
      };
      var actions = el('div', 'kw-actions');
      var send = el('button', 'kw-btn primary', 'Send');
      send.type = 'button';
      send.onclick = function () {
        var text = message.value.trim();
        if (!text) return;
        message.value = '';
        onSubmit(text);
      };
      formEl.appendChild(message);
      actions.appendChild(send);
      formEl.appendChild(actions);
    }

    function showIntakeComposer() {
      stopPolling();
      prepareIntakeView();
      buildIntakeForm(function (data) {
        if (!data.visitorName || !data.phone || !data.content) {
          alert('Please complete all fields.');
          return;
        }
        state.visitorName = data.visitorName;
        state.visitorPhone = data.phone;
        state.reason = data.reason;
        saveState(state);
        sendMessage(data)
          .then(function (res) {
            markIntakeCompleted(data);
            persistSession(res, data);
            showChatComposer();
          })
          .catch(function (err) {
            alert(userFacingError(err));
          });
      });
    }

    function showChatComposer() {
      renderSessionBar();
      buildChatComposer(function (text) {
        sendMessage({
          visitorName: state.visitorName,
          phone: state.visitorPhone,
          reason: state.reason || 'OTHER',
          content: text,
        })
          .then(function (data) {
            persistSession(data, {
              visitorName: state.visitorName,
              phone: state.visitorPhone,
              reason: state.reason,
            });
            fetchMessages();
          })
          .catch(function (err) {
            alert(userFacingError(err));
          });
      });
      return fetchMessages()
        .then(function () {
          if (messagesEl && !messagesEl.children.length) maybeShowWelcome();
        })
        .then(startPolling);
    }

    function wireComposer() {
      if (!canResumeChat(state)) {
        resetVisitorSession(state);
        saveState(state);
        showIntakeComposer();
        return;
      }

      fetch(messageApiUrl())
        .then(function (r) {
          return r.json();
        })
        .then(function (data) {
          if (data.error || !data.conversationId) {
            resetVisitorSession(state);
            saveState(state);
            showIntakeComposer();
            return;
          }
          state.conversationId = data.conversationId;
          state.intakeCompleted = true;
          saveState(state);
          return showChatComposer();
        })
        .catch(function () {
          resetVisitorSession(state);
          saveState(state);
          showIntakeComposer();
        });
    }

    function mountStandalone() {
      injectStyles(brandColor);

      root = el('div', null);
      root.id = 'kids018-webchat-root';

      var position = config.position === 'bottom-left' ? 'left:20px' : 'right:20px';
      root.style.cssText = position + ';bottom:20px';

      var bubble = el('button', null, '💬');
      bubble.id = 'kids018-webchat-bubble';
      bubble.style.background = brandColor;
      bubble.setAttribute('aria-label', 'Open chat');
      bubble.onclick = togglePanel;

      panel = el('div', null);
      panel.id = 'kids018-webchat-panel';
      if (config.position === 'bottom-left') {
        panel.style.left = '20px';
        panel.style.right = 'auto';
      }

      var header = el('div', 'kw-header', config.practiceName || 'Chat with us');
      header.style.background = brandColor;

      if (!config.isOnline) {
        panel.appendChild(el('div', 'kw-offline', config.offlineMessage));
      }

      panel.appendChild(header);
      scrollEl = el('div', 'kw-panel-scroll');
      messagesEl = el('div', 'kw-body');
      scrollEl.appendChild(messagesEl);
      panel.appendChild(scrollEl);

      formEl = el('div', 'kw-footer');
      panel.appendChild(formEl);

      wireComposer();

      root.appendChild(bubble);
      root.appendChild(panel);
      document.body.appendChild(root);
    }

    function mountEmbedded() {
      if (!container) return;
      injectStyles(brandColor, 'kids018-webchat-embed-styles-v8');

      container.innerHTML = '';
      container.style.flex = '1';
      container.style.minHeight = '0';
      container.style.width = '100%';
      container.style.height = '100%';
      container.style.display = 'flex';
      container.style.flexDirection = 'column';
      container.style.padding = '0';
      container.style.overflow = 'hidden';
      container.style.position = 'relative';

      root = el('div', 'kw-embed-root');
      container.appendChild(root);

      if (!config.isOnline) {
        root.appendChild(el('div', 'kw-offline', config.offlineMessage));
      }

      var header = el('div', 'kw-header');
      header.appendChild(el('div', null, 'Message our care team'));
      var subtitle = el('div', null, 'We reply during business hours');
      subtitle.style.cssText = 'font-size:11px;font-weight:400;opacity:.85;margin-top:2px';
      header.appendChild(subtitle);
      root.appendChild(header);

      scrollEl = el('div', 'kw-embed-scroll');
      messagesEl = el('div', 'kw-body');
      scrollEl.appendChild(messagesEl);
      root.appendChild(scrollEl);

      formEl = el('div', 'kw-footer');
      root.appendChild(formEl);

      wireComposer();
    }

    function togglePanel() {
      open = !open;
      if (panel) panel.classList.toggle('open', open);
      if (open && canResumeChat(state)) fetchMessages();
    }

    if (embedded) {
      mountEmbedded();
    } else {
      mountStandalone();
    }

    return {
      refresh: fetchMessages,
      startPolling: startPolling,
      stopPolling: stopPolling,
      resetConversation: resetConversation,
      getState: function () {
        return {
          intakeCompleted: !!state.intakeCompleted,
          hasSession: hasSessionTokens(state),
          visitorName: state.visitorName || null,
        };
      },
      destroy: function () {
        destroyed = true;
        stopPolling();
        if (embedded && container) {
          container.innerHTML = '';
        } else if (root && root.parentNode) {
          root.parentNode.removeChild(root);
        }
      },
    };
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (global.Kids018Webchat && global.Kids018Webchat._loaded) {
        resolve(global.Kids018Webchat);
        return;
      }
      var existing = document.querySelector('script[src="' + src + '"]');
      if (existing) {
        existing.addEventListener('load', function () {
          resolve(global.Kids018Webchat);
        });
        return;
      }
      var s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = function () {
        resolve(global.Kids018Webchat);
      };
      s.onerror = function () {
        reject(new Error('Failed to load webchat core'));
      };
      document.head.appendChild(s);
    });
  }

  global.Kids018Webchat = {
    _loaded: true,
    VERSION: VERSION,
    STORAGE_KEY: STORAGE_KEY,
    POLL_MS: POLL_MS,
    clearStoredSession: function () {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch (e) {}
    },
    GIGI_STORAGE_KEY: 'gigi_chatbot',
    create: createController,
    loadScript: loadScript,
    mountStandalone: function (options) {
      return createController({
        apiBase: options.apiBase,
        config: options.config,
        brandColor: options.config && options.config.primaryColor,
        embedded: false,
      });
    },
    mountEmbedded: function (container, options) {
      return createController({
        apiBase: options.apiBase,
        config: options.config,
        brandColor: options.brandColor || (options.config && options.config.primaryColor),
        embedded: true,
        container: container,
      });
    },
  };
})(typeof window !== 'undefined' ? window : this);
