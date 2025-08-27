const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Define o caminho para o arquivo do banco de dados SQLite.
// O banco de dados será criado na raiz do projeto (dentalert-pro)
const dbPath = path.resolve(__dirname, '..', 'dentalert_pro.db');

// Cria uma nova instância do banco de dados.
// 'sqlite3.Database' é o construtor para criar a conexão.
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Erro ao conectar ao banco de dados:', err.message);
    } else {
        console.log('Conectado ao banco de dados SQLite.');
        // Cria a tabela 'pacientes' se ela não existir
        db.run(`
            CREATE TABLE IF NOT EXISTS pacientes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nome TEXT NOT NULL,
                telefone TEXT NOT NULL UNIQUE,
                email TEXT,
                observacoes TEXT,
                data_criacao DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `, (err) => {
            if (err) {
                console.error('Erro ao criar tabela pacientes:', err.message);
            } else {
                console.log('Tabela pacientes verificada/criada.');
            }
        });
    }
});

// Exporta a instância do banco de dados para que possa ser utilizada em outros módulos.
module.exports = db;
