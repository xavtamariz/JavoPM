import { DEFAULT_CRM_STATUS, CRM_STATUSES, sortByOrder } from "./models.js?v=20260528-crm-section";

export function renderCRM({
  boardElement,
  onAddProspect,
  onOpenProspect,
  prospects = []
}) {
  boardElement.innerHTML = "";
  const section = document.createElement("section");
  section.className = "crm-view";

  const header = document.createElement("header");
  header.className = "crm-view-header";

  const copy = document.createElement("div");
  const title = document.createElement("h2");
  title.textContent = "CRM";
  const subtitle = document.createElement("p");
  subtitle.textContent = "Prospectos";
  copy.append(title, subtitle);

  const addButton = document.createElement("button");
  addButton.className = "add-task-button crm-add-prospect-button";
  addButton.type = "button";
  addButton.innerHTML = '<span class="plus-mark" aria-hidden="true"></span>Agregar prospecto';
  addButton.addEventListener("click", onAddProspect);

  header.append(copy);
  if (prospects.length > 0) {
    header.append(addButton);
  }
  section.append(header);

  if (prospects.length === 0) {
    const empty = document.createElement("div");
    empty.className = "crm-empty-state";
    const emptyAction = addButton.cloneNode(true);
    emptyAction.addEventListener("click", onAddProspect);
    empty.append(emptyAction);
    section.append(empty);
    boardElement.append(section);
    return;
  }

  const list = document.createElement("div");
  list.className = "crm-prospect-list";
  list.setAttribute("role", "list");

  sortByOrder(prospects).forEach((prospect) => {
    list.append(createProspectRow(prospect, onOpenProspect));
  });

  section.append(list);
  boardElement.append(section);
}

function createProspectRow(prospect, onOpenProspect) {
  const row = document.createElement("button");
  row.className = "crm-prospect-row";
  row.type = "button";
  row.setAttribute("role", "listitem");
  row.addEventListener("click", () => onOpenProspect(prospect.id));

  const company = document.createElement("div");
  company.className = "crm-prospect-company";
  company.textContent = prospect.companyName || "Nuevo prospecto";

  const contact = document.createElement("div");
  contact.className = "crm-prospect-contact";
  contact.textContent = prospect.contactName || "Sin contacto";

  const status = document.createElement("span");
  status.className = "crm-status-pill";
  status.dataset.status = CRM_STATUSES.includes(prospect.status) ? prospect.status : DEFAULT_CRM_STATUS;
  status.textContent = status.dataset.status;

  row.append(company, contact, status);
  return row;
}
