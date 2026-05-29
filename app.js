import {
  createProject,
  createCRMProspect,
  createTask,
  createTeamMember,
  createTaskEvent,
  clearPendingMutations,
  clearChatSnapshot,
  deleteCRMProspect,
  deleteTask,
  deleteTeamMember,
  exportBoardSnapshot,
  getCachedChatSnapshot,
  getChartCards,
  getColumns,
  getCRMProspects,
  getMetaValue,
  getProjects,
  getTeamMembers,
  getTaskEvents,
  getTasks,
  importBoardSnapshot,
  importChatSnapshot,
  initDB,
  resetSeedDataIfNeeded,
  resetLocalBoardAfterLogout,
  saveAnonymousBackup,
  saveChartCards,
  saveCRMProspects,
  setMetaValue,
  saveProjects,
  saveTeamMembers,
  saveTaskOrder,
  updateChartCard,
  updateCRMProspect,
  updateTask
} from "./db.js?v=20260529-guests";
import {
  bootstrapChat,
  createChatGroup,
  ensureDirectConversation,
  markChatRead,
  sendChatMessage,
  startChatRealtime,
  stopChatRealtime
} from "./chatRepository.js?v=20260529-guests";
import {
  pullGuestBoardSnapshot,
  saveProfileUIPreference
} from "./cloudRepository.js?v=20260529-guests";
import {
  CHART_CARD_TYPE,
  CRM_STATUSES,
  DEFAULT_RESPONSIBLE_NAME,
  METRICS_COLUMN_ID,
  TASK_CARD_TYPE,
  UNASSIGNED_PROJECT_NAME,
  createId,
  createCRMProspectModel,
  createProjectModel,
  createTeamMemberModel,
  createTaskModel,
  formatFolio,
  generateFolio,
  getFolioNumber,
  getNextGlobalFolioNumber,
  isValidMemberNickname,
  normalizeCRMProspect,
  normalizeNickname,
  normalizeProjectName,
  normalizeTeamMemberName,
  sortByOrder,
  updateFolioProjectName
} from "./models.js?v=20260529-guests";
import { initAccountModal } from "./accountModal.js?v=20260529-guests";
import {
  canUseAccounts,
  createOwnerAccount,
  loginGuestAccount,
  loginMemberAccount,
  loginOwnerAccount,
  restoreOwnerSession,
  signOutOwnerAccount
} from "./auth.js?v=20260529-guests";
import {
  completeMemberPassword,
  createCloudGuest,
  createCloudTeamMember,
  deleteCloudGuest,
  deleteCloudTeamMember,
  listCloudGuests,
  resetCloudGuestKey,
  resetCloudTeamMemberKey,
  updateCloudGuest,
  updateCloudOwnerProfile,
  updateCloudTeamMember
} from "./memberApi.js?v=20260529-guests";
import { openTaskModal } from "./modal.js?v=20260529-guests";
import {
  allocateNextCloudFolioNumber,
  getCloudSyncContext,
  initSyncEngine,
  recordCloudMutation,
  startCloudSyncSession,
  stopCloudSyncSession
} from "./syncEngine.js?v=20260529-guests";
import { renderBoard } from "./ui.js?v=20260529-guests";
import { renderCRM } from "./crm.js?v=20260529-guests";
import { openCRMProspectModal } from "./crmModal.js?v=20260529-guests";
import { getSupabaseClient } from "./supabaseClient.js?v=20260529-guests";

const SECTION_BOARD = "board";
const SECTION_CRM = "crm";
const SECTION_PREFERENCE_KEY = "lastSection";
const SECTION_PREFERENCE_META_PREFIX = "sectionPreference";

const state = {
  activeSection: SECTION_BOARD,
  chartCards: [],
  columns: [],
  crmProspects: [],
  account: null,
  ownerProfile: null,
  filters: {
    crmStatus: "all",
    project: "all",
    responsible: "all"
  },
  projects: [],
  guests: [],
  teamMembers: [],
  taskEvents: [],
  tasks: [],
  chat: {
    activeConversationId: "",
    drafts: {},
    error: "",
    groupDraftOpen: false,
    isEnabled: false,
    isLoading: false,
    isOpen: false,
    snapshot: {
      attachments: [],
      canCreateGroups: false,
      conversations: [],
      currentUserId: "",
      directory: [],
      messages: [],
      participants: []
    },
    view: "list"
  }
};

const boardElement = document.querySelector("#board");
const accountMenuToggle = document.querySelector("[data-account-menu-toggle]");
const chatMenuToggle = document.querySelector("[data-chat-menu-toggle]");
const chatMenuUnread = document.querySelector("[data-chat-menu-unread]");
const crmSectionToggle = document.querySelector("[data-crm-section-toggle]");
const projectMenuToggle = document.querySelector("[data-project-menu-toggle]");
const teamMenuToggle = document.querySelector("[data-team-menu-toggle]");
const guestMenuToggle = document.querySelector("[data-guest-menu-toggle]");
const filterMenuToggle = document.querySelector("[data-filter-menu-toggle]");
const themeToggle = document.querySelector("[data-theme-toggle]");
const themeLabel = document.querySelector("[data-theme-label]");
const sideMenuToggle = document.querySelector("[data-side-menu-toggle]");
const sideMenuOverlay = document.querySelector("[data-side-menu-overlay]");
const sideMenuClose = document.querySelector("[data-side-menu-close]");
const sideAccount = document.querySelector("[data-side-account]");
const sideAccountEmail = document.querySelector("[data-side-account-email]");
const sideAccountLogout = document.querySelector("[data-side-account-logout]");
const sideAccountMessage = document.querySelector("[data-side-account-message]");
const localBoardActions = document.querySelector("[data-local-board-actions]");
const localBoardDelete = document.querySelector("[data-local-board-delete]");
const syncStatus = document.querySelector("[data-sync-status]");
const syncLabel = document.querySelector("[data-sync-label]");
const THEME_STORAGE_KEY = "javopm-theme";
let clientId;
let projectModalKeydownHandler;
let editingProjectId = "";
let filterModalKeydownHandler;
let guestModalKeydownHandler;
let sideMenuKeydownHandler;
let teamModalKeydownHandler;
let expandedTeamMemberId = "";
let expandedGuestId = "";
let isOwnerProfileExpanded = false;
let chatRefreshTimer;
let chatMarkReadTimer;
let guestRefreshInterval;
let guestFocusRefreshHandler;

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
    initChatMenu();
    initCRMSectionToggle();
    initProjectMenu();
    initTeamMenu();
    initGuestMenu();
    initFilterMenu();
    await tryRestoreOwnerSession();
    updateAccountButton();
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
  localBoardDelete?.addEventListener("click", handleDeleteLocalBoard);
}

function openSideMenu() {
  if (!sideMenuOverlay || !sideMenuToggle) {
    return;
  }

  closeProjectModal({ clearRoot: false });
  closeTeamModal({ clearRoot: false });
  closeGuestModal({ clearRoot: false });
  closeFilterModal({ clearRoot: false });
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
    themeLabel.textContent = nextTheme === "dark" ? "Tema oscuro" : "Tema claro";
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
  const [columns, tasks, projects, teamMembers, chartCards, taskEvents, crmProspects] = await Promise.all([
    getColumns(),
    getTasks(),
    getProjects(),
    getTeamMembers(),
    getChartCards(),
    getTaskEvents(),
    getCRMProspects()
  ]);
  const syncedProjects = await syncProjectsWithTasks(projects, tasks);
  const syncedTeamMembers = await syncTeamMembersWithTasks(teamMembers, tasks);
  const syncedTasks = await syncTaskFoliosWithProjects(tasks);

  state.columns = columns;
  state.projects = syncedProjects;
  state.teamMembers = syncedTeamMembers;
  state.chartCards = sortByOrder(chartCards);
  state.crmProspects = sortByOrder(crmProspects);
  state.taskEvents = taskEvents;
  state.tasks = syncedTasks;
}

async function reloadBoardState() {
  const [columns, tasks, projects, teamMembers, chartCards, taskEvents, crmProspects] = await Promise.all([
    getColumns(),
    getTasks(),
    getProjects(),
    getTeamMembers(),
    getChartCards(),
    getTaskEvents(),
    getCRMProspects()
  ]);
  const syncedProjects = await syncProjectsWithTasks(projects, tasks);
  const syncedTeamMembers = await syncTeamMembersWithTasks(teamMembers, tasks);
  const syncedTasks = await syncTaskFoliosWithProjects(tasks);

  state.columns = columns;
  state.projects = syncedProjects;
  state.teamMembers = syncedTeamMembers;
  state.chartCards = sortByOrder(chartCards);
  state.crmProspects = sortByOrder(crmProspects);
  state.taskEvents = taskEvents;
  state.tasks = syncedTasks;
}

function render() {
  updateSectionState();
  normalizeBoardFilters();
  updateFilterButton();

  if (isGuestAccount()) {
    boardElement.className = "board guest-board";
    renderBoard({
      boardElement,
      chartCards: [],
      chat: buildChatViewModel(),
      columns: state.columns.filter((column) => column.id !== METRICS_COLUMN_ID),
      disableAddTask: true,
      disableDrag: true,
      hideSensitiveTaskFields: true,
      readOnly: true,
      taskEvents: [],
      teamMembers: [],
      tasks: state.tasks,
      visibleTasks: state.tasks,
      onAddTask: () => {},
      onBackChatList: () => {},
      onCreateChatGroup: () => {},
      onOpenChatConversation: () => {},
      onOpenTask: handleOpenTask,
      onMoveCard: () => {},
      onSendChatMessage: () => {},
      onShowChatGroupForm: () => {},
      onUpdateChatDraft: () => {},
      onUpdateChartCard: () => {}
    });
    return;
  }

  if (state.activeSection === SECTION_CRM) {
    boardElement.className = `crm-board${state.chat.isOpen ? " is-chat-open" : ""}`;
    renderCRM({
      boardElement,
      chat: buildChatViewModel(),
      prospects: getVisibleCRMProspects(),
      onAddProspect: handleAddCRMProspect,
      onBackChatList: handleBackChatList,
      onCreateChatGroup: handleCreateChatGroup,
      onOpenChatConversation: handleOpenChatConversation,
      onOpenProspect: handleOpenCRMProspect,
      onSendChatMessage: handleSendChatMessage,
      onShowChatGroupForm: handleShowChatGroupForm,
      onUpdateChatDraft: handleUpdateChatDraft
    });
    return;
  }

  boardElement.className = "board";
  renderBoard({
    boardElement,
    chartCards: state.chartCards,
    chat: buildChatViewModel(),
    columns: state.columns,
    taskEvents: state.taskEvents,
    teamMembers: getAssignableTeamMembers(),
    tasks: state.tasks,
    visibleTasks: getVisibleTasks(),
    onAddTask: handleAddTask,
    onBackChatList: handleBackChatList,
    onCreateChatGroup: handleCreateChatGroup,
    onOpenChatConversation: handleOpenChatConversation,
    onOpenTask: handleOpenTask,
    onMoveCard: handleMoveCard,
    onSendChatMessage: handleSendChatMessage,
    onShowChatGroupForm: handleShowChatGroupForm,
    onUpdateChatDraft: handleUpdateChatDraft,
    onUpdateChartCard: handleUpdateChartCard
  });
}

