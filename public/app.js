const apiBase = 'api/index.php';
const dayMs = 24 * 60 * 60 * 1000;
const pxPerDay = 28;
const dailyCapacityHours = 18;
const leftColumnStorageKey = 'clientGantt.leftColumnWidth';
const collapsedStorageKey = 'clientGantt.collapsedRows';
const defaultLeftColumnWidth = 430;
const minLeftColumnWidth = 260;
const statuses = ['planned', 'in_progress', 'waiting', 'done', 'paused'];
const statusLabels = {
  planned: 'Planned',
  in_progress: 'In progress',
  waiting: 'Waiting',
  done: 'Done',
  paused: 'Paused',
};
const planningModes = [
  { id: 'total', label: 'Total hours' },
  { id: 'daily', label: 'Hours per day' },
];

const state = {
  clients: [],
  projects: [],
  stages: [],
  tasks: [],
  rows: [],
  range: null,
  filters: { search: '', client: '', status: '' },
  collapsed: {
    projects: new Set(),
    stages: new Set(),
  },
};

const $ = (selector) => document.querySelector(selector);
const loginView = $('#login');
const appView = $('#app');
const namesRows = $('#namesRows');
const timelineRows = $('#timelineRows');
const timelineHeader = $('#timelineHeader');
const timelinePane = $('#timelinePane');
const columnResizeHandle = $('#columnResizeHandle');
const saveStatus = $('#saveStatus');
const appError = $('#appError');
const debugOutput = $('#debugOutput');
const editorDialog = $('#editorDialog');
const editorForm = $('#editorForm');
const editorFields = $('#editorFields');
const editorTitle = $('#editorTitle');
const editorError = $('#editorError');
const deleteBtn = $('#deleteBtn');
const saveMoreBtn = $('#saveMoreBtn');
const agendaDialog = $('#agendaDialog');
const agendaRows = $('#agendaRows');
const agendaSummary = $('#agendaSummary');
const forecastRows = $('#forecastRows');
const agendaTabs = {
  today: $('#agendaTabToday'),
  forecast: $('#agendaTabForecast'),
};
const agendaPanels = {
  today: $('#agendaTodayPanel'),
  forecast: $('#agendaForecastPanel'),
};
const hoverTooltip = $('#hoverTooltip');
const toolsMenu = document.querySelector('.tools-menu');
const addMenu = document.querySelector('.add-menu');
const filtersPanel = document.querySelector('.filters');

let editor = { type: null, id: null, addMore: false };
let agendaMode = 'today';

document.addEventListener('DOMContentLoaded', boot);

async function boot() {
  bindGlobalEvents();
  initColumnResize();
  loadCollapsedState();
  try {
    const me = await api('me');
    if (me.authenticated) {
      showApp();
      await loadTimeline();
      return;
    }
    loginView.classList.remove('is-hidden');
  } catch (error) {
    loginView.classList.remove('is-hidden');
    $('#loginError').textContent = `API unavailable: ${error.message}`;
  }
}

function bindGlobalEvents() {
  $('#loginForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    $('#loginError').textContent = '';
    const data = Object.fromEntries(new FormData(event.target));
    try {
      await api('login', { method: 'POST', body: data });
      event.target.reset();
      showApp();
      await loadTimeline();
    } catch (error) {
      $('#loginError').textContent = error.message;
    }
  });

  $('#logoutBtn').addEventListener('click', async () => {
    await api('logout', { method: 'POST' });
    appView.classList.add('is-hidden');
    loginView.classList.remove('is-hidden');
  });

  $('#searchInput').addEventListener('input', (event) => {
    state.filters.search = event.target.value.trim().toLowerCase();
    render();
  });
  $('#clientFilter').addEventListener('change', (event) => {
    state.filters.client = event.target.value;
    render();
  });
  $('#statusFilter').addEventListener('change', (event) => {
    state.filters.status = event.target.value;
    render();
  });
  $('#todayBtn').addEventListener('click', scrollToday);
  $('#agendaBtn').addEventListener('click', openAgenda);
  $('#closeAgendaBtn').addEventListener('click', () => agendaDialog.close());
  agendaTabs.today.addEventListener('click', () => switchAgendaTab('today'));
  agendaTabs.forecast.addEventListener('click', () => switchAgendaTab('forecast'));
  $('#resetFiltersBtn').addEventListener('click', resetFilters);
  $('#filterToggleBtn').addEventListener('click', () => filtersPanel.classList.toggle('is-open'));
  $('#debugBtn').addEventListener('click', runDebug);
  $('#copyDebugBtn').addEventListener('click', copyDebug);
  document.addEventListener('click', closeMenusOnOutsideClick);

  $('#addClientBtn').addEventListener('click', () => openEditor('client'));
  $('#addProjectBtn').addEventListener('click', () => openEditor('project'));
  $('#addStageBtn').addEventListener('click', () => openEditor('stage'));
  $('#addTaskBtn').addEventListener('click', () => openEditor('task'));
  document.querySelectorAll('[data-add-type]').forEach((button) => {
    button.addEventListener('click', () => {
      addMenu.open = false;
      openEditor(button.dataset.addType);
    });
  });
  $('#closeEditorBtn').addEventListener('click', () => editorDialog.close());
  $('#cancelBtn').addEventListener('click', () => editorDialog.close());
  deleteBtn.addEventListener('click', deleteCurrent);
  saveMoreBtn.addEventListener('click', () => {
    editor.addMore = true;
    editorForm.requestSubmit();
  });
  editorForm.addEventListener('submit', saveCurrent);
  editorForm.addEventListener('input', clearFieldErrorFromEvent);
  editorForm.addEventListener('change', clearFieldErrorFromEvent);
  editorForm.addEventListener('change', updateStatusSelectFromEvent);
  editorForm.addEventListener('click', openDatePickerFromIcon);
}

function initColumnResize() {
  const shell = $('.gantt-shell');
  if (!shell || !columnResizeHandle) return;

  const savedWidth = Number(localStorage.getItem(leftColumnStorageKey));
  if (savedWidth) {
    setLeftColumnWidth(savedWidth);
  }

  columnResizeHandle.addEventListener('dblclick', () => {
    localStorage.removeItem(leftColumnStorageKey);
    setLeftColumnWidth(defaultLeftColumnWidth);
  });

  columnResizeHandle.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    columnResizeHandle.setPointerCapture(event.pointerId);
    shell.classList.add('is-resizing');

    const move = (moveEvent) => {
      const shellRect = shell.getBoundingClientRect();
      const nextWidth = moveEvent.clientX - shellRect.left;
      setLeftColumnWidth(nextWidth);
    };

    const up = (upEvent) => {
      columnResizeHandle.releasePointerCapture(upEvent.pointerId);
      shell.classList.remove('is-resizing');
      localStorage.setItem(leftColumnStorageKey, getLeftColumnWidth().toString());
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  });
}

function setLeftColumnWidth(width) {
  const shell = $('.gantt-shell');
  if (!shell) return;
  const maxWidth = Math.max(minLeftColumnWidth, Math.min(window.innerWidth - 360, 720));
  const nextWidth = Math.min(Math.max(Math.round(width), minLeftColumnWidth), maxWidth);
  document.documentElement.style.setProperty('--left', `${nextWidth}px`);
}

function getLeftColumnWidth() {
  const value = getComputedStyle(document.documentElement).getPropertyValue('--left');
  return Number.parseInt(value, 10) || defaultLeftColumnWidth;
}

function showApp() {
  loginView.classList.add('is-hidden');
  appView.classList.remove('is-hidden');
}

async function loadTimeline() {
  try {
    showAppError('');
    setSaving('Loading...');
    const data = await api('timeline');
    state.clients = data.clients || [];
    state.projects = data.projects || [];
    state.stages = data.stages || [];
    state.tasks = data.tasks || [];
    pruneCollapsedState();
    updateClientFilter();
    buildRows();
    render();
    setSaving(`Loaded: ${state.clients.length} clients, ${state.projects.length} projects`);
    setTimeout(() => setSaving(''), 1800);
  } catch (error) {
    setSaving('');
    showAppError(`Data loading failed: ${error.message}`);
    throw error;
  }
}

