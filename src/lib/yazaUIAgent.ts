export type YazaUIElement = {
    target: string;
    type: 'button' | 'link' | 'input' | 'textarea' | 'select' | 'checkbox' | 'radio' | 'range' | 'file' | 'other';
    label: string;
    value?: string;
    placeholder?: string;
    disabled?: boolean;
    checked?: boolean;
    options?: string[];
};

const INTERACTIVE_SELECTOR = 'button, a, input, textarea, select, [role="button"], [role="checkbox"], [role="radio"], [role="option"], [tabindex]:not([tabindex="-1"])';

function visible(el: HTMLElement) {
    const style = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
}

function clean(value: string | null | undefined) {
    return (value || '').replace(/\s+/g, ' ').trim().slice(0, 180);
}

function elementLabel(el: HTMLElement) {
    const aria = clean(el.getAttribute('aria-label'));
    if (aria) return aria;
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
        const text = labelledBy.split(/\s+/).map(id => document.getElementById(id)?.textContent || '').join(' ');
        if (clean(text)) return clean(text);
    }
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
        const id = el.id;
        if (id) {
            const label = document.querySelector(`label[for="${CSS.escape(id)}"]`);
            if (label && clean(label.textContent)) return clean(label.textContent);
        }
        const parentLabel = el.closest('label');
        if (parentLabel && clean(parentLabel.textContent)) return clean(parentLabel.textContent);
        if (clean(el.getAttribute('name'))) return clean(el.getAttribute('name'));
        if (clean(el.getAttribute('placeholder'))) return clean(el.getAttribute('placeholder'));
    }
    return clean(el.textContent) || clean(el.getAttribute('title')) || clean(el.getAttribute('data-tooltip')) || 'Unnamed control';
}

function typeOf(el: HTMLElement): YazaUIElement['type'] {
    if (el instanceof HTMLButtonElement || el.getAttribute('role') === 'button') return 'button';
    if (el instanceof HTMLAnchorElement) return 'link';
    if (el instanceof HTMLTextAreaElement) return 'textarea';
    if (el instanceof HTMLSelectElement) return 'select';
    if (el instanceof HTMLInputElement) {
        if (el.type === 'checkbox') return 'checkbox';
        if (el.type === 'radio') return 'radio';
        if (el.type === 'range') return 'range';
        if (el.type === 'file') return 'file';
        return 'input';
    }
    if (el.getAttribute('role') === 'checkbox') return 'checkbox';
    if (el.getAttribute('role') === 'radio') return 'radio';
    return 'other';
}

function makeTarget(type: YazaUIElement['type'], label: string, occurrence: number) {
    const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 55) || 'control';
    return `ui-${type}-${slug}-${occurrence}`;
}

export function refreshYazaUIRegistry() {
    document.querySelectorAll('[data-yaza-target]').forEach(el => el.removeAttribute('data-yaza-target'));

    const counts = new Map<string, number>();
    const elements = Array.from(document.querySelectorAll<HTMLElement>(INTERACTIVE_SELECTOR))
        .filter(el => visible(el) && !el.closest('[data-yaza-ignore]'));
    const snapshot: YazaUIElement[] = [];

    elements.forEach(el => {
        const type = typeOf(el);
        const label = elementLabel(el);
        const key = `${type}:${label.toLowerCase()}`;
        const occurrence = (counts.get(key) || 0) + 1;
        counts.set(key, occurrence);
        const target = makeTarget(type, label, occurrence);
        el.setAttribute('data-yaza-target', target);

        const item: YazaUIElement = {
            target,
            type,
            label,
            disabled: (el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true',
        };
        if ('value' in el) item.value = clean(String((el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value));
        if (el instanceof HTMLInputElement) {
            item.placeholder = clean(el.placeholder);
            item.checked = el.checked;
        }
        if (el instanceof HTMLSelectElement) item.options = Array.from(el.options).map(o => clean(o.textContent)).filter(Boolean).slice(0, 50);
        snapshot.push(item);
    });

    return snapshot;
}

function findTarget(target: string) {
    return document.querySelector<HTMLElement>(`[data-yaza-target="${CSS.escape(target)}"]`);
}

export function executeYazaUIAction(action: { action: string; target: string; value?: string; option?: string }) {
    const el = findTarget(action.target);
    if (!el) return { ok: false, message: `The UI target ${action.target} is no longer available. Refreshing the UI map is required.` };
    if ((el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true') return { ok: false, message: `${action.target} is disabled.` };

    if (action.action === 'click') {
        el.click();
        return { ok: true, message: `Clicked ${elementLabel(el)}.` };
    }

    if (action.action === 'type' || action.action === 'set_value') {
        if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return { ok: false, message: `${action.target} is not a text input.` };
        const setter = Object.getOwnPropertyDescriptor(el instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype, 'value')?.set;
        setter?.call(el, action.value ?? '');
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return { ok: true, message: `Entered text in ${elementLabel(el)}.` };
    }

    if (action.action === 'select') {
        if (!(el instanceof HTMLSelectElement)) return { ok: false, message: `${action.target} is not a select control.` };
        const wanted = action.option ?? action.value ?? '';
        const option = Array.from(el.options).find(o => o.textContent?.trim() === wanted || o.value === wanted || o.textContent?.toLowerCase().includes(wanted.toLowerCase()));
        if (!option) return { ok: false, message: `Option ${wanted} was not found in ${elementLabel(el)}.` };
        el.value = option.value;
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return { ok: true, message: `Selected ${option.textContent?.trim()} in ${elementLabel(el)}.` };
    }

    if (action.action === 'check' || action.action === 'uncheck') {
        if (!(el instanceof HTMLInputElement) || (el.type !== 'checkbox' && el.type !== 'radio')) return { ok: false, message: `${action.target} is not a checkbox or radio control.` };
        const desired = action.action === 'check';
        if (el.checked !== desired) el.click();
        return { ok: true, message: `${desired ? 'Checked' : 'Unchecked'} ${elementLabel(el)}.` };
    }

    if (action.action === 'set_range') {
        if (!(el instanceof HTMLInputElement) || el.type !== 'range') return { ok: false, message: `${action.target} is not a range control.` };
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        setter?.call(el, action.value ?? '');
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return { ok: true, message: `Set ${elementLabel(el)} to ${action.value}.` };
    }

    if (action.action === 'upload') return { ok: false, message: 'Browser security prevents Yaza from choosing a local file. Ask the user to select the file, then continue.' };

    return { ok: false, message: `Unsupported UI action: ${action.action}.` };
}
