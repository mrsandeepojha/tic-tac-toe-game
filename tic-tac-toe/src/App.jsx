import { useState, useEffect, useCallback } from 'react'
import io from 'socket.io-client'
import './App.css'

const socket = io(window.location.hostname === 'localhost' ? 'http://localhost:3001' : undefined);

// ===== Helper Functions =====
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

function generateRoomId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function getInviteLink(roomId) {
  const baseUrl = window.location.origin;
  return `${baseUrl}?room=${roomId}`;
}

function getRoomIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get('room');
}

// ===== Minimax AI =====
function minimax(squares, depth, isMaximizing, alpha, beta) {
  const result = calculateWinner(squares);
  if (result?.winner === 'O') return 10 - depth;
  if (result?.winner === 'X') return depth - 10;
  if (squares.every(Boolean)) return 0;

  if (isMaximizing) {
    let maxEval = -Infinity;
    for (let i = 0; i < 9; i++) {
      if (!squares[i]) {
        squares[i] = 'O';
        const evalScore = minimax(squares, depth + 1, false, alpha, beta);
        squares[i] = null;
        maxEval = Math.max(maxEval, evalScore);
        alpha = Math.max(alpha, evalScore);
        if (beta <= alpha) break;
      }
    }
    return maxEval;
  } else {
    let minEval = Infinity;
    for (let i = 0; i < 9; i++) {
      if (!squares[i]) {
        squares[i] = 'X';
        const evalScore = minimax(squares, depth + 1, true, alpha, beta);
        squares[i] = null;
        minEval = Math.min(minEval, evalScore);
        beta = Math.min(beta, evalScore);
        if (beta <= alpha) break;
      }
    }
    return minEval;
  }
}

function getBestMove(squares) {
  let bestScore = -Infinity;
  let bestMove = -1;
  for (let i = 0; i < 9; i++) {
    if (!squares[i]) {
      squares[i] = 'O';
      const score = minimax(squares, 0, false, -Infinity, Infinity);
      squares[i] = null;
      if (score > bestScore) {
        bestScore = score;
        bestMove = i;
      }
    }
  }
  return bestMove;
}

// ===== Components =====
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

// ===== Landing Screen =====
function LandingScreen({ onSelectMode, inviteRoomId }) {
  return (
    <div className="landing-screen">
      <header className="game-header">
        <h1>
          <span className="title-x">Tic</span>
          <span className="title-tac">-Tac-</span>
          <span className="title-o">Toe</span>
        </h1>
        <p className="subtitle">Choose Your Game Mode</p>
      </header>

      <div className="mode-selection">
        <div className="mode-card" onClick={() => onSelectMode('single')}>
          <div className="mode-icon">🤖</div>
          <h3>vs Computer</h3>
          <p>Challenge the unbeatable AI</p>
        </div>

        <div className="mode-card" onClick={() => onSelectMode('multi')}>
          <div className="mode-icon">👥</div>
          <h3>Multiplayer</h3>
          <p>Play with a friend online</p>
        </div>
      </div>

      {inviteRoomId && (
        <div className="invite-notice">
          <span>🎮</span> You have an invite to room <strong>{inviteRoomId}</strong>
        </div>
      )}
    </div>
  );
}

