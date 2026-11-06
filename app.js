/* Tracker de tareas :D: aplicación personal, estática y sin dependencias. Toda la persistencia vive en localStorage. */
(() => {
  'use strict';

  const STORAGE_KEY = 'ritmo.personal.v1';
  const DAY_NAMES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
  const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
  const app = document.getElementById('app');
  const toastEl = document.getElementById('toast');

  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);
  const localDate = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const dateFromKey = key => { const [y, m, d] = String(key).split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); };
  const addDays = (key, amount) => { const d = dateFromKey(key); d.setDate(d.getDate() + amount); return localDate(d); };
  const mondayOf = key => { const d = dateFromKey(key); const shift = (d.getDay() + 6) % 7; d.setDate(d.getDate() - shift); return localDate(d); };
  const weekdayIndex = key => (dateFromKey(key).getDay() + 6) % 7;
  const formatDate = (key, options = { day: 'numeric', month: 'short' }) => dateFromKey(key).toLocaleDateString('es-CL', options);
  const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  const deepCopy = value => JSON.parse(JSON.stringify(value));

  const initialState = () => ({
    version: 1,
    habits: [],
    habitLogs: {},
    tasks: [],
    projects: [],
    settings: { theme: 'light' }
  });

  function normalizeState(raw) {
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.habits) || !Array.isArray(raw.tasks) || !Array.isArray(raw.projects)) {
      throw new Error('El archivo no tiene el formato esperado para Tracker de tareas :D.');
    }
    const clean = initialState();
    clean.habits = raw.habits.filter(x => x && typeof x === 'object' && x.id && x.name).map(h => ({
      id: String(h.id), name: String(h.name), description: String(h.description || ''), goal: String(h.goal || ''),
      startDate: /^\d{4}-\d{2}-\d{2}$/.test(h.startDate || '') ? h.startDate : localDate(),
      status: h.status === 'paused' ? 'paused' : 'active',
      frequency: ['daily', 'weekdays', 'alternate', 'weekly'].includes(h.frequency?.type) ? {
        type: h.frequency.type,
        days: Array.isArray(h.frequency.days) ? h.frequency.days.map(Number).filter(n => n >= 0 && n <= 6) : [],
        times: Math.max(1, Math.min(7, Number(h.frequency.times) || 1))
      } : { type: 'daily', days: [], times: 1 },
      pausePeriods: Array.isArray(h.pausePeriods) ? h.pausePeriods.filter(p => p && /^\d{4}-\d{2}-\d{2}$/.test(p.from || '')).map(p => ({ from: p.from, to: /^\d{4}-\d{2}-\d{2}$/.test(p.to || '') ? p.to : null })) : []
    }));
    clean.habitLogs = raw.habitLogs && typeof raw.habitLogs === 'object' && !Array.isArray(raw.habitLogs) ? raw.habitLogs : {};
    clean.tasks = raw.tasks.filter(x => x && typeof x === 'object' && x.id && x.name).map(t => ({
      id: String(t.id), name: String(t.name), description: String(t.description || ''),
      category: ['urgent', 'soon', 'later'].includes(t.category) ? t.category : 'soon',
      dueDate: /^\d{4}-\d{2}-\d{2}$/.test(t.dueDate || '') ? t.dueDate : '',
      createdAt: t.createdAt || new Date().toISOString(), completedAt: t.completedAt || null,
      status: t.status === 'completed' ? 'completed' : 'pending'
    }));
    clean.projects = raw.projects.filter(x => x && typeof x === 'object' && x.id && x.name).map(p => ({
      id: String(p.id), name: String(p.name), description: String(p.description || ''), notes: String(p.notes || ''),
      status: ['active', 'paused', 'finished'].includes(p.status) ? p.status : 'active',
      progress: p.progress === '' || p.progress === null || p.progress === undefined ? null : Math.max(0, Math.min(100, Number(p.progress) || 0)),
      milestones: Array.isArray(p.milestones) ? p.milestones.filter(m => m && m.id && m.text).map(m => ({ id: String(m.id), text: String(m.text), done: !!m.done })) : [],
      logs: Array.isArray(p.logs) ? p.logs.filter(l => l && l.id && l.text).map(l => ({ id: String(l.id), text: String(l.text), date: /^\d{4}-\d{2}-\d{2}$/.test(l.date || '') ? l.date : localDate() })) : []
    }));
    clean.settings.theme = raw.settings?.theme === 'dark' ? 'dark' : 'light';
    return clean;
  }

  let storageProblem = '';
  let state;
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    state = saved ? normalizeState(JSON.parse(saved)) : initialState();
  } catch (error) {
    state = initialState();
    storageProblem = error instanceof SyntaxError ? 'Los datos guardados no se pudieron leer. Importa una copia de seguridad para recuperarlos.' : 'El navegador bloqueó el almacenamiento local. Revisa sus permisos o abre la aplicación desde una dirección HTTPS.';
  }

  const ui = { tab: 'home', modal: null, calendarHabit: '', calendarMonth: new Date().getMonth(), calendarYear: new Date().getFullYear(), taskFilter: 'all' };
  let toastTimer;
  function applyTheme() {
    document.documentElement.dataset.theme = state.settings.theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = state.settings.theme === 'dark' ? '#151622' : '#f6f7fb';
  }
  applyTheme();

  function persist() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      storageProblem = '';
      return true;
    } catch (error) {
      storageProblem = 'No se pudieron guardar los cambios. El almacenamiento del navegador podría estar lleno o bloqueado.';
      return false;
    }
  }

  function commit(message) {
    const saved = persist();
    render();
    if (message) showToast(saved ? message : 'Cambio hecho en esta sesión; no se pudo guardar en este navegador.');
  }

  function showToast(message) {
    toastEl.textContent = message;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2400);
  }

  const icon = (name) => {
    const paths = {
      spark: '<path d="m12 3 1.6 5.4L19 10l-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6L12 3Z"/><path d="m19 16 .8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z"/>',
      home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1V10Z"/>',
      habit: '<path d="M20 7 10 17l-5-5"/><path d="M12 3a9 9 0 1 0 9 9"/>',
      tasks: '<rect x="4" y="4" width="16" height="17" rx="2"/><path d="M8 9h8M8 13h8M8 17h5M9 2v4M15 2v4"/>',
      project: '<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H10l2 2h6.5A2.5 2.5 0 0 1 21 9.5v8a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5v-10Z"/><path d="M12 11v6M9 14h6"/>',
      settings: '<circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1 1.1.9-1.1 1.9-1.4-.5a7.8 7.8 0 0 1-1.6.9l-.3 1.5h-2.2l-.3-1.5a7.8 7.8 0 0 1-1.6-.9l-1.4.5-1.1-1.9 1.1-.9a6.5 6.5 0 0 1 0-1.9l-1.1-.9 1.1-1.9 1.4.5a7.8 7.8 0 0 1 1.6-.9l.3-1.5h2.2l.3 1.5a7.8 7.8 0 0 1 1.6.9l1.4-.5 1.1 1.9-1.1.9a6.5 6.5 0 0 1 0 1.9Z"/>',
      plus: '<path d="M12 5v14M5 12h14"/>',
      edit: '<path d="m15 5 4 4M4 20l4-.8L19 8a2.1 2.1 0 0 0-3-3L5 16l-1 4Z"/>',
      trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 14h10l1-14M9 7V4h6v3"/>',
      left: '<path d="m15 18-6-6 6-6"/>', right: '<path d="m9 18 6-6-6-6"/>',
      download: '<path d="M12 3v12m0 0 4-4m-4 4-4-4M5 17v3h14v-3"/>',
      upload: '<path d="M12 15V3m0 0L8 7m4-4 4 4M5 17v3h14v-3"/>',
      moon: '<path d="M20.5 14.5A8 8 0 0 1 9.5 3.5 8.5 8.5 0 1 0 20.5 14.5Z"/>',
      close: '<path d="m18 6-12 12M6 6l12 12"/>',
      clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'
    };
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || ''}</svg>`;
  };

  const pendingTasks = () => state.tasks.filter(t => t.status === 'pending');
  const completedTasks = () => state.tasks.filter(t => t.status === 'completed');
  let today = localDate();
  const getHabitLogs = id => state.habitLogs[id] || {};
  const isDone = (id, date) => !!getHabitLogs(id)[date];

  function habitPausedOn(habit, date) {
    return (habit.pausePeriods || []).some(p => date >= p.from && (!p.to || date <= p.to));
  }

  function habitIsDue(habit, date) {
    if (date < habit.startDate || habitPausedOn(habit, date)) return false;
    const type = habit.frequency.type;
    if (type === 'daily') return true;
    if (type === 'weekdays') return (habit.frequency.days || []).includes(weekdayIndex(date));
    if (type === 'alternate') {
      const diff = Math.round((dateFromKey(date) - dateFromKey(habit.startDate)) / 86400000);
      return diff >= 0 && diff % 2 === 0;
    }
    // Una meta semanal tiene su único día de revisión el domingo; las sesiones se pueden anotar cualquier día.
    return weekdayIndex(date) === 6;
  }

  function weeklyCount(habit, date) {
    const start = mondayOf(date);
    const end = addDays(start, 6);
    const logs = getHabitLogs(habit.id);
    return Object.keys(logs).filter(day => day >= start && day <= end && logs[day]).length;
  }

  function weeklyRequired(habit, sunday) {
    let eligible = 0;
    const start = mondayOf(sunday);
    for (let i = 0; i < 7; i++) {
      const day = addDays(start, i);
      if (day >= habit.startDate && !habitPausedOn(habit, day)) eligible++;
    }
    return eligible ? Math.min(habit.frequency.times, Math.max(1, Math.ceil(habit.frequency.times * eligible / 7))) : 0;
  }

  function dueStatus(habit, date) {
    if (date > today || date < habit.startDate || habitPausedOn(habit, date)) return 'skip';
    if (habit.frequency.type === 'weekly') {
      if (weekdayIndex(date) !== 6) return isDone(habit.id, date) ? 'complete' : 'skip';
      const required = weeklyRequired(habit, date);
      return weeklyCount(habit, date) >= required ? 'complete' : 'pending';
    }
    if (isDone(habit.id, date)) return 'complete';
    if (!habitIsDue(habit, date)) return 'skip';
    return 'pending';
  }

  function frequencyLabel(habit) {
    const f = habit.frequency;
    if (f.type === 'daily') return 'Cada día';
    if (f.type === 'alternate') return 'Día por medio';
    if (f.type === 'weekly') return `${f.times} ${f.times === 1 ? 'vez' : 'veces'} por semana`;
    const chosen = f.days.length ? f.days.map(i => DAY_NAMES[i]).join(', ') : 'sin días elegidos';
    return chosen;
  }

  function habitTodaySubtitle(habit) {
    if (habit.status === 'paused' || habitPausedOn(habit, today)) return 'En pausa';
    if (habit.frequency.type === 'weekly') {
      const count = weeklyCount(habit, today);
      const required = weeklyRequired(habit, today);
      return `${count}/${required || habit.frequency.times} esta semana · ${habit.goal || frequencyLabel(habit)}`;
    }
    return `${frequencyLabel(habit)}${habit.goal ? ` · ${habit.goal}` : ''}`;
  }

  function isScheduledToday(habit) {
    return habit.frequency.type === 'weekly' ? weekdayIndex(today) === 6 && habitIsDue(habit, today) : habitIsDue(habit, today);
  }

  function pageHeader(title, subtitle, action = '') {
    return `<div class="page-head"><div><p class="eyebrow">${escapeHTML(today === localDate() ? formatDate(today, { weekday: 'long', day: 'numeric', month: 'long' }) : '')}</p><h1>${title}</h1>${subtitle ? `<p class="subtitle">${subtitle}</p>` : ''}</div>${action}</div>`;
  }

  function emptyState(title, text, button = '') {
    return `<div class="card empty"><div class="empty-icon">${icon('spark')}</div><strong>${title}</strong><p>${text}</p>${button ? `<div style="margin-top:14px">${button}</div>` : ''}</div>`;
  }

  function habitRow(habit, { compact = false, showCheck = true } = {}) {
    const checked = isDone(habit.id, today);
    const paused = habit.status === 'paused' || habitPausedOn(habit, today);
    const notScheduledToday = !paused && !isScheduledToday(habit);
    return `<article class="card habit-row">
      <input ${showCheck ? '' : 'style="display:none"'} class="habit-check" type="checkbox" aria-label="Marcar ${escapeHTML(habit.name)} como completado hoy" data-action="toggle-habit" data-id="${escapeHTML(habit.id)}" ${checked ? 'checked' : ''} ${paused ? 'disabled' : ''}>
      <div class="habit-info"><div class="habit-title-line"><h3>${escapeHTML(habit.name)}</h3>${paused ? '<span class="tag orange">En pausa</span>' : ''}${notScheduledToday ? `<span class="tag">${habit.frequency.type === 'weekly' ? 'Meta semanal' : 'No toca hoy'}</span>` : ''}${checked ? '<span class="tag green">Hecho hoy</span>' : ''}</div><p>${escapeHTML(compact ? habitTodaySubtitle(habit) : `${habit.description || frequencyLabel(habit)}${habit.goal ? ` · Objetivo: ${habit.goal}` : ''}`)}</p></div>
      ${compact ? '' : `<div class="row-actions"><button class="icon-btn" aria-label="Editar hábito" title="Editar" data-action="edit-habit" data-id="${escapeHTML(habit.id)}">${icon('edit')}</button><button class="icon-btn" aria-label="Eliminar hábito" title="Eliminar" data-action="delete-habit" data-id="${escapeHTML(habit.id)}">${icon('trash')}</button></div>`}
    </article>`;
  }

  function taskCard(task, { history = false } = {}) {
    const categoryLabel = { urgent: 'Urgente', soon: 'Pronto', later: 'Después' }[task.category];
    const overdue = task.status === 'pending' && task.dueDate && task.dueDate < today;
    return `<article class="card task-card">
      <input class="task-check" type="checkbox" aria-label="${history ? 'Reabrir' : 'Completar'} ${escapeHTML(task.name)}" data-action="toggle-task" data-id="${escapeHTML(task.id)}" ${history ? 'checked' : ''}>
      <div class="task-main"><h3 class="${history ? 'strikethrough' : ''}">${escapeHTML(task.name)}</h3>${task.description ? `<p>${escapeHTML(task.description)}</p>` : ''}<div class="task-meta"><span class="tag ${overdue ? 'red' : task.category === 'urgent' ? 'orange' : ''}">${categoryLabel}</span>${task.dueDate ? `<span class="${overdue ? 'tag red' : ''}">${overdue ? 'Vencida · ' : 'Límite · '}${escapeHTML(formatDate(task.dueDate))}</span>` : ''}${history ? `<span>Completada ${escapeHTML(task.completedAt ? formatDate(localDate(new Date(task.completedAt))) : '')}</span>` : ''}</div></div>
      ${history ? `<button class="icon-btn" aria-label="Eliminar tarea del historial" data-action="delete-task" data-id="${escapeHTML(task.id)}">${icon('trash')}</button>` : `<select class="task-select" aria-label="Cambiar categoría" data-action="move-task" data-id="${escapeHTML(task.id)}"><option value="urgent" ${task.category === 'urgent' ? 'selected' : ''}>Urgente</option><option value="soon" ${task.category === 'soon' ? 'selected' : ''}>Pronto</option><option value="later" ${task.category === 'later' ? 'selected' : ''}>Después</option></select><button class="icon-btn" aria-label="Editar tarea" data-action="edit-task" data-id="${escapeHTML(task.id)}">${icon('edit')}</button><button class="icon-btn" aria-label="Eliminar tarea" data-action="delete-task" data-id="${escapeHTML(task.id)}">${icon('trash')}</button>`}
    </article>`;
  }

  function projectProgress(project) {
    if (project.progress !== null && project.progress !== undefined) return project.progress;
    if (project.milestones.length) return Math.round(project.milestones.filter(m => m.done).length * 100 / project.milestones.length);
    return 0;
  }

  function projectCard(project, { compact = false } = {}) {
    const status = { active: 'Activo', paused: 'En pausa', finished: 'Terminado' }[project.status];
    const progress = projectProgress(project);
    const milestones = !compact && project.milestones.length ? `<ul class="milestones">${project.milestones.map(m => `<li class="milestone ${m.done ? 'done' : ''}"><input type="checkbox" aria-label="${m.done ? 'Reabrir' : 'Completar'} ${escapeHTML(m.text)}" data-action="toggle-milestone" data-project="${escapeHTML(project.id)}" data-id="${escapeHTML(m.id)}" ${m.done ? 'checked' : ''}><span>${escapeHTML(m.text)}</span><button class="icon-btn" style="width:28px;height:28px" aria-label="Eliminar objetivo" data-action="delete-milestone" data-project="${escapeHTML(project.id)}" data-id="${escapeHTML(m.id)}">${icon('close')}</button></li>`).join('')}</ul>` : '';
    const latestLogs = !compact ? [...project.logs].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4) : [];
    return `<article class="card project-card"><div class="project-top"><div class="project-copy"><div class="habit-title-line"><h3>${escapeHTML(project.name)}</h3><span class="tag ${project.status === 'active' ? 'green' : 'orange'}">${status}</span></div>${project.description ? `<p>${escapeHTML(project.description)}</p>` : ''}</div><div class="row-actions"><button class="icon-btn" aria-label="Editar proyecto" data-action="edit-project" data-id="${escapeHTML(project.id)}">${icon('edit')}</button><button class="icon-btn" aria-label="Eliminar proyecto" data-action="delete-project" data-id="${escapeHTML(project.id)}">${icon('trash')}</button></div></div>
      ${project.notes && !compact ? `<p class="footnote">${escapeHTML(project.notes)}</p>` : ''}
      <div class="project-progress"><div class="progress-line"><span style="width:${progress}%"></span></div><small><span>Progreso</span><span>${progress}%</span></small></div>
      ${milestones}
      ${!compact ? `<form class="inline-form" data-form="milestone" data-project="${escapeHTML(project.id)}"><input aria-label="Nuevo objetivo pequeño" name="milestone" required maxlength="100" placeholder="Añadir un pequeño objetivo"><button class="btn secondary small" type="submit" aria-label="Añadir objetivo">${icon('plus')}</button></form><form class="inline-form" data-form="project-log" data-project="${escapeHTML(project.id)}"><input aria-label="Registrar un avance" name="log" required maxlength="300" placeholder="¿Qué avanzaste hoy?"><button class="btn small" type="submit">Registrar</button></form>${latestLogs.length ? `<div class="log-list">${latestLogs.map(l => `<div class="log-item"><i class="log-dot"></i><div>${escapeHTML(l.text)}<time>${escapeHTML(formatDate(l.date, { day: 'numeric', month: 'short', year: 'numeric' }))}</time></div></div>`).join('')}</div>` : '<p class="footnote">Todavía no hay avances. Anota cualquier paso pequeño.</p>'}` : ''}
    </article>`;
  }

  function renderHome() {
    const activeHabits = state.habits.filter(h => h.status === 'active');
    const dailyHabits = activeHabits.filter(isScheduledToday);
    const dailyDone = dailyHabits.filter(h => dueStatus(h, today) === 'complete').length;
    const dailyTotal = dailyHabits.length;
    const ratio = dailyTotal ? Math.round(dailyDone * 100 / dailyTotal) : 0;
    const urgent = pendingTasks().filter(t => t.category === 'urgent' || (t.dueDate && t.dueDate <= today)).sort(taskSort).slice(0, 3);
    const upcoming = pendingTasks().filter(t => t.category !== 'urgent' && (!t.dueDate || t.dueDate > today)).sort(taskSort).slice(0, 3);
    const projects = state.projects.filter(p => p.status === 'active').slice(0, 2);
    const addHabit = `<button class="btn small" data-action="open-modal" data-modal="habit">${icon('plus')} Hábito</button>`;
    return `${pageHeader('Holaaa, anota tus tareas y revisa tu avance :3', 'De a poquito uwu')}
      ${storageProblem ? `<div class="notice error" style="margin-bottom:14px">${escapeHTML(storageProblem)}</div>` : ''}
      <section class="card hero-card"><div class="hero-top"><div><p class="eyebrow">Progreso de hábitos hoy</p><h2>${dailyDone === dailyTotal && dailyTotal ? '¡Buen trabajo!' : 'Por hacer'}</h2></div><div class="hero-number">${dailyDone}<span style="font-size:15px;opacity:.75"> / ${dailyTotal}</span></div></div><div class="progress-track"><div class="progress-fill" style="width:${ratio}%"></div></div><p class="hero-caption">${dailyTotal ? `${ratio}% de tus hábitos programados para hoy` : activeHabits.length ? 'Hoy no hay hábitos programados; puedes registrar una sesión semanal cuando quieras.' : 'Añade un hábito para comenzar a registrar tu progreso'}</p></section>
      <section class="section"><div class="section-head"><div><h2>Tus hábitos</h2><p>Los días sin actividad prevista no cuentan como pendientes.</p></div>${addHabit}</div><div class="stack">${activeHabits.length ? activeHabits.slice(0, 5).map(h => habitRow(h, { compact: true })).join('') : emptyState('Empieza con algo pequeño', 'Crea un hábito y registra cómo te va día a día.', `<button class="btn small" data-action="open-modal" data-modal="habit">${icon('plus')} Crear hábito</button>`)}</div>${activeHabits.length > 5 ? '<p class="footnote">Y algunos más. En Hábitos puedes verlos todos.</p>' : ''}</section>
      <section class="section"><div class="section-head"><div><h2>Urgente</h2><p>Tareas prioritarias o con fecha vencida.</p></div><button class="text-btn" data-action="set-tab" data-tab="tasks">Ver tareas</button></div><div class="stack">${urgent.length ? urgent.map(t => taskCard(t)).join('') : '<div class="card empty"><strong>Sin urgencias por ahora</strong><p>Tu espacio está listo para lo importante.</p></div>'}</div></section>
      <section class="section"><div class="section-head"><div><h2>Próximas tareas</h2><p>Lo que sigue cuando tengas un momento.</p></div><button class="icon-btn" aria-label="Añadir tarea" data-action="open-modal" data-modal="task">${icon('plus')}</button></div><div class="stack">${upcoming.length ? upcoming.map(t => taskCard(t)).join('') : '<div class="card empty"><strong>No hay tareas próximas</strong><p>Guarda aquí las cosas que quieres resolver después.</p></div>'}</div></section>
      <section class="section"><div class="section-head"><div><h2>Proyectos personales</h2><p>Avanza a tu manera, sin presión diaria.</p></div><button class="text-btn" data-action="set-tab" data-tab="projects">Ver proyectos</button></div><div class="stack">${projects.length ? projects.map(p => projectCard(p, { compact: true })).join('') : '<div class="card empty"><strong>¿Qué te gustaría explorar?</strong><p>Un proyecto puede avanzar cuando tengas tiempo.</p><div style="margin-top:12px"><button class="btn secondary small" data-action="set-tab" data-tab="projects">Crear proyecto</button></div></div>'}</div></section>`;
  }

  function calendarFor(habit) {
    const { calendarMonth: month, calendarYear: year } = ui;
    const first = new Date(year, month, 1);
    const offset = (first.getDay() + 6) % 7;
    const count = new Date(year, month + 1, 0).getDate();
    const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
    let cells = '';
    for (let i = 0; i < offset; i++) cells += '<div></div>';
    for (let day = 1; day <= count; day++) {
      const key = `${monthKey}-${String(day).padStart(2, '0')}`;
      const status = dueStatus(habit, key);
      const label = status === 'complete' ? 'completado' : status === 'pending' ? 'pendiente' : 'no correspondía';
      cells += `<div class="calendar-cell ${status} ${key === today ? 'today' : ''}" aria-label="${day}: ${label}"><span>${day}</span>${status !== 'skip' ? '<i class="state-dot"></i>' : ''}</div>`;
    }
    let complete = 0;
    let denominator = 0;
    if (habit.frequency.type === 'weekly') {
      for (let day = 1; day <= count; day++) {
        const key = `${monthKey}-${String(day).padStart(2, '0')}`;
        if (key <= today && key >= habit.startDate && weekdayIndex(key) === 6 && !habitPausedOn(habit, key)) {
          const required = weeklyRequired(habit, key);
          if (required) { denominator++; if (weeklyCount(habit, key) >= required) complete++; }
        }
      }
    } else {
      const dueDates = Array.from({ length: count }, (_, i) => {
        const key = `${monthKey}-${String(i + 1).padStart(2, '0')}`;
        return dueStatus(habit, key);
      }).filter(s => s === 'complete' || s === 'pending');
      complete = dueDates.filter(s => s === 'complete').length;
      denominator = dueDates.length;
    }
    const percent = denominator ? Math.round(complete * 100 / denominator) : 0;
    const progressLabel = habit.frequency.type === 'weekly' ? `Semanas cumplidas: <strong>${complete} de ${denominator} revisadas (${percent}%)</strong>. Las sesiones se registran en sus días; solo se revisa la meta el domingo.` : `Cumplimiento del mes: <strong>${percent}%</strong> (${complete} de ${denominator} días programados). Los días sin actividad prevista no cuentan.`;
    return `<div class="card calendar-card"><div class="calendar-controls"><button class="icon-btn" aria-label="Mes anterior" data-action="calendar-shift" data-delta="-1">${icon('left')}</button><div class="calendar-title">${escapeHTML(first.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' }))}</div><button class="icon-btn" aria-label="Mes siguiente" data-action="calendar-shift" data-delta="1">${icon('right')}</button></div><div class="calendar-grid">${DAY_NAMES.map(d => `<div class="calendar-day-name">${d}</div>`).join('')}${cells}</div><div class="legend"><span><i></i>Completado</span><span><i class="pending-dot"></i>Pendiente</span><span><i class="skip-dot"></i>No correspondía</span></div><p class="footnote">${progressLabel}</p></div>`;
  }

  function renderHabits() {
    const active = state.habits.filter(h => h.status === 'active');
    const paused = state.habits.filter(h => h.status === 'paused');
    if (ui.calendarHabit && !state.habits.some(h => h.id === ui.calendarHabit)) ui.calendarHabit = '';
    const selected = state.habits.find(h => h.id === ui.calendarHabit) || active[0] || state.habits[0];
    ui.calendarHabit = selected?.id || '';
    return `${pageHeader('Hábitos', 'Rutinas que crecen con constancia.', `<button class="btn" data-action="open-modal" data-modal="habit">${icon('plus')} Nuevo hábito</button>`)}
      ${storageProblem ? `<div class="notice error">${escapeHTML(storageProblem)}</div>` : ''}
      <section><div class="section-head"><div><h2>Hoy</h2><p>Marca tus hábitos desde Inicio; aquí puedes organizarlos y revisar su historial.</p></div><span class="tag">${active.filter(h => isScheduledToday(h) && dueStatus(h, today) === 'complete').length}/${active.filter(isScheduledToday).length} programados</span></div><div class="stack">${active.length ? active.map(h => habitRow(h, { showCheck: false })).join('') : emptyState('Aún no hay hábitos activos', 'Puedes crear uno nuevo o reanudar un hábito en pausa.')}</div></section>
      ${paused.length ? `<section class="section"><div class="section-head"><div><h2>En pausa</h2><p>Su historial sigue guardado.</p></div></div><div class="stack">${paused.map(h => `<article class="card habit-row"><div class="habit-info"><div class="habit-title-line"><h3>${escapeHTML(h.name)}</h3><span class="tag orange">En pausa</span></div><p>${escapeHTML(h.description || frequencyLabel(h))}</p></div><button class="btn secondary small" data-action="resume-habit" data-id="${escapeHTML(h.id)}">Reanudar</button><button class="icon-btn" aria-label="Editar hábito" data-action="edit-habit" data-id="${escapeHTML(h.id)}">${icon('edit')}</button></article>`).join('')}</div></section>` : ''}
      ${selected ? `<section class="section"><div class="section-head"><div><h2>Seguimiento</h2><p>Elige un hábito y consulta el mes.</p></div></div><div style="margin-bottom:10px"><select class="select" aria-label="Hábito del calendario" data-action="calendar-select">${state.habits.map(h => `<option value="${escapeHTML(h.id)}" ${h.id === selected.id ? 'selected' : ''}>${escapeHTML(h.name)}</option>`).join('')}</select></div>${calendarFor(selected)}</section>` : ''}`;
  }

  const taskSort = (a, b) => {
    const rank = { urgent: 0, soon: 1, later: 2 };
    if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) return a.dueDate.localeCompare(b.dueDate);
    if (a.dueDate && !b.dueDate) return -1;
    if (!a.dueDate && b.dueDate) return 1;
    return rank[a.category] - rank[b.category] || a.createdAt.localeCompare(b.createdAt);
  };

  function renderTasks() {
    const categories = [
      ['urgent', 'Urgentes', 'Lo que requiere atención prioritaria.'],
      ['soon', 'Pronto', 'Tareas para resolver próximamente.'],
      ['later', 'Después', 'Puede esperar; aquí sigue guardado.']
    ];
    const filtered = ui.taskFilter === 'all' ? pendingTasks() : pendingTasks().filter(t => t.category === ui.taskFilter);
    const sections = categories.map(([key, label, desc]) => {
      const items = filtered.filter(t => t.category === key).sort(taskSort);
      if (ui.taskFilter !== 'all' && ui.taskFilter !== key) return '';
      return `<section class="category-block"><div class="category-heading">${label}<span class="category-count">${items.length}</span></div>${items.length ? `<div class="stack">${items.map(t => taskCard(t)).join('')}</div>` : `<p class="footnote">${desc} No hay tareas aquí.</p>`}</section>`;
    }).join('');
    return `${pageHeader('Tareas', 'Pendientes claros, sin perder lo que ya hiciste.', `<button class="btn" data-action="open-modal" data-modal="task">${icon('plus')} Nueva tarea</button>`)}
      <div class="filter-row"><button class="filter-chip ${ui.taskFilter === 'all' ? 'active' : ''}" data-action="task-filter" data-filter="all">Todas</button><button class="filter-chip ${ui.taskFilter === 'urgent' ? 'active' : ''}" data-action="task-filter" data-filter="urgent">Urgentes</button><button class="filter-chip ${ui.taskFilter === 'soon' ? 'active' : ''}" data-action="task-filter" data-filter="soon">Pronto</button><button class="filter-chip ${ui.taskFilter === 'later' ? 'active' : ''}" data-action="task-filter" data-filter="later">Después</button></div>
      ${sections || emptyState('No hay pendientes', 'Las tareas que completes aparecerán en el historial.')}
      <details class="history"><summary>Historial · ${completedTasks().length} completadas</summary><div class="stack">${completedTasks().length ? completedTasks().sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || '')).map(t => taskCard(t, { history: true })).join('') : '<p class="footnote">Las tareas completadas se conservan aquí.</p>'}</div></details>`;
  }

  function renderProjects() {
    const active = state.projects.filter(p => p.status === 'active');
    const paused = state.projects.filter(p => p.status === 'paused');
    const finished = state.projects.filter(p => p.status === 'finished');
    const section = (title, list, emptyText) => `<section class="section"><div class="section-head"><div><h2>${title}</h2><p>${title === 'Activos' ? 'Sin apuro y sin fecha límite.' : title === 'En pausa' ? 'Puedes retomarlos en cualquier momento.' : 'Tus proyectos terminados.'}</p></div><span class="tag">${list.length}</span></div>${list.length ? `<div class="stack">${list.map(p => projectCard(p)).join('')}</div>` : `<div class="card empty"><strong>${emptyText}</strong><p>Los proyectos guardan notas, objetivos y pequeños avances.</p></div>`}</section>`;
    return `${pageHeader('Proyectos', 'Ideas que puedes desarrollar a tu manera.', `<button class="btn" data-action="open-modal" data-modal="project">${icon('plus')} Nuevo proyecto</button>`)}
      ${section('Activos', active, 'Aún no tienes proyectos activos.')}${paused.length ? section('En pausa', paused, 'Sin proyectos en pausa.') : ''}${finished.length ? section('Terminados', finished, 'Sin proyectos terminados.') : ''}`;
  }

  function renderSettings() {
    return `${pageHeader('Ajustes', 'Tus datos permanecen en este navegador.')}
      ${storageProblem ? `<div class="notice error" style="margin-bottom:12px">${escapeHTML(storageProblem)}</div>` : ''}
      ${location.protocol === 'file:' ? '<div class="notice" style="margin-bottom:12px">Para un comportamiento confiable de almacenamiento, abre la aplicación desde un sitio estático HTTPS o un servidor local. Los navegadores pueden tratar distinto los archivos file://.</div>' : ''}
      <section class="card settings-card"><div class="settings-row"><div><h3>Apariencia</h3><p>Elige un tema cómodo para ti.</p></div><label style="display:flex;align-items:center;gap:9px;color:var(--muted);font-size:12px"><span>${state.settings.theme === 'dark' ? 'Oscuro' : 'Claro'}</span><input type="checkbox" class="switch" data-action="theme-toggle" ${state.settings.theme === 'dark' ? 'checked' : ''} aria-label="Activar modo oscuro"></label></div></section>
      <section class="card settings-card"><h3>Copia de seguridad</h3><p>Exporta tus hábitos, historial, tareas y proyectos en un archivo JSON. Importar una copia reemplaza los datos actuales de este navegador.</p><div class="toolbar" style="margin-top:14px"><button class="btn secondary" data-action="export">${icon('download')} Exportar JSON</button><button class="btn ghost" data-action="choose-import">${icon('upload')} Importar JSON</button><input type="file" class="file-input" id="import-file" accept="application/json,.json"></div><p class="footnote">La copia no se envía a ningún servidor. Guárdala en un lugar seguro para usarla si cambias de navegador.</p></section>
      <section class="card settings-card"><h3>Almacenamiento</h3><p>Los cambios se guardan automáticamente en localStorage de este navegador. Los datos no se sincronizan entre dispositivos; borrar los datos del navegador también los elimina. Puedes comprobar que sigan ahí cerrando y reabriendo esta misma dirección en Chrome.</p></section>
      <section class="card settings-card"><div class="settings-row"><div><h3>Eliminar todos los datos</h3><p>Elimina hábitos, registros, tareas e historial de proyectos de este navegador.</p></div><button class="btn danger small" data-action="clear-all">Borrar todo</button></div></section>`;
  }

  function tabMarkup(id, label, iconName) {
    return `<button class="tab-btn ${ui.tab === id ? 'active' : ''}" data-action="set-tab" data-tab="${id}" aria-current="${ui.tab === id ? 'page' : 'false'}">${icon(iconName)}<span>${label}</span></button>`;
  }

  function habitForm(habit) {
    const f = habit?.frequency || { type: 'daily', days: [], times: 3 };
    const picked = f.type === 'weekdays' ? f.days : [];
    return `<div class="modal-backdrop" data-action="backdrop-close"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-head"><h2 id="modal-title">${habit ? 'Editar hábito' : 'Nuevo hábito'}</h2><button class="icon-btn" data-action="close-modal" aria-label="Cerrar">${icon('close')}</button></div>
      <form class="form-grid" data-form="habit" data-id="${habit ? escapeHTML(habit.id) : ''}">
        <div class="field"><label for="habit-name">Nombre</label><input id="habit-name" name="name" required maxlength="80" placeholder="Ej. Estudiar 20 minutos" value="${escapeHTML(habit?.name || '')}"></div>
        <div class="field"><label for="habit-desc">Descripción <span style="color:var(--muted);font-weight:400">(opcional)</span></label><textarea id="habit-desc" name="description" maxlength="300" placeholder="Un detalle que te ayude a recordar">${escapeHTML(habit?.description || '')}</textarea></div>
        <div class="field"><label for="habit-frequency">Frecuencia</label><select id="habit-frequency" name="frequency"><option value="daily" ${f.type === 'daily' ? 'selected' : ''}>Todos los días</option><option value="weekdays" ${f.type === 'weekdays' ? 'selected' : ''}>Días específicos</option><option value="alternate" ${f.type === 'alternate' ? 'selected' : ''}>Día por medio</option><option value="weekly" ${f.type === 'weekly' ? 'selected' : ''}>Veces por semana</option></select></div>
        <div class="field" id="weekday-fields" style="${f.type === 'weekdays' ? '' : 'display:none'}"><span class="field-label">¿Qué días?</span><div class="weekday-picker">${WEEKDAYS.map((day, i) => `<label><input type="checkbox" name="days" value="${i}" ${picked.includes(i) ? 'checked' : ''}>${day}</label>`).join('')}</div></div>
        <div class="field" id="weekly-fields" style="${f.type === 'weekly' ? '' : 'display:none'}"><label for="habit-times">Veces por semana</label><input id="habit-times" name="times" type="number" min="1" max="7" value="${f.type === 'weekly' ? f.times : 3}"><small>Puedes registrar la sesión cualquier día. La revisión semanal se hace el domingo.</small></div>
        <div class="field"><label for="habit-goal">Objetivo opcional</label><input id="habit-goal" name="goal" maxlength="80" placeholder="Ej. 20 minutos, 2,5 litros" value="${escapeHTML(habit?.goal || '')}"></div>
        <div class="field"><label for="habit-start">Fecha de inicio</label><input id="habit-start" name="startDate" type="date" required value="${escapeHTML(habit?.startDate || today)}"></div>
        ${habit ? `<div class="field"><label for="habit-status">Estado</label><select id="habit-status" name="status"><option value="active" ${habit.status === 'active' ? 'selected' : ''}>Activo</option><option value="paused" ${habit.status === 'paused' ? 'selected' : ''}>En pausa</option></select></div>` : ''}
        <div class="form-actions"><button type="button" class="btn ghost" data-action="close-modal">Cancelar</button><button class="btn" type="submit">${habit ? 'Guardar cambios' : 'Crear hábito'}</button></div>
      </form></section></div>`;
  }

  function taskForm(task) {
    return `<div class="modal-backdrop" data-action="backdrop-close"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-head"><h2 id="modal-title">${task ? 'Editar tarea' : 'Nueva tarea'}</h2><button class="icon-btn" data-action="close-modal" aria-label="Cerrar">${icon('close')}</button></div><form class="form-grid" data-form="task" data-id="${task ? escapeHTML(task.id) : ''}">
      <div class="field"><label for="task-name">Nombre</label><input id="task-name" name="name" required maxlength="100" placeholder="¿Qué necesitas hacer?" value="${escapeHTML(task?.name || '')}"></div>
      <div class="field"><label for="task-description">Descripción <span style="color:var(--muted);font-weight:400">(opcional)</span></label><textarea id="task-description" name="description" maxlength="500" placeholder="Un poco más de contexto">${escapeHTML(task?.description || '')}</textarea></div>
      <div class="field"><label for="task-category">Categoría</label><select id="task-category" name="category"><option value="urgent" ${task?.category === 'urgent' ? 'selected' : ''}>Urgente</option><option value="soon" ${!task || task.category === 'soon' ? 'selected' : ''}>Pronto</option><option value="later" ${task?.category === 'later' ? 'selected' : ''}>Después</option></select></div>
      <div class="field"><label for="task-due">Fecha límite <span style="color:var(--muted);font-weight:400">(opcional)</span></label><input id="task-due" name="dueDate" type="date" value="${escapeHTML(task?.dueDate || '')}"></div>
      <div class="form-actions"><button type="button" class="btn ghost" data-action="close-modal">Cancelar</button><button class="btn" type="submit">${task ? 'Guardar cambios' : 'Crear tarea'}</button></div>
    </form></section></div>`;
  }

  function projectForm(project) {
    return `<div class="modal-backdrop" data-action="backdrop-close"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-head"><h2 id="modal-title">${project ? 'Editar proyecto' : 'Nuevo proyecto'}</h2><button class="icon-btn" data-action="close-modal" aria-label="Cerrar">${icon('close')}</button></div><form class="form-grid" data-form="project" data-id="${project ? escapeHTML(project.id) : ''}">
      <div class="field"><label for="project-name">Nombre</label><input id="project-name" name="name" required maxlength="100" placeholder="Ej. Aprender Square-1" value="${escapeHTML(project?.name || '')}"></div>
      <div class="field"><label for="project-description">Descripción</label><textarea id="project-description" name="description" maxlength="500" placeholder="¿Qué te gustaría conseguir?">${escapeHTML(project?.description || '')}</textarea></div>
      <div class="field"><label for="project-notes">Notas <span style="color:var(--muted);font-weight:400">(opcional)</span></label><textarea id="project-notes" name="notes" maxlength="2000" placeholder="Ideas, enlaces o contexto para retomarlo">${escapeHTML(project?.notes || '')}</textarea></div>
      <div class="field"><label for="project-status">Estado</label><select id="project-status" name="status"><option value="active" ${!project || project.status === 'active' ? 'selected' : ''}>Activo</option><option value="paused" ${project?.status === 'paused' ? 'selected' : ''}>En pausa</option><option value="finished" ${project?.status === 'finished' ? 'selected' : ''}>Terminado</option></select></div>
      <div class="field"><label for="project-progress">Progreso opcional (%)</label><input id="project-progress" name="progress" type="number" min="0" max="100" placeholder="Se calcula según objetivos si lo dejas vacío" value="${project?.progress ?? ''}"><small>Si lo dejas vacío, se calcula a partir de objetivos pequeños.</small></div>
      <div class="form-actions"><button type="button" class="btn ghost" data-action="close-modal">Cancelar</button><button class="btn" type="submit">${project ? 'Guardar cambios' : 'Crear proyecto'}</button></div>
    </form></section></div>`;
  }

  function modalMarkup() {
    if (!ui.modal) return '';
    const [type, id] = ui.modal.split(':');
    if (type === 'habit') return habitForm(state.habits.find(h => h.id === id));
    if (type === 'task') return taskForm(state.tasks.find(t => t.id === id));
    if (type === 'project') return projectForm(state.projects.find(p => p.id === id));
    return '';
  }

  function render() {
    const pages = { home: renderHome, habits: renderHabits, tasks: renderTasks, projects: renderProjects, settings: renderSettings };
    const body = (pages[ui.tab] || renderHome)();
    app.innerHTML = `<header class="topbar"><div class="brand"><span class="brand-mark">${icon('spark')}</span>Tracker de tareas :D</div><div class="save-status ${storageProblem ? 'error' : ''}" title="${storageProblem ? 'Hay un problema al guardar' : 'Guardado en este dispositivo'}"><i class="save-dot"></i>${storageProblem ? 'Sin guardar' : 'Guardado'}</div></header><main>${body}</main><div class="nav-wrap"><nav class="bottom-nav" aria-label="Navegación principal">${tabMarkup('home', 'Inicio', 'home')}${tabMarkup('habits', 'Hábitos', 'habit')}${tabMarkup('tasks', 'Tareas', 'tasks')}${tabMarkup('projects', 'Proyectos', 'project')}${tabMarkup('settings', 'Ajustes', 'settings')}</nav></div>${modalMarkup()}`;
    if (ui.modal) setTimeout(() => document.querySelector('#modal-title')?.closest('.modal')?.querySelector('input:not([type=checkbox])')?.focus(), 0);
  }

  function setHabitStatus(habit, next) {
    if (habit.status === next) return;
    if (next === 'paused') {
      habit.pausePeriods.push({ from: today, to: null });
    } else {
      const open = [...habit.pausePeriods].reverse().find(p => !p.to);
      if (open) open.to = addDays(today, -1);
    }
    habit.status = next;
  }

  function openModal(type, id = '') { ui.modal = `${type}${id ? `:${id}` : ''}`; render(); }
  function closeModal() { ui.modal = null; render(); }

  app.addEventListener('click', event => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const action = button.dataset.action;
    const id = button.dataset.id;
    if (action === 'set-tab') { ui.tab = button.dataset.tab; ui.modal = null; render(); window.scrollTo(0, 0); }
    if (action === 'open-modal') openModal(button.dataset.modal);
    if (action === 'edit-habit') openModal('habit', id);
    if (action === 'edit-task') openModal('task', id);
    if (action === 'edit-project') openModal('project', id);
    if (action === 'close-modal') closeModal();
    if (action === 'backdrop-close' && event.target === button) closeModal();
    if (action === 'toggle-habit') {
      const logs = state.habitLogs[id] ||= {};
      if (logs[today]) delete logs[today]; else logs[today] = true;
      commit(logs[today] ? 'Hábito registrado.' : 'Registro de hoy desmarcado.');
    }
    if (action === 'toggle-task') {
      const task = state.tasks.find(t => t.id === id);
      if (!task) return;
      task.status = task.status === 'completed' ? 'pending' : 'completed';
      task.completedAt = task.status === 'completed' ? new Date().toISOString() : null;
      commit(task.status === 'completed' ? 'Tarea completada y guardada en el historial.' : 'Tarea reabierta.');
    }
    if (action === 'delete-task') {
      const task = state.tasks.find(t => t.id === id);
      if (task && confirm(`¿Eliminar “${task.name}”${task.status === 'completed' ? ' del historial' : ''}? Esta acción no se puede deshacer.`)) {
        state.tasks = state.tasks.filter(t => t.id !== id); commit('Tarea eliminada.');
      }
    }
    if (action === 'delete-habit') {
      const habit = state.habits.find(h => h.id === id);
      if (habit && confirm(`¿Eliminar “${habit.name}” y todo su historial de seguimiento? Esta acción no se puede deshacer.`)) {
        state.habits = state.habits.filter(h => h.id !== id); delete state.habitLogs[id]; commit('Hábito e historial eliminados.');
      }
    }
    if (action === 'resume-habit') {
      const habit = state.habits.find(h => h.id === id);
      if (habit) { setHabitStatus(habit, 'active'); commit('Hábito reanudado.'); }
    }
    if (action === 'calendar-shift') {
      const d = new Date(ui.calendarYear, ui.calendarMonth + Number(button.dataset.delta), 1);
      ui.calendarYear = d.getFullYear(); ui.calendarMonth = d.getMonth(); render();
    }
    if (action === 'task-filter') { ui.taskFilter = button.dataset.filter; render(); }
    if (action === 'toggle-milestone') {
      const project = state.projects.find(p => p.id === button.dataset.project);
      const milestone = project?.milestones.find(m => m.id === id);
      if (milestone) { milestone.done = button.checked; commit(milestone.done ? 'Objetivo completado.' : 'Objetivo reabierto.'); }
    }
    if (action === 'delete-milestone') {
      const project = state.projects.find(p => p.id === button.dataset.project);
      const milestone = project?.milestones.find(m => m.id === id);
      if (project && milestone && confirm(`¿Eliminar el objetivo “${milestone.text}”?`)) { project.milestones = project.milestones.filter(m => m.id !== id); commit('Objetivo eliminado.'); }
    }
    if (action === 'delete-project') {
      const project = state.projects.find(p => p.id === id);
      if (project && confirm(`¿Eliminar el proyecto “${project.name}” y su historial de avances? Esta acción no se puede deshacer.`)) { state.projects = state.projects.filter(p => p.id !== id); commit('Proyecto e historial eliminados.'); }
    }
    if (action === 'export') exportData();
    if (action === 'choose-import') document.getElementById('import-file')?.click();
    if (action === 'clear-all') {
      if (confirm('¿Borrar todos tus hábitos, registros, tareas e historial de proyectos de este navegador? Esta acción no se puede deshacer.')) {
        const theme = state.settings.theme; state = initialState(); state.settings.theme = theme; commit('Datos eliminados.');
      }
    }
  });

  app.addEventListener('change', event => {
    const target = event.target;
    if (target.matches('[data-action="calendar-select"]')) { ui.calendarHabit = target.value; render(); }
    if (target.matches('[data-action="theme-toggle"]')) {
      state.settings.theme = target.checked ? 'dark' : 'light'; applyTheme(); commit('Apariencia actualizada.');
    }
    if (target.matches('[data-action="move-task"]')) {
      const task = state.tasks.find(t => t.id === target.dataset.id);
      if (task) { task.category = target.value; commit('Tarea movida.'); }
    }
    if (target.matches('#habit-frequency')) {
      document.getElementById('weekday-fields').style.display = target.value === 'weekdays' ? '' : 'none';
      document.getElementById('weekly-fields').style.display = target.value === 'weekly' ? '' : 'none';
    }
    if (target.matches('#import-file')) importData(target.files?.[0]);
  });

  app.addEventListener('submit', event => {
    const form = event.target.closest('form[data-form]');
    if (!form) return;
    event.preventDefault();
    const data = new FormData(form);
    const id = form.dataset.id;
    if (form.dataset.form === 'habit') {
      const name = String(data.get('name') || '').trim();
      const frequency = { type: String(data.get('frequency')), days: data.getAll('days').map(Number), times: Math.max(1, Math.min(7, Number(data.get('times')) || 1)) };
      if (frequency.type === 'weekdays' && !frequency.days.length) { showToast('Elige al menos un día de la semana.'); return; }
      const existing = state.habits.find(h => h.id === id);
      if (existing) {
        Object.assign(existing, { name, description: String(data.get('description') || '').trim(), goal: String(data.get('goal') || '').trim(), startDate: String(data.get('startDate')), frequency });
        if (data.get('status')) setHabitStatus(existing, String(data.get('status')));
        commit('Hábito actualizado.');
      } else {
        state.habits.push({ id: uid(), name, description: String(data.get('description') || '').trim(), goal: String(data.get('goal') || '').trim(), startDate: String(data.get('startDate')), status: 'active', frequency, pausePeriods: [] });
        commit('Hábito creado.');
      }
      ui.modal = null; render();
    }
    if (form.dataset.form === 'task') {
      const fields = { name: String(data.get('name') || '').trim(), description: String(data.get('description') || '').trim(), category: String(data.get('category')), dueDate: String(data.get('dueDate') || '') };
      const existing = state.tasks.find(t => t.id === id);
      if (existing) Object.assign(existing, fields);
      else state.tasks.push({ id: uid(), ...fields, createdAt: new Date().toISOString(), completedAt: null, status: 'pending' });
      ui.modal = null; commit(existing ? 'Tarea actualizada.' : 'Tarea creada.');
    }
    if (form.dataset.form === 'project') {
      const progressValue = String(data.get('progress') || '').trim();
      const fields = { name: String(data.get('name') || '').trim(), description: String(data.get('description') || '').trim(), notes: String(data.get('notes') || '').trim(), status: String(data.get('status')), progress: progressValue === '' ? null : Math.max(0, Math.min(100, Number(progressValue))) };
      const existing = state.projects.find(p => p.id === id);
      if (existing) Object.assign(existing, fields);
      else state.projects.push({ id: uid(), ...fields, milestones: [], logs: [] });
      ui.modal = null; commit(existing ? 'Proyecto actualizado.' : 'Proyecto creado.');
    }
    if (form.dataset.form === 'milestone') {
      const project = state.projects.find(p => p.id === form.dataset.project);
      const text = String(data.get('milestone') || '').trim();
      if (project && text) { project.milestones.push({ id: uid(), text, done: false }); commit('Objetivo añadido.'); }
    }
    if (form.dataset.form === 'project-log') {
      const project = state.projects.find(p => p.id === form.dataset.project);
      const text = String(data.get('log') || '').trim();
      if (project && text) { project.logs.push({ id: uid(), text, date: today }); commit('Avance registrado.'); }
    }
  });

  function exportData() {
    try {
      const blob = new Blob([JSON.stringify({ ...state, exportedAt: new Date().toISOString() }, null, 2)], { type: 'application/json' });
      const link = document.createElement('a');
      const objectUrl = URL.createObjectURL(blob);
      link.href = objectUrl;
      link.download = `tracker-de-tareas-copia-${today}.json`;
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      showToast('Copia JSON descargada.');
    } catch (error) { showToast('No se pudo crear el archivo de copia.'); }
  }

  async function importData(file) {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const imported = normalizeState(parsed);
      const summary = `${imported.habits.length} hábitos, ${imported.tasks.length} tareas y ${imported.projects.length} proyectos`;
      if (!confirm(`La copia contiene ${summary}. Reemplazará todos los datos actuales de este navegador. ¿Continuar?`)) return;
      state = imported;
      applyTheme();
      commit('Copia importada correctamente.');
    } catch (error) {
      showToast(error instanceof SyntaxError ? 'El archivo no contiene JSON válido.' : error.message || 'No se pudo importar la copia.');
    } finally {
      const input = document.getElementById('import-file');
      if (input) input.value = '';
    }
  }

  // Si la página cambia de fecha mientras permanece abierta, la vista se actualiza sin borrar registros anteriores.
  let displayedDay = today;
  setInterval(() => {
    if (localDate() !== displayedDay) {
      displayedDay = localDate();
      today = displayedDay;
      const current = new Date();
      if (current.getMonth() !== ui.calendarMonth || current.getFullYear() !== ui.calendarYear) { ui.calendarMonth = current.getMonth(); ui.calendarYear = current.getFullYear(); }
      render();
    }
  }, 60_000);

  render();
})();
