import { createChecklistItem, createDefaultChecklist } from "./models.js?v=20260525-auth-redirect";

export function renderChecklists(task, callbacks) {
  const section = document.createElement("section");
  section.className = "checklists-section";

  const title = document.createElement("h2");
  title.className = "section-title";
  title.textContent = "Checklists";
  section.append(title);

  task.checklists.forEach((checklist) => {
    section.append(createChecklistElement(task, checklist, callbacks));
  });

  return section;
}

function createChecklistElement(task, checklist, callbacks) {
  const wrapper = document.createElement("article");
  wrapper.className = "checklist";

  const header = document.createElement("div");
  header.className = "checklist-header";

  const titleInput = document.createElement("input");
  titleInput.className = "checklist-title-input";
  titleInput.value = checklist.title;
  titleInput.setAttribute("aria-label", "Título de checklist");
  titleInput.addEventListener("input", () => {
    callbacks.updateChecklist(checklist.id, { title: titleInput.value });
  });

  const addChecklistButton = document.createElement("button");
  addChecklistButton.className = "small-button";
  addChecklistButton.type = "button";
  addChecklistButton.innerHTML = '<span class="plus-mark" aria-hidden="true"></span>Agregar checklist';
  addChecklistButton.addEventListener("click", () => {
    const nextOrder = task.checklists.length;
    callbacks.addChecklist(createDefaultChecklist(nextOrder));
  });

  header.append(titleInput, addChecklistButton);

  const addItemButton = document.createElement("button");
  addItemButton.className = "small-button";
  addItemButton.type = "button";
  addItemButton.innerHTML = '<span class="plus-mark" aria-hidden="true"></span>Agregar elemento al checklist';
  addItemButton.addEventListener("click", () => {
    callbacks.addItem(checklist.id, createChecklistItem(checklist.items.length));
  });

  const items = document.createElement("div");
  items.className = "checklist-items";

  checklist.items.forEach((item) => {
    items.append(createChecklistItemElement(checklist.id, item, callbacks));
  });

  wrapper.append(header, addItemButton, items);
  return wrapper;
}

function createChecklistItemElement(checklistId, item, callbacks) {
  const row = document.createElement("div");
  row.className = `checklist-item${item.completed ? " is-completed" : ""}`;

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = item.completed;
  checkbox.setAttribute("aria-label", "Marcar elemento como completado");
  checkbox.addEventListener("change", () => {
    callbacks.updateItem(checklistId, item.id, { completed: checkbox.checked });
  });

  const input = document.createElement("input");
  input.className = "checklist-item-text";
  input.value = item.text;
  input.setAttribute("aria-label", "Texto del elemento");
  input.addEventListener("input", () => {
    callbacks.updateItem(checklistId, item.id, { text: input.value });
  });

  const deleteButton = document.createElement("button");
  deleteButton.className = "danger-button";
  deleteButton.type = "button";
  deleteButton.textContent = "×";
  deleteButton.setAttribute("aria-label", "Eliminar elemento");
  deleteButton.addEventListener("click", () => {
    callbacks.deleteItem(checklistId, item.id);
  });

  row.append(checkbox, input, deleteButton);
  return row;
}
