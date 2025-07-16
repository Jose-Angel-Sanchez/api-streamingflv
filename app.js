const express = require('express');
const cors = require('cors');
const animeRoutes = require('./routes/animeRoutes');

const app = express();

// Configurar CORS para permitir peticiones desde el frontend
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  optionsSuccessStatus: 200,
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
}));

// Middleware para parsear JSON y manejar errores de parsing
app.use(express.json({
  verify: (req, res, buf) => {
    try {
      JSON.parse(buf);
    } catch (e) {
      res.status(400).json({ error: 'Invalid JSON' });
      throw new Error('Invalid JSON');
    }
  }
}));

// Middleware para logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Ruta de prueba
app.get('/', (req, res) => {
  res.json({ message: 'API funcionando' });
}); 

// Ruta de prueba
app.get('/helloWorld', (req, res) => {
  res.json({ message: 'Hello World' });
});

// Rutas API
app.use('/api', animeRoutes);

// Manejo de rutas no encontradas
app.use((req, res, next) => {
  res.status(404).json({
    error: 'Ruta no encontrada',
    message: `La ruta ${req.method} ${req.url} no existe`
  });
});

// Manejo de errores
app.use((err, req, res, next) => {
  console.error(`[ERROR] ${err.stack}`);
  
  // Determinar el tipo de error
  if (err.name === 'SyntaxError') {
    return res.status(400).json({
      error: 'Error de sintaxis',
      message: 'Los datos enviados no son válidos'
    });
  }
  
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Error de validación',
      message: err.message
    });
  }
  
  // Error genérico
  res.status(500).json({
    error: 'Error interno del servidor',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Ocurrió un error procesando la solicitud'
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