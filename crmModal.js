import { renderChecklists } from "./checklist.js?v=20260529-crm-prospect-gutters";
import {
  CRM_STATUSES,
  createCRMContact,
  createCRMInteraction,
  normalizeCRMProspect,
  sortByOrder
} from "./models.js?v=20260529-crm-prospect-gutters";

let crmModalKeydownHandler;

export function openCRMProspectModal({
  author = {},
  isNew = false,
  onClose,
  onDelete,
  onSave,
  prospect
}) {
  const root = document.querySelector("#modal-root");
  if (!root) {
    return;
  }

  closeCRMProspectModal({ clearRoot: true, onClose: null });

  let draft = normalizeCRMProspect(prospect);
  let message = "";

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) {
      closeCRMProspectModal({ onClose });
    }
  });

  const modal = document.createElement("section");
  modal.className = "modal crm-prospect-modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-labelledby", "crm-prospect-modal-title");

  const shell = document.createElement("div");
  shell.className = "modal-form";

  function renderModal() {
    shell.innerHTML = "";
    shell.append(createTopbar(), createBody(), createFooter());
  }

  function createTopbar() {
    const topbar = document.createElement("div");
    topbar.className = "modal-topbar";

    const title = document.createElement("h2");
    title.id = "crm-prospect-modal-title";
    title.className = "modal-title";
    title.textContent = draft.companyName || "Nuevo prospecto";

    const closeButton = document.createElement("button");
    closeButton.className = "close-button";
    closeButton.type = "button";
    closeButton.textContent = "×";
    closeButton.setAttribute("aria-label", "Cerrar modal de prospecto");
    closeButton.addEventListener("click", () => closeCRMProspectModal({ onClose }));

    topbar.append(title, closeButton);
    return topbar;
  }

  function createBody() {
    const body = document.createElement("div");
    body.className = "modal-body crm-modal-body";

    const fields = document.createElement("section");
    fields.className = "crm-field-grid";
    fields.append(
      createInputField("Empresa / persona física o moral", "companyName", draft.companyName),
      createInputField("Nombre completo (Contacto principal)", "contactName", draft.contactName),
      createInputField("Puesto", "position", draft.position),
      createInputField("Correo", "email", draft.email, "email"),
      createInputField("Celular", "mobilePhone", draft.mobilePhone, "tel"),
      createInputField("Teléfono", "phone", draft.phone, "tel"),
      createInputField("RFC", "rfc", draft.rfc),
      createTextareaField("Dirección", "address", draft.address, "crm-address-field"),
      createStatusField()
    );

    body.append(
      fields,
      createContactsSection(),
      createTextareaField("Comentarios", "comments", draft.comments),
      createInteractionsSection(),
      createChecklistSection()
    );

    if (message) {
      const feedback = document.createElement("p");
      feedback.className = "project-menu-message is-visible";
      feedback.textContent = message;
      body.append(feedback);
    }

    return body;
  }

  function createInputField(labelText, key, value, type = "text") {
    const field = createFieldShell(labelText);
    const input = document.createElement("input");
    input.type = type;
    input.value = value || "";
    input.addEventListener("input", () => {
      draft = {
        ...draft,
        [key]: input.value,
        updatedAt: new Date().toISOString()
      };
      if (key === "companyName") {
        shell.querySelector(".modal-title").textContent = input.value || "Nuevo prospecto";
      }
    });
    field.append(input);
    return field;
  }

  function createTextareaField(labelText, key, value, fieldClassName = "crm-comments-field") {
    const field = createFieldShell(labelText);
    field.classList.add(fieldClassName);
    const textarea = document.createElement("textarea");
    textarea.value = value || "";
    textarea.addEventListener("input", () => {
      draft = {
        ...draft,
        [key]: textarea.value,
        updatedAt: new Date().toISOString()
      };
    });
    field.append(textarea);
    return field;
  }

  function createStatusField() {
    const field = createFieldShell("Estatus");
    const select = document.createElement("select");
    CRM_STATUSES.forEach((status) => {
      const option = document.createElement("option");
      option.value = status;
      option.textContent = status;
      select.append(option);
    });
    select.value = CRM_STATUSES.includes(draft.status) ? draft.status : CRM_STATUSES[0];
    select.addEventListener("change", () => {
      draft = {
        ...draft,
        status: select.value,
        updatedAt: new Date().toISOString()
      };
    });
    field.append(select);
    return field;
  }

  function createFieldShell(labelText) {
    const field = document.createElement("label");
    field.className = "field";
    const label = document.createElement("span");
    label.textContent = labelText;
    field.append(label);
    return field;
  }

  function createContactsSection() {
    const section = document.createElement("section");
    section.className = "crm-contacts-section";

    const header = document.createElement("div");
    header.className = "crm-section-header";

    const title = document.createElement("h3");
    title.className = "section-title";
    title.textContent = "Contactos";

    const addButton = document.createElement("button");
    addButton.className = "small-button";
    addButton.type = "button";
    addButton.innerHTML = '<span class="plus-mark" aria-hidden="true"></span>Agregar contacto';
    addButton.addEventListener("click", () => {
      draft = {
        ...draft,
        contacts: [
          ...draft.contacts,
          createCRMContact({ order: draft.contacts.length })
        ],
        updatedAt: new Date().toISOString()
      };
      renderModal();
      requestAnimationFrame(() => {
        shell.querySelector("[data-crm-contact-input]")?.focus({ preventScroll: true });
      });
    });

    header.append(title, addButton);

    const list = document.createElement("div");
    list.className = "crm-contact-list";

    if (draft.contacts.length === 0) {
      const empty = document.createElement("p");
      empty.className = "crm-interaction-empty";
      empty.textContent = "Sin contactos todavía.";
      list.append(empty);
    }

    draft.contacts.forEach((contact, index) => {
      list.append(createContactItem(contact, index));
    });

    section.append(header, list);
    return section;
  }

  function createContactItem(contact, contactIndex) {
    const item = document.createElement("article");
    item.className = "crm-contact-item";

    const fields = document.createElement("div");
    fields.className = "crm-contact-grid";
    fields.append(
      createContactInput("Nombre completo", contactIndex, "fullName", contact.fullName),
      createContactInput("Puesto", contactIndex, "position", contact.position),
      createContactInput("Celular", contactIndex, "mobilePhone", contact.mobilePhone, "tel"),
      createContactInput("Teléfono", contactIndex, "phone", contact.phone, "tel")
    );

    const deleteButton = document.createElement("button");
    deleteButton.className = "danger-button crm-contact-delete-button";
    deleteButton.type = "button";
    deleteButton.textContent = "Eliminar";
    deleteButton.addEventListener("click", () => {
      draft = {
        ...draft,
        contacts: draft.contacts
          .filter((itemContact) => itemContact.id !== contact.id)
          .map((itemContact, index) => ({ ...itemContact, order: index })),
        updatedAt: new Date().toISOString()
      };
      renderModal();
    });

    item.append(fields, deleteButton);
    return item;
  }

  function createContactInput(labelText, contactIndex, key, value, type = "text") {
    const field = createFieldShell(labelText);
    const input = document.createElement("input");
    input.type = type;
    input.value = value || "";
    input.dataset.crmContactInput = "true";
    input.addEventListener("input", () => {
      draft = {
        ...draft,
        contacts: draft.contacts.map((contact, index) =>
          index === contactIndex
            ? {
              ...contact,
              [key]: input.value,
              updatedAt: new Date().toISOString()
            }
            : contact
        ),
        updatedAt: new Date().toISOString()
      };
    });
    field.append(input);
    return field;
  }

  function createInteractionsSection() {
    const section = document.createElement("section");
    section.className = "crm-interactions-section";

    const title = document.createElement("h3");
    title.className = "section-title";
    title.textContent = "Interacciones";

    const form = document.createElement("form");
    form.className = "crm-interaction-form";
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const input = form.querySelector("[data-crm-interaction-input]");
      const comment = String(input.value || "").trim();
      if (!comment) {
        return;
      }

      draft = {
        ...draft,
        interactions: sortByOrder([
          ...draft.interactions,
          createCRMInteraction({
            authorName: author.name || "",
            authorUserId: author.userId || "",
            comment,
            order: draft.interactions.length
          })
        ]),
        updatedAt: new Date().toISOString()
      };
      message = "";
      renderModal();
      requestAnimationFrame(() => {
        shell.querySelector("[data-crm-interaction-input]")?.focus({ preventScroll: true });
      });
    });

    const textarea = document.createElement("textarea");
    textarea.dataset.crmInteractionInput = "true";
    textarea.placeholder = "Agregar comentario de interacción";

    const addButton = document.createElement("button");
    addButton.className = "small-button";
    addButton.type = "submit";
    addButton.innerHTML = '<span class="plus-mark" aria-hidden="true"></span>Agregar interacción';

    form.append(textarea, addButton);

    const list = document.createElement("div");
    list.className = "crm-interaction-list";

    if (draft.interactions.length === 0) {
      const empty = document.createElement("p");
      empty.className = "crm-interaction-empty";
      empty.textContent = "Sin interacciones todavía.";
      list.append(empty);
    }

    draft.interactions
      .slice()
      .sort((a, b) => String(b.occurredAt).localeCompare(String(a.occurredAt)))
      .forEach((interaction) => {
        list.append(createInteractionItem(interaction));
      });

    section.append(title, form, list);
    return section;
  }

  function createInteractionItem(interaction) {
    const item = document.createElement("article");
    item.className = "crm-interaction-item";

    const meta = document.createElement("p");
    meta.className = "crm-interaction-meta";
    const authorName = interaction.authorName || "Sin autor";
    meta.textContent = `${authorName} · ${formatDateTime(interaction.occurredAt)}`;

    const comment = document.createElement("p");
    comment.className = "crm-interaction-comment";
    comment.textContent = interaction.comment;

    item.append(meta, comment);
    return item;
  }

  function createChecklistSection() {
    return renderChecklists(draft, {
      addChecklist: (checklist) => {
        draft = {
          ...draft,
          checklists: [...draft.checklists, checklist],
          updatedAt: new Date().toISOString()
        };
        renderModal();
      },
      addItem: (checklistId, item) => {
        draft = {
          ...draft,
          checklists: draft.checklists.map((checklist) =>
            checklist.id === checklistId
              ? { ...checklist, items: [...checklist.items, item] }
              : checklist
          ),
          updatedAt: new Date().toISOString()
        };
        renderModal();
      },
      deleteItem: (checklistId, itemId) => {
        draft = {
          ...draft,
          checklists: draft.checklists.map((checklist) =>
            checklist.id === checklistId
              ? { ...checklist, items: checklist.items.filter((item) => item.id !== itemId) }
              : checklist
          ),
          updatedAt: new Date().toISOString()
        };
        renderModal();
      },
      updateChecklist: (checklistId, patch) => {
        draft = {
          ...draft,
          checklists: draft.checklists.map((checklist) =>
            checklist.id === checklistId ? { ...checklist, ...patch } : checklist
          ),
          updatedAt: new Date().toISOString()
        };
      },
      updateItem: (checklistId, itemId, patch) => {
        draft = {
          ...draft,
          checklists: draft.checklists.map((checklist) =>
            checklist.id === checklistId
              ? {
                ...checklist,
                items: checklist.items.map((item) =>
                  item.id === itemId ? { ...item, ...patch } : item
                )
              }
              : checklist
          ),
          updatedAt: new Date().toISOString()
        };
      }
    });
  }

  function createFooter() {
    const footer = document.createElement("div");
    footer.className = "modal-footer";

    const deleteButton = document.createElement("button");
    deleteButton.className = "delete-task-button";
    deleteButton.type = "button";
    deleteButton.textContent = "Eliminar";
    deleteButton.addEventListener("click", async () => {
      if (isNew) {
        closeCRMProspectModal({ onClose });
        return;
      }

      if (!window.confirm(`¿Eliminar "${draft.companyName}"?`)) {
        return;
      }

      deleteButton.disabled = true;
      try {
        await onDelete(draft.id);
        closeCRMProspectModal({ onClose: null });
      } finally {
        deleteButton.disabled = false;
      }
    });

    const saveButton = document.createElement("button");
    saveButton.className = "save-task-button";
    saveButton.type = "button";
    saveButton.textContent = "Guardar";
    saveButton.addEventListener("click", async () => {
      const normalizedDraft = normalizeCRMProspect(draft);
      if (!normalizedDraft.companyName) {
        message = "Escribe la empresa o persona.";
        renderModal();
        return;
      }

      saveButton.disabled = true;
      try {
        await onSave(normalizedDraft, { isNew });
        closeCRMProspectModal({ onClose: null });
      } catch (error) {
        message = error.message || "No se pudo guardar el prospecto.";
        renderModal();
      } finally {
        saveButton.disabled = false;
      }
    });

    footer.append(deleteButton, saveButton);
    return footer;
  }

  renderModal();
  modal.append(shell);
  overlay.append(modal);
  root.append(overlay);

  crmModalKeydownHandler = (event) => {
    if (event.key === "Escape") {
      closeCRMProspectModal({ onClose });
    }
  };
  document.addEventListener("keydown", crmModalKeydownHandler);

  requestAnimationFrame(() => {
    overlay.querySelector("input")?.focus({ preventScroll: true });
  });
}

export function closeCRMProspectModal({ clearRoot = true, onClose } = {}) {
  if (crmModalKeydownHandler) {
    document.removeEventListener("keydown", crmModalKeydownHandler);
    crmModalKeydownHandler = null;
  }

  if (clearRoot) {
    const root = document.querySelector("#modal-root");
    if (root) {
      root.innerHTML = "";
    }
  }

  if (typeof onClose === "function") {
    onClose();
  }
}

function formatDateTime(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) {
    return "Sin fecha";
  }

  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}