function updateSectionState() {
  if (isGuestAccount()) {
    state.activeSection = SECTION_BOARD;
    state.chat.isOpen = false;
  }

  const section = normalizeSection(state.activeSection);
  document.body.dataset.section = section;

  if (crmSectionToggle) {
    crmSectionToggle.textContent = section === SECTION_CRM ? "Tablero" : "CRM";
    crmSectionToggle.setAttribute(
      "aria-label",
      section === SECTION_CRM ? "Volver al tablero" : "Abrir CRM"
    );
  }

  if (localBoardDelete) {
    localBoardDelete.textContent = "Eliminar datos locales";
  }
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

function initGuestMenu() {
  if (!guestMenuToggle) {
    return;
  }

  guestMenuToggle.addEventListener("click", openGuestModal);
}

function initFilterMenu() {
  if (!filterMenuToggle) {
    return;
  }

  filterMenuToggle.addEventListener("click", openFilterModal);
}

function initCRMSectionToggle() {
  if (!crmSectionToggle) {
    return;
  }

  crmSectionToggle.addEventListener("click", () => {
    if (isGuestAccount()) {
      return;
    }

    const nextSection = state.activeSection === SECTION_CRM ? SECTION_BOARD : SECTION_CRM;
    state.activeSection = nextSection;
    closeProjectModal({ clearRoot: false });
    closeTeamModal({ clearRoot: false });
    closeFilterModal({ clearRoot: false });
    closeSideMenu();
    persistActiveSectionPreference(nextSection);
    render();
  });
}

function initChatMenu() {
  if (!chatMenuToggle) {
    return;
  }

  chatMenuToggle.addEventListener("click", async () => {
    if (!state.chat.isEnabled) {
      return;
    }

    state.chat.isOpen = !state.chat.isOpen;
    state.chat.view = state.chat.isOpen ? state.chat.view || "list" : "list";
    state.chat.error = "";
    updateChatButton();
    render();

    if (state.chat.isOpen && state.chat.snapshot.conversations.length === 0) {
      await refreshChatSnapshot();
    }
  });
}

function initAccountMenu() {
  initAccountModal({
    beforeOpen: () => {
      closeProjectModal({ clearRoot: false });
      closeTeamModal({ clearRoot: false });
      closeFilterModal({ clearRoot: false });
      closeSideMenu();
    },
    button: accountMenuToggle,
    isConfigured: canUseAccounts,
    getAccountState: () => state.account,
    onCompleteMemberPassword: handleCompleteMemberPassword,
    onCreateAccount: handleCreateOwnerAccount,
    onLogin: handleLoginOwnerAccount,
    onLoginGuest: handleLoginGuestAccount,
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

function normalizeSection(section) {
  return section === SECTION_CRM ? SECTION_CRM : SECTION_BOARD;
}

function getStoredSectionPreference(preferences = {}) {
  if (!preferences || typeof preferences !== "object") {
    return null;
  }

  const section = preferences[SECTION_PREFERENCE_KEY];
  if (section === SECTION_BOARD || section === SECTION_CRM) {
    return section;
  }

  return null;
}

function getSectionPreferenceMetaKey(userId) {
  return `${SECTION_PREFERENCE_META_PREFIX}:${userId}`;
}

async function getLocalSectionPreference(userId) {
  if (!userId) {
    return null;
  }

  const section = await getMetaValue(getSectionPreferenceMetaKey(userId));
  return section === SECTION_BOARD || section === SECTION_CRM ? section : null;
}

async function saveLocalSectionPreference(section, userId = state.account?.userId) {
  if (!userId) {
    return;
  }

  await setMetaValue(getSectionPreferenceMetaKey(userId), normalizeSection(section));
}

async function applyAuthenticatedSectionPreference(result) {
  if ((result.accountType || "") === "guest") {
    state.activeSection = SECTION_BOARD;
    return;
  }

  const userId = result?.user?.id;
  if (!userId) {
    return;
  }

  const cloudSection = getStoredSectionPreference(result.uiPreferences);
  const localSection = await getLocalSectionPreference(userId);
  const nextSection = cloudSection || localSection || normalizeSection(state.activeSection);

  state.activeSection = nextSection;
  await saveLocalSectionPreference(nextSection, userId);

  if (!cloudSection) {
    await saveCloudSectionPreference(nextSection).catch((error) => {
      console.warn("No se pudo guardar la sección inicial.", error);
    });
  }
}

function persistActiveSectionPreference(section) {
  if (isGuestAccount()) {
    return;
  }

  const nextSection = normalizeSection(section);
  const userId = state.account?.userId;

  if (!userId) {
    return;
  }

  saveLocalSectionPreference(nextSection, userId).catch((error) => {
    console.warn("No se pudo guardar la sección local.", error);
  });
  saveCloudSectionPreference(nextSection).catch((error) => {
    console.warn("No se pudo guardar la sección en la nube.", error);
  });
}

async function saveCloudSectionPreference(section) {
  if (!state.account?.userId || !canUseAccounts() || isGuestAccount()) {
    return null;
  }

  const supabase = await getSupabaseClient();
  const preferences = await saveProfileUIPreference({
    key: SECTION_PREFERENCE_KEY,
    supabase,
    value: normalizeSection(section)
  });

  state.account.uiPreferences = preferences;
  return preferences;
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

async function handleLoginGuestAccount({ nickname, password }) {
  const backup = await exportBoardSnapshot();
  await saveAnonymousBackup(backup);

  const result = await loginGuestAccount({
    nickname,
    password
  });

  if (result.status === "authenticated") {
    state.activeSection = SECTION_BOARD;
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
    uiPreferences: result.uiPreferences || {},
    userId: result.user?.id || "",
    boardId: result.cloud?.boardId || "",
    workspaceId: result.cloud?.workspaceId || "",
    guestId: result.guestId || result.cloud?.guest?.id || ""
  };
  state.ownerProfile = getAuthenticatedOwnerProfile(result);
  if (isGuestAccount()) {
    state.activeSection = SECTION_BOARD;
    state.guests = [];
    await stopCloudSyncSession();
    await stopChatSession();
    startGuestRefreshSession();
    setSyncStatus("synced");
    updateAccountButton();
    return;
  }

  stopGuestRefreshSession();
  await applyAuthenticatedSectionPreference(result);
  await cleanupOwnerLocalResponsible();
  if (isOwnerAccount()) {
    await refreshGuests();
  } else {
    state.guests = [];
  }
  updateAccountButton();
  await startCloudSyncSession({
    boardId: result.cloud.boardId,
    clientId,
    userId: result.user.id,
    workspaceId: result.cloud.workspaceId
  });
  await startChatSession({
    boardId: result.cloud.boardId,
    workspaceId: result.cloud.workspaceId
  });
}

async function handleLogoutOwnerAccount() {
  await signOutOwnerAccount();
  await stopCloudSyncSession();
  await stopChatSession();
  stopGuestRefreshSession();
  await resetLocalBoardAfterLogout();
  await reloadBoardState();
  state.account = null;
  state.ownerProfile = null;
  state.guests = [];
  state.activeSection = SECTION_BOARD;
  updateAccountButton();
  updateChatButton();
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

async function handleDeleteLocalBoard() {
  if (!localBoardDelete || state.account?.userId) {
    return;
  }

  const confirmed = window.confirm(
    "¿Eliminar todos los datos locales de este navegador? Se borrarán tablero, CRM y cachés locales. Esta acción no se puede deshacer."
  );

  if (!confirmed) {
    return;
  }

  localBoardDelete.disabled = true;

  try {
    closeProjectModal({ clearRoot: false });
    closeTeamModal({ clearRoot: false });
    closeFilterModal({ clearRoot: false });
    await resetLocalBoardAfterLogout();
    await reloadBoardState();
    state.filters = {
      crmStatus: "all",
      project: "all",
      responsible: "all"
    };
    state.activeSection = SECTION_BOARD;
    setSyncStatus("local");
    closeSideMenu();
    render();
  } finally {
    localBoardDelete.disabled = false;
  }
}

function updateAccountButton() {
  const label = accountMenuToggle?.querySelector(".account-menu-label");
  const isAuthenticated = Boolean(state.account?.userId);
  const isGuest = isGuestAccount();
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

  if (localBoardActions) {
    localBoardActions.hidden = isAuthenticated;
  }

  if (crmSectionToggle) {
    crmSectionToggle.hidden = isGuest;
  }

  if (filterMenuToggle) {
    filterMenuToggle.hidden = isGuest;
  }

  if (projectMenuToggle) {
    projectMenuToggle.hidden = isGuest;
  }

  if (teamMenuToggle) {
    teamMenuToggle.hidden = isGuest;
  }

  if (guestMenuToggle) {
    guestMenuToggle.hidden = !isOwnerAccount();
  }

  if (themeToggle) {
    themeToggle.hidden = isGuest;
  }

  if (syncStatus) {
    syncStatus.hidden = isGuest;
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

  updateChatButton();
}

function getAccountTypeLabel() {
  if (state.account?.accountType === "guest") {
    return state.account.nickname ? `Invitado @${state.account.nickname}` : "Invitado";
  }

  if (state.account?.accountType === "member") {
    return state.account.nickname ? `Miembro @${state.account.nickname}` : "Miembro";
  }

  return "Cuenta maestra";
}

function updateChatButton() {
  if (!chatMenuToggle) {
    return;
  }

  const enabled = Boolean(state.account?.userId && state.chat.isEnabled && !isGuestAccount());
  const unreadCount = enabled ? buildChatViewModel().totalUnread : 0;
  const showUnread = Boolean(enabled && !state.chat.isOpen && unreadCount > 0);

  chatMenuToggle.hidden = !enabled;
  chatMenuToggle.dataset.open = String(Boolean(enabled && state.chat.isOpen));
  chatMenuToggle.dataset.unread = String(showUnread);
  chatMenuToggle.setAttribute("aria-expanded", String(Boolean(enabled && state.chat.isOpen)));
  chatMenuToggle.setAttribute(
    "aria-label",
    showUnread ? `Chat, ${unreadCount} mensajes pendientes` : "Chat"
  );

  if (chatMenuUnread) {
    chatMenuUnread.hidden = !showUnread;
    chatMenuUnread.textContent = showUnread ? formatUnreadBadgeCount(unreadCount) : "";
  }
}

function formatUnreadBadgeCount(count) {
  if (count > 99) {
    return "99+";
  }
  return String(count);
}

async function startChatSession({ boardId, workspaceId }) {
  state.chat = {
    ...state.chat,
    activeConversationId: "",
    boardId,
    drafts: state.chat.drafts || {},
    error: "",
    groupDraftOpen: false,
    isEnabled: true,
    isLoading: true,
    isOpen: false,
    view: "list",
    workspaceId
  };
  updateChatButton();

  const cachedSnapshot = await getCachedChatSnapshot();
  state.chat.snapshot = {
    ...state.chat.snapshot,
    ...cachedSnapshot,
    currentUserId: state.account?.userId || cachedSnapshot.currentUserId || ""
  };

  await startChatRealtime({
    boardId,
    onChange: scheduleChatRefresh
  });
  await refreshChatSnapshot();
}

async function stopChatSession() {
  clearTimeout(chatRefreshTimer);
  clearTimeout(chatMarkReadTimer);
  await stopChatRealtime();
  await clearChatSnapshot();
  state.chat = {
    activeConversationId: "",
    drafts: {},
    error: "",
    groupDraftOpen: false,
    isEnabled: false,
    isLoading: false,
    isOpen: false,
    snapshot: {
      attachments: [],
      canCreateGroups: false,
      conversations: [],
      currentUserId: "",
      directory: [],
      messages: [],
      participants: []
    },
    view: "list"
  };
}

function scheduleChatRefresh() {
  if (!state.chat.isEnabled) {
    return;
  }

  clearTimeout(chatRefreshTimer);
  chatRefreshTimer = window.setTimeout(() => refreshChatSnapshot({ silent: true }), 250);
}

async function refreshChatSnapshot({ silent = false } = {}) {
  if (!state.chat.isEnabled || !state.chat.boardId) {
    return;
  }

  if (!silent) {
    state.chat.isLoading = true;
  }
  state.chat.error = "";
  updateChatButton();

  try {
    const result = await bootstrapChat({
      boardId: state.chat.boardId,
      clientId
    });
    await applyChatSnapshot(result.snapshot);
  } catch (error) {
    state.chat.error = error.message || "No se pudo actualizar el chat.";
  } finally {
    if (!silent) {
      state.chat.isLoading = false;
    }
    updateChatButton();
    render();
  }
}

async function applyChatSnapshot(snapshot = {}) {
  state.chat.snapshot = {
    attachments: Array.isArray(snapshot.attachments) ? snapshot.attachments : [],
    canCreateGroups: Boolean(snapshot.canCreateGroups),
    conversations: Array.isArray(snapshot.conversations) ? snapshot.conversations : [],
    currentUserId: snapshot.currentUserId || state.account?.userId || "",
    directory: Array.isArray(snapshot.directory) ? snapshot.directory : [],
    messages: Array.isArray(snapshot.messages) ? snapshot.messages : [],
    participants: Array.isArray(snapshot.participants) ? snapshot.participants : []
  };
  await importChatSnapshot(state.chat.snapshot);

  if (state.chat.view === "conversation" && activeChatHasUnread()) {
    scheduleMarkActiveChatRead();
  }
}

function buildChatViewModel() {
  const snapshot = state.chat.snapshot;
  const currentUserId = state.account?.userId || snapshot.currentUserId || "";
  const conversations = Array.isArray(snapshot.conversations) ? snapshot.conversations : [];
  const participants = Array.isArray(snapshot.participants) ? snapshot.participants : [];
  const messages = Array.isArray(snapshot.messages) ? snapshot.messages : [];
  const attachments = Array.isArray(snapshot.attachments) ? snapshot.attachments : [];
  const directory = (Array.isArray(snapshot.directory) ? snapshot.directory : []).filter((member) => member.userId);
  const activeConversation = conversations.find((conversation) => conversation.id === state.chat.activeConversationId) || null;
  const items = buildChatListItems({
    conversations,
    currentUserId,
    directory,
    messages,
    participants
  });
  const activeMessages = activeConversation
    ? messages
      .filter((message) => message.conversationId === activeConversation.id)
      .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
    : [];
  const attachmentsByMessage = attachments.reduce((map, attachment) => {
    if (!map.has(attachment.messageId)) {
      map.set(attachment.messageId, []);
    }
    map.get(attachment.messageId).push(attachment);
    return map;
  }, new Map());

  return {
    activeConversation,
    activeMessages,
    attachmentsByMessage,
    canCreateGroups: Boolean(snapshot.canCreateGroups),
    currentUserId,
    directory,
    error: state.chat.error,
    groupDraftOpen: state.chat.groupDraftOpen,
    isEnabled: state.chat.isEnabled,
    isLoading: state.chat.isLoading,
    isOpen: state.chat.isOpen,
    items,
    participants,
    draftBody: activeConversation ? state.chat.drafts?.[activeConversation.id] || "" : "",
    totalUnread: items.reduce((sum, item) => sum + (item.unreadCount || 0), 0),
    view: state.chat.view
  };
}

function buildChatListItems({ conversations, currentUserId, directory, messages, participants }) {
  const items = [];
  const unreadByConversation = getUnreadCounts({ currentUserId, messages, participants });
  const general = conversations.find((conversation) => conversation.type === "general");

  if (general) {
    items.push({
      conversation: general,
      conversationId: general.id,
      kind: "conversation",
      locked: !general.isParticipant,
      meta: "Todos los integrantes",
      title: "General",
      type: "general",
      unreadCount: unreadByConversation.get(general.id) || 0
    });
  }

  const directByUserId = getDirectConversationByTargetUser({
    conversations,
    currentUserId,
    participants
  });
  directory
    .filter((member) => member.userId !== currentUserId)
    .forEach((member) => {
      const direct = directByUserId.get(member.userId);
      items.push({
        conversation: direct || null,
        conversationId: direct?.id || "",
        kind: direct ? "conversation" : "direct",
        locked: false,
        meta: member.role === "owner" ? "Cuenta maestra" : "Miembro",
        targetUserId: member.userId,
        title: member.nickname ? `@${member.nickname}` : member.displayName,
        type: "direct",
        unreadCount: direct ? unreadByConversation.get(direct.id) || 0 : 0
      });
    });

  conversations
    .filter((conversation) => conversation.type === "group")
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .forEach((conversation) => {
      const groupParticipants = participants.filter(
        (participant) => participant.conversationId === conversation.id && participant.isActive
      );
      items.push({
        conversation,
        conversationId: conversation.id,
        kind: "conversation",
        locked: !conversation.isParticipant,
        meta: conversation.isParticipant
          ? `${groupParticipants.length} integrantes`
          : "Grupo creado, sin acceso a mensajes",
        title: conversation.title || "Grupo",
        type: "group",
        unreadCount: conversation.isParticipant ? unreadByConversation.get(conversation.id) || 0 : 0
      });
    });

  return items;
}

function getUnreadCounts({ currentUserId, messages, participants }) {
  const currentParticipants = new Map(
    participants
      .filter((participant) => participant.userId === currentUserId && participant.isActive)
      .map((participant) => [participant.conversationId, participant])
  );
  const counts = new Map();

  messages.forEach((message) => {
    if (message.senderUserId === currentUserId) {
      return;
    }

    const participant = currentParticipants.get(message.conversationId);
    if (!participant) {
      return;
    }

    const lastReadTime = participant.lastReadAt ? new Date(participant.lastReadAt).getTime() : 0;
    const messageTime = new Date(message.createdAt).getTime();
    if (Number.isFinite(messageTime) && messageTime > lastReadTime) {
      counts.set(message.conversationId, (counts.get(message.conversationId) || 0) + 1);
    }
  });

  return counts;
}

function getDirectConversationByTargetUser({ conversations, currentUserId, participants }) {
  const map = new Map();
  conversations
    .filter((conversation) => conversation.type === "direct")
    .forEach((conversation) => {
      const memberIds = participants
        .filter((participant) => participant.conversationId === conversation.id && participant.isActive)
        .map((participant) => participant.userId);
      const targetUserId = memberIds.find((userId) => userId !== currentUserId);
      if (targetUserId) {
        map.set(targetUserId, conversation);
      }
    });
  return map;
}

function getActiveChatConversation() {
  return state.chat.snapshot.conversations.find(
    (conversation) => conversation.id === state.chat.activeConversationId
  ) || null;
}

function activeChatHasUnread() {
  const conversation = getActiveChatConversation();
  if (!conversation?.isParticipant) {
    return false;
  }

  const counts = getUnreadCounts({
    currentUserId: state.account?.userId || state.chat.snapshot.currentUserId || "",
    messages: Array.isArray(state.chat.snapshot.messages) ? state.chat.snapshot.messages : [],
    participants: Array.isArray(state.chat.snapshot.participants) ? state.chat.snapshot.participants : []
  });

  return (counts.get(conversation.id) || 0) > 0;
}

function handleUpdateChatDraft(body) {
  const conversation = getActiveChatConversation();
  if (!conversation) {
    return;
  }

  state.chat.drafts = {
    ...(state.chat.drafts || {}),
    [conversation.id]: String(body || "")
  };
}

async function handleOpenChatConversation(item) {
  if (!state.chat.isEnabled) {
    return;
  }

  state.chat.error = "";

  try {
    if (item.kind === "direct" && item.targetUserId) {
      state.chat.isLoading = true;
      render();
      const result = await ensureDirectConversation({
        boardId: state.chat.boardId,
        clientId,
        targetUserId: item.targetUserId
      });
      await applyChatSnapshot(result.snapshot);
      state.chat.activeConversationId = result.conversationId;
    } else if (item.conversationId) {
      state.chat.activeConversationId = item.conversationId;
    }

    state.chat.groupDraftOpen = false;
    state.chat.view = "conversation";
    scheduleMarkActiveChatRead();
  } catch (error) {
    state.chat.error = error.message || "No se pudo abrir el chat.";
  } finally {
    state.chat.isLoading = false;
    render();
  }
}

function handleBackChatList() {
  state.chat.view = "list";
  state.chat.activeConversationId = "";
  state.chat.groupDraftOpen = false;
  state.chat.error = "";
  render();
}

function handleShowChatGroupForm(show) {
  state.chat.groupDraftOpen = Boolean(show);
  state.chat.error = "";
  render();
}

async function handleCreateChatGroup({ includeCurrentUser, participantUserIds, title }) {
  const selectedIds = new Set(participantUserIds || []);
  if (includeCurrentUser && state.account?.userId) {
    selectedIds.add(state.account.userId);
  }

  try {
    state.chat.isLoading = true;
    render();
    const result = await createChatGroup({
      boardId: state.chat.boardId,
      clientId,
      participantUserIds: [...selectedIds],
      title
    });
    await applyChatSnapshot(result.snapshot);
    state.chat.activeConversationId = result.conversationId;
    state.chat.groupDraftOpen = false;
    state.chat.view = "conversation";
    scheduleMarkActiveChatRead();
  } catch (error) {
    state.chat.error = error.message || "No se pudo crear el grupo.";
  } finally {
    state.chat.isLoading = false;
    render();
  }
}

async function handleSendChatMessage({ body, files }) {
  const conversation = getActiveChatConversation();
  if (!conversation) {
    return false;
  }

  const messageBody = String(body || "");
  const selectedFiles = [...(files || [])];
  if (!messageBody.trim() && selectedFiles.length === 0) {
    return false;
  }

  const isTextOnly = selectedFiles.length === 0;
  const messageId = createId("chat_message");
  const createdAt = new Date().toISOString();
  let optimisticMessage = null;

  try {
    state.chat.error = "";
    state.chat.drafts = {
      ...(state.chat.drafts || {}),
      [conversation.id]: ""
    };

    if (isTextOnly) {
      optimisticMessage = createOptimisticChatMessage({
        body: messageBody,
        conversation,
        createdAt,
        messageId
      });
      upsertChatMessage(optimisticMessage);
    }

    render();
    const result = await sendChatMessage({
      account: state.account,
      boardId: state.chat.boardId,
      body: messageBody,
      clientId,
      conversation,
      createdAt,
      files: selectedFiles,
      messageId,
      workspaceId: state.chat.workspaceId
    });

    if (result?.message) {
      upsertChatMessage(result.message);
    }
    if (result?.attachments?.length) {
      upsertChatAttachments(result.attachments);
    }
    await importChatSnapshot(state.chat.snapshot);
    render();
    scheduleChatRefresh();
    scheduleMarkActiveChatRead();
    return true;
  } catch (error) {
    if (optimisticMessage) {
      removeChatMessage(optimisticMessage.id);
    }
    state.chat.drafts = {
      ...(state.chat.drafts || {}),
      [conversation.id]: messageBody
    };
    state.chat.error = error.message || "No se pudo enviar el mensaje.";
    render();
    return false;
  }
}

function createOptimisticChatMessage({ body, conversation, createdAt, messageId }) {
  return {
    boardId: state.chat.boardId,
    body: String(body || "").trim(),
    clientId,
    conversationId: conversation.id,
    createdAt,
    deletedAt: "",
    id: messageId,
    messageType: "text",
    metadata: { pending: true },
    senderNicknameSnapshot: state.account?.nickname || state.account?.displayName || "Cuenta",
    senderTeamMemberId: state.account?.teamMemberId || "",
    senderUserId: state.account?.userId || "",
    updatedAt: createdAt,
    workspaceId: state.chat.workspaceId
  };
}

function upsertChatMessage(message) {
  const messages = Array.isArray(state.chat.snapshot.messages) ? [...state.chat.snapshot.messages] : [];
  const index = messages.findIndex((item) => item.id === message.id);
  if (index >= 0) {
    messages[index] = message;
  } else {
    messages.push(message);
  }

  state.chat.snapshot = {
    ...state.chat.snapshot,
    messages
  };
}

function removeChatMessage(messageId) {
  state.chat.snapshot = {
    ...state.chat.snapshot,
    messages: (state.chat.snapshot.messages || []).filter((message) => message.id !== messageId)
  };
}

function upsertChatAttachments(attachments = []) {
  const existing = new Map((state.chat.snapshot.attachments || []).map((attachment) => [attachment.id, attachment]));
  attachments.forEach((attachment) => {
    existing.set(attachment.id, attachment);
  });
  state.chat.snapshot = {
    ...state.chat.snapshot,
    attachments: [...existing.values()]
  };
}

function scheduleMarkActiveChatRead() {
  const conversation = getActiveChatConversation();
  if (!conversation?.isParticipant || !activeChatHasUnread()) {
    return;
  }

  clearTimeout(chatMarkReadTimer);
  chatMarkReadTimer = window.setTimeout(async () => {
    try {
      const result = await markChatRead({
        boardId: state.chat.boardId,
        clientId,
        conversationId: conversation.id
      });
      if (result?.snapshot) {
        await applyChatSnapshot(result.snapshot);
        render();
      }
    } catch {
      // Read markers should not interrupt chat usage.
    }
  }, 500);
}

async function handleRemoteSnapshot(snapshot) {
  if (isGuestAccount()) {
    return;
  }

  await importBoardSnapshot(snapshot);
  await reloadBoardState();
  if (state.chat.isEnabled) {
    scheduleChatRefresh();
  }
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
  if (isGuestAccount()) {
    return;
  }

  const root = document.querySelector("#modal-root");
  if (!root) {
    return;
  }

  closeProjectModal({ clearRoot: false });
  closeTeamModal({ clearRoot: false });
  closeGuestModal({ clearRoot: false });
  closeFilterModal({ clearRoot: false });
  closeSideMenu();
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
  editingProjectId = "";

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

  if (state.projects.length === 0) {
    const item = document.createElement("li");
    item.className = "project-list-item is-empty";
    item.textContent = "Sin proyectos todavía";
    list.append(item);
  }

  state.projects.forEach((project) => {
    list.append(createProjectListItem(project));
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
    const editableInput = nextBody.querySelector("[data-project-edit-input]");
    const createInput = nextBody.querySelector("[data-project-create-input]");
    (editableInput || createInput)?.focus({ preventScroll: true });
    editableInput?.select?.();
  });
}

function createProjectListItem(project) {
  const item = document.createElement("li");
  item.className = "project-list-item project-management-item";

  if (editingProjectId === project.id) {
    const form = document.createElement("form");
    form.className = "project-edit-form";
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const input = form.querySelector("[data-project-edit-input]");
      await handleUpdateProject(project.id, input.value);
    });

    const input = document.createElement("input");
    input.className = "project-create-input project-edit-input";
    input.dataset.projectEditInput = "true";
    input.type = "text";
    input.value = project.name;

    const actions = document.createElement("div");
    actions.className = "project-item-actions";

    const saveButton = document.createElement("button");
    saveButton.className = "project-create-button project-save-button";
    saveButton.type = "submit";
    saveButton.textContent = "Guardar";

    const cancelButton = document.createElement("button");
    cancelButton.className = "project-secondary-button";
    cancelButton.type = "button";
    cancelButton.textContent = "Cancelar";
    cancelButton.addEventListener("click", () => {
      editingProjectId = "";
      renderProjectModalBody();
    });

    actions.append(saveButton, cancelButton);
    form.append(input, actions);
    item.append(form);
    return item;
  }

  const name = document.createElement("span");
  name.className = "project-item-name";
  name.textContent = project.name;

  const actions = document.createElement("div");
  actions.className = "project-item-actions";

  const editButton = document.createElement("button");
  editButton.className = "project-secondary-button";
  editButton.type = "button";
  editButton.textContent = "Editar";
  editButton.addEventListener("click", () => {
    editingProjectId = project.id;
    renderProjectModalBody();
  });

  const deleteButton = document.createElement("button");
  deleteButton.className = "project-danger-button";
  deleteButton.type = "button";
  deleteButton.textContent = "Eliminar";
  deleteButton.addEventListener("click", () => handleDeleteProject(project.id));

  actions.append(editButton, deleteButton);
  item.append(name, actions);
  return item;
}

async function handleCreateProject(value) {
  const name = normalizeProjectName(value);

  if (!name) {
    renderProjectModalBody("Escribe un nombre de proyecto.");
    return null;
  }

  if (isReservedProjectName(name)) {
    renderProjectModalBody(`"${UNASSIGNED_PROJECT_NAME}" está reservado para tareas sin proyecto.`);
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

async function handleUpdateProject(projectId, value) {
  const project = state.projects.find((item) => item.id === projectId);
  const name = normalizeProjectName(value);

  if (!project) {
    renderProjectModalBody("No encontramos ese proyecto.");
    return;
  }

  if (!name) {
    renderProjectModalBody("Escribe un nombre de proyecto.");
    return;
  }

  if (isReservedProjectName(name)) {
    renderProjectModalBody(`"${UNASSIGNED_PROJECT_NAME}" está reservado para tareas sin proyecto.`);
    return;
  }

  if (projectNameExists(name, projectId)) {
    renderProjectModalBody("Ese proyecto ya existe.");
    return;
  }

  if (project.name === name) {
    editingProjectId = "";
    renderProjectModalBody();
    return;
  }

  const now = new Date().toISOString();
  const updatedProject = {
    ...project,
    name,
    updatedAt: now
  };
  const previousProjects = state.projects;
  const previousTasks = state.tasks;
  const nextProjects = sortByOrder(
    state.projects.map((item) => item.id === projectId ? updatedProject : item)
  );
  const nextTasks = state.tasks.map((task) => {
    if (!isSameProjectName(task.project, project.name)) {
      return task;
    }

    return {
      ...task,
      project: name,
      folio: updateFolioProjectName(task.folio, name),
      updatedAt: now
    };
  });
  const changedTasks = nextTasks.filter((task) => {
    const previousTask = state.tasks.find((item) => item.id === task.id);
    return previousTask && (previousTask.project !== task.project || previousTask.folio !== task.folio);
  });

  try {
    state.projects = await saveProjects(nextProjects);
    state.tasks = sortByOrder(await saveTaskOrder(nextTasks));
    await recordCloudMutation({
      critical: true,
      entity: updatedProject,
      entityId: updatedProject.id,
      entityType: "project",
      operation: "update",
      patch: { name: updatedProject.name, updatedAt: updatedProject.updatedAt }
    });

    for (const task of changedTasks) {
      const previousTask = previousTasks.find((item) => item.id === task.id);
      await recordCloudMutation({
        critical: true,
        entity: task,
        entityId: task.id,
        entityType: "task",
        operation: "update",
        patch: getTaskPatch(previousTask, task)
      });
      await recordTaskFieldEvents(previousTask, task);
    }

    editingProjectId = "";
    renderProjectModalBody("Proyecto actualizado.");
    render();
  } catch (error) {
    state.projects = previousProjects;
    state.tasks = previousTasks;
    await Promise.all([saveProjects(previousProjects), saveTaskOrder(previousTasks)]);
    renderProjectModalBody(error.message || "No se pudo actualizar el proyecto.");
    render();
  }
}

async function handleDeleteProject(projectId) {
  const project = state.projects.find((item) => item.id === projectId);

  if (!project) {
    renderProjectModalBody("No encontramos ese proyecto.");
    return;
  }

  if (!window.confirm(`¿Eliminar el proyecto "${project.name}"? Las tareas asignadas quedarán sin proyecto.`)) {
    return;
  }

  const now = new Date().toISOString();
  const previousProjects = state.projects;
  const previousTasks = state.tasks;
  const nextProjects = sortByOrder(
    state.projects
      .filter((item) => item.id !== projectId)
      .map((item, index) => ({
        ...item,
        order: index
      }))
  );
  const nextTasks = state.tasks.map((task) => {
    if (!isSameProjectName(task.project, project.name)) {
      return task;
    }

    return {
      ...task,
      project: UNASSIGNED_PROJECT_NAME,
      folio: updateFolioProjectName(task.folio, UNASSIGNED_PROJECT_NAME),
      updatedAt: now
    };
  });
  const changedTasks = nextTasks.filter((task) => {
    const previousTask = state.tasks.find((item) => item.id === task.id);
    return previousTask && previousTask.project !== task.project;
  });

  try {
    state.projects = await saveProjects(nextProjects);
    state.tasks = sortByOrder(await saveTaskOrder(nextTasks));
    await recordCloudMutation({
      critical: true,
      entityId: project.id,
      entityType: "project",
      operation: "delete",
      patch: { deletedAt: now }
    });

    for (const task of changedTasks) {
      const previousTask = previousTasks.find((item) => item.id === task.id);
      await recordCloudMutation({
        critical: true,
        entity: task,
        entityId: task.id,
        entityType: "task",
        operation: "update",
        patch: getTaskPatch(previousTask, task)
      });
      await recordTaskFieldEvents(previousTask, task);
    }

    editingProjectId = "";
    renderProjectModalBody("Proyecto eliminado. Las tareas quedaron sin proyecto.");
    render();
  } catch (error) {
    state.projects = previousProjects;
    state.tasks = previousTasks;
    await Promise.all([saveProjects(previousProjects), saveTaskOrder(previousTasks)]);
    renderProjectModalBody(error.message || "No se pudo eliminar el proyecto.");
    render();
  }
}

function openFilterModal() {
  if (isGuestAccount()) {
    return;
  }

  const root = document.querySelector("#modal-root");
  if (!root) {
    return;
  }

  closeProjectModal({ clearRoot: false });
  closeTeamModal({ clearRoot: false });
  closeFilterModal({ clearRoot: false });
  closeSideMenu();
  root.innerHTML = "";

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) {
      closeFilterModal();
    }
  });

  const modal = document.createElement("section");
  modal.className = "modal project-modal filter-modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-labelledby", "filter-modal-title");

  const shell = document.createElement("div");
  shell.className = "modal-form";
  shell.append(createFilterModalTopbar(), createFilterModalBody());

  modal.append(shell);
  overlay.append(modal);
  root.append(overlay);

  filterMenuToggle?.setAttribute("aria-expanded", "true");
  filterModalKeydownHandler = (event) => {
    if (event.key === "Escape") {
      closeFilterModal();
    }
  };
  document.addEventListener("keydown", filterModalKeydownHandler);

  requestAnimationFrame(() => {
    overlay.querySelector("[data-filter-crm-status-select], [data-filter-project-select]")?.focus({ preventScroll: true });
  });
}

function closeFilterModal(options = {}) {
  const { clearRoot = true } = options;

  if (filterModalKeydownHandler) {
    document.removeEventListener("keydown", filterModalKeydownHandler);
    filterModalKeydownHandler = null;
  }

  filterMenuToggle?.setAttribute("aria-expanded", "false");

  if (clearRoot) {
    const root = document.querySelector("#modal-root");
    if (root) {
      root.innerHTML = "";
    }
  }
}

function createFilterModalTopbar() {
  const topbar = document.createElement("div");
  topbar.className = "modal-topbar";

  const title = document.createElement("h2");
  title.id = "filter-modal-title";
  title.className = "modal-title";
  title.textContent = "Filtros";

  const closeButton = document.createElement("button");
  closeButton.className = "close-button";
  closeButton.type = "button";
  closeButton.textContent = "×";
  closeButton.setAttribute("aria-label", "Cerrar modal de filtros");
  closeButton.addEventListener("click", closeFilterModal);

  topbar.append(title, closeButton);
  return topbar;
}

function createFilterModalBody() {
  const body = document.createElement("div");
  body.className = "filter-modal-body";

  if (state.activeSection === "crm") {
    const statusField = createFilterSelectField({
      id: "filter-crm-status",
      label: "Estatus",
      options: getCRMStatusFilterOptions(),
      selectDatasetKey: "filterCrmStatusSelect",
      value: getValidFilterValue(state.filters.crmStatus, getCRMStatusFilterOptions()),
      onChange: (value) => {
        state.filters = {
          ...state.filters,
          crmStatus: value
        };
        render();
      }
    });

    const actions = createFilterActions({
      onClear: () => {
        clearCRMFilters();
        closeFilterModal();
      }
    });

    body.append(statusField, actions);
    return body;
  }

  const projectField = createFilterSelectField({
    id: "filter-project",
    label: "Proyecto",
    options: getProjectFilterOptions(),
    selectDatasetKey: "filterProjectSelect",
    value: getValidFilterValue(state.filters.project, getProjectFilterOptions()),
    onChange: (value) => {
      state.filters = {
        ...state.filters,
        project: value
      };
      render();
    }
  });

  const responsibleField = createFilterSelectField({
    id: "filter-responsible",
    label: "Responsable",
    options: getResponsibleFilterOptions(),
    selectDatasetKey: "filterResponsibleSelect",
    value: getValidFilterValue(state.filters.responsible, getResponsibleFilterOptions()),
    onChange: (value) => {
      state.filters = {
        ...state.filters,
        responsible: value
      };
      render();
    }
  });

  const actions = createFilterActions({
    onClear: () => {
      clearBoardFilters();
      closeFilterModal();
    }
  });

  body.append(projectField, responsibleField, actions);
  return body;
}

function createFilterActions({ onClear }) {
  const actions = document.createElement("div");
  actions.className = "filter-actions";

  const clearButton = document.createElement("button");
  clearButton.className = "project-secondary-button";
  clearButton.type = "button";
  clearButton.textContent = "Limpiar";
  clearButton.addEventListener("click", onClear);

  const closeButton = document.createElement("button");
  closeButton.className = "project-create-button filter-done-button";
  closeButton.type = "button";
  closeButton.textContent = "Listo";
  closeButton.addEventListener("click", closeFilterModal);

  actions.append(clearButton, closeButton);
  return actions;
}

function createFilterSelectField({ id, label, onChange, options, selectDatasetKey, value }) {
  const field = document.createElement("label");
  field.className = "filter-field";
  field.htmlFor = id;

  const text = document.createElement("span");
  text.textContent = label;

  const select = document.createElement("select");
  select.id = id;
  select.dataset[selectDatasetKey] = "true";

  options.forEach((optionData) => {
    const option = document.createElement("option");
    option.value = optionData.value;
    option.textContent = optionData.label;
    select.append(option);
  });

  select.value = value;
  select.addEventListener("change", () => onChange(select.value));

  field.append(text, select);
  return field;
}

function getProjectFilterOptions() {
  const options = [{ label: "Todos los proyectos", value: "all" }];
  const seen = new Set(["all"]);

  const addOption = (name) => {
    const projectName = normalizeProjectName(name);
    const key = projectName.toLocaleLowerCase("es-MX");
    if (!projectName || seen.has(key)) {
      return;
    }

    seen.add(key);
    options.push({
      label: projectName,
      value: projectName
    });
  };

  state.projects.forEach((project) => addOption(project.name));
  state.tasks.forEach((task) => addOption(task.project));

  return options;
}

function getResponsibleFilterOptions() {
  const options = [{ label: "Todos los responsables", value: "all" }];
  const seen = new Set(["all"]);

  const addOption = (label, value) => {
    const normalizedValue = normalizeTeamMemberName(value);
    const key = normalizedValue.toLocaleLowerCase("es-MX");
    if (!normalizedValue || seen.has(key)) {
      return;
    }

    seen.add(key);
    options.push({
      label,
      value: normalizedValue
    });
  };

  addOption(DEFAULT_RESPONSIBLE_NAME, DEFAULT_RESPONSIBLE_NAME);
  getAssignableTeamMembers().forEach((teamMember) => {
    addOption(
      getResponsibleFilterLabel(teamMember),
      getResponsibleFilterValue(teamMember)
    );
  });
  state.tasks.forEach((task) => addOption(getTaskResponsibleFilterLabel(task.responsible), task.responsible));

  return options;
}

function getCRMStatusFilterOptions() {
  return [
    { label: "Todos los estatus", value: "all" },
    ...CRM_STATUSES.map((status) => ({
      label: status,
      value: status
    }))
  ];
}

function getResponsibleFilterValue(teamMember) {
  if (teamMember?.status !== "local" && teamMember?.nickname) {
    return teamMember.nickname;
  }

  return normalizeTeamMemberName(teamMember?.name);
}

function getResponsibleFilterLabel(teamMember) {
  if (teamMember?.status !== "local" && teamMember?.nickname) {
    return `@${teamMember.nickname}`;
  }

  return normalizeTeamMemberName(teamMember?.name);
}

function getTaskResponsibleFilterLabel(responsibleName) {
  const teamMember = findAssignableTeamMemberByResponsibleName(responsibleName);
  return teamMember ? getResponsibleFilterLabel(teamMember) : normalizeTeamMemberName(responsibleName);
}

function getValidFilterValue(value, options) {
  return options.some((option) => option.value === value) ? value : "all";
}

function clearBoardFilters() {
  state.filters = {
    ...state.filters,
    project: "all",
    responsible: "all"
  };
  render();
}

function normalizeBoardFilters() {
  state.filters = {
    ...state.filters,
    project: getValidFilterValue(state.filters.project, getProjectFilterOptions()),
    responsible: getValidFilterValue(state.filters.responsible, getResponsibleFilterOptions()),
    crmStatus: getValidFilterValue(state.filters.crmStatus, getCRMStatusFilterOptions())
  };
}

function clearCRMFilters() {
  state.filters = {
    ...state.filters,
    crmStatus: "all"
  };
  render();
}

function updateFilterButton() {
  if (!filterMenuToggle) {
    return;
  }

  const activeCount = getActiveFilterCount();
  const sectionLabel = state.activeSection === "crm" ? "CRM" : "tablero";
  filterMenuToggle.dataset.active = activeCount > 0 ? "true" : "false";
  filterMenuToggle.setAttribute(
    "aria-label",
    activeCount > 0 ? `Filtros activos en ${sectionLabel}: ${activeCount}` : `Abrir filtros de ${sectionLabel}`
  );
}

function getActiveFilterCount() {
  if (state.activeSection === "crm") {
    return Number(state.filters.crmStatus !== "all");
  }

  return Number(state.filters.project !== "all") + Number(state.filters.responsible !== "all");
}

function getVisibleTasks() {
  return state.tasks.filter((task) => matchesProjectFilter(task) && matchesResponsibleFilter(task));
}

function getVisibleCRMProspects() {
  return state.crmProspects.filter((prospect) => matchesCRMStatusFilter(prospect));
}

function matchesCRMStatusFilter(prospect) {
  if (state.filters.crmStatus === "all") {
    return true;
  }

  return prospect.status === state.filters.crmStatus;
}

function matchesProjectFilter(task) {
  if (state.filters.project === "all") {
    return true;
  }

  return isSameProjectName(task.project, state.filters.project);
}

function matchesResponsibleFilter(task) {
  if (state.filters.responsible === "all") {
    return true;
  }

  const selectedKeys = getResponsibleFilterKeys(state.filters.responsible);
  const taskKeys = getResponsibleFilterKeys(task.responsible);
  return [...selectedKeys].some((key) => taskKeys.has(key));
}

function getResponsibleFilterKeys(value) {
  const keys = new Set();
  const normalized = normalizeTeamMemberName(value).toLocaleLowerCase("es-MX");
  if (normalized) {
    keys.add(normalized);
  }

  const teamMember = findAssignableTeamMemberByResponsibleName(value);
  if (teamMember) {
    const name = normalizeTeamMemberName(teamMember.name).toLocaleLowerCase("es-MX");
    const nickname = normalizeNickname(teamMember.nickname);
    if (name) {
      keys.add(name);
    }
    if (nickname) {
      keys.add(nickname);
    }
  }

  return keys;
}

function findAssignableTeamMemberByResponsibleName(responsibleName) {
  const responsibleKey = normalizeTeamMemberName(responsibleName).toLocaleLowerCase("es-MX");
  if (!responsibleKey || responsibleKey === DEFAULT_RESPONSIBLE_NAME.toLocaleLowerCase("es-MX")) {
    return null;
  }

  return getAssignableTeamMembers().find((teamMember) => {
    const name = normalizeTeamMemberName(teamMember.name).toLocaleLowerCase("es-MX");
    const nickname = normalizeNickname(teamMember.nickname);
    return name === responsibleKey || nickname === responsibleKey;
  }) || null;
}

function openTeamModal() {
  if (isGuestAccount()) {
    return;
  }

  const root = document.querySelector("#modal-root");
  if (!root) {
    return;
  }

  closeProjectModal({ clearRoot: false });
  closeTeamModal({ clearRoot: false });
  closeFilterModal({ clearRoot: false });
  closeSideMenu();
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

function openGuestModal() {
  if (!isOwnerAccount()) {
    return;
  }

  const root = document.querySelector("#modal-root");
  if (!root) {
    return;
  }

  closeProjectModal({ clearRoot: false });
  closeTeamModal({ clearRoot: false });
  closeGuestModal({ clearRoot: false });
  closeFilterModal({ clearRoot: false });
  closeSideMenu();
  root.innerHTML = "";

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) {
      closeGuestModal();
    }
  });

  const modal = document.createElement("section");
  modal.className = "modal project-modal team-modal guest-modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-labelledby", "guest-modal-title");

  const shell = document.createElement("div");
  shell.className = "modal-form";
  shell.append(createGuestModalTopbar(), createGuestModalBody());

  modal.append(shell);
  overlay.append(modal);
  root.append(overlay);

  guestMenuToggle?.setAttribute("aria-expanded", "true");
  guestModalKeydownHandler = (event) => {
    if (event.key === "Escape") {
      closeGuestModal();
    }
  };
  document.addEventListener("keydown", guestModalKeydownHandler);

  requestAnimationFrame(() => {
    overlay.querySelector("[data-guest-create-input]")?.focus({ preventScroll: true });
  });
}

