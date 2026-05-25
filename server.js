require('dotenv').config();
const express = require('express');
const path = require('path');
const { query, initDatabase } = require('./database');

const app = express();
const PORT = process.env.PORT || 3001;
const ACCESS_CODE = process.env.ACCESS_CODE || 'iot';

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Middleware de autenticación simple
async function authenticateUser(req, res, next) {
  const userId = req.headers['x-user-id'];
  const userName = req.headers['x-user-name'];

  if (!userId || !userName) {
    return res.status(401).json({ error: 'Sesión no válida. Por favor, inicia sesión.' });
  }

  try {
    const user = await query.get('SELECT * FROM users WHERE id = ? AND name = ?', [userId, userName]);
    if (!user) {
      return res.status(401).json({ error: 'Usuario no registrado.' });
    }
    req.user = user;
    next();
  } catch (err) {
    console.error('Error de autenticación:', err);
    res.status(500).json({ error: 'Error interno del servidor en autenticación.' });
  }
}

// Inicializar base de datos al arrancar
initDatabase()
  .then(() => {
    console.log('Base de datos SQLite inicializada y lista.');
  })
  .catch((err) => {
    console.error('Error crítico al inicializar la base de datos:', err);
  });

// --- RUTAS DE LA API ---

// 1. POST /api/auth - Login / Acceso
app.post('/api/auth', async (req, res) => {
  const { name, accessCode } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'El nombre es obligatorio.' });
  }
  if (!accessCode || !accessCode.trim()) {
    return res.status(400).json({ error: 'El código de acceso es obligatorio.' });
  }

  const trimmedName = name.trim();
  const trimmedCode = accessCode.trim();

  // Validación del código de acceso (insensible a mayúsculas/minúsculas)
  if (trimmedCode.toUpperCase() !== ACCESS_CODE.toUpperCase()) {
    return res.status(401).json({ error: 'El código de acceso es incorrecto.' });
  }

  try {
    // Buscar si el usuario ya existe (insensible a mayúsculas/minúsculas)
    let user = await query.get('SELECT * FROM users WHERE LOWER(name) = LOWER(?)', [trimmedName]);

    if (!user) {
      // Registrar nuevo usuario
      const result = await query.run('INSERT INTO users (name) VALUES (?)', [trimmedName]);
      user = { id: result.lastID, name: trimmedName };
      console.log(`Nuevo usuario registrado: ${trimmedName} (ID: ${user.id})`);
    } else {
      console.log(`Usuario existente accedió: ${user.name} (ID: ${user.id})`);
    }

    res.json({ user });
  } catch (err) {
    console.error('Error en autenticación:', err);
    res.status(500).json({ error: 'Error al procesar el acceso del usuario.' });
  }
});

// 2. GET /api/dashboard - Estado actual de votación, opciones y comentarios
app.get('/api/dashboard', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;

    // Obtener todas las opciones y contar sus votos, indicando el nombre del creador si existe
    const options = await query.all(`
      SELECT 
        o.id, 
        o.name, 
        o.description, 
        o.created_by_user_id,
        u.name AS creator_name,
        o.created_at,
        (SELECT COUNT(*) FROM votes WHERE option_id = o.id) AS vote_count,
        (SELECT COUNT(*) FROM votes WHERE option_id = o.id AND user_id = ?) AS user_voted
      FROM product_options o
      LEFT JOIN users u ON o.created_by_user_id = u.id
      ORDER BY vote_count DESC, o.name ASC
    `, [userId]);

    // Para cada opción, obtener sus comentarios con el nombre del usuario autor
    for (let opt of options) {
      opt.comments = await query.all(`
        SELECT 
          c.id, 
          c.comment_text, 
          c.created_at, 
          u.name AS user_name
        FROM comments c
        JOIN users u ON c.user_id = u.id
        WHERE c.option_id = ?
        ORDER BY c.created_at ASC
      `, [opt.id]);
    }

    // Obtener estadísticas globales del usuario
    const userVotes = await query.get('SELECT COUNT(*) AS count FROM votes WHERE user_id = ?', [userId]);
    const userProposals = await query.get('SELECT COUNT(*) AS count FROM product_options WHERE created_by_user_id = ?', [userId]);

    res.json({
      options,
      userVotesCount: userVotes.count,
      hasProposedOption: userProposals.count >= 2,
      userProposalsCount: userProposals.count,
      user: req.user
    });
  } catch (err) {
    console.error('Error al cargar dashboard:', err);
    res.status(500).json({ error: 'Error al cargar el panel de votación.' });
  }
});

