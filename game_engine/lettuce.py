from __future__ import annotations

import asyncio
import json
import random
import uuid
from enum import Enum
from typing import Any

from game_engine.deck import Card, Deck


class RoundType(str, Enum):
    TRICKS = "tricks"
    HEARTS = "hearts"
    QUEENS = "queens"
    KING_OF_SPADES = "king_of_spades"
    LAST_TRICK = "last_trick"
    EVERYTHING = "everything"
    FANTAN = "fantan"


class GamePhase(str, Enum):
    LOBBY = "lobby"
    DRAW_FOR_DEALER = "draw_for_dealer"
    DEALING = "dealing"
    PLAYING = "playing"
    ROUND_OVER = "round_over"
    GAME_OVER = "game_over"


# Fixed round sequence — no choosing
ROUND_SEQUENCE = [
    RoundType.TRICKS,
    RoundType.HEARTS,
    RoundType.QUEENS,
    RoundType.KING_OF_SPADES,
    RoundType.LAST_TRICK,
    RoundType.EVERYTHING,
    RoundType.FANTAN,
]

FANTAN_SCORES: dict[int, list[int]] = {
    3: [-50, 0, 50],
    4: [-50, 0, 0, 50],
    5: [-100, -50, 0, 50, 100],
    6: [-100, -50, 0, 0, 50, 100],
    7: [-150, -100, -50, 0, 50, 100, 150],
    8: [-150, -100, -50, 0, 0, 50, 100, 150],
}

SUIT_ORDER_FOR_FANTAN_START = ["clubs", "spades", "hearts", "diamonds"]