function updateClientFilter() {
  const select = $('#clientFilter');
  const current = select.value;
  select.innerHTML = '<option value="">All clients</option>' + state.clients
    .map((client) => `<option value="${client.id}">${escapeHtml(client.name)}</option>`)
    .join('');
  select.value = current;
}

function buildRows() {
  const rows = [];
  const projectsByClient = groupBy(state.projects, 'client_id');
  const stagesByProject = groupBy(state.stages, 'project_id');
  const tasksByStage = groupBy(state.tasks, 'stage_id');

  for (const client of state.clients) {
    const clientProjects = projectsByClient[client.id] || [];
    rows.push({ type: 'client', item: client, client, text: client.name });

    for (const project of clientProjects) {
      rows.push({ type: 'project', item: project, client, project, text: project.name });

      for (const stage of stagesByProject[project.id] || []) {
        rows.push({ type: 'stage', item: stage, client, project, stage, text: stage.name });

        for (const task of tasksByStage[stage.id] || []) {
          rows.push({ type: 'task', item: task, client, project, stage, task, text: task.name });
        }
      }
    }
  }

  state.rows = rows;
  state.range = getRange(rows);
}

function render() {
  const rows = filteredRows();
  renderHeader();
  renderNames(rows);
  renderTimeline(rows);
  $('#rowCount').textContent = `${rows.length} rows`;
}

