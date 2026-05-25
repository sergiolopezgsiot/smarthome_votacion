let currentUser = null;
let openComments = new Set(); // Para persistir qué acordeones de comentarios están abiertos al recargar

document.addEventListener('DOMContentLoaded', () => {
  // Redirección de seguridad si no está autenticado
  const savedUser = localStorage.getItem('currentUser');

  if (!savedUser) {
    window.location.href = '/login';
    return;
  }

  currentUser = JSON.parse(savedUser);
  updateUserUI();
  
  // Cargar datos iniciales del dashboard
  loadDashboard();

  // Configurar event listeners de la página
  setupEventListeners();
});

function getAuthHeaders() {
  return {
    'Content-Type': 'application/json',
    'X-User-Id': currentUser ? currentUser.id : '',
    'X-User-Name': currentUser ? currentUser.name : ''
  };
}

function updateUserUI() {
  if (!currentUser) return;
  document.getElementById('display-username').textContent = currentUser.name;
  document.getElementById('avatar-char').textContent = currentUser.name.charAt(0).toUpperCase();
}

function setupEventListeners() {
  // 1. Alternar Menú Hamburguesa en el Dashboard
  const menuToggleBtn = document.getElementById('menu-toggle-btn');
  const hamburgerDropdown = document.getElementById('hamburger-dropdown');

  menuToggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    menuToggleBtn.classList.toggle('open');
    hamburgerDropdown.classList.toggle('open');
  });

  // Cerrar menú al hacer clic fuera del mismo
  document.addEventListener('click', (e) => {
    if (!hamburgerDropdown.contains(e.target) && e.target !== menuToggleBtn && !menuToggleBtn.contains(e.target)) {
      menuToggleBtn.classList.remove('open');
      hamburgerDropdown.classList.remove('open');
    }
  });

  // 2. Alternar entre Paneles/Vistas en el Dashboard
  const dropdownItems = document.querySelectorAll('.dropdown-item');
  dropdownItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      
      const target = item.getAttribute('data-target');
      
      // Ocultar todos los paneles del dashboard
      document.querySelectorAll('.dashboard-panel').forEach(panel => {
        panel.classList.remove('active-panel');
      });
      
      // Mostrar el panel solicitado
      const targetPanel = document.getElementById(`panel-${target}`);
      if (targetPanel) {
        targetPanel.classList.add('active-panel');
      }

      // Marcar opción activa en el menú
      dropdownItems.forEach(i => i.classList.remove('active'));
      item.classList.add('active');

      // Cerrar menú hamburguesa después de seleccionar la opción
      menuToggleBtn.classList.remove('open');
      hamburgerDropdown.classList.remove('open');
    });
  });

  // 3. Formulario de propuesta
  const proposalForm = document.getElementById('proposal-form');
  proposalForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('proposal-name').value;
    const description = document.getElementById('proposal-desc').value;
    const proposalError = document.getElementById('proposal-error');

    proposalError.classList.add('hidden');

    try {
      const response = await fetch('/api/options', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ name, description })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Error al proponer opción.');
      }

      proposalForm.reset();
      await loadDashboard();

      // Opcional: Después de proponer con éxito, redirigir al panel de votación para verla
      const votarTab = Array.from(dropdownItems).find(i => i.getAttribute('data-target') === 'votar');
      if (votarTab) votarTab.click();
    } catch (err) {
      proposalError.textContent = err.message;
      proposalError.classList.remove('hidden');
    }
  });

  // 4. Botón de Cerrar Sesión
  const logoutBtn = document.getElementById('logout-btn');
  logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('currentUser');
    localStorage.removeItem('introSkipped');
    currentUser = null;
    openComments.clear();
    window.location.href = '/login';
  });
}

async function loadDashboard() {
  if (!currentUser) return;

  try {
    const response = await fetch('/api/dashboard', {
      method: 'GET',
      headers: getAuthHeaders()
    });

    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem('currentUser');
        window.location.href = '/login';
        return;
      }
      throw new Error('Error al cargar datos del servidor.');
    }

    const data = await response.json();
    renderDashboard(data);
  } catch (err) {
    console.error('Error cargando el dashboard:', err);
  }
}

