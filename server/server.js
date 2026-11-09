// Importa o framework Express
const express = require('express');

// Importa o módulo HTTP do Node.js
const http = require('http');

// Importa o Socket.IO para comunicação em tempo real
const { Server } = require('socket.io');

// Importa módulo para trabalhar com caminhos de arquivos
const path = require('path');

// Importa o SQLite3
const sqlite3 = require('sqlite3').verbose();


// Cria a aplicação Express
const app = express();

// Cria o servidor HTTP usando o Express
const server = http.createServer(app);

// Inicializa o Socket.IO permitindo qualquer origem
const io = new Server(server, {
    cors: {
        origin: "*"
    }
});


// ==========================================
// BANCO SQLITE
// ==========================================

// Abre (ou cria) o banco chamado banco.db
const db = new sqlite3.Database('./banco.db');


// Compartilha a pasta public
app.use(express.static(path.join(__dirname, '../public')));

// Permite receber JSON nas requisições
app.use(express.json());



// Lista todas as perguntas
app.get('/api/perguntas', (req, res) => {

    db.all(

        "SELECT * FROM perguntas ORDER BY numero",

        [],

        (err, rows) => {

            if (err) {

                return res.status(500).json(err);

            }

            res.json(rows);

        }

    );

});




// Salva uma pergunta
app.post('/api/perguntas', (req, res) => {

    // Recebe os dados enviados
    const { numero, pergunta, resposta, vibracoes } = req.body;

    // Executa INSERT
    db.run(

        `INSERT INTO perguntas
        (numero, pergunta, resposta, vibracoes)
        VALUES (?, ?, ?, ?)`,

        [

            numero,

            pergunta,

            resposta,

            vibracoes || 1

        ],

        function (err) {

            if (err) {

                return res.status(500).json(err);

            }

            // Retorna o registro salvo
            res.json({

                id: this.lastID,

                numero,

                pergunta,

                resposta,

                vibracoes: vibracoes || 1

            });

        }

    );

});




// Atualiza uma pergunta
app.put('/api/perguntas/:id', (req, res) => {

    const id = parseInt(req.params.id);

    const {

        numero,

        pergunta,

        resposta,

        vibracoes

    } = req.body;

    db.run(

        `
        UPDATE perguntas
        SET
            numero=?,
            pergunta=?,
            resposta=?,
            vibracoes=?
        WHERE id=?
        `,

        [

            numero,

            pergunta,

            resposta,

            vibracoes,

            id

        ],

        function (err) {

            if (err) {

                return res.status(500).json(err);

            }

            if (this.changes == 0) {

                return res.status(404).json({

                    error: "Nao encontrada"

                });

            }

            res.json({

                id,

                numero,

                pergunta,

                resposta,

                vibracoes

            });

        }

    );

});




// Remove uma pergunta
app.delete('/api/perguntas/:id', (req, res) => {

    const id = parseInt(req.params.id);

    db.run(

        "DELETE FROM perguntas WHERE id=?",

        [id],

        function (err) {

            if (err) {

                return res.status(500).json(err);

            }

            res.json({

                success: true

            });

        }

    );

});




// Remove todas as perguntas
app.delete('/api/perguntas', (req, res) => {

    db.run(

        "DELETE FROM perguntas",

        [],

        function (err) {

            if (err) {

                return res.status(500).json(err);

            }

            res.json({

                success: true

            });

        }

    );

});



// ==========================================
// SOCKET.IO
// ==========================================

io.on('connection', (socket) => {

    // Mostra no console quem conectou
    console.log("Conectado:", socket.id);

    // Carrega todas as perguntas do banco
    db.all(

        "SELECT * FROM perguntas ORDER BY numero",

        [],

        (err, rows) => {

            socket.emit(

                "perguntas-atualizadas",

                rows

            );

        }

    );


    // Quando um cliente consulta uma pergunta
    socket.on('consultar-pergunta', (data) => {

        // Recebe número da pergunta e operador
        const {

            numeroPergunta,

            operador

        } = data;
        // Procura a pergunta no banco
        db.get(

            "SELECT * FROM perguntas WHERE numero=?",

            [

                parseInt(numeroPergunta)

            ],

            (err, pergunta) => {

                if (pergunta) {

                    // Retorna somente vibrações
                    socket.emit(

                        'resposta-consulta',

                        {

                            sucesso: true,

                            vibracoes: pergunta.vibracoes,

                            numero: pergunta.numero,

                            operador

                        }

                    );

                    // Faz vibrar todos os outros clientes exeto quem enviou 
                    // socket.broadcast.emit(

                    //     'vibrar',

                    //     {

                    //         vibracoes: pergunta.vibracoes,

                    //         numero: pergunta.numero,

                    //         de: socket.id

                    //     }

                    // );
                    io.emit(

                        'vibrar',

                        {

                            vibracoes: pergunta.vibracoes,

                            numero: pergunta.numero,

                            de: socket.id

                        }

                    );

                }

                else {

                    socket.emit(

                        'resposta-consulta',

                        {

                            sucesso: false,

                            mensagem: 'Pergunta nao encontrada'

                        }

                    );

                }

            }

        );

    });


    // Atualiza todas as perguntas
    socket.on('perguntas-atualizadas', () => {

        db.all(

            "SELECT * FROM perguntas ORDER BY numero",

            [],

            (err, rows) => {

                socket.broadcast.emit(

                    "perguntas-atualizadas",

                    rows

                );

            }

        );

    });


    // Quando um cliente desconecta
    socket.on(

        'disconnect',

        () => {

            console.log(

                "Desconectado:",

                socket.id

            );

        }

    );

});



// Define a porta do servidor
const PORT = process.env.PORT || 3000;


// Inicia o servidor
server.listen(PORT, () => {

    console.log(

        `Servidor na porta ${PORT}`

    );

});