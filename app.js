const express = require('express');
const cors = require('cors');
const animeRoutes = require('./routes/animeRoutes');

const app = express();

// Configurar CORS para permitir peticiones desde el frontend
app.use(cors({
  origin: '*',  // Permitir cualquier origen ya que estamos usando credentials: 'omit' en el frontend
  methods: ['GET', 'POST', 'OPTIONS'],
  optionsSuccessStatus: 200
}));
app.use(express.json());

// Ruta de prueba
app.get('/', (req, res) => {
  res.json({ message: 'API funcionando correctamente' });
});

// Rutas API
app.use('/api', animeRoutes);

// Manejo de errores
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: 'Error interno del servidor',
    message: err.message
  });
});

// En Vercel, necesitamos exportar la app en lugar de llamar a listen
if (process.env.VERCEL) {
  // Exportar para Vercel
  module.exports = app;
} else {
  // Ejecutar normalmente para desarrollo local
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`API corriendo en puerto ${PORT}`);
  });
}
