/* ============================================
   MAIN.JS — Application Logic
   Lettuce Family Card Game Night
   ============================================ */

(function () {
    'use strict';

    // ---- State ----
    var ws = null;
    var playerId = null;
    var playerName = null;
    var currentGameId = null;
    var gameState = null;
    var myHand = [];
    var playableCards = [];
    var isMyTurn = false;
    var currentRoundType = null;
    var players = [];
    var dealerIndex = -1;
    var currentPlayerIndex = -1;
    var roundHistory = [];
    var trickCards = [];
    var fantanLayout = null;
    var reconnectTimer = null;

    // ---- DOM refs ----
    var els = {};

    function cacheDom() {
        els.loginScreen = document.getElementById('login-screen');
        els.lobbyScreen = document.getElementById('lobby-screen');
        els.gameScreen = document.getElementById('game-screen');
        els.playerNameInput = document.getElementById('player-name-input');
        els.loginBtn = document.getElementById('login-btn');
        els.lobbyPlayerName = document.getElementById('lobby-player-name');
        els.createGameBtn = document.getElementById('create-game-btn');
        els.createGameModal = document.getElementById('create-game-modal');
        els.closeCreateModal = document.getElementById('close-create-modal');
        els.gameNameInput = document.getElementById('game-name-input');
        els.submitCreateGame = document.getElementById('submit-create-game');
        els.gameList = document.getElementById('game-list');
        els.noGamesMsg = document.getElementById('no-games-msg');
        els.gameTitle = document.getElementById('game-title');
        els.roundBadge = document.getElementById('round-badge');
        els.scoresBtn = document.getElementById('scores-btn');
        els.leaveGameBtn = document.getElementById('leave-game-btn');
        els.otherPlayersArea = document.getElementById('other-players-area');
        els.centerArea = document.getElementById('center-area');
        els.waitingMessage = document.getElementById('waiting-message');
        els.trickArea = document.getElementById('trick-area');
        els.fantanArea = document.getElementById('fantan-area');
        els.roundBanner = document.getElementById('round-banner');
        els.ledSuitIndicator = document.getElementById('led-suit-indicator');
        els.yourHand = document.getElementById('your-hand');
        els.yourNameDisplay = document.getElementById('your-name-display');
        els.yourScoreDisplay = document.getElementById('your-score-display');
        els.passBtn = document.getElementById('pass-btn');
        els.sidebarScoreboard = document.getElementById('sidebar-scoreboard');
        els.chatMessages = document.getElementById('chat-messages');
        els.chatInput = document.getElementById('chat-input');
        els.chatSendBtn = document.getElementById('chat-send-btn');
        els.roundSelectionOverlay = document.getElementById('round-selection-overlay');
        els.dealerChoosingOverlay = document.getElementById('dealer-choosing-overlay');
        els.dealerChoosingText = document.getElementById('dealer-choosing-text');
        els.startGameBtn = document.getElementById('start-game-btn');
        els.waitingCount = document.getElementById('waiting-count');
        els.scoreboardModal = document.getElementById('scoreboard-modal');
        els.closeScoreboardModal = document.getElementById('close-scoreboard-modal');
        els.scoreboardModalBody = document.getElementById('scoreboard-modal-body');
        els.gameOverOverlay = document.getElementById('game-over-overlay');
        els.roundResultOverlay = document.getElementById('round-result-overlay');
        els.toggleMuteBtn = document.getElementById('toggle-mute-btn');
        els.toggleCameraBtn = document.getElementById('toggle-camera-btn');
        els.turnIndicator = document.getElementById('turn-indicator');
        els.discardArea = document.getElementById('discard-area');
    }

    // ---- Screen Management ----
    function showScreen(id) {
        document.querySelectorAll('.screen').forEach(function (s) {
            s.classList.remove('active');
        });
        var screen = document.getElementById(id);
        if (screen) screen.classList.add('active');
    }

    function showToast(msg, type) {
        type = type || 'info';
        var container = document.getElementById('toast-container');
        if (!container) return;

        var toast = document.createElement('div');
        toast.className = 'toast toast-' + type;
        toast.textContent = msg;
        container.appendChild(toast);

        setTimeout(function () {
            toast.classList.add('removing');
            setTimeout(function () {
                toast.remove();
            }, 300);
        }, 3500);
    }

    function showModal(id) {
        var el = document.getElementById(id);
        if (el) el.classList.remove('hidden');
    }

    function hideModal(id) {
        var el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    }

    // ---- WebSocket ----
    function connectWebSocket() {
        var protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        var wsUrl = protocol + '//' + window.location.host + '/ws';

        ws = new WebSocket(wsUrl);

        ws.onopen = function () {
            console.log('WebSocket connected');
            if (reconnectTimer) {
                clearTimeout(reconnectTimer);
                reconnectTimer = null;
            }
        };

        ws.onmessage = function (event) {
            try {
                var data = JSON.parse(event.data);
                handleMessage(data);
            } catch (e) {
                console.error('Failed to parse message:', e);
            }
        };

        ws.onclose = function () {
            console.log('WebSocket closed');
            reconnectTimer = setTimeout(function () {
                console.log('Attempting reconnect...');
                connectWebSocket();
            }, 3000);
        };

        ws.onerror = function (err) {
            console.error('WebSocket error:', err);
        };
    }

    function sendMessage(data) {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(data));
        } else {
            showToast('Connection lost. Reconnecting...', 'error');
        }
    }

    // ---- Message Handler ----
    function handleMessage(data) {
        var action = data.action;
        console.log('Received:', action, data);

        switch (action) {
            case 'logged_in':
                handleLoggedIn(data);
                break;
            case 'game_list':
                handleGameList(data);
                break;
            case 'game_created':
                handleGameCreated(data);
                break;
            case 'game_joined':
                handleGameJoined(data);
                break;
            case 'player_joined':
                handlePlayerJoined(data);
                break;
            case 'player_left':
                handlePlayerLeft(data);
                break;
            case 'left_game':
                handleLeftGame(data);
                break;
            case 'game_started':
                handleGameStarted(data);
                break;
            case 'dealer_draw':
                handleDealerDraw(data);
                break;
            case 'dealer_selected':
                handleDealerSelected(data);
                break;
            case 'hand_dealt':
                handleHandDealt(data);
                break;
            case 'your_hand':
                handleYourHand(data);
                break;
            case 'round_selected':
                handleRoundSelected(data);
                break;
            case 'trick_play_started':
                handleTrickPlayStarted(data);
                break;
            case 'turn_update':
                handleTurnUpdate(data);
                break;
            case 'your_turn':
                handleYourTurn(data);
                break;
            case 'card_played':
                handleCardPlayed(data);
                break;
            case 'hearts_broken':
                handleHeartsBroken(data);
                break;
            case 'trick_won':
                handleTrickWon(data);
                break;
            case 'fantan_started':
                handleFantanStarted(data);
                break;
            case 'fantan_card_played':
                handleFantanCardPlayed(data);
                break;
            case 'player_passed':
                handlePlayerPassed(data);
                break;
            case 'player_finished':
                handlePlayerFinished(data);
                break;
            case 'fantan_deadlock':
                handleFantanDeadlock(data);
                break;
            case 'round_result':
                handleRoundResult(data);
                break;
            case 'next_round':
                handleNextRound(data);
                break;
            case 'game_over':
                handleGameOver(data);
                break;
            case 'chat':
                handleChatMessage(data);
                break;
            case 'signal':
                handleSignal(data);
                break;
            case 'error':
                showToast(data.message || 'An error occurred', 'error');
                break;
            default:
                console.log('Unknown message action:', action, data);
        }
    }

    // ---- Helpers ----

    function getMyIndex() {
        for (var i = 0; i < players.length; i++) {
            if (players[i].id === playerId) return i;
        }
        return -1;
    }

    function capitalize(str) {
        if (!str) return '';
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    function escapeHtml(text) {
        var div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ---- Handlers ----

    function handleLoggedIn(data) {
        playerId = data.player_id || data.id;
        playerName = data.name || playerName;

        els.lobbyPlayerName.textContent = playerName;
        els.yourNameDisplay.textContent = playerName;

        showScreen('lobby-screen');

        window.videoManager.init(playerId).catch(function (err) {
            console.warn('Video init failed:', err);
        });

        sendMessage({ action: 'get_game_list' });
        showToast('Welcome, ' + playerName + '!', 'success');
    }

    function handleGameList(data) {
        renderGameList(data.games || []);
    }

    function updateStartButton() {
        if (!els.startGameBtn) return;
        var isHost = false;
        if (players && players.length > 0) {
            isHost = (players[0].id === playerId);
        }
        var playerCount = players ? players.length : 0;
        var inLobby = (gameState === 'waiting' || gameState === 'lobby');

        if (isHost && playerCount >= 3 && inLobby) {
            els.startGameBtn.style.display = 'inline-block';
            els.startGameBtn.textContent = 'Start Game (' + playerCount + ' players)';
        } else {
            els.startGameBtn.style.display = 'none';
        }

        if (els.waitingCount) {
            if (inLobby && playerCount < 3) {
                els.waitingCount.textContent = playerCount + '/3 minimum players';
            } else if (inLobby) {
                els.waitingCount.textContent = playerCount + ' players ready';
            } else {
                els.waitingCount.textContent = '';
            }
        }
    }

    function handleGameCreated(data) {
        currentGameId = data.game_id;
        gameState = 'waiting';
        var gs = data.game_state || {};
        players = gs.players || [];
        dealerIndex = -1;
        currentPlayerIndex = -1;
        roundHistory = [];

        els.gameTitle.textContent = gs.name || 'Game';
        els.roundBadge.classList.remove('visible');

        hideModal('create-game-modal');
        showScreen('game-screen');

        els.waitingMessage.classList.remove('hidden');
        els.trickArea.classList.add('hidden');
        els.fantanArea.classList.add('hidden');
        els.roundBanner.classList.add('hidden');
        els.ledSuitIndicator.classList.add('hidden');
        hideTurnIndicator();

        renderOtherPlayers();
        updateSidebarScoreboard();
        updateStartButton();
        clearChat();
    }

    function handleGameJoined(data) {
        currentGameId = data.game_id;
        var gs = data.game_state || {};
        gameState = gs.phase || 'waiting';
        players = gs.players || [];
        dealerIndex = gs.dealer_index || -1;
        currentPlayerIndex = gs.current_player_index || -1;
        roundHistory = gs.round_history || [];

        els.gameTitle.textContent = gs.name || 'Game';
        els.roundBadge.classList.remove('visible');

        showScreen('game-screen');

        els.waitingMessage.classList.remove('hidden');
        els.trickArea.classList.add('hidden');
        els.fantanArea.classList.add('hidden');
        els.roundBanner.classList.add('hidden');
        els.ledSuitIndicator.classList.add('hidden');
        hideTurnIndicator();

        renderOtherPlayers();
        updateSidebarScoreboard();
        updateStartButton();

        showToast('Joined game!', 'success');
    }

    function handlePlayerJoined(data) {
        if (data.game_state && data.game_state.players) {
            players = data.game_state.players;
        }

        renderOtherPlayers();
        updateSidebarScoreboard();
        updateStartButton();

        var joinedName = data.player || 'A player';
        if (joinedName !== playerName) {
            appendSystemChat(joinedName + ' joined the game');
        }
    }

    function handlePlayerLeft(data) {
        if (data.game_state && data.game_state.players) {
            players = data.game_state.players;
        }

        renderOtherPlayers();
        updateSidebarScoreboard();
        updateStartButton();

        var leftName = data.player || 'A player';
        appendSystemChat(leftName + ' left the game');
    }

    function handleLeftGame(data) {
        // We left the game, go back to lobby
        resetGameState();
        showScreen('lobby-screen');
        renderGameList(data.games || []);
    }

    function handleGameStarted(data) {
        gameState = 'started';
        els.waitingMessage.classList.add('hidden');
        appendSystemChat('Game started! Drawing for dealer...');
    }

    function handleDealerDraw(data) {
        if (data.draws) {
            var drawParts = [];
            data.draws.forEach(function (d) {
                var sym = window.gameRenderer.SUIT_SYMBOLS[d.card.suit] || '';
                drawParts.push(d.player + ': ' + d.card.rank + sym);
            });
            appendSystemChat('Draw: ' + drawParts.join(', '));
        }
    }

    function handleDealerSelected(data) {
        dealerIndex = data.dealer_index;
        renderOtherPlayers();
        appendSystemChat(data.dealer + ' is the first dealer!');
    }

    function handleHandDealt(data) {
        dealerIndex = data.dealer_index;
        currentRoundType = data.round_type;
        gameState = 'playing';

        els.waitingMessage.classList.add('hidden');
        renderOtherPlayers();
        renderDiscardPile(data.discard || []);

        appendSystemChat('Round ' + data.round_number + ' — Cards dealt! Dealer: ' + data.dealer);
    }

    function renderDiscardPile(discardCards) {
        if (!els.discardArea) return;
        els.discardArea.innerHTML = '';

        if (!discardCards || discardCards.length === 0) {
            els.discardArea.classList.add('hidden');
            return;
        }

        var label = document.createElement('span');
        label.className = 'discard-label';
        label.textContent = 'Discarded:';
        els.discardArea.appendChild(label);

        discardCards.forEach(function (card) {
            var cardEl = window.gameRenderer.renderCard(card);
            els.discardArea.appendChild(cardEl);
        });

        els.discardArea.classList.remove('hidden');
    }

    function handleYourHand(data) {
        myHand = data.hand || [];
        renderHand();
        els.waitingMessage.classList.add('hidden');
    }

    function handleRoundSelected(data) {
        currentRoundType = data.round_type;
        els.roundSelectionOverlay.classList.add('hidden');
        els.dealerChoosingOverlay.classList.add('hidden');
        showRoundBanner(currentRoundType);

        var rInfo = window.gameRenderer.ROUND_INFO[currentRoundType];
        appendSystemChat('Round type: ' + (rInfo ? rInfo.name : currentRoundType));
    }

    function handleTrickPlayStarted(data) {
        currentRoundType = data.round_type;
        currentPlayerIndex = data.first_leader_index;

        trickCards = [];
        els.trickArea.classList.remove('hidden');
        els.trickArea.innerHTML = '';
        els.fantanArea.classList.add('hidden');
        els.waitingMessage.classList.add('hidden');
        els.ledSuitIndicator.classList.add('hidden');

        renderOtherPlayers();
        updateTurnIndicator();

        appendSystemChat(data.first_leader + ' leads first');
    }

    function handleTurnUpdate(data) {
        currentPlayerIndex = data.current_player_index;
        renderOtherPlayers();
        updateTurnIndicator();
    }

    function handleYourTurn(data) {
        isMyTurn = true;
        playableCards = data.playable_cards || [];
        currentPlayerIndex = getMyIndex();

        if (data.hand) myHand = data.hand;

        renderHand();
        renderOtherPlayers();
        updateTurnIndicator();

        // Show pass button for fantan if player can pass
        if (data.is_fantan && data.can_pass) {
            els.passBtn.classList.remove('hidden');
        } else {
            els.passBtn.classList.add('hidden');
        }

        showToast('Your turn!', 'info');
    }

    function handleCardPlayed(data) {
        var card = data.card || {};
        var cardPlayerIndex = data.player_index;
        var cardPlayerId = data.player_id;
        var cardPlayerName = data.player;

        // If I played it, remove from hand
        if (cardPlayerId === playerId) {
            myHand = myHand.filter(function (c) {
                return !(c.suit === card.suit && c.rank === card.rank);
            });
            isMyTurn = false;
            playableCards = [];
            els.passBtn.classList.add('hidden');
            renderHand();
        }

        // Add to trick display
        trickCards.push({
            player_id: cardPlayerId,
            player_name: cardPlayerName,
            suit: card.suit,
            rank: card.rank
        });
        window.gameRenderer.renderTrick(trickCards, players, els.trickArea);

        renderOtherPlayers();
        updateSidebarScoreboard();
    }

    function handleHeartsBroken(data) {
        showToast('Hearts have been broken!', 'info');
        appendSystemChat('Hearts have been broken!');
    }

    function handleTrickWon(data) {
        var winnerName = data.winner || '';
        var trickPoints = data.trick_points || 0;

        // Only show chat message when points are scored
        if (trickPoints > 0) {
            appendSystemChat(winnerName + ': +' + trickPoints + ' points');
        }

        // Animate trick win then clear
        window.gameRenderer.animateTrickWin(data.winner_index, els.trickArea, function () {
            trickCards = [];
            els.ledSuitIndicator.classList.add('hidden');
        });
    }

    function handleFantanStarted(data) {
        currentPlayerIndex = data.first_player_index;
        fantanLayout = data.layout || {};

        els.trickArea.classList.add('hidden');
        els.fantanArea.classList.remove('hidden');
        els.waitingMessage.classList.add('hidden');

        renderFantanDisplay();
        renderOtherPlayers();
        updateTurnIndicator();

        appendSystemChat('Fantan started! ' + data.first_player + ' goes first');
    }

    function handleFantanCardPlayed(data) {
        var card = data.card || {};
        var cardPlayerId = data.player_id;

        // If I played it, remove from hand
        if (cardPlayerId === playerId) {
            myHand = myHand.filter(function (c) {
                return !(c.suit === card.suit && c.rank === card.rank);
            });
            isMyTurn = false;
            playableCards = [];
            els.passBtn.classList.add('hidden');
            renderHand();
        }

        fantanLayout = data.layout;
        renderFantanDisplay();
        renderOtherPlayers();
        updateSidebarScoreboard();

        appendSystemChat(data.player + ' played ' + card.rank + (window.gameRenderer.SUIT_SYMBOLS[card.suit] || ''));
    }

    function handlePlayerPassed(data) {
        appendSystemChat(data.player + ' passed');
    }

    function handlePlayerFinished(data) {
        var position = data.position || '?';
        appendSystemChat(data.player + ' finished in position #' + position + '!');
    }

    function handleFantanDeadlock(data) {
        appendSystemChat('Deadlock! ' + (data.message || 'No more plays possible'));
    }

    function handleRoundResult(data) {
        var scores = data.scores || [];
        roundHistory = data.round_history || roundHistory;

        // Update player scores
        scores.forEach(function (s) {
            if (s.player_index >= 0 && s.player_index < players.length) {
                players[s.player_index].score = s.total_score;
            }
        });

        updateSidebarScoreboard();

        // Show result overlay
        els.roundResultOverlay.classList.remove('hidden');
        window.gameRenderer.renderRoundResult(data.round_type, scores, players, function () {
            // Continue
        });
    }

    function handleNextRound(data) {
        // Clear table for next round
        trickCards = [];
        fantanLayout = null;
        playableCards = [];
        isMyTurn = false;
        currentRoundType = null;
        myHand = [];
        currentPlayerIndex = -1;

        dealerIndex = data.dealer_index;

        els.trickArea.classList.add('hidden');
        els.trickArea.innerHTML = '';
        els.fantanArea.classList.add('hidden');
        els.fantanArea.innerHTML = '';
        els.roundBanner.classList.add('hidden');
        els.ledSuitIndicator.classList.add('hidden');
        els.passBtn.classList.add('hidden');
        els.yourHand.innerHTML = '';
        hideTurnIndicator();
        if (els.discardArea) els.discardArea.classList.add('hidden');

        renderOtherPlayers();
        updateSidebarScoreboard();

        appendSystemChat('Next round coming up... Dealer: ' + data.dealer);
    }

    function handleGameOver(data) {
        var finalScores = data.final_scores || [];

        // Update players with final scores
        finalScores.forEach(function (s) {
            if (s.player_index >= 0 && s.player_index < players.length) {
                players[s.player_index].score = s.score;
            }
        });

        var winner = { name: data.winner, score: data.winner_score };

        els.gameOverOverlay.classList.remove('hidden');
        window.gameRenderer.renderGameOver(players, winner);
    }

    function handleChatMessage(data) {
        appendChat(data.player || 'Player', data.message || '');
    }

    function handleSignal(data) {
        // PeerJS handles signaling internally
    }

    // ---- Turn Indicator ----

    function updateTurnIndicator() {
        if (!els.turnIndicator) return;

        var myIdx = getMyIndex();

        if (currentPlayerIndex === myIdx && myIdx >= 0) {
            els.turnIndicator.textContent = 'YOUR TURN';
            els.turnIndicator.className = 'turn-indicator your-turn';
        } else if (currentPlayerIndex >= 0 && currentPlayerIndex < players.length) {
            els.turnIndicator.textContent = 'Waiting for ' + players[currentPlayerIndex].name + '...';
            els.turnIndicator.className = 'turn-indicator';
        } else {
            els.turnIndicator.classList.add('hidden');
            return;
        }
        els.turnIndicator.classList.remove('hidden');
    }

    function hideTurnIndicator() {
        if (els.turnIndicator) {
            els.turnIndicator.classList.add('hidden');
        }
    }

    // ---- Lobby Functions ----

    function renderGameList(games) {
        els.gameList.innerHTML = '';

        if (!games || games.length === 0) {
            els.noGamesMsg.classList.remove('hidden');
            els.gameList.appendChild(els.noGamesMsg);
            return;
        }

        els.noGamesMsg.classList.add('hidden');

        games.forEach(function (game) {
            var card = document.createElement('div');
            card.className = 'game-card';

            var title = document.createElement('div');
            title.className = 'game-card-title';
            title.textContent = game.name || 'Game';

            var info = document.createElement('div');
            info.className = 'game-card-info';

            var playerTag = document.createElement('span');
            playerTag.className = 'game-card-tag tag-players';
            playerTag.textContent = (game.player_count || 0) + '/' + (game.max_players || 8) + ' players';

            var hostTag = document.createElement('span');
            hostTag.className = 'game-card-tag tag-host';
            hostTag.textContent = 'Host: ' + (game.host || 'Unknown');

            var statusTag = document.createElement('span');
            statusTag.className = 'game-card-tag tag-status';
            statusTag.textContent = game.phase || 'waiting';

            info.appendChild(playerTag);
            info.appendChild(hostTag);
            info.appendChild(statusTag);

            var joinBtn = document.createElement('button');
            joinBtn.className = 'btn btn-primary';
            joinBtn.textContent = 'Join';
            joinBtn.addEventListener('click', function () {
                joinGame(game.game_id);
            });

            var gamePhase = game.phase || '';
            if (gamePhase !== 'lobby' && gamePhase !== 'waiting') {
                joinBtn.disabled = true;
                joinBtn.style.opacity = '0.5';
                joinBtn.style.cursor = 'not-allowed';
                joinBtn.textContent = 'In Progress';
            }

            card.appendChild(title);
            card.appendChild(info);
            card.appendChild(joinBtn);

            els.gameList.appendChild(card);
        });
    }

    function createGame() {
        var gameName = els.gameNameInput.value.trim();
        if (!gameName) {
            showToast('Please enter a game name', 'warning');
            return;
        }

        sendMessage({
            action: 'create_game',
            name: gameName
        });
    }

    function joinGame(gameId) {
        sendMessage({
            action: 'join_game',
            game_id: gameId
        });
        currentGameId = gameId;
        gameState = 'joining';
    }

    // ---- Game Functions ----

    function playCard(suit, rank) {
        if (!isMyTurn) {
            showToast('Not your turn!', 'warning');
            return;
        }

        var key = suit + ':' + rank;
        var isPlayable = playableCards.some(function (pc) {
            if (typeof pc === 'string') return pc === key;
            return pc.suit === suit && pc.rank === rank;
        });

        if (!isPlayable) {
            showToast('You cannot play that card', 'warning');
            return;
        }

        isMyTurn = false;
        playableCards = [];
        els.passBtn.classList.add('hidden');

        sendMessage({
            action: 'play_card',
            game_id: currentGameId,
            suit: suit,
            rank: rank
        });
    }

    function passTurn() {
        if (!isMyTurn) return;

        isMyTurn = false;
        playableCards = [];
        els.passBtn.classList.add('hidden');

        sendMessage({
            action: 'pass_turn',
            game_id: currentGameId
        });

        renderHand();
    }

    function sendChat(msg) {
        if (!msg.trim()) return;

        sendMessage({
            action: 'chat',
            game_id: currentGameId,
            message: msg.trim()
        });

        els.chatInput.value = '';
    }

    function leaveGame() {
        sendMessage({
            action: 'leave_game',
            game_id: currentGameId
        });

        window.videoManager.disconnectAll();
        resetGameState();
        showScreen('lobby-screen');
        sendMessage({ action: 'get_game_list' });

        window.videoManager.init(playerId).catch(function () {});
    }

    window.returnToLobby = function () {
        leaveGame();
    };

    function resetGameState() {
        currentGameId = null;
        gameState = null;
        myHand = [];
        playableCards = [];
        isMyTurn = false;
        currentRoundType = null;
        players = [];
        dealerIndex = -1;
        currentPlayerIndex = -1;
        roundHistory = [];
        trickCards = [];
        fantanLayout = null;
    }

    // ---- UI Rendering ----

    function renderHand() {
        var playableKeys = normalizePlayableCards(playableCards);

        window.gameRenderer.renderPlayerHand(myHand, playableKeys, els.yourHand, function (suit, rank) {
            playCard(suit, rank);
        });

        // Update your score
        var me = players.find(function (p) { return p.id === playerId; });
        if (me) {
            els.yourScoreDisplay.textContent = 'Score: ' + (me.score || 0);
        }
    }

    function normalizePlayableCards(cards) {
        if (!cards) return [];
        return cards.map(function (c) {
            if (typeof c === 'string') return c;
            if (c.suit && c.rank) return c.suit + ':' + c.rank;
            return '';
        });
    }

    function renderOtherPlayers() {
        els.otherPlayersArea.innerHTML = '';

        var positions = ['top-left', 'top-center', 'top-right', 'left', 'right', 'bottom-left', 'bottom-right'];
        var posIdx = 0;

        players.forEach(function (p, idx) {
            if (p.id === playerId) return; // skip me

            var isDealer = (idx === dealerIndex);
            var isTurn = (idx === currentPlayerIndex);
            var pos = positions[posIdx % positions.length];
            posIdx++;

            var slot = window.gameRenderer.renderPlayerSlot(p, isDealer, isTurn, pos);
            els.otherPlayersArea.appendChild(slot);

            // Attach existing remote video stream if available
            if (window.videoManager.remoteStreams && window.videoManager.remoteStreams[p.id]) {
                window.videoManager.addPlayerThumbnail(p.id, window.videoManager.remoteStreams[p.id]);
            }
        });

        // Update my score display
        var me = players.find(function (p) { return p.id === playerId; });
        if (me) {
            els.yourScoreDisplay.textContent = 'Score: ' + (me.score || 0);
        }

        // Highlight my area if it's my turn
        var myArea = document.querySelector('.your-area');
        if (myArea) {
            var myIdx = getMyIndex();
            if (myIdx >= 0 && myIdx === currentPlayerIndex) {
                myArea.classList.add('is-my-turn');
            } else {
                myArea.classList.remove('is-my-turn');
            }
        }
    }

    function renderFantanDisplay() {
        if (!fantanLayout) return;

        var playableKeys = normalizePlayableCards(playableCards);

        window.gameRenderer.renderFantanLayout(fantanLayout, els.fantanArea, isMyTurn ? playableKeys : [], function (suit, rank) {
            playCard(suit, rank);
        });
    }

    function updateSidebarScoreboard() {
        window.gameRenderer.renderSidebarScoreboard(players, els.sidebarScoreboard);
    }

    function showFullScoreboard() {
        els.scoreboardModalBody.innerHTML = '';
        var table = window.gameRenderer.renderScoreboard(players, roundHistory);
        els.scoreboardModalBody.appendChild(table);
        showModal('scoreboard-modal');
    }

    function showRoundBanner(roundType) {
        var rInfo = window.gameRenderer.ROUND_INFO[roundType];
        if (!rInfo) return;

        els.roundBanner.textContent = rInfo.icon + ' ' + rInfo.name + ' — ' + rInfo.desc;
        els.roundBanner.className = 'round-banner ' + roundType;
        els.roundBanner.classList.remove('hidden');

        els.roundBadge.textContent = rInfo.name;
        els.roundBadge.classList.add('visible');
    }

    // ---- Chat ----

    function appendChat(author, text) {
        var msgEl = document.createElement('div');
        msgEl.className = 'chat-msg';
        msgEl.innerHTML = '<span class="chat-author">' + escapeHtml(author) + ':</span> <span class="chat-text">' + escapeHtml(text) + '</span>';
        els.chatMessages.appendChild(msgEl);
        els.chatMessages.scrollTop = els.chatMessages.scrollHeight;
    }

    function appendSystemChat(text) {
        var msgEl = document.createElement('div');
        msgEl.className = 'chat-msg system-msg';
        msgEl.textContent = text;
        els.chatMessages.appendChild(msgEl);
        els.chatMessages.scrollTop = els.chatMessages.scrollHeight;
    }

    function clearChat() {
        els.chatMessages.innerHTML = '';
    }

    // ---- Event Wiring ----

    function wireEvents() {
        // Login
        els.loginBtn.addEventListener('click', function () {
            var name = els.playerNameInput.value.trim();
            if (!name) {
                showToast('Please enter your name', 'warning');
                return;
            }
            playerName = name;
            connectWebSocket();
            var waitForOpen = setInterval(function () {
                if (ws && ws.readyState === WebSocket.OPEN) {
                    clearInterval(waitForOpen);
                    sendMessage({
                        action: 'login',
                        name: playerName
                    });
                }
            }, 100);
        });

        els.playerNameInput.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') els.loginBtn.click();
        });

        // Create Game
        els.createGameBtn.addEventListener('click', function () {
            els.gameNameInput.value = '';
            showModal('create-game-modal');
            els.gameNameInput.focus();
        });

        els.closeCreateModal.addEventListener('click', function () {
            hideModal('create-game-modal');
        });

        els.submitCreateGame.addEventListener('click', function () {
            createGame();
        });

        els.gameNameInput.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') createGame();
        });

        els.createGameModal.addEventListener('click', function (e) {
            if (e.target === els.createGameModal) hideModal('create-game-modal');
        });

        // Game controls
        els.scoresBtn.addEventListener('click', function () {
            showFullScoreboard();
        });

        els.closeScoreboardModal.addEventListener('click', function () {
            hideModal('scoreboard-modal');
        });

        els.scoreboardModal.addEventListener('click', function (e) {
            if (e.target === els.scoreboardModal) hideModal('scoreboard-modal');
        });

        els.leaveGameBtn.addEventListener('click', function () {
            if (confirm('Are you sure you want to leave the game?')) {
                leaveGame();
            }
        });

        // Start game button (host only)
        els.startGameBtn.addEventListener('click', function () {
            sendMessage({ action: 'start_game', game_id: currentGameId });
        });

        // Pass button
        els.passBtn.addEventListener('click', function () {
            passTurn();
        });

        // Chat
        els.chatSendBtn.addEventListener('click', function () {
            sendChat(els.chatInput.value);
        });

        els.chatInput.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') sendChat(els.chatInput.value);
        });

        // Video controls
        if (els.toggleMuteBtn) {
            els.toggleMuteBtn.addEventListener('click', function () {
                var muted = window.videoManager.toggleMute();
                els.toggleMuteBtn.textContent = muted ? 'Unmute' : 'Mute';
                els.toggleMuteBtn.classList.toggle('btn-danger', muted);
            });
        }

        if (els.toggleCameraBtn) {
            els.toggleCameraBtn.addEventListener('click', function () {
                var camOff = window.videoManager.toggleCamera();
                els.toggleCameraBtn.textContent = camOff ? 'Cam On' : 'Cam';
                els.toggleCameraBtn.classList.toggle('btn-danger', camOff);
            });
        }
    }

    // ---- Init ----

    document.addEventListener('DOMContentLoaded', function () {
        cacheDom();
        wireEvents();
        showScreen('login-screen');
        els.playerNameInput.focus();
    });

})();