function filteredRows() {
  const search = state.filters.search;
  const clientId = state.filters.client;
  const status = state.filters.status;

  return state.rows.filter((row) => {
    if (clientId && String(row.client?.id) !== clientId) return false;
    if (status && row.item.status && row.item.status !== status) return false;
    if (row.type === 'stage' && state.collapsed.projects.has(Number(row.project?.id))) return false;
    if (row.type === 'task' && (
      state.collapsed.projects.has(Number(row.project?.id))
      || state.collapsed.stages.has(Number(row.stage?.id))
    )) return false;
    if (search) {
      const haystack = [row.client?.name, row.project?.name, row.stage?.name, row.task?.name, row.item.contact, row.item.notes, row.item.description]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });
}

function resetFilters() {
  state.filters = { search: '', client: '', status: '' };
  $('#searchInput').value = '';
  $('#clientFilter').value = '';
  $('#statusFilter').value = '';
  render();
}

function closeMenusOnOutsideClick(event) {
  if (toolsMenu?.open && !toolsMenu.contains(event.target)) {
    toolsMenu.open = false;
  }
  if (addMenu?.open && !addMenu.contains(event.target)) {
    addMenu.open = false;
  }
}

function showAppError(message) {
  appError.textContent = message;
  appError.classList.toggle('is-hidden', !message);
}

async function runDebug() {
  try {
    setSaving('Debugging...');
    const diagnostics = await api('diagnostics');
    const timeline = await api('timeline');
    const compact = {
      diagnostics,
      timeline_counts: {
        clients: timeline.clients?.length ?? null,
        projects: timeline.projects?.length ?? null,
        stages: timeline.stages?.length ?? null,
        tasks: timeline.tasks?.length ?? null,
      },
      first_clients_from_timeline: (timeline.clients || []).slice(0, 5),
      current_screen_state: {
        rows: state.rows.length,
        clients_in_state: state.clients.length,
        active_filters: state.filters,
      },
    };
    debugOutput.textContent = JSON.stringify(compact, null, 2);
    debugOutput.classList.remove('is-hidden');
    setSaving('');
  } catch (error) {
    debugOutput.textContent = `Debug failed: ${error.message}`;
    debugOutput.classList.remove('is-hidden');
    setSaving('');
  }
}

async function copyDebug() {
  const text = debugOutput.textContent.trim();
  if (!text) {
    setSaving('Run Debug first');
    setTimeout(() => setSaving(''), 1400);
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
    setSaving('Debug copied');
    setTimeout(() => setSaving(''), 1400);
  } catch (error) {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(debugOutput);
    selection.removeAllRanges();
    selection.addRange(range);
    setSaving('Copy failed. Debug text selected.');
  }
}

function openAgenda() {
  renderAgenda();
  agendaDialog.showModal();
}

function renderAgenda() {
  const today = toIso(new Date());
  const items = todayAgendaItems(today);
  const totalHours = items.reduce((sum, item) => sum + item.hours, 0);
  const forecast = financialForecastItems(today);

  agendaSummary.innerHTML = `
    <span>${escapeHtml(today)}</span>
    <span>${items.length} tasks</span>
    <span>${formatHours(totalHours)} planned</span>
  `;
  agendaRows.innerHTML = items.length
    ? items.map((item, index) => `
      <tr class="${index % 2 === 0 ? 'agenda-alt' : ''}">
        <td>${escapeHtml(item.client)}</td>
        <td>${escapeHtml(item.project)}</td>
        <td>${escapeHtml(item.task)}</td>
        <td>${formatHours(item.hours)}</td>
      </tr>
    `).join('')
    : '<tr><td class="agenda-empty" colspan="4">No active tasks planned for today.</td></tr>';

  forecastRows.innerHTML = forecast.map((item, index) => `
    <tr class="${index % 2 === 0 ? 'agenda-alt' : ''}">
      <td>${escapeHtml(item.label)}</td>
      <td>${formatHoursCompact(item.hours)}</td>
      <td>${formatMoney(item.amount)}</td>
    </tr>
  `).join('');
  switchAgendaTab(agendaMode);
}

function switchAgendaTab(mode) {
  agendaMode = mode;
  Object.entries(agendaTabs).forEach(([key, tab]) => {
    const active = key === mode;
    tab.classList.toggle('is-active', active);
    tab.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  Object.entries(agendaPanels).forEach(([key, panel]) => {
    panel.classList.toggle('is-hidden', key !== mode);
  });
}

function todayAgendaItems(todayIso) {
  return state.rows
    .filter((row) => row.type === 'task' && row.item.status !== 'done' && taskCoversDate(row.item, todayIso))
    .map((row) => {
      const duration = daysBetween(parseDate(row.item.starts_on), parseDate(row.item.ends_on)) + 1;
      return {
        client: row.client?.name || '',
        project: row.project?.name || '',
        task: row.task?.name || row.item.name,
        hours: taskHoursPerDay(row.item, duration),
      };
    })
    .filter((item) => item.hours > 0)
    .sort((a, b) => a.client.localeCompare(b.client) || a.project.localeCompare(b.project) || a.task.localeCompare(b.task));
}

function financialForecastItems(todayIso) {
  const today = parseDate(todayIso);
  const weekStart = startOfWeek(today);
  const weekEnd = addDays(weekStart, 6);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const yearStart = new Date(today.getFullYear(), 0, 1);
  const yearEnd = new Date(today.getFullYear(), 11, 31);

  return [
    {
      label: `This week (${shortDate(weekStart)}-${shortDate(weekEnd)})`,
      ...forecastForPeriod(weekStart, weekEnd),
    },
    {
      label: `This month (${today.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })})`,
      ...forecastForPeriod(monthStart, monthEnd),
    },
    {
      label: `This year (${today.getFullYear()})`,
      ...forecastForPeriod(yearStart, yearEnd),
    },
  ];
}

function forecastForPeriod(periodStart, periodEnd) {
  return state.rows
    .filter((row) => row.type === 'task' && row.item.status !== 'done')
    .reduce((totals, row) => {
      const task = row.item;
      if (!task.starts_on || !task.ends_on) return totals;
      const taskStart = parseDate(task.starts_on);
      const taskEnd = parseDate(task.ends_on);
      const overlapStart = taskStart > periodStart ? taskStart : periodStart;
      const overlapEnd = taskEnd < periodEnd ? taskEnd : periodEnd;
      if (overlapEnd < overlapStart) return totals;

      const duration = daysBetween(taskStart, taskEnd) + 1;
      const overlapDays = daysBetween(overlapStart, overlapEnd) + 1;
      const hours = taskHoursPerDay(task, duration) * overlapDays;
      const rate = Number(row.project?.hourly_rate || 0);
      totals.hours += hours;
      totals.amount += hours * rate;
      return totals;
    }, { hours: 0, amount: 0 });
}

function startOfWeek(date) {
  const copy = new Date(date);
  const day = copy.getDay() || 7;
  copy.setDate(copy.getDate() - day + 1);
  return copy;
}

function shortDate(date) {
  return date.toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
}

function taskCoversDate(task, iso) {
  return Boolean(task.starts_on && task.ends_on && task.starts_on <= iso && iso <= task.ends_on);
}

function renderHeader() {
  const days = daysBetween(state.range.start, state.range.end);
  const loadByDay = calculateDailyLoad();
  const months = [];
  let currentMonth = '';
  let monthDays = 0;

  for (let i = 0; i < days; i++) {
    const date = addDays(state.range.start, i);
    const label = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    if (label !== currentMonth && monthDays) {
      months.push({ label: currentMonth, days: monthDays });
      monthDays = 0;
    }
    currentMonth = label;
    monthDays += 1;
  }
  if (monthDays) months.push({ label: currentMonth, days: monthDays });

  timelineHeader.style.width = `${days * pxPerDay}px`;
  timelineHeader.innerHTML = `
    <div class="months">${months.map((m) => `<div class="month" style="width:${m.days * pxPerDay}px">${m.label}</div>`).join('')}</div>
    <div class="load-strip">${Array.from({ length: days }, (_, i) => {
      const date = addDays(state.range.start, i);
      const iso = toIso(date);
      const hours = loadByDay[iso] || 0;
      const level = loadLevel(hours);
      const label = hours > 0 ? formatHoursCompact(hours) : '';
      return `<div class="load-cell load-${level}" title="${iso}: ${formatHours(hours)} / ${dailyCapacityHours}h">${label}</div>`;
    }).join('')}</div>
    <div class="days">${Array.from({ length: days }, (_, i) => {
      const date = addDays(state.range.start, i);
      const weekend = [0, 6].includes(date.getDay()) ? ' weekend' : '';
      const today = toIso(date) === toIso(new Date()) ? ' today' : '';
      return `<div class="day${weekend}${today}" title="${toIso(date)}">${date.getDate()}<br>${weekLabel(date)}</div>`;
    }).join('')}</div>
  `;
}

function calculateDailyLoad() {
  return state.tasks.reduce((acc, task) => {
    if (!task.starts_on || !task.ends_on || task.status === 'done') return acc;
    const start = parseDate(task.starts_on);
    const end = parseDate(task.ends_on);
    const duration = daysBetween(start, end) + 1;
    const hoursPerDay = taskHoursPerDay(task, duration);
    if (!hoursPerDay) return acc;

    for (let i = 0; i < duration; i++) {
      const iso = toIso(addDays(start, i));
      acc[iso] = (acc[iso] || 0) + hoursPerDay;
    }
    return acc;
  }, {});
}

function loadLevel(hours) {
  if (hours <= 0) return 'empty';
  if (hours <= 10) return 'ok';
  if (hours <= 14) return 'busy';
  if (hours <= dailyCapacityHours) return 'heavy';
  return 'overbooked';
}

function formatHours(hours) {
  if (!hours) return '0h';
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)}h`;
}

function formatHoursCompact(hours) {
  if (!hours) return '0';
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)}`;
}

function formatMoney(amount) {
  return Math.round(amount).toLocaleString('ru-RU').replace(/\u00a0/g, ' ');
}

function renderNames(rows) {
  namesRows.innerHTML = rows.map((row) => {
    const item = row.item;
    const status = item.status ? `<span class="status-dot status-${item.status}"></span>` : '';
    const meta = rowMeta(row);
    const canDrag = ['client', 'project', 'stage', 'task'].includes(row.type);
    const draggable = canDrag ? ' draggable="true"' : '';
    const rowData = `data-row-type="${row.type}" data-id="${item.id}"`;
    const childToggle = collapseButton(row);
    const isFocusedClient = state.filters.client === String(item.id);
    const clientFocusAction = row.type === 'client' ? `
          <button class="mini-btn icon-edit icon-present" data-focus-client="${item.id}" aria-label="${isFocusedClient ? 'Show all clients' : `Show only ${escapeAttr(row.text)}`}">
            <i class="fa-solid fa-eye" aria-hidden="true"></i>
          </button>` : '';
    return `
      <div class="name-row row-${row.type}" ${rowData}${draggable}>
        <div class="name-main">
          ${childToggle}
          ${status}
          <span class="name-text">${escapeHtml(row.text)}</span>
          ${meta ? `<span class="meta">${escapeHtml(meta)}</span>` : ''}
        </div>
        <div class="row-actions">
          ${clientFocusAction}
          <button class="mini-btn icon-edit" data-edit="${row.type}" data-id="${item.id}" aria-label="Edit ${escapeAttr(row.text)}">
            <i class="fa-solid fa-pen" aria-hidden="true"></i>
          </button>
        </div>
      </div>
    `;
  }).join('');

  namesRows.querySelectorAll('[data-edit]').forEach((button) => {
    button.addEventListener('click', () => openEditor(button.dataset.edit, Number(button.dataset.id)));
  });
  namesRows.querySelectorAll('[data-focus-client]').forEach((button) => {
    button.addEventListener('click', () => toggleClientFocus(button.dataset.focusClient));
  });
  namesRows.querySelectorAll('[data-collapse]').forEach((button) => {
    button.addEventListener('click', () => toggleCollapse(button.dataset.collapse, Number(button.dataset.id)));
  });
  bindMobileRowActions();
  bindListReorder(rows);
  bindHoverTooltips(namesRows, rows);
}

function toggleClientFocus(clientId) {
  const nextClientId = state.filters.client === String(clientId) ? '' : String(clientId);
  state.filters.client = nextClientId;
  $('#clientFilter').value = nextClientId;
  render();
}

function bindMobileRowActions() {
  namesRows.querySelectorAll('.name-row').forEach((rowEl) => {
    rowEl.addEventListener('click', (event) => {
      if (!window.matchMedia('(max-width: 700px)').matches) return;
      if (rowEl.dataset.justDragged === 'true') {
        event.preventDefault();
        rowEl.dataset.justDragged = '';
        return;
      }
      if (event.target.closest('button, a, input, select, textarea')) return;
      namesRows.querySelectorAll('.name-row.is-actions-open').forEach((entry) => {
        if (entry !== rowEl) entry.classList.remove('is-actions-open');
      });
      rowEl.classList.toggle('is-actions-open');
    });
  });
}

function rowMeta(row) {
  if (row.type === 'client') return row.item.contact || '';
  if (row.type === 'project') {
    return projectLoadSummary(row.item);
  }
  if (row.type === 'task') {
    return taskModeSummary(row.item);
  }
  return statusLabels[row.item.status] || '';
}

function projectLoadSummary(project) {
  const projectStages = state.stages.filter((stage) => Number(stage.project_id) === Number(project.id));
  const stageIds = new Set(projectStages.map((stage) => Number(stage.id)));
  const allTasks = state.tasks.filter((task) => stageIds.has(Number(task.stage_id)));
  const activeTasks = allTasks.filter((task) => task.status !== 'done');
  const planned = allTasks.reduce((sum, task) => sum + Number(task.estimated_hours || 0), 0);
  const doneHours = allTasks
    .filter((task) => task.status === 'done')
    .reduce((sum, task) => sum + Number(task.estimated_hours || 0), 0);
  const parts = [];
  if (Number(project.budget_hours || 0) > 0) {
    const budget = Number(project.budget_hours);
    parts.push(`${formatHoursCompact(planned)} / ${formatHoursCompact(budget)}`);
    const daysLeft = project.ends_on ? daysFromToday(project.ends_on) : 0;
    if (daysLeft > 0) {
      const remaining = Math.max(budget - doneHours, 0);
      parts.push(`need ${formatHoursCompact(remaining / daysLeft)}/day`);
    } else if (!project.ends_on) {
      parts.push('ongoing');
    }
  } else if (planned > 0) {
    parts.push(formatHours(planned));
  } else if (!project.ends_on) {
    parts.push('ongoing');
  }
  if (Number(project.daily_capacity_hours || 0) > 0) {
    const capacity = Number(project.daily_capacity_hours);
    const maxDailyLoad = maxProjectDailyLoad(activeTasks);
    parts.push(`max ${formatHoursCompact(capacity)}/day`);
    if (maxDailyLoad > capacity) {
      parts.push(`over daily ${formatHoursCompact(maxDailyLoad)}`);
    }
  }
  if (Number(project.budget_hours || 0) > 0 && planned > Number(project.budget_hours)) {
    parts.push('over budget');
  }
  return parts.join(' · ');
}

function maxProjectDailyLoad(tasks) {
  const load = {};
  tasks.forEach((task) => {
    if (!task.starts_on || !task.ends_on || task.status === 'done') return;
    const start = parseDate(task.starts_on);
    const end = parseDate(task.ends_on);
    const duration = daysBetween(start, end) + 1;
    const hoursPerDay = taskHoursPerDay(task, duration);
    for (let i = 0; i < duration; i++) {
      const iso = toIso(addDays(start, i));
      load[iso] = (load[iso] || 0) + hoursPerDay;
    }
  });
  return Math.max(0, ...Object.values(load));
}

function daysFromToday(endDate) {
  return Math.max(daysBetween(stripTime(new Date()), parseDate(endDate)) + 1, 0);
}

function taskModeSummary(task) {
  if (!task.starts_on || !task.ends_on) return '';
  const duration = daysBetween(parseDate(task.starts_on), parseDate(task.ends_on)) + 1;
  return `${duration}d ${formatHoursCompact(taskHoursPerDay(task, duration))}h/day`;
}

function collapseButton(row) {
  if (row.type !== 'project' && row.type !== 'stage') return '';
  const setName = row.type === 'project' ? 'projects' : 'stages';
  const isCollapsed = state.collapsed[setName].has(Number(row.item.id));
  const icon = isCollapsed ? 'fa-chevron-right' : 'fa-chevron-down';
  return `
    <button class="collapse-btn" type="button" data-collapse="${setName}" data-id="${row.item.id}" aria-label="${isCollapsed ? 'Expand' : 'Collapse'} ${escapeAttr(row.text)}" title="${isCollapsed ? 'Expand' : 'Collapse'}">
      <i class="fa-solid ${icon}" aria-hidden="true"></i>
    </button>
  `;
}

function toggleCollapse(setName, id) {
  const set = state.collapsed[setName];
  if (!set) return;
  if (set.has(id)) {
    set.delete(id);
  } else {
    set.add(id);
  }
  saveCollapsedState();
  render();
}

function loadCollapsedState() {
  try {
    const saved = JSON.parse(localStorage.getItem(collapsedStorageKey) || '{}');
    state.collapsed.projects = new Set((saved.projects || []).map(Number).filter(Boolean));
    state.collapsed.stages = new Set((saved.stages || []).map(Number).filter(Boolean));
  } catch (error) {
    state.collapsed.projects = new Set();
    state.collapsed.stages = new Set();
  }
}

function saveCollapsedState() {
  localStorage.setItem(collapsedStorageKey, JSON.stringify({
    projects: [...state.collapsed.projects],
    stages: [...state.collapsed.stages],
  }));
}

function pruneCollapsedState() {
  const projectIds = new Set(state.projects.map((project) => Number(project.id)));
  const stageIds = new Set(state.stages.map((stage) => Number(stage.id)));
  state.collapsed.projects = new Set([...state.collapsed.projects].filter((id) => projectIds.has(Number(id))));
  state.collapsed.stages = new Set([...state.collapsed.stages].filter((id) => stageIds.has(Number(id))));
  saveCollapsedState();
}

function bindListReorder(rows) {
  let dragged = null;
  let pointerDrag = null;

  namesRows.querySelectorAll('.name-row[draggable="true"]').forEach((rowEl) => {
    rowEl.addEventListener('pointerdown', (event) => {
      if (!window.matchMedia('(max-width: 700px)').matches) return;
      if (event.pointerType === 'mouse') return;
      if (event.target.closest('button, a, input, select, textarea')) return;
      const row = rowElFor(rows, rowEl);
      if (!row) return;
      pointerDrag = {
        row,
        rowEl,
        startX: event.clientX,
        startY: event.clientY,
        active: false,
        targetEl: null,
      };
      rowEl.setPointerCapture?.(event.pointerId);
    });

    rowEl.addEventListener('pointermove', (event) => {
      if (!pointerDrag || pointerDrag.rowEl !== rowEl) return;
      const dx = Math.abs(event.clientX - pointerDrag.startX);
      const dy = Math.abs(event.clientY - pointerDrag.startY);
      if (!pointerDrag.active && Math.max(dx, dy) < 8) return;
      pointerDrag.active = true;
      event.preventDefault();
      rowEl.classList.add('is-dragging');
      const targetEl = document.elementFromPoint(event.clientX, event.clientY)?.closest?.('.name-row[draggable="true"]');
      namesRows.querySelectorAll('.is-drop-target').forEach((entry) => entry.classList.remove('is-drop-target'));
      if (!targetEl || targetEl === rowEl) {
        pointerDrag.targetEl = null;
        return;
      }
      const target = rowElFor(rows, targetEl);
      if (!targetForReorder(pointerDrag.row, target) || !canReorderRows(pointerDrag.row, target)) {
        pointerDrag.targetEl = null;
        return;
      }
      pointerDrag.targetEl = targetEl;
      targetEl.classList.add('is-drop-target');
    });

    rowEl.addEventListener('pointerup', async (event) => {
      if (!pointerDrag || pointerDrag.rowEl !== rowEl) return;
      rowEl.releasePointerCapture?.(event.pointerId);
      rowEl.classList.remove('is-dragging');
      namesRows.querySelectorAll('.is-drop-target').forEach((entry) => entry.classList.remove('is-drop-target'));
      const finishedDrag = pointerDrag;
      pointerDrag = null;
      if (!finishedDrag.active || !finishedDrag.targetEl) return;
      rowEl.dataset.justDragged = 'true';
      setTimeout(() => {
        rowEl.dataset.justDragged = '';
      }, 0);
      const target = rowElFor(rows, finishedDrag.targetEl);
      const reorderTarget = targetForReorder(finishedDrag.row, target);
      if (!reorderTarget || Number(finishedDrag.row.item.id) === Number(reorderTarget.item.id)) return;
      await reorderVisibleRows(finishedDrag.row, reorderTarget);
    });

    rowEl.addEventListener('pointercancel', (event) => {
      if (!pointerDrag || pointerDrag.rowEl !== rowEl) return;
      rowEl.releasePointerCapture?.(event.pointerId);
      rowEl.classList.remove('is-dragging');
      namesRows.querySelectorAll('.is-drop-target').forEach((entry) => entry.classList.remove('is-drop-target'));
      pointerDrag = null;
    });

    rowEl.addEventListener('dragstart', (event) => {
      if (event.target.closest('button, a, input, select, textarea')) {
        event.preventDefault();
        return;
      }
      const row = rowElFor(rows, rowEl);
      if (!row) return;
      dragged = row;
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', `${row.type}:${row.item.id}`);
      rowEl.classList.add('is-dragging');
    });

    rowEl.addEventListener('dragend', () => {
      rowEl.classList.remove('is-dragging');
      namesRows.querySelectorAll('.is-drop-target').forEach((entry) => entry.classList.remove('is-drop-target'));
      dragged = null;
    });

    rowEl.addEventListener('dragover', (event) => {
      const target = rowElFor(rows, rowEl);
      if (!targetForReorder(dragged, target)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      rowEl.classList.add('is-drop-target');
    });

    rowEl.addEventListener('dragleave', () => {
      rowEl.classList.remove('is-drop-target');
    });

    rowEl.addEventListener('drop', async (event) => {
      event.preventDefault();
      rowEl.classList.remove('is-drop-target');
      const target = rowElFor(rows, rowEl);
      const reorderTarget = targetForReorder(dragged, target);
      if (!dragged || !reorderTarget || Number(dragged.item.id) === Number(reorderTarget.item.id)) return;
      if (!canReorderRows(dragged, reorderTarget)) {
        setSaving('Items can be reordered only inside the same parent');
        setTimeout(() => setSaving(''), 1600);
        return;
      }
      await reorderVisibleRows(dragged, reorderTarget);
    });
  });
}

function rowElFor(rows, rowEl) {
  return rows.find((entry) => entry.type === rowEl.dataset.rowType && Number(entry.item.id) === Number(rowEl.dataset.id));
}

function canReorderRows(dragged, target) {
  if (!dragged || !target || dragged.type !== target.type) return false;
  return reorderScope(dragged) === reorderScope(target);
}

function targetForReorder(dragged, target) {
  if (!dragged || !target) return null;
  if (dragged.type === target.type) return target;

  if (dragged.type === 'client' && target.client) {
    return {
      type: 'client',
      item: target.client,
      client: target.client,
      text: target.client.name,
    };
  }

  if (dragged.type === 'project' && target.project) {
    return {
      type: 'project',
      item: target.project,
      client: target.client,
      project: target.project,
      text: target.project.name,
    };
  }

  if (dragged.type === 'stage' && target.stage) {
    return {
      type: 'stage',
      item: target.stage,
      client: target.client,
      project: target.project,
      stage: target.stage,
      text: target.stage.name,
    };
  }

  return null;
}

function reorderScope(row) {
  if (row.type === 'client') return 'clients';
  if (row.type === 'project') return `client:${row.client?.id}`;
  if (row.type === 'stage') return `project:${row.project?.id}`;
  if (row.type === 'task') return `stage:${row.stage?.id}`;
  return '';
}

function reorderPayload(type, scopeId, orderedIds) {
  const scopeKeys = { client: null, project: 'client_id', stage: 'project_id', task: 'stage_id' };
  if (!scopeKeys[type]) return { type, item_ids: orderedIds };
  return { type, [scopeKeys[type]]: scopeId, item_ids: orderedIds };
}

async function reorderVisibleRows(dragged, target) {
  const scopeIds = {
    client: null,
    project: Number(dragged.client?.id),
    stage: Number(dragged.project?.id),
    task: Number(dragged.stage?.id),
  };
  const scopeId = scopeIds[dragged.type];
  const itemRows = state.rows.filter((entry) => entry.type === dragged.type && reorderScope(entry) === reorderScope(dragged));
  const orderedIds = itemRows.map((entry) => Number(entry.item.id));
  const from = orderedIds.indexOf(Number(dragged.item.id));
  const to = orderedIds.indexOf(Number(target.item.id));
  if (from < 0 || to < 0 || from === to) return;

  orderedIds.splice(from, 1);
  orderedIds.splice(to, 0, Number(dragged.item.id));

  try {
    setSaving('Saving order...');
    await api('reorder', { method: 'POST', body: reorderPayload(dragged.type, scopeId, orderedIds) });
    orderedIds.forEach((id, index) => {
      const item = getCollection(dragged.type).find((entry) => Number(entry.id) === id);
      if (item) item.sort_order = (index + 1) * 10;
    });
    sortLocalCollection(dragged.type);
    buildRows();
    render();
    setSaving('Order saved');
    setTimeout(() => setSaving(''), 1400);
  } catch (error) {
    setSaving(error.message);
    await loadTimeline();
  }
}

function sortLocalCollection(type) {
  const collection = getCollection(type);
  if (type === 'client') {
    collection.sort((a, b) => Number(a.sort_order) - Number(b.sort_order) || Number(a.id) - Number(b.id));
    return;
  }
  const parentKey = type === 'project' ? 'client_id' : type === 'stage' ? 'project_id' : 'stage_id';
  collection.sort((a, b) => Number(a[parentKey]) - Number(b[parentKey]) || Number(a.sort_order) - Number(b.sort_order) || Number(a.id) - Number(b.id));
}

function renderTimeline(rows) {
  const days = daysBetween(state.range.start, state.range.end);
  const todayOffset = offsetForDate(toIso(new Date()));

  timelineRows.style.width = `${days * pxPerDay}px`;
  timelineRows.innerHTML = rows.map((row) => {
    const item = row.item;
    const hasDates = item.starts_on && item.ends_on;
    let bar = '';
    if (hasDates && row.type !== 'client') {
      const left = offsetForDate(item.starts_on) * pxPerDay;
      const durationDays = daysBetween(parseDate(item.starts_on), parseDate(item.ends_on)) + 1;
      const width = durationDays * pxPerDay;
      const link = item.crm_url ? `data-url="${escapeAttr(item.crm_url)}"` : '';
      const levelClass = `bar-level-${row.type}`;
      const doneMark = item.status === 'done' ? '<span class="done-mark" aria-label="Done">✓</span>' : '';
      const taskLoadNote = row.type === 'task' ? ` · ${durationDays}d · ${formatHours(Number(item.estimated_hours || 0))} total · ${formatHours(taskHoursPerDay(item, durationDays))}/day · ${item.planning_mode === 'daily' ? 'auto from daily hours' : 'fixed total'}` : ` · ${durationDays}d`;
      bar = `
        <div class="bar ${row.type} ${levelClass}" style="left:${left}px;width:${width}px" data-type="${row.type}" data-id="${item.id}" ${link} aria-label="${escapeAttr(row.text)}: ${item.starts_on} - ${item.ends_on}${taskLoadNote}">
          <span class="handle left" data-mode="resize-left"></span>
          ${doneMark}
          <span class="bar-label">${escapeHtml(row.text)}</span>
          <button class="bar-edit" type="button" data-bar-edit="${row.type}" data-id="${item.id}" aria-label="Edit ${escapeAttr(row.text)}">
            <i class="fa-solid fa-pen" aria-hidden="true"></i>
          </button>
          <span class="handle right" data-mode="resize-right"></span>
        </div>
      `;
    }
    const line = todayOffset >= 0 && todayOffset < days ? `<span class="today-line" style="left:${todayOffset * pxPerDay}px"></span>` : '';
    return `<div class="time-row">${line}${bar}</div>`;
  }).join('');

  timelineRows.querySelectorAll('.bar').forEach(bindDrag);
  timelineRows.querySelectorAll('.bar[data-url]').forEach((bar) => {
    bar.addEventListener('dblclick', () => window.open(bar.dataset.url, '_blank', 'noopener'));
  });
  timelineRows.querySelectorAll('[data-bar-edit]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      openEditor(button.dataset.barEdit, Number(button.dataset.id));
    });
  });
  bindHoverTooltips(timelineRows, rows);
}

