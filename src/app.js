const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 8080;

// Middlewares
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

console.log('🚀 Iniciando DentAlert Pro...');
console.log('📁 Diretório atual:', process.cwd());

// Rota principal 
app.get('/', (req, res) => {
    res.json({
        message: "🦷 DentAlert Pro API está funcionando!",
        status: "online",
        timestamp: new Date().toISOString(),
        version: "1.0.0",
        port: PORT
    });
});

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: "healthy",
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        timestamp: new Date().toISOString(),
        nodejs_version: process.version
    });
});

// Debug - verificar estrutura
app.get('/debug', (req, res) => {
    try {
        const currentDir = process.cwd();
        const srcDir = path.join(currentDir, 'src');
        
        // Listar arquivos no diretório atual
        let rootFiles = [];
        try {
            rootFiles = fs.readdirSync(currentDir);
        } catch (e) {
            rootFiles = ['Erro ao ler diretório root'];
        }

        // Verificar se existe pasta src
        let srcFiles = [];
        if (fs.existsSync(srcDir)) {
            try {
                srcFiles = fs.readdirSync(srcDir);
            } catch (e) {
                srcFiles = ['Erro ao ler pasta src'];
            }
        }

        res.json({
            message: "🔍 Debug - Estrutura de arquivos",
            current_directory: currentDir,
            root_files: rootFiles,
            src_exists: fs.existsSync(srcDir),
            src_files: srcFiles,
            has_database_folder: fs.existsSync(path.join(currentDir, 'database')),
            has_routes_folder: fs.existsSync(path.join(currentDir, 'routes')),
            has_src_database: fs.existsSync(path.join(srcDir, 'database')),
            has_src_routes: fs.existsSync(path.join(srcDir, 'routes'))
        });
    } catch (error) {
        res.status(500).json({
            error: "Erro no debug",
            details: error.message,
            stack: error.stack
        });
    }
});

// Rota de teste básica para pacientes (sem banco ainda)
app.get('/api/pacientes', (req, res) => {
    res.json({
        message: "📋 Endpoint de pacientes funcionando!",
        pacientes: [
            { id: 1, nome: "Teste Paciente", telefone: "11999999999" }
        ],
        total: 1,
        note: "Dados de teste - banco será conectado em breve"
    });
});

// Rota para teste de POST
app.post('/api/pacientes', (req, res) => {
    res.json({
        message: "✅ POST recebido com sucesso!",
        dados_recebidos: req.body,
        timestamp: new Date().toISOString()
    });
});

// Middleware para 404
app.use('*', (req, res) => {
    res.status(404).json({
        error: "❌ Rota não encontrada",
        path: req.originalUrl,
        method: req.method,
        available_routes: [
            "GET /",
            "GET /health", 
            "GET /debug",
            "GET /api/pacientes",
            "POST /api/pacientes"
        ]
    });
});

// Error handler
app.use((error, req, res, next) => {
    console.error('❌ Erro na aplicação:', error);
    res.status(500).json({
        error: "Erro interno do servidor",
        message: error.message
    });
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`✅ Servidor rodando na porta ${PORT}`);
    console.log(`🌐 URL: https://dentalert-pro-wbywi.ondigitalocean.app/`);
    console.log('🦷 DentAlert Pro API iniciado com sucesso!');
});

module.exports = app;// Force rebuild qua 27 ago 2025 10:08:00 -03
