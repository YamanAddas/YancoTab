import { el } from '../../../utils/dom.js';
import { kernel } from '../../../kernel.js';

export class TodoWidget {
    constructor() {
        this.root = null;
    }

    render() {
        this.root = el('div', { class: 'widget-card widget-todo widget-medium' });
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
        if (!activeList) {
            this.root.append(
                el('div', { class: 'widget-empty' }, 'No tasks yet'),
                el('div', { class: 'widget-empty-sub' }, 'Tap to add tasks'),
            );
            return;
        }

        const undone = (activeList.tasks || []).filter(t => !t.done);
        const total = undone.length;

        this.root.append(
            el('div', { class: 'widget-todo-header' }, [
                el('div', { class: 'widget-todo-name' }, activeList.name || 'My Tasks'),
                el('div', { class: 'widget-todo-count' }, String(total)),
            ]),
        );

        const visible = undone.slice(0, 3);
        for (const task of visible) {
            const row = el('div', { class: 'widget-todo-row' });
            const check = el('div', { class: 'widget-todo-check' });
            check.addEventListener('click', (e) => {
                e.stopPropagation();
                this._toggleTask(task.text);
            });
            const label = el('div', { class: 'widget-todo-text' }, task.text || '');
            row.append(check, label);
            this.root.append(row);
        }

        if (total > 3) {
            this.root.append(el('div', { class: 'widget-todo-more' }, `+${total - 3} more`));
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