// 3. POST /api/options - Proponer una nueva opción de nombre
app.post('/api/options', authenticateUser, async (req, res) => {
  const { name, description } = req.body;
  const userId = req.user.id;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'El nombre de la propuesta es obligatorio.' });
  }

  const trimmedName = name.trim();

  try {
    // Validar si el usuario ya propuso una opción (excepto para adminvotacion, que no tiene límites)
    if (req.user.name.toLowerCase() !== 'adminvotacion') {
      const proposalCheck = await query.get('SELECT COUNT(*) AS count FROM product_options WHERE created_by_user_id = ?', [userId]);
      if (proposalCheck.count >= 2) {
        return res.status(400).json({ error: 'Ya has alcanzado el límite máximo de 2 propuestas por persona.' });
      }
    }

    // Validar si el nombre propuesto ya existe (insensible a mayúsculas/minúsculas)
    const nameCheck = await query.get('SELECT COUNT(*) AS count FROM product_options WHERE LOWER(name) = LOWER(?)', [trimmedName]);
    if (nameCheck.count > 0) {
      return res.status(400).json({ error: `La opción "${trimmedName}" ya existe en la lista de votación.` });
    }

    // Insertar la propuesta
    await query.run(
      'INSERT INTO product_options (name, description, created_by_user_id) VALUES (?, ?, ?)',
      [trimmedName, description ? description.trim() : '', userId]
    );

    console.log(`Usuario ID ${userId} propuso una nueva opción: ${trimmedName}`);
    res.status(201).json({ message: 'Propuesta añadida con éxito.' });
  } catch (err) {
    console.error('Error al proponer opción:', err);
    res.status(500).json({ error: 'Error al registrar la propuesta.' });
  }
});

// 3b. DELETE /api/options/:id - Eliminar una opción (solo accesible por adminvotacion)
app.delete('/api/options/:id', authenticateUser, async (req, res) => {
  const optionId = req.params.id;
  const userName = req.user.name;

  if (userName.toLowerCase() !== 'adminvotacion') {
    return res.status(403).json({ error: 'Solo el usuario adminvotacion puede eliminar opciones de producto.' });
  }

  try {
    // Verificar si la opción existe
    const option = await query.get('SELECT * FROM product_options WHERE id = ?', [optionId]);
    if (!option) {
      return res.status(404).json({ error: 'La opción de producto especificada no existe.' });
    }

    // Eliminar la opción (debido a ON DELETE CASCADE, también elimina votos y comentarios)
    await query.run('DELETE FROM product_options WHERE id = ?', [optionId]);
    console.log(`Usuario administrador eliminó la opción ID ${optionId} ("${option.name}")`);

    res.json({ message: 'Opción eliminada con éxito.' });
  } catch (err) {
    console.error('Error al eliminar opción:', err);
    res.status(500).json({ error: 'Error al procesar la eliminación de la opción.' });
  }
});