function closeGuestModal(options = {}) {
  const { clearRoot = true } = options;

  if (guestModalKeydownHandler) {
    document.removeEventListener("keydown", guestModalKeydownHandler);
    guestModalKeydownHandler = null;
  }

  guestMenuToggle?.setAttribute("aria-expanded", "false");
  expandedGuestId = "";

  if (clearRoot) {
    const root = document.querySelector("#modal-root");
    if (root) {
      root.innerHTML = "";
    }
  }
}

function createGuestModalTopbar() {
  const topbar = document.createElement("div");
  topbar.className = "modal-topbar";

  const title = document.createElement("h2");
  title.id = "guest-modal-title";
  title.className = "modal-title";
  title.textContent = "Invitados";

  const closeButton = document.createElement("button");
  closeButton.className = "close-button";
  closeButton.type = "button";
  closeButton.textContent = "×";
  closeButton.setAttribute("aria-label", "Cerrar modal de invitados");
  closeButton.addEventListener("click", closeGuestModal);

  topbar.append(title, closeButton);
  return topbar;
}

function createGuestModalBody(message = "", revealedKey = null) {
  const body = document.createElement("div");
  body.className = "project-modal-body team-modal-body guest-modal-body";
  body.dataset.guestModalBody = "true";

  body.append(createGuestListSection(revealedKey), createGuestCreateForm());

  const validation = document.createElement("div");
  validation.className = `project-menu-message${message ? " is-visible" : ""}`;
  validation.textContent = message;
  body.append(validation);
  return body;
}

