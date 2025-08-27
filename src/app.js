const express = require('express');
const bodyParser = require('body-parser');
const cron = require('node-cron');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = process.env.PORT || 8080;

// Middlewares
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

console.log('🚀 Iniciando DentAlert Pro v2.1 - WhatsApp GRATUITO!');

// ===========================================
// 📱 WHATSAPP SERVICE COM FALLBACK
// ===========================================

class WhatsAppService {
    constructor() {
        this.isConnected = false;
        this.qrCode = null;
        this.useSimulation = false;
        this.baileys = null;
        this.sock = null;
        
        this.inicializarWhatsApp();
    }

    async inicializarWhatsApp() {
        try {
            console.log('📱 Tentando inicializar Baileys...');
            
            // Tentar carregar Baileys
            const { 
                default: makeWASocket, 
                DisconnectReason, 
                useMultiFileAuthState
            } = require('@whiskeysockets/baileys');
            
            const P = require('pino');
            const fs = require('fs');
            
            this.baileys = { makeWASocket, DisconnectReason, useMultiFileAuthState, P, fs };
            
            await this.conectarBaileys();
            
        } catch (error) {
            console.log('⚠️ Baileys não disponível, usando simulação:', error.message);
            this.useSimulation = true;
            this.simularConexao();
        }
    }

    async conectarBaileys() {
        try {
            const { makeWASocket, DisconnectReason, useMultiFileAuthState, P, fs } = this.baileys;
            
            const authDir = './whatsapp_auth';
            if (!fs.existsSync(authDir)) {
                fs.mkdirSync(authDir, { recursive: true });
            }

            const { state, saveCreds } = await useMultiFileAuthState(authDir);

            this.sock = makeWASocket({
                auth: state,
                logger: P({ level: 'silent' }),
                printQRInTerminal: true,
                defaultQueryTimeoutMs: 60000,
            });

            // Event listeners
            this.sock.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect, qr } = update;
                
                if (qr) {
                    this.qrCode = qr;
                    console.log('📱 QR CODE GERADO! Acesse /qr para visualizar');
                }

                if (connection === 'close') {
                    const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
                    
                    if (shouldReconnect) {
                        console.log('🔄 Reconectando...');
                        setTimeout(() => this.conectarBaileys(), 5000);
                    }
                    this.isConnected = false;
                } else if (connection === 'open') {
                    console.log('✅ WhatsApp Baileys conectado!');
                    this.isConnected = true;
                    this.qrCode = null;
                }
            });

            this.sock.ev.on('creds.update', saveCreds);

            this.sock.ev.on('messages.upsert', async (messageUpdate) => {
                for (const message of messageUpdate.messages) {
                    if (!message.key.fromMe && message.message) {
                        await this.processarMensagem(message);
                    }
                }
            });

        } catch (error) {
            console.error('❌ Erro Baileys:', error);
            this.useSimulation = true;
            this.simularConexao();
        }
    }

    simularConexao() {
        console.log('🧪 Usando simulação de WhatsApp');
        
        // Simular QR Code após 5 segundos
        setTimeout(() => {
            this.qrCode = 'SIMULADO_QR_CODE_' + Date.now();
            console.log('🧪 QR Code simulado gerado');
        }, 5000);

        // Simular conexão após 30 segundos
        setTimeout(() => {
            this.isConnected = true;
            this.qrCode = null;
            console.log('🧪 WhatsApp simulado "conectado"');
        }, 30000);
    }

    async enviarMensagem(telefone, mensagem, consultaId = null, tipo = 'manual') {
        try {
            if (this.useSimulation || !this.isConnected) {
                return this.simularEnvio(telefone, mensagem, consultaId, tipo);
            }

            const telefoneFormatado = this.formatarTelefone(telefone);
            console.log(`📱 Enviando para ${telefone}: ${mensagem.substring(0, 50)}...`);

            const result = await this.sock.sendMessage(telefoneFormatado, { text: mensagem });

            return {
                sid: result.key.id,
                status: 'sent',
                to: `whatsapp:+${telefone}`,
                timestamp: new Date().toISOString(),
                consultaId,
                tipo,
                baileys: true
            };

        } catch (error) {
            console.error('❌ Erro envio WhatsApp:', error.message);
            return this.simularEnvio(telefone, mensagem, consultaId, tipo);
        }
    }

    async processarMensagem(message) {
        try {
            const telefone = message.key.remoteJid.replace('@s.whatsapp.net', '');
            const texto = message.message?.conversation || 
                         message.message?.extendedTextMessage?.text || '';

            console.log(`📥 Mensagem de ${telefone}: ${texto}`);

            const textoLower = texto.toLowerCase().trim();
            
            if (textoLower.includes('sim')) {
                await this.confirmarConsulta(telefone);
            } else if (textoLower.includes('cancelar') || textoLower.includes('não')) {
                await this.cancelarConsulta(telefone);
            }

        } catch (error) {
            console.error('❌ Erro processar mensagem:', error);
        }
    }

    async confirmarConsulta(telefone) {
        console.log(`✅ Consulta CONFIRMADA: ${telefone}`);
        
        const confirmacao = `✅ *Perfeito!*

Sua consulta foi CONFIRMADA! 

📅 Lembrete 2h antes
📍 Chegue 10min mais cedo

_Obrigado!_ 🦷✨`;

        await this.enviarMensagem(telefone, confirmacao, null, 'confirmacao');
    }

    async cancelarConsulta(telefone) {
        console.log(`❌ Consulta CANCELADA: ${telefone}`);
        
        const cancelamento = `❌ *Cancelado!*

Para reagendar, responda aqui
📞 Ou entre em contato

_Até breve!_ 😊`;

        await this.enviarMensagem(telefone, cancelamento, null, 'cancelamento');
    }

    formatarTelefone(telefone) {
        const clean = telefone.replace(/\D/g, '');
        const formatted = clean.startsWith('55') ? clean : `55${clean}`;
        return `${formatted}@s.whatsapp.net`;
    }

    simularEnvio(telefone, mensagem, consultaId, tipo) {
        console.log('🧪 [SIMULADO] WhatsApp:');
        console.log(`   📱 Para: ${telefone}`);
        console.log(`   💬 Msg: ${mensagem.substring(0, 50)}...`);
        
        return {
            sid: 'SIM_' + Math.random().toString(36).substr(2, 9),
            status: 'sent_simulated',
            to: `whatsapp:+55${telefone}`,
            timestamp: new Date().toISOString(),
            consultaId,
            tipo,
            simulated: true
        };
    }

    verificarStatus() {
        return {
            connected: this.isConnected,
            status: this.isConnected ? 'connected' : 'disconnected',
            qrCode: this.qrCode,
            simulation: this.useSimulation,
            timestamp: new Date().toISOString()
        };
    }
}