class LettuceGame:
    def __init__(self, game_id: str | None = None, name: str = "Lettuce Game") -> None:
        self.game_id: str = game_id or str(uuid.uuid4())
        self.name: str = name
        self.phase: GamePhase = GamePhase.LOBBY
        self.players: list[dict[str, Any]] = []
        self.host_id: str = ""
        self.min_players: int = 3
        self.max_players: int = 8
        self.dealer_index: int = 0
        self.current_round_type: RoundType | None = None
        self.discard_pile: list[Card] = []
        self.deck: Deck = Deck()
        self.round_number: int = 0
        self.round_history: list[dict[str, Any]] = []

        # Trick-taking state
        self.current_trick: list[tuple[int, Card]] = []
        self.trick_number: int = 0
        self.total_tricks: int = 0
        self.current_player_index: int = 0
        self.trick_leader_index: int = 0
        self.tricks_won: dict[int, list[list[tuple[int, Card]]]] = {}
        self.hearts_broken: bool = False
        self.led_suit: str | None = None
        self.last_trick_winner_index: int = -1

        # Fantan state
        self.layout: dict[str, dict[str, int]] = {}
        self.sevens_placed: set[str] = set()
        self.finish_order: list[int] = []
        self.cards_per_player: int = 0
        self.fantan_consecutive_passes: int = 0

        # Pause/reconnect state
        self._resume_event: asyncio.Event = asyncio.Event()
        self._resume_event.set()  # not paused initially

    # ------------------------------------------------------------------ #
    #  LOBBY / SETUP                                                      #
    # ------------------------------------------------------------------ #

    def add_player(self, player_id: str, name: str, ws: Any) -> bool:
        if len(self.players) >= self.max_players:
            return False
        if self.phase != GamePhase.LOBBY:
            return False
        if any(p["id"] == player_id for p in self.players):
            return False
        player = {
            "id": player_id,
            "name": name,
            "ws": ws,
            "hand": [],
            "score": 0,
            "disconnected": False,
        }
        self.players.append(player)
        if len(self.players) == 1:
            self.host_id = player_id
        return True

    def remove_player(self, player_id: str) -> bool:
        idx = self.get_player_index(player_id)
        if idx is None:
            return False
        self.players.pop(idx)
        if self.players and self.host_id == player_id:
            self.host_id = self.players[0]["id"]
        return True

    def get_player_index(self, player_id: str) -> int | None:
        for i, p in enumerate(self.players):
            if p["id"] == player_id:
                return i
        return None

    def find_disconnected_player(self, name: str) -> str | None:
        """Find a disconnected player by name and return their ID."""
        for p in self.players:
            if p["name"] == name and p.get("disconnected"):
                return p["id"]
        return None

    def disconnect_player(self, player_id: str) -> bool:
        """Mark a player as disconnected and pause the game."""
        idx = self.get_player_index(player_id)
        if idx is None:
            return False
        self.players[idx]["disconnected"] = True
        self.players[idx]["ws"] = None
        self._resume_event.clear()
        return True

    async def reconnect_player(self, player_id: str, ws: Any) -> bool:
        """Reconnect a player and resume the game."""
        idx = self.get_player_index(player_id)
        if idx is None:
            return False
        self.players[idx]["disconnected"] = False
        self.players[idx]["ws"] = ws

        # Send them their hand
        await self.send_to(idx, {
            "action": "your_hand",
            "hand": [c.to_dict() for c in self.players[idx]["hand"]],
        })

        # Unpause if no one else is disconnected
        if not any(p.get("disconnected") for p in self.players):
            self._resume_event.set()

            # Broadcast resume
            await self.broadcast({
                "action": "game_resumed",
                "player": self.players[idx]["name"],
                "game_state": self.get_game_state(),
            })

            # If it's their turn, re-send your_turn
            if self.phase == GamePhase.PLAYING and idx == self.current_player_index:
                await self._broadcast_turn()
                if self.current_round_type == RoundType.FANTAN:
                    playable = self.get_fantan_playable(idx)
                    await self.send_to(idx, {
                        "action": "your_turn",
                        "playable_cards": [c.to_dict() for c in playable],
                        "can_pass": len(playable) == 0,
                        "is_fantan": True,
                    })
                else:
                    playable = self.get_playable_cards(idx)
                    await self.send_to(idx, {
                        "action": "your_turn",
                        "playable_cards": [c.to_dict() for c in playable],
                        "trick_number": self.trick_number,
                    })

        return True

    async def _wait_for_unpause(self) -> None:
        """Block until no players are disconnected."""
        await self._resume_event.wait()

    # ------------------------------------------------------------------ #
    #  START GAME -> DRAW FOR DEALER                                      #
    # ------------------------------------------------------------------ #

    async def start_game(self) -> None:
        if len(self.players) < self.min_players:
            await self.broadcast({"action": "error", "message": f"Need at least {self.min_players} players"})
            return
        self.phase = GamePhase.DRAW_FOR_DEALER
        await self.broadcast({
            "action": "game_started",
            "message": "Drawing cards to determine first dealer...",
        })
        await self.draw_for_dealer()

    async def draw_for_dealer(self) -> None:
        """Each player draws one card. Highest wins. Ties redraw among tied."""
        self.phase = GamePhase.DRAW_FOR_DEALER
        contenders = list(range(len(self.players)))
        drawn: dict[int, Card] = {}

        while len(contenders) > 1:
            deck = Deck()
            deck.shuffle()
            round_draws: dict[int, Card] = {}
            for i, pi in enumerate(contenders):
                round_draws[pi] = deck.cards[i]
            drawn.update(round_draws)

            draw_info = [
                {"player": self.players[pi]["name"], "card": round_draws[pi].to_dict()}
                for pi in contenders
            ]
            await self.broadcast({
                "action": "dealer_draw",
                "draws": draw_info,
            })

            max_value = max(c.value for c in round_draws.values())
            contenders = [pi for pi, c in round_draws.items() if c.value == max_value]

        self.dealer_index = contenders[0]
        await self.broadcast({
            "action": "dealer_selected",
            "dealer": self.players[self.dealer_index]["name"],
            "dealer_index": self.dealer_index,
        })

        # Proceed to dealing
        await asyncio.sleep(1)
        await self._start_dealing()

    # ------------------------------------------------------------------ #
    #  DEALING                                                            #
    # ------------------------------------------------------------------ #

    async def _start_dealing(self) -> None:
        self.phase = GamePhase.DEALING
        await self.deal_hand()

    @staticmethod
    def _is_protected_card(card: Card, round_type: RoundType) -> bool:
        """Check if a card cannot be discarded for the given round type."""
        if round_type == RoundType.HEARTS:
            return card.is_heart
        if round_type == RoundType.QUEENS:
            return card.is_queen
        if round_type == RoundType.KING_OF_SPADES:
            return card.is_king_of_spades
        if round_type == RoundType.EVERYTHING:
            return card.is_heart or card.is_queen or card.is_king_of_spades
        return False

    async def deal_hand(self) -> None:
        self.round_number += 1
        self.deck = Deck()
        hands, discard = self.deck.deal_with_discard(len(self.players))

        # Determine round type early so we can enforce smart discard
        round_type = ROUND_SEQUENCE[self.round_number - 1]

        # Swap any scoring cards out of the discard pile
        for i in range(len(discard)):
            if self._is_protected_card(discard[i], round_type):
                swapped = False
                hand_indices = list(range(len(hands)))
                random.shuffle(hand_indices)
                for hi in hand_indices:
                    for ci in range(len(hands[hi])):
                        if not self._is_protected_card(hands[hi][ci], round_type):
                            discard[i], hands[hi][ci] = hands[hi][ci], discard[i]
                            swapped = True
                            break
                    if swapped:
                        break

        self.discard_pile = discard
        self.cards_per_player = len(hands[0]) if hands else 0

        for i, player in enumerate(self.players):
            player["hand"] = sorted(hands[i], key=lambda c: (c.suit, c.value))

        # Auto-select round based on fixed sequence
        self.current_round_type = round_type

        discard_info = [c.to_dict() for c in self.discard_pile]
        await self.broadcast({
            "action": "hand_dealt",
            "round_number": self.round_number,
            "round_type": self.current_round_type.value,
            "dealer": self.players[self.dealer_index]["name"],
            "dealer_index": self.dealer_index,
            "discard": discard_info,
            "cards_per_player": self.cards_per_player,
        })

        # Send each player their hand
        for i, player in enumerate(self.players):
            await self.send_to(i, {
                "action": "your_hand",
                "hand": [c.to_dict() for c in player["hand"]],
            })

        # Brief pause for dealing animation
        await asyncio.sleep(1)

        # Announce round type
        await self.broadcast({
            "action": "round_selected",
            "round_type": self.current_round_type.value,
            "round_number": self.round_number,
            "dealer": self.players[self.dealer_index]["name"],
        })

        # Start play
        self.phase = GamePhase.PLAYING
        await asyncio.sleep(1)
        if self.current_round_type == RoundType.FANTAN:
            await self.setup_fantan()
        else:
            await self.setup_trick_taking()

    # ------------------------------------------------------------------ #
    #  TRICK-TAKING SETUP (Rounds 1-6)                                    #
    # ------------------------------------------------------------------ #

    async def setup_trick_taking(self) -> None:
        self.current_trick = []
        self.trick_number = 0
        self.total_tricks = self.cards_per_player
        self.tricks_won = {i: [] for i in range(len(self.players))}
        self.hearts_broken = False
        self.led_suit = None
        self.last_trick_winner_index = -1

        leader = self.find_first_leader()
        self.trick_leader_index = leader
        self.current_player_index = leader
        self.trick_number = 1

        await self.broadcast({
            "action": "trick_play_started",
            "round_type": self.current_round_type.value if self.current_round_type else "",
            "first_leader": self.players[leader]["name"],
            "first_leader_index": leader,
            "total_tricks": self.total_tricks,
            "current_player_index": leader,
        })

        await self._broadcast_turn()

        playable = self.get_playable_cards(self.current_player_index)
        await self.send_to(self.current_player_index, {
            "action": "your_turn",
            "playable_cards": [c.to_dict() for c in playable],
            "trick_number": self.trick_number,
        })

    def find_first_leader(self) -> int:
        """Find the player with the lowest club, considering discarded cards."""
        discarded_set = set(self.discard_pile)
        for rank_val in range(2, 15):
            rank_str = {2: "2", 3: "3", 4: "4", 5: "5", 6: "6", 7: "7",
                        8: "8", 9: "9", 10: "10", 11: "J", 12: "Q", 13: "K", 14: "A"}[rank_val]
            card = Card(suit="clubs", rank=rank_str)
            if card in discarded_set:
                continue
            for i, player in enumerate(self.players):
                if card in player["hand"]:
                    return i
        return 0

    def _lowest_club_in_hand(self, player_index: int) -> Card | None:
        clubs = [c for c in self.players[player_index]["hand"] if c.suit == "clubs"]
        if not clubs:
            return None
        return min(clubs, key=lambda c: c.value)

    def _is_first_play_of_hand(self) -> bool:
        return self.trick_number == 1 and len(self.current_trick) == 0

    def get_playable_cards(self, player_index: int) -> list[Card]:
        hand = self.players[player_index]["hand"]
        if not hand:
            return []

        # First play of the entire hand: must play lowest club
        if self._is_first_play_of_hand():
            lowest_club = self._lowest_club_in_hand(player_index)
            if lowest_club:
                return [lowest_club]
            return list(hand)

        # Leading a trick (not first play)
        if len(self.current_trick) == 0:
            # Hearts/Everything: can't lead hearts unless broken or only hearts in hand
            if self.current_round_type in (RoundType.HEARTS, RoundType.EVERYTHING):
                non_hearts = [c for c in hand if not c.is_heart]
                if non_hearts and not self.hearts_broken:
                    return non_hearts
            return list(hand)

        # Following: must follow led suit if able
        led = self.current_trick[0][1].suit
        matching = [c for c in hand if c.suit == led]
        if matching:
            return matching

        # Can't follow suit - play anything
        return list(hand)

    async def play_card(self, player_id: str, suit: str, rank: str) -> None:
        idx = self.get_player_index(player_id)
        if idx is None:
            return
        if not self._resume_event.is_set():
            await self.send_to_id(player_id, {"action": "error", "message": "Game is paused — waiting for a player to reconnect"})
            return
        if self.phase != GamePhase.PLAYING:
            await self.send_to_id(player_id, {"action": "error", "message": "Not in playing phase"})
            return

        if self.current_round_type == RoundType.FANTAN:
            await self.play_fantan_card(player_id, suit, rank)
            return

        if idx != self.current_player_index:
            await self.send_to_id(player_id, {"action": "error", "message": "Not your turn"})
            return

        card = Card(suit=suit, rank=rank)

        if card not in self.players[idx]["hand"]:
            await self.send_to_id(player_id, {"action": "error", "message": "Card not in your hand"})
            return

        playable = self.get_playable_cards(idx)
        if card not in playable:
            await self.send_to_id(player_id, {
                "action": "error",
                "message": "That card is not a legal play right now",
            })
            return

        # Play the card
        self.players[idx]["hand"].remove(card)
        self.current_trick.append((idx, card))

        # Set led suit on first card of trick
        if len(self.current_trick) == 1:
            self.led_suit = card.suit

        # Check hearts breaking
        if card.is_heart and not self.hearts_broken:
            if self.current_round_type in (RoundType.HEARTS, RoundType.EVERYTHING):
                if self.led_suit != "hearts":
                    self.hearts_broken = True
                    await self.broadcast({"action": "hearts_broken"})

        await self.broadcast({
            "action": "card_played",
            "player": self.players[idx]["name"],
            "player_id": self.players[idx]["id"],
            "player_index": idx,
            "card": card.to_dict(),
            "trick_number": self.trick_number,
            "cards_in_trick": len(self.current_trick),
        })

        # Check if trick is complete
        if len(self.current_trick) == len(self.players):
            await asyncio.sleep(0.8)
            await self.resolve_trick()
        else:
            # Next player
            self.current_player_index = (self.current_player_index + 1) % len(self.players)
            await self._broadcast_turn()
            playable = self.get_playable_cards(self.current_player_index)
            await self.send_to(self.current_player_index, {
                "action": "your_turn",
                "playable_cards": [c.to_dict() for c in playable],
                "trick_number": self.trick_number,
            })

    def _calculate_trick_points(self, trick: list[tuple[int, Card]]) -> int:
        """Calculate points scored for a single trick under the current round type."""
        points = 0
        rt = self.current_round_type
        if rt in (RoundType.TRICKS, RoundType.EVERYTHING):
            points += 5
        if rt in (RoundType.HEARTS, RoundType.EVERYTHING):
            points += sum(10 for _, c in trick if c.is_heart)
        if rt in (RoundType.QUEENS, RoundType.EVERYTHING):
            points += sum(25 for _, c in trick if c.is_queen)
        if rt in (RoundType.KING_OF_SPADES, RoundType.EVERYTHING):
            points += sum(75 for _, c in trick if c.is_king_of_spades)
        if rt in (RoundType.LAST_TRICK, RoundType.EVERYTHING):
            if self.trick_number >= self.total_tricks:
                points += 100
        return points

    def _all_scoring_cards_played(self) -> bool:
        """Check if all scoring cards for the current round have been taken in tricks."""
        all_trick_cards = [
            card
            for pi in range(len(self.players))
            for trick in self.tricks_won.get(pi, [])
            for _, card in trick
        ]
        if self.current_round_type == RoundType.HEARTS:
            hearts_played = sum(1 for c in all_trick_cards if c.is_heart)
            hearts_discarded = sum(1 for c in self.discard_pile if c.is_heart)
            return hearts_played + hearts_discarded >= 13
        if self.current_round_type == RoundType.QUEENS:
            queens_played = sum(1 for c in all_trick_cards if c.is_queen)
            queens_discarded = sum(1 for c in self.discard_pile if c.is_queen)
            return queens_played + queens_discarded >= 4
        # K♠ already handled separately (ends on that trick)
        return False

    async def resolve_trick(self) -> None:
        """Determine trick winner: highest card of led suit."""
        await self._wait_for_unpause()
        led = self.current_trick[0][1].suit
        best_idx = self.current_trick[0][0]
        best_value = self.current_trick[0][1].value

        for pi, card in self.current_trick[1:]:
            if card.suit == led and card.value > best_value:
                best_idx = pi
                best_value = card.value

        self.tricks_won[best_idx].append(list(self.current_trick))
        self.last_trick_winner_index = best_idx

        # Calculate points for this trick
        trick_points = self._calculate_trick_points(self.current_trick)

        await self.broadcast({
            "action": "trick_won",
            "winner": self.players[best_idx]["name"],
            "winner_index": best_idx,
            "trick_number": self.trick_number,
            "trick_points": trick_points,
            "trick_cards": [{"player": self.players[pi]["name"], "card": c.to_dict()} for pi, c in self.current_trick],
        })

        # King of Spades: end round when K♠ trick is taken
        if self.current_round_type == RoundType.KING_OF_SPADES:
            trick_has_king = any(card.is_king_of_spades for _, card in self.current_trick)
            if trick_has_king:
                await asyncio.sleep(1)
                await self.score_trick_round()
                return

        # Early termination: Hearts/Queens round ends when all scoring cards are taken
        if self._all_scoring_cards_played():
            await asyncio.sleep(1)
            await self.score_trick_round()
            return

        # Check if all tricks done
        if self.trick_number >= self.total_tricks:
            await asyncio.sleep(1)
            await self.score_trick_round()
        else:
            # Winner leads next trick
            self.trick_number += 1
            self.current_trick = []
            self.led_suit = None
            self.trick_leader_index = best_idx
            self.current_player_index = best_idx

            await asyncio.sleep(1)
            await self._broadcast_turn()

            playable = self.get_playable_cards(self.current_player_index)
            await self.send_to(self.current_player_index, {
                "action": "your_turn",
                "playable_cards": [c.to_dict() for c in playable],
                "trick_number": self.trick_number,
            })

    async def score_trick_round(self) -> None:
        """Score the completed trick-taking round."""
        round_scores: dict[int, int] = {i: 0 for i in range(len(self.players))}

        for pi in range(len(self.players)):
            tricks = self.tricks_won.get(pi, [])

            if self.current_round_type in (RoundType.TRICKS, RoundType.EVERYTHING):
                round_scores[pi] += len(tricks) * 5

            if self.current_round_type in (RoundType.HEARTS, RoundType.EVERYTHING):
                for trick in tricks:
                    for _, card in trick:
                        if card.is_heart:
                            round_scores[pi] += 10

            if self.current_round_type in (RoundType.QUEENS, RoundType.EVERYTHING):
                for trick in tricks:
                    for _, card in trick:
                        if card.is_queen:
                            round_scores[pi] += 25

            if self.current_round_type in (RoundType.KING_OF_SPADES, RoundType.EVERYTHING):
                for trick in tricks:
                    for _, card in trick:
                        if card.is_king_of_spades:
                            round_scores[pi] += 75

        # Last trick: +100 for whoever won the final trick
        if self.current_round_type in (RoundType.LAST_TRICK, RoundType.EVERYTHING):
            if self.last_trick_winner_index >= 0:
                round_scores[self.last_trick_winner_index] += 100

        # Apply scores
        score_details = []
        for i, player in enumerate(self.players):
            player["score"] += round_scores[i]
            score_details.append({
                "player": player["name"],
                "player_index": i,
                "round_score": round_scores[i],
                "total_score": player["score"],
            })

        self.round_history.append({
            "round_number": self.round_number,
            "round_type": self.current_round_type.value if self.current_round_type else "",
            "dealer": self.players[self.dealer_index]["name"],
            "scores": score_details,
        })

        self.phase = GamePhase.ROUND_OVER
        await self.broadcast({
            "action": "round_result",
            "round_type": self.current_round_type.value if self.current_round_type else "",
            "round_number": self.round_number,
            "scores": score_details,
            "round_history": self.round_history,
        })

        # Wait for players to see results, then advance
        await asyncio.sleep(3)
        await self._wait_for_unpause()
        await self.end_round()

    # ------------------------------------------------------------------ #
    #  FANTAN (Round 7)                                                    #
    # ------------------------------------------------------------------ #

    async def setup_fantan(self) -> None:
        self.layout = {}
        self.sevens_placed = set()
        self.finish_order = []
        self.fantan_consecutive_passes = 0

        # Place any 7s from discard pile into layout
        for card in self.discard_pile:
            if card.rank == "7":
                self.layout[card.suit] = {"low": 7, "high": 7}
                self.sevens_placed.add(card.suit)

        # Determine who plays first: holder of 7 of clubs, then spades, hearts, diamonds
        first_player = None
        for suit in SUIT_ORDER_FOR_FANTAN_START:
            seven = Card(suit=suit, rank="7")
            if seven in self.discard_pile:
                continue
            for i, player in enumerate(self.players):
                if seven in player["hand"]:
                    first_player = i
                    break
            if first_player is not None:
                break

        if first_player is None:
            first_player = self.dealer_index

        self.current_player_index = first_player

        await self.broadcast({
            "action": "fantan_started",
            "layout": self._layout_to_dict(),
            "sevens_from_discard": [c.to_dict() for c in self.discard_pile if c.rank == "7"],
            "first_player": self.players[first_player]["name"],
            "first_player_index": first_player,
            "current_player_index": first_player,
        })

        await self._broadcast_turn()

        playable = self.get_fantan_playable(self.current_player_index)
        await self.send_to(self.current_player_index, {
            "action": "your_turn",
            "playable_cards": [c.to_dict() for c in playable],
            "can_pass": len(playable) == 0,
            "is_fantan": True,
        })

    def _layout_to_dict(self) -> dict[str, dict[str, int]]:
        return {suit: dict(bounds) for suit, bounds in self.layout.items()}

    def get_fantan_playable(self, player_index: int) -> list[Card]:
        hand = self.players[player_index]["hand"]
        playable: list[Card] = []

        for card in hand:
            if card.rank == "7" and card.suit not in self.sevens_placed:
                playable.append(card)
                continue

            if card.suit in self.layout:
                bounds = self.layout[card.suit]
                low = bounds["low"]
                high = bounds["high"]
                if card.value == low - 1 and card.value >= 2:
                    playable.append(card)
                elif card.value == high + 1 and card.value <= 14:
                    playable.append(card)

        return playable

    async def play_fantan_card(self, player_id: str, suit: str, rank: str) -> None:
        idx = self.get_player_index(player_id)
        if idx is None:
            return
        if idx != self.current_player_index:
            await self.send_to_id(player_id, {"action": "error", "message": "Not your turn"})
            return

        card = Card(suit=suit, rank=rank)

        if card not in self.players[idx]["hand"]:
            await self.send_to_id(player_id, {"action": "error", "message": "Card not in your hand"})
            return

        playable = self.get_fantan_playable(idx)
        if card not in playable:
            await self.send_to_id(player_id, {"action": "error", "message": "That card cannot be played"})
            return

        # Remove card from hand
        self.players[idx]["hand"].remove(card)
        self.fantan_consecutive_passes = 0

        # Place in layout
        if card.rank == "7":
            self.layout[card.suit] = {"low": 7, "high": 7}
            self.sevens_placed.add(card.suit)
        elif card.suit in self.layout:
            bounds = self.layout[card.suit]
            if card.value == bounds["low"] - 1:
                bounds["low"] = card.value
            elif card.value == bounds["high"] + 1:
                bounds["high"] = card.value

        await self.broadcast({
            "action": "fantan_card_played",
            "player": self.players[idx]["name"],
            "player_id": self.players[idx]["id"],
            "player_index": idx,
            "card": card.to_dict(),
            "layout": self._layout_to_dict(),
        })

        # Check if player is out of cards
        if len(self.players[idx]["hand"]) == 0:
            self.finish_order.append(idx)
            await self.broadcast({
                "action": "player_finished",
                "player": self.players[idx]["name"],
                "player_index": idx,
                "position": len(self.finish_order),
            })

        # Check if all but one are done
        players_with_cards = [i for i in range(len(self.players)) if len(self.players[i]["hand"]) > 0]
        if len(players_with_cards) <= 1:
            for pi in players_with_cards:
                if pi not in self.finish_order:
                    self.finish_order.append(pi)
            await self.score_fantan()
            return

        await self._advance_fantan_player()

    async def pass_fantan(self, player_id: str) -> None:
        idx = self.get_player_index(player_id)
        if idx is None:
            return
        if not self._resume_event.is_set():
            await self.send_to_id(player_id, {"action": "error", "message": "Game is paused"})
            return
        if idx != self.current_player_index:
            await self.send_to_id(player_id, {"action": "error", "message": "Not your turn"})
            return

        playable = self.get_fantan_playable(idx)
        if playable:
            await self.send_to_id(player_id, {
                "action": "error",
                "message": "You have playable cards, you must play one",
            })
            return

        self.fantan_consecutive_passes += 1

        await self.broadcast({
            "action": "player_passed",
            "player": self.players[idx]["name"],
            "player_index": idx,
        })

        # Check for deadlock
        active_players = [i for i in range(len(self.players))
                          if len(self.players[i]["hand"]) > 0 and i not in self.finish_order]
        if self.fantan_consecutive_passes >= len(active_players):
            remaining = sorted(active_players, key=lambda pi: len(self.players[pi]["hand"]))
            for pi in remaining:
                self.finish_order.append(pi)
            await self.broadcast({
                "action": "fantan_deadlock",
                "message": "No more plays possible due to discarded cards blocking the sequence",
                "remaining_order": [
                    {"player": self.players[pi]["name"], "cards_left": len(self.players[pi]["hand"])}
                    for pi in remaining
                ],
            })
            await self.score_fantan()
            return

        await self._advance_fantan_player()

    async def _advance_fantan_player(self) -> None:
        """Move to the next player who still has cards."""
        n = len(self.players)
        next_idx = (self.current_player_index + 1) % n
        attempts = 0
        while attempts < n:
            if len(self.players[next_idx]["hand"]) > 0 and next_idx not in self.finish_order:
                break
            next_idx = (next_idx + 1) % n
            attempts += 1

        if attempts >= n:
            await self.score_fantan()
            return

        self.current_player_index = next_idx
        await self._broadcast_turn()

        playable = self.get_fantan_playable(next_idx)
        await self.send_to(next_idx, {
            "action": "your_turn",
            "playable_cards": [c.to_dict() for c in playable],
            "can_pass": len(playable) == 0,
            "is_fantan": True,
        })

    async def score_fantan(self) -> None:
        n = len(self.players)
        score_table = FANTAN_SCORES.get(n)
        if score_table is None:
            score_table = self._generate_fantan_scores(n)

        round_scores: dict[int, int] = {}
        for position, pi in enumerate(self.finish_order):
            round_scores[pi] = score_table[position]

        score_details = []
        for i, player in enumerate(self.players):
            pts = round_scores.get(i, 0)
            player["score"] += pts
            score_details.append({
                "player": player["name"],
                "player_index": i,
                "round_score": pts,
                "total_score": player["score"],
                "finish_position": self.finish_order.index(i) + 1 if i in self.finish_order else None,
            })

        self.round_history.append({
            "round_number": self.round_number,
            "round_type": "fantan",
            "dealer": self.players[self.dealer_index]["name"],
            "scores": score_details,
            "finish_order": [self.players[pi]["name"] for pi in self.finish_order],
        })

        self.phase = GamePhase.ROUND_OVER
        await self.broadcast({
            "action": "round_result",
            "round_type": "fantan",
            "round_number": self.round_number,
            "scores": score_details,
            "finish_order": [self.players[pi]["name"] for pi in self.finish_order],
            "round_history": self.round_history,
        })

        await asyncio.sleep(3)
        await self._wait_for_unpause()
        await self.end_round()

    def _generate_fantan_scores(self, n: int) -> list[int]:
        """Generate symmetric fantan scores for any player count."""
        if n % 2 == 1:
            half = n // 2
            scores = [-(half - i) * 50 for i in range(half)]
            scores.append(0)
            scores += [i * 50 for i in range(1, half + 1)]
            return scores
        else:
            half = n // 2
            scores = [-(half - i) * 50 for i in range(half)]
            scores += [i * 50 for i in range(half)]
            return scores

    # ------------------------------------------------------------------ #
    #  ROUND TRANSITION                                                    #
    # ------------------------------------------------------------------ #

    async def end_round(self) -> None:
        """Check if game is over, otherwise advance dealer and deal next hand."""
        if self.round_number >= 7:
            await self.game_over()
            return

        # Advance dealer clockwise
        self.dealer_index = (self.dealer_index + 1) % len(self.players)

        # Reset round state
        self.current_round_type = None
        self.current_trick = []
        self.trick_number = 0
        self.hearts_broken = False
        self.led_suit = None
        self.layout = {}
        self.sevens_placed = set()
        self.finish_order = []
        self.last_trick_winner_index = -1

        await self.broadcast({
            "action": "next_round",
            "dealer": self.players[self.dealer_index]["name"],
            "dealer_index": self.dealer_index,
            "round_number": self.round_number + 1,
        })

        await asyncio.sleep(1)
        await self._wait_for_unpause()
        await self.deal_hand()

    async def game_over(self) -> None:
        self.phase = GamePhase.GAME_OVER
        final_scores = sorted(
            [{"player": p["name"], "score": p["score"], "player_index": i}
             for i, p in enumerate(self.players)],
            key=lambda x: x["score"],
        )
        winner = final_scores[0]

        await self.broadcast({
            "action": "game_over",
            "final_scores": final_scores,
            "winner": winner["player"],
            "winner_score": winner["score"],
            "round_history": self.round_history,
        })

    # ------------------------------------------------------------------ #
    #  TURN BROADCAST                                                      #
    # ------------------------------------------------------------------ #

    async def _broadcast_turn(self) -> None:
        """Tell all players whose turn it is."""
        await self.broadcast({
            "action": "turn_update",
            "current_player_index": self.current_player_index,
            "current_player": self.players[self.current_player_index]["name"],
        })

    # ------------------------------------------------------------------ #
    #  COMMUNICATION                                                       #
    # ------------------------------------------------------------------ #

    async def broadcast(self, msg: dict[str, Any]) -> None:
        data = json.dumps(msg)
        for player in self.players:
            ws = player.get("ws")
            if ws is not None:
                try:
                    await ws.send_text(data)
                except Exception:
                    pass

    async def send_to(self, player_index: int, msg: dict[str, Any]) -> None:
        if 0 <= player_index < len(self.players):
            ws = self.players[player_index].get("ws")
            if ws is not None:
                try:
                    await ws.send_text(json.dumps(msg))
                except Exception:
                    pass

    async def send_to_id(self, player_id: str, msg: dict[str, Any]) -> None:
        idx = self.get_player_index(player_id)
        if idx is not None:
            await self.send_to(idx, msg)

    # ------------------------------------------------------------------ #
    #  STATE SERIALIZATION                                                 #
    # ------------------------------------------------------------------ #

    def get_game_state(self, for_player_id: str | None = None) -> dict[str, Any]:
        player_data = []
        for i, p in enumerate(self.players):
            pd: dict[str, Any] = {
                "name": p["name"],
                "id": p["id"],
                "score": p["score"],
                "cards_in_hand": len(p["hand"]),
                "disconnected": p.get("disconnected", False),
            }
            if for_player_id and p["id"] == for_player_id:
                pd["hand"] = [c.to_dict() for c in p["hand"]]
            player_data.append(pd)

        state: dict[str, Any] = {
            "game_id": self.game_id,
            "name": self.name,
            "phase": self.phase.value,
            "players": player_data,
            "host_id": self.host_id,
            "dealer_index": self.dealer_index,
            "current_round_type": self.current_round_type.value if self.current_round_type else None,
            "round_number": self.round_number,
            "current_player_index": self.current_player_index,
            "trick_number": self.trick_number,
            "total_tricks": self.total_tricks,
            "hearts_broken": self.hearts_broken,
            "discard_pile": [c.to_dict() for c in self.discard_pile],
            "round_history": self.round_history,
            "paused": not self._resume_event.is_set(),
        }

        if self.current_round_type == RoundType.FANTAN:
            state["layout"] = self._layout_to_dict()
            state["finish_order"] = [self.players[pi]["name"] for pi in self.finish_order]

        if self.current_trick:
            state["current_trick"] = [
                {"player": self.players[pi]["name"], "card": c.to_dict()}
                for pi, c in self.current_trick
            ]

        return state

    def to_lobby_dict(self) -> dict[str, Any]:
        return {
            "game_id": self.game_id,
            "name": self.name,
            "phase": self.phase.value,
            "player_count": len(self.players),
            "max_players": self.max_players,
            "host": self.players[0]["name"] if self.players else "",
            "players": [p["name"] for p in self.players],
        }
