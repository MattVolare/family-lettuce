from __future__ import annotations

import random
from dataclasses import dataclass, field

SUITS = ["clubs", "diamonds", "hearts", "spades"]
RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"]
RANK_VALUES = {r: i for i, r in enumerate(RANKS, start=2)}


@dataclass(frozen=True)
class Card:
    suit: str
    rank: str

    @property
    def value(self) -> int:
        return RANK_VALUES[self.rank]

    @property
    def is_heart(self) -> bool:
        return self.suit == "hearts"

    @property
    def is_queen(self) -> bool:
        return self.rank == "Q"

    @property
    def is_king_of_spades(self) -> bool:
        return self.suit == "spades" and self.rank == "K"

    def to_dict(self) -> dict:
        return {"suit": self.suit, "rank": self.rank, "value": self.value}

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, Card):
            return NotImplemented
        return self.suit == other.suit and self.rank == other.rank

    def __hash__(self) -> int:
        return hash((self.suit, self.rank))

    def __repr__(self) -> str:
        suit_symbols = {"hearts": "\u2665", "diamonds": "\u2666", "clubs": "\u2663", "spades": "\u2660"}
        return f"{self.rank}{suit_symbols.get(self.suit, self.suit)}"


class Deck:
    def __init__(self) -> None:
        self.cards: list[Card] = [Card(suit=s, rank=r) for s in SUITS for r in RANKS]

    def shuffle(self) -> None:
        random.shuffle(self.cards)

    def deal_with_discard(self, num_players: int) -> tuple[list[list[Card]], list[Card]]:
        """Deal cards to players, discarding extras so everyone gets equal hands.

        Returns (list of hands, discard pile).
        """
        self.shuffle()
        discard_count = 52 % num_players
        discard = self.cards[:discard_count]
        remaining = self.cards[discard_count:]
        cards_per_player = len(remaining) // num_players

        hands: list[list[Card]] = []
        for i in range(num_players):
            start = i * cards_per_player
            end = start + cards_per_player
            hands.append(remaining[start:end])

        return hands, discard