// ===== Single Player Game (vs AI) =====
function SinglePlayerGame({ onBack }) {
  const [squares, setSquares] = useState(Array(9).fill(null));
  const [isPlayerTurn, setIsPlayerTurn] = useState(true);
  const [scores, setScores] = useState({ player: 0, ai: 0, draws: 0 });
  const [winnerInfo, setWinnerInfo] = useState(null);
  const [modalState, setModalState] = useState({ isOpen: false, type: null, data: null });

  // AI Move
  useEffect(() => {
    if (!isPlayerTurn && !winnerInfo) {
      const timer = setTimeout(() => {
        const newSquares = [...squares];
        const aiMove = getBestMove(newSquares);
        if (aiMove !== -1) {
          newSquares[aiMove] = 'O';
          setSquares(newSquares);

          const result = calculateWinner(newSquares);
          if (result) {
            setWinnerInfo(result);
            setScores(prev => ({ ...prev, ai: prev.ai + 1 }));
            setModalState({ isOpen: true, type: 'AI_WIN', data: null });
          } else if (newSquares.every(Boolean)) {
            setWinnerInfo({ winner: 'Draw', line: [] });
            setScores(prev => ({ ...prev, draws: prev.draws + 1 }));
            setModalState({ isOpen: true, type: 'DRAW', data: null });
          } else {
            setIsPlayerTurn(true);
          }
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isPlayerTurn, squares, winnerInfo]);

  function handlePlay(index) {
    if (squares[index] || winnerInfo || !isPlayerTurn) return;

    const newSquares = [...squares];
    newSquares[index] = 'X';
    setSquares(newSquares);

    const result = calculateWinner(newSquares);
    if (result) {
      setWinnerInfo(result);
      setScores(prev => ({ ...prev, player: prev.player + 1 }));
      setModalState({ isOpen: true, type: 'PLAYER_WIN', data: null });
    } else if (newSquares.every(Boolean)) {
      setWinnerInfo({ winner: 'Draw', line: [] });
      setScores(prev => ({ ...prev, draws: prev.draws + 1 }));
      setModalState({ isOpen: true, type: 'DRAW', data: null });
    } else {
      setIsPlayerTurn(false);
    }
  }

  function resetGame() {
    setSquares(Array(9).fill(null));
    setWinnerInfo(null);
    setIsPlayerTurn(true);
    setModalState({ isOpen: false, type: null, data: null });
  }

  const displayStatus = winnerInfo
    ? (winnerInfo.winner === 'Draw' ? "It's a Draw!" : `${winnerInfo.winner === 'X' ? 'You' : 'AI'} Won!`)
    : (isPlayerTurn ? "Your Turn (X)" : "AI Thinking...");

  return (
    <div className="game">
      <Modal
        isOpen={modalState.isOpen}
        title={
          modalState.type === 'PLAYER_WIN' ? '🎉 You Win!' :
            modalState.type === 'AI_WIN' ? '🤖 AI Wins!' :
              "🤝 It's a Draw!"
        }
        actionLabel="Play Again"
        onClose={resetGame}
      >
        <p>Score has been updated!</p>
      </Modal>

      <header className="game-header compact">
        <h1>
          <span className="title-x">Tic</span>
          <span className="title-tac">-Tac-</span>
          <span className="title-o">Toe</span>
        </h1>
        <div className="room-badge">vs Computer</div>
      </header>

      <main className="game-main">
        <div className="scoreboard">
          <div className="score-badge mine">
            <span className="p-name">You (X)</span>
            <span className="p-score">{scores.player}</span>
          </div>
          <div className="score-divider">vs</div>
          <div className="score-badge">
            <span className="p-score">{scores.ai}</span>
            <span className="p-name">AI (O)</span>
          </div>
          <div className="draws-badge">Draws: {scores.draws}</div>
        </div>

        <div className="status-bar">
          <h2>{displayStatus}</h2>
        </div>

        <div className="game-board">
          <Board
            squares={squares}
            onPlay={handlePlay}
            winningLine={winnerInfo?.line}
            disabled={!!winnerInfo || !isPlayerTurn}
          />
        </div>

        <button className="back-btn" onClick={onBack}>← Back to Menu</button>
      </main>
    </div>
  );
}

// ===== Multiplayer Scoreboard =====
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

// ===== Multiplayer Game =====
function MultiplayerGame({ onBack, inviteRoomId }) {
  const [room, setRoom] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [isInRoom, setIsInRoom] = useState(false);
  const [createdRoomId, setCreatedRoomId] = useState(null);
  const [copied, setCopied] = useState(false);

  // Game State
  const [playerSymbol, setPlayerSymbol] = useState(null);
  const [squares, setSquares] = useState(Array(9).fill(null));
  const [isXNext, setIsXNext] = useState(true);
  const [scores, setScores] = useState({ X: 0, O: 0, draws: 0 });
  const [players, setPlayers] = useState([]);

  // Modals & Toasts
  const [winnerInfo, setWinnerInfo] = useState(null);
  const [modalState, setModalState] = useState({ isOpen: false, type: null, data: null });
  const [toast, setToast] = useState(null);

  // Set room from invite link
  useEffect(() => {
    if (inviteRoomId) {
      setRoom(inviteRoomId);
    }
  }, [inviteRoomId]);

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
      // Clear URL params after joining
      window.history.replaceState({}, document.title, window.location.pathname);
    });

    socket.on('room_full', () => {
      alert("Room is full!");
    });

    socket.on('player_joined', (data) => {
      setPlayers(data.players);
      const newPlayer = data.players.find(p => p.id !== socket.id);
      if (newPlayer && data.players.length > 1) {
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

  function createRoom() {
    if (!playerName.trim()) {
      alert("Please enter your name");
      return;
    }
    const newRoomId = generateRoomId();
    setRoom(newRoomId);
    setCreatedRoomId(newRoomId);
  }

  function joinRoom() {
    if (room.trim() && playerName.trim()) {
      socket.emit('join_room', { roomId: room, playerName });
    } else {
      alert("Please enter both Name and Room ID");
    }
  }

  function copyInviteLink() {
    const link = getInviteLink(createdRoomId || room);
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
    setPlayers(prev => prev.filter(p => p.id === socket.id));
  }

  function leaveRoom() {
    window.location.href = window.location.pathname;
  }

  // Display Status
  let displayStatus = "Waiting for Opponent...";
  if (players.length === 2 && !winnerInfo) {
    const isMyTurn = (isXNext && playerSymbol === 'X') || (!isXNext && playerSymbol === 'O');
    displayStatus = isMyTurn ? "Your Turn" : `Waiting for ${isXNext ? 'X' : 'O'}...`;
  }

  // Lobby view
  if (!isInRoom) {
    return (
      <div className="game lobby">
        <header className="game-header">
          <h1>
            <span className="title-x">Tic</span>
            <span className="title-tac">-Tac-</span>
            <span className="title-o">Toe</span>
          </h1>
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

          {!createdRoomId ? (
            <>
              <button onClick={createRoom} className="join-btn create-btn">
                🎮 Create Room
              </button>

              <div className="divider">
                <span>or join existing room</span>
              </div>

              <input
                type="text"
                placeholder="Room ID"
                value={room}
                onChange={(e) => setRoom(e.target.value.toUpperCase())}
                className="room-input"
              />
              <button onClick={joinRoom} className="join-btn">Join Room</button>
            </>
          ) : (
            <>
              <div className="room-created">
                <h3>Room Created!</h3>
                <div className="room-id-display">{createdRoomId}</div>
                <p>Share this link with your friend:</p>
                <div className="invite-link-box">
                  <input
                    type="text"
                    value={getInviteLink(createdRoomId)}
                    readOnly
                    className="invite-link-input"
                  />
                  <button onClick={copyInviteLink} className={`copy-btn ${copied ? 'copied' : ''}`}>
                    {copied ? '✓ Copied!' : '📋 Copy'}
                  </button>
                </div>
                <button onClick={joinRoom} className="join-btn">
                  ▶ Start Waiting for Player
                </button>
              </div>
            </>
          )}

          <button className="back-btn" onClick={onBack}>← Back to Menu</button>
        </div>
      </div>
    );
  }

  // Game view
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

// ===== Main App =====
function App() {
  const [gameMode, setGameMode] = useState(null);
  const [inviteRoomId, setInviteRoomId] = useState(null);

  useEffect(() => {
    const roomFromUrl = getRoomIdFromUrl();
    if (roomFromUrl) {
      setInviteRoomId(roomFromUrl);
      setGameMode('multi');
    }
  }, []);

  function handleSelectMode(mode) {
    setGameMode(mode);
  }

  function handleBack() {
    setGameMode(null);
    setInviteRoomId(null);
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  if (gameMode === 'single') {
    return <SinglePlayerGame onBack={handleBack} />;
  }

  if (gameMode === 'multi') {
    return <MultiplayerGame onBack={handleBack} inviteRoomId={inviteRoomId} />;
  }

  return <LandingScreen onSelectMode={handleSelectMode} inviteRoomId={inviteRoomId} />;
}

export default App;