// 4. POST /api/votes - Votar por una opción
app.post('/api/votes', authenticateUser, async (req, res) => {
  const { optionId } = req.body;
  const userId = req.user.id;

  if (!optionId) {
    return res.status(400).json({ error: 'El ID de la opción es obligatorio.' });
  }

  try {
    // Verificar si la opción existe
    const option = await query.get('SELECT * FROM product_options WHERE id = ?', [optionId]);
    if (!option) {
      return res.status(404).json({ error: 'La opción de producto especificada no existe.' });
    }

    // Verificar si ya ha votado por esta opción
    const alreadyVoted = await query.get('SELECT * FROM votes WHERE user_id = ? AND option_id = ?', [userId, optionId]);
    if (alreadyVoted) {
      return res.status(400).json({ error: 'Ya has votado por esta opción.' });
    }

    // Verificar si ya alcanzó el límite de 3 votos
    const voteCount = await query.get('SELECT COUNT(*) AS count FROM votes WHERE user_id = ?', [userId]);
    if (voteCount.count >= 3) {
      return res.status(400).json({ error: 'Ya has alcanzado el límite máximo de 3 votos.' });
    }

    // Registrar el voto
    await query.run('INSERT INTO votes (user_id, option_id) VALUES (?, ?)', [userId, optionId]);
    console.log(`Usuario ID ${userId} votó por opción ID ${optionId}`);

    res.json({ message: 'Voto registrado con éxito.' });
  } catch (err) {
    console.error('Error al registrar voto:', err);
    res.status(500).json({ error: 'Error al procesar tu voto.' });
  }
});

// 5. DELETE /api/votes - Retirar/Eliminar un voto
app.delete('/api/votes', authenticateUser, async (req, res) => {
  const { optionId } = req.body;
  const userId = req.user.id;

  if (!optionId) {
    return res.status(400).json({ error: 'El ID de la opción es obligatorio.' });
  }

  try {
    // Retirar el voto
    const result = await query.run('DELETE FROM votes WHERE user_id = ? AND option_id = ?', [userId, optionId]);
    
    if (result.changes === 0) {
      return res.status(400).json({ error: 'No habías votado por esta opción.' });
    }

    console.log(`Usuario ID ${userId} retiró su voto de la opción ID ${optionId}`);
    res.json({ message: 'Voto retirado con éxito.' });
  } catch (err) {
    console.error('Error al retirar voto:', err);
    res.status(500).json({ error: 'Error al retirar tu voto.' });
  }
});

// 6. POST /api/comments - Comentar una opción de nombre
app.post('/api/comments', authenticateUser, async (req, res) => {
  const { optionId, commentText } = req.body;
  const userId = req.user.id;

  if (!optionId) {
    return res.status(400).json({ error: 'El ID de la opción es obligatorio.' });
  }
  if (!commentText || !commentText.trim()) {
    return res.status(400).json({ error: 'El texto del comentario no puede estar vacío.' });
  }

  try {
    // Verificar si la opción existe
    const option = await query.get('SELECT * FROM product_options WHERE id = ?', [optionId]);
    if (!option) {
      return res.status(404).json({ error: 'La opción de producto especificada no existe.' });
    }

    // Insertar comentario
    await query.run(
      'INSERT INTO comments (user_id, option_id, comment_text) VALUES (?, ?, ?)',
      [userId, optionId, commentText.trim()]
    );

    console.log(`Usuario ID ${userId} comentó en la opción ID ${optionId}`);
    res.status(201).json({ message: 'Comentario añadido con éxito.' });
  } catch (err) {
    console.error('Error al añadir comentario:', err);
    res.status(500).json({ error: 'Error al añadir tu comentario.' });
  }
});

// --- RUTAS DE ADMINISTRACIÓN GLOBAL DE BASE DE DATOS (CRUD) ---

// Middleware de verificación de rol administrador
function requireAdmin(req, res, next) {
  const userName = req.headers['x-user-name'];
  if (!userName || userName.toLowerCase() !== 'adminvotacion') {
    return res.status(403).json({ error: 'Acceso prohibido. Se requieren privilegios de administrador.' });
  }
  next();
}

const allowedTables = ['users', 'product_options', 'votes', 'comments'];

// A1. GET /api/adminvotos/tables/:table - Obtener todos los registros de una tabla
app.get('/api/adminvotos/tables/:table', authenticateUser, requireAdmin, async (req, res) => {
  const { table } = req.params;

  if (!allowedTables.includes(table)) {
    return res.status(400).json({ error: 'Tabla no válida.' });
  }

  try {
    const rows = await query.all(`SELECT * FROM ${table} ORDER BY id DESC`);
    res.json(rows);
  } catch (err) {
    console.error(`Error al leer tabla ${table}:`, err);
    res.status(500).json({ error: 'Error al consultar la base de datos.' });
  }
});

