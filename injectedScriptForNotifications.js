(function () {
  window.addEventListener('message', function (event) {
    if (event.source !== window) return;
    const msg = event.data;
    if (!msg) return;

    if (msg.type === 'EXT_SEND_NOTIFICATION') {
      try {
        const appElement = document.querySelector('[ng-app]') || document.body;
        if (!window.angular) {
          return;
        }
        const injector = angular.element(appElement).injector();
        if (!injector) {
          return;
        }

        const NotificationService = injector.get('NotificationService');
        const NotificationTypes = injector.get('NotificationTypes');
        const $rootScope = injector.get('$rootScope');

        const bundle = $rootScope.bundle || {};
        const onDemandScripts = bundle.onDemandScripts || {};
        const notification = bundle.notification || {};
        const permissionDenied = notification.permissionDenied || {};

        function formatSuccessMessage(scriptName) {
          const template = onDemandScripts.execute?.success || 'Script {0} executed successfully.';
          return template.replace('{0}', scriptName);
        }

        function formatErrorMessage(scriptName, error) {
          const FORBIDDEN = 403, NOT_FOUND = 404, INTERNAL_SERVER_ERROR = 500;
          if (!error || !error.status) {
            const failMsg = onDemandScripts.execute?.failed || 'Execution of script {0} failed.';
            return failMsg.replace('{0}', scriptName);
          }
          switch (error.status) {
            case FORBIDDEN:
              return permissionDenied.noPermission || 'You do not have permission to perform this action.';
            case NOT_FOUND:
              const notFound = onDemandScripts.execute?.notFound || 'Script {0} not found.';
              return notFound.replace('{0}', scriptName);
            case INTERNAL_SERVER_ERROR:
              if (error.data) {
                if (typeof error.data === 'string') return error.data;
                if (error.data.message) return error.data.message;
              }
              return 'Internal server error.';
            default:
              if (error.data && error.data.message) return error.data.message;
              const fail = onDemandScripts.execute?.failed || 'Execution of script {0} failed.';
              return fail.replace('{0}', scriptName);
          }
        }

        if (msg.status === 'success') {
          NotificationService.addNotification(NotificationTypes.SUCCESS, formatSuccessMessage(msg.scriptName));
        } else if (msg.status === 'error') {
          NotificationService.addNotification(
            NotificationTypes.ERROR,
            formatErrorMessage(msg.scriptName, {
              status: msg.errorStatus,
              data: msg.errorData
            })
          );
        }

        NotificationService.showNotifications();
      } catch (e) {
        console.error('Error showing notification:', e);
      }
    }
    else if (msg.type === 'showToast') {
      const { message, status = 'info' } = msg.payload || {};
      if (message) {
        window.showCustomToast({ message, status });
      }
    }
  });

  window.addEventListener('message', function (event) {
    if (event.source !== window) return;
    const msg = event.data;
    if (!msg) return;

    if (msg.type === 'showToast') {

    }

    if (msg.type === 'receivedEmail') {
      const { subject, sender, body, selectedText, attachments } = msg.payload;

      const container = document.createElement('div');
      container.style = `
      position: fixed;
      bottom: 10px;
      right: 10px;
      width: 300px;
      background: white;
      border: 1px solid #ccc;
      padding: 10px;
      font-family: sans-serif;
      box-shadow: 0 0 10px rgba(0,0,0,0.2);
      z-index: 9999;
    `;
      container.innerHTML = `
      <strong>${subject}</strong><br>
      <em>From: ${sender}</em><br><br>
      <div>${body}</div>
    `;

      document.body.appendChild(container);

      setTimeout(() => container.remove(), 15000);
    }
  });

  window.showCustomToast = function ({ message, status = 'info' }) {
    try {
      let container = document.getElementById('ext-stacked-notifications');
      if (!container) {
        container = document.createElement('div');
        container.id = 'ext-stacked-notifications';
        Object.assign(container.style, {
          position: 'fixed',
          top: '10px',
          left: '10px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          zIndex: 999999,
          maxWidth: '320px',
          transition: 'top 0.3s ease'
        });
        document.body.appendChild(container);

        const adjustToastPosition = () => {
          const banner = document.querySelector('.notifications-banner') ||
            document.querySelector('.notification-banner') ||
            document.querySelector('.adsk-notification');
          if (banner && banner.offsetHeight > 0) {
            container.style.top = (banner.offsetHeight + 20) + 'px';
          } else {
            container.style.top = '10px';
          }
        };

        adjustToastPosition();
        const bannerObserver = new MutationObserver(adjustToastPosition);
        bannerObserver.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
      }

      const notification = document.createElement('div');

      const colors = {
        error: {
          bg: '#f8d7da',
          border: '#f5c6cb',
          text: '#721c24'
        },
        info: {
          bg: '#d1ecf1',
          border: '#bee5eb',
          text: '#0c5460'
        },
        warning: {
          bg: '#fff3cd',
          border: '#ffeeba',
          text: '#856404'
        }
      };

      const { bg, border, text } = colors[status] || colors.info;

      Object.assign(notification.style, {
        position: 'relative',
        padding: '10px 40px 10px 15px',
        backgroundColor: bg,
        color: text,
        border: `1px solid ${border}`,
        borderRadius: '4px',
        boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
        fontFamily: 'sans-serif',
        fontSize: '14px',
        cursor: 'default',
        userSelect: 'none'
      });

      const messageText = document.createElement('span');
      messageText.innerHTML = message;
      notification.appendChild(messageText);

      const closeBtn = document.createElement('button');
      closeBtn.innerHTML = '&times;';
      Object.assign(closeBtn.style, {
        position: 'absolute',
        top: '50%',
        right: '10px',
        transform: 'translateY(-50%)',
        border: 'none',
        background: 'transparent',
        color: 'inherit',
        fontSize: '20px',
        fontWeight: 'bold',
        cursor: 'pointer',
        padding: '0',
        lineHeight: '1',
        userSelect: 'none'
      });
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        notification.remove();
        if (!container.children.length) container.remove();
      });
      notification.appendChild(closeBtn);

      notification.addEventListener('click', () => {
        notification.remove();
        if (!container.children.length) container.remove();
      });

      container.appendChild(notification);

      if (status === 'info') {
        setTimeout(() => {
          if (notification.parentElement) {
            notification.remove();
            if (!container.children.length) container.remove();
          }
        }, 5000);
      }
    } catch (err) {
      console.error('Error showing custom toast:', err);
    }
  };
})();