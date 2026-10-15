/* ============================================================
   MASORANGE — Sistema de Notificaciones Toast y Modales de Diálogo
   ============================================================ */

(function () {
  "use strict";

  var container = null;

  function ensureContainer() {
    if (!container || !document.body.contains(container)) {
      container = document.createElement("div");
      container.className = "mo-toast-container";
      container.setAttribute("aria-live", "polite");
      document.body.appendChild(container);
    }
    return container;
  }

  var ICONS = {
    success: "✓",
    error: "✕",
    warning: "!",
    info: "ℹ"
  };

  function showToast(message, type, duration) {
    if (typeof duration === "undefined") {
      duration = type === "error" ? 5000 : 3500;
    }
    type = type || "info";

    var parent = ensureContainer();
    var toast = document.createElement("div");
    toast.className = "mo-toast mo-toast-" + type;

    var iconSpan = document.createElement("span");
    iconSpan.className = "mo-toast-icon";
    iconSpan.textContent = ICONS[type] || "•";

    var contentSpan = document.createElement("div");
    contentSpan.className = "mo-toast-content";
    contentSpan.textContent = message;

    var closeBtn = document.createElement("button");
    closeBtn.className = "mo-toast-close";
    closeBtn.innerHTML = "&times;";
    closeBtn.setAttribute("aria-label", "Cerrar");

    toast.appendChild(iconSpan);
    toast.appendChild(contentSpan);
    toast.appendChild(closeBtn);

    parent.appendChild(toast);

    // Trigger enter animation
    requestAnimationFrame(function () {
      toast.classList.add("show");
    });

    var timer = null;

    function remove() {
      if (timer) clearTimeout(timer);
      toast.classList.remove("show");
      toast.classList.add("hide");
      setTimeout(function () {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 250);
    }

    closeBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      remove();
    });

    if (duration > 0) {
      timer = setTimeout(remove, duration);
    }

    return { close: remove };
  }

  function confirmDialog(options) {
    options = options || {};
    var title = options.title || "¿Estás seguro?";
    var message = options.message || "Esta acción no se puede deshacer.";
    var confirmText = options.confirmText || "Confirmar";
    var cancelText = options.cancelText || "Cancelar";
    var isDanger = !!options.danger;

    return new Promise(function (resolve) {
      var overlay = document.createElement("div");
      overlay.className = "mo-confirm-overlay";

      var box = document.createElement("div");
      box.className = "mo-confirm-box";

      var titleEl = document.createElement("h3");
      titleEl.className = "mo-confirm-title";
      titleEl.textContent = title;

      var msgEl = document.createElement("p");
      msgEl.className = "mo-confirm-message";
      msgEl.textContent = message;

      var actionsEl = document.createElement("div");
      actionsEl.className = "mo-confirm-actions";

      var cancelBtn = document.createElement("button");
      cancelBtn.type = "button";
      cancelBtn.className = "mo-confirm-btn mo-confirm-btn-cancel";
      cancelBtn.textContent = cancelText;

      var confirmBtn = document.createElement("button");
      confirmBtn.type = "button";
      confirmBtn.className = "mo-confirm-btn " + (isDanger ? "mo-confirm-btn-danger" : "mo-confirm-btn-primary");
      confirmBtn.textContent = confirmText;

      actionsEl.appendChild(cancelBtn);
      actionsEl.appendChild(confirmBtn);

      box.appendChild(titleEl);
      box.appendChild(msgEl);
      box.appendChild(actionsEl);

      overlay.appendChild(box);
      document.body.appendChild(overlay);

      requestAnimationFrame(function () {
        overlay.classList.add("show");
        confirmBtn.focus();
      });

      function cleanUp(result) {
        overlay.classList.remove("show");
        document.removeEventListener("keydown", onKeyDown);
        setTimeout(function () {
          if (overlay.parentNode) {
            overlay.parentNode.removeChild(overlay);
          }
          resolve(result);
        }, 200);
      }

      function onKeyDown(e) {
        if (e.key === "Escape") {
          e.preventDefault();
          cleanUp(false);
        } else if (e.key === "Enter" && document.activeElement === confirmBtn) {
          e.preventDefault();
          cleanUp(true);
        }
      }

      cancelBtn.addEventListener("click", function () { cleanUp(false); });
      confirmBtn.addEventListener("click", function () { cleanUp(true); });
      overlay.addEventListener("click", function (e) {
        if (e.target === overlay) cleanUp(false);
      });
      document.addEventListener("keydown", onKeyDown);
    });
  }

  window.Toast = {
    show: showToast,
    success: function (msg, d) { return showToast(msg, "success", d); },
    error: function (msg, d) { return showToast(msg, "error", d); },
    warning: function (msg, d) { return showToast(msg, "warning", d); },
    info: function (msg, d) { return showToast(msg, "info", d); },
    confirm: confirmDialog
  };
})();