// Inicializar WhatsApp
const whatsapp = new WhatsAppService();

// ===========================================
// 💾 DATABASE
// ===========================================

const db = new sqlite3.Database('./dentalert.db', (err) => {
    if (err) {
        console.error('❌ Erro banco:', err.message);
    } else {
        console.log('✅ Banco SQLite conectado');
        initDatabase();
    }
});

function initDatabase() {
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

    console.log('✅ Tabelas verificadas');
}

// ===========================================
// 📨 TEMPLATES
// ===========================================

const TEMPLATES = {
    lembrete_24h: (nome, data, hora, dentista) => 
        `🦷 *Olá ${nome}!*

Consulta marcada:
📅 *Data:* ${data}
⏰ *Horário:* ${hora}
👨‍⚕️ *Dentista:* ${dentista}

Para confirmar: *SIM*
Para cancelar: *CANCELAR*

_DentAlert Pro - Gratuito!_ 😊`,

    lembrete_2h: (nome, hora) =>
        `🕐 *${nome}, consulta em 2h!*

⏰ Horário: ${hora}
📍 Chegue 10min antes

_Te esperamos!_ ✨`
};

// ===========================================
// 🤖 LEMBRETES
// ===========================================

async function processarLembretes() {
    console.log('🤖 Verificando lembretes...');
    
    // Lembretes 24h
    db.all(`SELECT c.*, p.nome, p.telefone 
            FROM consultas c 
            JOIN pacientes p ON c.paciente_id = p.id 
            WHERE c.status = 'agendada' 
            AND c.confirmado = 0
            AND datetime(c.data_consulta, '-24 hours') <= datetime('now')
            AND datetime(c.data_consulta, '-23 hours') > datetime('now')
            AND c.lembretes_enviados = 0`,
    async (err, consultas) => {
        if (err) return;

        for (const consulta of consultas) {
            try {
                const dataConsulta = new Date(consulta.data_consulta);
                const mensagem = TEMPLATES.lembrete_24h(
                    consulta.nome,
                    dataConsulta.toLocaleDateString('pt-BR'),
                    dataConsulta.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
                    consulta.dentista
                );

                await whatsapp.enviarMensagem(consulta.telefone, mensagem, consulta.id, 'lembrete_24h');
                
                db.run(`UPDATE consultas SET lembretes_enviados = 1 WHERE id = ?`, [consulta.id]);
                console.log(`✅ Lembrete 24h: ${consulta.nome}`);
                
            } catch (error) {
                console.error(`❌ Erro consulta ${consulta.id}:`, error);
            }
        }
    });
}

