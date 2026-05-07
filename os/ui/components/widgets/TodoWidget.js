import { el } from '../../../utils/dom.js';
import { kernel } from '../../../kernel.js';

/**
 * TodoWidget — first list's open tasks with inline checkboxes.
 *
 * Unified head/body/foot layout: header is "todo · <list name>", body shows
 * up to 2 tasks (or empty state with a check glyph), foot shows the count
 * remaining or a "+N more" hint.
 */
export class TodoWidget {
    constructor() { this.root = null; }

    render() {
        this.root = el('div', { class: 'widget-card widget-todo' });
        this.root.addEventListener('click', (e) => {
            if (e.target.closest('.widget-todo-check')) return;
            kernel.emit('app:open', 'todo');
        });
        this._update();
        return this.root;
    }

    _update() {
        if (!this.root) return;
        this.root.innerHTML = '';

        const data = kernel.storage?.load('yancotab_todo_v1');
        const lists = data?.lists || [];
        const activeList = lists[0];
        const listName = (activeList?.name || 'tasks').toLowerCase();
        const undone = (activeList?.tasks || []).filter(t => !t.done);
        const total = undone.length;

        this.root.append(
            el('div', { class: 'widget-head' }, [
                el('b', {}, 'todo'),
                el('span', {}, `${listName} · ${total} left`),
            ]),
        );

        if (total === 0) {
            const body = el('div', { class: 'widget-body widget-todo-empty' });
            const glyph = el('div', { class: 'widget-empty-glyph' });
            glyph.innerHTML = `<svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;
            body.append(
                glyph,
                el('div', { class: 'widget-empty-msg' }, activeList ? 'All clear' : 'Tap to add tasks'),
            );
            this.root.append(body);
            return;
        }

        const body = el('div', { class: 'widget-body widget-todo-list' });
        for (const task of undone.slice(0, 2)) {
            const row = el('div', { class: 'widget-todo-row' });
            const check = el('div', { class: 'widget-todo-check' });
            check.addEventListener('click', (e) => {
                e.stopPropagation();
                this._toggleTask(task.text);
            });
            row.append(check, el('div', { class: 'widget-todo-text' }, task.text || ''));
            body.append(row);
        }
        this.root.append(body);

        if (total > 2) {
            this.root.append(el('div', { class: 'widget-foot' }, `+${total - 2} more`));
        }
    }

    _toggleTask(text) {
        const data = kernel.storage?.load('yancotab_todo_v1');
        if (!data?.lists?.[0]) return;
        const task = data.lists[0].tasks.find(t => t.text === text);
        if (task) {
            task.done = true;
            kernel.storage.save('yancotab_todo_v1', data);
            this._update();
        }
    }

    destroy() {}
}
