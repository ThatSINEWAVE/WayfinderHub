// Theme management
function initTheme() {
  const themeToggle = document.getElementById('theme-toggle');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

  // Check localStorage or system preference
  let currentTheme = localStorage.getItem('theme') ||
                    (prefersDark ? 'dark' : 'light');

  // Apply theme
  document.documentElement.classList.toggle('dark', currentTheme === 'dark');

  // Set up toggle button
  themeToggle.addEventListener('click', () => {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    updateMapTheme(isDark);
  });
}

// Update map theme
function updateMapTheme(isDark) {
  const mapElement = document.getElementById('map');
  if (isDark) {
    mapElement.style.backgroundColor = '#0f172a';
  } else {
    mapElement.style.backgroundColor = '#f8fafc';
  }
}

export { initTheme, updateMapTheme };