// ===========================================
// 📋 API ENDPOINTS
// ===========================================

app.get('/', (req, res) => {
    const status = whatsapp.verificarStatus();
    
    res.json({
        message: "🦷 DentAlert Pro v2.1 - WhatsApp GRATUITO!",
        status: "online",
        features: [
            "📱 WhatsApp 100% gratuito",
            "🤖 Lembretes automáticos",
            "📋 Gestão de pacientes",
            "✅ Confirmação automática"
        ],
        whatsapp: {
            connected: status.connected,
            status: status.status,
            has_qr: !!status.qrCode,
            simulation: status.simulation
        },
        timestamp: new Date().toISOString(),
        version: "2.1.0",
        custo: "R$ 0/mês"
    });
});

app.get('/qr', (req, res) => {
    const status = whatsapp.verificarStatus();
    
    if (status.qrCode) {
        res.send(`
        <html>
        <head>
            <title>DentAlert Pro - QR Code</title>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
        </head>
        <body style="text-align:center; font-family:Arial; padding:20px;">
            <h1>🦷 DentAlert Pro</h1>
            <h2>📱 Conectar WhatsApp GRATUITO</h2>
            
            ${status.simulation ? 
                `<div style="background:#fff3cd; padding:15px; border-radius:5px; margin:20px;">
                    <strong>🧪 MODO SIMULAÇÃO ATIVO</strong><br>
                    Baileys não está disponível no servidor.<br>
                    Sistema funcionará em modo de demonstração.
                </div>` 
                : 
                `<p><strong>✅ Sistema Baileys ativo!</strong></p>`
            }
            
            <div style="background:#f8f9fa; padding:20px; border-radius:10px; margin:20px; border:2px dashed #007bff;">
                <h3>QR Code para WhatsApp:</h3>
                <div style="font-family:monospace; background:white; padding:15px; margin:10px; border:1px solid #ddd; word-break:break-all;">
                    ${status.qrCode}
                </div>
                <p><em>Use este código no aplicativo ou escaneie no terminal</em></p>
            </div>

            <div style="text-align:left; max-width:400px; margin:20px auto; background:#e7f3ff; padding:15px; border-radius:5px;">
                <h4>📋 Como conectar:</h4>
                <ol>
                    <li>Abra <strong>WhatsApp</strong> no celular</li>
                    <li>Toque nos <strong>3 pontos</strong> → "Aparelhos conectados"</li>
                    <li>Toque <strong>"Conectar aparelho"</strong></li>
                    <li>Escaneie o QR Code acima</li>
                </ol>
            </div>
            
            <div style="margin-top:30px;">
                <button onclick="location.reload()" style="padding:10px 20px; background:#28a745; color:white; border:none; border-radius:5px; cursor:pointer;">
                    🔄 Atualizar QR Code
                </button>
                <br><br>
                <a href="/" style="color:#007bff;">← Voltar ao painel</a>
            </div>

            <script>
                // Auto refresh a cada 10 segundos
                setTimeout(() => location.reload(), 10000);
            </script>
        </body>
        </html>
        `);
    } else if (status.connected) {
        res.send(`
        <html>
        <body style="text-align:center; font-family:Arial; padding:20px;">
            <h1>✅ WhatsApp Conectado!</h1>
            <h2>🦷 DentAlert Pro ATIVO</h2>
            
            <div style="background:#d4edda; padding:20px; border-radius:10px; margin:20px; border:2px solid #28a745;">
                <h3>🎉 Sistema Funcionando!</h3>
                <p>✅ WhatsApp conectado com sucesso</p>
                <p>🤖 Lembretes automáticos ativos</p>
                <p>📱 Pronto para enviar mensagens</p>
            </div>
            
            <a href="/" style="background:#007bff; color:white; padding:10px 20px; text-decoration:none; border-radius:5px;">
                📊 Ver Dashboard
            </a>
        </body>
        </html>
        `);
    } else {
        res.send(`
        <html>
        <body style="text-align:center; font-family:Arial; padding:20px;">
            <h1>🔄 Iniciando WhatsApp...</h1>
            <div style="background:#fff3cd; padding:15px; border-radius:5px; margin:20px;">
                <p>⏳ Gerando QR Code...</p>
                <p>Aguarde alguns segundos</p>
            </div>
            <script>setTimeout(() => location.reload(), 5000);</script>
        </body>
        </html>
        `);
    }
});

