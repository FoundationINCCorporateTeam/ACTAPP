/**
 * ACT AI Tutor - Main Application JavaScript
 */

// API helper functions
const API = {
    async request(url, options = {}) {
        const config = {
            headers: {
                'Content-Type': 'application/json',
            },
            credentials: 'include',
            ...options
        };

        try {
            const response = await fetch(url, config);
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.message || 'Request failed');
            }
            
            return data;
        } catch (error) {
            console.error('API Error:', error);
            throw error;
        }
    },

    get(url) {
        return this.request(url);
    },

    post(url, body) {
        return this.request(url, {
            method: 'POST',
            body: JSON.stringify(body)
        });
    },

    put(url, body) {
        return this.request(url, {
            method: 'PUT',
            body: JSON.stringify(body)
        });
    },

    delete(url) {
        return this.request(url, {
            method: 'DELETE'
        });
    }
};

// Authentication helpers
const Auth = {
    user: null,

    async check() {
        try {
            const response = await API.get('/api/auth/me');
            this.user = response.data.user;
            return this.user;
        } catch (error) {
            this.user = null;
            return null;
        }
    },

    async login(email, password, remember = false) {
        const response = await API.post('/api/auth/login', { email, password, remember });
        this.user = response.data.user;
        return this.user;
    },

    async register(data) {
        const response = await API.post('/api/auth/register', data);
        this.user = response.data.user;
        return this.user;
    },

    async logout() {
        await API.post('/api/auth/logout');
        this.user = null;
        window.location.href = '/';
    },

    isLoggedIn() {
        return this.user !== null;
    },

    requireAuth() {
        if (!this.isLoggedIn()) {
            window.location.href = '/login?redirect=' + encodeURIComponent(window.location.pathname);
            return false;
        }
        return true;
    }
};

// Toast notifications
const Toast = {
    container: null,

    init() {
        if (!this.container) {
            this.container = document.createElement('div');
            this.container.className = 'toast-container';
            document.body.appendChild(this.container);
        }
    },

    show(message, type = 'info', duration = 5000) {
        this.init();

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;

        const icons = {
            success: 'fa-check-circle',
            error: 'fa-exclamation-circle',
            warning: 'fa-exclamation-triangle',
            info: 'fa-info-circle'
        };

        toast.innerHTML = `
            <i class="fas ${icons[type]} text-${type === 'error' ? 'danger' : type === 'warning' ? 'warning' : type === 'success' ? 'success' : 'primary'}"></i>
            <span>${message}</span>
            <button class="ml-4 text-gray-400 hover:text-gray-600" onclick="this.parentElement.remove()">
                <i class="fas fa-times"></i>
            </button>
        `;

        this.container.appendChild(toast);

        if (duration > 0) {
            setTimeout(() => {
                toast.style.animation = 'fadeIn 0.3s ease-out reverse';
                setTimeout(() => toast.remove(), 300);
            }, duration);
        }

        return toast;
    },

    success(message) { return this.show(message, 'success'); },
    error(message) { return this.show(message, 'error'); },
    warning(message) { return this.show(message, 'warning'); },
    info(message) { return this.show(message, 'info'); }
};

// Modal helper
const Modal = {
    show(options) {
        const { title, content, onConfirm, onCancel, confirmText = 'Confirm', cancelText = 'Cancel', showCancel = true } = options;

        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3 class="text-lg font-semibold">${title}</h3>
                    <button class="modal-close text-gray-400 hover:text-gray-600">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    ${typeof content === 'string' ? content : ''}
                </div>
                <div class="modal-footer">
                    ${showCancel ? `<button class="btn btn-outline modal-cancel">${cancelText}</button>` : ''}
                    <button class="btn btn-primary modal-confirm">${confirmText}</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        // If content is an element, append it
        if (typeof content !== 'string') {
            overlay.querySelector('.modal-body').appendChild(content);
        }

        // Event handlers
        const close = () => {
            overlay.style.animation = 'fadeIn 0.2s ease-out reverse';
            setTimeout(() => overlay.remove(), 200);
        };

        overlay.querySelector('.modal-close').addEventListener('click', () => {
            if (onCancel) onCancel();
            close();
        });

        overlay.querySelector('.modal-cancel')?.addEventListener('click', () => {
            if (onCancel) onCancel();
            close();
        });

        overlay.querySelector('.modal-confirm').addEventListener('click', () => {
            if (onConfirm) {
                const result = onConfirm();
                if (result !== false) close();
            } else {
                close();
            }
        });

        // Close on backdrop click
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                if (onCancel) onCancel();
                close();
            }
        });

        // Close on ESC
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                if (onCancel) onCancel();
                close();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);

        return { close, overlay };
    },

    confirm(message, onConfirm) {
        return this.show({
            title: 'Confirm',
            content: `<p>${message}</p>`,
            onConfirm,
            confirmText: 'Yes',
            cancelText: 'No'
        });
    },

    alert(title, message) {
        return this.show({
            title,
            content: `<p>${message}</p>`,
            showCancel: false,
            confirmText: 'OK'
        });
    }
};

// Loading state helper
const Loading = {
    show(element, text = 'Loading...') {
        if (typeof element === 'string') {
            element = document.querySelector(element);
        }
        if (!element) return;

        element.dataset.originalContent = element.innerHTML;
        element.innerHTML = `
            <div class="flex items-center justify-center py-8">
                <div class="spinner"></div>
                <span class="ml-3 text-gray-600">${text}</span>
            </div>
        `;
    },

    hide(element) {
        if (typeof element === 'string') {
            element = document.querySelector(element);
        }
        if (!element || !element.dataset.originalContent) return;

        element.innerHTML = element.dataset.originalContent;
        delete element.dataset.originalContent;
    },

    button(button, loading = true, text = '') {
        if (typeof button === 'string') {
            button = document.querySelector(button);
        }
        if (!button) return;

        if (loading) {
            button.disabled = true;
            button.dataset.originalText = button.innerHTML;
            button.innerHTML = `<div class="spinner spinner-sm"></div> ${text || 'Loading...'}`;
        } else {
            button.disabled = false;
            if (button.dataset.originalText) {
                button.innerHTML = button.dataset.originalText;
                delete button.dataset.originalText;
            }
        }
    }
};