function taskHoursPerDay(task, durationDays) {
  if (task.planning_mode === 'daily') {
    return Number(task.hours_per_day || 0);
  }
  const totalHours = Number(task.estimated_hours || 0);
  return totalHours && durationDays ? totalHours / durationDays : 0;
}

function bindHoverTooltips(container, rows) {
  if (!hoverTooltip) return;
  const byKey = new Map(rows.map((row) => [`${row.type}:${row.item.id}`, row]));
  container.querySelectorAll('[data-row-type], .bar[data-type]').forEach((element) => {
    const type = element.dataset.rowType || element.dataset.type;
    if (!['project', 'task'].includes(type)) return;
    const row = byKey.get(`${type}:${element.dataset.id}`);
    if (!row) return;
    element.addEventListener('mouseenter', (event) => showHoverTooltip(element, row, event));
    element.addEventListener('mousemove', (event) => positionHoverTooltip(element, event));
    element.addEventListener('focusin', () => showHoverTooltip(element, row));
    element.addEventListener('mouseleave', hideHoverTooltip);
    element.addEventListener('focusout', hideHoverTooltip);
  });
}

function showHoverTooltip(anchor, row, event = null) {
  if (!hoverTooltip) return;
  const html = tooltipHtml(row);
  if (!html) return;
  hoverTooltip.innerHTML = html;
  hoverTooltip.classList.remove('is-hidden');
  positionHoverTooltip(anchor, event);
}