function createGuestListSection(revealedKey) {
  const section = document.createElement("section");
  section.className = "team-list-section";

  const title = document.createElement("p");
  title.className = "project-list-title";
  title.textContent = "Invitados con acceso";

  const list = document.createElement("ul");
  list.className = "project-list team-list guest-list";

  if (state.guests.length === 0) {
    const emptyItem = document.createElement("li");
    emptyItem.className = "project-list-item is-empty";
    emptyItem.textContent = "Sin invitados todavía";
    list.append(emptyItem);
  } else {
    state.guests.forEach((guest) => {
      list.append(createGuestListItem(guest, revealedKey));
    });
  }

  section.append(title, list);
  return section;
}

function createGuestListItem(guest, revealedKey) {
  const item = document.createElement("li");
  item.className = "project-list-item team-list-item guest-list-item";

  const summary = document.createElement("div");
  summary.className = "team-member-summary";

  const copy = document.createElement("div");
  copy.className = "team-member-copy";

  const name = document.createElement("strong");
  name.textContent = guest.name || "Invitado";

  const meta = document.createElement("span");
  meta.textContent = getGuestMeta(guest);

  copy.append(name, meta);

  const actions = document.createElement("div");
  actions.className = "team-member-actions";

  const editButton = document.createElement("button");
  editButton.className = "small-button team-member-edit-button";
  editButton.type = "button";
  editButton.textContent = expandedGuestId === guest.id ? "Cerrar" : "Editar";
  editButton.addEventListener("click", () => {
    expandedGuestId = expandedGuestId === guest.id ? "" : guest.id;
    renderGuestModalBody();
  });

  actions.append(editButton);
  summary.append(copy, actions);
  item.append(summary);

  if (revealedKey?.guestId === guest.id) {
    const keyBox = document.createElement("div");
    keyBox.className = "member-key-callout guest-key-callout";
    keyBox.innerHTML = `<span>Clave de invitado</span><strong>${revealedKey.ownerKey}</strong>`;
    item.append(keyBox);
  }

  if (expandedGuestId === guest.id) {
    item.append(createGuestEditPanel(guest));
  }

  return item;
}