// Form helper
const Form = {
    getData(form) {
        if (typeof form === 'string') {
            form = document.querySelector(form);
        }
        const formData = new FormData(form);
        const data = {};
        for (const [key, value] of formData.entries()) {
            if (data[key]) {
                if (!Array.isArray(data[key])) {
                    data[key] = [data[key]];
                }
                data[key].push(value);
            } else {
                data[key] = value;
            }
        }
        return data;
    },

    setErrors(form, errors) {
        if (typeof form === 'string') {
            form = document.querySelector(form);
        }
        
        // Clear existing errors
        form.querySelectorAll('.form-error').forEach(el => el.remove());
        form.querySelectorAll('.form-input.error').forEach(el => el.classList.remove('error'));

        // Set new errors
        if (Array.isArray(errors)) {
            errors.forEach(error => {
                const errorDiv = document.createElement('div');
                errorDiv.className = 'form-error';
                errorDiv.textContent = error;
                form.appendChild(errorDiv);
            });
        } else if (typeof errors === 'object') {
            Object.entries(errors).forEach(([field, message]) => {
                const input = form.querySelector(`[name="${field}"]`);
                if (input) {
                    input.classList.add('error');
                    const errorDiv = document.createElement('div');
                    errorDiv.className = 'form-error';
                    errorDiv.textContent = message;
                    input.parentElement.appendChild(errorDiv);
                }
            });
        }
    },

    clearErrors(form) {
        if (typeof form === 'string') {
            form = document.querySelector(form);
        }
        form.querySelectorAll('.form-error').forEach(el => el.remove());
        form.querySelectorAll('.form-input.error').forEach(el => el.classList.remove('error'));
    }
};

// Storage helper (localStorage wrapper)
const Storage = {
    get(key, defaultValue = null) {
        try {
            const item = localStorage.getItem(key);
            return item ? JSON.parse(item) : defaultValue;
        } catch {
            return defaultValue;
        }
    },

    set(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (e) {
            console.error('Storage error:', e);
        }
    },

    remove(key) {
        localStorage.removeItem(key);
    },

    clear() {
        localStorage.clear();
    }
};

// Format helpers
const Format = {
    date(dateString, options = {}) {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            ...options
        });
    },

    time(dateString) {
        const date = new Date(dateString);
        return date.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit'
        });
    },

    relative(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diff = now - date;
        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (seconds < 60) return 'Just now';
        if (minutes < 60) return `${minutes}m ago`;
        if (hours < 24) return `${hours}h ago`;
        if (days < 7) return `${days}d ago`;
        return this.date(dateString);
    },

    duration(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    },

    percentage(value, decimals = 0) {
        return `${value.toFixed(decimals)}%`;
    },

    truncate(str, length = 100) {
        if (str.length <= length) return str;
        return str.slice(0, length) + '...';
    }
};

// Debounce helper
function debounce(func, wait = 300) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Throttle helper
function throttle(func, limit = 100) {
    let inThrottle;
    return function executedFunction(...args) {
        if (!inThrottle) {
            func(...args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

// Initialize navigation for authenticated pages
async function initNavigation() {
    const user = await Auth.check();
    
    if (user) {
        // User is logged in, update UI accordingly
        updateUserUI(user);
    }
}

function updateUserUI(user) {
    // Update avatar
    const avatarElements = document.querySelectorAll('.user-avatar');
    avatarElements.forEach(el => {
        if (user.avatar) {
            el.innerHTML = `<img src="${user.avatar}" alt="${user.name}" class="w-full h-full rounded-full object-cover">`;
        } else {
            el.innerHTML = `<span class="text-sm font-medium">${user.name.charAt(0).toUpperCase()}</span>`;
        }
    });

    // Update name
    const nameElements = document.querySelectorAll('.user-name');
    nameElements.forEach(el => {
        el.textContent = user.name;
    });

    // Update stats
    const xpElements = document.querySelectorAll('.user-xp');
    xpElements.forEach(el => {
        el.textContent = user.stats?.xp || 0;
    });

    const levelElements = document.querySelectorAll('.user-level');
    levelElements.forEach(el => {
        el.textContent = user.stats?.level || 1;
    });

    const streakElements = document.querySelectorAll('.user-streak');
    streakElements.forEach(el => {
        el.textContent = user.stats?.streak || 0;
    });
}

// Initialize sidebar toggle
function initSidebar() {
    const toggleBtn = document.getElementById('sidebar-toggle');
    const sidebar = document.getElementById('sidebar');
    const mainContent = document.querySelector('.main-content');

    if (toggleBtn && sidebar) {
        toggleBtn.addEventListener('click', () => {
            sidebar.classList.toggle('sidebar-collapsed');
            sidebar.classList.toggle('open');
            mainContent?.classList.toggle('full-width');
        });
    }

    // Set active link
    const currentPath = window.location.pathname;
    document.querySelectorAll('.sidebar-link').forEach(link => {
        if (link.getAttribute('href') === currentPath) {
            link.classList.add('active');
        }
    });
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    initSidebar();
});

// Export for use in other modules
window.ACT = {
    API,
    Auth,
    Toast,
    Modal,
    Loading,
    Form,
    Storage,
    Format,
    debounce,
    throttle,
    initNavigation,
    updateUserUI
};
