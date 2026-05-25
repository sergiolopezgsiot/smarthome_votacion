let currentUser = null;
let activeTable = 'users';
let cachedRelations = {
  users: [],
  product_options: []
};

document.addEventListener('DOMContentLoaded', () => {
  // Comprobación de seguridad
  const savedUser = localStorage.getItem('currentUser');
  if (!savedUser) {
    window.location.href = '/login';
    return;
  }

  currentUser = JSON.parse(savedUser);
  if (currentUser.name.toLowerCase() !== 'adminvotacion') {
    window.location.href = '/login';
    return;
  }

  // Cargar datos y configurar tabs
  setupTabs();
  loadAllBadgeCounts();
  loadTableData();

  // Configurar botones globales
  document.getElementById('add-btn').addEventListener('click', openAddModal);
  document.getElementById('add-form').addEventListener('submit', handleAddSubmit);
  document.getElementById('edit-form').addEventListener('submit', handleEditSubmit);
});

function getAuthHeaders() {
  return {
    'Content-Type': 'application/json',
    'X-User-Id': currentUser ? currentUser.id : '',
    'X-User-Name': currentUser ? currentUser.name : ''
  };
}

const tableMetadata = {
  users: {
    title: 'Gestión de Usuarios',
    desc: 'Administra el listado de miembros del equipo registrados para votar.',
    columns: [
      { key: 'id', label: 'ID', readonly: true },
      { key: 'name', label: 'Nombre', type: 'text', required: true },
      { key: 'email', label: 'Email', type: 'text', required: true },
      { key: 'created_at', label: 'Fecha de Registro', readonly: true }
    ]
  },
  product_options: {
    title: 'Gestión de Propuestas',
    desc: 'Administra las propuestas de nombres de productos añadidas por el equipo y semilla.',
    columns: [
      { key: 'id', label: 'ID', readonly: true },
      { key: 'name', label: 'Nombre Propuesto', type: 'text', required: true },
      { key: 'description', label: 'Descripción / Significado', type: 'textarea' },
      { key: 'created_by_user_id', label: 'ID Usuario Creador (Semilla si está vacío)', type: 'select', relation: 'users' },
      { key: 'created_at', label: 'Fecha de Envío', readonly: true }
    ]
  },
  votes: {
    title: 'Gestión de Votos',
    desc: 'Administra todos los votos emitidos por los usuarios.',
    columns: [
      { key: 'id', label: 'ID', readonly: true },
      { key: 'user_id', label: 'Usuario', type: 'select', relation: 'users', required: true },
      { key: 'option_id', label: 'Propuesta Votada', type: 'select', relation: 'product_options', required: true },
      { key: 'created_at', label: 'Fecha de Emisión', readonly: true }
    ]
  },
  comments: {
    title: 'Gestión de Comentarios',
    desc: 'Administra todos los comentarios de feedback de los usuarios.',
    columns: [
      { key: 'id', label: 'ID', readonly: true },
      { key: 'user_id', label: 'Usuario', type: 'select', relation: 'users', required: true },
      { key: 'option_id', label: 'Propuesta', type: 'select', relation: 'product_options', required: true },
      { key: 'comment_text', label: 'Texto de Comentario', type: 'textarea', required: true },
      { key: 'created_at', label: 'Fecha de Publicación', readonly: true }
    ]
  }
};

function setupTabs() {
  const tabs = document.querySelectorAll('.tab-btn');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      activeTable = tab.getAttribute('data-table');
      
      // Actualizar cabecera de tabla
      const meta = tableMetadata[activeTable];
      document.getElementById('active-table-title').textContent = meta.title;
      document.getElementById('active-table-desc').textContent = meta.desc;

      loadTableData();
    });
  });
}

// Cargar conteos de insignias de pestañas
async function loadAllBadgeCounts() {
  const tables = ['users', 'product_options', 'votes', 'comments'];
  for (const table of tables) {
    try {
      const response = await fetch(`/api/adminvotos/tables/${table}`, {
        method: 'GET',
        headers: getAuthHeaders()
      });
      if (response.ok) {
        const rows = await response.json();
        document.getElementById(`badge-${table}`).textContent = rows.length;
        if (table === 'users' || table === 'product_options') {
          cachedRelations[table] = rows;
        }
      }
    } catch (err) {
      console.error(`Error al cargar cantidad para ${table}:`, err);
    }
  }
}

