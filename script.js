const STORAGE_KEY = 'uz_planner_data_v2';

const state = {
  tasks: [],
  habits: [],
  habitChecks: {},
  view: 'day',
  editingId: null,
  chart: null,
  trendChart: null,
  calendarDate: new Date(),
  search: ''
};

const taskListEl = document.getElementById('taskList');
const habitListEl = document.getElementById('habitList');
const habitListFullEl = document.getElementById('habitListFull');
const deadlineListEl = document.getElementById('deadlineList');
const deadlineListFullEl = document.getElementById('deadlineListFull');
const timelineEl = document.getElementById('timeline');
const calendarGridEl = document.getElementById('calendarGrid');
const calendarLabelEl = document.getElementById('calendarLabel');

const todayDateEl = document.getElementById('todayDate');
const liveClockEl = document.getElementById('liveClock');

const taskModal = document.getElementById('taskModal');
const taskNameInput = document.getElementById('taskName');
const taskStartDateInput = document.getElementById('taskStartDate');
const taskStartTimeInput = document.getElementById('taskStartTime');

// `index.html` dagi progress elementlari ID'lari bilan mos bo'lishi shart.
const dailyProgress = document.getElementById('dailyRivojlanish');
const weeklyProgress = document.getElementById('weeklyRivojlanish');
const monthlyProgress = document.getElementById('monthlyRivojlanish');
const dailyProgressText = document.getElementById('dailyRivojlanishText');
const weeklyProgressText = document.getElementById('weeklyRivojlanishText');
const monthlyProgressText = document.getElementById('monthlyRivojlanishText');

const statsDone = document.getElementById('statsDone');
const statsEfficiency = document.getElementById('statsEfficiency');
const statsTime = document.getElementById('statsTime');
const statsAvg = document.getElementById('statsAvg');
const statsPlan = document.getElementById('statsPlan');

let lastStatsHash = ''
let lastAnalyticsUpdate = 0
let lastInteraction = Date.now();
const IDLE_LIMIT = 5 * 60 * 1000;
// "Deadline" bo'lmagan rejimda notifications ishlatilmaydi.
const DEADLINE_SOON_MIN = 15;

async function loadState() {
  const storage = window.plannerStorage;
  let raw = null;
  if (storage?.read) {
    raw = await storage.read();
  }
  if (!raw) {
    raw = localStorage.getItem(STORAGE_KEY);
  }
  if (!raw) return;

  try {
    const data = JSON.parse(raw);
    state.tasks = data.tasks || [];
    state.habits = data.habits || [];
    state.habitChecks = data.habitChecks || {};
  } catch (err) {
    console.error('Ma’lumotni o‘qishda xatolik', err);
  }
}

async function saveState() {
  const payload = JSON.stringify({
    tasks: state.tasks,
    habits: state.habits,
    habitChecks: state.habitChecks
  });

  const storage = window.plannerStorage;
  if (storage?.write) {
    const res = await storage.write(payload);
    if (!res?.ok) {
      localStorage.setItem(STORAGE_KEY, payload);
    }
  } else {
    localStorage.setItem(STORAGE_KEY, payload);
  }
}

function formatDate(date) {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
}

