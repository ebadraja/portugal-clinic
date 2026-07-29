(function () {
  'use strict';

  var script = document.currentScript;
  var apiBase = (script && script.getAttribute('data-api-base')) || '';
  if (!apiBase && script && script.src) {
    apiBase = script.src.replace(/\/webchat-widget\.js(\?.*)?$/, '');
  }

  function apiUrl(path) {
    return apiBase.replace(/\/$/, '') + path;
  }

  function boot() {
    var coreScriptUrl = apiUrl('/webchat-core.js?v=8');

    function start(config) {
      if (config.enabled === false) return;
      if (!window.Kids018Webchat) return;
      window.Kids018Webchat.mountStandalone({ apiBase: apiBase, config: config });
    }

    if (window.Kids018Webchat) {
      fetch(apiUrl('/api/webchat/init'))
        .then(function (r) {
          return r.json();
        })
        .then(start)
        .catch(function () {});
      return;
    }

    var s = document.createElement('script');
    s.src = coreScriptUrl;
    s.async = true;
    s.onload = function () {
      fetch(apiUrl('/api/webchat/init'))
        .then(function (r) {
          return r.json();
        })
        .then(start)
        .catch(function () {});
    };
    document.head.appendChild(s);
  }

  boot();
})();