// Cargar y renderizar la tabla activa
async function loadTableData() {
  const tableBody = document.getElementById('table-body');
  const tableHeadRow = document.getElementById('table-head-row');
  
  tableBody.innerHTML = `
    <tr>
      <td colspan="10" style="text-align: center; padding: 40px;">
        <div class="spinner" style="margin: 0 auto 12px;"></div>
        <p style="color: var(--text-muted);">Cargando registros...</p>
      </td>
    </tr>
  `;

  // Cargar datos de relaciones auxiliares primero
  await loadRelationsCache();

  try {
    const response = await fetch(`/api/adminvotos/tables/${activeTable}`, {
      method: 'GET',
      headers: getAuthHeaders()
    });

    if (!response.ok) {
      throw new Error('Error al conectar con la API de administración.');
    }

    const rows = await response.json();
    document.getElementById(`badge-${activeTable}`).textContent = rows.length;

    const meta = tableMetadata[activeTable];
    
    // Renderizar cabeceras
    tableHeadRow.innerHTML = '';
    meta.columns.forEach(col => {
      const th = document.createElement('th');
      th.textContent = col.label;
      tableHeadRow.appendChild(th);
    });
    // Cabecera de acciones
    const thActions = document.createElement('th');
    thActions.textContent = 'Acciones';
    thActions.style.textAlign = 'right';
    tableHeadRow.appendChild(thActions);

    // Renderizar filas
    tableBody.innerHTML = '';
    if (rows.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="${meta.columns.length + 1}" style="text-align: center; padding: 40px; color: var(--text-muted); font-style: italic;">
            No hay registros disponibles en esta tabla.
          </td>
        </tr>
      `;
      return;
    }

    rows.forEach(row => {
      const tr = document.createElement('tr');
      meta.columns.forEach(col => {
        const td = document.createElement('td');
        const value = row[col.key];

        // Mapeo amigable de claves foráneas
        if (col.type === 'select' && col.relation) {
          const relatedRow = cachedRelations[col.relation].find(r => r.id === value);
          td.innerHTML = relatedRow 
            ? `${escapeHTML(relatedRow.name)} <span style="font-size: 0.75rem; color: var(--text-muted);">(ID: ${value})</span>`
            : `<span style="color: var(--text-muted); font-style: italic;">Ninguno (ID: ${value || 'null'})</span>`;
        } else {
          td.textContent = value === null || value === undefined ? '' : value;
        }
        tr.appendChild(td);
      });

      // Acciones CRUD (Editar / Borrar)
      const tdActions = document.createElement('td');
      tdActions.style.textAlign = 'right';
      
      const rowName = row.name || row.comment_text || `Registro ID ${row.id}`;
      tdActions.innerHTML = `
        <div class="row-actions" style="justify-content: flex-end;">
          <button class="btn-row-action" title="Editar registro" onclick="openEditModal(${row.id})">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4z"/></svg>
          </button>
          <button class="btn-row-action delete" title="Borrar registro" onclick="deleteRecord(${row.id}, '${escapeHTML(rowName)}')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
          </button>
        </div>
      `;
      tr.appendChild(tdActions);
      tableBody.appendChild(tr);
    });

  } catch (err) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="10" style="text-align: center; padding: 40px; color: var(--error); font-weight: 500;">
          Error al cargar datos: ${escapeHTML(err.message)}
        </td>
      </tr>
    `;
  }
}

// Carga las tablas de dependencias para los selects
async function loadRelationsCache() {
  const rels = ['users', 'product_options'];
  for (const rel of rels) {
    try {
      const response = await fetch(`/api/adminvotos/tables/${rel}`, {
        method: 'GET',
        headers: getAuthHeaders()
      });
      if (response.ok) {
        cachedRelations[rel] = await response.json();
      }
    } catch (err) {
      console.error(`Error al cargar cache de relación ${rel}:`, err);
    }
  }
}

// Abrir modal de añadir
function openAddModal() {
  const meta = tableMetadata[activeTable];
  document.getElementById('add-modal-title').textContent = `Añadir Nuevo Registro | ${meta.title}`;
  document.getElementById('add-error').classList.add('hidden');

  const fieldsContainer = document.getElementById('add-form-fields');
  fieldsContainer.innerHTML = '';

  meta.columns.forEach(col => {
    if (col.readonly) return; // Saltar campos autoincrementables/lectura
    fieldsContainer.appendChild(createFormGroupHTML(col));
  });

  openModal('add-modal');
}

// Abrir modal de editar
async function openEditModal(id) {
  const meta = tableMetadata[activeTable];
  document.getElementById('edit-modal-title').textContent = `Editar Registro | ID ${id}`;
  document.getElementById('edit-id-hidden').value = id;
  document.getElementById('edit-error').classList.add('hidden');

  const fieldsContainer = document.getElementById('edit-form-fields');
  fieldsContainer.innerHTML = `
    <div style="text-align: center; padding: 20px;">
      <div class="spinner" style="margin: 0 auto 8px;"></div>
      <p style="color: var(--text-muted);">Cargando registro...</p>
    </div>
  `;
  openModal('edit-modal');

  try {
    const response = await fetch(`/api/adminvotos/tables/${activeTable}`, {
      headers: getAuthHeaders()
    });
    if (!response.ok) throw new Error('Error al obtener fila de datos.');
    
    const rows = await response.json();
    const row = rows.find(r => r.id === id);
    if (!row) throw new Error('No se encontró el registro solicitado.');

    // Construir campos de edición
    fieldsContainer.innerHTML = '';
    meta.columns.forEach(col => {
      const formGroup = createFormGroupHTML(col, row[col.key]);
      fieldsContainer.appendChild(formGroup);
    });

  } catch (err) {
    fieldsContainer.innerHTML = `
      <div class="alert error">
        Error al cargar el registro: ${escapeHTML(err.message)}
      </div>
    `;
  }
}

// Generador de inputs del formulario
function createFormGroupHTML(col, value = '') {
  const group = document.createElement('div');
  group.className = 'form-group';

  const label = document.createElement('label');
  label.setAttribute('for', `field-${col.key}`);
  label.textContent = col.label + (col.required ? ' *' : '');
  group.appendChild(label);

  const isRequired = col.required ? 'required' : '';

  if (col.type === 'select' && col.relation) {
    const select = document.createElement('select');
    select.id = `field-${col.key}`;
    select.name = col.key;
    if (col.required) select.required = true;

    // Opción vacía para campos no obligatorios
    if (!col.required) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = '-- Seleccionar (Opcional) --';
      select.appendChild(opt);
    }

    cachedRelations[col.relation].forEach(r => {
      const opt = document.createElement('option');
      opt.value = r.id;
      opt.textContent = `${r.name} (ID: ${r.id})`;
      if (r.id === value) opt.selected = true;
      select.appendChild(opt);
    });
    group.appendChild(select);

  } else if (col.type === 'textarea') {
    const textarea = document.createElement('textarea');
    textarea.id = `field-${col.key}`;
    textarea.name = col.key;
    textarea.value = value;
    textarea.rows = 3;
    if (col.required) textarea.required = true;
    group.appendChild(textarea);

  } else {
    const input = document.createElement('input');
    input.id = `field-${col.key}`;
    input.name = col.key;
    input.type = col.type || 'text';
    input.value = value;
    if (col.required) input.required = true;
    group.appendChild(input);
  }

  return group;
}

