const express = require('express');
const cors = require('cors');
const animeRoutes = require('./routes/animeRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

// Configurar CORS para permitir peticiones desde el frontend
app.use(cors({
  origin: ['https://streaming-flv.vercel.app', 'http://localhost:3000'],
  methods: ['GET', 'POST'],
  credentials: true
}));
app.use(express.json());

// Rutas API
app.use('/api', animeRoutes);

app.listen(PORT, () => {
  console.log(`API corriendo en puerto ${PORT}`);
});