function formatTime(date) {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

function formatDateTime(date) {
  return `${formatDate(date)} ${formatTime(date)}`;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

// Habits/timeline/analytics uchun sana-kalitni UTC emas, lokal bo‘yicha saqlaymiz.
// Shunda turli vaqt zonalarida 1 kun “siljish” bo‘lmaydi.
function getLocalDateKey(date = new Date()) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function parseLocalDateKey(key) {
  if (!key) return null;
  const parts = key.split('-');
  if (parts.length !== 3) return null;
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) return null;
  const dt = new Date(year, month - 1, day, 0, 0, 0, 0);
  if (dt.getFullYear() !== year || dt.getMonth() !== month - 1 || dt.getDate() !== day) return null;
  return dt;
}

function getUtcDateKey(date = new Date()) {
  return date.toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}

function formatDateInput(date) {
  // HTML input[type="date"] formati: YYYY-MM-DD
  return getLocalDateKey(date);
}

function formatTimeInputValue(date) {
  // HTML input[type="time"] formati: HH:MM
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function parseDateInputValue(value) {
  // YYYY-MM-DD -> Date (local 00:00)
  if (!value) return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) return null;
  const dt = new Date(year, month - 1, day, 0, 0, 0, 0);
  if (dt.getFullYear() !== year || dt.getMonth() !== month - 1 || dt.getDate() !== day) return null;
  return dt;
}

function parseTimeInputValue(value) {
  // HH:MM -> {hour, minute}
  if (!value) return null;
  const match = value.match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23) return null;
  if (minute < 0 || minute > 59) return null;
  return { hour, minute };
}

function parseDateTimeInput(value) {
  // Kiritish tolerant bo‘lsin:
  //  - kun/oy 1-2 xonali bo‘lishi mumkin (1/3 yoki 01/03)
  //  - soat/minut 1-2 xonali bo‘lishi mumkin (9:5 yoki 09:05)
  const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{1,2})$/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  if (month < 1 || month > 12) return null;
  if (hour < 0 || hour > 23) return null;
  if (minute < 0 || minute > 59) return null;
  const date = new Date(year, month - 1, day, hour, minute);
  if (Number.isNaN(date.getTime())) return null;
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

