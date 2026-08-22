(() => {
  const STORAGE_KEY = 'stored_sessions';
  const TOKEN_KEY = 'yaza_auth_token';
  let timer = null;
  let lastSignature = '';
  let currentSessionId = null;
  let lastSavedKey = '';
  let cloudLoadedForToken = '';
  let switchingSession = false;

  const clean = (value) => typeof value === 'string' ? value.trim() : '';

  function classifySelect(select) {
    const first = clean(select.options?.[0]?.textContent);
    if (first === 'Year of Study') return 'year';
    if (first === 'Semester') return 'semester';
    if (first === 'Academic Year') return 'academicYear';
    if (first === 'Course') return 'courseCode';
    return null;
  }

  function readForm() {
    const values = { courseCode: '', courseName: '', program: '', year: '', semester: '', academicYear: '' };
    document.querySelectorAll('select').forEach((select) => {
      const field = classifySelect(select);
      if (!field) return;
      if (field === 'courseCode') {
        values.courseCode = clean(select.value).toUpperCase();
        const option = select.options?.[select.selectedIndex];
        const label = clean(option?.textContent);
        values.courseName = label.includes(' — ') ? label.split(' — ').slice(1).join(' — ').trim() : '';
      } else {
        values[field] = clean(select.value);
      }
    });

    const programInput = Array.from(document.querySelectorAll('input')).find(
      (input) => input.placeholder === 'Program of Study'
    );
    if (programInput) values.program = clean(programInput.value);
    return values;
  }

  function key(session) {
    return [
      clean(session.courseCode).toUpperCase(),
      clean(session.academicYear),
      clean(session.year),
      clean(session.semester),
      clean(session.sessionLabel),
      clean(session.customName),
    ].join('|');
  }

  function readLocal() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
    catch { return []; }
  }

  function updateLocal(session) {
    try {
      const current = readLocal();
      const sessionKey = key(session);
      const next = current.filter((item) => key(item) !== sessionKey && item.id !== session.id);
      next.unshift(session);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Cloud remains authoritative.
    }
  }

  async function loadCloudSessions() {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token || token === cloudLoadedForToken) return;

    try {
      const response = await fetch('/api/sessions', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) return;
      const data = await response.json();
      if (!Array.isArray(data.sessions)) return;

      cloudLoadedForToken = token;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data.sessions));
      window.dispatchEvent(new CustomEvent('redpen:sessions-updated'));
    } catch (error) {
      console.warn('Cloud session verification failed:', error);
    }
  }

  async function saveCurrentSession() {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return;

    const values = readForm();
    if (!values.courseCode) return;

    const session = {
      id: currentSessionId || undefined,
      courseCode: values.courseCode,
      courseName: values.courseName,
      program: values.program,
      year: values.year,
      semester: values.semester,
      academicYear: values.academicYear,
      sessionLabel: values.semester || 'Session',
    };
    const currentKey = key(session);

    if (JSON.stringify(values) === lastSignature && currentKey === lastSavedKey) return;
    lastSignature = JSON.stringify(values);

    // A deliberate session switch should attach to the already-existing session
    // instead of mutating the previous one. Ordinary field edits keep the current id.
    if (switchingSession) {
      const existing = readLocal().find((item) => key(item) === currentKey);
      currentSessionId = existing?.id || null;
      session.id = currentSessionId || undefined;
      switchingSession = false;
    }

    try {
      const response = await fetch('/api/sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ session }),
      });
      if (!response.ok) {
        console.warn('Session autosave failed:', response.status);
        return;
      }

      const data = await response.json().catch(() => ({}));
      const saved = data.session || session;
      currentSessionId = saved.id || currentSessionId;
      lastSavedKey = key(saved);
      updateLocal(saved);
      window.dispatchEvent(new CustomEvent('redpen:sessions-updated'));
    } catch (error) {
      console.warn('Session autosave failed:', error);
    }
  }

  function scheduleSave(delay = 150) {
    window.clearTimeout(timer);
    timer = window.setTimeout(saveCurrentSession, delay);
  }

  document.addEventListener('change', (event) => {
    const target = event.target;
    if (target instanceof HTMLSelectElement && classifySelect(target)) scheduleSave();
  }, true);

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const text = target.textContent?.trim();

    if (text === 'Load Session') {
      switchingSession = true;
      scheduleSave(600);
      return;
    }

    if (text === 'New Session') {
      currentSessionId = null;
      lastSavedKey = '';
      switchingSession = false;
      lastSignature = '';
      return;
    }

    if (text === 'Set Course' || text === 'Switch Course') scheduleSave(250);
  }, true);

  // React writes the auth token in the same tab, so the browser storage event
  // does not fire here. Poll briefly and verify cloud sessions as soon as login succeeds.
  const poll = window.setInterval(loadCloudSessions, 500);
  window.addEventListener('beforeunload', () => window.clearInterval(poll));

  window.setTimeout(() => {
    loadCloudSessions();
    scheduleSave(500);
  }, 1000);
})();
