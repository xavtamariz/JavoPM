import {
  createTask,
  getColumns,
  getTasks,
  initDB,
  resetSeedDataIfNeeded,
  updateTask
} from "./db.js";
import { createTaskModel, generateFolio, sortByOrder } from "./models.js";
import { openTaskModal } from "./modal.js";
import { renderBoard } from "./ui.js";

const state = {
  columns: [],
  tasks: []
};

const boardElement = document.querySelector("#board");

async function startApp() {
  try {
    await initDB();
    await resetSeedDataIfNeeded();
    await loadState();
    render();
  } catch (error) {
    renderBootError(error);
  }
}

async function loadState() {
  const [columns, tasks] = await Promise.all([getColumns(), getTasks()]);
  state.columns = columns;
  state.tasks = tasks;
}

function render() {
  renderBoard({
    boardElement,
    columns: state.columns,
    tasks: state.tasks,
    onAddTask: handleAddTask,
    onOpenTask: handleOpenTask
  });
}

async function handleAddTask(columnId) {
  const columnTasks = state.tasks.filter((task) => task.columnId === columnId);
  const task = createTaskModel({
    columnId,
    order: columnTasks.length,
    folio: generateFolio(state.tasks)
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

function renderBootError(error) {
  boardElement.innerHTML = "";
  const message = document.createElement("div");
  message.className = "validation-message is-visible";
  message.textContent = `No se pudo iniciar JavoPM: ${error.message}`;
  boardElement.append(message);
}

startApp();
