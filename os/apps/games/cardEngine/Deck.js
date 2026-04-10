
import { Card } from './Card.js';

export class Deck {
    constructor() {
        this.cards = [];
        this.reset();
    }

    reset() {
        this.cards = [];
        const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
        for (const suit of suits) {
            for (let rank = 1; rank <= 13; rank++) {
                this.cards.push(new Card(suit, rank));
            }
        }
    }

    shuffle() {
    // Fisher-Yates with crypto-grade randomness when available
    const hasCrypto = typeof crypto !== 'undefined' && crypto && typeof crypto.getRandomValues === 'function';
    const randInt = (maxExclusive) => {
        if (maxExclusive <= 1) return 0;
        if (!hasCrypto) return Math.floor(Math.random() * maxExclusive);
        // Rejection sampling to avoid modulo bias
        const range = 0x100000000; // 2^32
        const limit = range - (range % maxExclusive);
        const buf = new Uint32Array(1);
        let x;
        do {
            crypto.getRandomValues(buf);
            x = buf[0];
        } while (x >= limit);
        return x % maxExclusive;
    };

    for (let i = this.cards.length - 1; i > 0; i--) {
        const j = randInt(i + 1);
        [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    }
}

    deal() {
        return this.cards.pop();
    }

    get remaining() {
        return this.cards.length;
    }
}
