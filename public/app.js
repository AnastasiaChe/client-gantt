const apiBase = 'api/index.php';
const dayMs = 24 * 60 * 60 * 1000;
const pxPerDay = 28;
const dailyCapacityHours = 18;
const statuses = ['planned', 'in_progress', 'waiting', 'done', 'paused'];
const statusLabels = {
  planned: 'Planned',
  in_progress: 'In progress',
  waiting: 'Waiting',
  done: 'Done',
  paused: 'Paused',
};

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
const saveStatus = $('#saveStatus');
const appError = $('#appError');
const debugOutput = $('#debugOutput');
const editorDialog = $('#editorDialog');
const editorForm = $('#editorForm');
const editorFields = $('#editorFields');
const editorTitle = $('#editorTitle');
const editorError = $('#editorError');
const deleteBtn = $('#deleteBtn');

let editor = { type: null, id: null };

document.addEventListener('DOMContentLoaded', boot);

async function boot() {
  bindGlobalEvents();
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
  $('#resetFiltersBtn').addEventListener('click', resetFilters);
  $('#debugBtn').addEventListener('click', runDebug);
  $('#copyDebugBtn').addEventListener('click', copyDebug);

  $('#addClientBtn').addEventListener('click', () => openEditor('client'));
  $('#addProjectBtn').addEventListener('click', () => openEditor('project'));
  $('#addStageBtn').addEventListener('click', () => openEditor('stage'));
  $('#addTaskBtn').addEventListener('click', () => openEditor('task'));
  $('#closeEditorBtn').addEventListener('click', () => editorDialog.close());
  $('#cancelBtn').addEventListener('click', () => editorDialog.close());
  deleteBtn.addEventListener('click', deleteCurrent);
  editorForm.addEventListener('submit', saveCurrent);
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
    Object.assign(state, data);
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
      const label = hours > 0 ? formatHours(hours) : '';
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
    const totalHours = Number(task.estimated_hours || 0);
    if (!totalHours) return acc;
    const start = parseDate(task.starts_on);
    const end = parseDate(task.ends_on);
    const duration = daysBetween(start, end) + 1;
    const hoursPerDay = totalHours / Math.max(duration, 1);

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

function renderNames(rows) {
  namesRows.innerHTML = rows.map((row) => {
    const item = row.item;
    const status = item.status ? `<span class="status-dot status-${item.status}"></span>` : '';
    const meta = row.type === 'client' ? item.contact || '' : statusLabels[item.status] || '';
    const draggable = row.type === 'task' ? ' draggable="true"' : '';
    const rowData = `data-row-type="${row.type}" data-id="${item.id}"`;
    const childToggle = collapseButton(row);
    return `
      <div class="name-row row-${row.type}" ${rowData}${draggable}>
        <div class="name-main">
          ${childToggle}
          ${status}
          <span class="name-text" title="${escapeHtml(row.text)}">${escapeHtml(row.text)}</span>
          ${meta ? `<span class="meta">${escapeHtml(meta)}</span>` : ''}
        </div>
        <div class="row-actions">
          <button class="mini-btn icon-edit" data-edit="${row.type}" data-id="${item.id}" aria-label="Edit ${escapeAttr(row.text)}" title="Edit">
            <i class="fa-solid fa-pencil" aria-hidden="true"></i>
          </button>
        </div>
      </div>
    `;
  }).join('');

  namesRows.querySelectorAll('[data-edit]').forEach((button) => {
    button.addEventListener('click', () => openEditor(button.dataset.edit, Number(button.dataset.id)));
  });
  namesRows.querySelectorAll('[data-collapse]').forEach((button) => {
    button.addEventListener('click', () => toggleCollapse(button.dataset.collapse, Number(button.dataset.id)));
  });
  bindTaskListReorder(rows);
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
  render();
}

function bindTaskListReorder(rows) {
  let dragged = null;

  namesRows.querySelectorAll('.row-task[draggable="true"]').forEach((rowEl) => {
    rowEl.addEventListener('dragstart', (event) => {
      const row = rows.find((entry) => entry.type === 'task' && Number(entry.item.id) === Number(rowEl.dataset.id));
      if (!row) return;
      dragged = row;
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', String(row.item.id));
      rowEl.classList.add('is-dragging');
    });

    rowEl.addEventListener('dragend', () => {
      rowEl.classList.remove('is-dragging');
      namesRows.querySelectorAll('.is-drop-target').forEach((entry) => entry.classList.remove('is-drop-target'));
      dragged = null;
    });

    rowEl.addEventListener('dragover', (event) => {
      if (!dragged || Number(dragged.stage?.id) !== Number(rowElFor(rows, rowEl)?.stage?.id)) return;
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
      if (!dragged || !target || Number(dragged.item.id) === Number(target.item.id)) return;
      if (Number(dragged.stage?.id) !== Number(target.stage?.id)) {
        setSaving('Tasks can be reordered only inside one stage');
        setTimeout(() => setSaving(''), 1600);
        return;
      }
      await reorderVisibleTasks(dragged, target, rows);
    });
  });
}

function rowElFor(rows, rowEl) {
  return rows.find((entry) => entry.type === 'task' && Number(entry.item.id) === Number(rowEl.dataset.id));
}

async function reorderVisibleTasks(dragged, target, rows) {
  const stageId = Number(dragged.stage.id);
  const taskRows = rows.filter((entry) => entry.type === 'task' && Number(entry.stage?.id) === stageId);
  const orderedIds = taskRows.map((entry) => Number(entry.item.id));
  const from = orderedIds.indexOf(Number(dragged.item.id));
  const to = orderedIds.indexOf(Number(target.item.id));
  if (from < 0 || to < 0 || from === to) return;

  orderedIds.splice(from, 1);
  orderedIds.splice(to, 0, Number(dragged.item.id));

  try {
    setSaving('Saving order...');
    await api('reorder_tasks', { method: 'POST', body: { stage_id: stageId, task_ids: orderedIds } });
    orderedIds.forEach((id, index) => {
      const task = state.tasks.find((entry) => Number(entry.id) === id);
      if (task) task.sort_order = (index + 1) * 10;
    });
    state.tasks.sort((a, b) => Number(a.stage_id) - Number(b.stage_id) || Number(a.sort_order) - Number(b.sort_order) || Number(a.id) - Number(b.id));
    buildRows();
    render();
    setSaving('Order saved');
    setTimeout(() => setSaving(''), 1400);
  } catch (error) {
    setSaving(error.message);
    await loadTimeline();
  }
}

function renderTimeline(rows) {
  const days = daysBetween(state.range.start, state.range.end);
  const overlaps = findOverlaps(rows);
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
      const hasOverlap = overlaps.has(`${row.type}:${item.id}`);
      const overlap = hasOverlap ? ' overlap' : '';
      const link = item.crm_url ? `data-url="${escapeAttr(item.crm_url)}"` : '';
      const levelClass = `bar-level-${row.type}`;
      const doneMark = item.status === 'done' ? '<span class="done-mark" title="Done">✓</span>' : '';
      const overlapNote = hasOverlap ? ' · overlaps with another item' : '';
      const taskLoadNote = row.type === 'task' ? ` · ${durationDays}d · ${formatHours(Number(item.estimated_hours || 0))} total · ${formatHours(taskHoursPerDay(item, durationDays))}/day` : ` · ${durationDays}d`;
      bar = `
        <div class="bar ${row.type} ${levelClass}${overlap}" style="left:${left}px;width:${width}px" data-type="${row.type}" data-id="${item.id}" ${link} title="${escapeAttr(row.text)}: ${item.starts_on} - ${item.ends_on}${taskLoadNote}${overlapNote}">
          <span class="handle left" data-mode="resize-left"></span>
          ${doneMark}
          <span class="bar-label">${escapeHtml(row.text)}</span>
          <button class="bar-edit" type="button" data-bar-edit="${row.type}" data-id="${item.id}" aria-label="Edit ${escapeAttr(row.text)}" title="Edit">
            <i class="fa-solid fa-pencil" aria-hidden="true"></i>
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
}

function taskHoursPerDay(task, durationDays) {
  const totalHours = Number(task.estimated_hours || 0);
  return totalHours && durationDays ? totalHours / durationDays : 0;
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
        item.starts_on = starts_on;
        item.ends_on = ends_on;
        buildRows();
        render();
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

function openEditor(type, id = null) {
  editor = { type, id };
  editorError.textContent = '';
  deleteBtn.classList.toggle('is-hidden', !id);
  const item = id ? getCollection(type).find((entry) => Number(entry.id) === id) : {};
  editorTitle.textContent = `${id ? 'Edit' : 'Add'} ${type}`;
  editorFields.innerHTML = fieldsFor(type, item).map(fieldHtml).join('');
  editorDialog.showModal();
}

function fieldsFor(type, item) {
  const commonStatus = { name: 'status', label: 'Status', type: 'select', options: statuses, value: item.status || 'planned' };
  if (type === 'client') {
    return [
      { name: 'name', label: 'Name', required: true, value: item.name },
      { name: 'contact', label: 'Contact', value: item.contact },
      { name: 'notes', label: 'Notes', type: 'textarea', wide: true, value: item.notes },
    ];
  }
  if (type === 'project') {
    return [
      { name: 'client_id', label: 'Client', type: 'select', required: true, options: state.clients, value: item.client_id },
      { name: 'name', label: 'Name', required: true, value: item.name },
      commonStatus,
      { name: 'starts_on', label: 'Start', type: 'date', value: item.starts_on },
      { name: 'ends_on', label: 'End', type: 'date', value: item.ends_on },
      { name: 'notes', label: 'Notes', type: 'textarea', wide: true, value: item.notes },
    ];
  }
  if (type === 'stage') {
    return [
      { name: 'project_id', label: 'Project', type: 'select', required: true, options: projectOptions(), value: item.project_id },
      { name: 'name', label: 'Name', required: true, value: item.name },
      commonStatus,
      { name: 'color', label: 'Color', type: 'color', value: item.color || '#2563eb' },
      { name: 'starts_on', label: 'Start', type: 'date', required: true, value: item.starts_on || toIso(new Date()) },
      { name: 'ends_on', label: 'End', type: 'date', required: true, value: item.ends_on || toIso(addDays(new Date(), 7)) },
      { name: 'crm_url', label: 'CRM URL', type: 'url', wide: true, value: item.crm_url },
      { name: 'description', label: 'Description', type: 'textarea', wide: true, value: item.description },
    ];
  }
  return [
    { name: 'stage_id', label: 'Stage', type: 'select', required: true, options: stageOptions(), value: item.stage_id },
    { name: 'name', label: 'Name', required: true, value: item.name },
    commonStatus,
    { name: 'estimated_hours', label: 'Estimated hours', type: 'number', min: 0, step: 0.25, value: item.estimated_hours || 0 },
    { name: 'starts_on', label: 'Start', type: 'date', required: true, value: item.starts_on || toIso(new Date()) },
    { name: 'ends_on', label: 'End', type: 'date', required: true, value: item.ends_on || toIso(addDays(new Date(), 3)) },
    { name: 'crm_url', label: 'CRM URL', type: 'url', wide: true, value: item.crm_url },
    { name: 'description', label: 'Description', type: 'textarea', wide: true, value: item.description },
  ];
}

function fieldHtml(field) {
  const required = field.required ? ' required' : '';
  const wide = field.wide ? ' class="wide"' : '';
  const value = escapeAttr(field.value ?? '');

  if (field.type === 'textarea') {
    return `<label${wide}>${field.label}<textarea name="${field.name}">${escapeHtml(field.value ?? '')}</textarea></label>`;
  }
  if (field.type === 'select') {
    const options = field.options.map((option) => {
      const val = typeof option === 'string' ? option : option.id;
      const label = typeof option === 'string' ? statusLabels[option] : option.label || option.name;
      return `<option value="${escapeAttr(val)}" ${String(val) === String(field.value) ? 'selected' : ''}>${escapeHtml(label)}</option>`;
    }).join('');
    return `<label${wide}>${field.label}<select name="${field.name}"${required}>${options}</select></label>`;
  }
  const min = field.min !== undefined ? ` min="${escapeAttr(field.min)}"` : '';
  const step = field.step !== undefined ? ` step="${escapeAttr(field.step)}"` : '';
  return `<label${wide}>${field.label}<input name="${field.name}" type="${field.type || 'text'}" value="${value}"${min}${step}${required}></label>`;
}

async function saveCurrent(event) {
  event.preventDefault();
  editorError.textContent = '';
  const body = Object.fromEntries(new FormData(editorForm));
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
  } catch (error) {
    editorError.textContent = error.message;
    showAppError(`Save failed: ${error.message}`);
  }
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

function findOverlaps(rows) {
  const overlaps = new Set();
  const dated = rows.filter((row) => ['stage', 'task'].includes(row.type) && row.item.starts_on && row.item.ends_on);
  for (let i = 0; i < dated.length; i++) {
    for (let j = i + 1; j < dated.length; j++) {
      const a = dated[i];
      const b = dated[j];
      const sameScope = a.type === 'stage'
        ? a.project?.id === b.project?.id
        : a.stage?.id === b.stage?.id;
      if (!sameScope) continue;
      if (a.item.starts_on <= b.item.ends_on && b.item.starts_on <= a.item.ends_on) {
        overlaps.add(`${a.type}:${a.item.id}`);
        overlaps.add(`${b.type}:${b.item.id}`);
      }
    }
  }
  return overlaps;
}

function projectOptions() {
  return state.projects.map((project) => {
    const client = state.clients.find((entry) => Number(entry.id) === Number(project.client_id));
    return { id: project.id, label: `${client?.name || 'Client'} / ${project.name}` };
  });
}

function stageOptions() {
  return state.stages.map((stage) => {
    const project = state.projects.find((entry) => Number(entry.id) === Number(stage.project_id));
    return { id: stage.id, label: `${project?.name || 'Project'} / ${stage.name}` };
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
    planned: '#64748b',
    in_progress: '#2563eb',
    waiting: '#d97706',
    done: '#16a34a',
    paused: '#7c3aed',
  }[status] || '#64748b';
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
