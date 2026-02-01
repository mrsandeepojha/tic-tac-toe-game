import { useState, useEffect } from 'react'
import io from 'socket.io-client'
import './App.css'

const socket = io(window.location.hostname === 'localhost' ? 'http://localhost:3001' : undefined);

function Square({ value, onSquareClick, isWinning, disabled }) {
  return (
    <button
      className={`square ${value ? `square-${value.toLowerCase()}` : ''} ${isWinning ? 'winning' : ''}`}
      onClick={onSquareClick}
      disabled={disabled}
    >
      {value && <span className="symbol">{value}</span>}
    </button>
  );
}

function Modal({ isOpen, title, children, onClose, actionLabel }) {
  if (!isOpen) return null;
  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h2>{title}</h2>
        <div className="modal-body">{children}</div>
        {actionLabel && (
          <button className="modal-btn" onClick={onClose}>{actionLabel}</button>
        )}
      </div>
    </div>
  );
}

function Scoreboard({ scores, players, mySymbol }) {
  const pX = players.find(p => p.symbol === 'X');
  const pO = players.find(p => p.symbol === 'O');

  return (
    <div className="scoreboard">
      <div className={`score-badge ${mySymbol === 'X' ? 'mine' : ''}`}>
        <span className="p-name">{pX?.name || 'Waiting...'} (X)</span>
        <span className="p-score">{scores.X}</span>
      </div>
      <div className="score-divider">vs</div>
      <div className={`score-badge ${mySymbol === 'O' ? 'mine' : ''}`}>
        <span className="p-score">{scores.O}</span>
        <span className="p-name">{pO?.name || 'Waiting...'} (O)</span>
      </div>
      <div className="draws-badge">Draws: {scores.draws}</div>
    </div>
  );
}

