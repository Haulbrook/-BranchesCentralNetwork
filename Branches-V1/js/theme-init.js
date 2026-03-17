// Force light mode as default — must load FIRST to prevent FOUC
if (!localStorage.getItem('theme')) {
    localStorage.setItem('theme', 'light');
}