function startOfWeek(date) {
  const d = new Date(date);
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

function isSameWeek(a, b) {
  return startOfWeek(a).getTime() === startOfWeek(b).getTime();
}

function isSameMonth(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

function getStatus(task, now = new Date()) {
  if (task.completed) return { label: 'Tugadi', cls: 'done' };
  const start = new Date(task.start);
  if (task.paused) return { label: 'Pauza', cls: 'start' };
  if (now < start) return { label: 'Boshlanmadi', cls: 'start' };
  return { label: 'Jarayonda', cls: 'run' };
}

function formatDuration(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function countdown(deadline) {
  const now = new Date();
  const diff = new Date(deadline) - now;
  const sign = diff >= 0 ? 1 : -1;
  const abs = Math.abs(diff);
  const days = Math.floor(abs / (1000 * 60 * 60 * 24));
  const hours = Math.floor((abs / (1000 * 60 * 60)) % 24);
  const mins = Math.floor((abs / (1000 * 60)) % 60);
  const label = `${days}k ${hours}s ${mins}d`;
  return sign >= 0 ? label : `-${label}`;
}

function filterByView(tasks) {
  const now = new Date();
  return tasks.filter(task => {
    const d = new Date(task.start);
    if (state.view === 'day') {
      return d.toDateString() === now.toDateString();
    }
    if (state.view === 'week') {
      return isSameWeek(d, now);
    }
    return isSameMonth(d, now);
  });
}

function filterBySearch(tasks) {
  if (!state.search) return tasks;
  return tasks.filter(t => t.name.toLowerCase().includes(state.search.toLowerCase()));
}

function renderTasks() {
  taskListEl.innerHTML = '';
  const tasks = filterBySearch(filterByView(state.tasks));
  if (!tasks.length) {
    taskListEl.innerHTML = '<div class="task-card">Hozircha vazifa yo`q. + Yangi vazifa qo`shing.</div>';
    return;
  }

  tasks
    .sort((a, b) => new Date(a.start) - new Date(b.start))
    .forEach(task => {
      const now = new Date();
      const status = getStatus(task, now);
      const running = task.running;
      const currentSpent = task.timeSpent + (running ? now - new Date(task.lastStart) : 0);

      const card = document.createElement('div');
      card.className = 'task-card';

      card.innerHTML = `
        <div>
          <div class="task-title">${task.name}</div>
          <div class="task-meta">Boshlanish: ${formatDateTime(new Date(task.start))}</div>
        </div>
        <div>
          <div class="task-meta">Sarflangan vaqt</div>
          <div>${formatDuration(currentSpent)}</div>
        </div>
        <div class="task-actions">
          <span class="status ${status.cls}">${status.label}</span>
          <button class="icon-btn" data-action="toggle" data-id="${task.id}">${running ? '⏸' : '▶'}</button>
          <button class="icon-btn" data-action="pause" data-id="${task.id}">${task.paused ? '⏵' : '⏹'}</button>
          <button class="icon-btn" data-action="done" data-id="${task.id}">✓</button>
          <button class="icon-btn" data-action="edit" data-id="${task.id}">✎</button>
          <button class="icon-btn" data-action="delete" data-id="${task.id}">🗑</button>
        </div>
      `;

      taskListEl.appendChild(card);
    });
}

function computeStreak(habitId) {
  const checks = state.habitChecks[habitId] || {};
  let streak = 0;
  const today = new Date();
  for (let i = 0; i < 365; i += 1) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const keyLocal = getLocalDateKey(d);
    const keyUtc = getUtcDateKey(d);
    if (checks[keyLocal] || checks[keyUtc]) streak += 1;
    else break;
  }
  return streak;
}

function renderHabits() {
  habitListEl.innerHTML = '';
  habitListFullEl.innerHTML = '';
  const todayLocalKey = getLocalDateKey(new Date());
  const todayUtcKey = getUtcDateKey(new Date());

  if (!state.habits.length) {
    habitListEl.innerHTML = '<div class="habit-item">Hozircha odat yo`q. + Odat qo`shing.</div>';
    habitListFullEl.innerHTML = '<div class="habit-item">Hozircha odat yo`q. + Odat qo`shing.</div>';
    return;
  }

  state.habits.forEach(habit => {
    const checkedLocal = state.habitChecks[habit.id]?.[todayLocalKey];
    const checkedUtc = state.habitChecks[habit.id]?.[todayUtcKey];
    const checked = checkedLocal ?? checkedUtc ?? false;
    const streak = computeStreak(habit.id);
    const item = document.createElement('div');
    item.className = 'habit-item';
    item.innerHTML = `
      <div>
        <div>${habit.name}</div>
        <div class="habit-meta">Uzluksizlik: ${streak} kun</div>
      </div>
      <div>
        <button class="icon-btn" data-habit="toggle" data-id="${habit.id}">${checked ? '✅' : '⬜'}</button>
        <button class="icon-btn" data-habit="delete" data-id="${habit.id}">🗑</button>
      </div>
    `;
    habitListEl.appendChild(item.cloneNode(true));
    habitListFullEl.appendChild(item);
  });
}

function renderDeadlines() {
  const now = new Date();
  const upcoming = state.tasks
    .filter(task => new Date(task.deadline) >= now && !task.completed)
    .sort((a, b) => new Date(a.deadline) - new Date(b.deadline));

  const overdue = state.tasks
    .filter(task => new Date(task.deadline) < now && !task.completed)
    .sort((a, b) => new Date(a.deadline) - new Date(b.deadline));

  const renderList = (el, list) => {
    el.innerHTML = '';
    if (!list.length) {
      el.innerHTML = '<div class="deadline-item">Ma’lumot yo`q.</div>';
      return;
    }
    list.slice(0, 8).forEach(task => {
      const item = document.createElement('div');
      item.className = 'deadline-item';
      item.innerHTML = `
        <span>${task.name}</span>
        <span class="badge">${countdown(task.deadline)}</span>
      `;
      el.appendChild(item);
    });
  };

  renderList(deadlineListEl, upcoming);
  deadlineListFullEl.innerHTML = `
    <div class="deadline-item"><strong>Yaqin deadline</strong><span class="badge">${upcoming.length} ta</span></div>
  `;
  upcoming.slice(0, 10).forEach(task => {
    const item = document.createElement('div');
    item.className = 'deadline-item';
    item.innerHTML = `<span>${task.name}</span><span class="badge">${countdown(task.deadline)}</span>`;
    deadlineListFullEl.appendChild(item);
  });
  if (overdue.length) {
    const header = document.createElement('div');
    header.className = 'deadline-item';
    header.innerHTML = `<strong>Kechikkanlar</strong><span class="badge">${overdue.length} ta</span>`;
    deadlineListFullEl.appendChild(header);
    overdue.slice(0, 10).forEach(task => {
      const item = document.createElement('div');
      item.className = 'deadline-item';
      item.innerHTML = `<span>${task.name}</span><span class="badge">-${countdown(task.deadline)}</span>`;
      deadlineListFullEl.appendChild(item);
    });
  }
}

function updateProgress() {
  const now = new Date();
  const tasks = state.tasks;

  const daily = tasks.filter(t => new Date(t.start).toDateString() === now.toDateString());
  const weekly = tasks.filter(t => isSameWeek(new Date(t.start), now));
  const monthly = tasks.filter(t => isSameMonth(new Date(t.start), now));

  setProgress(daily, dailyProgress, dailyProgressText);
  setProgress(weekly, weeklyProgress, weeklyProgressText);
  setProgress(monthly, monthlyProgress, monthlyProgressText);
}

function setProgress(list, barEl, textEl) {
  // DOM elementlari topilmasa, butun app qulflanib qolmasligi uchun xavfsiz chiqib ketamiz.
  if (!barEl || !textEl) return;
  const total = list.length;
  const done = list.filter(t => t.completed).length;
  const percent = total ? Math.round((done / total) * 100) : 0;
  barEl.style.width = `${percent}%`;
  textEl.textContent = `${percent}%`;
}

function updateStats() {
  const done = state.tasks.filter(t => t.completed).length;
  const total = state.tasks.length;
  const running = total - done;
  const efficiency = total ? Math.round((done / total) * 100) : 0;

  statsDone.textContent = done;
  statsEfficiency.textContent = `${efficiency}%`;

  const totalTime = state.tasks.reduce((sum, t) => sum + t.timeSpent, 0);
  const avgTime = total ? totalTime / total : 0;
  statsTime.textContent = `${Math.round(totalTime / 3600000)} soat`;
  statsAvg.textContent = `${Math.round(avgTime / 3600000)} soat`;
  statsPlan.textContent = `${efficiency}%`;

  const hash = `${done}-${total}-${Math.round(totalTime / 60000)}`;
  const now = Date.now();
  if (hash !== lastStatsHash || now - lastAnalyticsUpdate > 30000) {
    lastStatsHash = hash;
    lastAnalyticsUpdate = now;
    updateChart({ done, running, total });
    updateTrendChart();
  }
}

function updateChart({ done, running, total }) {
  const ctx = document.getElementById('statusChart');
  if (!ctx) return;
  if (typeof Chart === 'undefined') return; // CDN yuklanmasa app qulflanmasin.

  const data = {
    labels: ['Bajarilgan', 'Jarayonda'],
    datasets: [{
      data: [done, Math.max(0, running)],
      backgroundColor: ['#8f7bff', '#62d5ff'],
      borderWidth: 0
    }]
  };

  if (state.chart) {
    state.chart.data = data;
    state.chart.update();
    return;
  }

  state.chart = new Chart(ctx, {
    type: 'doughnut',
    data,
    options: {
      plugins: {
        legend: {
          labels: { color: '#cfd7e4' }
        }
      }
    }
  });
}

function updateTrendChart() {
  const ctx = document.getElementById('trendChart');
  if (!ctx) return;
  if (typeof Chart === 'undefined') return; // CDN yuklanmasa app qulflanmasin.
  const days = 14;
  const labels = [];
  const values = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const keyLocal = getLocalDateKey(d);
    const keyUtc = getUtcDateKey(d);
    labels.push(keyLocal.slice(5));
    const count = state.tasks.filter(t => t.completedAt && (t.completedAt === keyLocal || t.completedAt === keyUtc)).length;
    values.push(count);
  }

  const data = {
    labels,
    datasets: [{
      label: 'Bajarilgan vazifalar',
      data: values,
      borderColor: '#62d5ff',
      backgroundColor: 'rgba(98, 213, 255, 0.2)',
      tension: 0.35,
      fill: true
    }]
  };

  if (state.trendChart) {
    state.trendChart.data = data;
    state.trendChart.update();
    return;
  }

  state.trendChart = new Chart(ctx, {
    type: 'line',
    data,
    options: {
      plugins: {
        legend: { labels: { color: '#cfd7e4' } }
      },
      scales: {
        x: { ticks: { color: '#a3adbe' }, grid: { color: 'rgba(255,255,255,0.05)' } },
        y: { ticks: { color: '#a3adbe' }, grid: { color: 'rgba(255,255,255,0.05)' }, beginAtZero: true }
      }
    }
  });
}

function openTaskModal(task = null) {
  taskModal.classList.add('active');
  if (task) {
    state.editingId = task.id;
    taskNameInput.value = task.name;
    const start = new Date(task.start);
    taskStartDateInput.value = formatDateInput(start);
    taskStartTimeInput.value = formatTimeInputValue(start);
    document.querySelector('.modal-header h3').textContent = 'Vazifani tahrirlash';
  } else {
    state.editingId = null;
    taskNameInput.value = '';
    taskStartDateInput.value = '';
    taskStartTimeInput.value = '';
    document.querySelector('.modal-header h3').textContent = 'Yangi vazifa';
  }
}

function closeTaskModal() {
  taskModal.classList.remove('active');
}

async function saveTask() {
  const name = taskNameInput.value.trim();
  const startDateRaw = taskStartDateInput.value;
  const startTimeRaw = taskStartTimeInput.value;

  if (!name || !startDateRaw || !startTimeRaw) {
    alert('Iltimos, barcha maydonlarni to‘ldiring.');
    return;
  }

  const startDate = parseDateInputValue(startDateRaw);
  const startTime = parseTimeInputValue(startTimeRaw);

  if (!startDate || !startTime) {
    alert('Sana/vaqtni to‘g‘ri tanlang.');
    return;
  }

  startDate.setHours(startTime.hour, startTime.minute, 0, 0);

  const start = startDate.toISOString();
  // Deadline endi kiritilmaydi. Moslik uchun deadline start bilan teng saqlanadi.
  const deadline = start;

  if (state.editingId) {
    const task = state.tasks.find(t => t.id === state.editingId);
    if (task) {
      task.name = name;
      task.start = start;
      task.deadline = deadline;
    }
  } else {
    state.tasks.push({
      id: `task_${Date.now()}`,
      name,
      start,
      deadline,
      completed: false,
      completedAt: null,
      timeSpent: 0,
      running: false,
      paused: false,
      lastStart: null,
      notifiedSoon: false,
      notifiedLate: false
    });
  }

  await saveState();
  closeTaskModal();
  renderAll();
}

async function toggleTimer(id) {
  const task = state.tasks.find(t => t.id === id);
  if (!task) return;
  if (task.running) {
    task.timeSpent += new Date() - new Date(task.lastStart);
    task.running = false;
    task.lastStart = null;
  } else {
    task.running = true;
    task.paused = false;
    task.lastStart = new Date().toISOString();
  }
  await saveState();
  renderAll();
}

async function togglePause(id) {
  const task = state.tasks.find(t => t.id === id);
  if (!task) return;
  task.paused = !task.paused;
  if (task.paused && task.running) {
    task.timeSpent += new Date() - new Date(task.lastStart);
    task.running = false;
    task.lastStart = null;
  }
  await saveState();
  renderAll();
}

async function toggleDone(id) {
  const task = state.tasks.find(t => t.id === id);
  if (!task) return;
  task.completed = !task.completed;
  task.completedAt = task.completed ? getLocalDateKey(new Date()) : null;
  if (task.completed && task.running) {
    task.timeSpent += new Date() - new Date(task.lastStart);
    task.running = false;
    task.lastStart = null;
  }
  await saveState();
  renderAll();
}

async function deleteTask(id) {
  state.tasks = state.tasks.filter(t => t.id !== id);
  await saveState();
  renderAll();
}

function renderCalendar() {
  calendarGridEl.innerHTML = '';
  const base = new Date(state.calendarDate);
  const activeKey = getLocalDateKey(state.calendarDate);

  if (state.view === 'month') {
    const first = new Date(base.getFullYear(), base.getMonth(), 1);
    const start = startOfWeek(first);
    calendarLabelEl.textContent = `${first.toLocaleString('uz-UZ', { month: 'long' })} ${first.getFullYear()}`;
    for (let i = 0; i < 42; i += 1) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const count = state.tasks.filter(t => new Date(t.start).toDateString() === d.toDateString()).length;
      const cell = document.createElement('div');
      cell.className = 'cell';
      const dateKey = getLocalDateKey(d);
      cell.dataset.dateKey = dateKey;
      if (dateKey === activeKey) cell.classList.add('active');
      cell.innerHTML = `<div class="day">${d.getDate()}</div><div class="count">${count} ta</div>`;
      calendarGridEl.appendChild(cell);
    }
  } else {
    const start = startOfWeek(base);
    calendarLabelEl.textContent = `Hafta: ${formatDate(start)} - ${formatDate(new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6))}`;
    for (let i = 0; i < 7; i += 1) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const count = state.tasks.filter(t => new Date(t.start).toDateString() === d.toDateString()).length;
      const cell = document.createElement('div');
      cell.className = 'cell';
      const dateKey = getLocalDateKey(d);
      cell.dataset.dateKey = dateKey;
      if (dateKey === activeKey) cell.classList.add('active');
      cell.innerHTML = `<div class="day">${d.toLocaleDateString('uz-UZ', { weekday: 'short', day: 'numeric' })}</div><div class="count">${count} ta</div>`;
      calendarGridEl.appendChild(cell);
    }
  }
}