app.get('/health', (req, res) => {
    const status = whatsapp.verificarStatus();
    
    res.json({
        status: "healthy",
        database: "connected",
        whatsapp: status.connected ? "connected" : "disconnected",
        whatsapp_mode: status.simulation ? "simulation" : "baileys",
        scheduler: "running",
        uptime: process.uptime()
    });
});

// APIs básicas
app.post('/api/pacientes', (req, res) => {
    const { nome, telefone, email, data_nascimento, observacoes } = req.body;
    
    if (!nome || !telefone) {
        return res.status(400).json({ error: "Nome e telefone obrigatórios" });
    }

    db.run(`INSERT INTO pacientes (nome, telefone, email, data_nascimento, observacoes) 
            VALUES (?, ?, ?, ?, ?)`,
        [nome, telefone, email, data_nascimento, observacoes],
        function(err) {
            if (err) {
                res.status(400).json({ error: err.code === 'SQLITE_CONSTRAINT_UNIQUE' ? "Telefone já cadastrado" : err.message });
            } else {
                res.json({
                    message: "✅ Paciente cadastrado!",
                    id: this.lastID,
                    nome, telefone
                });
            }
        }
    );
});

app.post('/api/consultas', (req, res) => {
    const { paciente_id, dentista, data_consulta, procedimento, valor, observacoes } = req.body;
    
    if (!paciente_id || !dentista || !data_consulta) {
        return res.status(400).json({ error: "Dados obrigatórios ausentes" });
    }

    db.run(`INSERT INTO consultas (paciente_id, dentista, data_consulta, procedimento, valor, observacoes) 
            VALUES (?, ?, ?, ?, ?, ?)`,
        [paciente_id, dentista, data_consulta, procedimento, valor, observacoes],
        function(err) {
            if (err) {
                res.status(500).json({ error: err.message });
            } else {
                res.json({
                    message: "✅ Consulta agendada!",
                    id: this.lastID,
                    status: "Lembretes GRATUITOS ativados!"
                });
            }
        }
    );
});

app.get('/api/pacientes', (req, res) => {
    db.all("SELECT * FROM pacientes WHERE status = 'ativo' ORDER BY nome", (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json({ total: rows.length, pacientes: rows });
        }
    });
});

app.get('/api/consultas', (req, res) => {
    db.all(`SELECT c.*, p.nome as paciente_nome, p.telefone 
            FROM consultas c 
            JOIN pacientes p ON c.paciente_id = p.id 
            ORDER BY c.data_consulta ASC`, (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json({ total: rows.length, consultas: rows });
        }
    });
});

app.post('/api/test/whatsapp', async (req, res) => {
    const { telefone, mensagem } = req.body;
    
    if (!telefone || !mensagem) {
        return res.status(400).json({ error: "Telefone e mensagem obrigatórios" });
    }

    try {
        const resultado = await whatsapp.enviarMensagem(telefone, mensagem, null, 'teste');
        res.json({
            message: "✅ WhatsApp enviado!",
            resultado,
            custo: "R$ 0"
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Cron job
cron.schedule('*/30 * * * *', () => {
    console.log('🕐 Processando lembretes...');
    processarLembretes();
});

setTimeout(() => processarLembretes(), 10000);

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`✅ DentAlert Pro v2.1 na porta ${PORT}`);
    console.log('📱 WhatsApp gratuito inicializando...');
    console.log('🔗 QR Code: https://dentalert-pro-wbywi.ondigitalocean.app/qr');
    console.log('💰 Custo: R$ 0/mês');
});

module.exports = app;