function hideHoverTooltip() {
  hoverTooltip?.classList.add('is-hidden');
}

function positionHoverTooltip(anchor, event = null) {
  const rect = anchor.getBoundingClientRect();
  const tooltipRect = hoverTooltip.getBoundingClientRect();
  const viewportPadding = 10;
  const baseLeft = event
    ? event.clientX - (tooltipRect.width / 2)
    : rect.left + (rect.width / 2) - (tooltipRect.width / 2);
  const baseTop = event
    ? event.clientY + 18
    : rect.bottom + 10;
  const left = Math.min(
    Math.max(baseLeft, viewportPadding),
    window.innerWidth - tooltipRect.width - viewportPadding
  );
  const top = Math.min(
    baseTop,
    window.innerHeight - tooltipRect.height - viewportPadding
  );
  hoverTooltip.style.left = `${left}px`;
  hoverTooltip.style.top = `${Math.max(top, viewportPadding)}px`;
}

function tooltipHtml(row) {
  const item = row.item;
  const start = item.starts_on ? formatTooltipDate(item.starts_on) : '';
  const end = item.ends_on ? formatTooltipDate(item.ends_on) : '';
  const dateRange = start && end ? `${start} — ${end}` : 'No dates set';
  const stats = tooltipStats(row);
  return `
    <p class="hover-tooltip-title">${escapeHtml(row.text)}</p>
    <p class="hover-tooltip-dates">${escapeHtml(dateRange)}</p>
    <div class="hover-tooltip-stats">
      ${stats.map((entry, index) => index === 0
        ? `<span class="hover-tooltip-badge">${escapeHtml(entry)}</span>`
        : `<span>${escapeHtml(entry)}</span>`).join('')}
    </div>
  `;
}