// A2. POST /api/adminvotos/tables/:table - Crear un nuevo registro
app.post('/api/adminvotos/tables/:table', authenticateUser, requireAdmin, async (req, res) => {
  const { table } = req.params;

  if (!allowedTables.includes(table)) {
    return res.status(400).json({ error: 'Tabla no válida.' });
  }

  // Prevenir campos no deseados o nulos en campos requeridos
  const payload = req.body;
  if (!payload || Object.keys(payload).length === 0) {
    return res.status(400).json({ error: 'El cuerpo de la petición no puede estar vacío.' });
  }

  try {
    const keys = Object.keys(payload);
    const values = Object.values(payload);
    const placeholders = keys.map(() => '?').join(',');

    const sql = `INSERT INTO ${table} (${keys.join(',')}) VALUES (${placeholders})`;
    const result = await query.run(sql, values);

    res.status(201).json({ message: 'Registro creado con éxito.', id: result.lastID });
  } catch (err) {
    console.error(`Error al insertar en tabla ${table}:`, err);
    res.status(500).json({ error: `Error de base de datos: ${err.message}` });
  }
});

// A3. PUT /api/adminvotos/tables/:table/:id - Actualizar un registro por su ID
app.put('/api/adminvotos/tables/:table/:id', authenticateUser, requireAdmin, async (req, res) => {
  const { table, id } = req.params;
  const payload = req.body;

  if (!allowedTables.includes(table)) {
    return res.status(400).json({ error: 'Tabla no válida.' });
  }
  if (!payload || Object.keys(payload).length === 0) {
    return res.status(400).json({ error: 'El cuerpo de la petición no puede estar vacío.' });
  }

  try {
    // Eliminar claves que no se deben actualizar manualmente
    delete payload.id;
    delete payload.created_at;

    const keys = Object.keys(payload);
    const values = Object.values(payload);

    if (keys.length === 0) {
      return res.status(400).json({ error: 'No hay campos válidos para actualizar.' });
    }

    const setClause = keys.map(k => `${k} = ?`).join(',');
    const sql = `UPDATE ${table} SET ${setClause} WHERE id = ?`;

    const result = await query.run(sql, [...values, id]);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'El registro especificado no existe.' });
    }

    res.json({ message: 'Registro actualizado con éxito.' });
  } catch (err) {
    console.error(`Error al actualizar en tabla ${table}:`, err);
    res.status(500).json({ error: `Error de base de datos: ${err.message}` });
  }
});

// A4. DELETE /api/adminvotos/tables/:table/:id - Eliminar un registro por su ID
app.delete('/api/adminvotos/tables/:table/:id', authenticateUser, requireAdmin, async (req, res) => {
  const { table, id } = req.params;

  if (!allowedTables.includes(table)) {
    return res.status(400).json({ error: 'Tabla no válida.' });
  }

  try {
    const result = await query.run(`DELETE FROM ${table} WHERE id = ?`, [id]);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'El registro especificado no existe.' });
    }

    res.json({ message: 'Registro eliminado con éxito.' });
  } catch (err) {
    console.error(`Error al eliminar en tabla ${table}:`, err);
    res.status(500).json({ error: `Error de base de datos: ${err.message}` });
  }
});

// Servir la página física /adminvotos
app.get('/adminvotos', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'adminvotos.html'));
});

// Servir páginas específicas para las URLs requeridas
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/intro', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'intro.html'));
});

app.get('/votacion', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'votacion.html'));
});

// Redirigir cualquier otra ruta no emparejada a la pantalla de login
app.get('*', (req, res) => {
  res.redirect('/login');
});

// Iniciar el servidor
app.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(` Servidor de Votación de Nombres corriendo en: `);
  console.log(` http://localhost:${PORT} `);
  console.log(` Código de acceso configurado: ${ACCESS_CODE} `);
  console.log(`==================================================`);
});
