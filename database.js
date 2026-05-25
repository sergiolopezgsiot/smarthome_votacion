const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'votes.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error al conectar con SQLite:', err.message);
  } else {
    console.log('Conectado a la base de datos SQLite.');
  }
});

// Habilitar claves foráneas en SQLite
db.run('PRAGMA foreign_keys = ON;');

// Helper para convertir consultas en Promesas
const query = {
  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  },
  get(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  },
  all(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }
};

async function initDatabase() {
  // Crear tabla de usuarios
  await query.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Crear tabla de opciones de nombres de productos
  await query.run(`
    CREATE TABLE IF NOT EXISTS product_options (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      created_by_user_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  // Crear tabla de votos
  await query.run(`
    CREATE TABLE IF NOT EXISTS votes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      option_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, option_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (option_id) REFERENCES product_options(id) ON DELETE CASCADE
    )
  `);

  // Crear tabla de comentarios
  await query.run(`
    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      option_id INTEGER NOT NULL,
      comment_text TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (option_id) REFERENCES product_options(id) ON DELETE CASCADE
    )
  `);

  // Poblar con opciones de nombres por defecto si la tabla está vacía
  const count = await query.get('SELECT COUNT(*) as count FROM product_options');
  if (count.count === 0) {
    const defaultOptions = [
      { name: 'Aether', description: 'Inspirado en el éter cósmico, evoca ligereza, fluidez y conexiones invisibles de alta velocidad.' },
      { name: 'Quantum', description: 'Representa la evolución tecnológica definitiva, saltos de rendimiento y poder de procesamiento.' },
      { name: 'Nexus', description: 'El punto de unión central de todos los dispositivos de tu hogar inteligente. Simple y de alto impacto.' },
      { name: 'Lumen', description: 'Enfocado en la claridad, la luz y la simplicidad intuitiva para la experiencia del usuario.' }
    ];

    for (const opt of defaultOptions) {
      await query.run(
        'INSERT INTO product_options (name, description, created_by_user_id) VALUES (?, ?, ?)',
        [opt.name, opt.description, null] // null indica que es una opción original por defecto
      );
    }
    console.log('Base de datos inicializada con nombres de producto por defecto.');
  } else {
    console.log('La base de datos ya contiene opciones de nombres.');
  }
}

module.exports = {
  db,
  query,
  initDatabase
};
