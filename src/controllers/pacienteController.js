const db = require('../database/setup'); // Importa a conexão com o banco de dados

// Função para listar todos os pacientes
exports.getAllPacientes = (req, res) => {
    // db.all executa uma consulta SELECT e retorna todas as linhas em um array.
    db.all("SELECT * FROM pacientes ORDER BY nome ASC", [], (err, rows) => {
        if (err) {
            // Em caso de erro na consulta, envia uma resposta 500 (Internal Server Error).
            res.status(500).json({ error: err.message });
            return;
        }
        // Se a consulta for bem-sucedida, envia os pacientes como uma resposta JSON.
        res.status(200).json(rows);
    });
};

// Função para obter um paciente por ID
exports.getPacienteById = (req, res) => {
    const { id } = req.params; // Extrai o ID do paciente dos parâmetros da URL

    // db.get executa uma consulta SELECT e retorna uma única linha.
    db.get("SELECT * FROM pacientes WHERE id = ?", [id], (err, row) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        if (!row) {
            // Se nenhum paciente for encontrado com o ID fornecido, envia uma resposta 404 (Not Found).
            res.status(404).json({ message: "Paciente não encontrado." });
            return;
        }
        // Retorna o paciente encontrado.
        res.status(200).json(row);
    });
};

// Função para criar um novo paciente
exports.createPaciente = (req, res) => {
    const { nome, telefone, email, observacoes } = req.body; // Extrai os dados do corpo da requisição

    // Validação básica: nome e telefone são obrigatórios
    if (!nome || !telefone) {
        res.status(400).json({ error: "Nome e telefone são campos obrigatórios." });
        return;
    }

    // db.run executa um comando SQL que não retorna resultados (INSERT, UPDATE, DELETE).
    // A callback é executada após a conclusão da operação. `this.lastID` contém o ID do novo registro inserido.
    db.run("INSERT INTO pacientes (nome, telefone, email, observacoes) VALUES (?, ?, ?, ?)",
        [nome, telefone, email, observacoes],
        function (err) { // Usamos uma função regular para acessar 'this.lastID'
            if (err) {
                // Erro de telefone duplicado (UNIQUE constraint) será capturado aqui
                if (err.message.includes('UNIQUE constraint failed: pacientes.telefone')) {
                    res.status(409).json({ error: "Telefone já cadastrado para outro paciente." });
                } else {
                    res.status(500).json({ error: err.message });
                }
                return;
            }
            // Retorna o novo paciente com o ID gerado e os dados enviados.
            res.status(201).json({ id: this.lastID, nome, telefone, email, observacoes });
        });
};

// Função para atualizar um paciente existente
exports.updatePaciente = (req, res) => {
    const { id } = req.params;
    const { nome, telefone, email, observacoes } = req.body;

    // Validação básica: pelo menos um campo para atualizar
    if (!nome && !telefone && !email && !observacoes) {
        res.status(400).json({ error: "Nenhum dado para atualização fornecido." });
        return;
    }

    // Constrói a query de forma dinâmica para atualizar apenas os campos fornecidos.
    let updates = [];
    let params = [];
    if (nome) { updates.push("nome = ?"); params.push(nome); }
    if (telefone) { updates.push("telefone = ?"); params.push(telefone); }
    if (email) { updates.push("email = ?"); params.push(email); }
    if (observacoes) { updates.push("observacoes = ?"); params.push(observacoes); }

    params.push(id); // O ID é sempre o último parâmetro para a cláusula WHERE.

    const sql = `UPDATE pacientes SET ${updates.join(', ')} WHERE id = ?`;

    db.run(sql, params, function (err) {
        if (err) {
            if (err.message.includes('UNIQUE constraint failed: pacientes.telefone')) {
                res.status(409).json({ error: "Telefone já cadastrado para outro paciente." });
            } else {
                res.status(500).json({ error: err.message });
            }
            return;
        }
        if (this.changes === 0) {
            // Se nenhum registro foi alterado, significa que o ID não foi encontrado.
            res.status(404).json({ message: "Paciente não encontrado." });
            return;
        }
        res.status(200).json({ message: "Paciente atualizado com sucesso.", changes: this.changes });
    });
};

// Função para deletar um paciente
exports.deletePaciente = (req, res) => {
    const { id } = req.params;

    db.run("DELETE FROM pacientes WHERE id = ?", [id], function (err) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        if (this.changes === 0) {
            res.status(404).json({ message: "Paciente não encontrado." });
            return;
        }
        res.status(200).json({ message: "Paciente deletado com sucesso.", changes: this.changes });
    });
};
