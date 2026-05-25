document.addEventListener('DOMContentLoaded', () => {
  // Redirección si ya está autenticado
  const savedUser = localStorage.getItem('currentUser');
  const introSkipped = localStorage.getItem('introSkipped');

  if (savedUser) {
    if (introSkipped === 'true') {
      window.location.href = '/votacion';
    } else {
      window.location.href = '/intro';
    }
    return;
  }

  // Formulario de acceso
  const loginForm = document.getElementById('login-form');
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('login-name').value;
    const email = document.getElementById('login-email').value;
    const accessCode = document.getElementById('access-code').value;
    const loginError = document.getElementById('login-error');
    const loginErrorText = document.getElementById('login-error-text');

    loginError.classList.add('hidden');

    try {
      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, accessCode })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Error al iniciar sesión.');
      }

      // Guardar usuario en LocalStorage
      localStorage.setItem('currentUser', JSON.stringify(data.user));
      
      // Redirigir a pantalla de introducción
      window.location.href = '/intro';
    } catch (err) {
      loginErrorText.textContent = err.message;
      loginError.classList.remove('hidden');
    }
  });
});