function renderTimeline() {
  timelineEl.innerHTML = '';
  const base = new Date(state.calendarDate);
  const dayKey = base.toDateString();
  const tasks = state.tasks
    .filter(t => new Date(t.start).toDateString() === dayKey)
    .sort((a, b) => new Date(a.start) - new Date(b.start));

  if (!tasks.length) {
    timelineEl.innerHTML = '<div class="timeline-item">Bu kunda vazifa yo`q.</div>';
    return;
  }

  tasks.forEach(task => {
    const item = document.createElement('div');
    item.className = 'timeline-item';
    item.innerHTML = `
      <span>${formatTime(new Date(task.start))} - ${task.name}</span>
    `;
    timelineEl.appendChild(item);
  });
}

function renderAll() {
  renderTasks();
  renderHabits();
  renderCalendar();
  renderTimeline();
  updateProgress();
  updateStats();
}

function updateClock() {
  const now = new Date();
  todayDateEl.textContent = formatDate(now);
  liveClockEl.textContent = formatTime(now);
}

async function addHabit() {
  const name = prompt('Odat nomi:');
  if (!name) return;
  state.habits.push({
    id: `habit_${Date.now()}`,
    name: name.trim()
  });
  await saveState();
  renderHabits();
}

async function toggleHabit(id) {
  const todayLocalKey = getLocalDateKey(new Date());
  const todayUtcKey = getUtcDateKey(new Date());
  if (!state.habitChecks[id]) state.habitChecks[id] = {};
  const current = state.habitChecks[id]?.[todayLocalKey] ?? state.habitChecks[id]?.[todayUtcKey] ?? false;
  const next = !current;
  // Legacy ma'lumotlar uchun ikkala kalitga ham yozib ketamiz.
  state.habitChecks[id][todayLocalKey] = next;
  state.habitChecks[id][todayUtcKey] = next;
  await saveState();
  renderHabits();
}

