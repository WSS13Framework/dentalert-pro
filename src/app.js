const express = require('express');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 8080;

// Middlewares
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Rota principal - TESTE BÁSICO
app.get('/', (req, res) => {
    res.json({
        message: "🦷 Bem-vindo ao DentAlert Pro API!",
        status: "online",
        timestamp: new Date().toISOString(),
        version: "1.0.0"
    });
});

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: "healthy",
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        timestamp: new Date().toISOString()
    });
});

// TESTE: Conexão com banco (com try/catch para evitar crash)
let db = null;
try {
    db = require('./database/setup');
    console.log('✅ Database setup carregado com sucesso');
} catch (error) {
    console.log('❌ Erro ao carregar database setup:', error.message);
}

// Rota para testar banco
app.get('/test-db', (req, res) => {
    if (!db) {
        return res.status(500).json({ 
            error: "Banco de dados não conectado",
            message: "Verifique o arquivo ./database/setup.js"
        });
    }
    
    try {
        db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='pacientes';", (err, row) => {
            if (err) {
                res.status(500).json({ 
                    error: "Erro no banco", 
                    details: err.message 
                });
            } else {
                res.json({
                    message: "✅ Banco de dados funcionando!",
                    table_exists: !!row,
                    table_name: row ? row.name : "Tabela 'pacientes' não existe ainda"
                });
            }
        });
    } catch (error) {
        res.status(500).json({
            error: "Erro ao executar query",
            details: error.message
        });
    }
});

// TESTE: Carregar rotas de pacientes (com try/catch)
try {
    const pacientesRoutes = require('./routes/pacientes');
    app.use('/api/pacientes', pacientesRoutes);
    console.log('✅ Rotas de pacientes carregadas');
} catch (error) {
    console.log('❌ Erro ao carregar rotas de pacientes:', error.message);
}

// Rota para listar arquivos (debug)
app.get('/debug', (req, res) => {
    const fs = require('fs');
    const path = require('path');
    
    try {
        const srcFiles = fs.readdirSync('./');
        const hasDatabase = fs.existsSync('./database');
        const hasRoutes = fs.existsSync('./routes');
        
        res.json({
            message: "Debug - Estrutura de arquivos",
            current_directory: process.cwd(),
            files_in_root: srcFiles,
            has_database_folder: hasDatabase,
            has_routes_folder: hasRoutes,
            database_files: hasDatabase ? fs.readdirSync('./database') : "Pasta não existe",
            routes_files: hasRoutes ? fs.readdirSync('./routes') : "Pasta não existe"
        });
    } catch (error) {
        res.status(500).json({
            error: "Erro ao listar arquivos",
            details: error.message
        });
    }
});

// Middleware para rotas não encontradas
app.use('*', (req, res) => {
    res.status(404).json({
        error: "Rota não encontrada",
        path: req.originalUrl,
        method: req.method
    });
});

// Inicia o servidor
app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
    console.log('📊 Conectado ao banco de dados DentAlert Pro.');
});

module.exports = app;