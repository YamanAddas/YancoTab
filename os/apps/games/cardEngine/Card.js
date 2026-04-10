
import { el } from '../../../utils/dom.js';

export class Card {
    constructor(suit, rank) {
        this.suit = suit; // 'hearts', 'diamonds', 'clubs', 'spades'
        this.rank = rank; // 1-13 (1=Ace, 11=Jack, 12=Queen, 13=King)
        this.faceUp = false;
        this.color = (suit === 'hearts' || suit === 'diamonds') ? 'red' : 'black';

        this.element = this.render();
        this.updateFace();
    }

    render() {
        const card = el('div', { class: 'card' });

        // Inner container for the flip animation
        this.inner = el('div', { class: 'card-inner' });

        // Front Face
        this.front = el('div', { class: 'card-front' });
        this.renderFront();

        // Back Face
        this.back = el('div', { class: 'card-back' });

        this.inner.append(this.front, this.back);
        card.appendChild(this.inner);

        return card;
    }

    renderFront() {
        // Top Left Corner
        const corner = el('div', { class: 'card-corner top-left' });
        corner.innerHTML = `<span>${this.getRankSymbol()}</span><span class="suit">${this.getSuitSymbol()}</span>`;

        // Center content (Simplified for now, can be complex SVG later)
        const center = el('div', { class: 'card-center' });
        center.innerHTML = `<span class="suit-large">${this.getSuitSymbol()}</span>`;

        // Bottom Right Corner (Rotated)
        const cornerBR = el('div', { class: 'card-corner bottom-right' });
        cornerBR.innerHTML = `<span>${this.getRankSymbol()}</span><span class="suit">${this.getSuitSymbol()}</span>`;

        this.front.className = `card-front ${this.color}`;
        this.front.append(corner, center, cornerBR);
    }

    getSuitSymbol() {
        const map = {
            hearts: '♥',
            diamonds: '♦',
            clubs: '♣',
            spades: '♠'
        };
        return map[this.suit];
    }

    getRankSymbol() {
        if (this.rank === 1) return 'A';
        if (this.rank === 11) return 'J';
        if (this.rank === 12) return 'Q';
        if (this.rank === 13) return 'K';
        return this.rank;
    }

    flip(faceUp = !this.faceUp) {
        this.faceUp = faceUp;
        this.updateFace();
    }

    updateFace() {
        if (this.faceUp) {
            this.element.classList.add('flipped');
        } else {
            this.element.classList.remove('flipped');
        }
    }
}