async function deleteHabit(id) {
  state.habits = state.habits.filter(h => h.id !== id);
  delete state.habitChecks[id];
  await saveState();
  renderHabits();
}

function notify(title, body) {
  if (window.plannerStorage?.notify) {
    window.plannerStorage.notify(title, body);
  }
}

async function checkNotifications() {
  const now = new Date();
  for (const task of state.tasks) {
    if (task.completed) continue;
    const deadline = new Date(task.deadline);
    const diffMin = Math.floor((deadline - now) / 60000);
    if (diffMin <= DEADLINE_SOON_MIN && diffMin >= 0 && !task.notifiedSoon) {
      notify('Deadline yaqin', `${task.name} uchun ${diffMin} daqiqa qoldi.`);
      task.notifiedSoon = true;
    }
    if (diffMin < 0 && !task.notifiedLate) {
      notify('Deadline o‘tib ketdi', `${task.name} vazifasi kechikdi.`);
      task.notifiedLate = true;
    }
  }
  await saveState();
}

async function handleIdle() {
  const now = Date.now();
  if (now - lastInteraction < IDLE_LIMIT) return;
  const runningTasks = state.tasks.filter(t => t.running);
  if (!runningTasks.length) return;

  runningTasks.forEach(task => {
    task.timeSpent += new Date() - new Date(task.lastStart);
    task.running = false;
    task.paused = true;
    task.lastStart = null;
  });
  await saveState();
  renderTasks();
  notify('Avto-pauza', 'Siz faol emassiz. Timerlar pauza qilindi.');
}

