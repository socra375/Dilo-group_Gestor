// Pantalla de inicio de sesión (solo con Supabase). La cuenta del supervisor la crea el administrador en el panel
// de Supabase; esta pantalla no permite registrarse. Devuelve una promesa que se cumple al entrar.
import * as store from '../data/store.js';
import { CONFIG } from '../config.js';
import { esc, icon } from './ui.js';

export function pedirInicioSesion() {
  return new Promise((resolver) => {
    document.body.classList.add('sin-sesion');
    document.getElementById('header-title').textContent = 'Entrar';
    document.getElementById('header-company').textContent = CONFIG.empresa.nombre;
    document.getElementById('view').innerHTML = `
      <form class="login card" novalidate aria-labelledby="t-login">
        <h2 id="t-login">Entrar a ${esc(CONFIG.empresa.nombre)}</h2>
        <p class="muted">Usa el correo y la contraseña que te dio el administrador.</p>
        <div class="field" data-campo="email"><label class="field__label" for="f-email">Correo</label>
          <input class="input" id="f-email" name="email" type="email" inputmode="email" autocomplete="username" autocapitalize="none" spellcheck="false" aria-describedby="f-email-err">
          <p class="field__error" id="f-email-err" aria-live="polite"></p></div>
        <div class="field" data-campo="password"><label class="field__label" for="f-password">Contraseña</label>
          <input class="input" id="f-password" name="password" type="password" autocomplete="current-password" aria-describedby="f-password-err">
          <p class="field__error" id="f-password-err" aria-live="polite"></p></div>
        <p class="field__error" id="login-err" role="alert"></p>
        <button type="submit" class="btn btn--primary btn--block">${icon('login')}Entrar</button>
      </form>`;
    const form = document.querySelector('.login');
    const poner = (id, msg) => {
      document.getElementById(id).textContent = msg;
      const campo = document.getElementById(id.replace('-err', ''));
      if (campo?.tagName === 'INPUT') msg ? campo.setAttribute('aria-invalid', 'true') : campo.removeAttribute('aria-invalid');
    };
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = form.elements.email.value.trim();
      const password = form.elements.password.value;
      poner('f-email-err', /^\S+@\S+\.\S+$/.test(email) ? '' : 'Escribe un correo válido.');
      poner('f-password-err', password ? '' : 'Escribe tu contraseña.');
      poner('login-err', '');
      if (!/^\S+@\S+\.\S+$/.test(email) || !password) return form.querySelector('[aria-invalid="true"]')?.focus();
      const boton = form.querySelector('button[type="submit"]');
      boton.disabled = true;
      try {
        await store.entrar(email, password);
        document.body.classList.remove('sin-sesion');
        resolver();
      } catch (err) {
        poner('login-err', err.message || 'No se pudo entrar.');
        form.elements.password.value = '';
        form.elements.password.focus();
      } finally {
        boton.disabled = false;
      }
    });
    form.elements.email.focus();
  });
}
