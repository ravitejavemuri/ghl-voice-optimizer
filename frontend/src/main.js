/**
 * Vue app bootstrap — mounts the root App component and loads global styles.
 */
import { createApp } from 'vue';
import App from './App.vue';
import './style.css';

createApp(App).mount('#app');
