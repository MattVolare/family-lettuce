from __future__ import annotations

import json
import uuid
from pathlib import Path
from typing import Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from starlette.requests import Request

from game_engine.lettuce import GamePhase, LettuceGame

BASE_DIR = Path(__file__).resolve().parent
app = FastAPI(title="Lettuce Card Game")

app.mount("/static", StaticFiles(directory=str(BASE_DIR / "static")), name="static")
templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))

# ---------------------------------------------------------------------------
#  In-memory state
# ---------------------------------------------------------------------------
games: dict[str, LettuceGame] = {}
player_sessions: dict[str, dict[str, Any]] = {}  # player_id -> {id, name, ws, game_id}


# ---------------------------------------------------------------------------
#  Helpers
# ---------------------------------------------------------------------------

def get_game_list() -> list[dict[str, Any]]:
    return [g.to_lobby_dict() for g in games.values() if g.phase in (GamePhase.LOBBY, GamePhase.PLAYING)]


async def broadcast_game_list() -> None:
    """Send updated game list to every connected player NOT currently in a game."""
    msg = json.dumps({"action": "game_list", "games": get_game_list()})
    for session in player_sessions.values():
        if session.get("game_id") is None:
            ws = session.get("ws")
            if ws is not None:
                try:
                    await ws.send_text(msg)
                except Exception:
                    pass


async def send_json(ws: WebSocket, data: dict[str, Any]) -> None:
    try:
        await ws.send_text(json.dumps(data))
    except Exception:
        pass


# ---------------------------------------------------------------------------
#  HTTP routes
# ---------------------------------------------------------------------------

@app.get("/", response_class=HTMLResponse)
async def index(request: Request) -> HTMLResponse:
    return templates.TemplateResponse("index.html", {"request": request})


# ---------------------------------------------------------------------------
#  WebSocket
# ---------------------------------------------------------------------------