function renderDashboard(data) {
  const { options, userVotesCount, hasProposedOption, userProposalsCount } = data;

  const isAdmin = currentUser && currentUser.name.toLowerCase() === 'adminvotacion';

  // Renderizar límites y contadores superiores
  document.getElementById('voted-count').textContent = userVotesCount;
  
  const proposedCountEl = document.getElementById('proposed-count');
  if (isAdmin) {
    proposedCountEl.parentElement.innerHTML = `<strong id="proposed-count">${userProposalsCount || 0}</strong> / ∞`;
  } else {
    proposedCountEl.parentElement.innerHTML = `<strong id="proposed-count">${hasProposedOption ? '1' : '0'}</strong> / 1`;
  }

  const dotsContainer = document.getElementById('vote-dots-container');
  dotsContainer.innerHTML = '';
  for (let i = 0; i < 3; i++) {
    const dot = document.createElement('div');
    dot.className = `dot ${i < userVotesCount ? 'filled' : ''}`;
    dotsContainer.appendChild(dot);
  }

  const badgeContainer = document.getElementById('proposal-status-badge');
  if (isAdmin) {
    badgeContainer.innerHTML = `<span class="badge status-done">Administrador</span>`;
    document.getElementById('proposal-section').classList.remove('hidden');
    document.getElementById('proposal-success-banner').classList.add('hidden');
  } else if (hasProposedOption) {
    badgeContainer.innerHTML = `<span class="badge status-done">Propuesta enviada</span>`;
    document.getElementById('proposal-section').classList.add('hidden');
    document.getElementById('proposal-success-banner').classList.remove('hidden');
  } else {
    badgeContainer.innerHTML = `<span class="badge status-pending">Pendiente</span>`;
    document.getElementById('proposal-section').classList.remove('hidden');
    document.getElementById('proposal-success-banner').classList.add('hidden');
  }

  // Renderizar opciones
  const optionsTotalBadge = document.getElementById('options-total-badge');
  optionsTotalBadge.textContent = `${options.length} ${options.length === 1 ? 'opción' : 'opciones'}`;

  const listContainer = document.getElementById('options-list-container');
  listContainer.innerHTML = '';

  if (options.length === 0) {
    listContainer.innerHTML = `
      <div class="empty-chart" style="padding: 40px; background: #fff; border: 1.5px solid var(--border-color); border-radius: var(--radius-lg);">
        <p>No hay candidatos registrados en la encuesta actualmente. ¡Sé el primero en proponer!</p>
      </div>
    `;
  } else {
    options.forEach(opt => {
      const card = createOptionCard(opt, userVotesCount);
      listContainer.appendChild(card);
    });
  }

  // Renderizar gráfica
  renderResultsChart(options);
}