function tooltipStats(row) {
  if (row.type === 'task') {
    const duration = row.item.starts_on && row.item.ends_on
      ? daysBetween(parseDate(row.item.starts_on), parseDate(row.item.ends_on)) + 1
      : 0;
    const total = Number(row.item.estimated_hours || 0);
    const perDay = duration ? taskHoursPerDay(row.item, duration) : Number(row.item.hours_per_day || 0);
    return [
      row.item.planning_mode === 'daily' ? 'Hours/day' : 'Fixed total',
      duration ? `${duration}d` : '0d',
      `${formatHours(total)} total`,
      `${formatHours(perDay)}/day`,
    ];
  }
  const duration = row.item.starts_on && row.item.ends_on
    ? daysBetween(parseDate(row.item.starts_on), parseDate(row.item.ends_on)) + 1
    : 0;
  const total = projectTotalHours(row.item);
  const capacity = Number(row.item.daily_capacity_hours || 0);
  return [
    statusLabels[row.item.status] || 'Project',
    duration ? `${duration}d` : 'ongoing',
    `${formatHours(total)} total`,
    capacity ? `${formatHours(capacity)}/day` : 'no limit',
  ];
}

function projectTotalHours(project) {
  const projectStages = state.stages.filter((stage) => Number(stage.project_id) === Number(project.id));
  const stageIds = new Set(projectStages.map((stage) => Number(stage.id)));
  return state.tasks
    .filter((task) => stageIds.has(Number(task.stage_id)))
    .reduce((sum, task) => sum + Number(task.estimated_hours || 0), 0);
}

function formatTooltipDate(value) {
  return String(value || '').replaceAll('-', '/');
}

