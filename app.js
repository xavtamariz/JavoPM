import {
  createProject,
  createTask,
  createTeamMember,
  createTaskEvent,
  clearPendingMutations,
  deleteTask,
  deleteTeamMember,
  exportBoardSnapshot,
  getChartCards,
  getColumns,
  getMetaValue,
  getProjects,
  getTeamMembers,
  getTaskEvents,
  getTasks,
  importBoardSnapshot,
  initDB,
  resetSeedDataIfNeeded,
  resetLocalBoardAfterLogout,
  saveAnonymousBackup,
  saveChartCards,
  setMetaValue,
  saveProjects,
  saveTeamMembers,
  saveTaskOrder,
  updateChartCard,
  updateTask
} from "./db.js?v=20260527-owner-profile";
import {
  CHART_CARD_TYPE,
  DEFAULT_PROJECT_NAME,
  DEFAULT_RESPONSIBLE_NAME,
  TASK_CARD_TYPE,
  createProjectModel,
  createTeamMemberModel,
  createTaskModel,
  formatFolio,
  generateFolio,
  getFolioNumber,
  getNextGlobalFolioNumber,
  isValidMemberNickname,
  normalizeNickname,
  normalizeProjectName,
  normalizeTeamMemberName,
  sortByOrder,
  updateFolioProjectName
} from "./models.js?v=20260527-owner-profile";
import { initAccountModal } from "./accountModal.js?v=20260527-owner-profile";
import {
  canUseAccounts,
  createOwnerAccount,
  loginMemberAccount,
  loginOwnerAccount,
  restoreOwnerSession,
  signOutOwnerAccount
} from "./auth.js?v=20260527-owner-profile";
import {
  completeMemberPassword,
  createCloudTeamMember,
  resetCloudTeamMemberKey,
  updateCloudOwnerProfile,
  updateCloudTeamMember
} from "./memberApi.js?v=20260527-owner-profile";
import { openTaskModal } from "./modal.js?v=20260527-owner-profile";
import {
  allocateNextCloudFolioNumber,
  getCloudSyncContext,
  initSyncEngine,
  recordCloudMutation,
  startCloudSyncSession,
  stopCloudSyncSession
} from "./syncEngine.js?v=20260527-owner-profile";
import { renderBoard } from "./ui.js?v=20260527-owner-profile";

const state = {
  chartCards: [],
  columns: [],
  account: null,
  projects: [],
  teamMembers: [],
  taskEvents: [],
  tasks: []
};

const boardElement = document.querySelector("#board");
const accountMenuToggle = document.querySelector("[data-account-menu-toggle]");
const projectMenuToggle = document.querySelector("[data-project-menu-toggle]");
const teamMenuToggle = document.querySelector("[data-team-menu-toggle]");
const themeToggle = document.querySelector("[data-theme-toggle]");
const themeLabel = document.querySelector("[data-theme-label]");
const sideMenuToggle = document.querySelector("[data-side-menu-toggle]");
const sideMenuOverlay = document.querySelector("[data-side-menu-overlay]");
const sideMenuClose = document.querySelector("[data-side-menu-close]");
const sideAccount = document.querySelector("[data-side-account]");
const sideAccountEmail = document.querySelector("[data-side-account-email]");
const sideAccountLogout = document.querySelector("[data-side-account-logout]");
const sideAccountMessage = document.querySelector("[data-side-account-message]");
const syncStatus = document.querySelector("[data-sync-status]");
const syncLabel = document.querySelector("[data-sync-label]");
const THEME_STORAGE_KEY = "javopm-theme";
let clientId;
let projectModalKeydownHandler;
let sideMenuKeydownHandler;
let teamModalKeydownHandler;
let expandedTeamMemberId = "";
let isOwnerProfileExpanded = false;

async function startApp() {
  try {
    initThemeToggle();
    initSideMenu();
    await initDB();
    await resetSeedDataIfNeeded();
    await loadState();
    clientId = await getOrCreateClientId();
    initSyncEngine({
      onRemoteSnapshot: handleRemoteSnapshot,
      onStatusChange: setSyncStatus
    });
    initAccountMenu();
    initProjectMenu();
    initTeamMenu();
    await tryRestoreOwnerSession();
    render();
  } catch (error) {
    renderBootError(error);
  }
}

function initSideMenu() {
  if (!sideMenuToggle || !sideMenuOverlay || !sideMenuClose) {
    return;
  }

  sideMenuToggle.addEventListener("click", openSideMenu);
  sideMenuClose.addEventListener("click", closeSideMenu);
  sideMenuOverlay.addEventListener("click", (event) => {
    if (event.target === sideMenuOverlay) {
      closeSideMenu();
    }
  });
  sideAccountLogout?.addEventListener("click", handleSideMenuLogout);
}

function openSideMenu() {
  if (!sideMenuOverlay || !sideMenuToggle) {
    return;
  }

  closeProjectModal({ clearRoot: false });
  closeTeamModal({ clearRoot: false });
  sideMenuOverlay.hidden = false;
  sideMenuToggle.setAttribute("aria-expanded", "true");
  sideMenuKeydownHandler = (event) => {
    if (event.key === "Escape") {
      closeSideMenu();
    }
  };
  document.addEventListener("keydown", sideMenuKeydownHandler);

  requestAnimationFrame(() => {
    sideMenuOverlay.classList.add("is-open");
    sideMenuClose?.focus({ preventScroll: true });
  });
}

function closeSideMenu() {
  if (!sideMenuOverlay || !sideMenuToggle) {
    return;
  }

  sideMenuOverlay.classList.remove("is-open");
  sideMenuToggle.setAttribute("aria-expanded", "false");

  if (sideMenuKeydownHandler) {
    document.removeEventListener("keydown", sideMenuKeydownHandler);
    sideMenuKeydownHandler = undefined;
  }

  window.setTimeout(() => {
    if (!sideMenuOverlay.classList.contains("is-open")) {
      sideMenuOverlay.hidden = true;
    }
  }, 180);
}

function initThemeToggle() {
  const currentTheme = getCurrentTheme();
  applyTheme(currentTheme, { persist: false });
  themeToggle?.addEventListener("click", () => {
    applyTheme(getCurrentTheme() === "dark" ? "light" : "dark");
  });
}

