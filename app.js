import {
  createTask,
  deleteTask,
  getColumns,
  getTasks,
  initDB,
  resetSeedDataIfNeeded,
  saveTaskOrder,
  updateTask
} from "./db.js?v=20260522-modal-close-space";
import { createTaskModel, generateFolio, sortByOrder } from "./models.js?v=20260522-modal-close-space";
import { openTaskModal } from "./modal.js?v=20260522-modal-close-space";
import { renderBoard } from "./ui.js?v=20260522-modal-close-space";

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
    onOpenTask: handleOpenTask,
    onMoveTask: handleMoveTask
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