// Controladores de envío
async function handleAddSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const errorEl = document.getElementById('add-error');
  errorEl.classList.add('hidden');

  const formData = new FormData(form);
  const payload = {};
  formData.forEach((val, key) => {
    payload[key] = val.trim() === '' ? null : val;
  });

  try {
    const response = await fetch(`/api/adminvotos/tables/${activeTable}`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Error al guardar el registro.');

    closeModal('add-modal');
    await loadAllBadgeCounts();
    await loadTableData();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove('hidden');
  }
}

async function handleEditSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const id = document.getElementById('edit-id-hidden').value;
  const errorEl = document.getElementById('edit-error');
  errorEl.classList.add('hidden');

  const formData = new FormData(form);
  const payload = {};
  formData.forEach((val, key) => {
    payload[key] = val.trim() === '' ? null : val;
  });

  try {
    const response = await fetch(`/api/adminvotos/tables/${activeTable}/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Error al guardar los cambios.');

    closeModal('edit-modal');
    await loadAllBadgeCounts();
    await loadTableData();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove('hidden');
  }
}

// Controlador de eliminación
async function deleteRecord(id, label) {
  const confirmMsg = `¿Estás seguro de que deseas eliminar "${label}" (ID: ${id})? 
Esta operación no se puede deshacer y podría eliminar en cascada registros asociados en otras tablas.`;
  
  if (!confirm(confirmMsg)) return;

  try {
    const response = await fetch(`/api/adminvotos/tables/${activeTable}/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Error al borrar el registro.');

    await loadAllBadgeCounts();
    await loadTableData();
  } catch (err) {
    alert(`Error al eliminar registro: ${err.message}`);
  }
}

// Funciones de Modal
function openModal(id) {
  const modal = document.getElementById(id);
  modal.style.display = 'flex';
  setTimeout(() => modal.classList.add('open'), 10);
}

function closeModal(id) {
  const modal = document.getElementById(id);
  modal.classList.remove('open');
  setTimeout(() => modal.style.display = 'none', 300);
}

function escapeHTML(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
