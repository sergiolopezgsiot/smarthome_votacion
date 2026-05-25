document.addEventListener('DOMContentLoaded', () => {
  // Redirección de seguridad si no está autenticado
  const savedUser = localStorage.getItem('currentUser');
  const introSkipped = localStorage.getItem('introSkipped');

  if (!savedUser) {
    window.location.href = '/login';
    return;
  }

  if (introSkipped === 'true') {
    window.location.href = '/votacion';
    return;
  }

  // Configurar botones de introducción
  const startVotingBtn = document.getElementById('start-voting-btn');
  const skipIntroBtn = document.getElementById('skip-intro-btn');

  const enterDashboard = () => {
    localStorage.setItem('introSkipped', 'true');
    window.location.href = '/votacion';
  };

  startVotingBtn.addEventListener('click', enterDashboard);
  skipIntroBtn.addEventListener('click', enterDashboard);
});
