import {
  createProject,
  createTask,
  deleteTask,
  getColumns,
  getProjects,
  getTasks,
  initDB,
  resetSeedDataIfNeeded,
  saveProjects,
  saveTaskOrder,
  updateTask
} from "./db.js?v=20260522-projects";
import {
  DEFAULT_PROJECT_NAME,
  createProjectModel,
  createTaskModel,
  generateFolio,
  getFolioNumber,
  getNextGlobalFolioNumber,
  normalizeProjectName,
  sortByOrder,
  updateFolioProjectName
} from "./models.js?v=20260522-projects";
import { openTaskModal } from "./modal.js?v=20260522-projects";
import { renderBoard } from "./ui.js?v=20260522-safari-drag-smooth";

const state = {
  columns: [],
  projects: [],
  tasks: []
};

const boardElement = document.querySelector("#board");
const projectMenuToggle = document.querySelector("[data-project-menu-toggle]");
const themeToggle = document.querySelector("[data-theme-toggle]");
const themeLabel = document.querySelector("[data-theme-label]");
const THEME_STORAGE_KEY = "javopm-theme";
let projectModalKeydownHandler;

async function startApp() {
  try {
    initThemeToggle();
    await initDB();
    await resetSeedDataIfNeeded();
    await loadState();
    initProjectMenu();
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
  const [columns, tasks, projects] = await Promise.all([getColumns(), getTasks(), getProjects()]);
  const syncedProjects = await syncProjectsWithTasks(projects, tasks);
  const syncedTasks = await syncTaskFoliosWithProjects(tasks);

  state.columns = columns;
  state.projects = syncedProjects;
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

function openProjectModal() {
  const root = document.querySelector("#modal-root");
  if (!root) {
    return;
  }

  closeProjectModal({ clearRoot: false });
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

function projectNameExists(name) {
  return state.projects.some(
    (project) => project.name.toLocaleLowerCase("es-MX") === name.toLocaleLowerCase("es-MX")
  );
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

function projectsNeedSaving(currentProjects, nextProjects) {
  if (currentProjects.length !== nextProjects.length) {
    return true;
  }

  return nextProjects.some((project, index) => currentProjects[index]?.name !== project.name);
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