function bindDrag(bar) {
  bar.addEventListener('pointerdown', (event) => {
    if (event.target.closest('[data-bar-edit]')) return;
    const handle = event.target.closest('.handle');
    const mode = handle?.dataset.mode || 'move';
    const type = bar.dataset.type;
    const id = Number(bar.dataset.id);
    const collection = type === 'stage' ? state.stages : type === 'task' ? state.tasks : state.projects;
    const item = collection.find((entry) => Number(entry.id) === id);
    if (!item) return;

    event.preventDefault();
    bar.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const originalStart = parseDate(item.starts_on);
    const originalEnd = parseDate(item.ends_on);

    const move = (moveEvent) => {
      const deltaDays = Math.round((moveEvent.clientX - startX) / pxPerDay);
      let nextStart = originalStart;
      let nextEnd = originalEnd;

      if (mode === 'move') {
        nextStart = addDays(originalStart, deltaDays);
        nextEnd = addDays(originalEnd, deltaDays);
      } else if (mode === 'resize-left') {
        nextStart = addDays(originalStart, deltaDays);
        if (nextStart > nextEnd) nextStart = nextEnd;
      } else {
        nextEnd = addDays(originalEnd, deltaDays);
        if (nextEnd < nextStart) nextEnd = nextStart;
      }

      const left = offsetForDate(toIso(nextStart)) * pxPerDay;
      const width = (daysBetween(nextStart, nextEnd) + 1) * pxPerDay;
      bar.style.left = `${left}px`;
      bar.style.width = `${width}px`;
      bar.dataset.nextStart = toIso(nextStart);
      bar.dataset.nextEnd = toIso(nextEnd);
    };

    const up = async (upEvent) => {
      bar.releasePointerCapture(upEvent.pointerId);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      const starts_on = bar.dataset.nextStart || item.starts_on;
      const ends_on = bar.dataset.nextEnd || item.ends_on;
      delete bar.dataset.nextStart;
      delete bar.dataset.nextEnd;

      if (starts_on === item.starts_on && ends_on === item.ends_on) return;

      try {
        setSaving('Saving...');
        await api(`${type}s`, { method: 'PATCH', id, body: { starts_on, ends_on } });
        await loadTimeline();
        setSaving('Saved');
        setTimeout(() => setSaving(''), 1400);
      } catch (error) {
        setSaving(error.message);
        render();
      }
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  });
}

function openEditor(type, id = null, defaults = {}) {
  editor = { type, id, addMore: false };
  editorError.textContent = '';
  clearFieldErrors();
  deleteBtn.classList.toggle('is-hidden', !id);
  saveMoreBtn.classList.toggle('is-hidden', Boolean(id) || !['project', 'stage', 'task'].includes(type));
  const item = id ? getCollection(type).find((entry) => Number(entry.id) === id) : defaults;
  editorTitle.textContent = editorTitleText(type, Boolean(id));
  editorDialog.className = `editor-dialog editor-${type}`;
  editorFields.innerHTML = fieldsFor(type, item).map(fieldHtml).join('');
  editorDialog.showModal();
  syncStatusSelectDots();
  bindTaskProjectFilter(type);
  bindTaskPlanningFields(type);
}

function editorTitleText(type, isEdit) {
  const action = isEdit ? 'Edit' : 'Add a New';
  const labels = {
    client: 'Client',
    project: 'Project',
    stage: 'Stage',
    task: 'Task',
  };
  return `${action} ${labels[type] || type}`;
}

function bindTaskProjectFilter(type) {
  if (type !== 'task') return;
  const projectInput = editorForm.elements.task_project_id;
  const stageInput = editorForm.elements.stage_id;
  if (!projectInput || !stageInput) return;

  const syncStages = () => {
    const currentStageId = stageInput.value;
    const stages = stageOptions(projectInput.value, true);
    stageInput.innerHTML = stages.map((stage) => {
      const selected = String(stage.id) === String(currentStageId);
      return `<option value="${escapeAttr(stage.id)}" ${selected ? 'selected' : ''}>${escapeHtml(stage.label)}</option>`;
    }).join('');
    if (![...stageInput.options].some((option) => option.selected)) {
      stageInput.selectedIndex = 0;
    }
  };

  projectInput.addEventListener('change', syncStages);
  syncStages();
}

function bindTaskPlanningFields(type) {
  if (type !== 'task') return;
  const modeInputs = Array.from(editorForm.querySelectorAll('input[name="planning_mode"]'));
  const totalInput = editorForm.elements.estimated_hours;
  const dailyInput = editorForm.elements.hours_per_day;
  const startInput = editorForm.elements.starts_on;
  const endInput = editorForm.elements.ends_on;
  if (!modeInputs.length || !totalInput || !dailyInput || !startInput || !endInput) return;

  const recalculate = () => {
    const duration = formDurationDays(startInput.value, endInput.value);
    const mode = modeInputs.find((input) => input.checked)?.value || 'total';
    const isDaily = mode === 'daily';
    totalInput.readOnly = isDaily;
    dailyInput.readOnly = !isDaily;
    totalInput.title = isDaily ? 'Calculated from hours/day and duration' : '';
    dailyInput.title = isDaily ? '' : 'Calculated from total hours and duration';

    if (!duration) return;
    if (isDaily) {
      totalInput.value = roundHours(Number(dailyInput.value || 0) * duration);
    } else {
      dailyInput.value = roundHours(Number(totalInput.value || 0) / duration);
    }
  };

  [...modeInputs, totalInput, dailyInput, startInput, endInput].forEach((input) => {
    input.addEventListener('input', recalculate);
    input.addEventListener('change', recalculate);
  });
  recalculate();
}

function formDurationDays(start, end) {
  if (!start || !end || end < start) return 0;
  return daysBetween(parseDate(start), parseDate(end)) + 1;
}

function roundHours(value) {
  return Number.isFinite(value) ? (Math.round(value * 100) / 100).toString() : '0';
}

function fieldsFor(type, item) {
  const commonStatus = { name: 'status', label: 'Status', type: 'select', options: statuses, value: item.status || 'planned' };
  if (type === 'client') {
    return [
      { name: 'name', label: 'Name', required: true, value: item.name, wide: true },
      { name: 'contact', label: 'Contact', value: item.contact, wide: true },
      { name: 'notes', label: 'Notes', type: 'textarea', wide: true, value: item.notes },
    ];
  }
  if (type === 'project') {
    return [
      { name: 'client_id', label: 'Client', type: 'select', required: true, options: state.clients, value: item.client_id, wide: true },
      { name: 'name', label: 'Project Title', required: true, value: item.name, wide: true },
      { name: 'budget_hours', label: 'Total hours', type: 'number', min: 0, step: 0.25, value: item.budget_hours, group: 'quarter' },
      { name: 'hourly_rate', label: 'Hourly rate, RUB', type: 'number', min: 0, step: 1, value: item.hourly_rate, group: 'quarter' },
      { name: 'daily_capacity_hours', label: 'Max hours/day', type: 'number', min: 0, step: 0.25, value: item.daily_capacity_hours, group: 'quarter' },
      { ...commonStatus, group: 'quarter' },
      { name: 'starts_on', label: 'Start', type: 'date', value: item.starts_on, group: 'half' },
      { name: 'ends_on', label: 'End', type: 'date', value: item.ends_on, group: 'half' },
      { name: 'notes', label: 'Notes', type: 'textarea', wide: true, value: item.notes, placeholder: 'Add your notes here' },
    ];
  }
  if (type === 'stage') {
    return [
      { name: 'project_id', label: 'Project', type: 'select', required: true, options: projectOptions(), value: item.project_id, wide: true },
      { name: 'name', label: 'Stage Title', required: true, value: item.name, wide: true },
      { ...commonStatus, group: 'third' },
      { name: 'starts_on', label: 'Start', type: 'date', required: true, value: item.starts_on || toIso(new Date()), group: 'third' },
      { name: 'ends_on', label: 'End', type: 'date', required: true, value: item.ends_on || toIso(addDays(new Date(), 7)), group: 'third' },
      { name: 'crm_url', label: 'CRM URL', type: 'url', wide: true, value: item.crm_url },
      { name: 'description', label: 'Description', type: 'textarea', wide: true, value: item.description, placeholder: 'Add your description here' },
    ];
  }
  const selectedStage = state.stages.find((stage) => Number(stage.id) === Number(item.stage_id));
  const selectedProjectId = item.task_project_id || selectedStage?.project_id || state.projects[0]?.id || '';
  return [
    { name: 'task_project_id', label: 'Project', type: 'select', required: true, options: projectOptions(), value: selectedProjectId, group: 'half' },
    { name: 'stage_id', label: 'Stage', type: 'select', required: true, options: stageOptions(selectedProjectId, true), value: item.stage_id, group: 'half' },
    { name: 'name', label: 'Task Title', required: true, value: item.name, group: 'half' },
    { ...commonStatus, group: 'half' },
    { name: 'planning_mode', label: 'Planning mode', type: 'radio', options: planningModes, value: item.planning_mode || 'total', wide: true },
    { name: 'estimated_hours', label: 'Total hours', type: 'number', min: 0, step: 0.25, value: item.estimated_hours || 0, group: 'half' },
    { name: 'hours_per_day', label: 'Hours/day', type: 'number', min: 0, step: 0.25, value: item.hours_per_day || 0, group: 'half' },
    { name: 'starts_on', label: 'Start', type: 'date', required: true, value: item.starts_on || toIso(new Date()), group: 'half' },
    { name: 'ends_on', label: 'End', type: 'date', required: true, value: item.ends_on || toIso(addDays(new Date(), 3)), group: 'half' },
    { name: 'crm_url', label: 'CRM URL', type: 'url', wide: true, value: item.crm_url },
    { name: 'description', label: 'Description', type: 'textarea', wide: true, value: item.description, placeholder: 'Add your description here' },
  ];
}

function fieldHtml(field) {
  const required = field.required ? ' data-required="true"' : '';
  const label = `${escapeHtml(field.label)}${field.required ? '<span class="required-mark">*</span>' : ''}`;
  const fieldClass = ['editor-field'];
  if (field.wide) fieldClass.push('wide');
  if (field.group) fieldClass.push(`field-${field.group}`);
  if (field.name === 'status') fieldClass.push('status-select-field');
  if (field.type === 'date') fieldClass.push('date-field');
  const statusValueAttr = field.name === 'status' ? ` data-status-value="${escapeAttr(field.value || 'planned')}"` : '';
  const classAttr = ` class="${fieldClass.join(' ')}"${statusValueAttr}`;
  const value = escapeAttr(field.value ?? '');
  const placeholder = field.placeholder ? ` placeholder="${escapeAttr(field.placeholder)}"` : '';
  const errorTooltip = '<span class="field-error-tooltip is-hidden" role="alert"><i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i><span>Please fill in the field.</span></span>';

  if (field.type === 'textarea') {
    return `<label${classAttr}><span>${label}</span><textarea name="${field.name}"${required}${placeholder}>${escapeHtml(field.value ?? '')}</textarea>${errorTooltip}</label>`;
  }
  if (field.type === 'select') {
    const options = field.options.map((option) => {
      const val = typeof option === 'string' ? option : option.id;
      const label = typeof option === 'string' ? statusLabels[option] : option.label || option.name;
      const projectAttr = option.project_id ? ` data-project-id="${escapeAttr(option.project_id)}"` : '';
      return `<option value="${escapeAttr(val)}"${projectAttr} ${String(val) === String(field.value) ? 'selected' : ''}>${escapeHtml(label)}</option>`;
    }).join('');
    const statusDot = field.name === 'status' ? '<span class="select-status-dot" aria-hidden="true"></span>' : '';
    return `<label${classAttr}><span>${label}</span><select name="${field.name}"${required}>${options}</select>${statusDot}${errorTooltip}</label>`;
  }
  if (field.type === 'radio') {
    const options = field.options.map((option) => `
      <label class="radio-chip">
        <input type="radio" name="${field.name}" value="${escapeAttr(option.id)}" ${String(option.id) === String(field.value) ? 'checked' : ''}>
        <span>${escapeHtml(option.label)}</span>
      </label>
    `).join('');
    return `<div${classAttr}><span>${field.label}</span><div class="radio-tabs">${options}</div></div>`;
  }
  const min = field.min !== undefined ? ` min="${escapeAttr(field.min)}"` : '';
  const step = field.step !== undefined ? ` step="${escapeAttr(field.step)}"` : '';
  const dateIcon = field.type === 'date' ? '<i class="fa-regular fa-calendar date-icon" aria-hidden="true"></i>' : '';
  return `<label${classAttr}><span>${label}</span><input name="${field.name}" type="${field.type || 'text'}" value="${value}"${min}${step}${required}${placeholder}>${dateIcon}${errorTooltip}</label>`;
}

function syncStatusSelectDots() {
  editorForm.querySelectorAll('.status-select-field select[name="status"]').forEach((select) => {
    select.closest('.status-select-field')?.setAttribute('data-status-value', select.value || 'planned');
  });
}

function updateStatusSelectFromEvent(event) {
  const select = event.target.closest?.('.status-select-field select[name="status"]');
  if (!select) return;
  select.closest('.status-select-field')?.setAttribute('data-status-value', select.value || 'planned');
}

function openDatePickerFromIcon(event) {
  const icon = event.target.closest?.('.date-icon');
  if (!icon) return;
  const input = icon.closest('.date-field')?.querySelector('input[type="date"]');
  if (!input) return;
  input.focus();
  if (typeof input.showPicker === 'function') {
    input.showPicker();
  }
}

function validateEditorRequiredFields() {
  clearFieldErrors();
  const requiredControls = Array.from(editorForm.querySelectorAll('[data-required="true"]'));
  const invalid = requiredControls.find((control) => !String(control.value || '').trim());
  if (!invalid) return true;
  setFieldError(invalid, 'Please fill in the field.');
  invalid.focus({ preventScroll: true });
  invalid.scrollIntoView({ block: 'center', inline: 'nearest' });
  return false;
}

function setFieldError(control, message) {
  const field = control.closest('.editor-field');
  if (!field) return;
  field.classList.add('is-invalid');
  control.setAttribute('aria-invalid', 'true');
  const tooltip = field.querySelector('.field-error-tooltip');
  const messageNode = tooltip?.querySelector('span');
  if (tooltip && messageNode) {
    messageNode.textContent = message;
    tooltip.classList.remove('is-hidden');
  }
}

function clearFieldErrors() {
  editorForm.querySelectorAll('.editor-field.is-invalid').forEach((field) => {
    field.classList.remove('is-invalid');
    field.querySelector('input, select, textarea')?.removeAttribute('aria-invalid');
    field.querySelector('.field-error-tooltip')?.classList.add('is-hidden');
  });
}

function clearFieldErrorFromEvent(event) {
  const control = event.target.closest?.('[data-required="true"]');
  if (!control || String(control.value || '').trim() === '') return;
  const field = control.closest('.editor-field');
  if (!field) return;
  field.classList.remove('is-invalid');
  control.removeAttribute('aria-invalid');
  field.querySelector('.field-error-tooltip')?.classList.add('is-hidden');
}

async function saveCurrent(event) {
  event.preventDefault();
  editorError.textContent = '';
  if (!validateEditorRequiredFields()) {
    editor.addMore = false;
    return;
  }
  const body = Object.fromEntries(new FormData(editorForm));
  const addMore = editor.addMore;
  editor.addMore = false;
  try {
    validateClientSide(body);
    const endpoint = `${editor.type}s`;
    const isCreate = !editor.id;
    const result = await api(endpoint, { method: editor.id ? 'PATCH' : 'POST', id: editor.id, body });
    editorDialog.close();
    if (isCreate) {
      resetFilters();
    }
    await loadTimeline();
    setSaving(isCreate ? `Created #${result.id || ''}` : 'Saved');
    setTimeout(() => setSaving(''), 1600);
    if (addMore && isCreate) {
      openEditor(editor.type, null, nextDefaults(editor.type, body));
    }
  } catch (error) {
    editorError.textContent = error.message;
    showAppError(`Save failed: ${error.message}`);
  }
}

function nextDefaults(type, previous) {
  if (type === 'project') {
    return {
      client_id: previous.client_id,
      status: previous.status || 'planned',
      starts_on: previous.starts_on,
      ends_on: previous.ends_on,
      budget_hours: previous.budget_hours,
      hourly_rate: previous.hourly_rate,
      daily_capacity_hours: previous.daily_capacity_hours,
    };
  }
  if (type === 'stage') {
    return {
      project_id: previous.project_id,
      status: previous.status || 'planned',
      color: previous.color || '#3383c0',
      starts_on: previous.starts_on,
      ends_on: previous.ends_on,
    };
  }
  if (type === 'task') {
    return {
      task_project_id: previous.task_project_id,
      stage_id: previous.stage_id,
      status: previous.status || 'planned',
      planning_mode: previous.planning_mode || 'total',
      estimated_hours: previous.estimated_hours,
      hours_per_day: previous.hours_per_day,
      starts_on: previous.starts_on,
      ends_on: previous.ends_on,
    };
  }
  return {};
}

async function deleteCurrent() {
  if (!editor.id) return;
  if (!confirm('Delete this item and nested data?')) return;
  try {
    await api(`${editor.type}s`, { method: 'DELETE', id: editor.id });
    editorDialog.close();
    await loadTimeline();
  } catch (error) {
    editorError.textContent = error.message;
  }
}

function validateClientSide(body) {
  if (body.starts_on && body.ends_on && body.ends_on < body.starts_on) {
    throw new Error('End date cannot be earlier than start date');
  }
}

async function api(action, options = {}) {
  const url = new URL(apiBase, window.location.href);
  url.searchParams.set('action', action);
  if (options.id) url.searchParams.set('id', options.id);
  url.searchParams.set('_', Date.now().toString());
  const response = await fetch(url, {
    method: options.method || 'GET',
    cache: 'no-store',
    headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch (error) {
    throw new Error('Server returned non-JSON response. Check that PHP is enabled for the subdomain.');
  }
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function getRange(rows) {
  const dates = rows.flatMap((row) => [row.item.starts_on, row.item.ends_on]).filter(Boolean).map(parseDate);
  const today = new Date();
  dates.push(addDays(today, -7), addDays(today, 45));
  const min = new Date(Math.min(...dates));
  const max = new Date(Math.max(...dates));
  return { start: addDays(min, -3), end: addDays(max, 7) };
}

function projectOptions() {
  return state.projects.map((project) => {
    const client = state.clients.find((entry) => Number(entry.id) === Number(project.client_id));
    return { id: project.id, label: `${client?.name || 'Client'} / ${project.name}` };
  });
}

function stageOptions(projectId = null, compact = false) {
  return state.stages
    .filter((stage) => !projectId || String(stage.project_id) === String(projectId))
    .map((stage) => {
    const project = state.projects.find((entry) => Number(entry.id) === Number(stage.project_id));
    return { id: stage.id, project_id: stage.project_id, label: compact ? stage.name : `${project?.name || 'Project'} / ${stage.name}` };
  });
}

function getCollection(type) {
  return state[`${type}s`];
}

function groupBy(items, key) {
  return items.reduce((acc, item) => {
    const value = item[key];
    acc[value] = acc[value] || [];
    acc[value].push(item);
    return acc;
  }, {});
}

function parseDate(value) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function addDays(date, amount) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function daysBetween(start, end) {
  return Math.round((stripTime(end) - stripTime(start)) / dayMs);
}

function offsetForDate(value) {
  return daysBetween(state.range.start, parseDate(value));
}

function stripTime(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function toIso(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function weekLabel(date) {
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()];
}

function colorForStatus(status) {
  return {
    planned: '#757575',
    in_progress: '#ABD8F5',
    waiting: '#EECD79',
    done: '#58BF95',
    paused: '#757575',
  }[status] || '#757575';
}


function scrollToday() {
  const offset = offsetForDate(toIso(new Date())) * pxPerDay;
  timelinePane.scrollTo({ left: Math.max(0, offset - 180), behavior: 'smooth' });
}

function setSaving(text) {
  saveStatus.textContent = text;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
}

function escapeAttr(value) {
  return escapeHtml(value);
}
