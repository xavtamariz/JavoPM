import { DEFAULT_CRM_STATUS, CRM_STATUSES, sortByOrder } from "./models.js?v=20260529-section-aware-filters";
import { createChatColumn } from "./ui.js?v=20260529-section-aware-filters";

export function renderCRM({
  boardElement,
  chat = {},
  onBackChatList,
  onCreateChatGroup,
  onAddProspect,
  onOpenChatConversation,
  onOpenProspect,
  onSendChatMessage,
  onShowChatGroupForm,
  onUpdateChatDraft,
  prospects = []
}) {
  boardElement.innerHTML = "";
  boardElement.style.gridTemplateColumns = "";

  if (chat.isOpen) {
    boardElement.append(
      createChatColumn({
        chat,
        onBackChatList,
        onCreateChatGroup,
        onOpenChatConversation,
        onSendChatMessage,
        onShowChatGroupForm,
        onUpdateChatDraft
      })
    );
  }

  const section = document.createElement("section");
  section.className = "crm-view";

  const header = document.createElement("header");
  header.className = "crm-view-header";

  const title = document.createElement("h2");
  title.textContent = "Prospectos - Clientes";

  const stats = getCRMStats(prospects);
  const indicators = document.createElement("div");
  indicators.className = "column-indicators crm-view-indicators";

  const activeCount = createCRMIndicator({
    ariaLabel: `${stats.activeCount} prospectos activos`,
    className: "column-count crm-prospect-active-count",
    text: String(stats.activeCount)
  });
  const closedCount = createCRMIndicator({
    ariaLabel: `${stats.closedCount} prospectos cerrados`,
    className: "column-percent crm-prospect-closed-count",
    text: String(stats.closedCount)
  });
  const conversionRate = createCRMIndicator({
    ariaLabel: `${stats.conversionRate}% de conversión contra prospectos activos`,
    className: "column-percent crm-prospect-conversion-rate",
    text: `${stats.conversionRate}%`
  });

  indicators.append(activeCount, closedCount, conversionRate);
  header.append(title, indicators);
  section.append(header);

  const content = document.createElement("div");
  content.className = "crm-view-content";

  if (prospects.length === 0) {
    const empty = document.createElement("div");
    empty.className = "crm-empty-state";
    empty.textContent = "Sin prospectos";
    content.append(empty);
  } else {
    const list = document.createElement("div");
    list.className = "crm-prospect-list";
    list.setAttribute("role", "list");

    sortByOrder(prospects).forEach((prospect) => {
      list.append(createProspectRow(prospect, onOpenProspect));
    });

    content.append(list);
  }

  const addButton = document.createElement("button");
  addButton.className = "add-task-button crm-add-prospect-button";
  addButton.type = "button";
  addButton.innerHTML = '<span class="plus-mark" aria-hidden="true"></span>Agregar prospecto';
  addButton.addEventListener("click", onAddProspect);

  content.append(addButton);
  section.append(content);
  boardElement.append(section);
}

function getCRMStats(prospects) {
  const activeCount = prospects.filter((prospect) => {
    return prospect.status !== "Cerrado" && prospect.status !== "Descartado";
  }).length;
  const closedCount = prospects.filter((prospect) => prospect.status === "Cerrado").length;
  const conversionRate = activeCount > 0 ? Math.round((closedCount / activeCount) * 100) : 0;

  return { activeCount, closedCount, conversionRate };
}

function createCRMIndicator({ ariaLabel, className, text }) {
  const indicator = document.createElement("span");
  indicator.className = className;
  indicator.textContent = text;
  indicator.setAttribute("aria-label", ariaLabel);
  return indicator;
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

  const mobilePhone = document.createElement("div");
  mobilePhone.className = "crm-prospect-phone";
  mobilePhone.textContent = prospect.mobilePhone || "Sin celular";

  const email = document.createElement("div");
  email.className = "crm-prospect-email";
  email.textContent = prospect.email || "Sin correo";

  const status = document.createElement("span");
  status.className = "crm-status-pill";
  status.dataset.status = CRM_STATUSES.includes(prospect.status) ? prospect.status : DEFAULT_CRM_STATUS;
  status.textContent = status.dataset.status;

  row.append(company, contact, mobilePhone, email, status);
  return row;
}