function createGuestEditPanel(guest) {
  const form = document.createElement("form");
  form.className = "team-member-edit-panel guest-edit-panel";
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    await handleUpdateGuestAccess({
      guestId: guest.id,
      name: formData.get("name"),
      nickname: formData.get("nickname"),
      projectIds: formData.getAll("projectIds"),
      status: formData.get("status")
    });
  });

  const nameInput = document.createElement("input");
  nameInput.name = "name";
  nameInput.type = "text";
  nameInput.value = guest.name || "";
  nameInput.placeholder = "Nombre";

  const nicknameInput = document.createElement("input");
  nicknameInput.name = "nickname";
  nicknameInput.type = "text";
  nicknameInput.value = guest.nickname || "";
  nicknameInput.placeholder = "nickname";
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
  statusSelect.value = guest.status === "inactive" ? "inactive" : "active";

  const fieldsRow = document.createElement("div");
  fieldsRow.className = "team-member-edit-fields";
  fieldsRow.append(nameInput, nicknameInput, statusSelect);

  const projects = createGuestProjectOptions(getGuestProjectIds(guest));

  const saveButton = document.createElement("button");
  saveButton.className = "save-task-button";
  saveButton.type = "submit";
  saveButton.textContent = "Guardar";

  const resetKeyButton = document.createElement("button");
  resetKeyButton.className = "small-button";
  resetKeyButton.type = "button";
  resetKeyButton.textContent = "Nueva clave";
  resetKeyButton.addEventListener("click", () => handleResetGuestKey(guest.id));

  const deleteButton = document.createElement("button");
  deleteButton.className = "small-button team-member-delete-button";
  deleteButton.type = "button";
  deleteButton.textContent = "Eliminar";
  deleteButton.hidden = guest.status !== "inactive" || statusSelect.value !== "inactive";
  deleteButton.addEventListener("click", () => handleDeleteCloudGuestAccess(guest));

  statusSelect.addEventListener("change", () => {
    deleteButton.hidden = guest.status !== "inactive" || statusSelect.value !== "inactive";
  });

  const actionsRow = document.createElement("div");
  actionsRow.className = "team-member-edit-actions";
  actionsRow.append(deleteButton, saveButton, resetKeyButton);

  form.append(fieldsRow, projects, actionsRow);
  return form;
}

