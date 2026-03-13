/* ============================================
   GAME.JS — Game Rendering Module (IIFE)
   Lettuce Family Card Game Night
   ============================================ */

window.gameRenderer = (function () {
    'use strict';

    // Suit symbols and colors
    const SUIT_SYMBOLS = {
        hearts: '\u2665',
        diamonds: '\u2666',
        clubs: '\u2663',
        spades: '\u2660'
    };

    const SUIT_COLORS = {
        hearts: 'red',
        diamonds: 'red',
        clubs: 'black',
        spades: 'black'
    };

    const RANK_DISPLAY = {
        '2': '2', '3': '3', '4': '4', '5': '5', '6': '6',
        '7': '7', '8': '8', '9': '9', '10': '10',
        'J': 'J', 'Q': 'Q', 'K': 'K', 'A': 'A'
    };

    const RANK_ORDER = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    const FANTAN_RANK_ORDER = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

    const ROUND_INFO = {
        tricks: { name: 'Tricks', icon: '\u{1F0CF}', desc: 'Avoid taking tricks (+5 each)', color: '#7e57c2' },
        hearts: { name: 'Hearts', icon: '\u2665', desc: 'Avoid hearts (+10 each)', color: '#ef5350' },
        queens: { name: 'Queens', icon: '\u265B', desc: 'Avoid queens (+25 each)', color: '#ab47bc' },
        king_of_spades: { name: 'King of Spades', icon: 'K\u2660', desc: 'Avoid K\u2660 (+75)', color: '#42a5f5' },
        last_trick: { name: 'Last Trick', icon: '\u270B', desc: 'Avoid the last trick (+100)', color: '#ff7043' },
        everything: { name: 'Everything', icon: '\u26A1', desc: 'Avoid ALL penalties combined', color: '#ec407a' },
        fantan: { name: 'Fantan', icon: '\u{1F4CB}', desc: 'Be first to empty your hand', color: '#4caf50' }
    };

    /**
     * Render a single playing card as a DOM element
     * @param {Object} card - {suit, rank}
     * @param {Object} options - {faceDown, small, playable, dimmed, selected}
     * @returns {HTMLElement}
     */
    function renderCard(card, options = {}) {
        const el = document.createElement('div');
        el.className = 'card';

        if (options.faceDown) {
            el.classList.add('card-back');
            if (options.small) el.classList.add('card-small');
            return el;
        }

        const color = SUIT_COLORS[card.suit] || 'black';
        el.classList.add(color);
        if (options.small) el.classList.add('card-small');
        if (options.playable) el.classList.add('playable');
        if (options.dimmed) el.classList.add('dimmed');
        if (options.selected) el.classList.add('selected');

        const rankText = RANK_DISPLAY[card.rank] || card.rank;
        const suitSymbol = SUIT_SYMBOLS[card.suit] || '';

        // Top-left corner
        const cornerTop = document.createElement('div');
        cornerTop.className = 'card-corner card-corner-top';
        cornerTop.innerHTML = '<span class="card-rank">' + rankText + '</span><span class="card-suit-small">' + suitSymbol + '</span>';

        // Center suit
        const centerSuit = document.createElement('div');
        centerSuit.className = 'card-center-suit';
        centerSuit.textContent = suitSymbol;

        // Bottom-right corner
        const cornerBottom = document.createElement('div');
        cornerBottom.className = 'card-corner card-corner-bottom';
        cornerBottom.innerHTML = '<span class="card-rank">' + rankText + '</span><span class="card-suit-small">' + suitSymbol + '</span>';

        el.appendChild(cornerTop);
        el.appendChild(centerSuit);
        el.appendChild(cornerBottom);

        el.dataset.suit = card.suit;
        el.dataset.rank = card.rank;

        return el;
    }

    /**
     * Render the player's hand at the bottom of the screen
     * @param {Array} cards - array of {suit, rank}
     * @param {Array} playableCardKeys - array of "suit:rank" strings
     * @param {HTMLElement} container
     * @param {Function} onCardClick - callback(suit, rank)
     */
    function renderPlayerHand(cards, playableCardKeys, container, onCardClick) {
        container.innerHTML = '';

        if (!cards || cards.length === 0) return;

        const playableSet = new Set(playableCardKeys || []);
        const totalCards = cards.length;
        const isMobile = window.innerWidth <= 768;

        // Create a wrapper
        const wrapper = document.createElement('div');
        wrapper.style.display = 'flex';
        wrapper.style.alignItems = 'flex-end';
        wrapper.style.position = 'relative';

        if (isMobile) {
            // Mobile: flat row, no overlap, scrollable horizontally
            wrapper.style.justifyContent = 'flex-start';
            wrapper.style.height = '80px';
            wrapper.style.gap = '4px';
            wrapper.style.paddingLeft = '12px';
            wrapper.style.paddingRight = '12px';

            cards.forEach((card, index) => {
                const key = card.suit + ':' + card.rank;
                const isPlayable = playableSet.has(key);

                const cardEl = renderCard(card, {
                    playable: isPlayable,
                    dimmed: playableSet.size > 0 && !isPlayable
                });

                cardEl.classList.add('hand-card');
                cardEl.style.flexShrink = '0';
                cardEl.style.transform = isPlayable ? 'translateY(-6px)' : 'none';

                if (isPlayable) {
                    cardEl.addEventListener('click', function () {
                        cardEl.classList.add('selected');
                        setTimeout(function () {
                            onCardClick(card.suit, card.rank);
                        }, 150);
                    });
                }

                wrapper.appendChild(cardEl);
            });
        } else {
            // Desktop: centered fan with arc
            const maxWidth = container.clientWidth - 80;
            const cardWidth = 65;
            let overlap = Math.min(40, Math.max(20, (maxWidth - cardWidth) / Math.max(totalCards - 1, 1)));

            wrapper.style.justifyContent = 'center';
            wrapper.style.height = '120px';

            cards.forEach((card, index) => {
                const key = card.suit + ':' + card.rank;
                const isPlayable = playableSet.has(key);

                const cardEl = renderCard(card, {
                    playable: isPlayable,
                    dimmed: playableSet.size > 0 && !isPlayable
                });

                cardEl.classList.add('hand-card');

                const centerIndex = (totalCards - 1) / 2;
                const offset = index - centerIndex;
                const rotation = offset * 1.5;
                const verticalOffset = Math.abs(offset) * 1.2;

                cardEl.style.position = 'relative';
                cardEl.style.marginLeft = index === 0 ? '0' : '-' + (cardWidth - overlap) + 'px';
                cardEl.style.transform = 'rotate(' + rotation + 'deg) translateY(' + verticalOffset + 'px)';
                cardEl.style.zIndex = index;

                if (isPlayable) {
                    cardEl.style.transform = 'rotate(' + rotation + 'deg) translateY(' + (verticalOffset - 8) + 'px)';
                    cardEl.addEventListener('click', function () {
                        cardEl.classList.add('selected');
                        setTimeout(function () {
                            onCardClick(card.suit, card.rank);
                        }, 150);
                    });
                }

                wrapper.appendChild(cardEl);
            });
        }

        container.appendChild(wrapper);
    }

    /**
     * Render opponent's card backs
     * @param {number} cardCount
     * @param {HTMLElement} container
     */
    function renderOpponentHand(cardCount, container) {
        container.innerHTML = '';
        const maxShow = Math.min(cardCount, 10);

        for (let i = 0; i < maxShow; i++) {
            const back = document.createElement('div');
            back.className = 'card-back-mini';
            back.style.marginLeft = i === 0 ? '0' : '-14px';
            back.style.zIndex = i;
            container.appendChild(back);
        }

        if (cardCount > maxShow) {
            const more = document.createElement('span');
            more.style.fontSize = '11px';
            more.style.fontWeight = '600';
            more.style.color = '#5d4037';
            more.style.marginLeft = '4px';
            more.textContent = '+' + (cardCount - maxShow);
            container.appendChild(more);
        }
    }

    /**
     * Render trick-taking cards in center
     * @param {Array} trickCards - array of {player_id, player_name, suit, rank}
     * @param {Array} players - all players for positioning
     * @param {HTMLElement} container
     */
    function renderTrick(trickCards, players, container) {
        container.innerHTML = '';

        if (!trickCards || trickCards.length === 0) return;

        // Position cards in a fan/circle
        const centerX = 130;
        const centerY = 100;
        const radius = 55;

        trickCards.forEach(function (tc, index) {
            const angle = (index / Math.max(trickCards.length, 1)) * Math.PI * 2 - Math.PI / 2;
            const x = centerX + Math.cos(angle) * radius - 32;
            const y = centerY + Math.sin(angle) * radius - 47;

            const wrapper = document.createElement('div');
            wrapper.className = 'trick-card-wrapper';
            wrapper.style.left = x + 'px';
            wrapper.style.top = y + 'px';

            const cardEl = renderCard({ suit: tc.suit, rank: tc.rank });
            cardEl.style.transform = 'rotate(' + (index * 5 - 5) + 'deg)';

            const label = document.createElement('div');
            label.className = 'trick-card-label';
            label.textContent = tc.player_name || 'Player';

            wrapper.appendChild(cardEl);
            wrapper.appendChild(label);
            container.appendChild(wrapper);
        });
    }

    /**
     * Animate a card being played to the trick area
     * @param {Object} fromPosition - {x, y} screen coordinates
     * @param {Object} card - {suit, rank}
     * @param {number} playerIndex
     * @param {HTMLElement} container
     * @param {Function} callback
     */
    function animateCardPlay(fromPosition, card, playerIndex, container, callback) {
        const cardEl = renderCard(card);
        cardEl.classList.add('card-playing');
        cardEl.style.position = 'absolute';
        cardEl.style.left = (fromPosition ? fromPosition.x : 0) + 'px';
        cardEl.style.top = (fromPosition ? fromPosition.y : 0) + 'px';
        cardEl.style.zIndex = 300;
        cardEl.style.transition = 'all 0.4s ease';

        container.appendChild(cardEl);

        requestAnimationFrame(function () {
            const centerX = container.offsetWidth / 2 - 32;
            const centerY = container.offsetHeight / 2 - 47;
            cardEl.style.left = centerX + 'px';
            cardEl.style.top = centerY + 'px';
        });

        setTimeout(function () {
            cardEl.remove();
            if (callback) callback();
        }, 450);
    }

    /**
     * Animate trick being won
     * @param {number} winnerIndex
     * @param {HTMLElement} container
     * @param {Function} callback
     */
    function animateTrickWin(winnerIndex, container, callback) {
        const cards = container.querySelectorAll('.trick-card-wrapper');
        cards.forEach(function (wrapper) {
            wrapper.classList.add('trick-winning');
        });

        setTimeout(function () {
            container.innerHTML = '';
            if (callback) callback();
        }, 600);
    }

    /**
     * Render the Fantan 4x13 layout grid
     * @param {Object} layout - {spades: [...], hearts: [...], diamonds: [...], clubs: [...]}
     *   Each array has 13 elements (index 0=2, index 12=A), null if empty
     * @param {HTMLElement} container
     * @param {Array} playableCards - array of "suit:rank" keys the player can place
     * @param {Function} onCellClick - callback(suit, rank) when a playable slot is clicked
     */
    function renderFantanLayout(layout, container, playableCards, onCellClick) {
        container.innerHTML = '';

        if (!layout) return;

        const suitOrder = ['spades', 'hearts', 'diamonds', 'clubs'];
        const playableSet = new Set(playableCards || []);

        suitOrder.forEach(function (suit) {
            const row = document.createElement('div');
            row.className = 'fantan-row';

            const suitLabel = document.createElement('div');
            suitLabel.className = 'fantan-suit-label ' + SUIT_COLORS[suit];
            suitLabel.textContent = SUIT_SYMBOLS[suit];
            row.appendChild(suitLabel);

            const suitCards = layout[suit] || [];

            FANTAN_RANK_ORDER.forEach(function (rank, i) {
                const cell = document.createElement('div');
                cell.className = 'fantan-cell';

                const cardValue = suitCards[i] || null;
                const key = suit + ':' + rank;

                if (cardValue) {
                    cell.classList.add('filled');
                    const miniRank = document.createElement('span');
                    miniRank.className = 'mini-rank ' + SUIT_COLORS[suit];
                    miniRank.textContent = RANK_DISPLAY[rank] + SUIT_SYMBOLS[suit];
                    cell.appendChild(miniRank);
                } else if (playableSet.has(key)) {
                    cell.classList.add('playable-slot');
                    cell.textContent = RANK_DISPLAY[rank];
                    cell.addEventListener('click', function () {
                        if (onCellClick) onCellClick(suit, rank);
                    });
                } else {
                    cell.classList.add('empty');
                }

                row.appendChild(cell);
            });

            container.appendChild(row);
        });
    }

    /**
     * Animate a card being placed into the Fantan grid
     * @param {Object} card - {suit, rank}
     * @param {number} suitRow - row index (0-3)
     * @param {number} position - column index (0-12)
     * @param {HTMLElement} container
     * @param {Function} callback
     */
    function animateFantanPlace(card, suitRow, position, container, callback) {
        // Find the target cell
        const rows = container.querySelectorAll('.fantan-row');
        if (rows[suitRow]) {
            const cells = rows[suitRow].querySelectorAll('.fantan-cell');
            if (cells[position]) {
                cells[position].style.transition = 'none';
                cells[position].style.transform = 'scale(0.5)';
                cells[position].style.opacity = '0';

                requestAnimationFrame(function () {
                    cells[position].style.transition = 'all 0.3s ease';
                    cells[position].style.transform = 'scale(1)';
                    cells[position].style.opacity = '1';
                });
            }
        }

        setTimeout(function () {
            if (callback) callback();
        }, 350);
    }

    /**
     * Render a player slot (other player)
     * @param {Object} player - {id, name, score, card_count}
     * @param {boolean} isDealer
     * @param {boolean} isTurn
     * @param {string} position - e.g., 'top-left', 'top-center', 'top-right'
     * @returns {HTMLElement}
     */
    function renderPlayerSlot(player, isDealer, isTurn, position) {
        const slot = document.createElement('div');
        slot.className = 'player-slot';
        slot.id = 'player-slot-' + player.id;
        if (isTurn) slot.classList.add('is-turn');
        if (position) slot.dataset.position = position;

        // Avatar
        const avatar = document.createElement('div');
        avatar.className = 'player-avatar';
        avatar.textContent = (player.name || 'P').charAt(0).toUpperCase();

        if (isDealer) {
            const badge = document.createElement('div');
            badge.className = 'dealer-badge';
            badge.textContent = 'DEALER';
            avatar.appendChild(badge);
        }

        slot.appendChild(avatar);

        // Name
        const nameEl = document.createElement('div');
        nameEl.className = 'player-name';
        nameEl.textContent = player.name || 'Player';
        slot.appendChild(nameEl);

        // Score
        const scoreEl = document.createElement('div');
        scoreEl.className = 'player-score';
        scoreEl.textContent = 'Score: ' + (player.score || 0);
        slot.appendChild(scoreEl);

        // Card backs
        const cardBacks = document.createElement('div');
        cardBacks.className = 'player-card-backs';
        cardBacks.id = 'player-cards-' + player.id;
        renderOpponentHand(player.cards_in_hand || player.card_count || 0, cardBacks);
        slot.appendChild(cardBacks);

        // Video thumbnail
        const videoThumb = document.createElement('div');
        videoThumb.className = 'player-video-thumb';
        videoThumb.id = 'player-video-' + player.id;
        slot.appendChild(videoThumb);

        return slot;
    }

    /**
     * Render round selection overlay cards
     * @param {Array} availableRounds - array of round type strings
     * @param {Function} onSelect - callback(roundType)
     */
    function renderRoundSelector(availableRounds, onSelect) {
        const container = document.getElementById('round-choices');
        if (!container) return;
        container.innerHTML = '';

        const allRounds = ['tricks', 'hearts', 'queens', 'king_of_spades', 'last_trick', 'everything', 'fantan'];
        const availableSet = new Set(availableRounds || allRounds);

        allRounds.forEach(function (roundType) {
            const info = ROUND_INFO[roundType];
            const isAvailable = availableSet.has(roundType);

            const card = document.createElement('div');
            card.className = 'round-choice-card';
            if (!isAvailable) card.classList.add('unavailable');

            const icon = document.createElement('div');
            icon.className = 'round-choice-icon';
            icon.textContent = info.icon;
            icon.style.color = info.color;

            const name = document.createElement('div');
            name.className = 'round-choice-name';
            name.textContent = info.name;

            const desc = document.createElement('div');
            desc.className = 'round-choice-desc';
            desc.textContent = info.desc;

            card.appendChild(icon);
            card.appendChild(name);
            card.appendChild(desc);

            if (isAvailable) {
                card.addEventListener('click', function () {
                    onSelect(roundType);
                });
            }

            container.appendChild(card);
        });
    }

    /**
     * Render full scoreboard
     * @param {Array} players - [{id, name, score}]
     * @param {Array} roundHistory - [{round_type, scores: {playerId: points}}]
     * @returns {HTMLElement}
     */
    function renderScoreboard(players, roundHistory) {
        const table = document.createElement('table');
        table.className = 'scoreboard-table';

        // Header row
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        const roundHeader = document.createElement('th');
        roundHeader.textContent = 'Round';
        headerRow.appendChild(roundHeader);

        players.forEach(function (p) {
            const th = document.createElement('th');
            th.textContent = p.name || 'Player';
            headerRow.appendChild(th);
        });

        thead.appendChild(headerRow);
        table.appendChild(thead);

        // Body
        const tbody = document.createElement('tbody');
        const runningTotals = {};
        players.forEach(function (p, idx) { runningTotals[idx] = 0; });

        if (roundHistory && roundHistory.length > 0) {
            roundHistory.forEach(function (round, idx) {
                const row = document.createElement('tr');

                const roundCell = document.createElement('td');
                const rInfo = ROUND_INFO[round.round_type];
                roundCell.textContent = (round.round_number || idx + 1) + '. ' + (rInfo ? rInfo.name : round.round_type);
                row.appendChild(roundCell);

                // round.scores is an array of {player, player_index, round_score, total_score}
                var scoresByIndex = {};
                if (Array.isArray(round.scores)) {
                    round.scores.forEach(function (s) {
                        scoresByIndex[s.player_index] = s.round_score || 0;
                    });
                }

                players.forEach(function (p, pIdx) {
                    const td = document.createElement('td');
                    const points = scoresByIndex[pIdx] || 0;
                    runningTotals[pIdx] += points;
                    const prefix = points >= 0 ? '+' : '';
                    td.textContent = prefix + points;
                    row.appendChild(td);
                });

                tbody.appendChild(row);
            });
        }

        // Total row
        const totalRow = document.createElement('tr');
        totalRow.className = 'total-row';
        const totalLabel = document.createElement('td');
        totalLabel.textContent = 'Total';
        totalRow.appendChild(totalLabel);

        let lowestScore = Infinity;
        players.forEach(function (p, idx) {
            const total = runningTotals[idx] || 0;
            if (total < lowestScore) lowestScore = total;
        });

        players.forEach(function (p, idx) {
            const td = document.createElement('td');
            const total = runningTotals[idx] || 0;
            td.textContent = total;
            if (total === lowestScore) td.classList.add('leading-score');
            totalRow.appendChild(td);
        });

        tbody.appendChild(totalRow);
        table.appendChild(tbody);

        return table;
    }

    /**
     * Animate dealing cards
     * @param {number} numPlayers
     * @param {number} cardsPerPlayer
     * @param {Function} callback
     */
    function animateDeal(numPlayers, cardsPerPlayer, callback) {
        const centerArea = document.getElementById('center-area');
        if (!centerArea) {
            if (callback) callback();
            return;
        }

        const rect = centerArea.getBoundingClientRect();
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        let totalCards = numPlayers * cardsPerPlayer;
        let dealt = 0;
        const maxAnimate = Math.min(totalCards, 20); // cap animation cards

        function dealNext() {
            if (dealt >= maxAnimate) {
                if (callback) callback();
                return;
            }

            const playerIdx = dealt % numPlayers;
            const angle = (playerIdx / numPlayers) * Math.PI * 2 - Math.PI / 2;
            const targetX = centerX + Math.cos(angle) * 120;
            const targetY = centerY + Math.sin(angle) * 80;

            const cardEl = renderCard({}, { faceDown: true });
            cardEl.className += ' dealing-card';
            cardEl.style.setProperty('--deal-from-x', centerX + 'px');
            cardEl.style.setProperty('--deal-from-y', centerY + 'px');
            cardEl.style.setProperty('--deal-to-x', targetX + 'px');
            cardEl.style.setProperty('--deal-to-y', targetY + 'px');
            cardEl.style.setProperty('--deal-duration', '0.25s');
            cardEl.style.position = 'absolute';

            centerArea.appendChild(cardEl);

            setTimeout(function () {
                cardEl.remove();
            }, 300);

            dealt++;
            setTimeout(dealNext, 60);
        }

        dealNext();
    }

    /**
     * Render game over screen
     * @param {Array} players - sorted by score ascending [{id, name, score}]
     * @param {Object} winner - {id, name, score}
     */
    function renderGameOver(players, winner) {
        const container = document.getElementById('game-over-content');
        if (!container) return;
        container.innerHTML = '';

        // Title
        const title = document.createElement('h1');
        title.className = 'game-over-title';
        title.textContent = 'Game Over!';
        container.appendChild(title);

        const subtitle = document.createElement('p');
        subtitle.className = 'game-over-subtitle';
        var winnerName = winner ? (winner.name || winner) : 'Someone';
        subtitle.textContent = winnerName + ' wins with the lowest score!';
        container.appendChild(subtitle);

        // Podium
        const sorted = players.slice().sort(function (a, b) { return (a.score || 0) - (b.score || 0); });
        const podium = document.createElement('div');
        podium.className = 'podium';

        // 2nd place (left)
        if (sorted.length >= 2) {
            podium.appendChild(createPodiumPlace(sorted[1], 2, 'second'));
        }

        // 1st place (center)
        if (sorted.length >= 1) {
            podium.appendChild(createPodiumPlace(sorted[0], 1, 'first'));
        }

        // 3rd place (right)
        if (sorted.length >= 3) {
            podium.appendChild(createPodiumPlace(sorted[2], 3, 'third'));
        }

        container.appendChild(podium);

        // All scores
        if (sorted.length > 3) {
            const allScores = document.createElement('div');
            allScores.className = 'game-over-all-scores';

            const allTitle = document.createElement('h4');
            allTitle.textContent = 'All Scores';
            allScores.appendChild(allTitle);

            sorted.forEach(function (p) {
                const line = document.createElement('div');
                line.className = 'game-over-score-line';
                line.innerHTML = '<span class="go-name">' + escapeHtml(p.name || 'Player') + '</span><span class="go-score">' + (p.score || 0) + '</span>';
                allScores.appendChild(line);
            });

            container.appendChild(allScores);
        }

        // Play Again button
        const actions = document.createElement('div');
        actions.className = 'game-over-actions';
        const playAgainBtn = document.createElement('button');
        playAgainBtn.className = 'btn btn-primary';
        playAgainBtn.textContent = 'Back to Lobby';
        playAgainBtn.addEventListener('click', function () {
            document.getElementById('game-over-overlay').classList.add('hidden');
            if (typeof window.returnToLobby === 'function') {
                window.returnToLobby();
            }
        });
        actions.appendChild(playAgainBtn);
        container.appendChild(actions);

        // Trigger confetti
        triggerConfetti();
    }

    function createPodiumPlace(player, position, cssClass) {
        const place = document.createElement('div');
        place.className = 'podium-place';

        const nameEl = document.createElement('div');
        nameEl.className = 'podium-player-name';
        nameEl.textContent = player.name || 'Player';

        const scoreEl = document.createElement('div');
        scoreEl.className = 'podium-player-score';
        scoreEl.textContent = player.score || 0;

        const block = document.createElement('div');
        block.className = 'podium-block ' + cssClass;

        const posEl = document.createElement('div');
        posEl.className = 'podium-position';
        posEl.textContent = position;
        block.appendChild(posEl);

        place.appendChild(nameEl);
        place.appendChild(scoreEl);
        place.appendChild(block);

        return place;
    }

    /**
     * Trigger confetti animation
     */
    function triggerConfetti() {
        const container = document.getElementById('confetti-container');
        if (!container) return;
        container.innerHTML = '';
        container.classList.remove('hidden');

        const colors = ['#ffd54f', '#4caf50', '#ef5350', '#42a5f5', '#ab47bc', '#ff7043', '#66bb6a', '#ec407a'];

        for (let i = 0; i < 80; i++) {
            const piece = document.createElement('div');
            piece.className = 'confetti-piece';
            piece.style.left = Math.random() * 100 + '%';
            piece.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
            piece.style.animationDuration = (2 + Math.random() * 3) + 's';
            piece.style.animationDelay = Math.random() * 2 + 's';
            piece.style.width = (6 + Math.random() * 8) + 'px';
            piece.style.height = (6 + Math.random() * 8) + 'px';
            piece.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
            container.appendChild(piece);
        }

        setTimeout(function () {
            container.classList.add('hidden');
            container.innerHTML = '';
        }, 6000);
    }

    /**
     * Render sidebar mini scoreboard
     * @param {Array} players - [{id, name, score}]
     * @param {HTMLElement} container
     */
    function renderSidebarScoreboard(players, container) {
        container.innerHTML = '';

        if (!players || players.length === 0) return;

        const sorted = players.slice().sort(function (a, b) { return (a.score || 0) - (b.score || 0); });
        const lowestScore = sorted[0].score || 0;

        sorted.forEach(function (p) {
            const row = document.createElement('div');
            row.className = 'sidebar-score-row';
            if ((p.score || 0) === lowestScore) row.classList.add('leading');

            row.innerHTML = '<span class="score-name">' + escapeHtml(p.name || 'Player') + '</span><span class="score-value">' + (p.score || 0) + '</span>';
            container.appendChild(row);
        });
    }

    /**
     * Render round result overlay
     * @param {string} roundType
     * @param {Object} roundScores - {playerId: points}
     * @param {Array} players - [{id, name, score}] with updated total scores
     * @param {Function} onContinue
     */
    function renderRoundResult(roundType, roundScores, players, onContinue) {
        const container = document.getElementById('round-result-content');
        if (!container) return;
        container.innerHTML = '';

        const rInfo = ROUND_INFO[roundType];

        const title = document.createElement('h2');
        title.className = 'round-result-title';
        title.textContent = (rInfo ? rInfo.name : roundType) + ' Round Complete';
        container.appendChild(title);

        const table = document.createElement('table');
        table.className = 'round-result-table';

        const thead = document.createElement('thead');
        thead.innerHTML = '<tr><th>Player</th><th style="text-align:right">Round</th><th style="text-align:right">Total</th></tr>';
        table.appendChild(thead);

        const tbody = document.createElement('tbody');
        // roundScores is an array of {player, player_index, round_score, total_score}
        if (Array.isArray(roundScores)) {
            roundScores.forEach(function (s) {
                const tr = document.createElement('tr');
                const pts = s.round_score || 0;
                const prefix = pts >= 0 ? '+' : '';
                tr.innerHTML = '<td>' + escapeHtml(s.player || 'Player') + '</td>' +
                    '<td class="score-cell">' + prefix + pts + '</td>' +
                    '<td class="total-cell">' + (s.total_score || 0) + '</td>';
                tbody.appendChild(tr);
            });
        }
        table.appendChild(tbody);
        container.appendChild(table);

        const btn = document.createElement('button');
        btn.className = 'btn btn-primary';
        btn.textContent = 'Continue';
        btn.style.marginTop = '16px';
        btn.addEventListener('click', function () {
            document.getElementById('round-result-overlay').classList.add('hidden');
            if (onContinue) onContinue();
        });
        container.appendChild(btn);
    }

    /**
     * Escape HTML entities
     */
    function escapeHtml(text) {
        var div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Public API
    return {
        renderCard: renderCard,
        renderPlayerHand: renderPlayerHand,
        renderOpponentHand: renderOpponentHand,
        renderTrick: renderTrick,
        animateCardPlay: animateCardPlay,
        animateTrickWin: animateTrickWin,
        renderFantanLayout: renderFantanLayout,
        animateFantanPlace: animateFantanPlace,
        renderPlayerSlot: renderPlayerSlot,
        renderRoundSelector: renderRoundSelector,
        renderScoreboard: renderScoreboard,
        renderSidebarScoreboard: renderSidebarScoreboard,
        renderRoundResult: renderRoundResult,
        animateDeal: animateDeal,
        renderGameOver: renderGameOver,
        triggerConfetti: triggerConfetti,
        SUIT_SYMBOLS: SUIT_SYMBOLS,
        SUIT_COLORS: SUIT_COLORS,
        RANK_ORDER: RANK_ORDER,
        FANTAN_RANK_ORDER: FANTAN_RANK_ORDER,
        ROUND_INFO: ROUND_INFO
    };
})();
