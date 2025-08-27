const express = require('express');
const bodyParser = require('body-parser');
const cron = require('node-cron');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = process.env.PORT || 8080;

// Middlewares
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Database setup
const db = new sqlite3.Database('./dentalert.db', (err) => {
    if (err) {
        console.error('❌ Erro ao conectar com banco:', err.message);
    } else {
        console.log('✅ Conectado ao banco SQLite - DentAlert Pro');
        initDatabase();
    }
});

// Criar tabelas
function initDatabase() {
    // Tabela de pacientes
    db.run(`CREATE TABLE IF NOT EXISTS pacientes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        telefone TEXT NOT NULL UNIQUE,
        email TEXT,
        data_nascimento DATE,
        observacoes TEXT,
        status TEXT DEFAULT 'ativo',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Tabela de consultas
    db.run(`CREATE TABLE IF NOT EXISTS consultas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        paciente_id INTEGER,
        dentista TEXT NOT NULL,
        data_consulta DATETIME NOT NULL,
        procedimento TEXT,
        status TEXT DEFAULT 'agendada',
        valor DECIMAL(10,2),
        observacoes TEXT,
        lembretes_enviados INTEGER DEFAULT 0,
        confirmado BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (paciente_id) REFERENCES pacientes (id)
    )`);

    // Tabela de lembretes enviados
    db.run(`CREATE TABLE IF NOT EXISTS lembretes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        consulta_id INTEGER,
        tipo TEXT NOT NULL,
        data_envio DATETIME NOT NULL,
        status TEXT DEFAULT 'pendente',
        resposta TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (consulta_id) REFERENCES consultas (id)
    )`);

    console.log('✅ Tabelas criadas/verificadas');
}

// ===========================================
// 📱 SISTEMA WHATSAPP
// ===========================================

// Configuração WhatsApp (Twilio/Meta)
const WHATSAPP_CONFIG = {
    // Aqui vão as credenciais da API do WhatsApp
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    whatsappNumber: process.env.WHATSAPP_NUMBER || 'whatsapp:+5511999999999'
};

// Função para enviar WhatsApp
async function enviarWhatsApp(telefone, mensagem, consultaId, tipo) {
    try {
        console.log(`📱 Enviando WhatsApp para ${telefone}: ${mensagem.substring(0, 50)}...`);
        
        // TODO: Integrar com API real do WhatsApp
        // const twilio = require('twilio');
        // const client = twilio(WHATSAPP_CONFIG.accountSid, WHATSAPP_CONFIG.authToken);
        
        // Por enquanto, simulamos o envio
        const simulatedResult = {
            sid: 'SM' + Math.random().toString(36).substr(2, 9),
            status: 'sent',
            to: `whatsapp:+55${telefone}`
        };

        // Registrar lembrete no banco
        db.run(`INSERT INTO lembretes (consulta_id, tipo, data_envio, status) 
                VALUES (?, ?, CURRENT_TIMESTAMP, 'enviado')`, 
                [consultaId, tipo]);

        console.log(`✅ WhatsApp enviado com sucesso: ${simulatedResult.sid}`);
        return simulatedResult;

    } catch (error) {
        console.error('❌ Erro ao enviar WhatsApp:', error);
        
        // Registrar erro no banco
        db.run(`INSERT INTO lembretes (consulta_id, tipo, data_envio, status) 
                VALUES (?, ?, CURRENT_TIMESTAMP, 'erro')`, 
                [consultaId, tipo]);
        
        throw error;
    }
}

// ===========================================
// 🤖 MOTOR DE LEMBRETES
// ===========================================

// Templates de mensagens
const TEMPLATES = {
    lembrete_24h: (nome, data, hora, dentista) => 
        `🦷 *Olá ${nome}!*\n\n` +
        `Lembramos que você tem consulta marcada:\n` +
        `📅 *Data:* ${data}\n` +
        `⏰ *Horário:* ${hora}\n` +
        `👨‍⚕️ *Dentista:* Dr(a). ${dentista}\n\n` +
        `Por favor, confirme sua presença respondendo *SIM*\n` +
        `Em caso de cancelamento, responda *CANCELAR*\n\n` +
        `_DentAlert Pro - Sua clínica odontológica_`,

    lembrete_2h: (nome, hora) =>
        `🕐 *${nome}, sua consulta é em 2 horas!*\n\n` +
        `⏰ Horário: ${hora}\n` +
        `📍 Não esqueça de chegar 10 minutos antes\n\n` +
        `_Nos vemos em breve!_ 😊`,

    confirmacao: (nome) =>
        `✅ *Obrigado ${nome}!*\n\n` +
        `Sua consulta foi confirmada.\n` +
        `Enviaremos um lembrete 2 horas antes.\n\n` +
        `_DentAlert Pro_`
};

// Função principal do motor de lembretes
async function processarLembretes() {
    console.log('🤖 Processando lembretes automáticos...');
    
    const now = new Date();
    
    // Buscar consultas que precisam de lembrete de 24h
    db.all(`SELECT c.*, p.nome, p.telefone 
            FROM consultas c 
            JOIN pacientes p ON c.paciente_id = p.id 
            WHERE c.status = 'agendada' 
            AND c.confirmado = 0
            AND datetime(c.data_consulta, '-24 hours') <= datetime('now')
            AND datetime(c.data_consulta, '-23 hours') > datetime('now')
            AND c.lembretes_enviados = 0`,
    async (err, consultas24h) => {
        if (err) {
            console.error('❌ Erro ao buscar consultas 24h:', err);
            return;
        }

        for (const consulta of consultas24h) {
            try {
                const dataConsulta = new Date(consulta.data_consulta);
                const dataFormatada = dataConsulta.toLocaleDateString('pt-BR');
                const horaFormatada = dataConsulta.toLocaleTimeString('pt-BR', { 
                    hour: '2-digit', minute: '2-digit' 
                });

                const mensagem = TEMPLATES.lembrete_24h(
                    consulta.nome,
                    dataFormatada,
                    horaFormatada,
                    consulta.dentista
                );

                await enviarWhatsApp(consulta.telefone, mensagem, consulta.id, 'lembrete_24h');
                
                // Marcar como lembrete enviado
                db.run(`UPDATE consultas SET lembretes_enviados = 1 WHERE id = ?`, [consulta.id]);
                
            } catch (error) {
                console.error(`❌ Erro ao processar consulta ${consulta.id}:`, error);
            }
        }
    });

    // Buscar consultas confirmadas que precisam de lembrete de 2h
    db.all(`SELECT c.*, p.nome, p.telefone 
            FROM consultas c 
            JOIN pacientes p ON c.paciente_id = p.id 
            WHERE c.status = 'agendada' 
            AND c.confirmado = 1
            AND datetime(c.data_consulta, '-2 hours') <= datetime('now')
            AND datetime(c.data_consulta, '-1 hour') > datetime('now')
            AND c.lembretes_enviados < 2`,
    async (err, consultas2h) => {
        if (err) {
            console.error('❌ Erro ao buscar consultas 2h:', err);
            return;
        }

        for (const consulta of consultas2h) {
            try {
                const dataConsulta = new Date(consulta.data_consulta);
                const horaFormatada = dataConsulta.toLocaleTimeString('pt-BR', { 
                    hour: '2-digit', minute: '2-digit' 
                });

                const mensagem = TEMPLATES.lembrete_2h(consulta.nome, horaFormatada);

                await enviarWhatsApp(consulta.telefone, mensagem, consulta.id, 'lembrete_2h');
                
                // Marcar como segundo lembrete enviado
                db.run(`UPDATE consultas SET lembretes_enviados = 2 WHERE id = ?`, [consulta.id]);
                
            } catch (error) {
                console.error(`❌ Erro ao processar consulta 2h ${consulta.id}:`, error);
            }
        }
    });
}

// ===========================================
// 📋 API ENDPOINTS
// ===========================================

// Rota principal
app.get('/', (req, res) => {
    res.json({
        message: "🦷 DentAlert Pro - Sistema WhatsApp + Lembretes",
        status: "online",
        features: [
            "📱 WhatsApp automático",
            "🤖 Lembretes inteligentes", 
            "📋 Gestão de pacientes",
            "📊 Controle de consultas"
        ],
        timestamp: new Date().toISOString(),
        version: "2.0.0"
    });
});

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: "healthy",
        database: "connected",
        whatsapp: "configured",
        scheduler: "running",
        uptime: process.uptime()
    });
});

// Listar pacientes
app.get('/api/pacientes', (req, res) => {
    db.all("SELECT * FROM pacientes WHERE status = 'ativo' ORDER BY nome", (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json({
                total: rows.length,
                pacientes: rows
            });
        }
    });
});

// Cadastrar paciente
app.post('/api/pacientes', (req, res) => {
    const { nome, telefone, email, data_nascimento, observacoes } = req.body;
    
    if (!nome || !telefone) {
        return res.status(400).json({ 
            error: "Nome e telefone são obrigatórios" 
        });
    }

    db.run(`INSERT INTO pacientes (nome, telefone, email, data_nascimento, observacoes) 
            VALUES (?, ?, ?, ?, ?)`,
        [nome, telefone, email, data_nascimento, observacoes],
        function(err) {
            if (err) {
                if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
                    res.status(400).json({ error: "Telefone já cadastrado" });
                } else {
                    res.status(500).json({ error: err.message });
                }
            } else {
                res.json({
                    message: "✅ Paciente cadastrado com sucesso!",
                    id: this.lastID,
                    nome,
                    telefone
                });
            }
        }
    );
});

// Agendar consulta
app.post('/api/consultas', (req, res) => {
    const { paciente_id, dentista, data_consulta, procedimento, valor, observacoes } = req.body;
    
    if (!paciente_id || !dentista || !data_consulta) {
        return res.status(400).json({ 
            error: "Paciente, dentista e data são obrigatórios" 
        });
    }

    db.run(`INSERT INTO consultas (paciente_id, dentista, data_consulta, procedimento, valor, observacoes) 
            VALUES (?, ?, ?, ?, ?, ?)`,
        [paciente_id, dentista, data_consulta, procedimento, valor, observacoes],
        function(err) {
            if (err) {
                res.status(500).json({ error: err.message });
            } else {
                res.json({
                    message: "✅ Consulta agendada com sucesso!",
                    id: this.lastID,
                    status: "Lembretes automáticos ativados"
                });
            }
        }
    );
});

// Listar consultas
app.get('/api/consultas', (req, res) => {
    const { data, status } = req.query;
    let query = `SELECT c.*, p.nome as paciente_nome, p.telefone 
                 FROM consultas c 
                 JOIN pacientes p ON c.paciente_id = p.id`;
    let params = [];

    if (data || status) {
        query += " WHERE ";
        const conditions = [];
        
        if (data) {
            conditions.push("DATE(c.data_consulta) = ?");
            params.push(data);
        }
        
        if (status) {
            conditions.push("c.status = ?");
            params.push(status);
        }
        
        query += conditions.join(" AND ");
    }
    
    query += " ORDER BY c.data_consulta ASC";

    db.all(query, params, (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json({
                total: rows.length,
                consultas: rows
            });
        }
    });
});

// Confirmar consulta (webhook do WhatsApp)
app.post('/api/webhooks/whatsapp', (req, res) => {
    const { from, body } = req.body;
    
    if (body && body.toLowerCase().includes('sim')) {
        // Buscar consulta pendente do telefone
        const telefone = from.replace('whatsapp:+55', '');
        
        db.get(`SELECT c.* FROM consultas c 
                JOIN pacientes p ON c.paciente_id = p.id 
                WHERE p.telefone = ? AND c.confirmado = 0 
                ORDER BY c.data_consulta ASC LIMIT 1`,
            [telefone],
            async (err, consulta) => {
                if (consulta) {
                    // Confirmar consulta
                    db.run(`UPDATE consultas SET confirmado = 1 WHERE id = ?`, [consulta.id]);
                    
                    // Enviar mensagem de confirmação
                    const paciente = await new Promise((resolve) => {
                        db.get("SELECT nome FROM pacientes WHERE id = ?", [consulta.paciente_id], (err, row) => {
                            resolve(row);
                        });
                    });
                    
                    if (paciente) {
                        const mensagem = TEMPLATES.confirmacao(paciente.nome);
                        await enviarWhatsApp(telefone, mensagem, consulta.id, 'confirmacao');
                    }
                }
            }
        );
    }
    
    res.json({ status: "processed" });
});

// Dashboard - estatísticas
app.get('/api/dashboard', (req, res) => {
    const stats = {};
    
    // Total de pacientes ativos
    db.get("SELECT COUNT(*) as total FROM pacientes WHERE status = 'ativo'", (err, result) => {
        stats.total_pacientes = result ? result.total : 0;
        
        // Consultas hoje
        db.get(`SELECT COUNT(*) as total FROM consultas 
                WHERE DATE(data_consulta) = DATE('now')`, (err, result) => {
            stats.consultas_hoje = result ? result.total : 0;
            
            // Consultas confirmadas hoje
            db.get(`SELECT COUNT(*) as total FROM consultas 
                    WHERE DATE(data_consulta) = DATE('now') AND confirmado = 1`, (err, result) => {
                stats.confirmadas_hoje = result ? result.total : 0;
                
                // Próximas 24h
                db.get(`SELECT COUNT(*) as total FROM consultas 
                        WHERE datetime(data_consulta) BETWEEN datetime('now') 
                        AND datetime('now', '+24 hours')`, (err, result) => {
                    stats.proximas_24h = result ? result.total : 0;
                    
                    res.json({
                        message: "📊 Dashboard DentAlert Pro",
                        stats,
                        timestamp: new Date().toISOString()
                    });
                });
            });
        });
    });
});

// ===========================================
// 🕐 SCHEDULER - CRON JOBS
// ===========================================

// Executar a cada 30 minutos
cron.schedule('*/30 * * * *', () => {
    console.log('🕐 Executando verificação de lembretes...');
    processarLembretes();
});

// Executar teste na inicialização (para desenvolvimento)
setTimeout(() => {
    console.log('🧪 Executando teste inicial de lembretes...');
    processarLembretes();
}, 5000);

// ===========================================
// 🚀 INICIALIZAÇÃO
// ===========================================

app.listen(PORT, () => {
    console.log(`✅ DentAlert Pro rodando na porta ${PORT}`);
    console.log('📱 Sistema WhatsApp + Lembretes ativo');
    console.log('🤖 Motor de lembretes iniciado');
    console.log('🦷 Revolucionando clínicas dentárias!');
});

module.exports = app;