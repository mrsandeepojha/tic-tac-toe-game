import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
app.use(cors());

const server = createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Helper to calculate winner
function calculateWinner(squares) {
    const lines = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8],
        [0, 3, 6], [1, 4, 7], [2, 5, 8],
        [0, 4, 8], [2, 4, 6],
    ];
    for (let i = 0; i < lines.length; i++) {
        const [a, b, c] = lines[i];
        if (squares[a] && squares[a] === squares[b] && squares[a] === squares[c]) {
            return squares[a];
        }
    }
    return null;
}

// Store room state
const rooms = new Map();

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    socket.on('join_room', ({ roomId, playerName }) => {
        // If room doesn't exist, create it
        if (!rooms.has(roomId)) {
            rooms.set(roomId, {
                players: [],
                board: Array(9).fill(null),
                isXNext: true,
                scores: { X: 0, O: 0, draws: 0 }
            });
        }

        const room = rooms.get(roomId);

        // Limit to 2 players
        if (room.players.length >= 2) {
            socket.emit('room_full');
            return;
        }

        // Assign symbol
        const symbol = room.players.length === 0 ? 'X' : 'O';
        const player = { id: socket.id, symbol, name: playerName || `Player ${symbol}` };
        room.players.push(player);

        socket.join(roomId);

        // Notify player of their symbol and current game state
        socket.emit('game_joined', {
            symbol,
            board: room.board,
            isXNext: room.isXNext,
            scores: room.scores,
            players: room.players
        });

        // Notify others in room
        io.to(roomId).emit('player_joined', { players: room.players });

        console.log(`User ${player.name} (${socket.id}) joined room ${roomId} as ${symbol}`);
    });

    socket.on('make_move', ({ roomId, index, symbol }) => {
        const room = rooms.get(roomId);

        if (!room) return;

        // Validate turn
        const isXTurn = room.isXNext;
        if ((symbol === 'X' && !isXTurn) || (symbol === 'O' && isXTurn)) {
            return; // Not your turn
        }

        // Update board
        if (!room.board[index]) {
            room.board[index] = symbol;

            // Check for winner locally on server to update score
            const winner = calculateWinner(room.board);
            const isDraw = !winner && room.board.every(Boolean);

            if (winner) {
                room.scores[winner]++;
            } else if (isDraw) {
                room.scores.draws++;
            }

            if (!winner && !isDraw) {
                room.isXNext = !room.isXNext;
            }

            // Broadcast update
            io.to(roomId).emit('game_update', {
                board: room.board,
                isXNext: room.isXNext,
                scores: room.scores,
                players: room.players,
                winner, // Send winner status explicitly
                isDraw
            });
        }
    });

    socket.on('reset_game', (roomId) => {
        const room = rooms.get(roomId);
        if (room) {
            room.board = Array(9).fill(null);
            room.isXNext = true;
            // Do NOT reset scores
            io.to(roomId).emit('game_update', {
                board: room.board,
                isXNext: room.isXNext, // logic reset
                scores: room.scores,
                players: room.players,
                winner: null,
                isDraw: false
            });
        }
    });

    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        // Clean up rooms
        for (const [roomId, room] of rooms.entries()) {
            const playerIndex = room.players.findIndex(p => p.id === socket.id);
            if (playerIndex !== -1) {
                const leftPlayer = room.players[playerIndex];
                room.players.splice(playerIndex, 1);
                io.to(roomId).emit('player_left', { name: leftPlayer.name });

                if (room.players.length === 0) {
                    rooms.delete(roomId);
                }
                break;
            }
        }
    });
});

// Handle React routing, return all requests to React app
app.use((req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});
