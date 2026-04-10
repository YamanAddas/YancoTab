import { App } from '../core/App.js';
import { el } from '../utils/dom.js';

const STORAGE_KEY = 'yancotab_todo_v1';
const SAVE_DEBOUNCE_MS = 260;

export class TodoApp extends App {
    constructor(kernel, pid) {
        super(kernel, pid);
        this.metadata = { name: 'Todo', id: 'todo', icon: '✅' };
        this._saveTimer = null;
        this._unsubscribe = null;
        this.data = null;
        this.activeListId = null;
        this.editingTaskId = null;
    }

    async init() {
        this.root = el('div', { class: 'app-window app-todo' });
        this._injectStyles();
        this.data = this._load();
        this.activeListId = this.data.lists[0]?.id || null;

        // Subscribe for cross-device sync updates
        if (this.kernel.storage) {
            this._unsubscribe = this.kernel.storage.subscribe(STORAGE_KEY, (e) => {
                if (e.source === 'remote') {
                    this.data = e.newValue;
                    this.render();
                }
            });
        }

        this.render();
    }

    destroy() {
        this._flushSave();
        if (this._unsubscribe) this._unsubscribe();
        super.destroy();
    }

    // ─── Data ────────────────────────────────────────────────

    _load() {
        if (this.kernel.storage) {
            return this.kernel.storage.load(STORAGE_KEY);
        }
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            return raw ? JSON.parse(raw) : this._defaultData();
        } catch {
            return this._defaultData();
        }
    }

    _save() {
        if (this._saveTimer) clearTimeout(this._saveTimer);
        this._saveTimer = setTimeout(() => {
            this._saveTimer = null;
            this._renormalizePositions();
            if (this.kernel.storage) {
                this.kernel.storage.save(STORAGE_KEY, this.data);
            } else {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
            }
        }, SAVE_DEBOUNCE_MS);
    }

    _flushSave() {
        if (this._saveTimer) {
            clearTimeout(this._saveTimer);
            this._saveTimer = null;
            this._renormalizePositions();
            if (this.kernel.storage) {
                this.kernel.storage.save(STORAGE_KEY, this.data);
            } else {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
            }
        }
    }

    _defaultData() {
        return {
            lists: [{
                id: this._id(),
                name: 'My Tasks',
                tasks: [],
            }],
        };
    }

    _id() {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    }

    _getActiveList() {
        return this.data.lists.find((l) => l.id === this.activeListId) || this.data.lists[0];
    }

    _renormalizePositions() {
        for (const list of this.data.lists) {
            if (!list.tasks.length) continue;
            list.tasks.sort((a, b) => a.position - b.position);
            // Check if any adjacent positions are too close
            let needsReindex = false;
            for (let i = 1; i < list.tasks.length; i++) {
                if (Math.abs(list.tasks[i].position - list.tasks[i - 1].position) < 1) {
                    needsReindex = true;
                    break;
                }
            }
            if (needsReindex) {
                list.tasks.forEach((t, i) => { t.position = (i + 1) * 1000; });
            }
        }
    }

    // ─── Render ──────────────────────────────────────────────

    render() {
        this.root.innerHTML = '';
        this._injectStyles();

        const list = this._getActiveList();
        if (!list) return;

        const sidebar = this._buildSidebar();
        const main = this._buildMain(list);

        const layout = el('div', { class: 'todo-layout' }, [sidebar, main]);
        this.root.appendChild(layout);
    }

    _buildSidebar() {
        const items = this.data.lists.map((list) => {
            const count = list.tasks.filter((t) => !t.done).length;
            const btn = el('button', {
                class: `todo-list-btn ${list.id === this.activeListId ? 'is-active' : ''}`,
                type: 'button',
                onclick: () => {
                    this.activeListId = list.id;
                    this.editingTaskId = null;
                    this.render();
                },
            }, [
                el('span', { class: 'todo-list-name' }, list.name),
                count > 0 ? el('span', { class: 'todo-list-count' }, String(count)) : null,
            ].filter(Boolean));

            // Long press to rename/delete
            let lpTimer = null;
            btn.addEventListener('pointerdown', () => {
                lpTimer = setTimeout(() => this._listContextMenu(list), 500);
            });
            btn.addEventListener('pointerup', () => clearTimeout(lpTimer));
            btn.addEventListener('pointerleave', () => clearTimeout(lpTimer));

            return btn;
        });

        const addBtn = el('button', {
            class: 'todo-add-list-btn',
            type: 'button',
            onclick: () => this._addList(),
        }, '+ New List');

        return el('div', { class: 'todo-sidebar' }, [...items, addBtn]);
    }

    _buildMain(list) {
        const header = el('div', { class: 'todo-main-header' }, [
            el('h2', { class: 'todo-list-title' }, list.name),
            el('div', { class: 'todo-header-actions' }, [
                el('button', {
                    class: 'todo-clear-btn',
                    type: 'button',
                    onclick: () => this._clearDone(list),
                    title: 'Clear completed',
                }, 'Clear done'),
            ]),
        ]);

        // Add task input
        const input = el('input', {
            class: 'todo-add-input',
            type: 'text',
            placeholder: 'Add a task...',
            onkeydown: (e) => {
                if (e.key === 'Enter' && e.target.value.trim()) {
                    this._addTask(list, e.target.value.trim());
                    e.target.value = '';
                }
            },
        });

        const addRow = el('div', { class: 'todo-add-row' }, [
            el('span', { class: 'todo-add-icon' }, '+'),
            input,
        ]);

        // Task list
        const sorted = [...list.tasks].sort((a, b) => a.position - b.position);
        const pending = sorted.filter((t) => !t.done);
        const done = sorted.filter((t) => t.done);

        const taskNodes = [];

        pending.forEach((task) => taskNodes.push(this._buildTask(task, list)));

        if (done.length) {
            taskNodes.push(el('div', { class: 'todo-done-divider' }, [
                el('span', {}, `Completed (${done.length})`),
            ]));
            done.forEach((task) => taskNodes.push(this._buildTask(task, list)));
        }

        const taskList = el('div', { class: 'todo-task-list' }, taskNodes);

        if (!list.tasks.length) {
            taskList.appendChild(el('div', { class: 'todo-empty' }, 'No tasks yet. Add one above.'));
        }

        return el('div', { class: 'todo-main' }, [header, addRow, taskList]);
    }

    _buildTask(task, list) {
        const isEditing = this.editingTaskId === task.id;

        const checkbox = el('button', {
            class: `todo-checkbox ${task.done ? 'is-done' : ''}`,
            type: 'button',
            onclick: () => {
                task.done = !task.done;
                this._save();
                this.render();
            },
        }, task.done ? '✓' : '');

        let content;
        if (isEditing) {
            const editInput = el('input', {
                class: 'todo-edit-input',
                type: 'text',
                value: task.text,
                onkeydown: (e) => {
                    if (e.key === 'Enter') {
                        task.text = e.target.value.trim() || task.text;
                        this.editingTaskId = null;
                        this._save();
                        this.render();
                    }
                    if (e.key === 'Escape') {
                        this.editingTaskId = null;
                        this.render();
                    }
                },
                onblur: (e) => {
                    task.text = e.target.value.trim() || task.text;
                    this.editingTaskId = null;
                    this._save();
                    this.render();
                },
            });
            content = editInput;
            // Auto-focus after render
            requestAnimationFrame(() => editInput.focus());
        } else {
            content = el('span', {
                class: `todo-task-text ${task.done ? 'is-done' : ''}`,
                onclick: () => {
                    this.editingTaskId = task.id;
                    this.render();
                },
            }, task.text);
        }

        const dueBadge = task.dueDate
            ? el('span', {
                class: `todo-due ${this._isPastDue(task.dueDate) && !task.done ? 'is-overdue' : ''}`,
            }, this._formatDate(task.dueDate))
            : null;

        const dateInput = el('input', {
            class: 'todo-date-input',
            type: 'date',
            value: task.dueDate || '',
            onchange: (e) => {
                task.dueDate = e.target.value || null;
                this._save();
                this.render();
            },
        });

        const deleteBtn = el('button', {
            class: 'todo-delete-btn',
            type: 'button',
            title: 'Delete',
            onclick: () => {
                list.tasks = list.tasks.filter((t) => t.id !== task.id);
                this._save();
                this.render();
            },
        }, '×');

        return el('div', {
            class: `todo-task ${task.done ? 'is-done' : ''}`,
            'data-id': task.id,
        }, [
            checkbox,
            el('div', { class: 'todo-task-body' }, [
                content,
                dueBadge,
            ].filter(Boolean)),
            el('div', { class: 'todo-task-actions' }, [dateInput, deleteBtn]),
        ]);
    }

    // ─── Actions ─────────────────────────────────────────────

    _addTask(list, text) {
        const maxPos = list.tasks.reduce((m, t) => Math.max(m, t.position), 0);
        list.tasks.push({
            id: this._id(),
            text,
            done: false,
            dueDate: null,
            position: maxPos + 1000,
        });
        this._save();
        this.render();
    }

    _clearDone(list) {
        const count = list.tasks.filter((t) => t.done).length;
        if (!count) return;
        if (!confirm(`Clear ${count} completed task${count > 1 ? 's' : ''}?`)) return;
        list.tasks = list.tasks.filter((t) => !t.done);
        this._save();
        this.render();
    }

    _addList() {
        const name = prompt('List name:');
        if (!name || !name.trim()) return;
        const newList = {
            id: this._id(),
            name: name.trim().slice(0, 30),
            tasks: [],
        };
        this.data.lists.push(newList);
        this.activeListId = newList.id;
        this._save();
        this.render();
    }

    _listContextMenu(list) {
        const action = prompt(`"${list.name}"\n\nType 'rename' to rename or 'delete' to delete:`);
        if (!action) return;

        if (action.toLowerCase() === 'rename') {
            const newName = prompt('New name:', list.name);
            if (newName && newName.trim()) {
                list.name = newName.trim().slice(0, 30);
                this._save();
                this.render();
            }
        } else if (action.toLowerCase() === 'delete') {
            if (this.data.lists.length <= 1) {
                alert('Cannot delete the last list.');
                return;
            }
            if (!confirm(`Delete "${list.name}" and all its tasks?`)) return;
            this.data.lists = this.data.lists.filter((l) => l.id !== list.id);
            if (this.activeListId === list.id) {
                this.activeListId = this.data.lists[0]?.id;
            }
            this._save();
            this.render();
        }
    }

    // ─── Helpers ─────────────────────────────────────────────

    _isPastDue(dateStr) {
        if (!dateStr) return false;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return new Date(dateStr + 'T00:00:00') < today;
    }

    _formatDate(dateStr) {
        if (!dateStr) return '';
        try {
            const d = new Date(dateStr + 'T00:00:00');
            const now = new Date();
            now.setHours(0, 0, 0, 0);
            const diff = Math.round((d - now) / 86400000);
            if (diff === 0) return 'Today';
            if (diff === 1) return 'Tomorrow';
            if (diff === -1) return 'Yesterday';
            return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        } catch {
            return dateStr;
        }
    }

    // ─── Styles ──────────────────────────────────────────────

    _injectStyles() {
        const style = el('style', {}, `
            .app-todo {
                background: var(--bg, #060b14);
                color: var(--text-bright, #c8d6e5);
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                overflow: hidden;
            }

            .todo-layout {
                display: flex;
                height: 100%;
            }

            /* ── Sidebar ── */
            .todo-sidebar {
                width: 200px;
                min-width: 160px;
                background: var(--bg-card, rgba(8, 18, 32, 0.85));
                border-right: 1px solid var(--border, rgba(255,255,255,0.06));
                display: flex;
                flex-direction: column;
                padding: 12px 8px;
                gap: 4px;
                overflow-y: auto;
            }

            .todo-list-btn {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 10px 12px;
                border: none;
                border-radius: var(--radius-sm, 8px);
                background: transparent;
                color: var(--text, #8a9bb0);
                font-size: 14px;
                cursor: pointer;
                transition: background 0.15s, color 0.15s;
                text-align: left;
                -webkit-user-select: none;
                user-select: none;
            }

            .todo-list-btn:hover {
                background: rgba(255,255,255,0.05);
            }

            .todo-list-btn.is-active {
                background: var(--accent-bg, rgba(0,229,193,0.08));
                color: var(--accent, #00e5c1);
            }

            .todo-list-name {
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                flex: 1;
            }

            .todo-list-count {
                background: var(--accent-dim, rgba(0,229,193,0.25));
                color: var(--accent, #00e5c1);
                font-size: 11px;
                padding: 2px 7px;
                border-radius: 999px;
                min-width: 18px;
                text-align: center;
            }

            .todo-add-list-btn {
                display: block;
                width: 100%;
                margin-top: 8px;
                padding: 10px 12px;
                border: 1px dashed var(--border-light, rgba(255,255,255,0.1));
                border-radius: var(--radius-sm, 8px);
                background: transparent;
                color: var(--text-dim, #3d4f63);
                font-size: 13px;
                cursor: pointer;
                transition: color 0.15s, border-color 0.15s;
            }

            .todo-add-list-btn:hover {
                color: var(--accent, #00e5c1);
                border-color: var(--accent-dim, rgba(0,229,193,0.25));
            }

            /* ── Main ── */
            .todo-main {
                flex: 1;
                display: flex;
                flex-direction: column;
                overflow: hidden;
            }

            .todo-main-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 16px 20px 8px;
                flex-shrink: 0;
            }

            .todo-list-title {
                font-size: 20px;
                font-weight: 600;
                margin: 0;
                color: var(--text-bright, #c8d6e5);
            }

            .todo-clear-btn {
                border: none;
                background: transparent;
                color: var(--text-dim, #3d4f63);
                font-size: 12px;
                cursor: pointer;
                padding: 4px 10px;
                border-radius: var(--radius-xs, 4px);
                transition: color 0.15s;
            }

            .todo-clear-btn:hover {
                color: var(--danger, #ff4757);
            }

            /* ── Add Task ── */
            .todo-add-row {
                display: flex;
                align-items: center;
                gap: 10px;
                padding: 8px 20px 12px;
                flex-shrink: 0;
            }

            .todo-add-icon {
                width: 28px;
                height: 28px;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 50%;
                background: var(--accent-bg, rgba(0,229,193,0.08));
                color: var(--accent, #00e5c1);
                font-size: 18px;
                font-weight: 300;
                flex-shrink: 0;
            }

            .todo-add-input {
                flex: 1;
                background: var(--bg-card, rgba(8,18,32,0.85));
                border: 1px solid var(--border, rgba(255,255,255,0.06));
                border-radius: var(--radius-sm, 8px);
                color: var(--text-bright, #c8d6e5);
                padding: 10px 14px;
                font-size: 14px;
                outline: none;
                transition: border-color 0.15s;
            }

            .todo-add-input:focus {
                border-color: var(--accent-dim, rgba(0,229,193,0.25));
            }

            .todo-add-input::placeholder {
                color: var(--text-dim, #3d4f63);
            }

            /* ── Task List ── */
            .todo-task-list {
                flex: 1;
                overflow-y: auto;
                padding: 0 20px 20px;
            }

            .todo-task {
                display: flex;
                align-items: center;
                gap: 10px;
                padding: 10px 12px;
                border-radius: var(--radius-sm, 8px);
                background: var(--bg-card, rgba(8,18,32,0.85));
                border: 1px solid var(--border, rgba(255,255,255,0.06));
                margin-bottom: 6px;
                transition: opacity 0.2s, background 0.15s;
            }

            .todo-task.is-done {
                opacity: 0.5;
            }

            .todo-task:hover {
                background: rgba(8,18,32,0.95);
            }

            .todo-checkbox {
                width: 22px;
                height: 22px;
                border-radius: 6px;
                border: 2px solid var(--border-light, rgba(255,255,255,0.1));
                background: transparent;
                color: transparent;
                cursor: pointer;
                flex-shrink: 0;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 13px;
                padding: 0;
                transition: all 0.15s;
            }

            .todo-checkbox.is-done {
                background: var(--accent, #00e5c1);
                border-color: var(--accent, #00e5c1);
                color: var(--bg, #060b14);
            }

            .todo-task-body {
                flex: 1;
                min-width: 0;
                display: flex;
                flex-direction: column;
                gap: 4px;
            }

            .todo-task-text {
                font-size: 14px;
                cursor: pointer;
                word-break: break-word;
            }

            .todo-task-text.is-done {
                text-decoration: line-through;
                color: var(--text-dim, #3d4f63);
            }

            .todo-edit-input {
                background: transparent;
                border: none;
                border-bottom: 1px solid var(--accent-dim, rgba(0,229,193,0.25));
                color: var(--text-bright, #c8d6e5);
                font-size: 14px;
                padding: 2px 0;
                outline: none;
                width: 100%;
            }

            .todo-due {
                font-size: 11px;
                color: var(--text-dim, #3d4f63);
            }

            .todo-due.is-overdue {
                color: var(--danger, #ff4757);
            }

            .todo-task-actions {
                display: flex;
                align-items: center;
                gap: 6px;
                flex-shrink: 0;
                opacity: 0;
                transition: opacity 0.15s;
            }

            .todo-task:hover .todo-task-actions {
                opacity: 1;
            }

            .todo-date-input {
                background: transparent;
                border: 1px solid var(--border, rgba(255,255,255,0.06));
                border-radius: 4px;
                color: var(--text-dim, #3d4f63);
                font-size: 11px;
                padding: 3px 6px;
                outline: none;
                width: 110px;
                cursor: pointer;
            }

            .todo-date-input::-webkit-calendar-picker-indicator {
                filter: invert(0.5);
            }

            .todo-delete-btn {
                width: 24px;
                height: 24px;
                border: none;
                border-radius: 4px;
                background: transparent;
                color: var(--text-dim, #3d4f63);
                font-size: 16px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 0;
                transition: color 0.15s;
            }

            .todo-delete-btn:hover {
                color: var(--danger, #ff4757);
            }

            .todo-done-divider {
                display: flex;
                align-items: center;
                gap: 10px;
                padding: 12px 0 8px;
                color: var(--text-dim, #3d4f63);
                font-size: 12px;
            }

            .todo-done-divider::after {
                content: '';
                flex: 1;
                height: 1px;
                background: var(--border, rgba(255,255,255,0.06));
            }

            .todo-empty {
                text-align: center;
                padding: 40px 20px;
                color: var(--text-dim, #3d4f63);
                font-size: 14px;
            }

            /* ── Mobile ── */
            @media (max-width: 600px) {
                .todo-sidebar {
                    width: 100%;
                    min-width: 0;
                    border-right: none;
                    border-bottom: 1px solid var(--border, rgba(255,255,255,0.06));
                    flex-direction: row;
                    padding: 8px;
                    gap: 6px;
                    overflow-x: auto;
                    overflow-y: hidden;
                    flex-shrink: 0;
                }

                .todo-layout {
                    flex-direction: column;
                }

                .todo-list-btn {
                    white-space: nowrap;
                    padding: 8px 14px;
                    flex-shrink: 0;
                }

                .todo-add-list-btn {
                    width: auto;
                    margin-top: 0;
                    white-space: nowrap;
                    flex-shrink: 0;
                }

                .todo-task-actions {
                    opacity: 1;
                }

                .todo-date-input {
                    width: 90px;
                }
            }

            @media (max-width: 400px) {
                .todo-main-header { padding: 12px 14px 6px; }
                .todo-add-row { padding: 6px 14px 10px; }
                .todo-task-list { padding: 0 14px 14px; }
                .todo-list-title { font-size: 18px; }
            }
        `);
        this.root.appendChild(style);
    }
}
