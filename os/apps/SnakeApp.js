
import { App } from '../core/App.js';
import { el } from '../utils/dom.js';

export class SnakeApp extends App {
    constructor(kernel, pid) {
        super(kernel, pid);
        this.metadata = {
            name: 'Snake',
            id: 'snake',
            icon: `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 128 128' width='128' height='128'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#0b1320'/><stop offset='1' stop-color='#1565c0'/></linearGradient></defs><rect x='12' y='12' width='104' height='104' rx='28' fill='url(#g)'/><rect x='14' y='14' width='100' height='100' rx='26' fill='rgba(255,255,255,0.06)'/><g fill='none' stroke='rgba(255,255,255,0.92)' stroke-width='7' stroke-linecap='round' stroke-linejoin='round'><path d='M40 78c0 10 10 18 24 18s24-8 24-18-10-18-24-18-24-8-24-18 10-18 24-18 24 8 24 18'/><circle cx='86' cy='38' r='4' fill='rgba(255,255,255,0.92)' stroke='none'/></g></svg>`
        };
        this.game = null;
    }

    async init() {
        this.root = el('div', { class: 'app-window app-snake' });

        // Device Body
        const deviceBody = el('div', { class: 'snake-device-body' });

        // Screen Section
        const screenSection = el('div', { class: 'snake-screen-section' });

        // Bezel & Canvas
        const bezel = el('div', { class: 'snake-bezel' });

        // Header
        const header = el('div', { class: 'snake-header' }, [
            el('div', { class: 'snake-title' }, 'YamanSnake'),
            el('div', { class: 'snake-score-display' }, 'SCORE: 0'),
            el('button', { class: 'snake-close', onclick: () => this.close() }, '×')
        ]);

        this.container = el('div', { class: 'snake-container' });
        this.canvas = document.createElement('canvas');
        this.canvas.className = 'snake-canvas';
        this.canvas.tabIndex = 0; // Focusable
        this.container.appendChild(this.canvas);

        bezel.append(header, this.container);
        screenSection.appendChild(bezel);

        // Controls
        const controlsSection = el('div', { class: 'snake-controls-section' });
        this.dpad = this.createDPad();
        this.actions = this.createActionButtons();

        controlsSection.append(this.dpad, this.actions);
        deviceBody.append(screenSection, controlsSection);
        this.root.appendChild(deviceBody);

        // Defer Start to next frame to allow DOM insertion
        requestAnimationFrame(() => this.startGame());
    }

    createDPad() {
        const dpad = el('div', { class: 'snake-dpad' });
        const cross = el('div', { class: 'dpad-cross' });

        // Helper to create buttons
        const btn = (cls, dx, dy) => {
            const b = el('div', { class: `dpad-btn ${cls}` });
            // Touch/Click handling
            const hit = (e) => {
                if (e.cancelable) e.preventDefault();
                if (navigator.vibrate) navigator.vibrate(10);
                if (this.game) this.game.handleDirectionInput(dx, dy);
                b.classList.add('active');
                setTimeout(() => b.classList.remove('active'), 100);
            };
            b.addEventListener('pointerdown', hit);
            return b;
        };

        cross.append(
            el('div', { class: 'dpad-empty' }), btn('dpad-up', 0, -1), el('div', { class: 'dpad-empty' }),
            btn('dpad-left', -1, 0), el('div', { class: 'dpad-center' }), btn('dpad-right', 1, 0),
            el('div', { class: 'dpad-empty' }), btn('dpad-down', 0, 1), el('div', { class: 'dpad-empty' })
        );

        dpad.appendChild(cross);
        return dpad;
    }

    createActionButtons() {
        const container = el('div', { class: 'snake-actions' });

        const makeBtn = (cls, label, action) => {
            const b = el('button', { class: `action-btn ${cls}`, type: 'button' }, label);
            b.addEventListener('pointerdown', (e) => {
                e.preventDefault();
                if (navigator.vibrate) navigator.vibrate(5);
                if (this.game) this.game.handleActionInput(action);
            });
            return b;
        };

        // Create button-label pairs for proper alignment
        const btnGroup = el('div', { class: 'action-group' });

        const btnB = makeBtn('btn-b', 'B', 'LEVEL');
        const btnA = makeBtn('btn-a', 'A', 'START');

        btnGroup.append(btnB, btnA);

        // Create labels container with proper positioning
        const labelsRow = el('div', { class: 'action-labels' });
        const labelB = el('div', { class: 'action-label label-b' }, 'Level');
        const labelA = el('div', { class: 'action-label label-a' }, 'Start/Pause');

        labelsRow.append(labelB, labelA);

        container.append(btnGroup, labelsRow);
        return container;
    }

