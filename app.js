import {
  createProject,
  createTask,
  createTeamMember,
  deleteTask,
  getColumns,
  getProjects,
  getTeamMembers,
  getTasks,
  initDB,
  resetSeedDataIfNeeded,
  saveProjects,
  saveTeamMembers,
  saveTaskOrder,
  updateTask
} from "./db.js?v=20260522-team";
import {
  DEFAULT_PROJECT_NAME,
  DEFAULT_RESPONSIBLE_NAME,
  createProjectModel,
  createTeamMemberModel,
  createTaskModel,
  generateFolio,
  getFolioNumber,
  getNextGlobalFolioNumber,
  normalizeProjectName,
  normalizeTeamMemberName,
  sortByOrder,
  updateFolioProjectName
} from "./models.js?v=20260522-team";
import { openTaskModal } from "./modal.js?v=20260522-team";
import { renderBoard } from "./ui.js?v=20260522-team";

const state = {
  columns: [],
  projects: [],
  teamMembers: [],
  tasks: []
};

const boardElement = document.querySelector("#board");
const projectMenuToggle = document.querySelector("[data-project-menu-toggle]");
const teamMenuToggle = document.querySelector("[data-team-menu-toggle]");
const themeToggle = document.querySelector("[data-theme-toggle]");
const themeLabel = document.querySelector("[data-theme-label]");
const THEME_STORAGE_KEY = "javopm-theme";
let projectModalKeydownHandler;
let teamModalKeydownHandler;

async function startApp() {
  try {
    initThemeToggle();
    await initDB();
    await resetSeedDataIfNeeded();
    await loadState();
    initProjectMenu();
    initTeamMenu();
    render();
  } catch (error) {
    renderBootError(error);
  }
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
  const [columns, tasks, projects, teamMembers] = await Promise.all([
    getColumns(),
    getTasks(),
    getProjects(),
    getTeamMembers()
  ]);
  const syncedProjects = await syncProjectsWithTasks(projects, tasks);
  const syncedTeamMembers = await syncTeamMembersWithTasks(teamMembers, tasks);
  const syncedTasks = await syncTaskFoliosWithProjects(tasks);

  state.columns = columns;
  state.projects = syncedProjects;
  state.teamMembers = syncedTeamMembers;
  state.tasks = syncedTasks;
}

function render() {
  renderBoard({
    boardElement,
    columns: state.columns,
    tasks: state.tasks,
    onAddTask: handleAddTask,
    onOpenTask: handleOpenTask,
    onMoveTask: handleMoveTask
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

function createTeamModalBody(message = "") {
  const body = document.createElement("div");
  body.className = "project-modal-body";
  body.dataset.teamModalBody = "true";

  const listTitle = document.createElement("p");
  listTitle.className = "project-list-title";
  listTitle.textContent = "Integrantes del equipo";

  const list = document.createElement("ul");
  list.className = "project-list";

  if (state.teamMembers.length === 0) {
    const emptyItem = document.createElement("li");
    emptyItem.className = "project-list-item is-empty";
    emptyItem.textContent = "Sin integrantes todavía";
    list.append(emptyItem);
  } else {
    state.teamMembers.forEach((teamMember) => {
      const item = document.createElement("li");
      item.className = "project-list-item";
      item.textContent = teamMember.name;
      list.append(item);
    });
  }

  const form = document.createElement("form");
  form.className = "project-create-form";
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = form.querySelector("[data-team-create-input]");
    await handleCreateTeamMember(input.value);
  });

  const input = document.createElement("input");
  input.className = "project-create-input";
  input.dataset.teamCreateInput = "true";
  input.placeholder = "Nuevo integrante";
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

function renderTeamModalBody(message = "") {
  const currentBody = document.querySelector("[data-team-modal-body]");
  if (!currentBody) {
    return;
  }

  const nextBody = createTeamModalBody(message);
  currentBody.replaceWith(nextBody);
  requestAnimationFrame(() => {
    nextBody.querySelector("[data-team-create-input]")?.focus({ preventScroll: true });
  });
}

async function handleCreateTeamMember(value) {
  const name = normalizeTeamMemberName(value);

  if (!name) {
    renderTeamModalBody("Escribe un nombre de integrante.");
    return null;
  }

  if (isDefaultResponsible(name)) {
    renderTeamModalBody("Ese nombre está reservado para tareas sin responsable.");
    return null;
  }

  if (teamMemberNameExists(name)) {
    renderTeamModalBody("Ese integrante ya existe.");
    return null;
  }

  const savedTeamMember = await createTeamMember(
    createTeamMemberModel({
      name,
      order: state.teamMembers.length
    })
  );

  state.teamMembers = sortByOrder([...state.teamMembers, savedTeamMember]);
  renderTeamModalBody();
  return savedTeamMember;
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

function isDefaultResponsible(name) {
  return name.toLocaleLowerCase("es-MX") === DEFAULT_RESPONSIBLE_NAME.toLocaleLowerCase("es-MX");
}

function getDefaultProjectName() {
  return state.projects[0]?.name || DEFAULT_PROJECT_NAME;
}

async function handleAddTask(columnId) {
  const columnTasks = state.tasks.filter((task) => task.columnId === columnId);
  const project = getDefaultProjectName();
  const task = createTaskModel({
    columnId,
    order: columnTasks.length,
    project,
    folio: generateFolio(state.tasks, project)
  });

  const savedTask = await createTask(task);
  state.tasks = sortByOrder([...state.tasks, savedTask]);
  render();
  handleOpenTask(savedTask.id);
}

function handleOpenTask(taskId) {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) {
    return;
  }

  openTaskModal({
    task,
    projects: state.projects,
    teamMembers: state.teamMembers,
    onDelete: handleDeleteTask,
    onSave: handleSaveTask,
    onClose: () => render()
  });
}

async function handleSaveTask(task) {
  const savedTask = await updateTask(task);
  state.tasks = sortByOrder(
    state.tasks.map((currentTask) => (currentTask.id === savedTask.id ? savedTask : currentTask))
  );
  render();
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
    updatedAt: now
  };

  const nextTasks = state.tasks.map((task) => (task.id === taskId ? movedTask : task));
  const orderedTasks = normalizeOrdersByColumn(nextTasks);

  state.tasks = sortByOrder(orderedTasks);
  render();

  try {
    await saveTaskOrder(orderedTasks);
  } catch (error) {
    await loadState();
    render();
    renderBootError(error);
  }
}

async function handleDeleteTask(taskId) {
  const nextTasks = state.tasks.filter((task) => task.id !== taskId);
  const orderedTasks = normalizeOrdersByColumn(nextTasks);

  state.tasks = sortByOrder(orderedTasks);
  render();

  try {
    await deleteTask(taskId);
    await saveTaskOrder(orderedTasks);
  } catch (error) {
    await loadState();
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

    if (!teamMemberName || isDefaultResponsible(teamMemberName) || seen.has(key)) {
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

function normalizeOrdersByColumn(tasks) {
  return state.columns.flatMap((column) =>
    sortByOrder(tasks.filter((task) => task.columnId === column.id)).map((task, index) => ({
      ...task,
      order: index
    }))
  );
}

function renderBootError(error) {
  boardElement.innerHTML = "";
  const message = document.createElement("div");
  message.className = "validation-message is-visible";
  message.textContent = `No se pudo iniciar JavoPM: ${error.message}`;
  boardElement.append(message);
}

startApp();