function registerActivity() {
  lastInteraction = Date.now();
}

function initNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(btn => {
    btn.addEventListener('click', () => {
      navItems.forEach(i => i.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('main .grid').forEach(section => section.classList.add('hidden'));
      const target = document.getElementById(btn.dataset.section);
      if (target) target.classList.remove('hidden');
    });
  });
}

function initViewSwitch() {
  const chips = document.querySelectorAll('.chip');
  chips.forEach(chip => {
    chip.addEventListener('click', () => {
      chips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      state.view = chip.dataset.view;
      renderTasks();
      renderCalendar();
    });
  });
}

function exportData() {
  const data = JSON.stringify({
    tasks: state.tasks,
    habits: state.habits,
    habitChecks: state.habitChecks
  }, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `uz-planner-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

async function importData(file) {
  const reader = new FileReader();
  reader.onload = async e => {
    try {
      const data = JSON.parse(e.target.result);
      state.tasks = data.tasks || [];
      state.habits = data.habits || [];
      state.habitChecks = data.habitChecks || {};
      await saveState();
      renderAll();
    } catch (err) {
      alert('JSON formatida xatolik bor.');
    }
  };
  reader.readAsText(file);
}

async function resetData() {
  if (!confirm('Barcha ma’lumotlar o‘chiriladi. Davom etasizmi?')) return;
  state.tasks = [];
  state.habits = [];
  state.habitChecks = {};
  await saveState();
  renderAll();
}

function attachEvents() {
  document.getElementById('openTaskModal').addEventListener('click', () => openTaskModal());
  document.getElementById('closeTaskModal').addEventListener('click', closeTaskModal);
  document.getElementById('cancelTask').addEventListener('click', closeTaskModal);
  document.getElementById('saveTask').addEventListener('click', saveTask);

  taskListEl.addEventListener('click', event => {
    const btn = event.target.closest('button');
    if (!btn) return;
    const id = btn.dataset.id;
    if (!id) return;
    if (btn.dataset.action === 'toggle') toggleTimer(id);
    if (btn.dataset.action === 'pause') togglePause(id);
    if (btn.dataset.action === 'done') toggleDone(id);
    if (btn.dataset.action === 'delete') deleteTask(id);
    if (btn.dataset.action === 'edit') {
      const task = state.tasks.find(t => t.id === id);
      if (task) openTaskModal(task);
    }
  });

  document.getElementById('addHabitBtn').addEventListener('click', addHabit);
  document.getElementById('addHabitBtn2').addEventListener('click', addHabit);

  habitListEl.addEventListener('click', event => {
    const btn = event.target.closest('button');
    if (!btn) return;
    const id = btn.dataset.id;
    if (!id) return;
    if (btn.dataset.habit === 'toggle') toggleHabit(id);
    if (btn.dataset.habit === 'delete') deleteHabit(id);
  });

  habitListFullEl.addEventListener('click', event => {
    const btn = event.target.closest('button');
    if (!btn) return;
    const id = btn.dataset.id;
    if (!id) return;
    if (btn.dataset.habit === 'toggle') toggleHabit(id);
    if (btn.dataset.habit === 'delete') deleteHabit(id);
  });

  document.getElementById('exportData').addEventListener('click', exportData);
  document.getElementById('importData').addEventListener('click', () => document.getElementById('importFile').click());
  document.getElementById('importFile').addEventListener('change', event => {
    const file = event.target.files[0];
    if (file) importData(file);
  });
  document.getElementById('resetData').addEventListener('click', resetData);

  document.getElementById('prevPeriod').addEventListener('click', () => {
    if (state.view === 'month') {
      state.calendarDate.setMonth(state.calendarDate.getMonth() - 1);
    } else {
      state.calendarDate.setDate(state.calendarDate.getDate() - 7);
    }
    renderCalendar();
    renderTimeline();
  });
  document.getElementById('nextPeriod').addEventListener('click', () => {
    if (state.view === 'month') {
      state.calendarDate.setMonth(state.calendarDate.getMonth() + 1);
    } else {
      state.calendarDate.setDate(state.calendarDate.getDate() + 7);
    }
    renderCalendar();
    renderTimeline();
  });

  // Kalendardagi kunni bosib tanlash (timeline shu kundagi vazifalarni ko'rsatadi)
  calendarGridEl.addEventListener('click', event => {
    const cell = event.target.closest('.cell');
    if (!cell) return;
    const dateKey = cell.dataset.dateKey;
    const dt = parseLocalDateKey(dateKey);
    if (!dt) return;
    state.calendarDate = dt;
    renderCalendar();
    renderTimeline();
  });

  document.getElementById('searchInput').addEventListener('input', event => {
    state.search = event.target.value.trim();
    renderTasks();
  });

  ['mousemove', 'keydown', 'click'].forEach(evt => window.addEventListener(evt, registerActivity));
}

async function init() {
  try {
    await loadState();
    initNavigation();
    initViewSwitch();
    attachEvents();
    renderAll();
    updateClock();

    setInterval(() => {
      updateClock();
      // Modal ochiq bo'lsa, fonni render qilmaymiz: input maydoni "lipillab" ko'rinishi mumkin.
      if (!taskModal.classList.contains('active')) {
        renderTasks();
      }
      if (!taskModal.classList.contains('active')) {
        handleIdle();
      }
    }, 1000);

    setInterval(() => {
      // Modal ochiq bo'lsa, statistikani ham yangilamaymiz.
      if (!taskModal.classList.contains('active')) {
        updateStats();
        updateProgress();
      }
    }, 5000);
  } catch (err) {
    console.error('App init xatoligi:', err);
    alert(`App ishga tushmadi: ${err?.message || err}`);
  }
}

init();











