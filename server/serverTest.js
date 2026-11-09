require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { createClient } = require('@libsql/client');

// Inicializa o cliente do Turso
const db = createClient({
    url: process.env.TURSO_DATABASE_URL || "libsql://basequestion-seven77.aws-sa-east-1.turso.io",
    authToken: process.env.TURSO_AUTH_TOKEN || "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3OTQxNTg2MjcsImlkIjoiMDFhMWJjMmUtZTAwMS03NmRlLWJhZjEtZTZhYWQxNjJlYjNhIiwia2lkIjoiUUw4R1hzUXJMU2M5TS14aW5ETmQ5RWhfZVlKcHhfM3gzdnBnOUkzcnJ3OCIsInJpZCI6ImY0MTA1NGJiLTc5MDctNDQ0OC05M2I1LTgzYWM0NzA4YmZlYiJ9.4Yn1kZDJ0AstyRDJauV9AbLpoxLi8S0mlg7YOqIZJmAFxtco5e1aR2DUteX809eLsCeL_qIv6kKSj11xw-DVCw"
});

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*"
    }
});

// ==========================================
// INICIALIZAÇÃO DA TABELA NO TURSO
// ==========================================
async function inicializarBanco() {
    try {
        await db.execute(`
            CREATE TABLE IF NOT EXISTS perguntas (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                numero INTEGER,
                pergunta TEXT,
                resposta TEXT,
                vibracoes INTEGER DEFAULT 1
            )
        `);
        console.log("Tabela 'perguntas' verificada/criada no Turso.");
    } catch (err) {
        console.error("Erro ao inicializar banco:", err);
    }
}

inicializarBanco();

// ==========================================
// MIDDLEWARES
// ==========================================
app.use(express.static(path.join(__dirname, '../public')));
app.use(express.json());

// ==========================================
// ROTAS DA API
// ==========================================

// Lista todas as perguntas
app.get('/api/perguntas', async (req, res) => {
    try {
        const result = await db.execute("SELECT * FROM perguntas ORDER BY numero");
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Salva uma pergunta
app.post('/api/perguntas', async (req, res) => {
    const { numero, pergunta, resposta, vibracoes } = req.body;
    const vib = vibracoes || 1;

    try {
        const result = await db.execute({
            sql: `INSERT INTO perguntas (numero, pergunta, resposta, vibracoes) VALUES (?, ?, ?, ?)`,
            args: [numero, pergunta, resposta, vib]
        });

        res.json({
            id: Number(result.lastInsertRowid),
            numero,
            pergunta,
            resposta,
            vibracoes: vib
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Atualiza uma pergunta
app.put('/api/perguntas/:id', async (req, res) => {
    const id = parseInt(req.params.id);
    const { numero, pergunta, resposta, vibracoes } = req.body;

    try {
        const result = await db.execute({
            sql: `
                UPDATE perguntas
                SET numero = ?, pergunta = ?, resposta = ?, vibracoes = ?
                WHERE id = ?
            `,
            args: [numero, pergunta, resposta, vibracoes, id]
        });

        if (result.rowsAffected === 0) {
            return res.status(404).json({ error: "Nao encontrada" });
        }

        res.json({
            id,
            numero,
            pergunta,
            resposta,
            vibracoes
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Remove uma pergunta
app.delete('/api/perguntas/:id', async (req, res) => {
    const id = parseInt(req.params.id);

    try {
        await db.execute({
            sql: "DELETE FROM perguntas WHERE id = ?",
            args: [id]
        });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Remove todas as perguntas
app.delete('/api/perguntas', async (req, res) => {
    try {
        await db.execute("DELETE FROM perguntas");
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// SOCKET.IO
// ==========================================
io.on('connection', async (socket) => {
    console.log("Conectado:", socket.id);

    // Carrega todas as perguntas do banco ao conectar
    try {
        const result = await db.execute("SELECT * FROM perguntas ORDER BY numero");
        socket.emit("perguntas-atualizadas", result.rows);
    } catch (err) {
        console.error("Erro ao carregar perguntas no connect:", err);
    }

    // Quando um cliente consulta uma pergunta
    socket.on('consultar-pergunta', async (data) => {
        const { numeroPergunta, operador } = data;

        try {
            const result = await db.execute({
                sql: "SELECT * FROM perguntas WHERE numero = ?",
                args: [parseInt(numeroPergunta)]
            });

            const pergunta = result.rows[0];

            if (pergunta) {
                socket.emit('resposta-consulta', {
                    sucesso: true,
                    vibracoes: pergunta.vibracoes,
                    numero: pergunta.numero,
                    operador
                });

                io.emit('vibrar', {
                    vibracoes: pergunta.vibracoes,
                    numero: pergunta.numero,
                    de: socket.id
                });
            } else {
                socket.emit('resposta-consulta', {
                    sucesso: false,
                    mensagem: 'Pergunta nao encontrada'
                });
            }
        } catch (err) {
            console.error("Erro ao consultar pergunta:", err);
            socket.emit('resposta-consulta', {
                sucesso: false,
                mensagem: 'Erro interno no servidor'
            });
        }
    });

    // Atualiza todas as perguntas
    socket.on('perguntas-atualizadas', async () => {
        try {
            const result = await db.execute("SELECT * FROM perguntas ORDER BY numero");
            socket.broadcast.emit("perguntas-atualizadas", result.rows);
        } catch (err) {
            console.error("Erro ao atualizar perguntas via socket:", err);
        }
    });

    // Quando um cliente desconecta
    socket.on('disconnect', () => {
        console.log("Desconectado:", socket.id);
    });
});

// Define a porta do servidor
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log(`Servidor na porta ${PORT}`);
});
