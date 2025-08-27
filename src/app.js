const express = require('express');
const bodyParser = require('body-parser'); // Middleware para parsear o corpo das requisições JSON e URL-encoded

// Importa a conexão com o banco de dados SQLite.
// O caminho '../database/setup' significa: sair da pasta 'src' e entrar em 'database',
// referenciando o arquivo 'setup.js'.
const db = require('./database/setup');

// Importa as rotas dos pacientes.
// Lembre-se que './routes/pacientes' referencia o arquivo 'pacientes.js' dentro da pasta 'routes'.
const pacientesRoutes = require('./routes/pacientes');

// IMPORTANTE: Precisamos criar as rotas de agendamentos ainda! Por enquanto, esta linha pode ser comentada ou deixada como está.
// const agendamentosRoutes = require('./routes/agendamentos');

const app = express(); // Inicializa a aplicação Express
const PORT = process.env.PORT || 8080; // <<< AQUI: AGORA USAMOS A PORTA 8000 >>>

// Middlewares
app.use(bodyParser.json()); // Permite que a aplicação lide com requisições que têm corpo em JSON
app.use(bodyParser.urlencoded({ extended: true })); // Permite lidar com dados de formulários URL-encoded

// Rotas da API
// Toda requisição para /api/pacientes será encaminhada para pacientesRoutes
app.use('/api/pacientes', pacientesRoutes);

// Quando criarmos o agendamentoController e agendamentos.js, descomentaremos e adicionaremos esta linha:
// app.use('/api/agendamentos', agendamentosRoutes);

// Rota de teste simples para verificar se o servidor está funcionando
app.get('/', (req, res) => {
    res.send('Bem-vindo ao DentAlert Pro API!');
});

// Inicia o servidor
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
    console.log('Conectado ao banco de dados DentAlert Pro.');
});

// Exporta o app para que possa ser usado em testes ou outros módulos
module.exports = app;
