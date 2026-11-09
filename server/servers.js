const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, '../public')));
app.use(express.json());

let perguntas = [];

// ===== API REST =====
app.get('/api/perguntas', (req, res) => res.json(perguntas));

app.post('/api/perguntas', (req, res) => {
  const { numero, pergunta, resposta, vibracoes } = req.body;
  const nova = {
    id: Date.now(),
    numero: numero || (perguntas.length + 1),
    pergunta,
    resposta,
    vibracoes: vibracoes || 1
  };
  perguntas.push(nova);
  res.json(nova);
});

app.put('/api/perguntas/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const idx = perguntas.findIndex(p => p.id === id);
  if (idx !== -1) {
    perguntas[idx] = { ...perguntas[idx], ...req.body };
    res.json(perguntas[idx]);
  } else res.status(404).json({ error: 'Nao encontrada' });
});

app.delete('/api/perguntas/:id', (req, res) => {
  perguntas = perguntas.filter(p => p.id !== parseInt(req.params.id));
  res.json({ success: true });
});

app.delete('/api/perguntas', (req, res) => {
  perguntas = [];
  res.json({ success: true });
});

// ===== SOCKET.IO =====
io.on('connection', (socket) => {
  console.log('Conectado:', socket.id);
  socket.emit('perguntas-atualizadas', perguntas);

  // Cliente envia numero da pergunta + operador de confirmacao
  socket.on('consultar-pergunta', (data) => {
    const { numeroPergunta, operador } = data;
    const pergunta = perguntas.find(p => p.numero === parseInt(numeroPergunta));

    if (pergunta) {
      // Responde apenas com vibracoes (sem revelar a resposta no envio)
      socket.emit('resposta-consulta', {
        sucesso: true,
        vibracoes: pergunta.vibracoes,
        numero: pergunta.numero,
        operador: operador
      });

      // Envia vibracao para TODOS os outros (exceto quem perguntou)
      socket.broadcast.emit('vibrar', {
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
  });

  socket.on('perguntas-atualizadas', (novas) => {
    perguntas = novas;
    socket.broadcast.emit('perguntas-atualizadas', perguntas);
  });

  socket.on('disconnect', () => console.log('Desconectado:', socket.id));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor na porta ${PORT}`);
});