function getCurrentTheme() {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function applyTheme(theme, options = {}) {
  const nextTheme = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = nextTheme;

  if (themeLabel) {
    themeLabel.textContent = nextTheme === "dark" ? "Oscuro" : "Claro";
  }

  if (themeToggle) {
    themeToggle.setAttribute("aria-pressed", String(nextTheme === "dark"));
    themeToggle.setAttribute(
      "aria-label",
      `Cambiar a tema ${nextTheme === "dark" ? "claro" : "oscuro"}`
    );
  }

  if (options.persist === false) {
    return;
  }

  try {
    localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
  } catch (error) {
    // The theme still changes for the current session if storage is unavailable.
  }
}

async function loadState() {
  const [columns, tasks, projects, teamMembers, chartCards, taskEvents] = await Promise.all([
    getColumns(),
    getTasks(),
    getProjects(),
    getTeamMembers(),
    getChartCards(),
    getTaskEvents()
  ]);
  const syncedProjects = await syncProjectsWithTasks(projects, tasks);
  const syncedTeamMembers = await syncTeamMembersWithTasks(teamMembers, tasks);
  const syncedTasks = await syncTaskFoliosWithProjects(tasks);

  state.columns = columns;
  state.projects = syncedProjects;
  state.teamMembers = syncedTeamMembers;
  state.chartCards = sortByOrder(chartCards);
  state.taskEvents = taskEvents;
  state.tasks = syncedTasks;
}

async function reloadBoardState() {
  const [columns, tasks, projects, teamMembers, chartCards, taskEvents] = await Promise.all([
    getColumns(),
    getTasks(),
    getProjects(),
    getTeamMembers(),
    getChartCards(),
    getTaskEvents()
  ]);
  const syncedProjects = await syncProjectsWithTasks(projects, tasks);
  const syncedTeamMembers = await syncTeamMembersWithTasks(teamMembers, tasks);
  const syncedTasks = await syncTaskFoliosWithProjects(tasks);

  state.columns = columns;
  state.projects = syncedProjects;
  state.teamMembers = syncedTeamMembers;
  state.chartCards = sortByOrder(chartCards);
  state.taskEvents = taskEvents;
  state.tasks = syncedTasks;
}

function render() {
  renderBoard({
    boardElement,
    chartCards: state.chartCards,
    columns: state.columns,
    taskEvents: state.taskEvents,
    teamMembers: getAssignableTeamMembers(),
    tasks: state.tasks,
    onAddTask: handleAddTask,
    onOpenTask: handleOpenTask,
    onMoveCard: handleMoveCard,
    onUpdateChartCard: handleUpdateChartCard
  });
}

function initProjectMenu() {
  if (!projectMenuToggle) {
    return;
  }

  projectMenuToggle.addEventListener("click", openProjectModal);
}

function initTeamMenu() {
  if (!teamMenuToggle) {
    return;
  }

  teamMenuToggle.addEventListener("click", openTeamModal);
}

function initAccountMenu() {
  initAccountModal({
    beforeOpen: () => {
      closeProjectModal({ clearRoot: false });
      closeTeamModal({ clearRoot: false });
      closeSideMenu();
    },
    button: accountMenuToggle,
    isConfigured: canUseAccounts,
    getAccountState: () => state.account,
    onCompleteMemberPassword: handleCompleteMemberPassword,
    onCreateAccount: handleCreateOwnerAccount,
    onLogin: handleLoginOwnerAccount,
    onLoginMember: handleLoginMemberAccount,
    onLogout: handleLogoutOwnerAccount
  });
}

async function getOrCreateClientId() {
  const existingClientId = await getMetaValue("clientId");

  if (existingClientId) {
    return existingClientId;
  }

  const nextClientId = crypto.randomUUID
    ? `client_${crypto.randomUUID()}`
    : `client_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  await setMetaValue("clientId", nextClientId);
  return nextClientId;
}

async function tryRestoreOwnerSession() {
  if (!canUseAccounts()) {
    setSyncStatus("local");
    return;
  }

  try {
    const pendingImport = await getMetaValue("pendingOwnerImport");
    const result = await restoreOwnerSession({
      clientId,
      pendingImport
    });
    if (!result?.cloud?.snapshot) {
      setSyncStatus("local");
      return;
    }

    await importBoardSnapshot(result.cloud.snapshot);
    await clearPendingMutations();
    await reloadBoardState();
    await startAuthenticatedSync(result);
    if (result.completedPendingImport) {
      await setMetaValue("pendingOwnerImport", null);
    }
  } catch (error) {
    setSyncStatus("error", error.message);
  }
}

async function handleCreateOwnerAccount({ confirmPassword, email, password }) {
  const snapshot = await exportBoardSnapshot();
  const result = await createOwnerAccount({
    clientId,
    confirmPassword,
    email,
    password,
    snapshot
  });

  if (result.status === "authenticated") {
    await startAuthenticatedSync(result);
    setSyncStatus("synced");
  }

  if (result.status === "verification_required") {
    await setMetaValue("pendingOwnerImport", {
      clientId,
      createdAt: new Date().toISOString(),
      email,
      snapshot
    });
  }

  return result;
}

async function handleLoginOwnerAccount({ email, password }) {
  const backup = await exportBoardSnapshot();
  await saveAnonymousBackup(backup);

  const pendingImport = await getMetaValue("pendingOwnerImport");
  const matchingPendingImport = pendingImport?.email === email ? pendingImport : null;
  const result = await loginOwnerAccount({
    clientId,
    email,
    password,
    pendingImport: matchingPendingImport
  });

  if (result.status === "authenticated") {
    await importBoardSnapshot(result.cloud.snapshot);
    await clearPendingMutations();
    await reloadBoardState();
    await startAuthenticatedSync(result);
    if (result.completedPendingImport) {
      await setMetaValue("pendingOwnerImport", null);
    }
    render();
  }

  return result;
}

async function handleLoginMemberAccount({ nickname, password }) {
  const backup = await exportBoardSnapshot();
  await saveAnonymousBackup(backup);

  const result = await loginMemberAccount({
    clientId,
    nickname,
    password
  });

  if (result.status === "authenticated") {
    await importBoardSnapshot(result.cloud.snapshot);
    await clearPendingMutations();
    await reloadBoardState();
    await startAuthenticatedSync(result);
    render();
  }

  return result;
}

async function handleCompleteMemberPassword({ confirmPassword, password }) {
  if (password !== confirmPassword) {
    throw new Error("Las contraseñas no coinciden.");
  }

  await completeMemberPassword({ confirmPassword, password });
  if (state.account) {
    state.account.passwordSetupRequired = false;
  }
  updateAccountButton();
}

async function startAuthenticatedSync(result) {
  const accountType = result.accountType || "owner";
  state.account = {
    accountType,
    displayName: result.displayName || result.email || result.nickname || "Cuenta",
    email: accountType === "member" ? "" : result.email || result.user?.email || "",
    nickname: result.nickname || "",
    passwordSetupRequired: Boolean(result.passwordSetupRequired),
    role: result.role || (accountType === "member" ? "member" : "owner"),
    teamMemberId: result.teamMemberId || "",
    userId: result.user?.id || ""
  };
  await cleanupOwnerLocalResponsible();
  updateAccountButton();
  await startCloudSyncSession({
    boardId: result.cloud.boardId,
    clientId,
    userId: result.user.id,
    workspaceId: result.cloud.workspaceId
  });
}

async function handleLogoutOwnerAccount() {
  await signOutOwnerAccount();
  await stopCloudSyncSession();
  await resetLocalBoardAfterLogout();
  await reloadBoardState();
  state.account = null;
  updateAccountButton();
  setSyncStatus("local");
  render();
}

async function handleSideMenuLogout() {
  if (!sideAccountLogout) {
    return;
  }

  if (sideAccountMessage) {
    sideAccountMessage.textContent = "";
  }
  sideAccountLogout.disabled = true;

  try {
    await handleLogoutOwnerAccount();
    closeSideMenu();
  } catch (error) {
    if (sideAccountMessage) {
      sideAccountMessage.textContent = error.message || "No se pudo cerrar sesión.";
    }
  } finally {
    sideAccountLogout.disabled = false;
  }
}

function updateAccountButton() {
  const label = accountMenuToggle?.querySelector(".account-menu-label");
  const isAuthenticated = Boolean(state.account?.userId);
  const accountLabel = state.account?.email || state.account?.nickname || state.account?.displayName || "";

  if (accountMenuToggle && label) {
    label.textContent = "Cuenta";
    accountMenuToggle.hidden = isAuthenticated;
    accountMenuToggle.dataset.authenticated = String(isAuthenticated);
    accountMenuToggle.setAttribute(
      "aria-label",
      isAuthenticated ? `Cuenta activa: ${accountLabel}` : "Cuenta"
    );
    accountMenuToggle.setAttribute("aria-expanded", "false");
  }

  if (!sideAccount || !sideAccountEmail) {
    return;
  }

  sideAccount.hidden = !isAuthenticated;
  sideAccountEmail.textContent = isAuthenticated
    ? `${state.account.displayName || accountLabel} · ${getAccountTypeLabel()}`
    : "";
  if (sideAccountMessage) {
    sideAccountMessage.textContent = "";
  }
}

function getAccountTypeLabel() {
  if (state.account?.accountType === "member") {
    return state.account.nickname ? `Miembro @${state.account.nickname}` : "Miembro";
  }

  return "Cuenta maestra";
}

async function handleRemoteSnapshot(snapshot) {
  await importBoardSnapshot(snapshot);
  await reloadBoardState();
  render();
}

function setSyncStatus(status) {
  if (!syncStatus || !syncLabel) {
    return;
  }

  const labels = {
    error: "Error de sincronización",
    local: "Guardado local",
    offline: "Sin conexión",
    synced: "Sincronizado",
    syncing: "Sincronizando"
  };
  syncLabel.textContent = labels[status] || labels.local;
  syncStatus.dataset.syncState = status || "local";
}

function openProjectModal() {
  const root = document.querySelector("#modal-root");
  if (!root) {
    return;
  }

  closeProjectModal({ clearRoot: false });
  closeTeamModal({ clearRoot: false });
  root.innerHTML = "";

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) {
      closeProjectModal();
    }
  });

  const modal = document.createElement("section");
  modal.className = "modal project-modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-labelledby", "project-modal-title");

  const shell = document.createElement("div");
  shell.className = "modal-form";
  shell.append(createProjectModalTopbar(), createProjectModalBody());

  modal.append(shell);
  overlay.append(modal);
  root.append(overlay);

  projectMenuToggle.setAttribute("aria-expanded", "true");
  projectModalKeydownHandler = (event) => {
    if (event.key === "Escape") {
      closeProjectModal();
    }
  };
  document.addEventListener("keydown", projectModalKeydownHandler);

  requestAnimationFrame(() => {
    overlay.querySelector("[data-project-create-input]")?.focus({ preventScroll: true });
  });
}

function closeProjectModal(options = {}) {
  const { clearRoot = true } = options;

  if (projectModalKeydownHandler) {
    document.removeEventListener("keydown", projectModalKeydownHandler);
    projectModalKeydownHandler = null;
  }

  projectMenuToggle?.setAttribute("aria-expanded", "false");

  if (clearRoot) {
    const root = document.querySelector("#modal-root");
    if (root) {
      root.innerHTML = "";
    }
  }
}

function createProjectModalTopbar() {
  const topbar = document.createElement("div");
  topbar.className = "modal-topbar";

  const title = document.createElement("h2");
  title.id = "project-modal-title";
  title.className = "modal-title";
  title.textContent = "Proyectos";

  const closeButton = document.createElement("button");
  closeButton.className = "close-button";
  closeButton.type = "button";
  closeButton.textContent = "×";
  closeButton.setAttribute("aria-label", "Cerrar modal de proyectos");
  closeButton.addEventListener("click", closeProjectModal);

  topbar.append(title, closeButton);
  return topbar;
}

function createProjectModalBody(message = "") {
  const body = document.createElement("div");
  body.className = "project-modal-body";
  body.dataset.projectModalBody = "true";

  const listTitle = document.createElement("p");
  listTitle.className = "project-list-title";
  listTitle.textContent = "Proyectos existentes";

  const list = document.createElement("ul");
  list.className = "project-list";

  state.projects.forEach((project) => {
    const item = document.createElement("li");
    item.className = "project-list-item";
    item.textContent = project.name;
    list.append(item);
  });

  const form = document.createElement("form");
  form.className = "project-create-form";
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = form.querySelector("[data-project-create-input]");
    await handleCreateProject(input.value);
  });

  const input = document.createElement("input");
  input.className = "project-create-input";
  input.dataset.projectCreateInput = "true";
  input.placeholder = "Nuevo proyecto";
  input.type = "text";

  const createButton = document.createElement("button");
  createButton.className = "project-create-button";
  createButton.type = "submit";
  createButton.textContent = "Crear";

  const validation = document.createElement("div");
  validation.className = `project-menu-message${message ? " is-visible" : ""}`;
  validation.textContent = message;

  form.append(input, createButton);
  body.append(listTitle, list, form, validation);
  return body;
}

function renderProjectModalBody(message = "") {
  const currentBody = document.querySelector("[data-project-modal-body]");
  if (!currentBody) {
    return;
  }

  const nextBody = createProjectModalBody(message);
  currentBody.replaceWith(nextBody);
  requestAnimationFrame(() => {
    nextBody.querySelector("[data-project-create-input]")?.focus({ preventScroll: true });
  });
}

async function handleCreateProject(value) {
  const name = normalizeProjectName(value);

  if (!name) {
    renderProjectModalBody("Escribe un nombre de proyecto.");
    return null;
  }

  if (projectNameExists(name)) {
    renderProjectModalBody("Ese proyecto ya existe.");
    return null;
  }

  const savedProject = await createProject(
    createProjectModel({
      name,
      order: state.projects.length
    })
  );

  state.projects = sortByOrder([...state.projects, savedProject]);
  await recordCloudMutation({
    critical: true,
    entity: savedProject,
    entityId: savedProject.id,
    entityType: "project",
    operation: "insert",
    patch: savedProject
  });
  renderProjectModalBody();
  return savedProject;
}

function openTeamModal() {
  const root = document.querySelector("#modal-root");
  if (!root) {
    return;
  }

  closeProjectModal({ clearRoot: false });
  closeTeamModal({ clearRoot: false });
  root.innerHTML = "";

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) {
      closeTeamModal();
    }
  });

  const modal = document.createElement("section");
  modal.className = "modal project-modal team-modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-labelledby", "team-modal-title");

  const shell = document.createElement("div");
  shell.className = "modal-form";
  shell.append(createTeamModalTopbar(), createTeamModalBody());

  modal.append(shell);
  overlay.append(modal);
  root.append(overlay);

  teamMenuToggle.setAttribute("aria-expanded", "true");
  teamModalKeydownHandler = (event) => {
    if (event.key === "Escape") {
      closeTeamModal();
    }
  };
  document.addEventListener("keydown", teamModalKeydownHandler);

  requestAnimationFrame(() => {
    overlay.querySelector("[data-team-create-input]")?.focus({ preventScroll: true });
  });
}

function closeTeamModal(options = {}) {
  const { clearRoot = true } = options;

  if (teamModalKeydownHandler) {
    document.removeEventListener("keydown", teamModalKeydownHandler);
    teamModalKeydownHandler = null;
  }

  teamMenuToggle?.setAttribute("aria-expanded", "false");

  if (clearRoot) {
    const root = document.querySelector("#modal-root");
    if (root) {
      root.innerHTML = "";
    }
  }
}

function createTeamModalTopbar() {
  const topbar = document.createElement("div");
  topbar.className = "modal-topbar";

  const title = document.createElement("h2");
  title.id = "team-modal-title";
  title.className = "modal-title";
  title.textContent = "Equipo";

  const closeButton = document.createElement("button");
  closeButton.className = "close-button";
  closeButton.type = "button";
  closeButton.textContent = "×";
  closeButton.setAttribute("aria-label", "Cerrar modal de equipo");
  closeButton.addEventListener("click", closeTeamModal);

  topbar.append(title, closeButton);
  return topbar;
}

function createTeamModalBody(message = "", revealedKey = null) {
  const body = document.createElement("div");
  body.className = "project-modal-body team-modal-body";
  body.dataset.teamModalBody = "true";

  if (isOwnerAccount()) {
    body.append(createOwnerProfileSection());
  }

  const accessMembers = state.teamMembers.filter((teamMember) => teamMember.status !== "local");
  const localResponsibles = state.teamMembers.filter((teamMember) => teamMember.status === "local");
  const visibleMembers = isOwnerAccount() || isMemberAccount() ? accessMembers : localResponsibles;

  body.append(
    createTeamListSection({
      emptyLabel: isOwnerAccount() ? "Sin miembros con acceso todavía" : "Sin integrantes todavía",
      members: visibleMembers,
      revealedKey,
      title: getTeamModalTitle()
    })
  );

  if (isOwnerAccount()) {
    body.append(
      createTeamListSection({
        emptyLabel: "Sin responsables locales",
        members: localResponsibles,
        revealedKey,
        title: "Responsables locales"
      })
    );
  }

  const validation = document.createElement("div");
  validation.className = `project-menu-message${message ? " is-visible" : ""}`;
  validation.textContent = message;

  if (isMemberAccount()) {
    const note = document.createElement("p");
    note.className = "team-mode-note";
    note.textContent = "Puedes ver el equipo, pero solo la cuenta maestra puede administrarlo.";
    body.append(note, validation);
    return body;
  }

  const form = document.createElement("form");
  form.className = isOwnerAccount() ? "team-access-create-form" : "project-create-form";
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = form.querySelector("[data-team-create-input]");
    const nicknameInput = form.querySelector("[data-team-nickname-input]");
    await handleCreateTeamMember(input.value, nicknameInput?.value || "");
  });

  const input = document.createElement("input");
  input.className = "project-create-input";
  input.dataset.teamCreateInput = "true";
  input.placeholder = isOwnerAccount() ? "Nombre visible" : "Nuevo responsable";
  input.type = "text";

  if (isOwnerAccount()) {
    const nicknameInput = document.createElement("input");
    nicknameInput.className = "project-create-input";
    nicknameInput.dataset.teamNicknameInput = "true";
    nicknameInput.placeholder = "nickname";
    nicknameInput.type = "text";
    nicknameInput.autocapitalize = "none";
    nicknameInput.spellcheck = false;
    form.append(input, nicknameInput);
  } else {
    form.append(input);
  }

  const createButton = document.createElement("button");
  createButton.className = "project-create-button";
  createButton.type = "submit";
  createButton.textContent = isOwnerAccount() ? "Crear acceso" : "Crear";

  form.append(createButton);
  body.append(form, validation);
  return body;
}

function createTeamListSection({ emptyLabel, members, revealedKey, title }) {
  const section = document.createElement("section");
  section.className = "team-list-section";

  const listTitle = document.createElement("p");
  listTitle.className = "project-list-title";
  listTitle.textContent = title;

  const list = document.createElement("ul");
  list.className = "project-list team-list";

  if (members.length === 0) {
    const emptyItem = document.createElement("li");
    emptyItem.className = "project-list-item is-empty";
    emptyItem.textContent = emptyLabel;
    list.append(emptyItem);
  } else {
    members.forEach((teamMember) => {
      list.append(createTeamMemberListItem(teamMember, revealedKey));
    });
  }

  section.append(listTitle, list);
  return section;
}

function createOwnerProfileSection() {
  const section = document.createElement("section");
  section.className = "team-list-section owner-profile-section";

  const title = document.createElement("p");
  title.className = "project-list-title";
  title.textContent = "Cuenta maestra";

  const card = document.createElement("div");
  card.className = "project-list-item team-list-item owner-profile-card";

  const summary = document.createElement("div");
  summary.className = "team-member-summary";

  const copy = document.createElement("div");
  copy.className = "team-member-copy";

  const name = document.createElement("strong");
  name.textContent = getOwnerDisplayName();

  const meta = document.createElement("span");
  meta.textContent = getOwnerMeta();

  const badge = document.createElement("span");
  badge.className = "owner-profile-badge";
  badge.textContent = "Cuenta maestra";

  copy.append(name, meta);

  const controls = document.createElement("div");
  controls.className = "team-member-actions";

  const editButton = document.createElement("button");
  editButton.className = "small-button team-member-edit-button";
  editButton.type = "button";
  editButton.textContent = isOwnerProfileExpanded ? "Cerrar" : "Editar";
  editButton.addEventListener("click", () => {
    isOwnerProfileExpanded = !isOwnerProfileExpanded;
    expandedTeamMemberId = "";
    renderTeamModalBody();
  });

  controls.append(badge, editButton);
  summary.append(copy, controls);
  card.append(summary);

  if (isOwnerProfileExpanded) {
    card.append(createOwnerProfileEditPanel());
  }

  section.append(title, card);
  return section;
}

function createOwnerProfileEditPanel() {
  const form = document.createElement("form");
  form.className = "team-member-edit-panel owner-profile-edit-panel";
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    await handleUpdateOwnerProfile({
      displayName: formData.get("displayName"),
      nickname: formData.get("nickname")
    });
  });

  const nameInput = document.createElement("input");
  nameInput.name = "displayName";
  nameInput.type = "text";
  nameInput.value = getOwnerDisplayName();
  nameInput.placeholder = "Nombre visible";

  const nicknameInput = document.createElement("input");
  nicknameInput.name = "nickname";
  nicknameInput.type = "text";
  nicknameInput.value = state.account?.nickname || "";
  nicknameInput.placeholder = "nickname";
  nicknameInput.autocapitalize = "none";
  nicknameInput.spellcheck = false;

  const saveButton = document.createElement("button");
  saveButton.className = "save-task-button";
  saveButton.type = "submit";
  saveButton.textContent = "Guardar";

  form.append(nameInput, nicknameInput, saveButton);
  return form;
}

function createTeamMemberListItem(teamMember, revealedKey) {
  const item = document.createElement("li");
  item.className = "project-list-item team-list-item";

  const summary = document.createElement("div");
  summary.className = "team-member-summary";

  const copy = document.createElement("div");
  copy.className = "team-member-copy";

  const name = document.createElement("strong");
  name.textContent = teamMember.name;

  const meta = document.createElement("span");
  meta.textContent = getTeamMemberMeta(teamMember);

  copy.append(name, meta);
  summary.append(copy);

  if (isOwnerAccount() && teamMember.status !== "local") {
    const editButton = document.createElement("button");
    editButton.className = "small-button team-member-edit-button";
    editButton.type = "button";
    editButton.textContent = expandedTeamMemberId === teamMember.id ? "Cerrar" : "Editar";
    editButton.addEventListener("click", () => {
      expandedTeamMemberId = expandedTeamMemberId === teamMember.id ? "" : teamMember.id;
      isOwnerProfileExpanded = false;
      renderTeamModalBody();
    });
    summary.append(editButton);
  }

  if (!isMemberAccount() && teamMember.status === "local") {
    const deleteButton = document.createElement("button");
    deleteButton.className = "small-button team-member-delete-button";
    deleteButton.type = "button";
    deleteButton.textContent = "Eliminar";
    deleteButton.addEventListener("click", () => handleDeleteLocalTeamMember(teamMember));
    summary.append(deleteButton);
  }

  item.append(summary);

  if (revealedKey?.teamMemberId === teamMember.id) {
    const keyBox = document.createElement("div");
    keyBox.className = "member-key-callout";
    keyBox.innerHTML = `<span>Clave vigente</span><strong>${revealedKey.ownerKey}</strong>`;
    item.append(keyBox);
  }

  if (isOwnerAccount() && expandedTeamMemberId === teamMember.id && teamMember.status !== "local") {
    item.append(createTeamMemberEditPanel(teamMember));
  }

  return item;
}

function createTeamMemberEditPanel(teamMember) {
  const form = document.createElement("form");
  form.className = "team-member-edit-panel";
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    await handleUpdateTeamMemberAccess({
      name: formData.get("name"),
      nickname: formData.get("nickname"),
      status: formData.get("status"),
      teamMemberId: teamMember.id
    });
  });

  const nameInput = document.createElement("input");
  nameInput.name = "name";
  nameInput.type = "text";
  nameInput.value = teamMember.name;

  const nicknameInput = document.createElement("input");
  nicknameInput.name = "nickname";
  nicknameInput.type = "text";
  nicknameInput.value = teamMember.nickname || "";
  nicknameInput.autocapitalize = "none";
  nicknameInput.spellcheck = false;

  const statusSelect = document.createElement("select");
  statusSelect.name = "status";
  [
    ["active", "Activo"],
    ["inactive", "Inactivo"]
  ].forEach(([value, label]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    statusSelect.append(option);
  });
  statusSelect.value = teamMember.status === "inactive" ? "inactive" : "active";

  const saveButton = document.createElement("button");
  saveButton.className = "save-task-button";
  saveButton.type = "submit";
  saveButton.textContent = "Guardar";

  const resetKeyButton = document.createElement("button");
  resetKeyButton.className = "small-button";
  resetKeyButton.type = "button";
  resetKeyButton.textContent = "Nueva clave";
  resetKeyButton.addEventListener("click", () => handleResetTeamMemberKey(teamMember.id));

  form.append(nameInput, nicknameInput, statusSelect, saveButton, resetKeyButton);
  return form;
}

function renderTeamModalBody(message = "", revealedKey = null) {
  const currentBody = document.querySelector("[data-team-modal-body]");
  if (!currentBody) {
    return;
  }

  const nextBody = createTeamModalBody(message, revealedKey);
  currentBody.replaceWith(nextBody);
  requestAnimationFrame(() => {
    nextBody.querySelector("[data-team-create-input]")?.focus({ preventScroll: true });
  });
}

async function handleUpdateOwnerProfile({ displayName, nickname }) {
  const normalizedName = normalizeTeamMemberName(displayName);
  const normalizedNickname = normalizeNickname(nickname);
  const previousOwnerName = getOwnerDisplayName();

  if (!normalizedName) {
    renderTeamModalBody("Escribe el nombre visible de la cuenta maestra.");
    return;
  }

  if (!isValidMemberNickname(normalizedNickname)) {
    renderTeamModalBody("El nickname debe ir en minúsculas, sin espacios, mínimo 3 caracteres.");
    return;
  }

  if (teamMemberNicknameExists(normalizedNickname)) {
    renderTeamModalBody("Ese nickname ya existe en tu equipo.");
    return;
  }

  try {
    const result = await updateCloudOwnerProfile({
      displayName: normalizedName,
      nickname: normalizedNickname
    });
    const nextDisplayName = result.account?.displayName || normalizedName;
    state.account = {
      ...state.account,
      displayName: nextDisplayName,
      nickname: result.account?.nickname || normalizedNickname
    };
    await updateTasksResponsibleName(previousOwnerName, nextDisplayName);
    isOwnerProfileExpanded = false;
    updateAccountButton();
    renderTeamModalBody("Cuenta maestra actualizada.");
  } catch (error) {
    renderTeamModalBody(error.message || "No se pudo actualizar la cuenta maestra.");
  }
}

async function updateTasksResponsibleName(previousName, nextName) {
  const previousResponsible = normalizeTeamMemberName(previousName);
  const nextResponsible = normalizeTeamMemberName(nextName);

  if (
    !previousResponsible ||
    !nextResponsible ||
    previousResponsible.toLocaleLowerCase("es-MX") === nextResponsible.toLocaleLowerCase("es-MX")
  ) {
    return;
  }

  const now = new Date().toISOString();
  const previousKey = previousResponsible.toLocaleLowerCase("es-MX");
  const changedTasks = [];

  for (const task of state.tasks) {
    if (task.responsible.toLocaleLowerCase("es-MX") !== previousKey) {
      continue;
    }

    const nextTask = {
      ...task,
      responsible: nextResponsible,
      updatedAt: now
    };
    const savedTask = await updateTask(nextTask);
    changedTasks.push({ previousTask: task, savedTask });
  }

  if (changedTasks.length === 0) {
    return;
  }

  state.tasks = sortByOrder(
    state.tasks.map((task) => changedTasks.find((item) => item.savedTask.id === task.id)?.savedTask || task)
  );

  for (const { previousTask, savedTask } of changedTasks) {
    await recordCloudMutation({
      critical: true,
      entity: savedTask,
      entityId: savedTask.id,
      entityType: "task",
      operation: "update",
      patch: getTaskPatch(previousTask, savedTask)
    });
    await recordTaskFieldEvents(previousTask, savedTask);
  }
}

async function handleDeleteLocalTeamMember(teamMember) {
  if (!teamMember || teamMember.status !== "local") {
    return;
  }

  const now = new Date().toISOString();
  const responsibleKey = teamMember.name.toLocaleLowerCase("es-MX");
  const reassignedTasks = [];

  await deleteTeamMember(teamMember.id);
  state.teamMembers = sortByOrder(
    state.teamMembers
      .filter((currentTeamMember) => currentTeamMember.id !== teamMember.id)
      .map((currentTeamMember, index) => ({
        ...currentTeamMember,
        order: index
      }))
  );
  await saveTeamMembers(state.teamMembers);

  for (const task of state.tasks) {
    if (task.responsible.toLocaleLowerCase("es-MX") !== responsibleKey) {
      continue;
    }

    const nextTask = {
      ...task,
      responsible: DEFAULT_RESPONSIBLE_NAME,
      updatedAt: now
    };
    const savedTask = await updateTask(nextTask);
    reassignedTasks.push({ previousTask: task, savedTask });
  }

  if (reassignedTasks.length > 0) {
    state.tasks = sortByOrder(
      state.tasks.map((task) => reassignedTasks.find((item) => item.savedTask.id === task.id)?.savedTask || task)
    );
  }

  await recordCloudMutation({
    critical: true,
    entity: {
      ...teamMember,
      deletedAt: now
    },
    entityId: teamMember.id,
    entityType: "teamMember",
    operation: "delete",
    patch: {
      deletedAt: now
    }
  });

  for (const { previousTask, savedTask } of reassignedTasks) {
    await recordCloudMutation({
      critical: true,
      entity: savedTask,
      entityId: savedTask.id,
      entityType: "task",
      operation: "update",
      patch: getTaskPatch(previousTask, savedTask)
    });
    await recordTaskFieldEvents(previousTask, savedTask);
  }

  renderTeamModalBody("Responsable local eliminado.");
  render();
}

async function handleCreateTeamMember(value, nicknameValue = "") {
  const name = normalizeTeamMemberName(value);

  if (!name) {
    renderTeamModalBody(isOwnerAccount() ? "Escribe el nombre visible del miembro." : "Escribe un nombre de responsable.");
    return null;
  }

  if (isDefaultResponsible(name)) {
    renderTeamModalBody("Ese nombre está reservado para tareas sin responsable.");
    return null;
  }

  if (teamMemberNameExists(name) && !canUpgradeLocalTeamMember(name)) {
    renderTeamModalBody("Ese integrante ya existe.");
    return null;
  }

  if (isOwnerAccount()) {
    const nickname = normalizeNickname(nicknameValue);
    if (!isValidMemberNickname(nickname)) {
      renderTeamModalBody("El nickname debe ir en minúsculas, sin espacios, mínimo 3 caracteres.");
      return null;
    }

    if (teamMemberNicknameExists(nickname)) {
      renderTeamModalBody("Ese nickname ya existe.");
      return null;
    }

    const context = getCloudSyncContext();
    if (!context?.boardId) {
      renderTeamModalBody("No encontramos el tablero cloud para crear el acceso.");
      return null;
    }

    try {
      const result = await createCloudTeamMember({
        boardId: context.boardId,
        clientId,
        name,
        nickname
      });
      const existingIndex = state.teamMembers.findIndex((teamMember) => teamMember.id === result.teamMember.id);
      const savedTeamMember = await createTeamMember({
        ...result.teamMember,
        order: existingIndex >= 0 ? state.teamMembers[existingIndex].order : state.teamMembers.length
      });
      state.teamMembers = sortByOrder(
        existingIndex >= 0
          ? state.teamMembers.map((teamMember, index) => index === existingIndex ? savedTeamMember : teamMember)
          : [...state.teamMembers, savedTeamMember]
      );
      renderTeamModalBody("", {
        ownerKey: result.teamMember.ownerKey,
        teamMemberId: savedTeamMember.id
      });
      render();
      return savedTeamMember;
    } catch (error) {
      renderTeamModalBody(error.message || "No se pudo crear el acceso.");
      return null;
    }
  }

  const savedTeamMember = await createTeamMember(
    createTeamMemberModel({
      name,
      order: state.teamMembers.length
    })
  );

  state.teamMembers = sortByOrder([...state.teamMembers, savedTeamMember]);
  await recordCloudMutation({
    critical: true,
    entity: savedTeamMember,
    entityId: savedTeamMember.id,
    entityType: "teamMember",
    operation: "insert",
    patch: savedTeamMember
  });
  renderTeamModalBody();
  return savedTeamMember;
}

async function handleUpdateTeamMemberAccess({ name, nickname, status, teamMemberId }) {
  const normalizedName = normalizeTeamMemberName(name);
  const normalizedNickname = normalizeNickname(nickname);

  if (!normalizedName) {
    renderTeamModalBody("Escribe el nombre visible.");
    return;
  }

  if (!isValidMemberNickname(normalizedNickname)) {
    renderTeamModalBody("El nickname debe ir en minúsculas, sin espacios, mínimo 3 caracteres.");
    return;
  }

  try {
    const result = await updateCloudTeamMember({
      clientId,
      name: normalizedName,
      nickname: normalizedNickname,
      status,
      teamMemberId
    });
    await upsertLocalTeamMember(result.teamMember);
    renderTeamModalBody("Cambios guardados.");
    render();
  } catch (error) {
    renderTeamModalBody(error.message || "No se pudo actualizar el miembro.");
  }
}

async function handleResetTeamMemberKey(teamMemberId) {
  try {
    const result = await resetCloudTeamMemberKey({ clientId, teamMemberId });
    await upsertLocalTeamMember(result.teamMember);
    renderTeamModalBody("", {
      ownerKey: result.teamMember.ownerKey,
      teamMemberId
    });
  } catch (error) {
    renderTeamModalBody(error.message || "No se pudo regenerar la clave.");
  }
}

async function upsertLocalTeamMember(nextTeamMember) {
  const existingIndex = state.teamMembers.findIndex((teamMember) => teamMember.id === nextTeamMember.id);
  const normalized = createTeamMemberModel({
    ...nextTeamMember,
    order: existingIndex >= 0 ? state.teamMembers[existingIndex].order : state.teamMembers.length
  });
  normalized.id = nextTeamMember.id;
  normalized.createdAt = nextTeamMember.createdAt || normalized.createdAt;
  normalized.updatedAt = nextTeamMember.updatedAt || new Date().toISOString();

  const nextTeamMembers = existingIndex >= 0
    ? state.teamMembers.map((teamMember, index) => index === existingIndex ? normalized : teamMember)
    : [...state.teamMembers, normalized];

  state.teamMembers = await saveTeamMembers(sortByOrder(nextTeamMembers));
  return normalized;
}

function projectNameExists(name) {
  return state.projects.some(
    (project) => project.name.toLocaleLowerCase("es-MX") === name.toLocaleLowerCase("es-MX")
  );
}

function teamMemberNameExists(name) {
  return state.teamMembers.some(
    (teamMember) => teamMember.name.toLocaleLowerCase("es-MX") === name.toLocaleLowerCase("es-MX")
  );
}

function teamMemberNicknameExists(nickname) {
  return state.teamMembers.some(
    (teamMember) => teamMember.nickname && teamMember.nickname === nickname
  );
}

function canUpgradeLocalTeamMember(name) {
  if (!isOwnerAccount()) {
    return false;
  }

  return state.teamMembers.some(
    (teamMember) =>
      teamMember.status === "local" &&
      teamMember.name.toLocaleLowerCase("es-MX") === name.toLocaleLowerCase("es-MX")
  );
}

function getTeamModalTitle() {
  if (isOwnerAccount()) {
    return "Miembros con acceso";
  }

  if (isMemberAccount()) {
    return "Equipo";
  }

  return "Responsables locales";
}

function getTeamMemberMeta(teamMember) {
  if (teamMember.status === "local") {
    return "Responsable local";
  }

  const statusLabel = teamMember.status === "inactive" ? "Inactivo" : "Activo";
  return teamMember.nickname ? `@${teamMember.nickname} · ${statusLabel}` : statusLabel;
}

function getOwnerDisplayName() {
  return state.account?.displayName || state.account?.email || "Cuenta maestra";
}

function getOwnerMeta() {
  const nickname = state.account?.nickname ? `@${state.account.nickname}` : "Sin nickname";
  const email = state.account?.email || "";
  return email ? `${nickname} · ${email}` : nickname;
}

function getAssignableTeamMembers() {
  const teamMembers = [...state.teamMembers];

  if (!state.account?.userId) {
    return teamMembers;
  }

  const ownerName = normalizeTeamMemberName(getOwnerDisplayName());
  if (!ownerName) {
    return teamMembers;
  }

  const ownerKey = ownerName.toLocaleLowerCase("es-MX");
  const hasOwner = teamMembers.some(
    (teamMember) =>
      teamMember.name.toLocaleLowerCase("es-MX") === ownerKey &&
      teamMember.userId === state.account.userId
  );

  if (hasOwner) {
    return teamMembers;
  }

  return [
    {
      createdAt: new Date().toISOString(),
      id: `owner_${state.account.userId}`,
      lastLoginAt: "",
      name: ownerName,
      nickname: state.account.nickname || "",
      order: -1,
      status: "owner",
      updatedAt: new Date().toISOString(),
      userId: state.account.userId
    },
    ...teamMembers
  ];
}

async function cleanupOwnerLocalResponsible() {
  const ownerName = normalizeTeamMemberName(getOwnerDisplayName());
  if (!ownerName) {
    return;
  }

  const ownerKey = ownerName.toLocaleLowerCase("es-MX");
  const duplicates = state.teamMembers.filter(
    (teamMember) =>
      teamMember.status === "local" &&
      teamMember.name.toLocaleLowerCase("es-MX") === ownerKey
  );

  if (duplicates.length === 0) {
    return;
  }

  for (const duplicate of duplicates) {
    await deleteTeamMember(duplicate.id);
  }

  state.teamMembers = sortByOrder(
    state.teamMembers
      .filter((teamMember) => !duplicates.some((duplicate) => duplicate.id === teamMember.id))
      .map((teamMember, index) => ({
        ...teamMember,
        order: index
      }))
  );
  await saveTeamMembers(state.teamMembers);
}

function isCurrentAccountResponsibleName(name) {
  if (!state.account?.userId) {
    return false;
  }

  const ownerName = normalizeTeamMemberName(getOwnerDisplayName());
  return Boolean(ownerName) && ownerName.toLocaleLowerCase("es-MX") === name.toLocaleLowerCase("es-MX");
}

function isOwnerAccount() {
  return state.account?.role === "owner";
}

function isMemberAccount() {
  return state.account?.accountType === "member";
}

function isDefaultResponsible(name) {
  return name.toLocaleLowerCase("es-MX") === DEFAULT_RESPONSIBLE_NAME.toLocaleLowerCase("es-MX");
}

function getDefaultProjectName() {
  return state.projects[0]?.name || DEFAULT_PROJECT_NAME;
}

async function createTrackedTaskEvent({ currentTask, eventType, metadata = {}, occurredAt, previousTask }) {
  const taskEvent = await createTaskEvent(
    buildTaskEventPayload({
      currentTask,
      eventType,
      metadata,
      occurredAt,
      previousTask
    })
  );
  state.taskEvents = [...state.taskEvents, taskEvent];
  await recordCloudMutation({
    critical: true,
    entity: taskEvent,
    entityId: taskEvent.id,
    entityType: "taskEvent",
    operation: "insert",
    patch: taskEvent
  });
  return taskEvent;
}

function buildTaskEventPayload({ currentTask, eventType, metadata = {}, occurredAt, previousTask }) {
  const task = currentTask || previousTask || {};
  const eventTime = occurredAt || new Date().toISOString();

  return {
    taskId: task.id,
    columnId: task.columnId,
    fromColumnId: previousTask?.columnId || "",
    toColumnId: currentTask?.columnId || task.columnId,
    eventType,
    createdAt: eventTime,
    occurredAt: eventTime,
    responsibleName: task.responsible || DEFAULT_RESPONSIBLE_NAME,
    projectName: task.project || DEFAULT_PROJECT_NAME,
    pointsSnapshot: Number.isFinite(Number(task.points)) ? Number(task.points) : 0,
    folio: task.folio || "",
    metadata
  };
}

async function recordTaskFieldEvents(previousTask, nextTask) {
  if (!previousTask || !nextTask) {
    return;
  }

  const changedFields = [
    ["project", "project_changed"],
    ["responsible", "responsible_changed"],
    ["points", "points_changed"]
  ];

  for (const [field, eventType] of changedFields) {
    if (String(previousTask[field]) !== String(nextTask[field])) {
      await createTrackedTaskEvent({
        currentTask: nextTask,
        eventType,
        metadata: {
          field,
          from: previousTask[field],
          to: nextTask[field]
        },
        previousTask
      });
    }
  }
}

async function handleAddTask(columnId) {
  const project = getDefaultProjectName();
  const folio = await createFolio(project);
  const task = createTaskModel({
    columnId,
    order: getColumnCardCount(columnId),
    project,
    folio
  });

  const savedTask = await createTask(task);
  state.tasks = sortByOrder([...state.tasks, savedTask]);
  await recordCloudMutation({
    critical: true,
    entity: savedTask,
    entityId: savedTask.id,
    entityType: "task",
    operation: "insert",
    patch: savedTask
  });
  await createTrackedTaskEvent({
    currentTask: savedTask,
    eventType: "created",
    occurredAt: savedTask.createdAt
  });
  render();
  handleOpenTask(savedTask.id);
}

async function createFolio(project) {
  const cloudNumber = await allocateNextCloudFolioNumber();

  if (cloudNumber) {
    return formatFolio(project, cloudNumber);
  }

  return generateFolio(state.tasks, project);
}

function getColumnCardCount(columnId) {
  return (
    state.tasks.filter((task) => task.columnId === columnId).length +
    state.chartCards.filter((chartCard) => chartCard.columnId === columnId).length
  );
}

function handleOpenTask(taskId) {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) {
    return;
  }

  openTaskModal({
    task,
    projects: state.projects,
    teamMembers: getAssignableTeamMembers(),
    onDelete: handleDeleteTask,
    onSave: handleSaveTask,
    onClose: () => render()
  });
}

async function handleSaveTask(task) {
  const previousTask = state.tasks.find((currentTask) => currentTask.id === task.id);
  const savedTask = await updateTask(task);
  state.tasks = sortByOrder(
    state.tasks.map((currentTask) => (currentTask.id === savedTask.id ? savedTask : currentTask))
  );
  await recordCloudMutation({
    critical: isCriticalTaskUpdate(previousTask, savedTask),
    entity: savedTask,
    entityId: savedTask.id,
    entityType: "task",
    operation: "update",
    patch: getTaskPatch(previousTask, savedTask)
  });
  await recordTaskFieldEvents(previousTask, savedTask);
  render();
}

async function handleUpdateChartCard(chartCard) {
  const savedChartCard = await updateChartCard(chartCard);
  state.chartCards = sortByOrder(
    state.chartCards.map((currentChartCard) =>
      currentChartCard.id === savedChartCard.id ? savedChartCard : currentChartCard
    )
  );
  await recordCloudMutation({
    entity: savedChartCard,
    entityId: savedChartCard.id,
    entityType: "chartCard",
    operation: "update",
    patch: savedChartCard
  });
  render();
}

function isCriticalTaskUpdate(previousTask, nextTask) {
  if (!previousTask || !nextTask) {
    return true;
  }

  return (
    previousTask.project !== nextTask.project ||
    previousTask.responsible !== nextTask.responsible ||
    previousTask.checklists.length !== nextTask.checklists.length ||
    getChecklistItemCount(previousTask) !== getChecklistItemCount(nextTask)
  );
}

function getChecklistItemCount(task) {
  return task.checklists.reduce((total, checklist) => total + checklist.items.length, 0);
}

function getTaskPatch(previousTask, nextTask) {
  if (!previousTask) {
    return nextTask;
  }

  return Object.entries(nextTask).reduce((patch, [key, value]) => {
    if (JSON.stringify(previousTask[key]) !== JSON.stringify(value)) {
      patch[key] = value;
    }
    return patch;
  }, {});
}

async function handleMoveCard(cardType, cardId, targetColumnId) {
  if (cardType === TASK_CARD_TYPE) {
    await handleMoveTask(cardId, targetColumnId);
    return;
  }

  if (cardType === CHART_CARD_TYPE) {
    await handleMoveChartCard(cardId, targetColumnId);
  }
}

async function handleMoveTask(taskId, targetColumnId) {
  const taskToMove = state.tasks.find((task) => task.id === taskId);

  if (!taskToMove || taskToMove.columnId === targetColumnId) {
    return;
  }

  const now = new Date().toISOString();
  const movedTask = {
    ...taskToMove,
    columnId: targetColumnId,
    order: getColumnCardCount(targetColumnId),
    updatedAt: now
  };

  const nextTasks = state.tasks.map((task) => (task.id === taskId ? movedTask : task));
  const normalizedCards = normalizeOrdersByColumn(nextTasks, state.chartCards);

  state.tasks = sortByOrder(normalizedCards.tasks);
  state.chartCards = sortByOrder(normalizedCards.chartCards);
  render();

  try {
    await Promise.all([saveTaskOrder(normalizedCards.tasks), saveChartCards(normalizedCards.chartCards)]);
    const savedMovedTask = state.tasks.find((task) => task.id === taskId);
    await recordCloudMutation({
      critical: true,
      entity: savedMovedTask,
      entityId: taskId,
      entityType: "task",
      operation: "move",
      patch: { columnId: targetColumnId }
    });
    await createTrackedTaskEvent({
      currentTask: savedMovedTask,
      eventType: "moved",
      metadata: {
        fromColumnId: taskToMove.columnId,
        toColumnId: targetColumnId
      },
      previousTask: taskToMove
    });
    render();
  } catch (error) {
    await reloadBoardState();
    render();
    renderBootError(error);
  }
}

async function handleMoveChartCard(chartCardId, targetColumnId) {
  const chartCardToMove = state.chartCards.find((chartCard) => chartCard.id === chartCardId);

  if (!chartCardToMove || chartCardToMove.columnId === targetColumnId) {
    return;
  }

  const movedChartCard = {
    ...chartCardToMove,
    columnId: targetColumnId,
    order: getColumnCardCount(targetColumnId),
    updatedAt: new Date().toISOString()
  };

  const nextChartCards = state.chartCards.map((chartCard) =>
    chartCard.id === chartCardId ? movedChartCard : chartCard
  );
  const normalizedCards = normalizeOrdersByColumn(state.tasks, nextChartCards);

  state.tasks = sortByOrder(normalizedCards.tasks);
  state.chartCards = sortByOrder(normalizedCards.chartCards);
  render();

  try {
    await Promise.all([saveTaskOrder(normalizedCards.tasks), saveChartCards(normalizedCards.chartCards)]);
    await recordCloudMutation({
      critical: true,
      entity: state.chartCards.find((chartCard) => chartCard.id === chartCardId),
      entityId: chartCardId,
      entityType: "chartCard",
      operation: "move",
      patch: { columnId: targetColumnId }
    });
  } catch (error) {
    await reloadBoardState();
    render();
    renderBootError(error);
  }
}

async function handleDeleteTask(taskId) {
  const taskToDelete = state.tasks.find((task) => task.id === taskId);
  const nextTasks = state.tasks.filter((task) => task.id !== taskId);
  const normalizedCards = normalizeOrdersByColumn(nextTasks, state.chartCards);

  state.tasks = sortByOrder(normalizedCards.tasks);
  state.chartCards = sortByOrder(normalizedCards.chartCards);
  render();

  try {
    await deleteTask(taskId);
    await Promise.all([saveTaskOrder(normalizedCards.tasks), saveChartCards(normalizedCards.chartCards)]);
    if (taskToDelete) {
      await createTrackedTaskEvent({
        eventType: "deleted",
        previousTask: taskToDelete
      });
    }
    await recordCloudMutation({
      critical: true,
      entityId: taskId,
      entityType: "task",
      operation: "delete",
      patch: { deletedAt: new Date().toISOString() }
    });
  } catch (error) {
    await reloadBoardState();
    render();
    renderBootError(error);
  }
}

async function syncProjectsWithTasks(projects, tasks) {
  const nextProjects = [];
  const seen = new Set();

  const addProjectName = (name) => {
    const projectName = normalizeProjectName(name);
    const key = projectName.toLocaleLowerCase("es-MX");

    if (!projectName || seen.has(key)) {
      return;
    }

    seen.add(key);
    nextProjects.push(
      projects.find(
        (project) => project.name.toLocaleLowerCase("es-MX") === key
      ) || createProjectModel({ name: projectName, order: nextProjects.length })
    );
  };

  projects.forEach((project) => addProjectName(project.name));
  tasks.forEach((task) => addProjectName(task.project));

  if (nextProjects.length === 0) {
    addProjectName(DEFAULT_PROJECT_NAME);
  }

  const sortedProjects = sortByOrder(
    nextProjects.map((project, index) => ({
      ...project,
      order: Number.isFinite(Number(project.order)) ? Number(project.order) : index
    }))
  );

  if (projectsNeedSaving(projects, sortedProjects)) {
    return saveProjects(sortedProjects);
  }

  return sortedProjects;
}

async function syncTaskFoliosWithProjects(tasks) {
  let changed = false;
  let fallbackNumber = getNextGlobalFolioNumber(tasks);

  const migratedTasks = tasks.map((task) => {
    const project = normalizeProjectName(task.project) || DEFAULT_PROJECT_NAME;
    const number = getFolioNumber(task.folio) || fallbackNumber++;
    const folio = updateFolioProjectName(task.folio, project, number);

    if (task.project !== project || task.folio !== folio) {
      changed = true;
      return {
        ...task,
        project,
        folio,
        updatedAt: new Date().toISOString()
      };
    }

    return task;
  });

  if (changed) {
    await saveTaskOrder(migratedTasks);
  }

  return sortByOrder(migratedTasks);
}

async function syncTeamMembersWithTasks(teamMembers, tasks) {
  const nextTeamMembers = [];
  const seen = new Set();

  const addTeamMemberName = (name) => {
    const teamMemberName = normalizeTeamMemberName(name);
    const key = teamMemberName.toLocaleLowerCase("es-MX");

    if (
      !teamMemberName ||
      isDefaultResponsible(teamMemberName) ||
      isCurrentAccountResponsibleName(teamMemberName) ||
      seen.has(key)
    ) {
      return;
    }

    seen.add(key);
    nextTeamMembers.push(
      teamMembers.find(
        (teamMember) => teamMember.name.toLocaleLowerCase("es-MX") === key
      ) || createTeamMemberModel({ name: teamMemberName, order: nextTeamMembers.length })
    );
  };

  teamMembers.forEach((teamMember) => addTeamMemberName(teamMember.name));
  tasks.forEach((task) => addTeamMemberName(task.responsible));

  const sortedTeamMembers = sortByOrder(
    nextTeamMembers.map((teamMember, index) => ({
      ...teamMember,
      order: Number.isFinite(Number(teamMember.order)) ? Number(teamMember.order) : index
    }))
  );

  if (teamMembersNeedSaving(teamMembers, sortedTeamMembers)) {
    return saveTeamMembers(sortedTeamMembers);
  }

  return sortedTeamMembers;
}

function projectsNeedSaving(currentProjects, nextProjects) {
  if (currentProjects.length !== nextProjects.length) {
    return true;
  }

  return nextProjects.some((project, index) => currentProjects[index]?.name !== project.name);
}

function teamMembersNeedSaving(currentTeamMembers, nextTeamMembers) {
  if (currentTeamMembers.length !== nextTeamMembers.length) {
    return true;
  }

  return nextTeamMembers.some(
    (teamMember, index) => currentTeamMembers[index]?.name !== teamMember.name
  );
}

function normalizeOrdersByColumn(tasks, chartCards) {
  const nextTasks = [];
  const nextChartCards = [];

  state.columns.forEach((column) => {
    const columnCards = [
      ...tasks
        .filter((task) => task.columnId === column.id)
        .map((task) => ({ ...task, cardType: TASK_CARD_TYPE })),
      ...chartCards
        .filter((chartCard) => chartCard.columnId === column.id)
        .map((chartCard) => ({ ...chartCard, cardType: CHART_CARD_TYPE }))
    ];

    sortByOrder(columnCards).forEach((card, index) => {
      const { cardType, ...orderedCard } = card;
      if (cardType === TASK_CARD_TYPE) {
        nextTasks.push({
          ...orderedCard,
          order: index
        });
        return;
      }

      nextChartCards.push({
        ...orderedCard,
        order: index
      });
    });
  });

  return {
    chartCards: nextChartCards,
    tasks: nextTasks
  };
}

function renderBootError(error) {
  boardElement.innerHTML = "";
  const message = document.createElement("div");
  message.className = "validation-message is-visible";
  message.textContent = `No se pudo iniciar JavoPM: ${error.message}`;
  boardElement.append(message);
}

startApp();
