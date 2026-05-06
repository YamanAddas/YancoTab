import { App } from '../core/App.js';
import { el } from '../utils/dom.js';
import { showConfirm, showPrompt, showAlert } from '../ui/components/YancoModal.js';

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

    async _clearDone(list) {
        const count = list.tasks.filter((t) => t.done).length;
        if (!count) return;
        if (!await showConfirm('Clear Completed', `Remove ${count} completed task${count > 1 ? 's' : ''}?`)) return;
        list.tasks = list.tasks.filter((t) => !t.done);
        this._save();
        this.render();
    }

    async _addList() {
        const name = await showPrompt('New List', 'List name:');
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

    async _listContextMenu(list) {
        const newName = await showPrompt('Rename List', 'Enter new name:', list.name);
        if (newName === null) return;
        if (newName.trim()) {
            list.name = newName.trim().slice(0, 30);
            this._save();
            this.render();
        }
    }

    async _deleteList(list) {
        if (this.data.lists.length <= 1) {
            await showAlert('Cannot Delete', 'You must keep at least one list.');
            return;
        }
        if (!await showConfirm('Delete List', `Delete "${list.name}" and all its tasks?`, { danger: true })) return;
        this.data.lists = this.data.lists.filter((l) => l.id !== list.id);
        if (this.activeListId === list.id) {
            this.activeListId = this.data.lists[0]?.id;
        }
        this._save();
        this.render();
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

    // Styles moved to css/todo.css
}