    startGame() {
        // Init Game Logic
        this.game = new SnakeGame(this.canvas);

        // Initial Resize
        this.handleResize();

        // Observer for subsequent resizes
        this.resizeObserver = new ResizeObserver(() => this.handleResize());
        this.resizeObserver.observe(this.container);

        // Start Loop
        this.game.start();

        // Focus for keyboard
        this.canvas.focus();
    }

    handleResize() {
        const rect = this.container.getBoundingClientRect();
        const width = Math.floor(rect.width);
        const height = Math.floor(rect.height);
        if (width < 40 || height < 40) return;

        this.canvas.width = width;
        this.canvas.height = height;

        if (this.game) {
            this.game.resize(width, height);
            this.game.render(); // Force re-render immediately
        }
    }

    destroy() {
        if (this.resizeObserver) this.resizeObserver.disconnect();
        if (this.game) this.game.stop();
        super.destroy();
    }
}

/**
 * Game Logic: SnakeGame
 */
class SnakeGame {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d");
        this.cellSize = 20; // Fixed cell size for retro feel

        // State
        this.state = 'MENU'; // MENU, PLAYING, GAMEOVER
        this.level = 'easy'; // easy, moderate, hard
        this.score = 0;

        this.snake = [];
        this.food = { x: 0, y: 0 };
        this.direction = { x: 1, y: 0 };
        this.nextDirection = { x: 1, y: 0 };

        this.lastTime = 0;
        this.speed = 100;
        this.running = false;

