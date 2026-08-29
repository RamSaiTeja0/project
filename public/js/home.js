/**
 * TecSubtitution — Home Page Client Logic
 * Handles session detection, auth modal actions, and seamless dashboard routing.
 */

document.addEventListener('DOMContentLoaded', () => {
  checkUserSession();
  setupMobileMenu();
});

// Check if user already has an active session
async function checkUserSession() {
  const navLoginBtn = document.getElementById('navLoginBtn');
  try {
    const res = await fetch('/api/auth/me');
    if (res.ok) {
      const user = await res.json();
      if (user && user.id) {
        if (navLoginBtn) {
          navLoginBtn.innerHTML = `<span>Open Dashboard →</span>`;
          navLoginBtn.onclick = () => {
            window.location.href = '/dashboard';
          };
        }
      }
    }
  } catch (e) {
    // Unauthenticated or network error - defaults to Login button
  }
}

// Open Login Modal
window.openLoginModal = function(tab = 'signin') {
  const modal = document.getElementById('homeAuthModal');
  if (modal) {
    modal.style.display = 'flex';
    switchHomeAuthTab(tab);
    // Focus first input
    setTimeout(() => {
      if (tab === 'signin') {
        const idInput = document.getElementById('homeLoginFacultyId');
        if (idInput) idInput.focus();
      } else {
        const nameInput = document.getElementById('homeRegFullName');
        if (nameInput) nameInput.focus();
      }
    }, 100);
  }
};

// Close Login Modal
window.closeLoginModal = function() {
  const modal = document.getElementById('homeAuthModal');
  if (modal) {
    modal.style.display = 'none';
  }
};

// Close on backdrop click
document.addEventListener('click', (e) => {
  const modal = document.getElementById('homeAuthModal');
  if (modal && e.target === modal) {
    closeLoginModal();
  }
});

// Close on Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeLoginModal();
  }
});

// Switch Tabs between Sign In and Sign Up
window.switchHomeAuthTab = function(mode) {
  const signInContainer = document.getElementById('homeAuthSignInContainer');
  const signUpContainer = document.getElementById('homeAuthSignUpContainer');
  const tabSignIn = document.getElementById('homeTabSignIn');
  const tabSignUp = document.getElementById('homeTabSignUp');
  const loginErr = document.getElementById('homeLoginError');
  const regErr = document.getElementById('homeRegError');

  if (loginErr) loginErr.innerText = '';
  if (regErr) regErr.innerText = '';

  if (mode === 'signup') {
    if (signInContainer) signInContainer.style.display = 'none';
    if (signUpContainer) signUpContainer.style.display = 'block';
    if (tabSignUp) tabSignUp.classList.add('active');
    if (tabSignIn) tabSignIn.classList.remove('active');
  } else {
    if (signUpContainer) signUpContainer.style.display = 'none';
    if (signInContainer) signInContainer.style.display = 'block';
    if (tabSignIn) tabSignIn.classList.add('active');
    if (tabSignUp) tabSignUp.classList.remove('active');
  }
};

// Handle Sign In Submit
window.handleHomeLogin = async function(event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }

  const idInput = document.getElementById('homeLoginFacultyId');
  const passInput = document.getElementById('homeLoginPassword');
  const errDiv = document.getElementById('homeLoginError');
  const submitBtn = document.getElementById('homeLoginSubmitBtn');

  if (errDiv) errDiv.innerText = '';

  const faculty_id = (idInput ? idInput.value : '').trim().toUpperCase();
  const password = (passInput ? passInput.value : '').trim();

  if (!faculty_id || !password) {
    if (errDiv) errDiv.innerText = 'Please enter both Faculty ID and Password.';
    return;
  }

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerText = 'Signing In...';
  }

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ faculty_id, password })
    });

    const data = await res.json();
    if (res.ok && data && data.user) {
      localStorage.setItem('scheduler_current_user', JSON.stringify(data.user));
      window.location.href = '/dashboard';
    } else {
      if (errDiv) {
        errDiv.innerText = (data && data.error) ? data.error : 'Invalid credentials. Please check your ID/password.';
      }
    }
  } catch (err) {
    if (errDiv) errDiv.innerText = 'Connection error: ' + err.message;
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerText = 'Sign In to Portal →';
    }
  }
};

// Handle Sign Up Submit
window.handleHomeRegister = async function(event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }

  const nameInput = document.getElementById('homeRegFullName');
  const idInput = document.getElementById('homeRegFacultyId');
  const roleInput = document.getElementById('homeRegRole');
  const deptInput = document.getElementById('homeRegDepartment');
  const emailInput = document.getElementById('homeRegEmail');
  const phoneInput = document.getElementById('homeRegPhone');
  const passInput = document.getElementById('homeRegPassword');
  const errDiv = document.getElementById('homeRegError');
  const submitBtn = document.getElementById('homeRegSubmitBtn');

  if (errDiv) errDiv.innerText = '';

  const full_name = (nameInput ? nameInput.value : '').trim();
  const faculty_id = (idInput ? idInput.value : '').trim().toUpperCase();
  const role = (roleInput ? roleInput.value : 'faculty').trim();
  const department = (deptInput ? deptInput.value : 'DCME').trim();
  const email = (emailInput ? emailInput.value : '').trim();
  const phone = (phoneInput ? phoneInput.value : '').trim();
  const password = (passInput ? passInput.value : '').trim();

  if (!full_name || !faculty_id || !password) {
    if (errDiv) errDiv.innerText = 'Please provide Full Name, Faculty ID, and Password.';
    return;
  }

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerText = 'Creating Account...';
  }

  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ faculty_id, full_name, role, department, email, phone, password })
    });

    const data = await res.json();
    if (res.ok && data && data.user) {
      localStorage.setItem('scheduler_current_user', JSON.stringify(data.user));
      window.location.href = '/dashboard';
    } else {
      if (errDiv) {
        errDiv.innerText = (data && data.error) ? data.error : 'Registration failed: Duplicate ID or Name.';
      }
    }
  } catch (err) {
    if (errDiv) errDiv.innerText = 'Registration error: ' + err.message;
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerText = '✨ Create Account & Sign In';
    }
  }
};

// Setup mobile nav toggling
function setupMobileMenu() {
  const btn = document.getElementById('mobileMenuBtn');
  const navLinks = document.getElementById('navLinks');
  if (btn && navLinks) {
    btn.addEventListener('click', () => {
      const isVisible = navLinks.style.display === 'flex';
      navLinks.style.display = isVisible ? 'none' : 'flex';
      if (!isVisible) {
        navLinks.style.flexDirection = 'column';
        navLinks.style.position = 'absolute';
        navLinks.style.top = '72px';
        navLinks.style.left = '0';
        navLinks.style.width = '100%';
        navLinks.style.background = '#ffffff';
        navLinks.style.padding = '20px';
        navLinks.style.boxShadow = '0 10px 20px rgba(0,0,0,0.1)';
      }
    });
  }
}