function Board({ squares, onPlay, winningLine, disabled }) {
  return (
    <div className="game-container">
      <div className="board">
        {[0, 1, 2].map(row => (
          <div className="board-row" key={row}>
            {[0, 1, 2].map(col => {
              const index = row * 3 + col;
              return (
                <Square
                  key={index}
                  value={squares[index]}
                  onSquareClick={() => onPlay(index)}
                  isWinning={winningLine?.includes(index)}
                  disabled={disabled}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function Game() {
  const [room, setRoom] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [isInRoom, setIsInRoom] = useState(false);

  // Game State
  const [playerSymbol, setPlayerSymbol] = useState(null);
  const [squares, setSquares] = useState(Array(9).fill(null));
  const [isXNext, setIsXNext] = useState(true);
  const [scores, setScores] = useState({ X: 0, O: 0, draws: 0 });
  const [players, setPlayers] = useState([]);

  // Modals & Toasts
  const [winnerInfo, setWinnerInfo] = useState(null); // { winner: 'X'|'O'|'Draw', line: [] }
  const [modalState, setModalState] = useState({ isOpen: false, type: null, data: null });
  const [toast, setToast] = useState(null); // { message: string, type: 'info'|'success' }

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  useEffect(() => {
    socket.on('game_joined', (data) => {
      setPlayerSymbol(data.symbol);
      setSquares(data.board);
      setIsXNext(data.isXNext);
      setScores(data.scores);
      setPlayers(data.players);
      setIsInRoom(true);
    });

    socket.on('room_full', () => {
      alert("Room is full!");
    });

    socket.on('player_joined', (data) => {
      setPlayers(data.players);
      // Find the new player (not me)
      const newPlayer = data.players.find(p => p.id !== socket.id);
      if (newPlayer && data.players.length > 1) { // Ensure it's not just initial load
        setToast({ message: `${newPlayer.name} has joined!`, type: 'success' });
      }
    });

    socket.on('game_update', (data) => {
      setSquares(data.board);
      setIsXNext(data.isXNext);
      setScores(data.scores);
      if (data.players) setPlayers(data.players);

      if (data.winner) {
        const result = calculateWinner(data.board);
        setWinnerInfo({ winner: data.winner, line: result?.line });

        // Find winner name
        const winnerPlayer = data.players ? data.players.find(p => p.symbol === data.winner) : null;
        const winnerName = winnerPlayer ? winnerPlayer.name : data.winner;

        setModalState({ isOpen: true, type: 'WINNER', data: winnerName });
      } else if (data.isDraw) {
        setWinnerInfo({ winner: 'Draw', line: [] });
        setModalState({ isOpen: true, type: 'DRAW', data: null });
      } else {
        setWinnerInfo(null);
        setModalState(prev => prev.type === 'WINNER' || prev.type === 'DRAW' ? { ...prev, isOpen: false } : prev);
      }
    });

    socket.on('player_left', (data) => {
      setModalState({ isOpen: true, type: 'LEFT', data: data.name });
      resetGameLocally();
    });

    return () => {
      socket.off('game_joined');
      socket.off('room_full');
      socket.off('player_joined');
      socket.off('game_update');
      socket.off('player_left');
    };
  }, [room]);

  function joinRoom() {
    if (room.trim() && playerName.trim()) {
      socket.emit('join_room', { roomId: room, playerName });
    } else {
      alert("Please enter both Name and Room ID");
    }
  }

  function handlePlay(index) {
    if (squares[index] || winnerInfo) return;

    if (isXNext && playerSymbol !== 'X') return;
    if (!isXNext && playerSymbol !== 'O') return;

    socket.emit('make_move', { roomId: room, index, symbol: playerSymbol });
  }

  function resetGame() {
    socket.emit('reset_game', room);
    setModalState({ isOpen: false, type: null, data: null });
  }

  function resetGameLocally() {
    setSquares(Array(9).fill(null));
    setWinnerInfo(null);
    setIsXNext(true);
    setPlayers(prev => prev.filter(p => p.id === socket.id)); // Keep only self
  }

  function leaveRoom() {
    window.location.reload();
  }

  // Helper for winner line logic
  function calculateWinner(squares) {
    const lines = [
      [0, 1, 2], [3, 4, 5], [6, 7, 8],
      [0, 3, 6], [1, 4, 7], [2, 5, 8],
      [0, 4, 8], [2, 4, 6],
    ];
    for (let i = 0; i < lines.length; i++) {
      const [a, b, c] = lines[i];
      if (squares[a] && squares[a] === squares[b] && squares[a] === squares[c]) {
        return { winner: squares[a], line: lines[i] };
      }
    }
    return null;
  }

  // Display Status Calculation
  let displayStatus = "Waiting for Opponent...";
  if (players.length === 2 && !winnerInfo) {
    const isMyTurn = (isXNext && playerSymbol === 'X') || (!isXNext && playerSymbol === 'O');
    displayStatus = isMyTurn ? "Your Turn" : `Waiting for ${isXNext ? 'X' : 'O'}...`;
  }

  if (!isInRoom) {
    return (
      <div className="game lobby">
        <header className="game-header">
          <h1>Tic-Tac-Toe</h1>
          <p className="subtitle">Multiplayer Lobby</p>
        </header>
        <div className="lobby-container">
          <input
            type="text"
            placeholder="Your Name"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            className="room-input"
          />
          <input
            type="text"
            placeholder="Room ID"
            value={room}
            onChange={(e) => setRoom(e.target.value)}
            className="room-input"
          />
          <button onClick={joinRoom} className="join-btn">Join / Create Room</button>
        </div>
      </div>
    );
  }

  return (
    <div className="game">
      <Modal
        isOpen={modalState.isOpen}
        title={
          modalState.type === 'WINNER' ? `🎉 ${modalState.data} Wins!` :
            modalState.type === 'DRAW' ? "🤝 It's a Draw!" :
              "⚠️ Opponent Left"
        }
        actionLabel={modalState.type === 'LEFT' ? "Back to Lobby" : "Play Again"}
        onClose={modalState.type === 'LEFT' ? leaveRoom : resetGame}
      >
        {modalState.type === 'LEFT' ? (
          <p>{modalState.data || "Opponent"} has disconnected.</p>
        ) : (
          <p>Score has been updated!</p>
        )}
      </Modal>

      {toast && (
        <div className={`toast ${toast.type}`}>
          {toast.message}
        </div>
      )}

      <header className="game-header compact">
        <h1>
          <span className="title-x">Tic</span>
          <span className="title-tac">-Tac-</span>
          <span className="title-o">Toe</span>
        </h1>
        <div className="room-badge">Room: {room}</div>
      </header>

      <main className="game-main">
        <Scoreboard scores={scores} players={players} mySymbol={playerSymbol} />

        <div className="status-bar">
          <h2>{displayStatus}</h2>
        </div>

        <div className="game-board">
          <Board
            squares={squares}
            onPlay={handlePlay}
            winningLine={winnerInfo?.line}
            disabled={!!winnerInfo || players.length < 2}
          />
        </div>
      </main>
    </div>
  );
}

export default Game;