        this.bindInput();
    }

    start() {
        this.running = true;
        this.state = 'MENU';
        requestAnimationFrame((t) => this.loop(t));
    }

    stop() {
        this.running = false;
    }

    resize(w, h) {
        this.width = w;
        this.height = h;
        // Recalculate grid
        this.cols = Math.max(6, Math.floor(w / this.cellSize));
        this.rows = Math.max(6, Math.floor(h / this.cellSize));

        if (this.snake.length > 0) {
            const seen = new Set();
            this.snake = this.snake.filter((segment) => {
                const wrapped = {
                    x: ((segment.x % this.cols) + this.cols) % this.cols,
                    y: ((segment.y % this.rows) + this.rows) % this.rows
                };
                const key = `${wrapped.x},${wrapped.y}`;
                if (seen.has(key)) return false;
                seen.add(key);
                segment.x = wrapped.x;
                segment.y = wrapped.y;
                return true;
            });
        }

        if (this.food.x >= this.cols || this.food.y >= this.rows || this.snake.some(s => s.x === this.food.x && s.y === this.food.y)) {
            this.spawnFood();
        }
    }

    bindInput() {
        this.canvas.addEventListener('keydown', (e) => {
            if (this.state === 'PLAYING') {
                switch (e.key) {
                    case 'ArrowUp': case 'w': this.handleDirectionInput(0, -1); break;
                    case 'ArrowDown': case 's': this.handleDirectionInput(0, 1); break;
                    case 'ArrowLeft': case 'a': this.handleDirectionInput(-1, 0); break;
                    case 'ArrowRight': case 'd': this.handleDirectionInput(1, 0); break;
                    case ' ': case 'p': this.handleActionInput('START'); break; // Pause
                }
            } else {
                // Menu/Gameover
                if (e.key === ' ' || e.key === 'Enter') this.handleActionInput('START');
                if (e.key === 'b' || e.key === 'ArrowRight') this.handleActionInput('LEVEL');
            }
        });

        // Ensure focus on click
        this.canvas.addEventListener('pointerdown', () => this.canvas.focus());
    }

    handleDirectionInput(dx, dy) {
        if (this.state !== 'PLAYING') return;

        // Prevent 180 turn
        if (dx !== 0 && this.direction.x !== 0) return;
        if (dy !== 0 && this.direction.y !== 0) return;

        this.nextDirection = { x: dx, y: dy };
    }

    handleActionInput(action) {
        if (this.state === 'MENU') {
            if (action === 'START') this.resetGame();
            if (action === 'LEVEL') this.cycleLevel();
        } else if (this.state === 'PLAYING') {
            if (action === 'START') this.togglePause();
            if (action === 'LEVEL') this.returnToMenu(); // B button returns to menu
        } else if (this.state === 'GAMEOVER') {
            if (action === 'START') this.state = 'MENU';
        }
    }

    returnToMenu() {
        this.state = 'MENU';
        this.paused = false;
        this.score = 0;
        const hud = document.querySelector('.snake-score-display');
        if (hud) hud.textContent = 'SCORE: 0';
    }

    cycleLevel() {
        const levels = ['easy', 'moderate', 'hard'];
        const idx = levels.indexOf(this.level);
        this.level = levels[(idx + 1) % levels.length];
    }

    togglePause() {
        this.paused = !this.paused;
    }

    resetGame() {
        this.snake = [{ x: 5, y: 10 }, { x: 4, y: 10 }, { x: 3, y: 10 }];
        this.direction = { x: 1, y: 0 };
        this.nextDirection = { x: 1, y: 0 };
        this.score = 0;
        this.state = 'PLAYING';
        this.paused = false;

        // Speed based on level
        this.speed = this.level === 'hard' ? 60 : (this.level === 'moderate' ? 90 : 120);

        this.spawnFood();
    }

    spawnFood() {
        // Simple random spawn
        let valid = false;
        while (!valid) {
            this.food = {
                x: Math.floor(Math.random() * this.cols),
                y: Math.floor(Math.random() * this.rows)
            };
            // Check collision with snake
            valid = !this.snake.some(s => s.x === this.food.x && s.y === this.food.y);
        }
    }

    loop(timestamp) {
        if (!this.running) return;

        const delta = timestamp - this.lastTime;

        if (delta > this.speed) {
            // Update Logic
            if (this.state === 'PLAYING' && !this.paused) {
                this.update();
            }
            this.lastTime = timestamp;
        }

        // Always Render (interpolated or not, we render every frame for smooth UI)
        this.render();

        requestAnimationFrame((t) => this.loop(t));
    }

    update() {
        this.direction = this.nextDirection;

        const head = { ...this.snake[0] };
        head.x += this.direction.x;
        head.y += this.direction.y;

        // Wrap walls
        if (head.x < 0) head.x = this.cols - 1;
        if (head.x >= this.cols) head.x = 0;
        if (head.y < 0) head.y = this.rows - 1;
        if (head.y >= this.rows) head.y = 0;

        // Self Collision check - must happen BEFORE unshift
        // Check if new head position overlaps with any existing snake segment
        // this.snake does NOT yet contain the new head, so we check against the current body
        if (this.snake.some((segment, index) => 
            index > 0 && segment.x === head.x && segment.y === head.y
        )) {
            this.state = 'GAMEOVER';
            return;
        }

        this.snake.unshift(head);

        // Eat Food
        if (head.x === this.food.x && head.y === this.food.y) {
            this.score += 10;
            this.spawnFood();
            // Update HUD
            const hud = document.querySelector('.snake-score-display');
            if (hud) hud.textContent = `SCORE: ${this.score}`;
        } else {
            this.snake.pop();
        }
    }

    render() {
        const ctx = this.ctx;
        
        // Clear with deep space background
        const bgGradient = ctx.createLinearGradient(0, 0, 0, this.height);
        bgGradient.addColorStop(0, '#051015');
        bgGradient.addColorStop(1, '#0a1a25');
        ctx.fillStyle = bgGradient;
        ctx.fillRect(0, 0, this.width, this.height);

        // Draw subtle grid with glow effect
        ctx.strokeStyle = 'rgba(45, 212, 191, 0.06)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        
        // Vertical lines
        for (let x = 0; x < this.width; x += this.cellSize) {
            ctx.moveTo(x, 0);
            ctx.lineTo(x, this.height);
        }
        // Horizontal lines
        for (let y = 0; y < this.height; y += this.cellSize) {
            ctx.moveTo(0, y);
            ctx.lineTo(this.width, y);
        }
        ctx.stroke();

        // Draw intersection dots for subtle detail
        ctx.fillStyle = 'rgba(45, 212, 191, 0.04)';
        for (let x = 0; x < this.width; x += this.cellSize) {
            for (let y = 0; y < this.height; y += this.cellSize) {
                ctx.beginPath();
                ctx.arc(x, y, 1, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        if (this.state === 'MENU') {
            this.renderMenu(ctx);
        } else if (this.state === 'GAMEOVER') {
            this.renderGame(ctx);
            this.renderGameOver(ctx);
        } else {
            this.renderGame(ctx);
            if (this.paused) this.renderPaused(ctx);
        }
    }

    renderGame(ctx) {
        const cellSize = this.cellSize;
        const padding = 2;
        const segmentSize = cellSize - padding * 2;
        
        // Draw snake with proper snake-like appearance
        this.snake.forEach((segment, i) => {
            const x = segment.x * cellSize + padding;
            const y = segment.y * cellSize + padding;
            
            // Head is special
            if (i === 0) {
                // Snake head - larger and more detailed
                ctx.fillStyle = '#2dd4bf';
                ctx.shadowBlur = 15;
                ctx.shadowColor = '#2dd4bf';
                
                // Draw head as rounded rect
                this.roundRect(ctx, x - 1, y - 1, segmentSize + 2, segmentSize + 2, 6, true);
                
                // Eyes based on direction
                ctx.fillStyle = '#000';
                ctx.shadowBlur = 0;
                const eyeSize = 3;
                const eyeOffset = segmentSize * 0.25;
                
                let eye1 = { x: 0, y: 0 }, eye2 = { x: 0, y: 0 };
                
                if (this.direction.x === 1) { // Moving right
                    eye1 = { x: x + segmentSize - eyeOffset, y: y + eyeOffset };
                    eye2 = { x: x + segmentSize - eyeOffset, y: y + segmentSize - eyeOffset };
                } else if (this.direction.x === -1) { // Moving left
                    eye1 = { x: x + eyeOffset, y: y + eyeOffset };
                    eye2 = { x: x + eyeOffset, y: y + segmentSize - eyeOffset };
                } else if (this.direction.y === -1) { // Moving up
                    eye1 = { x: x + eyeOffset, y: y + eyeOffset };
                    eye2 = { x: x + segmentSize - eyeOffset, y: y + eyeOffset };
                } else { // Moving down
                    eye1 = { x: x + eyeOffset, y: y + segmentSize - eyeOffset };
                    eye2 = { x: x + segmentSize - eyeOffset, y: y + segmentSize - eyeOffset };
                }
                
                ctx.beginPath();
                ctx.arc(eye1.x, eye1.y, eyeSize, 0, Math.PI * 2);
                ctx.arc(eye2.x, eye2.y, eyeSize, 0, Math.PI * 2);
                ctx.fill();
                
                // Eye shine
                ctx.fillStyle = '#fff';
                ctx.beginPath();
                ctx.arc(eye1.x - 1, eye1.y - 1, 1, 0, Math.PI * 2);
                ctx.arc(eye2.x - 1, eye2.y - 1, 1, 0, Math.PI * 2);
                ctx.fill();
                
            } else {
                // Body segments - gradient from head to tail
                const gradientFactor = i / (this.snake.length + 5);
                const greenValue = Math.floor(212 - gradientFactor * 80);
                const blueValue = Math.floor(191 - gradientFactor * 60);
                ctx.fillStyle = `rgb(45, ${greenValue}, ${blueValue})`;
                ctx.shadowBlur = 8;
                ctx.shadowColor = ctx.fillStyle;
                
                // Body segments are slightly smaller towards tail
                const sizeReduction = Math.min(i * 0.3, 3);
                const bodySize = segmentSize - sizeReduction;
                const offset = sizeReduction / 2;
                
                this.roundRect(ctx, x + offset, y + offset, bodySize, bodySize, 4, true);
            }
        });
        
        ctx.shadowBlur = 0;
        
        // Draw food as an apple
        const foodX = this.food.x * cellSize + cellSize / 2;
        const foodY = this.food.y * cellSize + cellSize / 2;
        const appleRadius = cellSize / 2 - 3;
        
        // Apple glow
        ctx.shadowBlur = 20;
        ctx.shadowColor = '#ff6b6b';
        
        // Apple body
        ctx.fillStyle = '#ff6b6b';
        ctx.beginPath();
        ctx.arc(foodX, foodY, appleRadius, 0, Math.PI * 2);
        ctx.fill();
        
        // Apple highlight
        ctx.fillStyle = '#ff8e8e';
        ctx.beginPath();
        ctx.arc(foodX - 3, foodY - 3, appleRadius * 0.3, 0, Math.PI * 2);
        ctx.fill();
        
        // Apple stem
        ctx.strokeStyle = '#4a3728';
        ctx.lineWidth = 2;
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.moveTo(foodX, foodY - appleRadius + 2);
        ctx.lineTo(foodX + 2, foodY - appleRadius - 4);
        ctx.stroke();
        
        // Apple leaf
        ctx.fillStyle = '#7cb342';
        ctx.beginPath();
        ctx.ellipse(foodX + 4, foodY - appleRadius - 3, 4, 2, Math.PI / 4, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.shadowBlur = 0;
    }
    
    // Helper for rounded rectangles
    roundRect(ctx, x, y, width, height, radius, fill) {
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        ctx.lineTo(x + radius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
        if (fill) {
            ctx.fill();
        } else {
            ctx.stroke();
        }
    }

    renderMenu(ctx) {
        // Dark overlay with gradient
        const gradient = ctx.createRadialGradient(this.width/2, this.height/2, 0, this.width/2, this.height/2, this.width);
        gradient.addColorStop(0, 'rgba(0,15,20,0.85)');
        gradient.addColorStop(1, 'rgba(0,0,0,0.95)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, this.width, this.height);

        // Snake logo/icon
        ctx.textAlign = 'center';
        ctx.font = 'bold 48px system-ui, -apple-system, sans-serif';
        
        // Glow effect for title
        ctx.shadowBlur = 30;
        ctx.shadowColor = '#2dd4bf';
        ctx.fillStyle = '#2dd4bf';
        ctx.fillText('🐍 SNAKE', this.width / 2, this.height / 3);
        ctx.shadowBlur = 0;

        // Mode selector
        ctx.font = '20px system-ui, -apple-system, sans-serif';
        ctx.fillStyle = '#fff';
        ctx.fillText(`Mode: < ${this.level.toUpperCase()} >`, this.width / 2, this.height / 2);

        // Instructions with icons
        ctx.font = '14px system-ui, -apple-system, sans-serif';
        ctx.fillStyle = '#888';
        if (this.state === 'PLAYING') {
            ctx.fillText('Ⓐ Pause/Resume', this.width / 2, this.height / 2 + 50);
            ctx.fillText('Ⓑ Back to Menu', this.width / 2, this.height / 2 + 75);
        } else {
            ctx.fillText('Press Ⓐ to Start', this.width / 2, this.height / 2 + 50);
            ctx.fillText('Press Ⓑ to Change Mode', this.width / 2, this.height / 2 + 75);
        }
    }

    renderPaused(ctx) {
        ctx.fillStyle = 'rgba(0,10,15,0.6)';
        ctx.fillRect(0, 0, this.width, this.height);
        
        ctx.textAlign = 'center';
        ctx.font = 'bold 32px system-ui, -apple-system, sans-serif';
        ctx.fillStyle = '#fff';
        ctx.shadowBlur = 20;
        ctx.shadowColor = '#2dd4bf';
        ctx.fillText('⏸ PAUSED', this.width / 2, this.height / 2);
        ctx.shadowBlur = 0;
        
        ctx.font = '14px system-ui, -apple-system, sans-serif';
        ctx.fillStyle = '#888';
        ctx.fillText('Press Ⓐ to Resume', this.width / 2, this.height / 2 + 40);
    }

    renderGameOver(ctx) {
        // Dark red overlay
        const gradient = ctx.createRadialGradient(this.width/2, this.height/2, 0, this.width/2, this.height/2, this.width);
        gradient.addColorStop(0, 'rgba(60,10,10,0.8)');
        gradient.addColorStop(1, 'rgba(20,0,0,0.95)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, this.width, this.height);

        ctx.textAlign = 'center';
        
        // Game Over text with glow
        ctx.font = 'bold 42px system-ui, -apple-system, sans-serif';
        ctx.fillStyle = '#ff6b6b';
        ctx.shadowBlur = 25;
        ctx.shadowColor = '#ff3b30';
        ctx.fillText('💀 GAME OVER', this.width / 2, this.height / 2 - 25);
        ctx.shadowBlur = 0;

        // Score display
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 24px system-ui, -apple-system, sans-serif';
        ctx.fillText(`Score: ${this.score}`, this.width / 2, this.height / 2 + 25);

        // Instructions
        ctx.font = '14px system-ui, -apple-system, sans-serif';
        ctx.fillStyle = '#888';
        ctx.fillText('Press Ⓐ for Menu', this.width / 2, this.height / 2 + 65);
    }
}