function createOptionCard(opt, userVotesCount) {
  const card = document.createElement('div');
  card.className = 'option-card';
  card.dataset.id = opt.id;

  const isVoted = opt.user_voted === 1;
  const isVoteDisabled = !isVoted && userVotesCount >= 3;
  const commentsCount = opt.comments ? opt.comments.length : 0;
  const isCommentsOpen = openComments.has(opt.id);

  const creatorLabel = opt.created_by_user_id 
    ? `Añadido por <strong>${escapeHTML(opt.creator_name)}</strong>` 
    : `Sugerencia <strong>Original</strong>`;

  const isAdmin = currentUser && currentUser.name.toLowerCase() === 'adminvotacion';
  const deleteButtonHTML = isAdmin 
    ? `
        <button class="btn-delete" title="Eliminar opción" onclick="deleteOption(${opt.id}, '${escapeHTML(opt.name)}')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
        </button>
      `
    : '';

  card.innerHTML = `
    <div class="option-header">
      <div class="option-title-group">
        <h3>${escapeHTML(opt.name)}</h3>
        <span class="creator-tag">${creatorLabel}</span>
      </div>
      
      <div class="option-actions">
        <div class="vote-badge" title="Votos recibidos">
          <svg class="vote-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          <span class="vote-badge-count">${opt.vote_count}</span>
        </div>
        
        <button class="btn-vote ${isVoted ? 'voted' : ''}" 
                ${isVoteDisabled ? 'disabled' : ''} 
                onclick="toggleVote(${opt.id}, ${isVoted})">
          ${isVoted 
            ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Votado` 
            : 'Votar'
          }
        </button>
        ${deleteButtonHTML}
      </div>
    </div>
    
    <p class="option-desc">${opt.description ? escapeHTML(opt.description) : 'Sin justificación provista.'}</p>
    
    <div class="comments-container">
      <button class="comments-toggle ${isCommentsOpen ? 'open' : ''}" onclick="toggleCommentsAccordion(${opt.id})">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
        <span>Comentarios (${commentsCount})</span>
      </button>
      
      <div class="comments-content ${isCommentsOpen ? 'open' : ''}" id="comments-content-${opt.id}">
        <div class="comments-list" id="comments-list-${opt.id}">
          ${renderCommentsList(opt.comments)}
        </div>
        
        <form class="comment-form" onsubmit="submitComment(event, ${opt.id})">
          <input type="text" placeholder="Añade tu comentario o feedback sobre este nombre..." required autocomplete="off" maxlength="150">
          <button type="submit" class="btn-comment-submit" title="Comentar">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          </button>
        </form>
      </div>
    </div>
  `;

  return card;
}

function renderCommentsList(comments) {
  if (!comments || comments.length === 0) {
    return `<div class="empty-comments">No hay comentarios sobre esta opción. ¡Abre el debate!</div>`;
  }

  return comments.map(c => `
    <div class="comment-item">
      <div class="comment-meta">
        <span class="comment-user">${escapeHTML(c.user_name)}</span>
        <span class="comment-date">${formatRelativeTime(c.created_at)}</span>
      </div>
      <p class="comment-text">${escapeHTML(c.comment_text)}</p>
    </div>
  `).join('');
}

async function toggleVote(optionId, isVoted) {
  const method = isVoted ? 'DELETE' : 'POST';
  
  try {
    const response = await fetch('/api/votes', {
      method: method,
      headers: getAuthHeaders(),
      body: JSON.stringify({ optionId })
    });

    const data = await response.json();

    if (!response.ok) {
      alert(data.error || 'Error al procesar el voto.');
      return;
    }

    await loadDashboard();
  } catch (err) {
    console.error('Error al votar:', err);
  }
}

function toggleCommentsAccordion(optionId) {
  const content = document.getElementById(`comments-content-${optionId}`);
  const toggleBtn = content.previousElementSibling;

  if (openComments.has(optionId)) {
    openComments.delete(optionId);
    content.classList.remove('open');
    toggleBtn.classList.remove('open');
  } else {
    openComments.add(optionId);
    content.classList.add('open');
    toggleBtn.classList.add('open');
  }
}

async function submitComment(event, optionId) {
  event.preventDefault();
  const form = event.target;
  const input = form.querySelector('input');
  const commentText = input.value;

  if (!commentText.trim()) return;

  try {
    const response = await fetch('/api/comments', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ optionId, commentText })
    });

    const data = await response.json();

    if (!response.ok) {
      alert(data.error || 'Error al publicar comentario.');
      return;
    }

    input.value = '';
    await loadDashboard();
  } catch (err) {
    console.error('Error al comentar:', err);
  }
}

function renderResultsChart(options) {
  const chartContainer = document.getElementById('chart-bars-container');
  chartContainer.innerHTML = '';

  if (options.length === 0) {
    chartContainer.innerHTML = `
      <div class="empty-chart">
        <p>No hay propuestas de nombres para mostrar resultados.</p>
      </div>
    `;
    return;
  }

  const totalVotesCast = options.reduce((sum, opt) => sum + opt.vote_count, 0);
  const maxVoteCount = Math.max(...options.map(o => o.vote_count), 0);

  options.forEach(opt => {
    const barWidth = maxVoteCount > 0 ? (opt.vote_count / maxVoteCount) * 100 : 0;
    const isWinner = opt.vote_count > 0 && opt.vote_count === maxVoteCount;

    const barItem = document.createElement('div');
    barItem.className = `chart-bar-item ${isWinner ? 'winner' : ''}`;

    barItem.innerHTML = `
      <div class="bar-info">
        <span class="bar-name">${escapeHTML(opt.name)}</span>
        <span class="bar-votes-count">
          <strong>${opt.vote_count}</strong> ${opt.vote_count === 1 ? 'voto' : 'votos'}
        </span>
      </div>
      <div class="bar-wrapper" title="${opt.vote_count} votos en total">
        <div class="bar-fill" style="width: ${barWidth}%"></div>
      </div>
    `;

    chartContainer.appendChild(barItem);
  });
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

function formatRelativeTime(dateString) {
  if (!dateString) return '';
  const utcDateStr = dateString.endsWith('Z') ? dateString : dateString.replace(' ', 'T') + 'Z';
  const date = new Date(utcDateStr);
  const now = new Date();
  
  const diffMs = now - date;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) {
    return 'hace unos instantes';
  } else if (diffMin < 60) {
    return `hace ${diffMin} min`;
  } else if (diffHour < 24) {
    return `hace ${diffHour} ${diffHour === 1 ? 'hora' : 'horas'}`;
  } else if (diffDay < 7) {
    return `hace ${diffDay} ${diffDay === 1 ? 'día' : 'días'}`;
  } else {
    return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  }
}

async function deleteOption(optionId, optionName) {
  if (!confirm(`¿Estás seguro de que deseas eliminar la propuesta "${optionName}"? Esta acción borrará de forma permanente todos sus votos y comentarios.`)) {
    return;
  }

  try {
    const response = await fetch(`/api/options/${optionId}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });

    const data = await response.json();

    if (!response.ok) {
      alert(data.error || 'Error al eliminar la opción.');
      return;
    }

    await loadDashboard();
  } catch (err) {
    console.error('Error al eliminar opción:', err);
  }
}

