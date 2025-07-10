const express = require('express');
const cors = require('cors');
const path = require('path');
const animeRoutes = require('./routes/animeRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Rutas API bajo /api (antes de archivos estáticos)
app.use('/api', animeRoutes);

// Servir carpeta front correctamente
app.use(express.static(path.join(__dirname, '..', 'front')));

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
