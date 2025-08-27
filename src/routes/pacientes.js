const express = require('express');
const router = express.Router(); // Cria um novo objeto router
const pacienteController = require('../controllers/pacienteController'); // Importa o controller de pacientes

// Rota para listar todos os pacientes (GET /api/pacientes)
router.get('/', pacienteController.getAllPacientes);

// Rota para obter um paciente por ID (GET /api/pacientes/:id)
router.get('/:id', pacienteController.getPacienteById);

// Rota para criar um novo paciente (POST /api/pacientes)
router.post('/', pacienteController.createPaciente);

// Rota para atualizar um paciente (PUT /api/pacientes/:id)
router.put('/:id', pacienteController.updatePaciente);

// Rota para deletar um paciente (DELETE /api/pacientes/:id)
router.delete('/:id', pacienteController.deletePaciente);

module.exports = router; // Exporta o router para ser usado em app.js
