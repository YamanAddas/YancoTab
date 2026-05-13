import { el, setLiteralHtml } from '../../../utils/dom.js';
import { kernel } from '../../../kernel.js';
import {
    loadState as loadTodoState,
    getActiveMission,
    getOpenTasks,
    quickToggleTask,
} from '../../../apps/todo/persistence.js';

/**
 * TodoWidget — first list's open tasks with inline checkboxes.
 *
 * Reads/writes go through todo/persistence.js so the v2 schema
 * (missions/tasks/streakLog) stays consistent with TodoApp. Toggling a
 * checkbox here goes through the same toggleDone reducer the app uses,
 * so streaks bump and completedAt stamps match.
 */
export class TodoWidget {
    constructor() {
        this.root = null;
        this._unsubChanged = null;
    }

    render() {
        this.root = el('div', { class: 'widget-card widget-todo' });
        this.root.addEventListener('click', (e) => {
            if (e.target.closest('.widget-todo-check')) return;
            kernel.emit('app:open', 'todo');
        });
        // Re-render when any path (TodoApp itself, SmartSearch quick-add,
        // or this widget's own toggle) writes to the todo store.
        // kernel.on returns an unsubscribe function — store and call on destroy.
        this._unsubChanged = kernel.on('todo:changed', () => this._update());
        this._update();
        return this.root;
    }

    _update() {
        if (!this.root) return;
        this.root.innerHTML = '';

        const state = loadTodoState(kernel);
        const mission = getActiveMission(state);
        const listName = (mission?.name || 'tasks').toLowerCase();
        const undone = getOpenTasks(state);
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
            setLiteralHtml(glyph, `<svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`);
            body.append(
                glyph,
                el('div', { class: 'widget-empty-msg' }, mission ? 'All clear' : 'Tap to add tasks'),
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
                quickToggleTask(kernel, task.id);
            });
            row.append(check, el('div', { class: 'widget-todo-text' }, task.text || ''));
            body.append(row);
        }
        this.root.append(body);

        if (total > 2) {
            this.root.append(el('div', { class: 'widget-foot' }, `+${total - 2} more`));
        }
    }

    destroy() {
        if (this._unsubChanged) {
            try { this._unsubChanged(); } catch { /* ignore */ }
            this._unsubChanged = null;
        }
    }
}
