import {
  ALLOWED_TYPES,
  DEFAULT_RESPONSIBLE_NAME,
  createDefaultChecklist,
  normalizeProjectName,
  normalizeTeamMemberName,
  normalizeTask,
  updateFolioProjectName
} from "./models.js?v=20260525-idempotent-recovery";
import { renderChecklists } from "./checklist.js?v=20260525-idempotent-recovery";

export function openTaskModal({ task, projects = [], teamMembers = [], onSave, onDelete, onClose }) {
  const root = document.querySelector("#modal-root");
  root.innerHTML = "";

  let workingTask = normalizeTask(task);
  let saveTimer;
  let cleanupCallbacks = [];

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) {
      close();
    }
  });

  const modal = document.createElement("section");
  modal.className = "modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-labelledby", "task-modal-title");

  const form = document.createElement("form");
  form.className = "modal-form";
  form.addEventListener("submit", (event) => event.preventDefault());

  function render() {
    cleanupTransientListeners();
    form.innerHTML = "";
    form.append(createTopBar(), createHeader(), createBody(), createFooter());
    requestAnimationFrame(() => {
      const firstInput = form.querySelector("[data-autofocus]");
      firstInput?.focus({ preventScroll: true });
    });
  }

  function createTopBar() {
    const topbar = document.createElement("div");
    topbar.className = "modal-topbar";

    const title = document.createElement("h2");
    title.id = "task-modal-title";
    title.className = "modal-title";
    title.dataset.modalTitle = "true";
    title.textContent = getModalTitle();

    const closeButton = document.createElement("button");
    closeButton.className = "close-button";
    closeButton.type = "button";
    closeButton.textContent = "×";
    closeButton.setAttribute("aria-label", "Cerrar modal");
    closeButton.addEventListener("click", close);

    topbar.append(title, closeButton);
    return topbar;
  }

  function createHeader() {
    const header = document.createElement("header");
    header.className = "modal-header";

    const left = document.createElement("div");
    left.className = "modal-left-row";
    left.append(
      createProjectField(),
      createTypeField(),
      createField("Folio", "folio", "text", workingTask.folio, { readonly: "true" })
    );

    const right = document.createElement("div");
    right.className = "modal-right-row";
    right.append(
      createField("Fecha inicio", "startDate", "date", workingTask.startDate),
      createField("Fecha fin", "endDate", "date", workingTask.endDate),
      createField("Puntos", "points", "number", workingTask.points, { min: "0", step: "1" }),
      createResponsibleField()
    );

    header.append(left, right);
    return header;
  }

  function createFooter() {
    const footer = document.createElement("footer");
    footer.className = "modal-footer";

    const saveButton = document.createElement("button");
    saveButton.className = "save-task-button";
    saveButton.type = "button";
    saveButton.textContent = "Guardar";
    saveButton.setAttribute("aria-label", "Guardar y cerrar tarea");
    saveButton.addEventListener("click", handleSaveAndClose);

    const deleteButton = document.createElement("button");
    deleteButton.className = "delete-task-button";
    deleteButton.type = "button";
    deleteButton.textContent = "Eliminar";
    deleteButton.setAttribute("aria-label", "Eliminar tarea");
    deleteButton.addEventListener("click", handleDelete);

    footer.append(saveButton, deleteButton);
    return footer;
  }

  function createBody() {
    const body = document.createElement("div");
    body.className = "modal-body";

    const validation = document.createElement("div");
    validation.className = "validation-message";
    validation.dataset.validationMessage = "true";

    const descriptions = document.createElement("section");
    descriptions.className = "description-grid";
    descriptions.append(createShortDescriptionField(), createLongDescriptionField());

    const checklistCallbacks = {
      addChecklist(checklist) {
        workingTask = {
          ...workingTask,
          checklists: [...workingTask.checklists, checklist]
        };
        saveNowAndRender();
      },
      updateChecklist(checklistId, changes) {
        updateWorkingTask({
          checklists: workingTask.checklists.map((checklist) =>
            checklist.id === checklistId ? { ...checklist, ...changes } : checklist
          )
        });
      },
      addItem(checklistId, item) {
        workingTask = {
          ...workingTask,
          checklists: workingTask.checklists.map((checklist) =>
            checklist.id === checklistId
              ? { ...checklist, items: [...checklist.items, item] }
              : checklist
          )
        };
        saveNowAndRender();
      },
      updateItem(checklistId, itemId, changes) {
        updateWorkingTask({
          checklists: workingTask.checklists.map((checklist) =>
            checklist.id === checklistId
              ? {
                  ...checklist,
                  items: checklist.items.map((item) =>
                    item.id === itemId ? { ...item, ...changes } : item
                  )
                }
              : checklist
          )
        });
      },
      deleteItem(checklistId, itemId) {
        workingTask = {
          ...workingTask,
          checklists: workingTask.checklists.map((checklist) =>
            checklist.id === checklistId
              ? {
                  ...checklist,
                  items: checklist.items.filter((item) => item.id !== itemId)
                }
              : checklist
          )
        };
        saveNowAndRender();
      }
    };

    if (workingTask.checklists.length === 0) {
      workingTask = {
        ...workingTask,
        checklists: [createDefaultChecklist()]
      };
    }

    body.append(validation, descriptions, renderChecklists(workingTask, checklistCallbacks));
    return body;
  }

  function createTypeField() {
    const wrapper = document.createElement("div");
    wrapper.className = "field";

    const label = document.createElement("label");
    label.htmlFor = "task-type";
    label.textContent = "Tipo";

    const select = document.createElement("select");
    select.id = "task-type";
    select.value = workingTask.type;

    ALLOWED_TYPES.forEach((type) => {
      const option = document.createElement("option");
      option.value = type;
      option.textContent = type;
      select.append(option);
    });

    select.addEventListener("change", () => updateWorkingTask({ type: select.value }));
    wrapper.append(label, select);
    return wrapper;
  }

  function createProjectField() {
    const wrapper = document.createElement("div");
    wrapper.className = "field";

    const label = document.createElement("label");
    label.htmlFor = "task-project";
    label.textContent = "Proyecto";

    const select = document.createElement("select");
    select.id = "task-project";

    const projectNames = getProjectNames();

    projectNames.forEach((projectName) => {
      const option = document.createElement("option");
      option.value = projectName;
      option.textContent = projectName;
      select.append(option);
    });

    select.value = workingTask.project;
    select.addEventListener("change", () => {
      const project = select.value;
      const folio = updateFolioProjectName(workingTask.folio, project);
      updateWorkingTask({
        project,
        folio
      });
      const folioInput = form.querySelector("#task-folio");
      if (folioInput) {
        folioInput.value = folio;
      }
    });

    wrapper.append(label, select);
    return wrapper;
  }

  function createResponsibleField() {
    const wrapper = document.createElement("div");
    wrapper.className = "field modal-responsible";

    const label = document.createElement("label");
    label.htmlFor = "task-responsible";
    label.textContent = "Responsable";

    const select = document.createElement("select");
    select.id = "task-responsible";

    getTeamMemberNames().forEach((teamMemberName) => {
      const option = document.createElement("option");
      option.value = teamMemberName;
      option.textContent = teamMemberName;
      select.append(option);
    });

    select.value = workingTask.responsible;
    select.addEventListener("change", () => {
      updateWorkingTask({ responsible: select.value });
    });

    wrapper.append(label, select);
    return wrapper;
  }

  function createField(labelText, key, type, value, options = {}) {
    const wrapper = document.createElement("div");
    wrapper.className = `field${options.wrapperClass ? ` ${options.wrapperClass}` : ""}`;

    const inputId = `task-${key}`;
    const label = document.createElement("label");
    label.htmlFor = inputId;
    label.textContent = labelText;

    const input = document.createElement("input");
    input.id = inputId;
    input.type = type;
    input.value = value ?? "";
    if (options.autofocus) {
      input.dataset.autofocus = "true";
    }

    Object.entries(options).forEach(([attribute, attributeValue]) => {
      if (["wrapperClass", "autofocus"].includes(attribute)) {
        return;
      }
      input.setAttribute(attribute, attributeValue);
    });

    input.addEventListener("input", () => {
      updateWorkingTask({ [key]: type === "number" ? Number(input.value) : input.value });
    });

    wrapper.append(label, input);
    return wrapper;
  }

  function createShortDescriptionField() {
    const wrapper = document.createElement("div");
    wrapper.className = "field";

    const label = document.createElement("label");
    label.htmlFor = "task-shortDescription";
    label.textContent = "Descripción corta";

    const textarea = document.createElement("textarea");
    textarea.id = "task-shortDescription";
    textarea.className = "short-description-textarea";
    textarea.rows = 1;
    textarea.value = workingTask.shortDescription;
    textarea.dataset.autofocus = "true";

    const resize = () => resizeAutoTextarea(textarea);
    textarea.addEventListener("input", () => {
      updateWorkingTask({ shortDescription: textarea.value });
      resize();
    });

    if ("ResizeObserver" in window) {
      const observer = new ResizeObserver(resize);
      observer.observe(wrapper);
      cleanupCallbacks.push(() => observer.disconnect());
    } else {
      window.addEventListener("resize", resize);
      cleanupCallbacks.push(() => window.removeEventListener("resize", resize));
    }

    requestAnimationFrame(resize);
    wrapper.append(label, textarea);
    return wrapper;
  }

  function createLongDescriptionField() {
    const wrapper = document.createElement("div");
    wrapper.className = "field";

    const label = document.createElement("label");
    label.htmlFor = "task-longDescription";
    label.textContent = "Descripción larga";

    const shell = document.createElement("div");
    shell.className = "long-description-shell";

    const toolbar = document.createElement("div");
    toolbar.className = "editor-toolbar";

    const textarea = document.createElement("textarea");
    textarea.id = "task-longDescription";
    textarea.value = workingTask.longDescription;
    textarea.placeholder = "Escribe notas, contexto, criterios de aceptación o enlaces relevantes.";
    textarea.addEventListener("input", () => {
      updateWorkingTask({ longDescription: textarea.value });
    });

    [
      { label: "B", before: "**", after: "**", title: "Negrita" },
      { label: "I", before: "_", after: "_", title: "Cursiva" },
      { label: "Lista", before: "- ", after: "", title: "Lista" }
    ].forEach((action) => {
      const button = document.createElement("button");
      button.className = "toolbar-button";
      button.type = "button";
      button.textContent = action.label;
      button.title = action.title;
      button.addEventListener("click", () => {
        insertTextStyle(textarea, action.before, action.after);
        updateWorkingTask({ longDescription: textarea.value });
      });
      toolbar.append(button);
    });

    shell.append(toolbar, textarea);
    wrapper.append(label, shell);
    return wrapper;
  }

  function insertTextStyle(textarea, before, after) {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = textarea.value.slice(start, end);
    const replacement = before + selected + after;
    textarea.setRangeText(replacement, start, end, "end");
    textarea.focus();
  }

  function resizeAutoTextarea(textarea) {
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }

  function updateWorkingTask(changes) {
    workingTask = {
      ...workingTask,
      ...changes,
      updatedAt: new Date().toISOString()
    };

    if (Object.hasOwn(changes, "shortDescription")) {
      syncTopbarTitle();
    }

    if (!validate()) {
      return;
    }

    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => onSave(workingTask), 180);
  }

  function getModalTitle() {
    return workingTask.shortDescription.trim() || "Sin descripción";
  }

  function getProjectNames() {
    const names = projects.map((project) => normalizeProjectName(project.name)).filter(Boolean);
    const currentProject = normalizeProjectName(workingTask.project);

    if (currentProject && !names.includes(currentProject)) {
      names.unshift(currentProject);
    }

    return names.length > 0 ? names : [currentProject || "Proyecto"];
  }

  function getTeamMemberNames() {
    const names = teamMembers
      .map((teamMember) => normalizeTeamMemberName(teamMember.name))
      .filter(Boolean);
    const currentResponsible = normalizeTeamMemberName(workingTask.responsible);
    const options = [DEFAULT_RESPONSIBLE_NAME];

    names.forEach((name) => {
      if (!options.includes(name)) {
        options.push(name);
      }
    });

    if (currentResponsible && !options.includes(currentResponsible)) {
      options.push(currentResponsible);
    }

    return options;
  }

  function syncTopbarTitle() {
    const title = form.querySelector("[data-modal-title]");
    if (title) {
      title.textContent = getModalTitle();
    }
  }

  function saveNowAndRender() {
    clearTimeout(saveTimer);
    workingTask = normalizeTask(workingTask);
    if (validate()) {
      onSave(workingTask);
    }
    render();
  }

  function validate() {
    const message = form.querySelector("[data-validation-message]");
    if (!message) {
      return true;
    }

    if (!workingTask.shortDescription.trim()) {
      message.textContent = "La descripción corta no puede estar vacía.";
      message.classList.add("is-visible");
      return false;
    }

    if (!ALLOWED_TYPES.includes(workingTask.type)) {
      message.textContent = "El tipo debe ser Bug, Tarea o Evento.";
      message.classList.add("is-visible");
      return false;
    }

    if (!Number.isFinite(Number(workingTask.points))) {
      message.textContent = "Los puntos deben ser un número.";
      message.classList.add("is-visible");
      return false;
    }

    message.classList.remove("is-visible");
    message.textContent = "";
    return true;
  }

  function close() {
    clearTimeout(saveTimer);
    if (validate()) {
      onSave(workingTask);
    }
    destroyModal();
  }

  async function handleSaveAndClose() {
    clearTimeout(saveTimer);
    if (!validate()) {
      return;
    }

    await onSave(workingTask);
    destroyModal();
  }

  async function handleDelete() {
    const confirmed = window.confirm("¿Eliminar esta tarea? Esta acción no se puede deshacer.");
    if (!confirmed) {
      return;
    }

    clearTimeout(saveTimer);
    await onDelete?.(workingTask.id);
    destroyModal();
  }

  function destroyModal() {
    cleanupTransientListeners();
    root.innerHTML = "";
    document.removeEventListener("keydown", handleKeyDown);
    onClose?.();
  }

  function cleanupTransientListeners() {
    cleanupCallbacks.forEach((callback) => callback());
    cleanupCallbacks = [];
  }

  function handleKeyDown(event) {
    if (event.key === "Escape") {
      close();
    }
  }

  document.addEventListener("keydown", handleKeyDown);
  render();
  modal.append(form);
  overlay.append(modal);
  root.append(overlay);
}