function createGuestCreateForm() {
  const form = document.createElement("form");
  form.className = "team-access-create-form guest-create-form";
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    await handleCreateGuestAccess({
      name: formData.get("name"),
      nickname: formData.get("nickname"),
      projectIds: formData.getAll("projectIds")
    });
  });

  const input = document.createElement("input");
  input.className = "project-create-input";
  input.dataset.guestCreateInput = "true";
  input.name = "name";
  input.placeholder = "Nombre del invitado";
  input.type = "text";

  const nicknameInput = document.createElement("input");
  nicknameInput.className = "project-create-input";
  nicknameInput.name = "nickname";
  nicknameInput.placeholder = "nickname";
  nicknameInput.type = "text";
  nicknameInput.autocapitalize = "none";
  nicknameInput.spellcheck = false;

  const createButton = document.createElement("button");
  createButton.className = "project-create-button";
  createButton.type = "submit";
  createButton.textContent = "Crear invitado";

  form.append(input, nicknameInput, createGuestProjectOptions([]), createButton);
  return form;
}

function createGuestProjectOptions(selectedProjectIds = []) {
  const wrapper = document.createElement("div");
  wrapper.className = "guest-project-options";

  const label = document.createElement("p");
  label.className = "guest-project-options-title";
  label.textContent = "Proyectos visibles";
  wrapper.append(label);

  const selected = new Set(selectedProjectIds);
  if (state.projects.length === 0) {
    const empty = document.createElement("p");
    empty.className = "guest-project-empty";
    empty.textContent = "Crea al menos un proyecto para dar acceso.";
    wrapper.append(empty);
    return wrapper;
  }

  state.projects.forEach((project) => {
    const option = document.createElement("label");
    option.className = "guest-project-option";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.name = "projectIds";
    checkbox.value = project.id;
    checkbox.checked = selected.has(project.id);

    option.append(checkbox, document.createTextNode(project.name));
    wrapper.append(option);
  });

  return wrapper;
}

