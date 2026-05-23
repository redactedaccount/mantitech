(function () {
  'use strict';

  const NativeWS = window.WebSocket;

  window.WebSocket = function (url, protocols) {
    const ws = protocols !== undefined ? new NativeWS(url, protocols) : new NativeWS(url);
    ws.addEventListener('message', function (e) {
      if (typeof e.data !== 'string') return;
      e.data.split('\x1e').forEach(function (frame) {
        if (!frame) return;
        try {
          const msg = JSON.parse(frame);
          if (msg.type === 1) {
            window.postMessage({ __mt: true, target: msg.target, args: msg.arguments }, '*');
          }
        } catch (_) {}
      });
    });
    return ws;
  };

  window.WebSocket.prototype = NativeWS.prototype;
  window.WebSocket.CONNECTING = NativeWS.CONNECTING;
  window.WebSocket.OPEN      = NativeWS.OPEN;
  window.WebSocket.CLOSING   = NativeWS.CLOSING;
  window.WebSocket.CLOSED    = NativeWS.CLOSED;
})();
