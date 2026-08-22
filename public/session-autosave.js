(() => {
  const STORAGE_KEY = 'stored_sessions';
  const TOKEN_KEY = 'yaza_auth_token';
  let timer = null;
  let lastSignature = '';

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

  function updateLocal(session) {
    try {
      const current = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      const sessionKey = key(session);
      const next = current.filter((item) => key(item) !== sessionKey);
      next.unshift(session);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Local persistence is best-effort; cloud remains authoritative.
    }
  }

  async function saveCurrentSession() {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return;

    const values = readForm();
    if (!values.courseCode) return;

    const signature = JSON.stringify(values);
    if (signature === lastSignature) return;
    lastSignature = signature;

    const session = {
      courseCode: values.courseCode,
      courseName: values.courseName,
      program: values.program,
      year: values.year,
      semester: values.semester,
      academicYear: values.academicYear,
      sessionLabel: values.semester || 'Session',
    };

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
      updateLocal(data.session || session);
      window.dispatchEvent(new CustomEvent('redpen:sessions-updated'));
    } catch (error) {
      console.warn('Session autosave failed:', error);
    }
  }

  function scheduleSave() {
    window.clearTimeout(timer);
    timer = window.setTimeout(saveCurrentSession, 50);
  }

  document.addEventListener('change', (event) => {
    const target = event.target;
    if (target instanceof HTMLSelectElement && classifySelect(target)) scheduleSave();
  }, true);

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.textContent?.trim() === 'Set Course' || target.textContent?.trim() === 'Switch Course') {
      scheduleSave();
    }
  }, true);

  window.addEventListener('storage', (event) => {
    if (event.key === TOKEN_KEY) scheduleSave();
  });

  window.setTimeout(scheduleSave, 1000);
})();
