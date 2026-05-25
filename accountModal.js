export function initAccountModal({
  beforeOpen,
  button,
  getAccountState,
  isConfigured,
  onCreateAccount,
  onLogin,
  onLogout
}) {
  if (!button) {
    return;
  }

  let mode = "login";
  let message = "";
  let keydownHandler;
  let preservedEmail = "";

  button.addEventListener("click", () => open());

  function open(nextMode = "login") {
    beforeOpen?.();
    mode = nextMode;
    message = "";
    render();
  }

  function close() {
    const root = document.querySelector("#modal-root");
    if (root) {
      root.innerHTML = "";
    }

    button.setAttribute("aria-expanded", "false");

    if (keydownHandler) {
      document.removeEventListener("keydown", keydownHandler);
      keydownHandler = null;
    }
  }

  function render() {
    const root = document.querySelector("#modal-root");
    if (!root) {
      return;
    }

    root.innerHTML = "";
    button.setAttribute("aria-expanded", "true");

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        close();
      }
    });

    const modal = document.createElement("section");
    modal.className = "modal account-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "account-modal-title");

    const form = document.createElement("form");
    form.className = "modal-form";
    form.addEventListener("submit", handleSubmit);
    form.append(createTopbar(), createBody(), createFooter());

    modal.append(form);
    overlay.append(modal);
    root.append(overlay);

    keydownHandler = (event) => {
      if (event.key === "Escape") {
        close();
      }
    };
    document.addEventListener("keydown", keydownHandler);

    requestAnimationFrame(() => {
      overlay.querySelector("[data-account-email]")?.focus({ preventScroll: true });
    });
  }

  function createTopbar() {
    const topbar = document.createElement("div");
    topbar.className = "modal-topbar";

    const title = document.createElement("h2");
    title.id = "account-modal-title";
    title.className = "modal-title";
    title.textContent = "Cuenta";

    const closeButton = document.createElement("button");
    closeButton.className = "close-button";
    closeButton.type = "button";
    closeButton.textContent = "×";
    closeButton.setAttribute("aria-label", "Cerrar modal de cuenta");
    closeButton.addEventListener("click", close);

    topbar.append(title, closeButton);
    return topbar;
  }

  function createBody() {
    const body = document.createElement("div");
    body.className = "account-modal-body";
    const accountState = getAccountState?.();

    if (accountState?.email) {
      const sessionPanel = document.createElement("div");
      sessionPanel.className = "account-session-panel";

      const label = document.createElement("p");
      label.className = "account-session-label";
      label.textContent = "Sesión activa";

      const email = document.createElement("p");
      email.className = "account-session-email";
      email.textContent = accountState.email;

      sessionPanel.append(label, email);
      body.append(sessionPanel);
      return body;
    }

    const tabs = document.createElement("div");
    tabs.className = "account-mode-tabs";
    tabs.append(
      createModeButton("login", "Iniciar sesión"),
      createModeButton("create", "Crear cuenta")
    );

    const fields = document.createElement("div");
    fields.className = "account-fields";
    fields.append(
      createInputField("Correo", "email", "email", preservedEmail, {
        autocomplete: "email",
        dataAccountEmail: "true"
      }),
      createInputField("Contraseña", "password", "password", "", {
        autocomplete: mode === "create" ? "new-password" : "current-password",
        dataAccountPassword: "true"
      })
    );

    if (mode === "create") {
      fields.append(
        createInputField("Confirmar contraseña", "confirmPassword", "password", "", {
          autocomplete: "new-password",
          dataAccountConfirmPassword: "true"
        })
      );
    }

    const notice = document.createElement("p");
    notice.className = `account-message${message ? " is-visible" : ""}`;
    notice.dataset.accountMessage = "true";
    notice.textContent = message;

    if (!isConfigured()) {
      notice.classList.add("is-visible");
      notice.textContent =
        "Cuenta está lista en la interfaz, pero falta configurar Supabase en window.JAVOPM_CONFIG.";
    }

    body.append(tabs, fields, notice);
    return body;
  }

  function createFooter() {
    const footer = document.createElement("footer");
    footer.className = "modal-footer account-modal-footer";

    const cancelButton = document.createElement("button");
    cancelButton.className = "small-button account-cancel-button";
    cancelButton.type = "button";
    cancelButton.textContent = "Cancelar";
    cancelButton.addEventListener("click", close);

    const primaryButton = document.createElement("button");
    primaryButton.className = "save-task-button account-primary-button";
    primaryButton.type = "submit";
    primaryButton.disabled = !isConfigured();
    primaryButton.textContent = getAccountState?.()?.email
      ? "Cerrar sesión"
      : mode === "create" ? "Crear cuenta" : "Iniciar sesión";

    footer.append(cancelButton, primaryButton);
    return footer;
  }

  function createModeButton(value, label) {
    const modeButton = document.createElement("button");
    modeButton.className = `account-mode-button${mode === value ? " is-active" : ""}`;
    modeButton.type = "button";
    modeButton.textContent = label;
    modeButton.setAttribute("aria-pressed", String(mode === value));
    modeButton.addEventListener("click", () => {
      mode = value;
      message = "";
      const emailInput = document.querySelector("[data-account-email]");
      preservedEmail = emailInput?.value || preservedEmail;
      render();
    });
    return modeButton;
  }

  function createInputField(labelText, name, type, value, dataset = {}) {
    const wrapper = document.createElement("div");
    wrapper.className = "field";

    const label = document.createElement("label");
    label.htmlFor = `account-${name}`;
    label.textContent = labelText;

    const input = document.createElement("input");
    input.id = `account-${name}`;
    input.name = name;
    input.type = type;
    input.value = value;

    Object.entries(dataset).forEach(([key, datasetValue]) => {
      if (key.startsWith("data")) {
        input.dataset[key.replace(/^data/, "").replace(/^[A-Z]/, (letter) => letter.toLowerCase())] =
          datasetValue;
        return;
      }
      input.setAttribute(key, datasetValue);
    });

    wrapper.append(label, input);
    return wrapper;
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!isConfigured()) {
      return;
    }

    const accountState = getAccountState?.();
    if (accountState?.email) {
      const form = event.currentTarget;
      setBusy(form, true);
      try {
        await onLogout?.();
        close();
      } catch (error) {
        message = error.message || "No se pudo cerrar sesión.";
        render();
      } finally {
        setBusy(form, false);
      }
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    const email = String(formData.get("email") || "").trim();
    const password = String(formData.get("password") || "");
    const confirmPassword = String(formData.get("confirmPassword") || "");
    preservedEmail = email;
    setBusy(form, true);

    try {
      const result = mode === "create"
        ? await onCreateAccount({ confirmPassword, email, password })
        : await onLogin({ email, password });

      if (result?.status === "existing_email") {
        mode = "login";
        message = "Ese correo ya tiene cuenta. Inicia sesión para continuar.";
        render();
        return;
      }

      if (result?.status === "verification_required") {
        message = "Revisa tu correo para confirmar la cuenta y luego inicia sesión desde este dispositivo.";
        render();
        return;
      }

      close();
    } catch (error) {
      message = error.message || "No se pudo completar la acción.";
      render();
    } finally {
      setBusy(form, false);
    }
  }

  function setBusy(form, busy) {
    form.querySelectorAll("button, input").forEach((element) => {
      element.disabled = busy;
    });
  }
}
