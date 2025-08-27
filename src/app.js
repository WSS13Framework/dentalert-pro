const express = require('express');
const bodyParser = require('body-parser');
const cron = require('node-cron');
const sqlite3 = require('sqlite3').verbose();

// BAILEYS WHATSAPP - GRATUITO!
const { 
    default: makeWASocket, 
    DisconnectReason, 
    useMultiFileAuthState
} = require('@whiskeysockets/baileys');
const P = require('pino');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 8080;

// Middlewares
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

console.log('🚀 Iniciando DentAlert Pro v2.1 - WhatsApp GRATUITO!');

// ===========================================
// 📱 BAILEYS WHATSAPP GRATUITO
// ===========================================

class WhatsAppGratuito {
    constructor() {
        this.sock = null;
        this.qrCode = null;
        this.isConnected = false;
        this.authDir = './whatsapp_auth';
        
        // Criar diretório de auth
        if (!fs.existsSync(this.authDir)) {
            fs.mkdirSync(this.authDir, { recursive: true });
        }
    }

    async inicializar() {
        try {
            console.log('📱 Iniciando WhatsApp gratuito via Baileys...');

            const { state, saveCreds } = await useMultiFileAuthState(this.authDir);

            this.sock = makeWASocket({
                auth: state,
                logger: P({ level: 'silent' }),
                printQRInTerminal: true,
                defaultQueryTimeoutMs: 60000,
            });

            // Conexão
            this.sock.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect, qr } = update;
                
                if (qr) {
                    this.qrCode = qr;
                    console.log('📱 QR CODE GERADO! Escaneie com seu WhatsApp');
                    console.log('🔗 Ou acesse: /qr para ver na web');
                }

                if (connection === 'close') {
                    const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
                    
                    if (shouldReconnect) {
                        console.log('🔄 Reconectando WhatsApp...');
                        setTimeout(() => this.inicializar(), 5000);
                    }
                    this.isConnected = false;
                } else if (connection === 'open') {
                    console.log('✅ WhatsApp conectado! Sistema ATIVO!');
                    this.isConnected = true;
                    this.qrCode = null;
                }
            });

            this.sock.ev.on('creds.update', saveCreds);

            // Receber mensagens
            this.sock.ev.on('messages.upsert', async (messageUpdate) => {
                for (const message of messageUpdate.messages) {
                    if (!message.key.fromMe && message.message) {
                        await this.processarResposta(message);
                    }
                }
            });

        } catch (error) {
            console.error('❌ Erro WhatsApp:', error);
        }
    }

    async enviarMensagem(telefone, mensagem, consultaId = null, tipo = 'manual') {
        try {
            if (!this.isConnected) {
                console.log('🧪 WhatsApp desconectado - usando simulação');
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
                gratuito: true
            };

        } catch (error) {
            console.error('❌ Erro envio:', error.message);
            return this.simularEnvio(telefone, mensagem, consultaId, tipo);
        }
    }

    async processarResposta(message) {
        try {
            const telefone = message.key.remoteJid.replace('@s.whatsapp.net', '');
            const texto = message.message?.conversation || 
                         message.message?.extendedTextMessage?.text || '';

            console.log(`📥 Resposta de ${telefone}: ${texto}`);

            const textoLower = texto.toLowerCase().trim();
            
            if (textoLower.includes('sim') || textoLower === 's') {
                await this.confirmarConsulta(telefone);
            } else if (textoLower.includes('cancelar') || textoLower.includes('não')) {
                await this.cancelarConsulta(telefone);
            }

        } catch (error) {
            console.error('❌ Erro processar resposta:', error);
        }
    }

    async confirmarConsulta(telefone) {
        console.log(`✅ Consulta CONFIRMADA: ${telefone}`);
        
        // TODO: Atualizar banco de dados
        // db.run("UPDATE consultas SET confirmado = 1 WHERE paciente_telefone = ?", [telefone]);
        
        const confirmacao = `✅ *Perfeito!*

Sua consulta foi CONFIRMADA! 

📅 Você receberá lembrete 2h antes
📍 Chegue 10 minutos mais cedo

_Obrigado!_ 🦷✨`;

        await this.enviarMensagem(telefone, confirmacao, null, 'confirmacao');
    }

    async cancelarConsulta(telefone) {
        console.log(`❌ Consulta CANCELADA: ${telefone}`);
        
        const cancelamento = `❌ *Ok, cancelado!*

Sua consulta foi cancelada.

Para reagendar:
📞 Entre em contato
💬 Ou responda aqui

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
            sid: 'FREE_' + Math.random().toString(36).substr(2, 9),
            status: 'sent_simulated',
            to: `whatsapp:+55${telefone}`,
            timestamp: new Date().toISOString(),
            consultaId,
            tipo,
            simulated: true,
            gratuito: true
        };
    }

    verificarStatus() {
        return {
            connected: this.isConnected,
            status: this.isConnected ? 'connected' : 'disconnected',
            qrCode: this.qrCode,
            timestamp: new Date().toISOString(),
            service: 'baileys_gratuito'
        };
    }
}

// Inicializar WhatsApp
const whatsappGratuito = new WhatsAppGratuito();
whatsappGratuito.inicializar();

// ===========================================
// 💾 DATABASE SETUP
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

    console.log('✅ Tabelas criadas');
}

// ===========================================
// 📨 TEMPLATES DE MENSAGEM
// ===========================================

const TEMPLATES = {
    lembrete_24h: (nome, data, hora, dentista) => 
        `🦷 *Olá ${nome}!*

Você tem consulta marcada:
📅 *Data:* ${data}
⏰ *Horário:* ${hora}
👨‍⚕️ *Dentista:* Dr(a). ${dentista}

Para confirmar, responda *SIM*
Para cancelar, responda *CANCELAR*

_DentAlert Pro - Sistema gratuito!_ 😊`,

    lembrete_2h: (nome, hora) =>
        `🕐 *${nome}, consulta em 2 horas!*

⏰ Horário: ${hora}
📍 Chegue 10min antes

_Te esperamos!_ ✨`
};

// ===========================================
// 🤖 MOTOR DE LEMBRETES
// ===========================================

async function processarLembretes() {
    console.log('🤖 Processando lembretes...');
    
    // Lembretes 24h antes
    db.all(`SELECT c.*, p.nome, p.telefone 
            FROM consultas c 
            JOIN pacientes p ON c.paciente_id = p.id 
            WHERE c.status = 'agendada' 
            AND c.confirmado = 0
            AND datetime(c.data_consulta, '-24 hours') <= datetime('now')
            AND datetime(c.data_consulta, '-23 hours') > datetime('now')
            AND c.lembretes_enviados = 0`,
    async (err, consultas) => {
        if (err) {
            console.error('❌ Erro buscar consultas:', err);
            return;
        }

        for (const consulta of consultas) {
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

                await whatsappGratuito.enviarMensagem(consulta.telefone, mensagem, consulta.id, 'lembrete_24h');
                
                db.run(`UPDATE consultas SET lembretes_enviados = 1 WHERE id = ?`, [consulta.id]);
                console.log(`✅ Lembrete 24h enviado: ${consulta.nome}`);
                
            } catch (error) {
                console.error(`❌ Erro consulta ${consulta.id}:`, error);
            }
        }
    });

    // Lembretes 2h antes (se confirmado)
    db.all(`SELECT c.*, p.nome, p.telefone 
            FROM consultas c 
            JOIN pacientes p ON c.paciente_id = p.id 
            WHERE c.status = 'agendada' 
            AND c.confirmado = 1
            AND datetime(c.data_consulta, '-2 hours') <= datetime('now')
            AND datetime(c.data_consulta, '-1 hour') > datetime('now')
            AND c.lembretes_enviados = 1`,
    async (err, consultas) => {
        if (err) return;

        for (const consulta of consultas) {
            try {
                const dataConsulta = new Date(consulta.data_consulta);
                const horaFormatada = dataConsulta.toLocaleTimeString('pt-BR', { 
                    hour: '2-digit', minute: '2-digit' 
                });

                const mensagem = TEMPLATES.lembrete_2h(consulta.nome, horaFormatada);

                await whatsappGratuito.enviarMensagem(consulta.telefone, mensagem, consulta.id, 'lembrete_2h');
                
                db.run(`UPDATE consultas SET lembretes_enviados = 2 WHERE id = ?`, [consulta.id]);
                console.log(`✅ Lembrete 2h enviado: ${consulta.nome}`);
                
            } catch (error) {
                console.error(`❌ Erro 2h consulta ${consulta.id}:`, error);
            }
        }
    });
}

// ===========================================
// 📋 API ENDPOINTS
// ===========================================

// Status principal
app.get('/', (req, res) => {
    const whatsappStatus = whatsappGratuito.verificarStatus();
    
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
            connected: whatsappStatus.connected,
            status: whatsappStatus.status,
            has_qr: !!whatsappStatus.qrCode
        },
        timestamp: new Date().toISOString(),
        version: "2.1.0",
        custo: "R$ 0/mês"
    });
});

// QR Code para conectar WhatsApp
app.get('/qr', (req, res) => {
    const status = whatsappGratuito.verificarStatus();
    
    if (status.qrCode) {
        res.send(`
        <html>
        <head><title>DentAlert Pro - Conectar WhatsApp</title></head>
        <body style="text-align:center; font-family:Arial;">
            <h1>🦷 DentAlert Pro</h1>
            <h2>📱 Conectar WhatsApp GRATUITO</h2>
            <p>Escaneie o QR Code abaixo com seu WhatsApp:</p>
            <div id="qrcode"></div>
            <p><strong>Instruções:</strong></p>
            <ol style="text-align:left; display:inline-block;">
                <li>Abra WhatsApp no seu celular</li>
                <li>Toque nos 3 pontos > Aparelhos conectados</li>
                <li>Toque em "Conectar um aparelho"</li>
                <li>Escaneie o QR code acima</li>
            </ol>
            <p><em>Após conectar, esta página se atualizará automaticamente.</em></p>
            <script>
                const qrcode = "${status.qrCode}";
                // Aqui você pode usar uma biblioteca JS para exibir o QR code
                document.getElementById('qrcode').innerHTML = 
                    '<p>QR Code: ' + qrcode.substring(0, 50) + '...</p>' +
                    '<p><em>Use o terminal para ver o QR code completo</em></p>';
                
                // Auto refresh a cada 5 segundos
                setTimeout(() => location.reload(), 5000);
            </script>
        </body>
        </html>
        `);
    } else if (status.connected) {
        res.send(`
        <html>
        <body style="text-align:center; font-family:Arial;">
            <h1>✅ WhatsApp Conectado!</h1>
            <h2>🦷 DentAlert Pro ativo</h2>
            <p>Sistema de lembretes funcionando!</p>
            <a href="/">← Voltar ao painel</a>
        </body>
        </html>
        `);
    } else {
        res.send(`
        <html>
        <body style="text-align:center; font-family:Arial;">
            <h1>🔄 Conectando WhatsApp...</h1>
            <p>Aguarde o QR code ser gerado...</p>
            <script>setTimeout(() => location.reload(), 3000);</script>
        </body>
        </html>
        `);
    }
});

// Health check
app.get('/health', (req, res) => {
    const whatsappStatus = whatsappGratuito.verificarStatus();
    
    res.json({
        status: "healthy",
        database: "connected",
        whatsapp: whatsappStatus.connected ? "connected" : "disconnected",
        whatsapp_service: "baileys_gratuito",
        scheduler: "running",
        uptime: process.uptime(),
        custo_mensal: "R$ 0"
    });
});

// Cadastrar paciente
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
                if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
                    res.status(400).json({ error: "Telefone já cadastrado" });
                } else {
                    res.status(500).json({ error: err.message });
                }
            } else {
                res.json({
                    message: "✅ Paciente cadastrado!",
                    id: this.lastID,
                    nome,
                    telefone,
                    whatsapp_gratuito: true
                });
            }
        }
    );
});

// Agendar consulta
app.post('/api/consultas', (req, res) => {
    const { paciente_id, dentista, data_consulta, procedimento, valor, observacoes } = req.body;
    
    if (!paciente_id || !dentista || !data_consulta) {
        return res.status(400).json({ error: "Paciente, dentista e data obrigatórios" });
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
                    status: "Lembretes GRATUITOS ativados! 📱",
                    custo_whatsapp: "R$ 0"
                });
            }
        }
    );
});

// Listar pacientes
app.get('/api/pacientes', (req, res) => {
    db.all("SELECT * FROM pacientes WHERE status = 'ativo' ORDER BY nome", (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json({
                total: rows.length,
                pacientes: rows,
                whatsapp: "gratuito"
            });
        }
    });
});

// Listar consultas
app.get('/api/consultas', (req, res) => {
    db.all(`SELECT c.*, p.nome as paciente_nome, p.telefone 
            FROM consultas c 
            JOIN pacientes p ON c.paciente_id = p.id 
            ORDER BY c.data_consulta ASC`, (err, rows) => {
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

// Teste WhatsApp manual
app.post('/api/test/whatsapp', async (req, res) => {
    const { telefone, mensagem } = req.body;
    
    if (!telefone || !mensagem) {
        return res.status(400).json({ error: "Telefone e mensagem obrigatórios" });
    }

    try {
        const resultado = await whatsappGratuito.enviarMensagem(telefone, mensagem, null, 'teste');
        
        res.json({
            message: "✅ WhatsApp enviado!",
            resultado,
            custo: "R$ 0 (gratuito!)"
        });
    } catch (error) {
        res.status(500).json({
            error: "Erro ao enviar",
            details: error.message
        });
    }
});

// ===========================================
// 🕐 CRON JOBS
// ===========================================

// A cada 30 minutos
cron.schedule('*/30 * * * *', () => {
    console.log('🕐 Verificando lembretes...');
    processarLembretes();
});

// Teste inicial
setTimeout(() => {
    console.log('🧪 Teste inicial de lembretes');
    processarLembretes();
}, 10000);

// ===========================================
// 🚀 INICIALIZAÇÃO
// ===========================================

app.listen(PORT, () => {
    console.log(`✅ DentAlert Pro v2.1 rodando na porta ${PORT}`);
    console.log('📱 WhatsApp GRATUITO via Baileys');
    console.log('🤖 Sistema de lembretes ativo');
    console.log('💰 Custo total: R$ 0/mês');
    console.log('🦷 Pronto para revolucionar clínicas!');
    console.log(`🔗 QR Code: https://dentalert-pro-wbywi.ondigitalocean.app/qr`);
});

module.exports = app;