function renderGuestModalBody(message = "", revealedKey = null) {
  const currentBody = document.querySelector("[data-guest-modal-body]");
  if (!currentBody) {
    return;
  }

  const nextBody = createGuestModalBody(message, revealedKey);
  currentBody.replaceWith(nextBody);
}

async function refreshGuests() {
  if (!isOwnerAccount()) {
    state.guests = [];
    return;
  }

  const boardId = getCloudSyncContext()?.boardId || state.account?.boardId;
  if (!boardId) {
    state.guests = [];
    return;
  }

  try {
    const result = await listCloudGuests({ boardId });
    state.guests = Array.isArray(result.guests) ? result.guests : [];
  } catch (error) {
    console.warn("No se pudieron cargar invitados.", error);
    state.guests = [];
  }
}

function startGuestRefreshSession() {
  stopGuestRefreshSession();
  guestFocusRefreshHandler = () => refreshGuestSnapshot({ silent: true });
  window.addEventListener("focus", guestFocusRefreshHandler);
  guestRefreshInterval = window.setInterval(() => refreshGuestSnapshot({ silent: true }), 15000);
}

function stopGuestRefreshSession() {
  if (guestRefreshInterval) {
    window.clearInterval(guestRefreshInterval);
    guestRefreshInterval = null;
  }

  if (guestFocusRefreshHandler) {
    window.removeEventListener("focus", guestFocusRefreshHandler);
    guestFocusRefreshHandler = null;
  }
}

async function refreshGuestSnapshot({ silent = false } = {}) {
  if (!isGuestAccount()) {
    return;
  }

  try {
    if (!silent) {
      setSyncStatus("syncing");
    }
    const supabase = await getSupabaseClient();
    const cloud = await pullGuestBoardSnapshot({ supabase });
    await importBoardSnapshot(cloud.snapshot);
    await reloadBoardState();
    setSyncStatus("synced");
    render();
  } catch (error) {
    setSyncStatus("error", error.message);
  }
}

async function handleCreateGuestAccess({ name, nickname, projectIds }) {
  const normalizedName = normalizeTeamMemberName(name);
  const normalizedNickname = normalizeNickname(nickname);
  const selectedProjectIds = normalizeGuestProjectIds(projectIds);

  if (!normalizedName) {
    renderGuestModalBody("Escribe el nombre del invitado.");
    return;
  }

  if (!isValidMemberNickname(normalizedNickname)) {
    renderGuestModalBody("El nickname debe ir en minúsculas, sin espacios, mínimo 3 caracteres.");
    return;
  }

  if (guestNicknameExists(normalizedNickname)) {
    renderGuestModalBody("Ese nickname de invitado ya existe.");
    return;
  }

  if (selectedProjectIds.length === 0) {
    renderGuestModalBody("Selecciona al menos un proyecto.");
    return;
  }

  const boardId = getCloudSyncContext()?.boardId || state.account?.boardId;
  if (!boardId) {
    renderGuestModalBody("No encontramos el tablero cloud para crear el invitado.");
    return;
  }

  try {
    const result = await createCloudGuest({
      boardId,
      clientId,
      name: normalizedName,
      nickname: normalizedNickname,
      projectIds: selectedProjectIds
    });
    state.guests = upsertGuestList(result.guest);
    renderGuestModalBody("", {
      guestId: result.guest.id,
      ownerKey: result.guest.ownerKey
    });
  } catch (error) {
    renderGuestModalBody(error.message || "No se pudo crear el invitado.");
  }
}

async function handleUpdateGuestAccess({ guestId, name, nickname, projectIds, status }) {
  const normalizedName = normalizeTeamMemberName(name);
  const normalizedNickname = normalizeNickname(nickname);
  const selectedProjectIds = normalizeGuestProjectIds(projectIds);

  if (!normalizedName) {
    renderGuestModalBody("Escribe el nombre del invitado.");
    return;
  }

  if (!isValidMemberNickname(normalizedNickname)) {
    renderGuestModalBody("El nickname debe ir en minúsculas, sin espacios, mínimo 3 caracteres.");
    return;
  }

  if (guestNicknameExists(normalizedNickname, guestId)) {
    renderGuestModalBody("Ese nickname de invitado ya existe.");
    return;
  }

  if (selectedProjectIds.length === 0) {
    renderGuestModalBody("Selecciona al menos un proyecto.");
    return;
  }

  try {
    const result = await updateCloudGuest({
      clientId,
      guestId,
      name: normalizedName,
      nickname: normalizedNickname,
      projectIds: selectedProjectIds,
      status
    });
    state.guests = upsertGuestList(result.guest);
    renderGuestModalBody("Cambios guardados.");
  } catch (error) {
    renderGuestModalBody(error.message || "No se pudo actualizar el invitado.");
  }
}

async function handleResetGuestKey(guestId) {
  try {
    const result = await resetCloudGuestKey({ clientId, guestId });
    state.guests = upsertGuestList(result.guest);
    renderGuestModalBody("", {
      guestId,
      ownerKey: result.guest.ownerKey
    });
  } catch (error) {
    renderGuestModalBody(error.message || "No se pudo generar una nueva clave.");
  }
}

async function handleDeleteCloudGuestAccess(guest) {
  if (!guest || guest.status !== "inactive") {
    renderGuestModalBody("Primero guarda el invitado como inactivo.");
    return;
  }

  const displayName = guest.nickname ? `@${guest.nickname}` : guest.name;
  if (!window.confirm(`¿Eliminar el acceso de ${displayName}?`)) {
    return;
  }

  try {
    await deleteCloudGuest({ clientId, guestId: guest.id });
    state.guests = state.guests.filter((item) => item.id !== guest.id);
    expandedGuestId = "";
    renderGuestModalBody("Invitado eliminado.");
  } catch (error) {
    renderGuestModalBody(error.message || "No se pudo eliminar el invitado.");
  }
}

function upsertGuestList(nextGuest) {
  const existingIndex = state.guests.findIndex((guest) => guest.id === nextGuest.id);
  const guests = existingIndex >= 0
    ? state.guests.map((guest, index) => index === existingIndex ? nextGuest : guest)
    : [...state.guests, nextGuest];

  return guests.sort((a, b) => String(a.name).localeCompare(String(b.name), "es-MX"));
}

function normalizeGuestProjectIds(projectIds = []) {
  const validIds = new Set(state.projects.map((project) => project.id));
  return [...new Set(projectIds)].filter((projectId) => validIds.has(projectId));
}

function getGuestProjectIds(guest) {
  return Array.isArray(guest.projectIds)
    ? guest.projectIds
    : Array.isArray(guest.allowedProjectIds)
      ? guest.allowedProjectIds
      : [];
}

function getGuestMeta(guest) {
  const statusLabel = guest.status === "inactive" ? "Inactivo" : "Activo";
  const projectCount = getGuestProjectIds(guest).length;
  const projectLabel = projectCount === 1 ? "1 proyecto" : `${projectCount} proyectos`;
  return guest.nickname ? `@${guest.nickname} · ${statusLabel} · ${projectLabel}` : `${statusLabel} · ${projectLabel}`;
}

function guestNicknameExists(nickname, exceptGuestId = "") {
  return state.guests.some((guest) => guest.id !== exceptGuestId && guest.nickname === nickname);
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
  } else if (isMemberAccount()) {
    body.append(createOwnerReadOnlySection());
  }

  const accessMembers = state.teamMembers.filter((teamMember) => teamMember.status !== "local");
  const localResponsibles = state.teamMembers.filter((teamMember) => teamMember.status === "local");
  const visibleMembers = isMemberAccount()
    ? accessMembers.filter((teamMember) => teamMember.status === "active")
    : isOwnerAccount() ? accessMembers : localResponsibles;

  body.append(
    createTeamListSection({
      emptyLabel: isOwnerAccount() ? "Sin miembros con acceso todavía" : "Sin integrantes todavía",
      members: visibleMembers,
      revealedKey,
      title: getTeamModalTitle()
    })
  );

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