@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket) -> None:
    await ws.accept()
    player_id: str | None = None

    try:
        while True:
            raw = await ws.receive_text()
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                await send_json(ws, {"action": "error", "message": "Invalid JSON"})
                continue

            action = data.get("action", "")

            # ---- LOGIN ----
            if action == "login":
                name = data.get("name", "").strip()
                if not name:
                    await send_json(ws, {"action": "error", "message": "Name is required"})
                    continue
                player_id = str(uuid.uuid4())
                player_sessions[player_id] = {
                    "id": player_id,
                    "name": name,
                    "ws": ws,
                    "game_id": None,
                }
                await send_json(ws, {
                    "action": "logged_in",
                    "player_id": player_id,
                    "name": name,
                    "games": get_game_list(),
                })
                continue

            # All further actions require login
            if player_id is None or player_id not in player_sessions:
                await send_json(ws, {"action": "error", "message": "Not logged in"})
                continue

            session = player_sessions[player_id]

            # ---- GET GAME LIST ----
            if action == "get_game_list":
                await send_json(ws, {
                    "action": "game_list",
                    "games": get_game_list(),
                })
                continue

            # ---- CREATE GAME ----
            if action == "create_game":
                game_name = data.get("name", "").strip() or f"{session['name']}'s Game"
                game = LettuceGame(name=game_name)
                game.add_player(player_id, session["name"], ws)
                games[game.game_id] = game
                session["game_id"] = game.game_id

                await send_json(ws, {
                    "action": "game_created",
                    "game_id": game.game_id,
                    "game_state": game.get_game_state(for_player_id=player_id),
                })
                await broadcast_game_list()

            # ---- JOIN GAME ----
            elif action == "join_game":
                game_id = data.get("game_id", "")
                print(f"[JOIN] Requested game_id: {game_id!r}")
                print(f"[JOIN] Available games: {list(games.keys())}")
                game = games.get(game_id)
                if game is None:
                    await send_json(ws, {"action": "error", "message": "Game not found"})
                    continue
                if not game.add_player(player_id, session["name"], ws):
                    await send_json(ws, {"action": "error", "message": "Cannot join this game"})
                    continue
                session["game_id"] = game_id

                await send_json(ws, {
                    "action": "game_joined",
                    "game_id": game_id,
                    "game_state": game.get_game_state(for_player_id=player_id),
                })
                await game.broadcast({
                    "action": "player_joined",
                    "player": session["name"],
                    "game_state": game.get_game_state(),
                })
                await broadcast_game_list()

            # ---- LEAVE GAME ----
            elif action == "leave_game":
                game_id = session.get("game_id")
                if game_id and game_id in games:
                    game = games[game_id]
                    game.remove_player(player_id)
                    session["game_id"] = None
                    await game.broadcast({
                        "action": "player_left",
                        "player": session["name"],
                        "game_state": game.get_game_state(),
                    })
                    # Remove empty games
                    if not game.players:
                        del games[game_id]
                    await broadcast_game_list()
                    await send_json(ws, {
                        "action": "left_game",
                        "games": get_game_list(),
                    })

            # ---- START GAME ----
            elif action == "start_game":
                game_id = session.get("game_id")
                if not game_id or game_id not in games:
                    await send_json(ws, {"action": "error", "message": "Not in a game"})
                    continue
                game = games[game_id]
                if game.host_id != player_id:
                    await send_json(ws, {"action": "error", "message": "Only the host can start the game"})
                    continue
                if game.phase != GamePhase.LOBBY:
                    await send_json(ws, {"action": "error", "message": "Game already started"})
                    continue
                await game.start_game()

            # ---- SELECT ROUND ----
            elif action == "select_round":
                game_id = session.get("game_id")
                if not game_id or game_id not in games:
                    await send_json(ws, {"action": "error", "message": "Not in a game"})
                    continue
                game = games[game_id]
                round_type = data.get("round_type", "")
                await game.select_round(player_id, round_type)

            # ---- PLAY CARD ----
            elif action == "play_card":
                game_id = session.get("game_id")
                if not game_id or game_id not in games:
                    await send_json(ws, {"action": "error", "message": "Not in a game"})
                    continue
                game = games[game_id]
                suit = data.get("suit", "")
                rank = data.get("rank", "")
                if not suit or not rank:
                    await send_json(ws, {"action": "error", "message": "suit and rank are required"})
                    continue
                await game.play_card(player_id, suit, rank)

            # ---- PASS TURN (FANTAN) ----
            elif action == "pass_turn":
                game_id = session.get("game_id")
                if not game_id or game_id not in games:
                    await send_json(ws, {"action": "error", "message": "Not in a game"})
                    continue
                game = games[game_id]
                await game.pass_fantan(player_id)

            # ---- CHAT ----
            elif action == "chat":
                game_id = session.get("game_id")
                message = data.get("message", "").strip()
                if game_id and game_id in games and message:
                    game = games[game_id]
                    await game.broadcast({
                        "action": "chat",
                        "player": session["name"],
                        "message": message,
                    })

            # ---- WEBRTC SIGNALING RELAY ----
            elif action == "signal":
                to_player_id = data.get("to", "")
                signal_data = data.get("data", {})
                target_session = player_sessions.get(to_player_id)
                if target_session and target_session.get("ws"):
                    await send_json(target_session["ws"], {
                        "action": "signal",
                        "from": player_id,
                        "data": signal_data,
                    })

            # ---- GET STATE ----
            elif action == "get_state":
                game_id = session.get("game_id")
                if game_id and game_id in games:
                    game = games[game_id]
                    await send_json(ws, {
                        "action": "game_state",
                        "game_state": game.get_game_state(for_player_id=player_id),
                    })
                else:
                    await send_json(ws, {
                        "action": "game_list",
                        "games": get_game_list(),
                    })

            else:
                await send_json(ws, {"action": "error", "message": f"Unknown action: {action}"})

    except WebSocketDisconnect:
        print("[WS] Client disconnected normally")
    except Exception as e:
        import traceback
        print(f"[WS ERROR] {e}")
        traceback.print_exc()
    finally:
        # Clean up on disconnect
        if player_id and player_id in player_sessions:
            session = player_sessions[player_id]
            game_id = session.get("game_id")
            if game_id and game_id in games:
                game = games[game_id]
                game.remove_player(player_id)
                if game.players:
                    try:
                        await game.broadcast({
                            "action": "player_left",
                            "player": session.get("name", "Unknown"),
                            "game_state": game.get_game_state(),
                        })
                    except Exception:
                        pass
                else:
                    del games[game_id]
                try:
                    await broadcast_game_list()
                except Exception:
                    pass
            del player_sessions[player_id]


# ---------------------------------------------------------------------------
#  Run
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8085)