function createOwnerReadOnlySection() {
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

  const nickname = document.createElement("strong");
  nickname.textContent = getOwnerNicknameLabel();

  const meta = document.createElement("span");
  meta.textContent = "Cuenta maestra";

  copy.append(nickname, meta);
  summary.append(copy);
  card.append(summary);
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
  if (teamMember.status === "local") {
    item.classList.add("is-local-responsible");
  }

  const summary = document.createElement("div");
  summary.className = "team-member-summary";

  const copy = document.createElement("div");
  copy.className = "team-member-copy";

  const name = document.createElement("strong");
  name.textContent = getTeamMemberListName(teamMember);

  const meta = document.createElement("span");
  meta.textContent = getTeamMemberMeta(teamMember);

  copy.append(name, meta);
  summary.append(copy);

  const actions = document.createElement("div");
  actions.className = "team-member-actions";

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
    actions.append(editButton);
  }

  if (!isMemberAccount() && teamMember.status === "local") {
    const deleteButton = document.createElement("button");
    deleteButton.className = "small-button team-member-delete-button";
    deleteButton.type = "button";
    deleteButton.textContent = "Eliminar";
    deleteButton.addEventListener("click", () => handleDeleteLocalTeamMember(teamMember));
    actions.append(deleteButton);
  }

  if (actions.childElementCount > 0) {
    summary.append(actions);
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

  const deleteButton = document.createElement("button");
  deleteButton.className = "small-button team-member-delete-button";
  deleteButton.type = "button";
  deleteButton.textContent = "Eliminar";
  deleteButton.hidden = teamMember.status !== "inactive" || statusSelect.value !== "inactive";
  deleteButton.addEventListener("click", () => handleDeleteCloudTeamMember(teamMember));

  statusSelect.addEventListener("change", () => {
    deleteButton.hidden = teamMember.status !== "inactive" || statusSelect.value !== "inactive";
  });

  const fieldsRow = document.createElement("div");
  fieldsRow.className = "team-member-edit-fields";
  fieldsRow.append(nameInput, nicknameInput, statusSelect);

  const actionsRow = document.createElement("div");
  actionsRow.className = "team-member-edit-actions";
  actionsRow.append(deleteButton, saveButton, resetKeyButton);

  form.append(fieldsRow, actionsRow);
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
    state.ownerProfile = {
      displayName: nextDisplayName,
      nickname: result.account?.nickname || normalizedNickname,
      userId: state.account?.userId || ""
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

async function handleDeleteCloudTeamMember(teamMember) {
  if (!teamMember || teamMember.status === "local") {
    return;
  }

  if (teamMember.status !== "inactive") {
    renderTeamModalBody("Primero guarda el miembro como inactivo.");
    return;
  }

  const displayName = teamMember.nickname ? `@${teamMember.nickname}` : teamMember.name;
  if (!window.confirm(`¿Eliminar el acceso de ${displayName}?`)) {
    return;
  }

  try {
    await deleteCloudTeamMember({ clientId, teamMemberId: teamMember.id });
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
    expandedTeamMemberId = "";
    renderTeamModalBody("Miembro eliminado.");
    render();
  } catch (error) {
    renderTeamModalBody(error.message || "No se pudo eliminar el miembro.");
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

function projectNameExists(name, exceptProjectId = "") {
  return state.projects.some(
    (project) =>
      project.id !== exceptProjectId &&
      project.name.toLocaleLowerCase("es-MX") === name.toLocaleLowerCase("es-MX")
  );
}

function isReservedProjectName(name) {
  return isSameProjectName(name, UNASSIGNED_PROJECT_NAME);
}

function isSameProjectName(left, right) {
  const leftName = normalizeProjectName(left).toLocaleLowerCase("es-MX");
  const rightName = normalizeProjectName(right).toLocaleLowerCase("es-MX");
  return Boolean(leftName) && leftName === rightName;
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

  if (isMemberAccount()) {
    return teamMember.status === "inactive" ? "Inactivo" : "Activo";
  }

  const statusLabel = teamMember.status === "inactive" ? "Inactivo" : "Activo";
  return teamMember.nickname ? `@${teamMember.nickname} · ${statusLabel}` : statusLabel;
}

function getTeamMemberListName(teamMember) {
  if (isMemberAccount() && teamMember.status !== "local") {
    return getNicknameLabel(teamMember.nickname);
  }

  return teamMember.name;
}

function getOwnerDisplayName() {
  return state.account?.displayName || state.account?.email || "Cuenta maestra";
}

function getOwnerNicknameLabel() {
  const nickname = isOwnerAccount() ? state.account?.nickname : state.ownerProfile?.nickname;
  return getNicknameLabel(nickname);
}

function getOwnerMeta() {
  const nickname = state.account?.nickname ? `@${state.account.nickname}` : "Sin nickname";
  const email = state.account?.email || "";
  return email ? `${nickname} · ${email}` : nickname;
}

function getNicknameLabel(nickname) {
  return nickname ? `@${nickname}` : "Sin nickname";
}

function getAssignableTeamMembers() {
  const teamMembers = [...state.teamMembers];

  if (!state.account?.userId) {
    return teamMembers;
  }

  const ownerProfile = getOwnerProfileForAssignableList();
  const ownerName = normalizeTeamMemberName(ownerProfile.displayName || ownerProfile.nickname);
  if (!ownerName) {
    return teamMembers;
  }

  const ownerKey = ownerName.toLocaleLowerCase("es-MX");
  const hasOwner = teamMembers.some(
    (teamMember) =>
      teamMember.name.toLocaleLowerCase("es-MX") === ownerKey &&
      teamMember.userId === ownerProfile.userId
  );

  if (hasOwner) {
    return teamMembers;
  }

  return [
    {
      createdAt: new Date().toISOString(),
      id: `owner_${ownerProfile.userId || state.account.userId}`,
      lastLoginAt: "",
      name: ownerName,
      nickname: ownerProfile.nickname || "",
      order: -1,
      status: "owner",
      updatedAt: new Date().toISOString(),
      userId: ownerProfile.userId || state.account.userId
    },
    ...teamMembers
  ];
}

function getOwnerProfileForAssignableList() {
  if (isOwnerAccount()) {
    return {
      displayName: getOwnerDisplayName(),
      nickname: state.account?.nickname || "",
      userId: state.account?.userId || ""
    };
  }

  return {
    displayName: state.ownerProfile?.displayName || "",
    nickname: state.ownerProfile?.nickname || "",
    userId: state.ownerProfile?.userId || ""
  };
}

function getAuthenticatedOwnerProfile(result) {
  if ((result.accountType || "owner") === "owner") {
    return {
      displayName: result.displayName || result.email || "",
      nickname: result.nickname || "",
      userId: result.user?.id || ""
    };
  }

  return {
    displayName: result.cloud?.ownerProfile?.displayName || "",
    nickname: result.cloud?.ownerProfile?.nickname || "",
    userId: result.cloud?.ownerProfile?.userId || ""
  };
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

function isGuestAccount() {
  return state.account?.accountType === "guest";
}

function isDefaultResponsible(name) {
  return name.toLocaleLowerCase("es-MX") === DEFAULT_RESPONSIBLE_NAME.toLocaleLowerCase("es-MX");
}

function getDefaultProjectName() {
  return state.projects[0]?.name || UNASSIGNED_PROJECT_NAME;
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
    projectName: task.project || UNASSIGNED_PROJECT_NAME,
    pointsSnapshot: Number.isFinite(Number(task.points)) ? Number(task.points) : 0,
    folio: task.folio || "",
    metadata
  };
}

function handleAddCRMProspect() {
  if (isGuestAccount()) {
    return;
  }

  const prospect = createCRMProspectModel({
    order: state.crmProspects.length
  });
  openCRMProspectModal({
    author: getCRMInteractionAuthor(),
    isNew: true,
    prospect,
    onDelete: handleDeleteCRMProspect,
    onSave: handleSaveCRMProspect,
    onClose: () => render()
  });
}

function handleOpenCRMProspect(prospectId) {
  if (isGuestAccount()) {
    return;
  }

  const prospect = state.crmProspects.find((item) => item.id === prospectId);
  if (!prospect) {
    return;
  }

  openCRMProspectModal({
    author: getCRMInteractionAuthor(),
    isNew: false,
    prospect,
    onDelete: handleDeleteCRMProspect,
    onSave: handleSaveCRMProspect,
    onClose: () => render()
  });
}

async function handleSaveCRMProspect(prospect, options = {}) {
  if (isGuestAccount()) {
    return null;
  }

  const previousProspect = state.crmProspects.find((item) => item.id === prospect.id);
  const normalizedProspect = normalizeCRMProspect({
    ...prospect,
    order: previousProspect?.order ?? prospect.order ?? state.crmProspects.length,
    updatedAt: new Date().toISOString()
  });
  const savedProspect = options.isNew || !previousProspect
    ? await createCRMProspect(normalizedProspect)
    : await updateCRMProspect(normalizedProspect);

  state.crmProspects = sortByOrder(
    previousProspect
      ? state.crmProspects.map((item) => item.id === savedProspect.id ? savedProspect : item)
      : [...state.crmProspects, savedProspect]
  );

  await recordCloudMutation({
    critical: true,
    entity: savedProspect,
    entityId: savedProspect.id,
    entityType: "crmProspect",
    operation: previousProspect ? "update" : "insert",
    patch: getCRMProspectPatch(previousProspect, savedProspect)
  });
  render();
  return savedProspect;
}

async function handleDeleteCRMProspect(prospectId) {
  if (isGuestAccount()) {
    return;
  }

  const prospect = state.crmProspects.find((item) => item.id === prospectId);
  if (!prospect) {
    return;
  }

  await deleteCRMProspect(prospectId);
  const nextProspects = state.crmProspects
    .filter((item) => item.id !== prospectId)
    .map((item, index) => ({
      ...item,
      order: index
    }));
  state.crmProspects = await saveCRMProspects(nextProspects);
  await recordCloudMutation({
    critical: true,
    entityId: prospectId,
    entityType: "crmProspect",
    operation: "delete",
    patch: { deletedAt: new Date().toISOString() }
  });
  render();
}

function getCRMProspectPatch(previousProspect, nextProspect) {
  if (!previousProspect) {
    return nextProspect;
  }

  return Object.entries(nextProspect).reduce((patch, [key, value]) => {
    if (JSON.stringify(previousProspect[key]) !== JSON.stringify(value)) {
      patch[key] = value;
    }
    return patch;
  }, {});
}

function getCRMInteractionAuthor() {
  if (!state.account?.userId) {
    return {
      name: "Local",
      userId: ""
    };
  }

  return {
    name: state.account.nickname ? `@${state.account.nickname}` : state.account.displayName || "Cuenta",
    userId: state.account.userId
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
  if (isGuestAccount()) {
    return;
  }

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
    hideSensitiveFields: isGuestAccount(),
    readOnly: isGuestAccount(),
    task,
    projects: state.projects,
    teamMembers: getAssignableTeamMembers(),
    onDelete: handleDeleteTask,
    onSave: handleSaveTask,
    onClose: () => render()
  });
}

async function handleSaveTask(task) {
  if (isGuestAccount()) {
    return null;
  }

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
  if (isGuestAccount()) {
    return null;
  }

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
  if (isGuestAccount()) {
    return;
  }

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
  if (isGuestAccount()) {
    return;
  }

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

    if (!projectName || isReservedProjectName(projectName) || seen.has(key)) {
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
    const project = normalizeProjectName(task.project) || UNASSIGNED_PROJECT_NAME;
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
